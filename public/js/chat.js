// Chatbot Interaction Module (F-02, F-03, F-04, F-09, F-10)
// Supports both Full-page Chat View and Floating Chat Assistant on Dashboard

let isFloatingChatOpen = false;

// ==========================================
// 1. FLOATING CHAT ASSISTANT (FAB) LOGIC
// ==========================================

function toggleFloatingChat() {
  const windowEl = document.getElementById('floatingChatWindow');
  const iconEl = document.getElementById('floatingChatIcon');
  const toggleBtn = document.getElementById('floatingChatToggleBtn');

  if (!windowEl) return;

  isFloatingChatOpen = !isFloatingChatOpen;

  if (isFloatingChatOpen) {
    windowEl.classList.remove('hidden');
    if (iconEl) iconEl.className = 'fa-solid fa-xmark';
    if (toggleBtn) {
      toggleBtn.title = 'Tutup SakuBot (X)';
      toggleBtn.classList.add('bg-slate-700');
      toggleBtn.classList.remove('bg-brand-600', 'hover:bg-brand-700');
    }
    // Focus input
    setTimeout(() => {
      document.getElementById('floatingChatInputText')?.focus();
    }, 150);
  } else {
    windowEl.classList.add('hidden');
    if (iconEl) iconEl.className = 'fa-solid fa-comments';
    if (toggleBtn) {
      toggleBtn.title = 'Buka SakuBot Asisten';
      toggleBtn.classList.remove('bg-slate-700');
      toggleBtn.classList.add('bg-brand-600', 'hover:bg-brand-700');
    }
  }
}

function closeFloatingChat() {
  const windowEl = document.getElementById('floatingChatWindow');
  const iconEl = document.getElementById('floatingChatIcon');
  const toggleBtn = document.getElementById('floatingChatToggleBtn');

  if (windowEl && !windowEl.classList.contains('hidden')) {
    isFloatingChatOpen = false;
    windowEl.classList.add('hidden');
    if (iconEl) iconEl.className = 'fa-solid fa-comments';
    if (toggleBtn) {
      toggleBtn.title = 'Buka SakuBot Asisten';
      toggleBtn.classList.remove('bg-slate-700');
      toggleBtn.classList.add('bg-brand-600', 'hover:bg-brand-700');
    }
  }
}

function setFloatingChatInput(text) {
  const input = document.getElementById('floatingChatInputText');
  if (input) {
    input.value = text;
    input.focus();
  }
}

async function handleSendFloatingChat(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('floatingChatInputText');
  const message = input.value.trim();
  if (!message) return;

  const source = input.dataset.inputSource === 'voice' ? 'voice' : 'chat';
  input.value = '';
  input.dataset.inputSource = 'chat';

  // Append user bubble to floating chat
  appendFloatingUserMessage(message);
  const typingId = appendFloatingTyping();

  try {
    const res = await api.post('/api/chat', { message, source });
    removeFloatingTyping(typingId);

    // Update Quota Tag & Sidebar
    updateQuotaUI(res.usage);

    if (res.is_rate_limited) {
      appendFloatingBotMessage(res.message, 'warning');
      showToast('Batas kuota chat tercapai.', 'warning');
      return;
    }

    if (res.is_insufficient_balance) {
      appendFloatingBotMessage(res.bot_reply, 'warning');
      showToast('Saldo tidak mencukupi untuk mencatat pengeluaran ini.', 'warning', 'Saldo Kurang');
      return;
    }

    if (res.is_consultation) {
      appendFloatingBotMessage(res.bot_reply, 'consultation');
      return;
    }

    if (res.is_unrecognized) {
      appendFloatingBotMessage(res.bot_reply, 'unrecognized');
      return;
    }

    if (res.success && res.transaction) {
      appendFloatingBotSuccess(res.transaction);
      showToast(`Transaksi ${res.transaction.category_name} (${res.transaction.wallet_label || 'Cash'}) berhasil dicatat!`, 'success');
      loadDashboardData();
      loadTransactions();
    } else {
      appendFloatingBotMessage(res.error || 'Maaf, terjadi kesalahan.', 'error');
    }

  } catch (err) {
    removeFloatingTyping(typingId);
    appendFloatingBotMessage('Gagal terhubung ke server.', 'error');
  }
}

function appendFloatingUserMessage(text) {
  const container = document.getElementById('floatingChatMessages');
  const div = document.createElement('div');
  div.className = 'flex justify-end items-start gap-1.5 fade-in';
  div.innerHTML = `
    <div class="max-w-[85%] bg-brand-600 text-white p-2.5 rounded-2xl chat-bubble-user text-xs shadow-sm font-sans">
      <p class="leading-relaxed">${escapeHtml(text)}</p>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendFloatingTyping() {
  const container = document.getElementById('floatingChatMessages');
  const id = 'fl-typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'flex items-start gap-2 fade-in';
  div.innerHTML = `
    <div class="sakubot-avatar w-6 h-6 rounded-lg text-[10px] shrink-0 mt-0.5">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
    </div>
    <div class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-2.5 rounded-2xl chat-bubble-bot text-[11px] flex items-center gap-1 border border-slate-200 dark:border-slate-700">
      <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:0.2s]"></span>
      <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:0.4s]"></span>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeFloatingTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendFloatingBotMessage(text, type = 'normal') {
  const container = document.getElementById('floatingChatMessages');
  const div = document.createElement('div');
  div.className = 'flex items-start gap-2 fade-in';

  let bubbleBg = 'bg-brand-50/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-brand-100 dark:border-slate-700';
  let icon = '<i class="fa-solid fa-wand-magic-sparkles"></i>';

  if (type === 'consultation') {
    bubbleBg = 'bg-white dark:bg-slate-800 border border-brand-200 dark:border-brand-800 text-slate-900 dark:text-slate-100 shadow-sm';
    icon = '<i class="fa-solid fa-graduation-cap"></i>';
  } else if (type === 'warning') {
    bubbleBg = 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800';
    icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
  } else if (type === 'error') {
    bubbleBg = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800';
    icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  }

  const formatted = escapeHtml(text).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

  div.innerHTML = `
    <div class="sakubot-avatar w-6 h-6 rounded-lg text-[10px] shrink-0 mt-0.5">
      ${icon}
    </div>
    <div class="max-w-[85%] ${bubbleBg} p-2.5 rounded-2xl chat-bubble-bot text-xs leading-relaxed shadow-sm font-sans">
      ${formatted}
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendFloatingBotSuccess(tx) {
  const container = document.getElementById('floatingChatMessages');
  const div = document.createElement('div');
  div.className = 'flex items-start gap-2 fade-in';

  const isTransfer = tx.category_type === 'transfer' || tx.is_transfer;
  const isIncome = tx.category_type === 'income';
  const amountColor = isTransfer
    ? 'text-bauhaus-blue dark:text-bauhaus-yellow'
    : (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400');
  const prefix = isTransfer ? '↔ ' : (isIncome ? '+' : '-');
  const editBtn = isTransfer ? '' : `<button onclick="openEditModal(${tx.id})" class="btn-block-outline !py-1 !px-2 text-[10px]">Ubah</button>`;

  div.innerHTML = `
    <div class="sakubot-avatar w-6 h-6 rounded-lg text-[10px] shrink-0 mt-0.5">
      <i class="fa-solid ${isTransfer ? 'fa-arrow-right-arrow-left' : 'fa-check'}"></i>
    </div>
    <div class="max-w-[85%] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl chat-bubble-bot text-xs leading-relaxed shadow-sm space-y-1.5 font-sans">
      <div class="flex items-center justify-between gap-2">
        <span class="font-bold text-slate-900 dark:text-slate-100">${escapeHtml(tx.category_name)}</span>
        <span class="badge-sand text-[9px]">${escapeHtml(tx.wallet_label || 'Cash')}</span>
      </div>
      <p class="text-sm font-extrabold ${amountColor} tabular-nums">${prefix}${formatRupiah(tx.amount)}</p>
      <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(tx.description)} · ${tx.occurred_on}</p>
      <div class="pt-1.5 flex gap-1.5 border-t border-slate-200 dark:border-slate-700">
        ${editBtn}
        <button onclick="openDeleteModal(${tx.id})" class="btn-block-danger !py-1 !px-2 text-[10px]">
          Hapus
        </button>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ==========================================
// 2. FULL-PAGE CHAT VIEW LOGIC
// ==========================================

function setChatInput(text) {
  const input = document.getElementById('chatInputText');
  if (input) {
    input.value = text;
    input.dataset.inputSource = 'chat';
    input.focus();
  }
}

async function handleSendChat(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('chatInputText');
  const source = input && input.dataset.inputSource === 'voice' ? 'voice' : 'chat';
  handleSendChatWithSource(source);
}

async function handleSendChatWithSource(source = 'chat') {
  const input = document.getElementById('chatInputText');
  const message = input.value.trim();
  if (!message) return;

  // Clear input and reset source marker
  input.value = '';
  input.dataset.inputSource = 'chat';

  // Append user bubble
  appendUserMessage(message, source);

  // Show typing indicator
  const typingId = appendTypingIndicator();

  try {
    const res = await api.post('/api/chat', { message, source });
    removeTypingIndicator(typingId);

    // Update Quota Tag & Sidebar
    updateQuotaUI(res.usage);

    if (res.is_rate_limited) {
      appendBotMessage(res.message, 'warning');
      showToast('Batas kuota pesan harian tercapai.', 'warning');
      return;
    }

    if (res.is_insufficient_balance) {
      appendBotMessage(res.bot_reply, 'warning');
      showToast('Saldo tidak mencukupi untuk mencatat pengeluaran ini.', 'warning', 'Saldo Kurang');
      return;
    }

    if (res.is_consultation) {
      appendBotMessage(res.bot_reply, 'consultation');
      return;
    }

    if (res.is_unrecognized) {
      appendBotMessage(res.bot_reply, 'unrecognized');
      return;
    }

    if (res.success && res.transaction) {
      appendBotTransactionSuccess(res.bot_reply, res.transaction);
      showToast(`Transaksi ${res.transaction.category_name} (${res.transaction.wallet_label || 'Cash'}) berhasil dicatat!`, 'success');
      // Refresh dashboard & transaction table in background
      loadDashboardData();
      loadTransactions();
    } else {
      appendBotMessage(res.error || 'Maaf, terjadi kesalahan saat memproses permintaan.', 'error');
    }

  } catch (err) {
    removeTypingIndicator(typingId);
    appendBotMessage('Gagal terhubung ke server SakuKampus. Periksa koneksi Anda.', 'error');
  }
}

function updateQuotaUI(usage) {
  if (!usage) return;
  const quotaTag = document.getElementById('chatQuotaTag');
  if (quotaTag) quotaTag.textContent = `Sisa: ${usage.remaining} Kuota`;

  const sidebarQuotaText = document.getElementById('sidebarQuotaText');
  const sidebarQuotaBar = document.getElementById('sidebarQuotaBar');
  const dashboardQuotaBar = document.getElementById('dashboardQuotaBar');
  const numericLimit = Number(usage.limit) || 50;
  const usedPct = Math.max(0, Math.min(100, (usage.used / numericLimit) * 100));
  const remPct = Math.max(0, Math.min(100, (usage.remaining / numericLimit) * 100));

  if (sidebarQuotaText) sidebarQuotaText.textContent = `${usage.used}/${usage.limit}`;
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

  const statQuota = document.getElementById('statQuotaCount');
  if (statQuota) statQuota.textContent = `${usage.remaining} / ${usage.limit}`;
}

function appendUserMessage(text, source) {
  const container = document.getElementById('chatMessages');
  const sourceIcon = source === 'voice' ? '<i class="fa-solid fa-microphone text-xs mr-1"></i> ' : '';

  const div = document.createElement('div');
  div.className = 'flex justify-end items-start gap-2 fade-in';
  div.innerHTML = `
    <div class="max-w-[80%] bg-brand-600 text-white p-3.5 rounded-2xl chat-bubble-user text-sm shadow-sm font-sans">
      <p class="leading-relaxed">${sourceIcon}${escapeHtml(text)}</p>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function appendTypingIndicator() {
  const container = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'flex items-start gap-3 fade-in';
  div.innerHTML = `
    <div class="sakubot-avatar w-8 h-8 rounded-xl text-xs shrink-0 mt-1">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
    </div>
    <div class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-3.5 rounded-2xl chat-bubble-bot text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
      <span class="w-2 h-2 rounded-full bg-brand-500 animate-bounce"></span>
      <span class="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:0.2s]"></span>
      <span class="w-2 h-2 rounded-full bg-brand-500 animate-bounce [animation-delay:0.4s]"></span>
      <span class="ml-1 text-[11px] font-sans">SakuBot sedang membaca...</span>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendBotMessage(text, type = 'normal') {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'flex items-start gap-3 fade-in';

  let bubbleBg = 'bg-brand-50/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-brand-100 dark:border-slate-700';
  let icon = '<i class="fa-solid fa-wand-magic-sparkles"></i>';

  if (type === 'consultation') {
    bubbleBg = 'bg-white dark:bg-slate-800 border border-brand-200 dark:border-brand-800 text-slate-900 dark:text-slate-100 shadow-sm';
    icon = '<i class="fa-solid fa-graduation-cap"></i>';
  } else if (type === 'warning') {
    bubbleBg = 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200';
    icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
  } else if (type === 'unrecognized') {
    bubbleBg = 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100';
    icon = '<i class="fa-solid fa-circle-question"></i>';
  } else if (type === 'error') {
    bubbleBg = 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300';
    icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  }

  // Format line breaks and bold
  const formatted = escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

  div.innerHTML = `
    <div class="sakubot-avatar w-8 h-8 rounded-xl text-xs shrink-0 mt-1">
      ${icon}
    </div>
    <div class="max-w-[85%] ${bubbleBg} p-4 rounded-2xl chat-bubble-bot text-sm leading-relaxed shadow-sm font-sans">
      ${formatted}
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function appendBotTransactionSuccess(botReply, tx) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'flex items-start gap-3 fade-in';

  const isTransfer = tx.category_type === 'transfer' || tx.is_transfer;
  const isIncome = tx.category_type === 'income';
  const prefix = isTransfer ? '↔ ' : (isIncome ? '+' : '-');
  const amountColor = isTransfer
    ? 'text-bauhaus-blue dark:text-bauhaus-yellow'
    : (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400');
  const badgeClass = isTransfer
    ? 'badge-accent font-bold'
    : (isIncome ? 'badge-sand font-bold text-emerald-600 dark:text-emerald-400' : 'badge-sand font-medium');
  const typeLabel = isTransfer ? 'Pindah Dana' : `${isIncome ? 'Pemasukan' : 'Pengeluaran'} · ${escapeHtml(tx.category_name)}`;
  const editBtn = isTransfer
    ? ''
    : `<button onclick="openEditModal(${tx.id})" class="btn-block-outline !py-1.5 !px-3 text-xs"><i class="fa-solid fa-pen-to-square text-brand-600" aria-hidden="true"></i> Ubah</button>`;

  div.innerHTML = `
    <div class="sakubot-avatar w-8 h-8 rounded-xl text-xs shrink-0 mt-1">
      <i class="fa-solid ${isTransfer ? 'fa-arrow-right-arrow-left' : 'fa-check'}"></i>
    </div>
    <div class="max-w-[85%] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl chat-bubble-bot text-sm leading-relaxed shadow-sm space-y-3 font-sans">
      <div>
        <div class="flex flex-wrap items-center gap-1.5 mb-1">
          <span class="${badgeClass} inline-block">
            ${typeLabel}
          </span>
          <span class="badge-dirt inline-block">
            <i class="fa-solid ${isTransfer ? 'fa-arrow-right-arrow-left' : (tx.wallet_type === 'bank' ? 'fa-building-columns' : 'fa-money-bill-wave')} text-[9px]" aria-hidden="true"></i>
            ${escapeHtml(tx.wallet_label || 'Cash')}
          </span>
        </div>
        <h4 class="font-bold text-slate-900 dark:text-slate-100 text-base">${escapeHtml(tx.description)}</h4>
        <p class="text-xl font-extrabold ${amountColor} tabular-nums mt-1">${prefix}${formatRupiah(tx.amount)}</p>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1.5">
          <i class="fa-regular fa-calendar" aria-hidden="true"></i>
          <span>${tx.occurred_on}</span>
          <span>·</span>
          <span>${isTransfer ? 'Tidak mengubah total pengeluaran' : (tx.parsed_by && (tx.parsed_by.startsWith('ai') || tx.parsed_by === 'llm') ? (tx.parsed_by.includes('groq') ? 'AI Groq' : (tx.parsed_by.includes('gemini') || tx.parsed_by === 'llm' ? 'AI Gemini' : 'AI')) : 'Aturan')}</span>
        </p>
      </div>

      <!-- Quick Action Buttons right inside chat -->
      <div class="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
        ${editBtn}
        <button onclick="openDeleteModal(${tx.id})" class="btn-block-danger !py-1.5 !px-3 text-xs">
          <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Hapus
        </button>
      </div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}
