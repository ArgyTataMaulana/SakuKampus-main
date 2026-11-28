// Main App Controller for SakuKampus UMY

let currentUser = null;
let currentView = 'dashboard';
let currentAddType = 'expense';

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initModalListeners();
  initCurrencyInputs();

  // Deep-link routing support
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const routeMap = {
    '/chat': 'chat',
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

// Proper Production Toast Notification System
function showToast(message, type = 'success', customTitle = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const configMap = {
    success: {
      title: customTitle || 'Berhasil',
      accent: 'border-l-emerald-600',
      iconBg: 'bg-emerald-600 text-white',
      icon: 'fa-check',
      barColor: 'bg-emerald-600'
    },
    error: {
      title: customTitle || 'Gagal',
      accent: 'border-l-bauhaus-red',
      iconBg: 'bg-bauhaus-red text-white',
      icon: 'fa-xmark',
      barColor: 'bg-bauhaus-red'
    },
    warning: {
      title: customTitle || 'Perhatian',
      accent: 'border-l-bauhaus-yellow',
      iconBg: 'bg-bauhaus-yellow text-bauhaus-dark',
      icon: 'fa-exclamation',
      barColor: 'bg-bauhaus-yellow'
    },
    info: {
      title: customTitle || 'Informasi',
      accent: 'border-l-bauhaus-blue',
      iconBg: 'bg-bauhaus-blue text-white',
      icon: 'fa-info',
      barColor: 'bg-bauhaus-blue'
    }
  };
  const cfg = configMap[type] || configMap.info;

  const id = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const div = document.createElement('div');
  div.id = id;
  div.setAttribute('role', 'alert');
  div.className = `toast-item pointer-events-auto relative overflow-hidden bg-white dark:bg-nightbg-card text-slate-900 dark:text-nighttext border-l-[6px] ${cfg.accent}`;

  div.innerHTML = `
    <div class="p-3.5 pr-3 flex items-start gap-3">
      <div class="w-7 h-7 ${cfg.iconBg} flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">
        <i class="fa-solid ${cfg.icon}" aria-hidden="true"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 leading-tight">${escapeHtml(cfg.title)}</p>
        <p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug font-medium">${escapeHtml(message)}</p>
      </div>
      <button type="button" onclick="dismissToast('${id}')" class="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0 transition" aria-label="Tutup notifikasi">
        <i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i>
      </button>
    </div>
    <div class="h-1 w-full bg-slate-100 dark:bg-slate-800">
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

// View Navigation Switcher
function switchView(viewName) {
  const views = ['dashboard', 'chat', 'history'];
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
  // Automatically close mobile sidebar drawer on navigation!
  closeMobileMenu();

  // Hide floating assistant button when already in full chat view
  const floatingChat = document.getElementById('floatingChatContainer');
  if (floatingChat) {
    if (viewName === 'chat') {
      floatingChat.classList.add('hidden');
    } else {
      floatingChat.classList.remove('hidden');
    }
  }

  const titles = {
    dashboard: { title: 'Dashboard Keuangan', sub: 'Ringkasan saldo & transaksi pintar' },
    chat: { title: 'Catat Transaksi', sub: 'Chatbot pintar & rekognisi suara (id-ID)' },
    history: { title: 'Riwayat Transaksi', sub: 'Pencarian & manajemen transaksi keuangan' }
  };

  // Toggle view containers
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const navBtn = document.getElementById(`nav-${v}`);
    const mobileNavBtn = document.getElementById(`mobile-nav-${v}`);

    if (el) {
      if (v === viewName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }

    // Desktop nav styles (sharp Bauhaus geometry)
    if (navBtn) {
      if (v === viewName) {
        navBtn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400';
      } else {
        navBtn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800';
      }
    }

    // Mobile nav styles (Clean 3-column Bauhaus tabs, zero overlap)
    if (mobileNavBtn) {
      const borderClass = v !== 'history' ? ' border-r border-bauhaus-dark/20' : '';
      if (v === viewName) {
        mobileNavBtn.className = `flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] bg-bauhaus-yellow text-bauhaus-dark font-extrabold${borderClass} transition`;
      } else {
        mobileNavBtn.className = `flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-slate-600 dark:text-slate-400 font-bold${borderClass} transition`;
      }
    }
  });

  // Topbar Title & Back Button Visibility
  const btnBack = document.getElementById('btnBackToDashboard');
  if (btnBack) {
    if (viewName === 'dashboard') {
      btnBack.classList.add('hidden');
      btnBack.classList.remove('inline-flex');
    } else {
      btnBack.classList.remove('hidden');
      btnBack.classList.add('inline-flex');
    }
  }

  if (titles[viewName]) {
    document.getElementById('topbarTitle').textContent = titles[viewName].title;
    document.getElementById('topbarSubtitle').textContent = titles[viewName].sub;
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Reload specific view data if needed
  if (viewName === 'dashboard') {
    loadDashboardData();
  } else if (viewName === 'history') {
    loadTransactions();
  }
}

// Global modal backdrop & escape key handling
function initModalListeners() {
  const modals = ['editModal', 'deleteModal', 'addModal', 'logoutModal', 'transferModal', 'budgetModal'];
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
      closeFloatingChat();
      closeMobileMenu();
    }
  });
}

// MANUAL ADD TRANSACTION MODAL
function openAddModal() {
  const addModal = document.getElementById('addModal');
  const dateInput = document.getElementById('addDate');
  const walletSelect = document.getElementById('addWalletType');
  const bankSelect = document.getElementById('addBankName');
  if (dateInput) {
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
      notice.className = 'p-3 border-2 border-bauhaus-dark border-l-[6px] border-l-bauhaus-red bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-xs font-semibold';
      notice.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> Saldo Anda saat ini <b>Rp 0</b>. Catat <b>Pemasukan</b> terlebih dahulu sebelum mencatat pengeluaran.`;
      return;
    }
    const available = walletType === 'bank' ? wb.bank : wb.cash;
    const label = walletType === 'bank' ? 'Bank' : 'Cash';
    if (available <= 0) {
      notice.className = 'p-3 border-2 border-bauhaus-dark border-l-[6px] border-l-bauhaus-yellow bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs font-semibold';
      notice.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Saldo <b>${label}</b> Anda Rp 0 (Cash: ${formatRupiah(wb.cash)} · Bank: ${formatRupiah(wb.bank)}). Pilih sumber dana yang memiliki saldo.`;
      return;
    }
    notice.className = 'p-2.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-xs font-medium';
    notice.innerHTML = `Saldo <b>${label}</b> tersedia: <b class="tabular-nums text-slate-900 dark:text-slate-100">${formatRupiah(available)}</b>`;
  } else {
    notice.className = 'hidden';
  }
}

function setAddType(type) {
  currentAddType = type;
  const btnExp = document.getElementById('btnAddTypeExpense');
  const btnInc = document.getElementById('btnAddTypeIncome');

  if (type === 'expense') {
    if (btnExp) btnExp.className = 'flex-1 py-2 text-xs font-semibold active text-expense';
    if (btnInc) btnInc.className = 'flex-1 py-2 text-xs font-medium text-slate-500 dark:text-slate-400';
  } else {
    if (btnInc) btnInc.className = 'flex-1 py-2 text-xs font-semibold active text-emerald-600 dark:text-emerald-400';
    if (btnExp) btnExp.className = 'flex-1 py-2 text-xs font-medium text-slate-500 dark:text-slate-400';
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
  if (dateInput) {
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
