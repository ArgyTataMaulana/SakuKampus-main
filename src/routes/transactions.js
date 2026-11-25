import express from 'express';
import { supabase, getAllCategories, getCategoriesMap } from '../config/supabase.js';
import { authMiddleware } from '../middlewares/auth.js';

export const transactionsRouter = express.Router();

const MAX_TRANSACTION_AMOUNT = 100000000; // Rp 100 Juta

function getLocalTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(dateStr);
}

function enrichTransaction(row, categoriesById) {
  const category = categoriesById.get(String(row.category_id));
  return {
    ...row,
    category_name: category?.name || 'Lain-lain',
    category_type: category?.type || 'expense'
  };
}

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
 * Retrieve transaction history with filtering & search from Supabase (F-05, F-08)
 */
transactionsRouter.get('/', authMiddleware, async (req, res) => {
  const { type, category_id, start_date, end_date, search, limit = 100 } = req.query;

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
      .filter((row) => !searchTerm || [row.description, row.raw_text, row.category_name]
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
 * Create a new transaction manually in Supabase (F-08, F-10)
 */
transactionsRouter.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { amount, category_id, description, occurred_on } = req.body;

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_TRANSACTION_AMOUNT) {
    return res.status(400).json({ error: `Nominal transaksi harus antara Rp 1 dan Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString('id-ID')}.` });
  }

  if (occurred_on && !isValidDateStr(occurred_on)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD).' });
  }

  try {
    const categoriesById = await getCategoriesMap();
    const category = categoriesById.get(String(category_id));
    if (!category) {
      return res.status(400).json({ error: 'Kategori tidak valid.' });
    }

    const roundedAmount = Math.round(numAmount);
    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: category.id,
        amount: roundedAmount,
        description: description ? String(description).trim().slice(0, 200) : `Transaksi ${category.name}`,
        raw_text: `Manual: ${category.name} ${roundedAmount}`,
        source: 'chat',
        parsed_by: 'rule',
        occurred_on: occurred_on || getLocalTodayStr()
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
 * Edit transaction in Supabase (F-10, F-08)
 */
transactionsRouter.put('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const txId = req.params.id;
  const { amount, category_id, description, occurred_on } = req.body;

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_TRANSACTION_AMOUNT) {
    return res.status(400).json({ error: `Nominal transaksi harus antara Rp 1 dan Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString('id-ID')}.` });
  }

  if (occurred_on && !isValidDateStr(occurred_on)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD).' });
  }

  try {
    const categoriesById = await getCategoriesMap();
    const category = categoriesById.get(String(category_id));
    if (!category) {
      return res.status(400).json({ error: 'Kategori tidak valid.' });
    }

    const { data: updated, error } = await supabase
      .from('transactions')
      .update({
        amount: Math.round(numAmount),
        category_id: category.id,
        description: description ? String(description).trim().slice(0, 200) : 'Transaksi',
        occurred_on: occurred_on || getLocalTodayStr(),
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

    if (!updated) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses.' });
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
 * Delete transaction from Supabase (F-10, F-08)
 */
transactionsRouter.delete('/:id', authMiddleware, async (req, res) => {
  try {
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
