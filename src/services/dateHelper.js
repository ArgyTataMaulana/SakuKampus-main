// Timezone-safe date utilities for Indonesian users (WIB/WITA/WIT) on UTC servers (e.g. Vercel)

const DATE_STR_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_STR_REGEX.test(dateStr)) return false;
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(dateStr);
}

export function getTimezoneDateStr(timeZone = 'Asia/Jakarta', offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  const utcDate = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWibTodayStr(offsetDays = 0) {
  return getTimezoneDateStr('Asia/Jakarta', offsetDays);
}

/**
 * Resolve maximum allowed transaction date ("today") safely across WIB/WITA/WIT.
 * Accepts client's local date header only if it falls within Indonesia's current
 * timezone window [Asia/Jakarta (UTC+7) .. Asia/Jayapura (UTC+9)], preventing
 * both future-date spoofing and midnight false rejections on UTC servers.
 */
export function resolveMaxAllowedDate(clientDateHeader = '') {
  const wibToday = getTimezoneDateStr('Asia/Jakarta');
  const witToday = getTimezoneDateStr('Asia/Jayapura');
  const candidate = typeof clientDateHeader === 'string' ? clientDateHeader.trim() : '';

  if (isValidDateStr(candidate) && candidate >= wibToday && candidate <= witToday) {
    return candidate;
  }
  return wibToday;
}

export function isFutureDateStr(dateStr, clientDateHeader = '') {
  if (!isValidDateStr(dateStr)) return false;
  return dateStr > resolveMaxAllowedDate(clientDateHeader);
}
