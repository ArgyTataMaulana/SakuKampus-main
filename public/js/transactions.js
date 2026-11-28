// Transaction History, Filters & CRUD Operations (F-05, F-10)

let allCategories = [];
let pendingDeleteId = null;
let lastRenderedTransactions = [];

async function loadCategories() {
  try {
    const res = await api.get('/api/transactions/meta/categories');
    if (res.success) {
      allCategories = res.data;

      // Populate filter dropdown
      const filterSelect = document.getElementById('filterCategory');
      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">Semua 12 Kategori</option>' +
          allCategories.map(c => `<option value="${c.id}">${c.name} (${c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'})</option>`).join('');
      }

      // Populate edit modal dropdown
      const editSelect = document.getElementById('editCategory');
      if (editSelect) {
        editSelect.innerHTML = allCategories.map(c =>
          `<option value="${c.id}">${c.name} (${c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'})</option>`
        ).join('');
      }
    }
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

async function loadTransactions() {
  const search = document.getElementById('filterSearch')?.value.trim() || '';
  const type = document.getElementById('filterType')?.value || '';
  const category_id = document.getElementById('filterCategory')?.value || '';
  const start_date = document.getElementById('filterStartDate')?.value || '';
  const end_date = document.getElementById('filterEndDate')?.value || '';

  if (start_date && end_date && start_date > end_date) {
    showToast('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.', 'warning');
    return;
  }

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (type) params.append('type', type);
  if (category_id) params.append('category_id', category_id);
  if (start_date) params.append('start_date', start_date);
  if (end_date) params.append('end_date', end_date);

  try {
    const res = await api.get(`/api/transactions?${params.toString()}`);
    if (res.success) {
      renderTransactionsTable(res.data);
    }
  } catch (err) {
    console.error('Error fetching transactions:', err);
  }
}

function renderTransactionsTable(transactions) {
  const tbody = document.getElementById('transactionTableBody');
  const emptyPlaceholder = document.getElementById('emptyTxPlaceholder');
  lastRenderedTransactions = Array.isArray(transactions) ? transactions : [];
  if (!tbody) return;

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = '';
    emptyPlaceholder?.classList.remove('hidden');
    return;
  }

  emptyPlaceholder?.classList.add('hidden');

  tbody.innerHTML = transactions.map(tx => {
    const isTransfer = tx.category_type === 'transfer' || tx.is_transfer;
    const isIncome = tx.category_type === 'income';
    const amountColor = isTransfer
      ? 'text-bauhaus-blue dark:text-bauhaus-yellow font-bold tabular-nums'
      : (isIncome
        ? 'text-emerald-600 dark:text-emerald-400 font-bold tabular-nums'
        : 'text-red-500 dark:text-red-400 font-bold tabular-nums');
    const prefix = isTransfer ? '↔ ' : (isIncome ? '+' : '-');

    const sourceBadge = tx.source === 'voice'
      ? '<span class="badge-sand"><i class="fa-solid fa-microphone text-[10px]"></i> Suara</span>'
      : '<span class="badge-sand"><i class="fa-solid fa-comment text-[10px]"></i> Chat</span>';

    const walletBadge = isTransfer
      ? `<span class="badge-accent"><i class="fa-solid fa-arrow-right-arrow-left text-[10px]"></i> ${escapeHtml(tx.wallet_label || 'Pindah Dana')}</span>`
      : (tx.wallet_type === 'bank'
        ? `<span class="badge-dirt"><i class="fa-solid fa-building-columns text-[10px]"></i> ${escapeHtml(tx.wallet_label || 'Bank')}</span>`
        : '<span class="badge-sand"><i class="fa-solid fa-money-bill-wave text-[10px]"></i> Cash</span>');

    const categoryBadge = isTransfer
      ? `<span class="badge-accent font-medium">Pindah Dana</span>`
      : (isIncome
        ? `<span class="badge-sand text-emerald-600 dark:text-emerald-400 font-medium">${escapeHtml(tx.category_name)}</span>`
        : `<span class="badge-sand font-medium">${escapeHtml(tx.category_name)}</span>`);

    const editBtnHtml = isTransfer
      ? ''
      : `<button onclick="openEditModal(${tx.id})" class="p-2 text-slate-500 hover:text-bauhaus-blue hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Ubah Transaksi" aria-label="Ubah transaksi">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>`;

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
        <td class="py-4 px-6 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${tx.occurred_on}</td>
        <td class="py-4 px-6">
          <p class="font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(tx.description)}</p>
          ${tx.raw_text ? `<p class="text-[11px] text-slate-400 dark:text-slate-500 italic mt-0.5">"${escapeHtml(tx.raw_text)}"</p>` : ''}
        </td>
        <td class="py-4 px-6 whitespace-nowrap">
          ${categoryBadge}
        </td>
        <td class="py-4 px-6 text-center whitespace-nowrap space-x-1">
          ${walletBadge}
          ${sourceBadge}
        </td>
        <td class="py-4 px-6 text-right whitespace-nowrap ${amountColor}">
          ${prefix}${formatRupiah(tx.amount)}
        </td>
        <td class="py-4 px-6 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-1">
            ${editBtnHtml}
            <button onclick="openDeleteModal(${tx.id})" class="p-2 text-slate-500 hover:text-bauhaus-red hover:bg-red-50 dark:hover:bg-red-950/40 transition" title="Hapus Transaksi" aria-label="Hapus transaksi">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// EXPORT LAPORAN KEUANGAN (CSV & CETAK PDF)
// ==========================================
function csvCell(value) {
  const str = String(value ?? '').replace(/"/g, '""');
  return `"${str}"`;
}

function exportTransactionsCSV() {
  if (!lastRenderedTransactions || lastRenderedTransactions.length === 0) {
    showToast('Tidak ada data transaksi untuk diekspor.', 'warning', 'Data Kosong');
    return;
  }

  const headers = ['Tanggal', 'Tipe', 'Kategori', 'Sumber Dana', 'Keterangan', 'Nominal (IDR)', 'Metode Input'];
  const lines = [headers.map(csvCell).join(',')];

  for (const tx of lastRenderedTransactions) {
    const typeLabel = tx.category_type === 'transfer'
      ? 'Pindah Dana'
      : (tx.category_type === 'income' ? 'Pemasukan' : 'Pengeluaran');
    lines.push([
      tx.occurred_on || '',
      typeLabel,
      tx.category_name || '',
      tx.wallet_label || 'Cash',
      tx.description || '',
      tx.amount || 0,
      tx.source === 'voice' ? 'Suara' : 'Chat/Manual'
    ].map(csvCell).join(','));
  }

  // UTF-8 BOM so Microsoft Excel opens Indonesian characters cleanly
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const link = document.createElement('a');
  link.href = url;
  link.download = `Laporan_SakuKampus_${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Berhasil mengunduh ${lastRenderedTransactions.length} transaksi ke CSV.`, 'success', 'Export CSV');
}

function exportTransactionsPDF() {
  if (!lastRenderedTransactions || lastRenderedTransactions.length === 0) {
    showToast('Tidak ada data transaksi untuk dicetak.', 'warning', 'Data Kosong');
    return;
  }

  let totalIncome = 0;
  let totalExpense = 0;
  for (const tx of lastRenderedTransactions) {
    if (tx.category_type === 'transfer') continue;
    if (tx.category_type === 'income') totalIncome += Number(tx.amount) || 0;
    else totalExpense += Number(tx.amount) || 0;
  }

  const wb = window.currentWalletBalances || { total: totalIncome - totalExpense, cash: 0, bank: 0 };
  const userName = currentUser?.name || 'Pengguna SakuKampus';
  const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const rowsHtml = lastRenderedTransactions.map((tx) => {
    const isTransfer = tx.category_type === 'transfer';
    const isIncome = tx.category_type === 'income';
    const typeLabel = isTransfer ? 'Pindah Dana' : (isIncome ? 'Pemasukan' : 'Pengeluaran');
    const prefix = isTransfer ? '↔ ' : (isIncome ? '+' : '-');
    const color = isTransfer ? '#1040C0' : (isIncome ? '#059669' : '#D02020');
    return `
      <tr>
        <td>${escapeHtml(tx.occurred_on)}</td>
        <td><b>${escapeHtml(tx.description)}</b></td>
        <td>${escapeHtml(tx.category_name)} (${typeLabel})</td>
        <td>${escapeHtml(tx.wallet_label || 'Cash')}</td>
        <td style="text-align:right;font-weight:700;color:${color};">${prefix}${formatRupiah(tx.amount)}</td>
      </tr>
    `;
  }).join('');

  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) {
    showToast('Popup diblokir browser. Izinkan popup untuk mencetak PDF.', 'warning');
    return;
  }

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Laporan Keuangan SakuKampus</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #121212; padding: 28px; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #121212; padding-bottom: 14px; margin-bottom: 20px; }
        .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; }
        .brand span { color: #1040C0; }
        .meta { font-size: 12px; color: #555; text-align: right; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
        .box { border: 2px solid #121212; padding: 10px 12px; }
        .box-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #555; }
        .box-val { font-size: 15px; font-weight: 800; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #121212; color: #fff; text-align: left; padding: 9px 10px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
        td { border-bottom: 1px solid #ddd; padding: 8px 10px; }
        tr:nth-child(even) td { background: #f8f7f3; }
        .footer { margin-top: 24px; font-size: 11px; color: #666; text-align: center; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">SAKU<span>KAMPUS</span></div>
          <div style="font-size:12px;color:#555;margin-top:2px;">Laporan Riwayat Transaksi Keuangan</div>
        </div>
        <div class="meta">
          <div><b>${escapeHtml(userName)}</b></div>
          <div>Dicetak: ${escapeHtml(printDate)}</div>
        </div>
      </div>
      <div class="summary">
        <div class="box"><div class="box-label">Total Saldo</div><div class="box-val">${formatRupiah(wb.total)}</div></div>
        <div class="box"><div class="box-label">Cash / Bank</div><div class="box-val" style="font-size:12px;">Cash ${formatRupiah(wb.cash)}<br>Bank ${formatRupiah(wb.bank)}</div></div>
        <div class="box"><div class="box-label">Total Pemasukan</div><div class="box-val" style="color:#059669;">${formatRupiah(totalIncome)}</div></div>
        <div class="box"><div class="box-label">Total Pengeluaran</div><div class="box-val" style="color:#D02020;">${formatRupiah(totalExpense)}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Keterangan</th>
            <th>Kategori</th>
            <th>Sumber Dana</th>
            <th style="text-align:right;">Nominal</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="footer">Dicetak dari SakuKampus · Total ${lastRenderedTransactions.length} transaksi</div>
      <script>window.onload = function() { window.print(); };<\/script>
    </body>
    </html>
  `);
  printWin.document.close();
}

let filterDebounce = null;
function applyFilters() {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => {
    loadTransactions();
  }, 250);
}

function toggleEditBankField() {
  const walletType = document.getElementById('editWalletType')?.value || 'cash';
  const wrap = document.getElementById('editBankNameWrap');
  if (wrap) {
    if (walletType === 'bank') {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }
}

// EDIT MODAL
async function openEditModal(txId) {
  try {
    const res = await api.get(`/api/transactions/${txId}`);
    if (res.success) {
      const tx = res.data;
      document.getElementById('editTxId').value = tx.id;
      setCurrencyInputValue('editAmount', tx.amount);
      document.getElementById('editDesc').value = tx.description;
      if (typeof syncMaxDateInputs === 'function') syncMaxDateInputs();
      document.getElementById('editDate').value = tx.occurred_on;

      const editWallet = document.getElementById('editWalletType');
      const editBank = document.getElementById('editBankName');
      if (editWallet) editWallet.value = tx.wallet_type === 'bank' ? 'bank' : 'cash';
      if (editBank) editBank.value = tx.bank_name || '';
      toggleEditBankField();

      // Populate edit categories if needed
      const editSelect = document.getElementById('editCategory');
      if (editSelect && allCategories.length > 0) {
        editSelect.innerHTML = allCategories.map(c =>
          `<option value="${c.id}">${c.name} (${c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'})</option>`
        ).join('');
        editSelect.value = tx.category_id;
      }

      document.getElementById('editModal').classList.remove('hidden');
    }
  } catch (err) {
    showToast('Gagal mengambil data transaksi.', 'error');
  }
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveEdit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn && submitBtn.disabled) return;

  const txId = document.getElementById('editTxId').value;
  const amount = parseRupiahInput(document.getElementById('editAmount').value);
  const category_id = document.getElementById('editCategory').value;
  const description = document.getElementById('editDesc').value;
  const occurred_on = document.getElementById('editDate').value;
  const wallet_type = document.getElementById('editWalletType')?.value || 'cash';
  const bank_name = wallet_type === 'bank' ? (document.getElementById('editBankName')?.value || '') : '';

  if (!Number.isFinite(amount) || amount < 100 || amount > 100000000) {
    showToast('Nominal transaksi harus antara Rp 100 dan Rp 100.000.000.', 'warning', 'Nominal Tidak Valid');
    return;
  }
  if (occurred_on && typeof getLocalTodayDateStr === 'function' && occurred_on > getLocalTodayDateStr()) {
    showToast('Tanggal transaksi tidak boleh melebihi hari ini.', 'warning', 'Tanggal Tidak Valid');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  }

  try {
    const res = await api.put(`/api/transactions/${txId}`, {
      amount,
      category_id,
      description,
      occurred_on,
      wallet_type,
      bank_name
    });

    if (res.success) {
      closeEditModal();
      showToast('Transaksi berhasil diperbarui!', 'success');
      loadTransactions();
      loadDashboardData();
    } else {
      showToast(res.error || 'Gagal menyimpan perubahan transaksi.', 'warning', 'Tidak Dapat Diperbarui');
    }
  } catch (err) {
    showToast('Terjadi kesalahan saat menyimpan perubahan.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  }
}

// DELETE MODAL (F-10)
function openDeleteModal(txId) {
  pendingDeleteId = txId;
  const modal = document.getElementById('deleteModal');
  const confirmBtn = document.getElementById('btnConfirmDelete');

  confirmBtn.disabled = false;
  confirmBtn.classList.remove('opacity-60', 'cursor-not-allowed');

  confirmBtn.onclick = async () => {
    if (confirmBtn.disabled || !pendingDeleteId) return;
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-60', 'cursor-not-allowed');
    try {
      const res = await api.delete(`/api/transactions/${pendingDeleteId}`);
      if (res.success) {
        closeDeleteModal();
        showToast('Transaksi berhasil dihapus.', 'info');
        loadTransactions();
        loadDashboardData();
      } else {
        showToast(res.error || 'Gagal menghapus transaksi.', 'error');
      }
    } catch (err) {
      showToast('Terjadi kesalahan saat menghapus transaksi.', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
  };

  modal.classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDeleteId = null;
  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.add('hidden');
}
