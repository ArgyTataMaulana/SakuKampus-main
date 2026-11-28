// Wallet / Funding Source & Inter-Wallet Transfer Helper
// Stores metadata cleanly inside raw_text tags:
//   Regular tx: `[W:cash]` | `[W:bank]` | `[W:bank|BCA]`
//   Transfer:   `[T:bank|BCA->cash|]` | `[T:cash|->bank|BRI]`
// Zero schema migration required on Supabase Cloud & Vercel.

const WALLET_TAG_REGEX = /^\[W:(cash|bank)(?:\|([^\]]+))?\]\s*/i;
const TRANSFER_TAG_REGEX = /^\[T:(cash|bank)\|([^->\]]*)->(cash|bank)\|([^\]]*)\]\s*/i;

const BANK_PATTERNS = [
  { name: 'BCA', pattern: /\b(bca|blu)\b/i },
  { name: 'BRI', pattern: /\b(bri|brimo)\b/i },
  { name: 'Mandiri', pattern: /\b(mandiri|livin)\b/i },
  { name: 'BNI', pattern: /\b(bni|wondr)\b/i },
  { name: 'BSI', pattern: /\b(bsi|syariah)\b/i },
  { name: 'SeaBank', pattern: /\b(seabank|sea bank)\b/i },
  { name: 'Bank Jago', pattern: /\b(jago|bank jago)\b/i },
  { name: 'CIMB', pattern: /\b(cimb|niaga)\b/i },
  { name: 'BTN', pattern: /\b(btn)\b/i },
  { name: 'E-Wallet', pattern: /\b(gopay|ovo|dana|shopeepay|spay|linkaja|e-?wallet)\b/i }
];

const GENERIC_BANK_REGEX = /\b(bank|rekening|rek|transfer|tf|qris|atm|debit|m-?banking|mobile banking)\b/i;
const CASH_REGEX = /\b(cash|tunai|kontan|uang tunai|dompet)\b/i;

export function formatRupiahIDR(num) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num || 0);
}

export function normalizeWallet(walletType, bankName = '') {
  const type = String(walletType || '').toLowerCase() === 'bank' ? 'bank' : 'cash';
  const cleanBank = type === 'bank' ? String(bankName || '').trim().slice(0, 30) : '';
  const effectiveBank = type === 'bank' && cleanBank.toLowerCase() !== 'umum' && cleanBank.toLowerCase() !== 'bank'
    ? cleanBank
    : '';
  const label = type === 'cash'
    ? 'Cash'
    : (effectiveBank ? `Bank (${effectiveBank})` : 'Bank');

  return {
    wallet_type: type,
    bank_name: effectiveBank,
    wallet_label: label
  };
}

export function detectWalletFromText(text) {
  const raw = String(text || '');

  for (const b of BANK_PATTERNS) {
    if (b.pattern.test(raw)) {
      return {
        ...normalizeWallet('bank', b.name),
        explicit: true
      };
    }
  }

  if (GENERIC_BANK_REGEX.test(raw)) {
    return {
      ...normalizeWallet('bank', ''),
      explicit: true
    };
  }

  if (CASH_REGEX.test(raw)) {
    return {
      ...normalizeWallet('cash', ''),
      explicit: true
    };
  }

  return {
    ...normalizeWallet('cash', ''),
    explicit: false
  };
}

/**
 * Detect inter-wallet transfers from natural Indonesian text:
 * - "tarik tunai 100rb dari bca" / "tarik tunai 100rb" -> Bank -> Cash
 * - "setor tunai 200rb ke bri" / "setor bank 200rb" -> Cash -> Bank
 * - "pindah dana 100rb dari bca ke cash" / "transfer 50rb dari bri ke dana"
 */
export function detectTransferFromText(text) {
  const clean = String(text || '').toLowerCase().trim();

  // Case 1: Tarik tunai / ambil uang ATM (Bank -> Cash)
  if (/\b(tarik\s*tunai|tarik\s*cash|ambil\s*tunai|ambil\s*cash|tarik\s*atm)\b/i.test(clean)) {
    let bankName = '';
    for (const b of BANK_PATTERNS) {
      if (b.pattern.test(clean)) {
        bankName = b.name;
        break;
      }
    }
    return {
      is_transfer: true,
      from: normalizeWallet('bank', bankName),
      to: normalizeWallet('cash', ''),
      description: bankName ? `Tarik tunai dari ${bankName}` : 'Tarik tunai ke Cash'
    };
  }

  // Case 2: Setor tunai / masukin ke bank (Cash -> Bank)
  if (/\b(setor\s*tunai|setor\s*cash|setor\s*bank|nabung\s*ke\s*bank)\b/i.test(clean)) {
    let bankName = '';
    for (const b of BANK_PATTERNS) {
      if (b.pattern.test(clean)) {
        bankName = b.name;
        break;
      }
    }
    return {
      is_transfer: true,
      from: normalizeWallet('cash', ''),
      to: normalizeWallet('bank', bankName),
      description: bankName ? `Setor tunai ke ${bankName}` : 'Setor tunai ke Bank'
    };
  }

  // Case 3: Explicit "dari X ke Y" with transfer/pindah/topup/isi saldo keywords
  const dariKeMatch = clean.match(/\bdari\s+([a-z0-9\s-]+?)\s+ke\s+([a-z0-9\s-]+?)(?:\s+\d|$)/i)
    || clean.match(/\b(?:pindah(?:\s*dana)?|transfer|tf|top\s*up|topup)\b.*\bdari\s+([a-z0-9-]+)\s+ke\s+([a-z0-9-]+)/i);

  if (dariKeMatch && /\b(pindah|transfer|tf|top\s*up|topup|tarik|setor)\b/i.test(clean)) {
    const fromDet = detectWalletFromText(dariKeMatch[1]);
    const toDet = detectWalletFromText(dariKeMatch[2]);
    if (fromDet.explicit && toDet.explicit) {
      return {
        is_transfer: true,
        from: normalizeWallet(fromDet.wallet_type, fromDet.bank_name),
        to: normalizeWallet(toDet.wallet_type, toDet.bank_name),
        description: `Pindah dana ${fromDet.wallet_label} → ${toDet.wallet_label}`
      };
    }
  }

  return null;
}

export function stripWalletTag(rawText) {
  if (!rawText) return '';
  return String(rawText)
    .replace(TRANSFER_TAG_REGEX, '')
    .replace(WALLET_TAG_REGEX, '')
    .trim();
}

export function encodeRawTextWithWallet(rawText, walletType, bankName = '') {
  const clean = stripWalletTag(rawText);
  const norm = normalizeWallet(walletType, bankName);
  const tag = norm.wallet_type === 'bank' && norm.bank_name
    ? `[W:bank|${norm.bank_name}]`
    : `[W:${norm.wallet_type}]`;
  return clean ? `${tag} ${clean}` : tag;
}

export function encodeRawTextWithTransfer(rawText, fromWallet, toWallet) {
  const clean = stripWalletTag(rawText);
  const from = normalizeWallet(fromWallet.wallet_type, fromWallet.bank_name);
  const to = normalizeWallet(toWallet.wallet_type, toWallet.bank_name);
  const tag = `[T:${from.wallet_type}|${from.bank_name}->${to.wallet_type}|${to.bank_name}]`;
  return clean ? `${tag} ${clean}` : tag;
}

export function parseTransferFromRow(row) {
  const rawText = String(row?.raw_text || '');
  const match = rawText.match(TRANSFER_TAG_REGEX);
  if (!match) return null;

  const from = normalizeWallet(match[1], match[2] || '');
  const to = normalizeWallet(match[3], match[4] || '');
  return {
    is_transfer: true,
    from,
    to,
    wallet_type: 'transfer',
    bank_name: '',
    wallet_label: `${from.wallet_label} → ${to.wallet_label}`,
    clean_raw_text: stripWalletTag(rawText)
  };
}

export function parseWalletFromRow(row) {
  const transfer = parseTransferFromRow(row);
  if (transfer) {
    return transfer;
  }

  const rawText = String(row?.raw_text || '');
  const match = rawText.match(WALLET_TAG_REGEX);

  if (match) {
    const norm = normalizeWallet(match[1], match[2] || '');
    return {
      is_transfer: false,
      ...norm,
      clean_raw_text: stripWalletTag(rawText)
    };
  }

  // Legacy rows without tag: infer from raw_text or description
  const detected = detectWalletFromText(`${rawText} ${row?.description || ''}`);
  return {
    is_transfer: false,
    wallet_type: detected.wallet_type,
    bank_name: detected.bank_name,
    wallet_label: detected.wallet_label,
    clean_raw_text: rawText
  };
}

export function computeWalletBalances(rows, categoriesById, excludeTxId = null) {
  let totalBalance = 0;
  let cashBalance = 0;
  let bankBalance = 0;
  const bankMap = new Map();

  for (const row of rows || []) {
    if (excludeTxId !== null && String(row.id) === String(excludeTxId)) {
      continue;
    }

    const amt = Number(row.amount) || 0;
    const wallet = parseWalletFromRow(row);

    // Transfer: totalBalance unchanged; move funds from source to destination
    if (wallet.is_transfer) {
      if (wallet.from.wallet_type === 'bank') {
        bankBalance -= amt;
        const fk = wallet.from.bank_name || 'Bank Lainnya';
        bankMap.set(fk, (bankMap.get(fk) || 0) - amt);
      } else {
        cashBalance -= amt;
      }

      if (wallet.to.wallet_type === 'bank') {
        bankBalance += amt;
        const tk = wallet.to.bank_name || 'Bank Lainnya';
        bankMap.set(tk, (bankMap.get(tk) || 0) + amt);
      } else {
        cashBalance += amt;
      }
      continue;
    }

    const cat = categoriesById.get(String(row.category_id));
    const type = cat?.type || 'expense';
    const signed = type === 'income' ? amt : -amt;

    totalBalance += signed;

    if (wallet.wallet_type === 'bank') {
      bankBalance += signed;
      const bankKey = wallet.bank_name || 'Bank Lainnya';
      bankMap.set(bankKey, (bankMap.get(bankKey) || 0) + signed);
    } else {
      cashBalance += signed;
    }
  }

  const banks = Array.from(bankMap.entries())
    .map(([name, balance]) => ({ name, balance }))
    .filter((b) => b.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  return {
    totalBalance,
    cashBalance,
    bankBalance,
    banks,
    bankMap
  };
}

export function validateExpenseAgainstBalances({ amount, wallet_type, bank_name = '', balances, explicitWallet = true }) {
  const norm = normalizeWallet(wallet_type, bank_name);

  if (balances.totalBalance <= 0) {
    return {
      ok: false,
      code: 'EMPTY_BALANCE',
      reason: 'Saldo Anda saat ini Rp 0. Catat pemasukan terlebih dahulu (misalnya uang saku atau gaji di Cash/Bank) sebelum mencatat pengeluaran.'
    };
  }

  if (balances.totalBalance < amount) {
    const deficit = amount - balances.totalBalance;
    return {
      ok: false,
      code: 'INSUFFICIENT_TOTAL',
      reason: `Saldo tidak mencukupi! Total saldo Anda saat ini ${formatRupiahIDR(balances.totalBalance)}, sedangkan nominal ${formatRupiahIDR(amount)} (kurang ${formatRupiahIDR(deficit)}).`
    };
  }

  if (explicitWallet) {
    if (norm.wallet_type === 'cash') {
      if (balances.cashBalance < amount) {
        const altHint = balances.bankBalance >= amount
          ? ` Anda memiliki saldo ${formatRupiahIDR(balances.bankBalance)} di Bank — silakan pilih sumber dana Bank atau tarik tunai terlebih dahulu.`
          : '';
        return {
          ok: false,
          code: 'INSUFFICIENT_CASH',
          reason: `Saldo Cash tidak mencukupi (tersedia ${formatRupiahIDR(Math.max(0, balances.cashBalance))}, dibutuhkan ${formatRupiahIDR(amount)}).${altHint}`
        };
      }
      return { ok: true, resolvedWallet: norm };
    }

    if (balances.bankBalance < amount) {
      const altHint = balances.cashBalance >= amount
        ? ` Anda memiliki saldo ${formatRupiahIDR(balances.cashBalance)} di Cash — silakan pilih sumber dana Cash atau setor ke Bank terlebih dahulu.`
        : '';
      return {
        ok: false,
        code: 'INSUFFICIENT_BANK',
        reason: `Saldo Bank tidak mencukupi (tersedia ${formatRupiahIDR(Math.max(0, balances.bankBalance))}, dibutuhkan ${formatRupiahIDR(amount)}).${altHint}`
      };
    }

    if (norm.bank_name) {
      const specificBal = balances.bankMap.get(norm.bank_name) || 0;
      const genericBal = balances.bankMap.get('Bank Lainnya') || 0;
      if (specificBal < amount && (specificBal + genericBal) < amount) {
        const availableBanks = balances.banks
          .filter((b) => b.balance >= amount)
          .map((b) => `${b.name} (${formatRupiahIDR(b.balance)})`)
          .join(', ');
        const hint = availableBanks ? ` Saldo mencukupi tersedia di: ${availableBanks}.` : '';
        return {
          ok: false,
          code: 'INSUFFICIENT_SPECIFIC_BANK',
          reason: `Saldo ${norm.wallet_label} tidak mencukupi (tersedia ${formatRupiahIDR(Math.max(0, specificBal))}, dibutuhkan ${formatRupiahIDR(amount)}).${hint}`
        };
      }
    }

    return { ok: true, resolvedWallet: norm };
  }

  // Implicit wallet: auto-pick wallet with enough balance
  if (balances.cashBalance >= amount) {
    return { ok: true, resolvedWallet: normalizeWallet('cash', '') };
  }

  if (balances.bankBalance >= amount) {
    const matchingBank = balances.banks.find((b) => b.balance >= amount);
    const chosenBankName = matchingBank && matchingBank.name !== 'Bank Lainnya' ? matchingBank.name : '';
    return { ok: true, resolvedWallet: normalizeWallet('bank', chosenBankName) };
  }

  return {
    ok: false,
    code: 'SPLIT_WALLET_INSUFFICIENT',
    reason: `Total saldo Anda ${formatRupiahIDR(balances.totalBalance)}, tetapi terbagi antara Cash (${formatRupiahIDR(Math.max(0, balances.cashBalance))}) dan Bank (${formatRupiahIDR(Math.max(0, balances.bankBalance))}) sehingga masing-masing belum cukup untuk ${formatRupiahIDR(amount)}.`
  };
}
