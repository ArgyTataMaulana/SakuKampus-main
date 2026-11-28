import express from 'express';
import { supabase, getAllCategories, getCategoriesMap } from '../config/supabase.js';
import { authMiddleware } from '../middlewares/auth.js';
import { parseSentenceWithRules } from '../services/ruleParser.js';
import { parseSentenceWithLLM } from '../services/llmService.js';
import {
  isConsultationQuery,
  getUserFinancialContext,
  getGeminiConsultationResponse
} from '../services/financialAdvisor.js';
import { getActiveProvider } from '../services/aiProvider.js';
import {
  detectWalletFromText,
  encodeRawTextWithWallet,
  encodeRawTextWithTransfer,
  computeWalletBalances,
  validateExpenseAgainstBalances
} from '../services/walletHelper.js';

export const chatRouter = express.Router();

const rawLimit = process.env.DAILY_CHAT_LIMIT;
const isUnlimited = rawLimit === '0' || rawLimit === '-1' || rawLimit === 'unlimited';
const parsedLimit = parseInt(rawLimit || '50', 10);
const DAILY_LIMIT = isUnlimited ? Infinity : parsedLimit;

function getLocalTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatUsagePayload(usedCount) {
  return {
    used: usedCount,
    limit: isUnlimited ? 'Unlimited' : DAILY_LIMIT,
    remaining: isUnlimited ? 'Unlimited' : Math.max(0, DAILY_LIMIT - usedCount)
  };
}

/**
 * Helper to get or create chat usage for today in Supabase
 */
async function getTodayUsage(userId, todayDate) {
  const { data: existing, error } = await supabase
    .from('chat_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('usage_date', todayDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase chat_usage error: ${error.message}`);
  }

  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('chat_usage')
    .upsert(
      { user_id: userId, usage_date: todayDate, request_count: 0, llm_count: 0 },
      { onConflict: 'user_id,usage_date' }
    )
    .select('*')
    .single();

  if (insertError) {
    return { user_id: userId, usage_date: todayDate, request_count: 0, llm_count: 0 };
  }
  return created;
}

/**
 * POST /api/chat
 * Versatile Financial Assistant Endpoint (Supabase-backed)
 */
chatRouter.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { message, source = 'chat' } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
  }

  const cleanMessage = message.trim();
  const todayDate = getLocalTodayStr();

  try {
    // 1. Check Rate Limit / Pembatasan Pemakaian (F-09)
    const usage = await getTodayUsage(userId, todayDate);
    if (usage.request_count >= DAILY_LIMIT) {
      return res.json({
        success: false,
        is_rate_limited: true,
        message: `⚠️ Batas pemakaian harian tercapai (${DAILY_LIMIT}/${DAILY_LIMIT} pesan). Kuota akan direset besok. Anda tetap dapat mengakses dashboard dan riwayat transaksi.`,
        usage: {
          used: usage.request_count,
          limit: DAILY_LIMIT,
          remaining: 0
        }
      });
    }

    const nextRequestCount = (usage.request_count || 0) + 1;
    let nextLlmCount = usage.llm_count || 0;

    await supabase
      .from('chat_usage')
      .upsert(
        {
          user_id: userId,
          usage_date: todayDate,
          request_count: nextRequestCount,
          llm_count: nextLlmCount
        },
        { onConflict: 'user_id,usage_date' }
      );

    // 2. Check if this is a financial query / consultation
    if (isConsultationQuery(cleanMessage)) {
      const context = await getUserFinancialContext(userId);
      const reply = await getGeminiConsultationResponse(cleanMessage, context);

      return res.json({
        success: true,
        is_consultation: true,
        bot_reply: reply,
        usage: formatUsagePayload(nextRequestCount)
      });
    }

    // 3. Otherwise, treat as Transaction Recording (Rule-based first, fallback to LLM)
    let parseResult = parseSentenceWithRules(cleanMessage);
    let parsedBy = 'rule';

    if (!parseResult.success && getActiveProvider() !== 'none') {
      nextLlmCount += 1;
      await supabase
        .from('chat_usage')
        .update({ llm_count: nextLlmCount })
        .eq('user_id', userId)
        .eq('usage_date', todayDate);

      const llmResult = await parseSentenceWithLLM(cleanMessage);
      if (llmResult.success) {
        parseResult = llmResult;
        parsedBy = 'llm';
      }
    }

    // 4. Handle Unrecognized Sentence (F-04)
    if (!parseResult.success) {
      return res.json({
        success: false,
        is_unrecognized: true,
        bot_reply: `Maaf, SakuBot belum memahami kalimat tersebut 🤔.\n\n` +
          `Anda bisa **mencatat transaksi** dengan contoh format:\n` +
          `• "makan siang 15rb"\n` +
          `• "kemarin beli bensin 25.000"\n` +
          `• "gajian 3 juta"\n` +
          `• "dapat uang saku 500rb"\n\n` +
          `Atau **menanyakan kondisi keuangan** Anda, contohnya:\n` +
          `• "Sisa uang saku saya berapa?"\n` +
          `• "Cek adakah tagihan terbaru?"\n` +
          `• "Apakah saya punya catatan utang?"\n` +
          `• "Apa saja jadwal bayar bulan ini?"`,
        usage: formatUsagePayload(nextRequestCount)
      });
    }

    // 5. Look up Category ID from Supabase categories
    const txData = parseResult.data;
    const [allCategories, categoriesById] = await Promise.all([
      getAllCategories(),
      getCategoriesMap()
    ]);

    // 5a. Handle Inter-Wallet Transfer via Chat/Voice (e.g., "tarik tunai 100rb dari bca")
    if (parseResult.is_transfer && txData.from_wallet && txData.to_wallet) {
      if (txData.from_wallet.wallet_type === txData.to_wallet.wallet_type && txData.from_wallet.bank_name === txData.to_wallet.bank_name) {
        return res.json({
          success: false,
          is_insufficient_balance: true,
          bot_reply: '⚠️ Sumber dana asal dan tujuan tidak boleh sama. Pilih dua dompet yang berbeda (misalnya dari BCA ke Cash).',
          usage: formatUsagePayload(nextRequestCount)
        });
      }
      const roundedAmount = Math.round(Number(txData.amount));
      const { data: userTxRows, error: balErr } = await supabase
        .from('transactions')
        .select('id, category_id, amount, description, raw_text')
        .eq('user_id', userId);

      if (balErr) {
        return res.status(503).json({ error: 'Gagal memverifikasi saldo dari database cloud.' });
      }

      const balances = computeWalletBalances(userTxRows || [], categoriesById);
      const check = validateExpenseAgainstBalances({
        amount: roundedAmount,
        wallet_type: txData.from_wallet.wallet_type,
        bank_name: txData.from_wallet.bank_name,
        balances,
        explicitWallet: true
      });

      if (!check.ok) {
        return res.json({
          success: false,
          is_insufficient_balance: true,
          bot_reply: `⚠️ **Pindah Dana Ditolak — Saldo Asal Tidak Mencukupi**\n\n${check.reason}`,
          usage: formatUsagePayload(nextRequestCount)
        });
      }

      const fallbackCat = allCategories.find((c) => c.name === 'Lain-lain pengeluaran') || allCategories[0];
      const txSource = source === 'voice' ? 'voice' : 'chat';
      const rawTextEncoded = encodeRawTextWithTransfer(cleanMessage, txData.from_wallet, txData.to_wallet);

      const { data: insertedTx, error: insertError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          category_id: fallbackCat.id,
          amount: roundedAmount,
          description: txData.description,
          raw_text: rawTextEncoded,
          source: txSource,
          parsed_by: parsedBy,
          occurred_on: txData.occurred_on
        })
        .select('*')
        .single();

      if (insertError) {
        return res.status(503).json({ error: 'Gagal menyimpan pindah dana ke database cloud.' });
      }

      const transferLabel = `${txData.from_wallet.wallet_label} → ${txData.to_wallet.wallet_label}`;
      const formattedNominal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(roundedAmount);

      return res.json({
        success: true,
        bot_reply: `🔄 **Pindah Dana Berhasil!**\n• **Nominal**: ${formattedNominal}\n• **Alur**: ${transferLabel}\n• **Keterangan**: ${txData.description}\n• **Tanggal**: ${txData.occurred_on}\n\n*(Tidak menambah total pengeluaran bulanan)*`,
        transaction: {
          ...insertedTx,
          raw_text: cleanMessage,
          is_transfer: true,
          category_name: 'Pindah Dana',
          category_type: 'transfer',
          wallet_type: 'transfer',
          wallet_label: transferLabel
        },
        usage: formatUsagePayload(nextRequestCount)
      });
    }

    let categoryRow = allCategories.find((c) => c.name === txData.category);
    if (!categoryRow) {
      const defaultCatName = txData.type === 'income' ? 'Lain-lain pemasukan' : 'Lain-lain pengeluaran';
      categoryRow = allCategories.find((c) => c.name === defaultCatName) || allCategories[0];
    }

    const detectedWallet = txData.wallet_type
      ? {
          wallet_type: txData.wallet_type,
          bank_name: txData.bank_name || '',
          wallet_label: txData.wallet_label || (txData.wallet_type === 'bank' ? 'Bank' : 'Cash'),
          explicit: Boolean(txData.wallet_explicit)
        }
      : detectWalletFromText(cleanMessage);

    let resolvedWallet = {
      wallet_type: detectedWallet.wallet_type,
      bank_name: detectedWallet.bank_name,
      wallet_label: detectedWallet.wallet_label
    };

    const roundedAmount = Math.round(Number(txData.amount));

    // 5b. Balance Logic Guard: prevent expense if total/wallet balance is insufficient
    if (categoryRow.type === 'expense') {
      const { data: userTxRows, error: balErr } = await supabase
        .from('transactions')
        .select('id, category_id, amount, description, raw_text')
        .eq('user_id', userId);

      if (balErr) {
        return res.status(503).json({ error: 'Gagal memverifikasi saldo dari database cloud.' });
      }

      const balances = computeWalletBalances(userTxRows || [], categoriesById);
      const check = validateExpenseAgainstBalances({
        amount: roundedAmount,
        wallet_type: detectedWallet.wallet_type,
        bank_name: detectedWallet.bank_name,
        balances,
        explicitWallet: detectedWallet.explicit
      });

      if (!check.ok) {
        return res.json({
          success: false,
          is_insufficient_balance: true,
          bot_reply: `⚠️ **Transaksi Ditolak — Saldo Tidak Mencukupi**\n\n${check.reason}\n\n` +
            `💡 Contoh catat pemasukan terlebih dahulu:\n` +
            `• *"dapat uang saku 500rb cash"*\n` +
            `• *"gajian 2 juta bank bca"*`,
          usage: formatUsagePayload(nextRequestCount)
        });
      }
      resolvedWallet = check.resolvedWallet;
    }

    // 6. Save Transaction to Supabase (strictly per req.user.id)
    const txSource = source === 'voice' ? 'voice' : 'chat';
    const rawTextEncoded = encodeRawTextWithWallet(cleanMessage, resolvedWallet.wallet_type, resolvedWallet.bank_name);

    const { data: insertedTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: categoryRow.id,
        amount: roundedAmount,
        description: txData.description,
        raw_text: rawTextEncoded,
        source: txSource,
        parsed_by: parsedBy,
        occurred_on: txData.occurred_on
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[Chat] Supabase insert transaction error:', insertError.message);
      return res.status(503).json({ error: 'Gagal menyimpan transaksi ke database cloud.' });
    }

    const createdTx = {
      ...insertedTx,
      raw_text: cleanMessage,
      category_name: categoryRow.name,
      category_type: categoryRow.type,
      wallet_type: resolvedWallet.wallet_type,
      bank_name: resolvedWallet.bank_name,
      wallet_label: resolvedWallet.wallet_label
    };

    // 7. Format success confirmation message
    const formattedNominal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(createdTx.amount);
    const typeText = createdTx.category_type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    const parserBadge = parsedBy === 'rule' ? '⚡ Aturan Cepat' : `🤖 AI (${getActiveProvider().toUpperCase()})`;
    const sourceBadge = txSource === 'voice' ? '🎙️ Suara' : '💬 Teks';

    const botReply = `✅ Berhasil mencatat ${typeText.toLowerCase()}!\n` +
      `• **Kategori**: ${createdTx.category_name}\n` +
      `• **Nominal**: ${formattedNominal}\n` +
      `• **Sumber Dana**: ${createdTx.wallet_label}\n` +
      `• **Keterangan**: ${createdTx.description}\n` +
      `• **Tanggal**: ${createdTx.occurred_on}\n` +
      `• *(${parserBadge} via ${sourceBadge})*`;

    return res.json({
      success: true,
      bot_reply: botReply,
      transaction: createdTx,
      usage: formatUsagePayload(nextRequestCount)
    });
  } catch (err) {
    console.error('[Chat] Error:', err.message);
    return res.status(503).json({ error: 'Layanan SakuBot sedang sibuk. Silakan coba lagi.' });
  }
});

/**
 * GET /api/chat/usage
 * Get current user's usage status for today from Supabase
 */
chatRouter.get('/usage', authMiddleware, async (req, res) => {
  try {
    const todayDate = getLocalTodayStr();
    const usage = await getTodayUsage(req.user.id, todayDate);
    const payload = formatUsagePayload(usage.request_count);
    return res.json({
      date: todayDate,
      request_count: usage.request_count,
      llm_count: usage.llm_count,
      daily_limit: payload.limit,
      remaining: payload.remaining
    });
  } catch (err) {
    console.error('[Chat] Usage error:', err.message);
    return res.status(503).json({ error: 'Gagal memuat kuota pemakaian.' });
  }
});
