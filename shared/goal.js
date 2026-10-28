// Saving up for a prize: the one prize at the counter picked to save up for ('Save up for this', in shared/counter.js),
// and what the floor's pocket and every end card say about it: '180 to go for the giant teddy bear'. It's kept in a save
// of its own (free-play.goal: { id }), apart from the pocket, and it goes when the prize is traded for.

import { PRIZES } from './prizes.js';

export const KEY = 'free-play.goal';

// The prize being saved up for, or null: none picked, or one the counter doesn't sell (any more).
export function goal() {
  let g = null;
  try { g = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  return PRIZES.find(p => p.id === g?.id) || null;
}

// Picks a prize to save up for (null: none). Every page hears about it, as free-play:goal.
export function saveFor(prize) {
  const p = prize && PRIZES.find(q => q.id === prize.id);
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify({ id: p.id }));
    else localStorage.removeItem(KEY);
  } catch { /* storage off: nothing to remember it by */ }
  dispatchEvent(new CustomEvent('free-play:goal', { detail: p || null }));
  return p || null;
}

const count = n => n.toLocaleString('en-US');
const named = p => p.name.toLowerCase();

// What an end card says under the dispenser, for a pocket of `tickets`: '180 to go for the giant teddy bear', or
// 'Enough for the giant teddy bear!' ('' with no goal).
export function goalLine(tickets, g = goal()) {
  if (!g) return '';
  const n = g.cost - tickets;
  return n > 0 ? `${count(n)} to go for the ${named(g)}` : `Enough for the ${named(g)}!`;
}

// And the floor's pocket, after its count of tickets: '180 to the giant teddy bear', or 'Enough for the giant teddy bear!'.
export function goalShort(tickets, g = goal()) {
  if (!g) return '';
  const n = g.cost - tickets;
  return n > 0 ? `${count(n)} to the ${named(g)}` : `Enough for the ${named(g)}!`;
}
