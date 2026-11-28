// Dashboard & Chart.js Management (F-06, F-07)
// Supports Category Breakdown & Multi-period Financial Trend (Harian 7 Hari, 30 Hari, Bulanan)

let categoryChartInstance = null;
let trendChartInstance = null;
let cachedChartData = null;
let currentTrendPeriod = '7d'; // '7d', '30d', or 'monthly'

const CATEGORY_COLORS = {
  'Makan': '#D02020',                // Bauhaus Primary Red
  'Transportasi': '#1040C0',         // Bauhaus Primary Ultramarine Blue
  'Belanja': '#F0C020',              // Bauhaus Primary Chrome Yellow
  'Tagihan': '#121212',              // Bauhaus Charcoal Ink
  'Hiburan': '#E11D48',              // Crimson Accent
  'Kesehatan': '#059669',            // Constructivist Green
  'Pendidikan': '#2563EB',           // Cobalt Blue
  'Lain-lain pengeluaran': '#64748B' // Architecture Gray
};

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

      // Update Top Stat Cards & Cash/Bank Breakdown
      const balanceEl = document.getElementById('statTotalBalance');
      balanceEl.textContent = formatRupiah(data.total_balance);
      if (data.total_balance < 0) {
        balanceEl.className = 'text-3xl sm:text-4xl font-extrabold text-expense dark:text-expense-light tabular-nums';
      } else {
        balanceEl.className = 'text-3xl sm:text-4xl font-extrabold text-ink dark:text-nighttext tabular-nums';
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
            `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 dark:bg-brand-950/40 text-bauhaus-blue dark:text-bauhaus-yellow border border-bauhaus-blue/25 dark:border-bauhaus-yellow/30 font-bold tabular-nums">${escapeHtml(b.name)}: ${formatRupiah(b.balance)}</span>`
          ).join('');
        } else {
          bankDetailsEl.classList.add('hidden');
          bankDetailsEl.innerHTML = '';
        }
      }

      document.getElementById('statMonthlyIncome').textContent = formatRupiah(data.monthly_income);
      document.getElementById('statMonthlyExpense').textContent = formatRupiah(data.monthly_expense);
      window.lastMonthlyExpense = data.monthly_expense || 0;
      window.lastMonthlyIncome = data.monthly_income || 0;

      // Update Safe-to-Spend Daily Card
      const sts = data.safe_to_spend || { daily_limit: 0, spent_today: 0, remaining_days: 1 };
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
          safeBarEl.className = 'bg-slate-400 h-full transition-all duration-300';
          safeStatusEl.textContent = 'Saldo Kosong';
          safeStatusEl.className = 'font-bold text-slate-500';
        } else {
          const pct = Math.min(100, Math.round((sts.spent_today / sts.daily_limit) * 100));
          safeBarEl.style.width = `${pct}%`;
          if (sts.spent_today > sts.daily_limit) {
            safeBarEl.className = 'bg-bauhaus-red h-full transition-all duration-300';
            safeStatusEl.textContent = 'Melebihi Batas Harian';
            safeStatusEl.className = 'font-bold text-bauhaus-red dark:text-red-400';
          } else if (pct >= 75) {
            safeBarEl.className = 'bg-bauhaus-yellow h-full transition-all duration-300';
            safeStatusEl.textContent = 'Mendekati Batas';
            safeStatusEl.className = 'font-bold text-amber-600 dark:text-bauhaus-yellow';
          } else {
            safeBarEl.className = 'bg-emerald-600 h-full transition-all duration-300';
            safeStatusEl.textContent = 'Aman';
            safeStatusEl.className = 'font-bold text-emerald-600 dark:text-emerald-400';
          }
        }
      }

      // Update Monthly Budget Limit Card
      updateMonthlyBudgetCard(data.monthly_expense || 0, data.monthly_income || 0);

      // Quota Counter
      const quota = data.chat_quota;
      const quotaText = `${quota.remaining} / ${quota.limit}`;
      document.getElementById('statQuotaCount').textContent = quotaText;

      // Update Sidebar & Dashboard Quota Bars
      const sidebarQuotaText = document.getElementById('sidebarQuotaText');
      const sidebarQuotaBar = document.getElementById('sidebarQuotaBar');
      const dashboardQuotaBar = document.getElementById('dashboardQuotaBar');
      const numericLimit = Number(quota.limit) || 50;
      const usedPct = Math.max(0, Math.min(100, (quota.used / numericLimit) * 100));
      const remPct = Math.max(0, Math.min(100, (quota.remaining / numericLimit) * 100));

      if (sidebarQuotaText) sidebarQuotaText.textContent = `${quota.used}/${quota.limit}`;
      if (sidebarQuotaBar) {
        sidebarQuotaBar.style.width = `${usedPct}%`;
        if (usedPct >= 90) {
          sidebarQuotaBar.className = 'bg-bauhaus-red h-full transition-all duration-300';
        } else if (usedPct >= 70) {
          sidebarQuotaBar.className = 'bg-bauhaus-yellow h-full transition-all duration-300';
        } else {
          sidebarQuotaBar.className = 'bg-bauhaus-blue h-full transition-all duration-300';
        }
      }
      if (dashboardQuotaBar) {
        dashboardQuotaBar.style.width = `${remPct}%`;
        if (remPct <= 10) {
          dashboardQuotaBar.className = 'bg-bauhaus-red h-full transition-all duration-300';
        } else if (remPct <= 30) {
          dashboardQuotaBar.className = 'bg-bauhaus-yellow h-full transition-all duration-300';
        } else {
          dashboardQuotaBar.className = 'bg-bauhaus-blue h-full transition-all duration-300';
        }
      }

      // Update Chat Tag
      const chatQuotaTag = document.getElementById('chatQuotaTag');
      if (chatQuotaTag) chatQuotaTag.textContent = `Sisa: ${quota.remaining} Kuota`;

      // Render Recent 5 Transactions
      renderRecentTransactions(data.recent_transactions);
    }

    // Load and render Chart.js graphs (F-07)
    await loadChartsData();

  } catch (err) {
    console.error('Error loading dashboard data:', err);
  }
}

function updateMonthlyBudgetCard(monthlyExpense, monthlyIncome) {
  const textEl = document.getElementById('statMonthlyBudgetText');
  const barEl = document.getElementById('monthlyBudgetBar');
  const subEl = document.getElementById('statBudgetSubtext');
  const statusEl = document.getElementById('statBudgetStatus');
  if (!textEl || !barEl || !statusEl) return;

  const customBudget = typeof getSavedMonthlyBudget === 'function' ? getSavedMonthlyBudget() : 0;
  const activeBudget = customBudget > 0 ? customBudget : monthlyIncome;

  if (!activeBudget || activeBudget <= 0) {
    textEl.textContent = `${formatRupiah(monthlyExpense)} / Belum diatur`;
    barEl.style.width = '0%';
    barEl.className = 'bg-bauhaus-blue h-full transition-all duration-300';
    if (subEl) subEl.textContent = 'Klik "Atur Batas" untuk menetapkan target bulanan';
    statusEl.textContent = '—';
    statusEl.className = 'font-bold text-slate-500';
    return;
  }

  const pctRaw = Math.round((monthlyExpense / activeBudget) * 100);
  const pctBar = Math.min(100, pctRaw);
  const remaining = activeBudget - monthlyExpense;

  textEl.textContent = `${formatRupiah(monthlyExpense)} / ${formatRupiah(activeBudget)}`;
  barEl.style.width = `${pctBar}%`;

  if (subEl) {
    subEl.textContent = customBudget > 0
      ? (remaining >= 0 ? `Sisa anggaran: ${formatRupiah(remaining)}` : `Melebihi target ${formatRupiah(Math.abs(remaining))}`)
      : `Acuan otomatis dari pemasukan bulan ini`;
  }

  if (pctRaw >= 100) {
    barEl.className = 'bg-bauhaus-red h-full transition-all duration-300';
    statusEl.textContent = `${pctRaw}% (Overbudget)`;
    statusEl.className = 'font-bold text-bauhaus-red dark:text-red-400';
  } else if (pctRaw >= 80) {
    barEl.className = 'bg-bauhaus-yellow h-full transition-all duration-300';
    statusEl.textContent = `${pctRaw}% (Waspada)`;
    statusEl.className = 'font-bold text-amber-600 dark:text-bauhaus-yellow';
  } else {
    barEl.className = 'bg-bauhaus-blue h-full transition-all duration-300';
    statusEl.textContent = `${pctRaw}% Terpakai`;
    statusEl.className = 'font-bold text-bauhaus-blue dark:text-bauhaus-yellow';
  }
}

function renderRecentTransactions(transactions) {
  const container = document.getElementById('recentTxList');
  if (!container) return;

  if (!transactions || transactions.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center text-ink/40 dark:text-nighttext/40 text-xs font-sans">
        <i class="fa-solid fa-receipt text-2xl mb-2 opacity-40"></i>
        <p>Belum ada transaksi yang dicatat.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map(tx => {
    const isTransfer = tx.category_type === 'transfer' || tx.is_transfer;
    const isIncome = tx.category_type === 'income';
    const amountClass = isTransfer
      ? 'text-bauhaus-blue dark:text-bauhaus-yellow'
      : (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400');
    const prefix = isTransfer ? '↔ ' : (isIncome ? '+' : '-');
    const iconClass = isTransfer
      ? 'text-bauhaus-blue bg-brand-50 dark:bg-brand-950/40 dark:text-bauhaus-yellow'
      : (isIncome
        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
        : 'text-red-500 bg-red-50 dark:bg-red-950/40');
    const catIcon = isTransfer
      ? '<i class="fa-solid fa-arrow-right-arrow-left"></i>'
      : getCategoryIcon(tx.category_name, tx.category_type);
    const walletBadge = isTransfer
      ? `<span class="badge-accent text-[10px]"><i class="fa-solid fa-arrow-right-arrow-left text-[9px]"></i> ${escapeHtml(tx.wallet_label || 'Pindah Dana')}</span>`
      : (tx.wallet_type === 'bank'
        ? `<span class="badge-dirt text-[10px]"><i class="fa-solid fa-building-columns text-[9px]"></i> ${escapeHtml(tx.wallet_label || 'Bank')}</span>`
        : `<span class="badge-sand text-[10px]"><i class="fa-solid fa-money-bill-wave text-[9px]"></i> Cash</span>`);

    return `
      <div class="py-3.5 flex items-center justify-between gap-2 text-xs font-sans">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-full ${iconClass} flex items-center justify-center shrink-0 text-sm">
            ${catIcon}
          </div>
          <div class="min-w-0">
            <p class="font-bold text-ink dark:text-nighttext truncate">${escapeHtml(tx.description)}</p>
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-ink/50 dark:text-nighttext/50 mt-0.5">
              <span>${escapeHtml(tx.category_name)}</span>
              <span>·</span>
              <span>${tx.occurred_on}</span>
              <span>·</span>
              ${walletBadge}
            </div>
          </div>
        </div>
        <div class="text-right shrink-0">
          <p class="font-extrabold ${amountClass} tabular-nums text-sm">${prefix}${formatRupiah(tx.amount)}</p>
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

    // 1. Doughnut Chart: Kategori Pengeluaran (Interactive AI Center & Smooth Spring Physics)
    const ctxCat = document.getElementById('categoryChart')?.getContext('2d');
    const emptyPlaceholder = document.getElementById('emptyCategoryChart');
    const centerDisplay = document.getElementById('doughnutCenterText');
    const catBadge = document.getElementById('catTotalBadge');

    if (ctxCat) {
      if (!category_breakdown || category_breakdown.length === 0) {
        if (categoryChartInstance) categoryChartInstance.destroy();
        document.getElementById('categoryChart').style.display = 'none';
        if (centerDisplay) centerDisplay.style.display = 'none';
        emptyPlaceholder.classList.remove('hidden');
      } else {
        document.getElementById('categoryChart').style.display = 'block';
        if (centerDisplay) centerDisplay.style.display = 'flex';
        emptyPlaceholder.classList.add('hidden');

        const labels = category_breakdown.map(c => c.name);
        const data = category_breakdown.map(c => c.total);
        const totalExp = data.reduce((a, b) => a + b, 0);
        const bgColors = labels.map(l => CATEGORY_COLORS[l] || '#38BDF8');

        if (catBadge) {
          catBadge.textContent = `${labels.length} Kategori`;
        }

        // Set initial center values
        const centerLabel = document.getElementById('doughnutCenterLabel');
        const centerValue = document.getElementById('doughnutCenterValue');
        const centerSub = document.getElementById('doughnutCenterSub');

        const resetCenter = () => {
          if (centerLabel) {
            centerLabel.textContent = 'Total Pengeluaran';
            centerLabel.style.color = '';
          }
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
              borderWidth: 2,
              borderColor: isDark ? '#1C1C22' : '#121212',
              borderRadius: 0,
              spacing: 3,
              hoverOffset: 12,
              hoverBorderWidth: 3,
              hoverBorderColor: isDark ? '#F0C020' : '#121212'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '74%',
            animation: {
              animateRotate: true,
              animateScale: true,
              duration: 1600,
              easing: 'easeOutQuart'
            },
            onHover: (event, activeElements) => {
              if (!centerLabel || !centerValue || !centerSub) return;
              if (activeElements && activeElements.length > 0) {
                const idx = activeElements[0].index;
                const catName = labels[idx];
                const catVal = data[idx];
                const pct = totalExp > 0 ? ((catVal / totalExp) * 100).toFixed(1) : 0;
                const color = bgColors[idx];

                centerLabel.textContent = catName;
                centerLabel.style.color = color;
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
                  color: isDark ? '#F4F1EA' : '#121212',
                  font: { family: 'Outfit', size: 11, weight: '700' },
                  boxWidth: 12,
                  boxHeight: 12,
                  borderRadius: 0,
                  useBorderRadius: true,
                  padding: 14
                }
              },
              tooltip: {
                backgroundColor: isDark ? '#1C1C22' : '#FFFFFF',
                titleColor: isDark ? '#F0C020' : '#121212',
                bodyColor: isDark ? '#F4F1EA' : '#121212',
                borderColor: isDark ? '#F0C020' : '#121212',
                borderWidth: 2,
                padding: 10,
                cornerRadius: 0,
                boxPadding: 4,
                usePointStyle: false,
                callbacks: {
                  label: function(context) {
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

    // 2. Render Trend Chart with current period
    renderTrendChart();

  } catch (err) {
    console.error('Error loading chart data:', err);
  }
}

// Switch between '7d' (7 Hari), '30d' (30 Hari), and 'monthly' (Bulanan)
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
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';

  const labels = trendDataset.map(d => d.label || d.month);
  const incomeData = trendDataset.map(d => d.income);
  const expenseData = trendDataset.map(d => d.expense);

  // Update Net Badge in Card Header
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
      netBadge.className = 'hidden sm:inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60 transition-all';
      netBadge.textContent = `+${formatRupiah(net)} (Surplus)`;
    } else {
      netBadge.className = 'hidden sm:inline-block text-[10px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-400 px-2 py-0.5 rounded-full border border-rose-200/60 dark:border-rose-800/60 transition-all';
      netBadge.textContent = `-${formatRupiah(Math.abs(net))} (Defisit)`;
    }
  }

  if (totalInc === 0 && totalExp === 0) {
    return;
  }

  // Smooth Morphing: If chart already exists in the same theme, update data dynamically for a fluid liquid transition!
  if (trendChartInstance && trendChartInstance._isDark === isDark) {
    trendChartInstance.data.labels = labels;
    trendChartInstance.data.datasets[0].data = incomeData;
    trendChartInstance.data.datasets[1].data = expenseData;
    trendChartInstance.data.datasets[0].pointRadius = currentTrendPeriod === '30d' ? 2.5 : 5;
    trendChartInstance.data.datasets[1].pointRadius = currentTrendPeriod === '30d' ? 2.5 : 5;
    trendChartInstance.options.scales.x.ticks.font.size = currentTrendPeriod === '30d' ? 9 : 10;
    trendChartInstance.options.scales.x.ticks.maxRotation = currentTrendPeriod === '30d' ? 45 : 0;
    trendChartInstance.update();
    return;
  }

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  // Linear Gradient Fill Generators for Bauhaus Look
  const incomeColor = isDark ? '#34D399' : '#059669';
  const expenseColor = isDark ? '#F87171' : '#D02020';

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
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.1)';
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, isDark ? 'rgba(52, 211, 153, 0.40)' : 'rgba(16, 185, 129, 0.32)');
            gradient.addColorStop(0.65, isDark ? 'rgba(52, 211, 153, 0.10)' : 'rgba(16, 185, 129, 0.06)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
            return gradient;
          },
          tension: 0.42,
          fill: true,
          borderWidth: 3,
          pointStyle: 'circle',
          pointRadius: currentTrendPeriod === '30d' ? 2.5 : 5,
          pointBackgroundColor: isDark ? '#0B132B' : '#ffffff',
          pointBorderColor: incomeColor,
          pointBorderWidth: 2.5,
          pointHoverRadius: 8.5,
          pointHoverBorderWidth: 3.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: incomeColor,
          pointHitRadius: 25
        },
        {
          label: 'Pengeluaran',
          data: expenseData,
          borderColor: expenseColor,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return isDark ? 'rgba(251, 113, 133, 0.12)' : 'rgba(244, 63, 94, 0.08)';
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, isDark ? 'rgba(251, 113, 133, 0.38)' : 'rgba(244, 63, 94, 0.30)');
            gradient.addColorStop(0.65, isDark ? 'rgba(251, 113, 133, 0.08)' : 'rgba(244, 63, 94, 0.05)');
            gradient.addColorStop(1, 'rgba(244, 63, 94, 0.00)');
            return gradient;
          },
          tension: 0.42,
          fill: true,
          borderWidth: 3,
          pointStyle: 'circle',
          pointRadius: currentTrendPeriod === '30d' ? 2.5 : 5,
          pointBackgroundColor: isDark ? '#0B132B' : '#ffffff',
          pointBorderColor: expenseColor,
          pointBorderWidth: 2.5,
          pointHoverRadius: 8.5,
          pointHoverBorderWidth: 3.5,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: expenseColor,
          pointHitRadius: 25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1500,
        easing: 'easeOutQuart'
      },
      animations: {
        y: {
          duration: 1200,
          easing: 'easeOutCubic'
        }
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: textColor,
            font: { family: 'Outfit', size: 11, weight: '700' },
            boxWidth: 12,
            boxHeight: 12,
            useBorderRadius: true,
            borderRadius: 0,
            padding: 14
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#1C1C22' : '#FFFFFF',
          titleColor: isDark ? '#F0C020' : '#121212',
          bodyColor: isDark ? '#F4F1EA' : '#121212',
          borderColor: isDark ? '#F0C020' : '#121212',
          borderWidth: 2,
          padding: 10,
          cornerRadius: 0,
          boxPadding: 4,
          usePointStyle: false,
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${formatRupiah(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Outfit', size: currentTrendPeriod === '30d' ? 9 : 10, weight: '600' },
            maxRotation: currentTrendPeriod === '30d' ? 45 : 0
          }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Outfit', size: 10, weight: '600' },
            callback: function(value) {
              if (value >= 1000000) return (value / 1000000) + ' jt';
              if (value >= 1000) return (value / 1000) + ' rb';
              return value;
            }
          }
        }
      }
    }
  });
  trendChartInstance._isDark = isDark;
}
