// Records: each machine's top five, with the day each was set, and the arcade's all-time totals.
// A machine keeps its top five in its own save (top: [{ score, date }], best first), beside the best it already kept.
// The totals (tickets won, rounds played on each machine, prizes traded) are the arcade's, in a save of their own,
// not in the ticket pocket: shared/wallet.js counts the tickets and the trades, and each machine counts its rounds.

import { dayKey } from './calendar.js';

export const TOTALS = 'free-play.totals';
const LONG = 5;

// A machine's top five as it's saved, best first, keeping only what can be read. A save from before there was a list
// starts it from the best it kept, with no day.
export function topFive(saved) {
  if (Array.isArray(saved?.top)) return saved.top.filter(e => e && Number.isFinite(e.score) && e.score > 0).slice(0, LONG);
  const best = Number(saved?.best);
  return best > 0 ? [{ score: best, date: null }] : [];
}

// A score onto a top five: the five as they are with it, and where it went (0 at the top, -1 when it didn't make the
// list). A score level with one already there goes in under it, and a round that scored nothing doesn't go in at all.
export function place(list, score, date = dayKey()) {
  if (!(score > 0)) return { list, rank: -1, entry: null };
  const entry = { score, date };
  const next = [...list, entry].sort((a, b) => b.score - a.score).slice(0, LONG); // (a sort keeps level ones in order)
  return { list: next, rank: next.indexOf(entry), entry };
}

// What an end card says of a round that went onto the list under the top: 'Number 3 on your list. ' (the top is a new
// best, said on its own). Nothing otherwise.
export const onList = rank => (rank > 0 ? `Number ${rank + 1} on your list. ` : '');

// The all-time totals: since (the day the arcade started counting), tickets won, prizes traded, and rounds played on
// each machine ({ 'roll-up': 12, ... }). Anything that can't be read counts as none.
export function readTotals() {
  let t = null;
  try { t = JSON.parse(localStorage.getItem(TOTALS)); } catch { /* none yet, or storage is off */ }
  const ok = t && typeof t === 'object' && !Array.isArray(t);
  const n = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const rounds = {};
  if (ok && t.rounds && typeof t.rounds === 'object' && !Array.isArray(t.rounds)) for (const [k, v] of Object.entries(t.rounds)) if (n(v)) rounds[k] = n(v);
  return { since: ok && typeof t.since === 'string' ? t.since : null, tickets: ok ? n(t.tickets) : 0, traded: ok ? n(t.traded) : 0, rounds };
}

// Something to count: { tickets } won, a { round } played on a machine (by its folder's name), or a prize { traded }
// (-1: a trade taken back at the counter).
export function count({ tickets = 0, round = null, traded = 0 } = {}) {
  const t = readTotals();
  t.since ||= dayKey();
  t.tickets += Math.max(0, Math.floor(Number(tickets)) || 0);
  if (typeof round === 'string' && round) t.rounds[round] = (t.rounds[round] || 0) + 1;
  t.traded = Math.max(0, t.traded + (Math.trunc(Number(traded)) || 0));
  try { localStorage.setItem(TOTALS, JSON.stringify(t)); } catch { /* storage full or off: play goes on uncounted */ }
  return t;
}
