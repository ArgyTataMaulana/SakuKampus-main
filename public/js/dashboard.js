// Dashboard, Wallets, Analytics & Chart.js Controller
// Minimalism + Bento Grid (Monochrome Black & White + Emerald)

let categoryChartInstance = null;
let trendChartInstance = null;
let cachedChartData = null;
let currentTrendPeriod = '7d'; // '7d', '30d', or 'monthly'

function getCategoryPalette(isDark) {
  return {
    'Makan': '#059669',                  // Emerald Primary
    'Transportasi': isDark ? '#E4E4E7' : '#18181B', // Monochrome Ink
    'Belanja': '#10B981',                // Fresh Emerald
    'Tagihan': '#DC2626',                // Semantic Crimson
    'Hiburan': '#0D9488',                // Muted Teal
    'Kesehatan': '#6366F1',              // Soft Indigo
    'Pendidikan': '#D97706',             // Warm Amber
    'Lain-lain pengeluaran': '#71717A'   // Neutral Zinc
  };
}

function formatRupiah(num) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num || 0);
}

function getCategoryIcon(name, type) {
  const iconMap = {
    'Makan': 'fa-utensils',
    'Transportasi': 'fa-bicycle',
    'Belanja': 'fa-bag-shopping',
    'Tagihan': 'fa-receipt',
    'Hiburan': 'fa-gamepad',
    'Kesehatan': 'fa-heart-pulse',
    'Pendidikan': 'fa-graduation-cap',
    'Lain-lain pengeluaran': 'fa-boxes-stacked',
    'Gaji': 'fa-money-bill-wave',
    'Uang Saku': 'fa-hand-holding-dollar',
    'Uang saku': 'fa-hand-holding-dollar',
    'Bonus': 'fa-gift',
    'Lain-lain pemasukan': 'fa-coins'
  };
  const icon = iconMap[name] || (type === 'income' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down');
  return `<i class="fa-solid ${icon}"></i>`;
}

async function loadDashboardData() {
  try {
    const summaryRes = await api.get('/api/dashboard/summary');
    if (summaryRes.success) {
      const data = summaryRes.data;

      // Hero Total Saldo
      const balanceEl = document.getElementById('statTotalBalance');
      if (balanceEl) {
        balanceEl.textContent = formatRupiah(data.total_balance);
        balanceEl.className = data.total_balance < 0
          ? 'text-3xl sm:text-4xl font-extrabold tracking-tight text-red-600 dark:text-red-400 tabular-nums mt-1.5'
          : 'text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 tabular-nums mt-1.5';
      }

      const ws = data.wallet_summary || { cash: 0, bank: 0, banks: [] };
      window.currentWalletBalances = {
        total: data.total_balance || 0,
        cash: ws.cash || 0,
        bank: ws.bank || 0,
        banks: ws.banks || []
      };

      const cashEl = document.getElementById('statCashBalance');
      const bankEl = document.getElementById('statBankBalance');
      const bankDetailsEl = document.getElementById('statBankDetails');
      if (cashEl) cashEl.textContent = formatRupiah(ws.cash || 0);
      if (bankEl) bankEl.textContent = formatRupiah(ws.bank || 0);
      if (bankDetailsEl) {
        const specificBanks = (ws.banks || []).filter(b => b.name && b.name !== 'Bank Lainnya');
        if (specificBanks.length > 0) {
          bankDetailsEl.classList.remove('hidden');
          bankDetailsEl.innerHTML = specificBanks.map(b =>
            `<span class="badge-neutral tabular-nums"><i class="fa-solid fa-building-columns text-[9px] text-zinc-400"></i> ${escapeHtml(b.name)}: <b class="text-zinc-900 dark:text-zinc-100">${formatRupiah(b.balance)}</b></span>`
          ).join('');
        } else {
          bankDetailsEl.classList.add('hidden');
          bankDetailsEl.innerHTML = '';
        }
      }

      const incEl = document.getElementById('statMonthlyIncome');
      const expEl = document.getElementById('statMonthlyExpense');
      if (incEl) incEl.textContent = formatRupiah(data.monthly_income);
      if (expEl) expEl.textContent = formatRupiah(data.monthly_expense);
      window.lastMonthlyExpense = data.monthly_expense || 0;
      window.lastMonthlyIncome = data.monthly_income || 0;

      // Safe-to-Spend Daily Card
      const sts = data.safe_to_spend || { daily_limit: 0, spent_today: 0, remaining_days: 1, days_in_month: 30 };
      const safeDailyEl = document.getElementById('statSafeDaily');
      const remDaysEl = document.getElementById('statRemainingDays');
      const spentTodayEl = document.getElementById('statSpentToday');
      const safeBarEl = document.getElementById('safeDailyBar');
      const safeStatusEl = document.getElementById('statSafeDailyStatus');

      if (safeDailyEl) safeDailyEl.textContent = formatRupiah(sts.daily_limit);
      if (remDaysEl) remDaysEl.textContent = `Sisa ${sts.remaining_days} hari`;
      if (spentTodayEl) spentTodayEl.textContent = formatRupiah(sts.spent_today);

      if (safeBarEl && safeStatusEl) {
        if (sts.daily_limit <= 0) {
          safeBarEl.style.width = '0%';
          safeBarEl.className = 'bg-zinc-400 h-full';
          safeStatusEl.textContent = 'Saldo Kosong';
          safeStatusEl.className = 'font-semibold text-zinc-500';
        } else {
          const pct = Math.min(100, Math.round((sts.spent_today / sts.daily_limit) * 100));
          safeBarEl.style.width = `${pct}%`;
          if (sts.spent_today > sts.daily_limit) {
            safeBarEl.className = 'bg-red-600 h-full';
            safeStatusEl.textContent = 'Melebihi Batas';
            safeStatusEl.className = 'font-semibold text-red-600 dark:text-red-400';
          } else if (pct >= 75) {
            safeBarEl.className = 'bg-amber-500 h-full';
            safeStatusEl.textContent = 'Mendekati Batas';
            safeStatusEl.className = 'font-semibold text-amber-600 dark:text-amber-400';
          } else {
            safeBarEl.className = 'bg-emerald-600 h-full';
            safeStatusEl.textContent = 'Aman';
            safeStatusEl.className = 'font-semibold text-emerald-600 dark:text-emerald-400';
          }
        }
      }

      // Monthly Budget Limit Card (syncs Dashboard + Dompet)
      updateMonthlyBudgetCard(data.monthly_expense || 0, data.monthly_income || 0);

      // Quota Counter & Bars
      const quota = data.chat_quota;
      const statQuota = document.getElementById('statQuotaCount');
      if (statQuota) statQuota.textContent = `${quota.remaining} / ${quota.limit}`;

      const sidebarQuotaText = document.getElementById('sidebarQuotaText');
      const sidebarQuotaBar = document.getElementById('sidebarQuotaBar');
      const dashboardQuotaBar = document.getElementById('dashboardQuotaBar');
      const numericLimit = Number(quota.limit) || 50;
      const usedPct = Math.max(0, Math.min(100, (quota.used / numericLimit) * 100));
      const remPct = Math.max(0, Math.min(100, (quota.remaining / numericLimit) * 100));

      if (sidebarQuotaText) sidebarQuotaText.textContent = `${quota.used}/${quota.limit}`;
      if (sidebarQuotaBar) {
        sidebarQuotaBar.style.width = `${usedPct}%`;
        sidebarQuotaBar.className = usedPct >= 90 ? 'bg-red-600 h-full' : (usedPct >= 70 ? 'bg-amber-500 h-full' : 'bg-emerald-600 h-full');
      }
      if (dashboardQuotaBar) {
        dashboardQuotaBar.style.width = `${remPct}%`;
        dashboardQuotaBar.className = remPct <= 10 ? 'bg-red-600 h-full' : (remPct <= 30 ? 'bg-amber-500 h-full' : 'bg-emerald-600 h-full');
      }

      const chatQuotaTag = document.getElementById('chatQuotaTag');
      if (chatQuotaTag) chatQuotaTag.textContent = `Sisa: ${quota.remaining} Kuota`;

      // Render Recent 5 Transactions
      renderRecentTransactions(data.recent_transactions);

      // Populate Dompet & Anggaran View + Savings Goal
      renderWalletsView(data);
      updateSavingsGoalCard(data.total_balance || 0);

      // Populate Analisis Top KPIs
      renderAnalyticsSummaryKPIs(data);
    }

    await loadChartsData();
  } catch (err) {
    console.error('Error loading dashboard data:', err);
  }
}

function renderWalletsView(data) {
  const ws = data.wallet_summary || { cash: 0, bank: 0, banks: [] };
  const total = data.total_balance || 0;
  const positiveSum = Math.max(1, Math.max(0, ws.cash) + Math.max(0, ws.bank));
  const cashPct = total > 0 ? Math.round((Math.max(0, ws.cash) / positiveSum) * 100) : 0;
  const bankPct = total > 0 ? Math.max(0, 100 - cashPct) : 0;

  const elTotal = document.getElementById('walletPageTotal');
  const elCash = document.getElementById('walletPageCash');
  const elBank = document.getElementById('walletPageBank');
  const elCashShare = document.getElementById('walletCashShare');
  const elBankShare = document.getElementById('walletBankShare');
  const elSourceCount = document.getElementById('walletSourceCount');

  if (elTotal) elTotal.textContent = formatRupiah(total);
  if (elCash) elCash.textContent = formatRupiah(ws.cash || 0);
  if (elBank) elBank.textContent = formatRupiah(ws.bank || 0);
  if (elCashShare) elCashShare.textContent = `${cashPct}%`;
  if (elBankShare) elBankShare.textContent = `${bankPct}%`;

  const bankList = (ws.banks || []).filter(b => b.balance !== 0);
  if (elSourceCount) {
    const activeSources = (ws.cash > 0 ? 1 : 0) + bankList.length;
    elSourceCount.textContent = activeSources > 0 ? `${activeSources} sumber dana aktif` : 'Belum ada saldo tercatat';
  }

  const grid = document.getElementById('walletBankCardsGrid');
  if (grid) {
    if (bankList.length === 0) {
      grid.innerHTML = `
        <div class="sm:col-span-2 lg:col-span-3 bento-tile p-6 text-center text-zinc-500 dark:text-zinc-400 text-xs">
          <i class="fa-solid fa-building-columns text-2xl mb-2 opacity-30 block"></i>
          <p class="font-medium">Belum ada rincian saldo Bank/E-Wallet.</p>
          <p class="text-[11px] text-zinc-400 mt-1">Catat pemasukan dengan nama bank (misal: <i>"uang saku 500rb BCA"</i>) agar muncul di sini.</p>
        </div>
      `;
    } else {
      const maxBank = Math.max(1, ...bankList.map(b => Math.max(0, b.balance)));
      grid.innerHTML = bankList.map(b => {
        const barW = Math.min(100, Math.round((Math.max(0, b.balance) / maxBank) * 100));
        return `
          <div class="bento-tile p-4 flex flex-col justify-between gap-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-xs shrink-0">
                  <i class="fa-solid fa-building-columns" aria-hidden="true"></i>
                </div>
                <span class="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">${escapeHtml(b.name)}</span>
              </div>
              <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Bank</span>
            </div>
            <div>
              <div class="text-lg font-bold text-zinc-950 dark:text-zinc-50 tabular-nums">${formatRupiah(b.balance)}</div>
              <div class="quota-bar-track mt-2">
                <div class="bg-emerald-600 h-full" style="width: ${barW}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  const sts = data.safe_to_spend || { daily_limit: 0, remaining_days: 1 };
  const wSafe = document.getElementById('walletSafeDaily');
  const wDays = document.getElementById('walletRemainingDays');
  if (wSafe) wSafe.textContent = formatRupiah(sts.daily_limit);
  if (wDays) wDays.textContent = `Sisa ${sts.remaining_days} hari`;
}

function updateSavingsGoalCard(totalBalance) {
  const nameEl = document.getElementById('savingsGoalName');
  const amtEl = document.getElementById('savingsGoalAmountText');
  const barEl = document.getElementById('savingsGoalBar');
  const statusEl = document.getElementById('savingsGoalStatus');
  if (!nameEl || !amtEl || !barEl || !statusEl) return;

  const saved = typeof getSavedSavingsGoal === 'function' ? getSavedSavingsGoal() : null;
  if (!saved) {
    nameEl.textContent = 'Belum Ada Target';
    amtEl.textContent = 'Atur target tabungan Anda';
    barEl.style.width = '0%';
    statusEl.textContent = '0%';
    return;
  }

  const current = Math.max(0, totalBalance || 0);
  const pct = Math.min(100, Math.round((current / saved.target) * 100));
  nameEl.textContent = saved.name;
  amtEl.textContent = `${formatRupiah(current)} / ${formatRupiah(saved.target)}`;
  barEl.style.width = `${pct}%`;
  statusEl.textContent = pct >= 100 ? 'Tercapai!' : `${pct}%`;
}

function renderAnalyticsSummaryKPIs(data) {
  const netEl = document.getElementById('analyticsMonthlyNet');
  const netBadge = document.getElementById('analyticsMonthlyNetBadge');
  const dailyAvgEl = document.getElementById('analyticsDailyAvg');
  const txCountEl = document.getElementById('analyticsTxCount');

  const net = (data.monthly_income || 0) - (data.monthly_expense || 0);
  if (netEl) {
    netEl.textContent = `${net >= 0 ? '+' : '-'}${formatRupiah(Math.abs(net))}`;
    netEl.className = net >= 0
      ? 'text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1.5'
      : 'text-xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-1.5';
  }
  if (netBadge) {
    netBadge.textContent = net >= 0 ? 'Surplus' : 'Defisit';
    netBadge.className = net >= 0
      ? 'badge-emerald'
      : 'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200/70 dark:border-red-900/50';
  }

  const dayOfMonth = Math.max(1, new Date().getDate());
  const avgDaily = Math.round((data.monthly_expense || 0) / dayOfMonth);
  if (dailyAvgEl) dailyAvgEl.textContent = `${formatRupiah(avgDaily)} / hari`;
  if (txCountEl) txCountEl.textContent = `${data.transaction_count || 0} total transaksi tercatat`;
}

function updateMonthlyBudgetCard(monthlyExpense, monthlyIncome) {
  const textEl = document.getElementById('statMonthlyBudgetText');
  const barEl = document.getElementById('monthlyBudgetBar');
  const subEl = document.getElementById('statBudgetSubtext');
  const statusEl = document.getElementById('statBudgetStatus');

  const wSumEl = document.getElementById('walletBudgetSummary');
  const wBarEl = document.getElementById('walletBudgetBar');
  const wStatEl = document.getElementById('walletBudgetStatus');

  const customBudget = typeof getSavedMonthlyBudget === 'function' ? getSavedMonthlyBudget() : 0;
  const activeBudget = customBudget > 0 ? customBudget : monthlyIncome;

  if (!activeBudget || activeBudget <= 0) {
    const label = `${formatRupiah(monthlyExpense)} / Belum diatur`;
    if (textEl) textEl.textContent = label;
    if (barEl) { barEl.style.width = '0%'; barEl.className = 'bg-emerald-600 h-full'; }
    if (subEl) subEl.textContent = 'Klik "Atur" untuk menetapkan target bulanan';
    if (statusEl) { statusEl.textContent = '—'; statusEl.className = 'font-semibold text-zinc-500'; }
    if (wSumEl) wSumEl.textContent = label;
    if (wBarEl) { wBarEl.style.width = '0%'; wBarEl.className = 'bg-emerald-600 h-full'; }
    if (wStatEl) wStatEl.textContent = '—';
    return;
  }

  const pctRaw = Math.round((monthlyExpense / activeBudget) * 100);
  const pctBar = Math.min(100, pctRaw);
  const remaining = activeBudget - monthlyExpense;
  const summaryText = `${formatRupiah(monthlyExpense)} / ${formatRupiah(activeBudget)}`;

  if (textEl) textEl.textContent = summaryText;
  if (barEl) barEl.style.width = `${pctBar}%`;
  if (wSumEl) wSumEl.textContent = summaryText;
  if (wBarEl) wBarEl.style.width = `${pctBar}%`;

  if (subEl) {
    subEl.textContent = customBudget > 0
      ? (remaining >= 0 ? `Sisa anggaran: ${formatRupiah(remaining)}` : `Melebihi target ${formatRupiah(Math.abs(remaining))}`)
      : 'Acuan otomatis dari pemasukan bulan ini';
  }

  let barCls = 'bg-emerald-600 h-full';
  let statusText = `${pctRaw}% Terpakai`;
  let statusCls = 'font-semibold text-emerald-600 dark:text-emerald-400';

  if (pctRaw >= 100) {
    barCls = 'bg-red-600 h-full';
    statusText = `${pctRaw}% (Overbudget)`;
    statusCls = 'font-semibold text-red-600 dark:text-red-400';
  } else if (pctRaw >= 80) {
    barCls = 'bg-amber-500 h-full';
    statusText = `${pctRaw}% (Waspada)`;
    statusCls = 'font-semibold text-amber-600 dark:text-amber-400';
  }

  if (barEl) barEl.className = barCls;
  if (statusEl) { statusEl.textContent = statusText; statusEl.className = statusCls; }
  if (wBarEl) wBarEl.className = barCls;
  if (wStatEl) { wStatEl.textContent = statusText; wStatEl.className = `text-xs ${statusCls}`; }
}

function renderRecentTransactions(transactions) {
  const container = document.getElementById('recentTxList');
  if (!container) return;

  if (!transactions || transactions.length === 0) {
    container.innerHTML = `
      <div class="py-10 text-center text-zinc-400 text-xs">
        <i class="fa-solid fa-receipt text-2xl mb-2 opacity-30 block"></i>
        <p>Belum ada transaksi yang dicatat.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map(tx => {
    const isTransfer = tx.category_type === 'transfer' || tx.is_transfer;
    const isIncome = tx.category_type === 'income';
    const amountClass = isTransfer
      ? 'text-zinc-900 dark:text-zinc-100'
      : (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400');
    const prefix = isTransfer ? '↔ ' : (isIncome ? '+' : '-');
    const iconClass = isTransfer
      ? 'text-zinc-700 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200'
      : (isIncome
        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400'
        : 'text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400');
    const catIcon = isTransfer
      ? '<i class="fa-solid fa-arrow-right-arrow-left"></i>'
      : getCategoryIcon(tx.category_name, tx.category_type);
    const walletBadge = isTransfer
      ? `<span class="badge-emerald text-[10px]">${escapeHtml(tx.wallet_label || 'Pindah Dana')}</span>`
      : (tx.wallet_type === 'bank'
        ? `<span class="badge-mono text-[10px]">${escapeHtml(tx.wallet_label || 'Bank')}</span>`
        : `<span class="badge-neutral text-[10px]">Cash</span>`);

    return `
      <div class="py-3.5 flex items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl ${iconClass} flex items-center justify-center shrink-0 text-sm">
            ${catIcon}
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-zinc-950 dark:text-zinc-50 text-sm truncate">${escapeHtml(tx.description)}</p>
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              <span>${escapeHtml(tx.category_name)}</span>
              <span>·</span>
              <span class="tabular-nums">${tx.occurred_on}</span>
              <span>·</span>
              ${walletBadge}
            </div>
          </div>
        </div>
        <div class="text-right shrink-0">
          <p class="font-bold ${amountClass} tabular-nums text-sm">${prefix}${formatRupiah(tx.amount)}</p>
        </div>
      </div>
    `;
  }).join('');
}

async function loadChartsData() {
  try {
    const res = await api.get('/api/dashboard/charts');
    if (!res.success) return;

    cachedChartData = res.data;
    const { category_breakdown } = cachedChartData;
    const isDark = document.documentElement.classList.contains('dark');
    const palette = getCategoryPalette(isDark);

    // Update Analytics Top Category KPI & Category Ranking Bars
    const topCatEl = document.getElementById('analyticsTopCategory');
    const topAmtEl = document.getElementById('analyticsTopCategoryAmt');
    const rankListEl = document.getElementById('analyticsCategoryRankList');

    if (category_breakdown && category_breakdown.length > 0) {
      const totalExpAll = category_breakdown.reduce((sum, c) => sum + (Number(c.total) || 0), 0);
      const top = category_breakdown[0];
      const topPct = totalExpAll > 0 ? Math.round((top.total / totalExpAll) * 100) : 0;

      if (topCatEl) topCatEl.textContent = top.name;
      if (topAmtEl) topAmtEl.textContent = `${formatRupiah(top.total)} (${topPct}% dari pengeluaran)`;

      if (rankListEl) {
        rankListEl.innerHTML = category_breakdown.map(c => {
          const pct = totalExpAll > 0 ? Math.round((c.total / totalExpAll) * 100) : 0;
          const color = palette[c.name] || '#059669';
          return `
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
                  ${escapeHtml(c.name)}
                </span>
                <span class="text-zinc-600 dark:text-zinc-300 tabular-nums font-medium">
                  <b>${formatRupiah(c.total)}</b> <span class="text-zinc-400">(${pct}%)</span>
                </span>
              </div>
              <div class="quota-bar-track">
                <div class="h-full" style="width:${pct}%; background:${color};"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    } else {
      if (topCatEl) topCatEl.textContent = 'Belum ada data';
      if (topAmtEl) topAmtEl.textContent = 'Rp 0 total pengeluaran';
      if (rankListEl) rankListEl.innerHTML = '<p class="text-xs text-zinc-400">Belum ada data pengeluaran untuk diperingkat.</p>';
    }

    // 1. Doughnut Chart: Kategori Pengeluaran
    const ctxCat = document.getElementById('categoryChart')?.getContext('2d');
    const emptyPlaceholder = document.getElementById('emptyCategoryChart');
    const centerDisplay = document.getElementById('doughnutCenterText');
    const catBadge = document.getElementById('catTotalBadge');

    if (ctxCat) {
      if (!category_breakdown || category_breakdown.length === 0) {
        if (categoryChartInstance) {
          categoryChartInstance.destroy();
          categoryChartInstance = null;
        }
        document.getElementById('categoryChart').style.display = 'none';
        if (centerDisplay) centerDisplay.style.display = 'none';
        emptyPlaceholder?.classList.remove('hidden');
        if (catBadge) catBadge.textContent = '0 Kategori';
      } else {
        document.getElementById('categoryChart').style.display = 'block';
        if (centerDisplay) centerDisplay.style.display = 'flex';
        emptyPlaceholder?.classList.add('hidden');

        const labels = category_breakdown.map(c => c.name);
        const data = category_breakdown.map(c => c.total);
        const totalExp = data.reduce((a, b) => a + b, 0);
        const bgColors = labels.map(l => palette[l] || '#059669');

        if (catBadge) catBadge.textContent = `${labels.length} Kategori`;

        const centerLabel = document.getElementById('doughnutCenterLabel');
        const centerValue = document.getElementById('doughnutCenterValue');
        const centerSub = document.getElementById('doughnutCenterSub');

        const resetCenter = () => {
          if (centerLabel) { centerLabel.textContent = 'Total Pengeluaran'; centerLabel.style.color = ''; }
          if (centerValue) centerValue.textContent = formatRupiah(totalExp);
          if (centerSub) centerSub.textContent = `${labels.length} Kategori Aktif`;
        };
        resetCenter();

        if (categoryChartInstance) categoryChartInstance.destroy();

        categoryChartInstance = new Chart(ctxCat, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data,
              backgroundColor: bgColors,
              borderWidth: 3,
              borderColor: isDark ? '#121215' : '#FFFFFF',
              borderRadius: 6,
              spacing: 2,
              hoverOffset: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '74%',
            animation: { duration: 900, easing: 'easeOutQuart' },
            onHover: (event, activeElements) => {
              if (!centerLabel || !centerValue || !centerSub) return;
              if (activeElements && activeElements.length > 0) {
                const idx = activeElements[0].index;
                const catName = labels[idx];
                const catVal = data[idx];
                const pct = totalExp > 0 ? ((catVal / totalExp) * 100).toFixed(1) : 0;
                centerLabel.textContent = catName;
                centerLabel.style.color = bgColors[idx];
                centerValue.textContent = formatRupiah(catVal);
                centerSub.textContent = `${pct}% dari total`;
              } else {
                resetCenter();
              }
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: isDark ? '#A1A1AA' : '#52525B',
                  font: { family: 'Inter', size: 11, weight: '600' },
                  boxWidth: 10,
                  boxHeight: 10,
                  usePointStyle: true,
                  pointStyle: 'circle',
                  padding: 14
                }
              },
              tooltip: {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                titleColor: isDark ? '#FAFAFA' : '#09090B',
                bodyColor: isDark ? '#D4D4D8' : '#3F3F46',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(24,24,27,0.1)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 12,
                callbacks: {
                  label: (context) => {
                    const val = context.parsed;
                    const pct = totalExp > 0 ? ((val / totalExp) * 100).toFixed(1) : 0;
                    return ` ${context.label}: ${formatRupiah(val)} (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }
    }

    // 2. Render Trend Line Chart
    renderTrendChart();
  } catch (err) {
    console.error('Error loading chart data:', err);
  }
}

function setTrendPeriod(period) {
  currentTrendPeriod = period;

  const btn7d = document.getElementById('btnTrend7d');
  const btn30d = document.getElementById('btnTrend30d');
  const btnMonthly = document.getElementById('btnTrendMonthly');
  const titleEl = document.getElementById('trendChartTitle');
  const subEl = document.getElementById('trendChartSubtitle');

  if (btn7d) btn7d.className = period === '7d' ? 'active' : '';
  if (btn30d) btn30d.className = period === '30d' ? 'active' : '';
  if (btnMonthly) btnMonthly.className = period === 'monthly' ? 'active' : '';

  if (period === '7d') {
    if (titleEl) titleEl.textContent = 'Tren Harian (7 Hari Terakhir)';
    if (subEl) subEl.textContent = 'Pemasukan vs Pengeluaran 7 hari ke belakang';
  } else if (period === '30d') {
    if (titleEl) titleEl.textContent = 'Tren Harian (30 Hari Terakhir)';
    if (subEl) subEl.textContent = 'Aktivitas pemasukan vs pengeluaran sebulan terakhir';
  } else {
    if (titleEl) titleEl.textContent = 'Tren Bulanan';
    if (subEl) subEl.textContent = 'Pemasukan vs Pengeluaran 6 bulan terakhir';
  }

  renderTrendChart();
}

function renderTrendChart() {
  if (!cachedChartData) return;
  const canvas = document.getElementById('trendChart');
  const ctxTrend = canvas?.getContext('2d');
  if (!ctxTrend) return;

  let trendDataset = [];
  if (currentTrendPeriod === '7d') {
    trendDataset = cachedChartData.daily_trend_7d || [];
  } else if (currentTrendPeriod === '30d') {
    trendDataset = cachedChartData.daily_trend_30d || [];
  } else {
    trendDataset = cachedChartData.monthly_trend || [];
  }

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#A1A1AA' : '#71717A';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(24, 24, 27, 0.05)';

  const labels = trendDataset.map(d => d.label || d.month);
  const incomeData = trendDataset.map(d => d.income);
  const expenseData = trendDataset.map(d => d.expense);

  const totalInc = incomeData.reduce((a, b) => a + b, 0);
  const totalExp = expenseData.reduce((a, b) => a + b, 0);
  const emptyTrendPlaceholder = document.getElementById('emptyTrendChart');

  if (totalInc === 0 && totalExp === 0) {
    if (trendChartInstance) {
      trendChartInstance.destroy();
      trendChartInstance = null;
    }
    canvas.style.display = 'none';
    if (emptyTrendPlaceholder) emptyTrendPlaceholder.classList.remove('hidden');
  } else {
    canvas.style.display = 'block';
    if (emptyTrendPlaceholder) emptyTrendPlaceholder.classList.add('hidden');
  }

  const net = totalInc - totalExp;
  const netBadge = document.getElementById('trendNetBadge');
  if (netBadge) {
    if (net >= 0) {
      netBadge.className = 'hidden sm:inline-flex badge-emerald';
      netBadge.textContent = `+${formatRupiah(net)} (Surplus)`;
    } else {
      netBadge.className = 'hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200/70 dark:border-red-900/50';
      netBadge.textContent = `-${formatRupiah(Math.abs(net))} (Defisit)`;
    }
  }

  if (totalInc === 0 && totalExp === 0) return;

  if (trendChartInstance) trendChartInstance.destroy();

  const incomeColor = isDark ? '#34D399' : '#059669';
  const expenseColor = isDark ? '#F87171' : '#DC2626';

  trendChartInstance = new Chart(ctxTrend, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: incomeData,
          borderColor: incomeColor,
          backgroundColor: (context) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return 'rgba(16, 185, 129, 0.08)';
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, isDark ? 'rgba(52, 211, 153, 0.28)' : 'rgba(5, 150, 105, 0.20)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
            return gradient;
          },
          tension: 0.4,
          fill: true,
          borderWidth: 2.5,
          pointRadius: currentTrendPeriod === '30d' ? 2 : 4,
          pointBackgroundColor: isDark ? '#121215' : '#FFFFFF',
          pointBorderColor: incomeColor,
          pointBorderWidth: 2,
          pointHoverRadius: 6
        },
        {
          label: 'Pengeluaran',
          data: expenseData,
          borderColor: expenseColor,
          backgroundColor: (context) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return 'rgba(220, 38, 38, 0.06)';
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, isDark ? 'rgba(248, 113, 113, 0.24)' : 'rgba(220, 38, 38, 0.16)');
            gradient.addColorStop(1, 'rgba(220, 38, 38, 0.00)');
            return gradient;
          },
          tension: 0.4,
          fill: true,
          borderWidth: 2.5,
          pointRadius: currentTrendPeriod === '30d' ? 2 : 4,
          pointBackgroundColor: isDark ? '#121215' : '#FFFFFF',
          pointBorderColor: expenseColor,
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 11, weight: '600' },
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#18181B' : '#FFFFFF',
          titleColor: isDark ? '#FAFAFA' : '#09090B',
          bodyColor: isDark ? '#D4D4D8' : '#3F3F46',
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(24,24,27,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          callbacks: {
            label: (context) => ` ${context.dataset.label}: ${formatRupiah(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { family: 'Inter', size: currentTrendPeriod === '30d' ? 9 : 11, weight: '500' },
            maxRotation: currentTrendPeriod === '30d' ? 45 : 0
          }
        },
        y: {
          grid: { color: gridColor },
          border: { display: false },
          ticks: {
            color: textColor,
            font: { family: 'Inter', size: 10, weight: '500' },
            callback: (value) => {
              if (value >= 1000000) return `${value / 1000000} jt`;
              if (value >= 1000) return `${value / 1000} rb`;
              return value;
            }
          }
        }
      }
    }
  });
  trendChartInstance._isDark = isDark;
}
