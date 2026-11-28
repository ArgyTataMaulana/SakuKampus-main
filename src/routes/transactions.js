import express from 'express';
import { supabase, getAllCategories, getCategoriesMap } from '../config/supabase.js';
import { authMiddleware } from '../middlewares/auth.js';
import {
  normalizeWallet,
  encodeRawTextWithWallet,
  encodeRawTextWithTransfer,
  parseWalletFromRow,
  computeWalletBalances,
  validateExpenseAgainstBalances
} from '../services/walletHelper.js';
import {
  isValidDateStr,
  resolveMaxAllowedDate,
  isFutureDateStr
} from '../services/dateHelper.js';

export const transactionsRouter = express.Router();

const MAX_TRANSACTION_AMOUNT = 100000000; // Rp 100 Juta

function enrichTransaction(row, categoriesById) {
  const wallet = parseWalletFromRow(row);
  if (wallet.is_transfer) {
    return {
      ...row,
      raw_text: wallet.clean_raw_text,
      is_transfer: true,
      category_name: 'Pindah Dana',
      category_type: 'transfer',
      wallet_type: 'transfer',
      bank_name: '',
      wallet_label: wallet.wallet_label,
      from_wallet: wallet.from,
      to_wallet: wallet.to
    };
  }

  const category = categoriesById.get(String(row.category_id));
  return {
    ...row,
    raw_text: wallet.clean_raw_text,
    is_transfer: false,
    category_name: category?.name || 'Lain-lain',
    category_type: category?.type || 'expense',
    wallet_type: wallet.wallet_type,
    bank_name: wallet.bank_name,
    wallet_label: wallet.wallet_label
  };
}

/**
 * POST /api/transactions/transfer
 * Move funds between Cash and Bank (or between Banks) without affecting income/expense totals
 */
transactionsRouter.post('/transfer', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    amount,
    from_wallet_type = 'bank',
    from_bank_name = '',
    to_wallet_type = 'cash',
    to_bank_name = '',
    description = '',
    occurred_on
  } = req.body;

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_TRANSACTION_AMOUNT) {
    return res.status(400).json({ error: `Nominal pindah dana harus antara Rp 1 dan Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString('id-ID')}.` });
  }

  const clientDate = req.headers['x-client-date'];
  if (occurred_on && !isValidDateStr(occurred_on)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD).' });
  }
  if (occurred_on && isFutureDateStr(occurred_on, clientDate)) {
    return res.status(400).json({ error: 'Tanggal transaksi tidak boleh melebihi hari ini.' });
  }

  const from = normalizeWallet(from_wallet_type, from_bank_name);
  const to = normalizeWallet(to_wallet_type, to_bank_name);

  if (from.wallet_type === to.wallet_type && from.bank_name === to.bank_name) {
    return res.status(400).json({ error: 'Sumber dana asal dan tujuan tidak boleh sama.' });
  }

  try {
    const [categoriesById, allCategories, { data: userTxRows, error: fetchErr }] = await Promise.all([
      getCategoriesMap(),
      getAllCategories(),
      supabase
        .from('transactions')
        .select('id, category_id, amount, description, raw_text')
        .eq('user_id', userId)
    ]);

    if (fetchErr) {
      return res.status(503).json({ error: 'Gagal memverifikasi saldo di database cloud.' });
    }

    const roundedAmount = Math.round(numAmount);
    const balances = computeWalletBalances(userTxRows || [], categoriesById);

    const check = validateExpenseAgainstBalances({
      amount: roundedAmount,
      wallet_type: from.wallet_type,
      bank_name: from.bank_name,
      balances,
      explicitWallet: true
    });

    if (!check.ok) {
      return res.status(400).json({ success: false, error: check.reason, code: check.code });
    }

    const fallbackCat = allCategories.find((c) => c.name === 'Lain-lain pengeluaran') || allCategories[0];
    const cleanDesc = description && String(description).trim()
      ? String(description).trim().slice(0, 200)
      : (from.wallet_type === 'bank' && to.wallet_type === 'cash'
        ? `Tarik tunai dari ${from.wallet_label}`
        : `Pindah dana ${from.wallet_label} → ${to.wallet_label}`);

    const rawTextEncoded = encodeRawTextWithTransfer(cleanDesc, from, to);

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: fallbackCat.id,
        amount: roundedAmount,
        description: cleanDesc,
        raw_text: rawTextEncoded,
        source: 'chat',
        parsed_by: 'rule',
        occurred_on: occurred_on || resolveMaxAllowedDate(clientDate)
      })
      .select('*')
      .single();

    if (error) {
      console.error('[Transfer] Insert error:', error.message);
      return res.status(503).json({ error: 'Gagal menyimpan pindah dana ke database cloud.' });
    }

    return res.json({
      success: true,
      message: `Dana berhasil dipindahkan (${from.wallet_label} → ${to.wallet_label}).`,
      data: enrichTransaction(inserted, categoriesById)
    });
  } catch (err) {
    console.error('[Transfer] Error:', err.message);
    return res.status(503).json({ error: 'Gagal memproses pindah dana.' });
  }
});

/**
 * GET /api/transactions/meta/categories
 * List all 12 categories from Supabase
 */
transactionsRouter.get('/meta/categories', async (req, res) => {
  try {
    const categories = await getAllCategories();
    return res.json({ success: true, data: categories });
  } catch (err) {
    console.error('[Categories] Error:', err.message);
    return res.status(503).json({ error: 'Gagal memuat daftar kategori dari database cloud.' });
  }
});

/**
 * GET /api/transactions
 * Retrieve transaction history with filtering & search from Supabase
 */
transactionsRouter.get('/', authMiddleware, async (req, res) => {
  const { type, category_id, wallet_type, start_date, end_date, search, limit = 100 } = req.query;

  if (start_date && end_date && start_date > end_date) {
    return res.status(400).json({ error: 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.' });
  }

  try {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('occurred_on', { ascending: false })
      .order('id', { ascending: false });

    if (category_id) query = query.eq('category_id', category_id);
    if (start_date) query = query.gte('occurred_on', start_date);
    if (end_date) query = query.lte('occurred_on', end_date);

    const [{ data: cloudRows, error: txError }, categoriesById] = await Promise.all([
      query,
      getCategoriesMap()
    ]);

    if (txError) {
      console.error('[Transactions] Failed to load Supabase history:', txError.message);
      return res.status(503).json({ error: 'Riwayat belum bisa dimuat dari database cloud.' });
    }

    const searchTerm = typeof search === 'string' ? search.toLocaleLowerCase('id-ID') : '';
    const maxRows = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

    const rows = (cloudRows || [])
      .map((row) => enrichTransaction(row, categoriesById))
      .filter((row) => (!type || row.category_type === type))
      .filter((row) => (!wallet_type || row.wallet_type === wallet_type))
      .filter((row) => !searchTerm || [row.description, row.raw_text, row.category_name, row.wallet_label]
        .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(searchTerm)))
      .slice(0, maxRows);

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('[Transactions] Unexpected error:', err.message);
    return res.status(503).json({ error: 'Riwayat belum bisa dimuat dari database cloud.' });
  }
});

/**
 * POST /api/transactions
 * Create a new transaction manually in Supabase with balance guard & wallet tagging
 */
transactionsRouter.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { amount, category_id, description, occurred_on, wallet_type = 'cash', bank_name = '' } = req.body;

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_TRANSACTION_AMOUNT) {
    return res.status(400).json({ error: `Nominal transaksi harus antara Rp 1 dan Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString('id-ID')}.` });
  }

  const clientDate = req.headers['x-client-date'];
  if (occurred_on && !isValidDateStr(occurred_on)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD).' });
  }
  if (occurred_on && isFutureDateStr(occurred_on, clientDate)) {
    return res.status(400).json({ error: 'Tanggal transaksi tidak boleh melebihi hari ini.' });
  }

  try {
    const [categoriesById, { data: userTxRows, error: fetchErr }] = await Promise.all([
      getCategoriesMap(),
      supabase
        .from('transactions')
        .select('id, category_id, amount, description, raw_text')
        .eq('user_id', userId)
    ]);

    if (fetchErr) {
      return res.status(503).json({ error: 'Gagal memverifikasi saldo di database cloud.' });
    }

    const category = categoriesById.get(String(category_id));
    if (!category) {
      return res.status(400).json({ error: 'Kategori tidak valid.' });
    }

    const roundedAmount = Math.round(numAmount);
    const wallet = normalizeWallet(wallet_type, bank_name);

    // Balance logic guard: block expense if balance is 0 or insufficient
    if (category.type === 'expense') {
      const balances = computeWalletBalances(userTxRows || [], categoriesById);
      const check = validateExpenseAgainstBalances({
        amount: roundedAmount,
        wallet_type: wallet.wallet_type,
        bank_name: wallet.bank_name,
        balances,
        explicitWallet: true
      });
      if (!check.ok) {
        return res.status(400).json({ success: false, error: check.reason, code: check.code });
      }
    }

    const rawTextEncoded = encodeRawTextWithWallet(
      `Manual: ${category.name} ${roundedAmount}`,
      wallet.wallet_type,
      wallet.bank_name
    );

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: category.id,
        amount: roundedAmount,
        description: description ? String(description).trim().slice(0, 200) : `Transaksi ${category.name}`,
        raw_text: rawTextEncoded,
        source: 'chat',
        parsed_by: 'rule',
        occurred_on: occurred_on || resolveMaxAllowedDate(clientDate)
      })
      .select('*')
      .single();

    if (error) {
      console.error('[Transactions] Insert error:', error.message);
      return res.status(503).json({ error: 'Gagal menyimpan transaksi ke database cloud.' });
    }

    return res.json({
      success: true,
      message: 'Transaksi berhasil ditambahkan.',
      data: enrichTransaction(inserted, categoriesById)
    });
  } catch (err) {
    console.error('[Transactions] POST error:', err.message);
    return res.status(503).json({ error: 'Gagal menyimpan transaksi ke database cloud.' });
  }
});

/**
 * GET /api/transactions/:id
 * Get single transaction from Supabase
 */
transactionsRouter.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [{ data: tx, error }, categoriesById] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .maybeSingle(),
      getCategoriesMap()
    ]);

    if (error) {
      return res.status(503).json({ error: 'Gagal mengambil data transaksi dari database cloud.' });
    }

    if (!tx) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    }

    return res.json({ success: true, data: enrichTransaction(tx, categoriesById) });
  } catch (err) {
    return res.status(503).json({ error: 'Gagal mengambil data transaksi dari database cloud.' });
  }
});

/**
 * PUT /api/transactions/:id
 * Edit transaction in Supabase with balance consistency validation
 */
transactionsRouter.put('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const txId = req.params.id;
  const { amount, category_id, description, occurred_on, wallet_type, bank_name } = req.body;

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_TRANSACTION_AMOUNT) {
    return res.status(400).json({ error: `Nominal transaksi harus antara Rp 1 dan Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString('id-ID')}.` });
  }

  const clientDate = req.headers['x-client-date'];
  if (occurred_on && !isValidDateStr(occurred_on)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD).' });
  }
  if (occurred_on && isFutureDateStr(occurred_on, clientDate)) {
    return res.status(400).json({ error: 'Tanggal transaksi tidak boleh melebihi hari ini.' });
  }

  try {
    const [categoriesById, { data: userTxRows, error: fetchErr }] = await Promise.all([
      getCategoriesMap(),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
    ]);

    if (fetchErr) {
      return res.status(503).json({ error: 'Gagal memverifikasi data di database cloud.' });
    }

    const existing = (userTxRows || []).find((r) => String(r.id) === String(txId));
    if (!existing) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    const category = categoriesById.get(String(category_id));
    if (!category) {
      return res.status(400).json({ error: 'Kategori tidak valid.' });
    }

    const roundedAmount = Math.round(numAmount);
    const existingWallet = parseWalletFromRow(existing);
    if (existingWallet.is_transfer) {
      return res.status(400).json({
        success: false,
        error: 'Transaksi pindah dana tidak dapat diubah secara langsung. Hapus lalu catat ulang jika perlu.'
      });
    }
    const nextWallet = wallet_type
      ? normalizeWallet(wallet_type, bank_name !== undefined ? bank_name : existingWallet.bank_name)
      : existingWallet;

    // Validate balance after replacing this transaction
    const balancesWithoutCurrent = computeWalletBalances(userTxRows || [], categoriesById, txId);
    if (category.type === 'expense') {
      const check = validateExpenseAgainstBalances({
        amount: roundedAmount,
        wallet_type: nextWallet.wallet_type,
        bank_name: nextWallet.bank_name,
        balances: balancesWithoutCurrent,
        explicitWallet: true
      });
      if (!check.ok) {
        return res.status(400).json({ success: false, error: check.reason, code: check.code });
      }
    } else {
      // Income edit: ensure reducing income doesn't cause negative total balance
      const projectedTotal = balancesWithoutCurrent.totalBalance + roundedAmount;
      if (projectedTotal < 0) {
        return res.status(400).json({
          success: false,
          error: 'Nominal pemasukan ini tidak dapat dikurangi di bawah total pengeluaran yang sudah tercatat.'
        });
      }
    }

    const updatedRawText = encodeRawTextWithWallet(
      existingWallet.clean_raw_text || `Manual: ${category.name} ${roundedAmount}`,
      nextWallet.wallet_type,
      nextWallet.bank_name
    );

    const { data: updated, error } = await supabase
      .from('transactions')
      .update({
        amount: roundedAmount,
        category_id: category.id,
        description: description ? String(description).trim().slice(0, 200) : 'Transaksi',
        raw_text: updatedRawText,
        occurred_on: occurred_on || resolveMaxAllowedDate(clientDate),
        updated_at: new Date().toISOString()
      })
      .eq('id', txId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[Transactions] Update error:', error.message);
      return res.status(503).json({ error: 'Gagal memperbarui transaksi di database cloud.' });
    }

    return res.json({
      success: true,
      message: 'Transaksi berhasil diperbarui.',
      data: enrichTransaction(updated, categoriesById)
    });
  } catch (err) {
    console.error('[Transactions] PUT error:', err.message);
    return res.status(503).json({ error: 'Gagal memperbarui transaksi di database cloud.' });
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete transaction from Supabase (blocks deleting income if funds are already spent)
 */
transactionsRouter.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [categoriesById, { data: userTxRows, error: fetchErr }] = await Promise.all([
      getCategoriesMap(),
      supabase
        .from('transactions')
        .select('id, category_id, amount, description, raw_text')
        .eq('user_id', req.user.id)
    ]);

    if (fetchErr) {
      return res.status(503).json({ error: 'Gagal memverifikasi transaksi di database cloud.' });
    }

    const target = (userTxRows || []).find((r) => String(r.id) === String(req.params.id));
    if (!target) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    const targetWallet = parseWalletFromRow(target);
    const targetCat = categoriesById.get(String(target.category_id));
    if (targetWallet.is_transfer) {
      const remainingBalances = computeWalletBalances(userTxRows || [], categoriesById, target.id);
      if (remainingBalances.cashBalance < 0 || remainingBalances.bankBalance < 0) {
        return res.status(400).json({
          success: false,
          error: 'Catatan pindah dana ini tidak dapat dihapus karena dananya di dompet tujuan sudah terpakai.'
        });
      }
    } else if (targetCat?.type === 'income') {
      const remainingBalances = computeWalletBalances(userTxRows || [], categoriesById, target.id);
      if (remainingBalances.totalBalance < 0) {
        return res.status(400).json({
          success: false,
          error: 'Pemasukan ini tidak dapat dihapus karena saldonya sudah terpakai oleh transaksi pengeluaran.'
        });
      }
    }

    const { data: deleted, error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Transactions] Delete error:', error.message);
      return res.status(503).json({ error: 'Gagal menghapus transaksi di database cloud.' });
    }

    if (!deleted) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses.' });
    }

    return res.json({ success: true, message: 'Transaksi berhasil dihapus.' });
  } catch (err) {
    console.error('[Transactions] DELETE error:', err.message);
    return res.status(503).json({ error: 'Gagal menghapus transaksi di database cloud.' });
  }
});
