import express from 'express';
import { db } from '../config/database.js';
import { supabase } from '../config/supabase.js';
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

/**
 * GET /api/transactions
 * Retrieve transaction history with filtering & search (F-05, F-08)
 */
transactionsRouter.get('/', authMiddleware, async (req, res) => {
  const { type, category_id, start_date, end_date, search, limit = 100 } = req.query;

  if (start_date && end_date && start_date > end_date) {
    return res.status(400).json({ error: 'Tanggal mulai tidak boleh lebih besar dari tanggal akhir.' });
  }

  // Vercel instances do not share their local SQLite files. Read transaction
  // history from Supabase so the same account sees the same rows on every device.
  const { data: cloudUser, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('google_sub', req.user.google_sub)
    .maybeSingle();

  if (userError) {
    console.error('[Transactions] Failed to resolve Supabase user:', userError.message);
    return res.status(503).json({ error: 'Riwayat belum bisa dimuat dari database cloud.' });
  }

  if (!cloudUser) {
    return res.json({ success: true, count: 0, data: [] });
  }

  let cloudQuery = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', cloudUser.id)
    .order('occurred_on', { ascending: false })
    .order('id', { ascending: false });

  if (category_id) cloudQuery = cloudQuery.eq('category_id', category_id);
  if (start_date) cloudQuery = cloudQuery.gte('occurred_on', start_date);
  if (end_date) cloudQuery = cloudQuery.lte('occurred_on', end_date);

  const { data: cloudRows, error: transactionsError } = await cloudQuery;
  if (transactionsError) {
    console.error('[Transactions] Failed to load Supabase history:', transactionsError.message);
    return res.status(503).json({ error: 'Riwayat belum bisa dimuat dari database cloud.' });
  }

  const categories = db.prepare('SELECT id, name, type FROM categories').all();
  const categoriesById = new Map(categories.map((category) => [String(category.id), category]));
  const searchTerm = typeof search === 'string' ? search.toLocaleLowerCase('id-ID') : '';
  const maxRows = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const rows = (cloudRows || [])
    .map((row) => {
      const category = categoriesById.get(String(row.category_id));
      return {
        ...row,
        category_name: category?.name,
        category_type: category?.type
      };
    })
    .filter((row) => (!type || row.category_type === type))
    .filter((row) => !searchTerm || [row.description, row.raw_text, row.category_name]
      .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(searchTerm)))
    .slice(0, maxRows);

  return res.json({ success: true, count: rows.length, data: rows });
});

/**
 * POST /api/transactions
 * Create a new transaction manually (F-08, F-10)
 */
transactionsRouter.post('/', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { amount, category_id, description, occurred_on } = req.body;

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_TRANSACTION_AMOUNT) {
    return res.status(400).json({ error: `Nominal transaksi harus antara Rp 1 dan Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString('id-ID')}.` });
  }

  if (occurred_on && !isValidDateStr(occurred_on)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD).' });
  }

  const category = db.prepare('SELECT id, name, type FROM categories WHERE id = ?').get(category_id);
  if (!category) {
    return res.status(400).json({ error: 'Kategori tidak valid.' });
  }

  const result = db.prepare(`
    INSERT INTO transactions (
      user_id, category_id, amount, description, raw_text, source, parsed_by, occurred_on
    ) VALUES (?, ?, ?, ?, ?, 'chat', 'rule', ?)
  `).run(
    userId,
    category.id,
    Math.round(numAmount),
    description ? String(description).trim().slice(0, 200) : `Transaksi ${category.name}`,
    `Manual: ${category.name} ${Math.round(numAmount)}`,
    occurred_on || getLocalTodayStr()
  );

  const newTx = db.prepare(`
    SELECT t.*, c.name as category_name, c.type as category_type
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.json({ success: true, message: 'Transaksi berhasil ditambahkan.', data: newTx });
});

/**
 * GET /api/transactions/:id
 * Get single transaction
 */
transactionsRouter.get('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const tx = db.prepare(`
    SELECT t.*, c.name as category_name, c.type as category_type
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.id = ? AND t.user_id = ?
  `).get(req.params.id, userId);

  if (!tx) {
    return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  }

  res.json({ success: true, data: tx });
});

/**
 * PUT /api/transactions/:id
 * Edit transaction (F-10, F-08)
 */
transactionsRouter.put('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const txId = req.params.id;
  const { amount, category_id, description, occurred_on } = req.body;

  // Verify ownership (F-08)
  const existing = db.prepare('SELECT id FROM transactions WHERE id = ? AND user_id = ?').get(txId, userId);
  if (!existing) {
    return res.status(404).json({ error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses.' });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_TRANSACTION_AMOUNT) {
    return res.status(400).json({ error: `Nominal transaksi harus antara Rp 1 dan Rp ${MAX_TRANSACTION_AMOUNT.toLocaleString('id-ID')}.` });
  }

  if (occurred_on && !isValidDateStr(occurred_on)) {
    return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD).' });
  }

  // Verify category exists
  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
  if (!category) {
    return res.status(400).json({ error: 'Kategori tidak valid.' });
  }

  db.prepare(`
    UPDATE transactions
    SET amount = ?,
        category_id = ?,
        description = ?,
        occurred_on = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(
    Math.round(numAmount),
    category_id,
    description ? String(description).trim().slice(0, 200) : 'Transaksi',
    occurred_on || getLocalTodayStr(),
    txId,
    userId
  );

  const updatedTx = db.prepare(`
    SELECT t.*, c.name as category_name, c.type as category_type
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).get(txId);

  res.json({ success: true, message: 'Transaksi berhasil diperbarui.', data: updatedTx });
});

/**
 * DELETE /api/transactions/:id
 * Delete transaction (F-10, F-08)
 */
transactionsRouter.delete('/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const txId = req.params.id;

  const result = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(txId, userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Transaksi tidak ditemukan atau Anda tidak memiliki akses.' });
  }

  res.json({ success: true, message: 'Transaksi berhasil dihapus.' });
});

/**
 * GET /api/categories
 * List all 12 categories
 */
transactionsRouter.get('/meta/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY type DESC, id ASC').all();
  res.json({ success: true, data: categories });
});
