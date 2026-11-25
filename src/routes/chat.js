import express from 'express';
import { supabase, getAllCategories } from '../config/supabase.js';
import { authMiddleware } from '../middlewares/auth.js';
import { parseSentenceWithRules } from '../services/ruleParser.js';
import { parseSentenceWithLLM } from '../services/llmService.js';
import {
  isConsultationQuery,
  getUserFinancialContext,
  getGeminiConsultationResponse
} from '../services/financialAdvisor.js';
import { getActiveProvider } from '../services/aiProvider.js';

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
    const allCategories = await getAllCategories();
    let categoryRow = allCategories.find((c) => c.name === txData.category);
    if (!categoryRow) {
      const defaultCatName = txData.type === 'income' ? 'Lain-lain pemasukan' : 'Lain-lain pengeluaran';
      categoryRow = allCategories.find((c) => c.name === defaultCatName) || allCategories[0];
    }

    // 6. Save Transaction to Supabase (F-08: Strictly per req.user.id)
    const txSource = source === 'voice' ? 'voice' : 'chat';
    const { data: insertedTx, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: categoryRow.id,
        amount: Math.round(Number(txData.amount)),
        description: txData.description,
        raw_text: cleanMessage,
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
      category_name: categoryRow.name,
      category_type: categoryRow.type
    };

    // 7. Format success confirmation message
    const formattedNominal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(createdTx.amount);
    const typeText = createdTx.category_type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    const parserBadge = parsedBy === 'rule' ? '⚡ Aturan Cepat' : `🤖 AI (${getActiveProvider().toUpperCase()})`;
    const sourceBadge = txSource === 'voice' ? '🎙️ Suara' : '💬 Teks';

    const isDebt = /\b(utang|hutang|pinjam|minjam|meminjam|ngutang|berutang|kasbon)\b/i.test(createdTx.description) ||
      /\b(utang|hutang|pinjam|minjam|meminjam|ngutang|berutang|kasbon)\b/i.test(cleanMessage);
    const debtNote = isDebt ? `\n• *💡 Dicatat sebagai pengeluaran (kewajiban utang/pinjaman) sehingga saldo berkurang.*` : '';

    const botReply = `✅ Berhasil mencatat ${typeText.toLowerCase()}!\n` +
      `• **Kategori**: ${createdTx.category_name}\n` +
      `• **Nominal**: ${formattedNominal}\n` +
      `• **Keterangan**: ${createdTx.description}\n` +
      `• **Tanggal**: ${createdTx.occurred_on}${debtNote}\n` +
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
