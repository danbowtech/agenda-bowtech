// Mici unelte folosite peste tot: date, texte, identificatori.

export const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
export const ZILE_SCURT = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
export const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie',
  'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const LUNI_SCURT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const pad = n => String(n).padStart(2, '0');

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// 'YYYY-MM-DD' în ora locală
export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 'YYYY-MM-DDTHH:MM' în ora locală (așa se păstrează orele ședințelor)
export function toLocal(d) {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocal(s) {
  const [k, t = '00:00'] = s.split('T');
  const d = parseKey(k);
  const [h, m] = t.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// Săptămâna începe lunea
export function startOfWeek(d) {
  const r = startOfDay(d);
  const wd = (r.getDay() + 6) % 7;
  return addDays(r, -wd);
}

export function sameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

export function fmtTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// „marți, 28 octombrie” (+ anul dacă nu e anul curent)
export function fmtDateLong(d, now = new Date()) {
  const y = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${ZILE[d.getDay()]}, ${d.getDate()} ${LUNI[d.getMonth()]}${y}`;
}

export function fmtDateShort(d, now = new Date()) {
  const y = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${ZILE_SCURT[d.getDay()]} ${d.getDate()} ${LUNI_SCURT[d.getMonth()]}${y}`;
}

// „azi”, „mâine”, „ieri” sau data
export function fmtRelDay(d, now = new Date()) {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'azi';
  if (diff === 1) return 'mâine';
  if (diff === -1) return 'ieri';
  if (diff === 2) return 'poimâine';
  return fmtDateLong(d, now);
}

export function capFirst(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Fără diacritice, litere mici, doar litere și cifre separate prin spații
export function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function capName(s) {
  return s.split(/\s+/).filter(Boolean)
    .map(w => w.split('-').map(p => p ? p[0].toLocaleUpperCase('ro') + p.slice(1).toLocaleLowerCase('ro') : p).join('-'))
    .join(' ');
}

export function initials(name) {
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0];
  return `${p[0]} ${p.slice(1).map(x => x[0].toUpperCase() + '.').join(' ')}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function plural(n, one, many) {
  // în română: 1 ședință, 2 ședințe, 20 de ședințe
  if (n === 1) return `o ${one}`;
  const r = n % 100;
  const de = r >= 20 || (r === 0 && n > 0) ? 'de ' : '';
  return `${n} ${de}${many}`;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function timeAgo(ts, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'acum câteva secunde';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'acum un minut' : `acum ${m} minute`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'acum o oră' : `acum ${h} ore`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ieri' : `acum ${d} zile`;
}
