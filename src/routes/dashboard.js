import express from 'express';
import { supabase, getCategoriesMap } from '../config/supabase.js';
import { authMiddleware } from '../middlewares/auth.js';

export const dashboardRouter = express.Router();

function toLocalDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalYearMonthStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * GET /api/dashboard/summary
 * Balance, monthly income, monthly expenses, recent transactions from Supabase (F-06, F-08)
 */
dashboardRouter.get('/summary', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const currentYearMonth = toLocalYearMonthStr(now);
  const todayDate = toLocalDateStr(now);

  try {
    const [txResult, usageResult, categoriesById] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_on', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('chat_usage')
        .select('request_count, llm_count')
        .eq('user_id', userId)
        .eq('usage_date', todayDate)
        .maybeSingle(),
      getCategoriesMap()
    ]);

    if (txResult.error) {
      return res.status(503).json({ error: 'Gagal memuat ringkasan dari database cloud.' });
    }

    const rows = (txResult.data || []).map((row) => {
      const cat = categoriesById.get(String(row.category_id));
      return {
        ...row,
        category_name: cat?.name || 'Lain-lain',
        category_type: cat?.type || 'expense'
      };
    });

    let incomeTotal = 0;
    let expenseTotal = 0;
    let monthlyIncome = 0;
    let monthlyExpense = 0;

    for (const tx of rows) {
      const amt = Number(tx.amount) || 0;
      const isCurrentMonth = String(tx.occurred_on || '').startsWith(currentYearMonth);
      if (tx.category_type === 'income') {
        incomeTotal += amt;
        if (isCurrentMonth) monthlyIncome += amt;
      } else {
        expenseTotal += amt;
        if (isCurrentMonth) monthlyExpense += amt;
      }
    }

    const usage = usageResult.data || { request_count: 0, llm_count: 0 };
    const dailyLimit = parseInt(process.env.DAILY_CHAT_LIMIT || '50', 10);

    return res.json({
      success: true,
      data: {
        total_balance: incomeTotal - expenseTotal,
        lifetime_income: incomeTotal,
        lifetime_expense: expenseTotal,
        monthly_income: monthlyIncome,
        monthly_expense: monthlyExpense,
        monthly_net: monthlyIncome - monthlyExpense,
        transaction_count: rows.length,
        recent_transactions: rows.slice(0, 5),
        chat_quota: {
          used: usage.request_count,
          limit: dailyLimit,
          remaining: Math.max(0, dailyLimit - usage.request_count)
        }
      }
    });
  } catch (err) {
    console.error('[Dashboard] Summary error:', err.message);
    return res.status(503).json({ error: 'Gagal memuat ringkasan dari database cloud.' });
  }
});

/**
 * GET /api/dashboard/charts
 * Category distribution & monthly/daily trend data from Supabase (F-07, F-08)
 */
dashboardRouter.get('/charts', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const now = new Date();

  try {
    const [txResult, categoriesById] = await Promise.all([
      supabase
        .from('transactions')
        .select('category_id, amount, occurred_on')
        .eq('user_id', userId),
      getCategoriesMap()
    ]);

    if (txResult.error) {
      return res.status(503).json({ error: 'Gagal memuat grafik dari database cloud.' });
    }

    const rows = (txResult.data || []).map((row) => {
      const cat = categoriesById.get(String(row.category_id));
      return {
        amount: Number(row.amount) || 0,
        occurred_on: String(row.occurred_on || ''),
        category_name: cat?.name || 'Lain-lain pengeluaran',
        category_type: cat?.type || 'expense'
      };
    });

    // 1. Expense Breakdown by Category
    const catTotals = new Map();
    for (const tx of rows) {
      if (tx.category_type === 'expense') {
        catTotals.set(tx.category_name, (catTotals.get(tx.category_name) || 0) + tx.amount);
      }
    }
    const categoryBreakdown = Array.from(catTotals.entries())
      .map(([name, total]) => ({ name, total }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);

    // 2. Monthly Trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = toLocalYearMonthStr(d);
      const monthName = d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
      let income = 0;
      let expense = 0;
      for (const tx of rows) {
        if (tx.occurred_on.startsWith(ym)) {
          if (tx.category_type === 'income') income += tx.amount;
          else expense += tx.amount;
        }
      }
      monthlyTrend.push({
        month: monthName,
        year_month: ym,
        income,
        expense,
        net: income - expense
      });
    }

    // 3. Daily Trend Helper (Last 7 and 30 days)
    function getDailyTrend(numDays) {
      const result = [];
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateStr = toLocalDateStr(d);
        const dayLabel = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        let income = 0;
        let expense = 0;
        for (const tx of rows) {
          if (tx.occurred_on === dateStr) {
            if (tx.category_type === 'income') income += tx.amount;
            else expense += tx.amount;
          }
        }
        result.push({
          date: dateStr,
          label: dayLabel,
          income,
          expense,
          net: income - expense
        });
      }
      return result;
    }

    return res.json({
      success: true,
      data: {
        category_breakdown: categoryBreakdown,
        monthly_trend: monthlyTrend,
        daily_trend_7d: getDailyTrend(7),
        daily_trend_30d: getDailyTrend(30)
      }
    });
  } catch (err) {
    console.error('[Dashboard] Charts error:', err.message);
    return res.status(503).json({ error: 'Gagal memuat grafik dari database cloud.' });
  }
});
