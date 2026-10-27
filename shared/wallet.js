// Free Play's ticket booth: one balance of tickets and one shelf of prizes for every machine on the floor.
// Each machine pays in at the end of a game (pay), and the prize counter (shared/counter.js) spends from it (buy).
// It's read fresh every time, so a game in another tab never gets overwritten by a stale copy.

export const KEY = 'free-play.wallet';

export function read() {
  let w = null;
  try { w = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  const ok = w && typeof w === 'object' && !Array.isArray(w);
  return {
    tickets: ok && Number.isFinite(w.tickets) ? Math.max(0, Math.floor(w.tickets)) : 0,
    prizes: ok && w.prizes && typeof w.prizes === 'object' ? { ...w.prizes } : {},
  };
}

function write(w) {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* storage full or off: the game plays on */ }
  dispatchEvent(new CustomEvent('free-play:wallet', { detail: w }));
  return w;
}

// Tickets won on a machine.
export function pay(n) {
  const w = read();
  w.tickets += Math.max(0, Math.floor(n));
  return write(w);
}

// A prize from the counter: null when there aren't enough tickets.
export function buy(prize) {
  const w = read();
  if (w.tickets < prize.cost) return null;
  w.tickets -= prize.cost;
  w.prizes[prize.id] = (w.prizes[prize.id] || 0) + 1;
  return write(w);
}

// A trade taken back at the counter (its Undo): the prize's tickets back in the pocket, and one fewer on the shelf.
// null when there isn't one on the shelf to take back.
export function refund(prize) {
  const w = read();
  const n = Number(w.prizes[prize.id]) || 0;
  if (!(n > 0)) return null;
  w.tickets += prize.cost;
  if (n > 1) w.prizes[prize.id] = n - 1;
  else delete w.prizes[prize.id];
  return write(w);
}

// A prize won outright, on a machine that pays in prizes rather than tickets (Clutch's plush).
export function give(prize) {
  const w = read();
  w.prizes[prize.id] = (w.prizes[prize.id] || 0) + 1;
  return write(w);
}

// Saves brought over from an old address (shared/carry.js): tickets added, prizes counted in.
export function merge(tickets, prizes = {}) {
  const w = read();
  w.tickets += Math.max(0, Math.floor(Number(tickets) || 0));
  for (const [id, n] of Object.entries(prizes)) if (Number.isFinite(n) && n > 0) w.prizes[id] = (w.prizes[id] || 0) + Math.floor(n);
  return write(w);
}
