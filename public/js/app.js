// Main App Controller for SakuKampus UMY

let currentUser = null;
let currentView = 'dashboard';
let currentAddType = 'expense';

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initModalListeners();
  initCurrencyInputs();
  syncMaxDateInputs();

  // Deep-link routing support (5-menu architecture)
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const routeMap = {
    '/chat': 'chat',
    '/wallets': 'wallets',
    '/dompet': 'wallets',
    '/analytics': 'analytics',
    '/analisis': 'analytics',
    '/history': 'history',
    '/transactions': 'history',
    '/dashboard': 'dashboard'
  };
  const initialView = routeMap[path] || 'dashboard';
  if (initialView !== 'dashboard') {
    switchView(initialView);
  }

  await checkAuth();
  await loadCategories();
  await loadDashboardData();
  await loadTransactions();
});

// ─── Real-Time Rupiah Currency Input Helpers (Auto-dot thousand separators) ───
function formatRupiahInputNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseRupiahInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function setCurrencyInputValue(inputOrId, amount) {
  const el = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
  if (!el) return;
  const num = Number(amount);
  el.value = Number.isFinite(num) && num > 0 ? formatRupiahInputNumber(Math.round(num)) : '';
}

function initCurrencyInputs() {
  const placeCaretByDigitCount = (el, digitCount) => {
    if (document.activeElement !== el || typeof el.setSelectionRange !== 'function') return;
    const val = el.value;
    let pos = 0;
    let seen = 0;
    while (pos < val.length && seen < digitCount) {
      if (/\d/.test(val[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  };

  document.querySelectorAll('input[data-currency-input="true"]').forEach((el) => {
    if (el.dataset.currencyBound === '1') return;
    el.dataset.currencyBound = '1';

    el.addEventListener('keydown', (e) => {
      const selStart = el.selectionStart;
      const selEnd = el.selectionEnd;
      if (selStart === null || selStart !== selEnd) return;

      // Backspace right after a thousand-separator dot: delete the digit before the dot
      if (e.key === 'Backspace' && selStart > 1 && el.value[selStart - 1] === '.') {
        e.preventDefault();
        const raw = el.value;
        const digitsBefore = raw.slice(0, selStart - 2).replace(/\D/g, '').length;
        el.value = formatRupiahInputNumber(raw.slice(0, selStart - 2) + raw.slice(selStart));
        placeCaretByDigitCount(el, digitsBefore);
        return;
      }

      // Delete right before a thousand-separator dot: delete the digit after the dot
      if (e.key === 'Delete' && el.value[selStart] === '.' && selStart + 1 < el.value.length) {
        e.preventDefault();
        const raw = el.value;
        const digitsBefore = raw.slice(0, selStart).replace(/\D/g, '').length;
        el.value = formatRupiahInputNumber(raw.slice(0, selStart) + raw.slice(selStart + 2));
        placeCaretByDigitCount(el, digitsBefore);
      }
    });

    el.addEventListener('input', () => {
      const raw = el.value;
      const selStart = el.selectionStart ?? raw.length;
      const rawBeforeCursor = raw.slice(0, selStart);
      const digitsBeforeRaw = rawBeforeCursor.replace(/\D/g, '');
      const formatted = formatRupiahInputNumber(raw);

      // Adjust digit count if leading zeros were stripped
      const totalRawDigits = raw.replace(/\D/g, '');
      const strippedLeadingZeros = totalRawDigits.length - totalRawDigits.replace(/^0+/, '').length;
      const targetDigitsBefore = Math.max(0, digitsBeforeRaw.length - Math.min(digitsBeforeRaw.length, strippedLeadingZeros));

      el.value = formatted;
      placeCaretByDigitCount(el, targetDigitsBefore);
    });

    el.addEventListener('blur', () => {
      el.value = formatRupiahInputNumber(el.value);
    });
  });
}

// Minimalist Apple-Style Toast Notification System
function showToast(message, type = 'success', customTitle = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const configMap = {
    success: {
      title: customTitle || 'Berhasil',
      iconBg: 'bg-emerald-600 text-white',
      icon: 'fa-check',
      barColor: 'bg-emerald-600'
    },
    error: {
      title: customTitle || 'Gagal',
      iconBg: 'bg-red-600 text-white',
      icon: 'fa-xmark',
      barColor: 'bg-red-600'
    },
    warning: {
      title: customTitle || 'Perhatian',
      iconBg: 'bg-amber-500 text-white',
      icon: 'fa-exclamation',
      barColor: 'bg-amber-500'
    },
    info: {
      title: customTitle || 'Informasi',
      iconBg: 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900',
      icon: 'fa-info',
      barColor: 'bg-zinc-900 dark:bg-zinc-100'
    }
  };
  const cfg = configMap[type] || configMap.info;

  const id = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const div = document.createElement('div');
  div.id = id;
  div.setAttribute('role', 'alert');
  div.className = 'toast-item pointer-events-auto relative overflow-hidden bg-white/95 dark:bg-[#16161A]/95 backdrop-blur-md text-zinc-900 dark:text-zinc-100';

  div.innerHTML = `
    <div class="p-3.5 pr-3 flex items-start gap-3">
      <div class="w-7 h-7 rounded-xl ${cfg.iconBg} flex items-center justify-center shrink-0 mt-0.5 text-xs">
        <i class="fa-solid ${cfg.icon}" aria-hidden="true"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-semibold text-zinc-950 dark:text-zinc-50 leading-tight">${escapeHtml(cfg.title)}</p>
        <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">${escapeHtml(message)}</p>
      </div>
      <button type="button" onclick="dismissToast('${id}')" class="w-6 h-6 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white shrink-0 transition" aria-label="Tutup notifikasi">
        <i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i>
      </button>
    </div>
    <div class="h-[3px] w-full bg-zinc-100 dark:bg-zinc-800">
      <div class="toast-progress h-full ${cfg.barColor}"></div>
    </div>
  `;

  container.appendChild(div);
  setTimeout(() => dismissToast(id), 3800);
}

function dismissToast(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('toast-exit');
  setTimeout(() => el.remove(), 220);
}

// View Navigation Switcher (5-Menu Architecture — Catat as Main Core)
function switchView(viewName) {
  const views = ['dashboard', 'wallets', 'chat', 'analytics', 'history'];
  if (!views.includes(viewName)) viewName = 'dashboard';
  currentView = viewName;

  try {
    const targetPath = viewName === 'dashboard' ? '/' : `/${viewName}`;
    if (window.location.protocol.startsWith('http') && window.location.pathname !== targetPath) {
      window.history.replaceState(null, '', targetPath);
    }
  } catch {
    // Ignore history API errors in restricted contexts
  }

  closeMobileMenu();

  // Desktop-only Floating Chat FAB: toggle dedicated class (NEVER removes mobile hiding!)
  const floatingChat = document.getElementById('floatingChatContainer');
  if (floatingChat) {
    floatingChat.classList.toggle('is-hidden-on-chat', viewName === 'chat');
  }

  const titles = {
    dashboard: { title: 'Dashboard', sub: 'Ringkasan saldo & aktivitas keuangan' },
    wallets:   { title: 'Dompet & Anggaran', sub: 'Cash, rekening bank, pindah dana & target tabungan' },
    chat:      { title: 'Catat Transaksi', sub: 'Asisten AI pencatat keuangan via chat & suara' },
    analytics: { title: 'Analisis & Laporan', sub: 'Grafik kategori, tren keuangan & ekspor laporan' },
    history:   { title: 'Riwayat Transaksi', sub: 'Pencarian, filter & manajemen transaksi' }
  };

  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const navBtn = document.getElementById(`nav-${v}`);
    const mobileNavBtn = document.getElementById(`mobile-nav-${v}`);

    if (el) {
      el.classList.toggle('hidden', v !== viewName);
    }

    // Desktop sidebar styles
    if (navBtn) {
      if (v === 'chat') {
        navBtn.classList.toggle('nav-core-active', v === viewName);
      } else {
        navBtn.classList.toggle('nav-active', v === viewName);
      }
    }

    // Mobile 5-tab dock styles (Center Catat stays elevated Emerald Main Core)
    if (mobileNavBtn) {
      if (v === 'chat') {
        const orb = document.getElementById('mobileNavChatOrb');
        if (orb) {
          orb.classList.toggle('scale-105', v === viewName);
          orb.classList.toggle('bg-emerald-700', v === viewName);
          orb.classList.toggle('bg-emerald-600', v !== viewName);
        }
      } else if (v === viewName) {
        mobileNavBtn.className = 'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-zinc-950 dark:text-white font-semibold transition';
      } else {
        mobileNavBtn.className = 'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-zinc-400 dark:text-zinc-500 font-medium transition';
      }
    }
  });

  if (titles[viewName]) {
    document.getElementById('topbarTitle').textContent = titles[viewName].title;
    document.getElementById('topbarSubtitle').textContent = titles[viewName].sub;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewName === 'dashboard' || viewName === 'wallets') {
    loadDashboardData();
  } else if (viewName === 'analytics') {
    // Re-render charts after container becomes visible so canvas dimensions are exact
    requestAnimationFrame(() => loadChartsData());
  } else if (viewName === 'history') {
    loadTransactions();
  }
}

// Quick jump from Dashboard Bento tile directly into Main Core Catat
function quickLaunchChat(promptText) {
  switchView('chat');
  const input = document.getElementById('chatInputText');
  if (input && promptText) {
    input.value = promptText;
    setTimeout(() => input.focus(), 120);
  }
}

// Global modal backdrop & escape key handling
function initModalListeners() {
  const modals = ['editModal', 'deleteModal', 'addModal', 'logoutModal', 'transferModal', 'budgetModal', 'savingsModal'];
  modals.forEach(modalId => {
    const modalEl = document.getElementById(modalId);
    if (modalEl) {
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) {
          if (modalId === 'editModal') closeEditModal();
          if (modalId === 'deleteModal') closeDeleteModal();
          if (modalId === 'addModal') closeAddModal();
          if (modalId === 'logoutModal') closeLogoutModal();
          if (modalId === 'transferModal') closeTransferModal();
          if (modalId === 'budgetModal') closeBudgetModal();
          if (modalId === 'savingsModal') closeSavingsModal();
        }
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      closeDeleteModal();
      closeAddModal();
      closeLogoutModal();
      closeTransferModal();
      closeBudgetModal();
      closeSavingsModal();
      closeFloatingChat();
      closeMobileMenu();
    }
  });
}

// Lock future dates on all transaction & history date pickers (max = local today)
function syncMaxDateInputs() {
  const today = getLocalTodayDateStr();
  const dateIds = ['addDate', 'editDate', 'transferDate', 'filterStartDate', 'filterEndDate'];
  dateIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.max = today;
  });
}

// MANUAL ADD TRANSACTION MODAL
function openAddModal() {
  const addModal = document.getElementById('addModal');
  const dateInput = document.getElementById('addDate');
  const walletSelect = document.getElementById('addWalletType');
  const bankSelect = document.getElementById('addBankName');
  syncMaxDateInputs();
  if (dateInput) {
    dateInput.value = getLocalTodayDateStr();
  }
  if (walletSelect) walletSelect.value = 'cash';
  if (bankSelect) bankSelect.value = '';
  toggleAddBankField();

  // Smart default: if user has 0 balance, default to Pemasukan so they can add funds easily
  const wb = window.currentWalletBalances || { total: 0, cash: 0, bank: 0 };
  setAddType(wb.total <= 0 ? 'income' : 'expense');

  if (addModal) addModal.classList.remove('hidden');
}

function closeAddModal() {
  const addModal = document.getElementById('addModal');
  if (addModal) addModal.classList.add('hidden');
}

function toggleAddBankField() {
  const walletType = document.getElementById('addWalletType')?.value || 'cash';
  const wrap = document.getElementById('addBankNameWrap');
  if (wrap) {
    if (walletType === 'bank') {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }
  updateAddBalanceHint();
}

function updateAddBalanceHint() {
  const notice = document.getElementById('addBalanceNotice');
  if (!notice) return;
  const wb = window.currentWalletBalances || { total: 0, cash: 0, bank: 0 };
  const walletType = document.getElementById('addWalletType')?.value || 'cash';

  if (currentAddType === 'expense') {
    if (wb.total <= 0) {
      notice.className = 'p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-medium';
      notice.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> Saldo Anda saat ini <b>Rp 0</b>. Catat <b>Pemasukan</b> terlebih dahulu sebelum mencatat pengeluaran.`;
      return;
    }
    const available = walletType === 'bank' ? wb.bank : wb.cash;
    const label = walletType === 'bank' ? 'Bank' : 'Cash';
    if (available <= 0) {
      notice.className = 'p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-medium';
      notice.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Saldo <b>${label}</b> Anda Rp 0 (Cash: ${formatRupiah(wb.cash)} · Bank: ${formatRupiah(wb.bank)}). Pilih sumber dana yang memiliki saldo.`;
      return;
    }
    notice.className = 'p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 text-xs';
    notice.innerHTML = `Saldo <b>${label}</b> tersedia: <b class="tabular-nums text-zinc-950 dark:text-zinc-50">${formatRupiah(available)}</b>`;
  } else {
    notice.className = 'hidden';
  }
}

function setAddType(type) {
  currentAddType = type;
  const btnExp = document.getElementById('btnAddTypeExpense');
  const btnInc = document.getElementById('btnAddTypeIncome');

  if (type === 'expense') {
    if (btnExp) btnExp.className = 'flex-1 py-2 text-xs font-semibold active text-red-600 dark:text-red-400';
    if (btnInc) btnInc.className = 'flex-1 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400';
  } else {
    if (btnInc) btnInc.className = 'flex-1 py-2 text-xs font-semibold active text-emerald-600 dark:text-emerald-400';
    if (btnExp) btnExp.className = 'flex-1 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400';
  }

  // Populate categories according to selected type
  const select = document.getElementById('addCategory');
  if (select && allCategories) {
    const filtered = allCategories.filter(c => c.type === type);
    select.innerHTML = filtered.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
  updateAddBalanceHint();
}

async function handleSaveAdd(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn && submitBtn.disabled) return;

  const amount = parseRupiahInput(document.getElementById('addAmount').value);
  const category_id = document.getElementById('addCategory').value;
  const description = document.getElementById('addDesc').value;
  const occurred_on = document.getElementById('addDate').value;
  const wallet_type = document.getElementById('addWalletType')?.value || 'cash';
  const bank_name = wallet_type === 'bank' ? (document.getElementById('addBankName')?.value || '') : '';

  if (!Number.isFinite(amount) || amount < 100 || amount > 100000000) {
    showToast('Nominal transaksi harus antara Rp 100 dan Rp 100.000.000.', 'warning', 'Nominal Tidak Valid');
    return;
  }
  if (occurred_on && occurred_on > getLocalTodayDateStr()) {
    showToast('Tanggal transaksi tidak boleh melebihi hari ini.', 'warning', 'Tanggal Tidak Valid');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  }

  try {
    const res = await api.post('/api/transactions', {
      amount,
      category_id,
      description,
      occurred_on,
      wallet_type,
      bank_name
    });

    if (res.success) {
      closeAddModal();
      document.getElementById('addForm').reset();
      showToast('Transaksi berhasil ditambahkan!', 'success');
      loadDashboardData();
      loadTransactions();
    } else {
      showToast(res.error || 'Gagal menyimpan transaksi.', 'warning', 'Tidak Dapat Disimpan');
    }
  } catch (err) {
    showToast('Terjadi kesalahan saat menyimpan transaksi.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  }
}

// TRANSFER / PINDAH DANA MODAL (Cash <-> Bank / Bank <-> Bank)
function openTransferModal() {
  const modal = document.getElementById('transferModal');
  const dateInput = document.getElementById('transferDate');
  syncMaxDateInputs();
  if (dateInput) {
    dateInput.value = getLocalTodayDateStr();
  }
  const wb = window.currentWalletBalances || { cash: 0, bank: 0 };
  const fromEl = document.getElementById('transferFromWallet');
  const toEl = document.getElementById('transferToWallet');
  if (fromEl && toEl) {
    // Smart default: pull from whichever wallet has funds
    if (wb.bank > 0) {
      fromEl.value = 'bank';
      toEl.value = 'cash';
    } else {
      fromEl.value = 'cash';
      toEl.value = 'bank';
    }
  }
  toggleTransferBankFields();
  if (modal) modal.classList.remove('hidden');
}

function closeTransferModal() {
  const modal = document.getElementById('transferModal');
  if (modal) modal.classList.add('hidden');
}

function toggleTransferBankFields() {
  const fromType = document.getElementById('transferFromWallet')?.value || 'bank';
  const toType = document.getElementById('transferToWallet')?.value || 'cash';
  const fromWrap = document.getElementById('transferFromBankWrap');
  const toWrap = document.getElementById('transferToBankWrap');

  if (fromWrap) fromWrap.classList.toggle('hidden', fromType !== 'bank');
  if (toWrap) toWrap.classList.toggle('hidden', toType !== 'bank');
  updateTransferBalanceHint();
}

function updateTransferBalanceHint() {
  const hint = document.getElementById('transferBalanceHint');
  if (!hint) return;
  const wb = window.currentWalletBalances || { cash: 0, bank: 0, banks: [] };
  const fromType = document.getElementById('transferFromWallet')?.value || 'bank';
  const fromBank = document.getElementById('transferFromBank')?.value || '';

  if (fromType === 'cash') {
    hint.innerHTML = `Saldo <b>Cash</b> tersedia: <b class="tabular-nums text-slate-900 dark:text-slate-100">${formatRupiah(wb.cash)}</b>`;
  } else if (fromBank) {
    const found = (wb.banks || []).find(b => b.name === fromBank);
    const bal = found ? found.balance : 0;
    hint.innerHTML = `Saldo <b>Bank (${escapeHtml(fromBank)})</b> tersedia: <b class="tabular-nums text-slate-900 dark:text-slate-100">${formatRupiah(bal)}</b> · Total Bank: ${formatRupiah(wb.bank)}`;
  } else {
    hint.innerHTML = `Saldo <b>Bank</b> tersedia: <b class="tabular-nums text-slate-900 dark:text-slate-100">${formatRupiah(wb.bank)}</b>`;
  }
}

async function handleSaveTransfer(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn && submitBtn.disabled) return;

  const from_wallet_type = document.getElementById('transferFromWallet')?.value || 'bank';
  const from_bank_name = from_wallet_type === 'bank' ? (document.getElementById('transferFromBank')?.value || '') : '';
  const to_wallet_type = document.getElementById('transferToWallet')?.value || 'cash';
  const to_bank_name = to_wallet_type === 'bank' ? (document.getElementById('transferToBank')?.value || '') : '';
  const amount = parseRupiahInput(document.getElementById('transferAmount')?.value);
  const description = document.getElementById('transferDesc')?.value || '';
  const occurred_on = document.getElementById('transferDate')?.value;

  if (!Number.isFinite(amount) || amount < 100 || amount > 100000000) {
    showToast('Nominal pindah dana harus antara Rp 100 dan Rp 100.000.000.', 'warning', 'Nominal Tidak Valid');
    return;
  }
  if (occurred_on && occurred_on > getLocalTodayDateStr()) {
    showToast('Tanggal pindah dana tidak boleh melebihi hari ini.', 'warning', 'Tanggal Tidak Valid');
    return;
  }

  if (from_wallet_type === to_wallet_type && from_bank_name === to_bank_name) {
    showToast('Sumber dana asal dan tujuan tidak boleh sama.', 'warning', 'Periksa Tujuan');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  }

  try {
    const res = await api.post('/api/transactions/transfer', {
      amount,
      from_wallet_type,
      from_bank_name,
      to_wallet_type,
      to_bank_name,
      description,
      occurred_on
    });

    if (res.success) {
      closeTransferModal();
      document.getElementById('transferForm').reset();
      showToast(res.message || 'Pindah dana berhasil!', 'success', 'Pindah Dana');
      loadDashboardData();
      loadTransactions();
    } else {
      showToast(res.error || 'Gagal memindahkan dana.', 'warning', 'Saldo Tidak Cukup');
    }
  } catch (err) {
    showToast('Terjadi kesalahan saat memproses pindah dana.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  }
}

// MONTHLY BUDGET TARGET MODAL
function getBudgetStorageKey() {
  const email = currentUser?.email || 'default';
  return `sakukampus_monthly_budget_${email}`;
}

function getSavedMonthlyBudget() {
  const val = parseInt(localStorage.getItem(getBudgetStorageKey()) || '0', 10);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

function openBudgetModal() {
  const modal = document.getElementById('budgetModal');
  const saved = getSavedMonthlyBudget();
  setCurrencyInputValue('budgetAmountInput', saved > 0 ? saved : '');
  if (modal) modal.classList.remove('hidden');
}

function closeBudgetModal() {
  const modal = document.getElementById('budgetModal');
  if (modal) modal.classList.add('hidden');
}

function setBudgetPreset(amount) {
  setCurrencyInputValue('budgetAmountInput', amount);
}

function handleSaveBudget(e) {
  e.preventDefault();
  const val = parseRupiahInput(document.getElementById('budgetAmountInput')?.value);
  if (!Number.isFinite(val) || val < 10000 || val > 100000000) {
    showToast('Target anggaran harus antara Rp 10.000 dan Rp 100.000.000.', 'warning', 'Nominal Tidak Valid');
    return;
  }
  localStorage.setItem(getBudgetStorageKey(), String(val));
  closeBudgetModal();
  showToast(`Batas anggaran bulanan diatur ke ${formatRupiah(val)}.`, 'success', 'Target Tersimpan');
  if (typeof updateMonthlyBudgetCard === 'function') {
    updateMonthlyBudgetCard(window.lastMonthlyExpense || 0, window.lastMonthlyIncome || 0);
  }
}

function clearMonthlyBudget() {
  localStorage.removeItem(getBudgetStorageKey());
  closeBudgetModal();
  showToast('Batas anggaran kustom telah direset.', 'info');
  if (typeof updateMonthlyBudgetCard === 'function') {
    updateMonthlyBudgetCard(window.lastMonthlyExpense || 0, window.lastMonthlyIncome || 0);
  }
}

// SAVINGS GOAL MODAL (Stored per user in localStorage)
function getSavingsStorageKey() {
  const email = currentUser?.email || 'default';
  return `sakukampus_savings_goal_${email}`;
}

function getSavedSavingsGoal() {
  try {
    const raw = localStorage.getItem(getSavingsStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.name && Number(parsed.target) > 0) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function openSavingsModal() {
  const modal = document.getElementById('savingsModal');
  const saved = getSavedSavingsGoal();
  const nameInput = document.getElementById('savingsNameInput');
  if (nameInput) nameInput.value = saved?.name || '';
  setCurrencyInputValue('savingsTargetInput', saved?.target || '');
  if (modal) modal.classList.remove('hidden');
}

function closeSavingsModal() {
  const modal = document.getElementById('savingsModal');
  if (modal) modal.classList.add('hidden');
}

function handleSaveSavingsGoal(e) {
  e.preventDefault();
  const name = (document.getElementById('savingsNameInput')?.value || '').trim();
  const target = parseRupiahInput(document.getElementById('savingsTargetInput')?.value);
  if (!name) {
    showToast('Masukkan nama target tabungan.', 'warning');
    return;
  }
  if (!Number.isFinite(target) || target < 10000 || target > 100000000) {
    showToast('Target tabungan harus antara Rp 10.000 dan Rp 100.000.000.', 'warning', 'Nominal Tidak Valid');
    return;
  }
  localStorage.setItem(getSavingsStorageKey(), JSON.stringify({ name, target }));
  closeSavingsModal();
  showToast(`Target "${name}" (${formatRupiah(target)}) disimpan.`, 'success', 'Target Tabungan');
  if (typeof updateSavingsGoalCard === 'function') {
    updateSavingsGoalCard(window.currentWalletBalances?.total || 0);
  }
}

function clearSavingsGoal() {
  localStorage.removeItem(getSavingsStorageKey());
  closeSavingsModal();
  showToast('Target tabungan telah direset.', 'info');
  if (typeof updateSavingsGoalCard === 'function') {
    updateSavingsGoalCard(window.currentWalletBalances?.total || 0);
  }
}

// Reset filters in Riwayat Transaksi
function resetFilters() {
  const search = document.getElementById('filterSearch');
  const type = document.getElementById('filterType');
  const category = document.getElementById('filterCategory');
  const startDate = document.getElementById('filterStartDate');
  const endDate = document.getElementById('filterEndDate');

  if (search) search.value = '';
  if (type) type.value = '';
  if (category) category.value = '';
  if (startDate) startDate.value = '';
  if (endDate) endDate.value = '';

  loadTransactions();
  showToast('Filter riwayat telah direset.', 'info');
}

// Authentication Check (F-01, F-08)
async function checkAuth() {
  try {
    const res = await api.get('/auth/me');
    if (res.authenticated && res.user) {
      currentUser = res.user;
      document.getElementById('sidebarUserName').textContent = currentUser.name || 'Mahasiswa UMY';
      document.getElementById('sidebarUserEmail').textContent = currentUser.email || 'student@umy.ac.id';
      const cleanName = (currentUser.name || 'Dimas').replace(/\s*\(.*\)/, '').trim();
      const avatarPic = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanName)}`;
      const avatarEl = document.getElementById('sidebarUserAvatar');
      if (avatarEl) {
        avatarEl.src = avatarPic;
        avatarEl.style.imageRendering = 'auto';
      }
    } else {
      window.location.href = '/login.html';
    }
  } catch (err) {
    window.location.href = '/login.html';
  }
}

// Logout Confirmation Modal (replaces native browser confirm dialog)
function handleLogout() {
  const modal = document.getElementById('logoutModal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function confirmLogout() {
  const btn = document.getElementById('btnConfirmLogout');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Keluar...';
  }
  try {
    await api.post('/auth/logout', {});
  } catch {
    // ignore
  }
  window.location.href = '/login.html';
}

// Dark / Light Theme Support (Defaults to Crisp Clean White)
function initTheme() {
  const isDark = localStorage.getItem('theme') === 'dark';
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  const mainThemeBtn = document.getElementById('mainThemeBtn');
  if (mainThemeBtn) {
    mainThemeBtn.addEventListener('click', () => {
      const isNowDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isNowDark ? 'dark' : 'light');
      // Re-render charts with updated theme colors
      loadChartsData();
    });
  }
}

// Mobile Menu Drawer Management (Transform-based, bulletproof)
function openMobileMenu() {
  const sidebar = document.getElementById('mainSidebar');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  if (sidebar) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
  }
  if (backdrop) {
    backdrop.classList.remove('opacity-0', 'pointer-events-none');
    backdrop.classList.add('opacity-100', 'pointer-events-auto');
  }
}

function closeMobileMenu() {
  const sidebar = document.getElementById('mainSidebar');
  const backdrop = document.getElementById('mobileSidebarBackdrop');
  if (sidebar) {
    sidebar.classList.remove('translate-x-0');
    sidebar.classList.add('-translate-x-full');
  }
  if (backdrop) {
    backdrop.classList.remove('opacity-100', 'pointer-events-auto');
    backdrop.classList.add('opacity-0', 'pointer-events-none');
  }
}

function toggleMobileMenu() {
  const sidebar = document.getElementById('mainSidebar');
  if (sidebar && sidebar.classList.contains('translate-x-0')) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
}

// Window resize listener: if desktop width, ensure mobile classes don't trap the drawer
window.addEventListener('resize', () => {
  if (window.innerWidth >= 1024) {
    closeMobileMenu();
  }
});
