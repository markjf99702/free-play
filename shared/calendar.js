// The arcade's calendar: the day where the player is, as 'YYYY-MM-DD' (so it changes at their own midnight), the day
// before one, how many days apart two are, and a small random seeded from text, so every phone draws the same thing on
// the same day: Roll Up's card, and today's special.

export function dayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayBefore(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12));
}

// Whole days from one day to another (negative when the second comes first).
export function daysApart(a, b) {
  const utc = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(b) - utc(a)) / 864e5);
}

// A day as people say it: 'Oct 27', with the year when it isn't this one ('Oct 27, 2025').
export function dayName(key, today = dayKey()) {
  if (typeof key !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(key)) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(key.slice(0, 4) !== today.slice(0, 4) && { year: 'numeric' }) });
}

// A small seeded random from some text (FNV-1a into mulberry32): the same text, the same run of numbers, on every phone.
export function seeded(text) {
  let h = 2166136261;
  for (const c of text) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
