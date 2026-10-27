// Free Play's ticket booth: one balance of tickets and one shelf of prizes for every machine on the floor.
// Each machine pays in at the end of a game (pay), and the prize counter (shared/counter.js) spends from it (buy).
// It's read fresh every time, so a game in another tab never gets overwritten by a stale copy. It checks what it's
// handed, too: a bad number or a nameless prize writes nothing, rather than wiping the pocket.

export const KEY = 'free-play.wallet';

// A count, as a whole number: a number, or a number written as text ('50'); anything else, or too big to save, is NaN.
const whole = v => { const n = Math.floor(typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN); return Number.isFinite(n) ? n : NaN; };
const named = prize => typeof prize?.id === 'string' && prize.id !== '';
const priced = prize => named(prize) && Number.isFinite(prize.cost) && prize.cost >= 0;

export function read() {
  let w = null;
  try { w = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  const ok = w && typeof w === 'object' && !Array.isArray(w);
  const tickets = ok ? whole(w.tickets) : NaN;
  // the shelf, keeping only what's on it: a prize's count is a whole number above 0
  const prizes = {};
  if (ok && w.prizes && typeof w.prizes === 'object' && !Array.isArray(w.prizes)) {
    for (const [id, n] of Object.entries(w.prizes)) if (whole(n) > 0) prizes[id] = whole(n);
  }
  // anything else kept in the pocket (by a newer copy of the arcade) rides along untouched, so writing it back loses nothing
  const rest = {};
  if (ok) for (const [k, v] of Object.entries(w)) if (k !== 'tickets' && k !== 'prizes') rest[k] = v;
  return { ...rest, tickets: Number.isFinite(tickets) ? Math.max(0, tickets) : 0, prizes };
}

function write(w) {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* storage full or off: the game plays on */ }
  dispatchEvent(new CustomEvent('free-play:wallet', { detail: w }));
  return w;
}

// Tickets won on a machine. Anything but a number of them (NaN, nothing, less than one) changes nothing.
export function pay(n) {
  const k = Math.floor(Number(n));
  if (!(Number.isFinite(k) && k > 0)) return read();
  const w = read();
  w.tickets += k;
  return write(w);
}

// A prize from the counter: null when there aren't enough tickets.
export function buy(prize) {
  if (!priced(prize)) return null;
  const w = read();
  if (w.tickets < prize.cost) return null;
  w.tickets -= prize.cost;
  w.prizes[prize.id] = (w.prizes[prize.id] || 0) + 1;
  return write(w);
}

// A trade taken back at the counter (its Undo): the prize's tickets back in the pocket, and one fewer on the shelf.
// null when there isn't one on the shelf to take back.
export function refund(prize) {
  if (!priced(prize)) return null;
  const w = read();
  const n = w.prizes[prize.id] || 0;
  if (!(n > 0)) return null;
  w.tickets += prize.cost;
  if (n > 1) w.prizes[prize.id] = n - 1;
  else delete w.prizes[prize.id];
  return write(w);
}

// A prize won outright, on a machine that pays in prizes rather than tickets (Clutch's plush).
export function give(prize) {
  if (!named(prize)) return null;
  const w = read();
  w.prizes[prize.id] = (w.prizes[prize.id] || 0) + 1;
  return write(w);
}

// Saves brought over from an old address: tickets added, prizes counted in. Nothing to add writes nothing.
export function merge(tickets, prizes = {}) {
  const w = read();
  let changed = false;
  const k = Math.floor(Number(tickets));
  if (Number.isFinite(k) && k > 0) { w.tickets += k; changed = true; }
  if (prizes && typeof prizes === 'object') {
    for (const [id, n] of Object.entries(prizes)) if (id && whole(n) > 0) { w.prizes[id] = (w.prizes[id] || 0) + whole(n); changed = true; }
  }
  return changed ? write(w) : w;
}
