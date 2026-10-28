// Records: each machine's top five, with the day each was set. A machine keeps its top five in its own save
// (top: [{ score, date }], best first), beside the best it already kept.

import { dayKey } from './calendar.js';

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
