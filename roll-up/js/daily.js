// Today's card: nine called shots, the same for everyone on a given day, and which of the nine is the golden ball.
// Hit the called hole and that ball scores double; the golden ball scores double too, so a called shot with it is ×4.
// The day is the player's own calendar day, so the card changes at their midnight. Once its first ball is rolled, a
// card is yours: left part-way, it's kept where it was (settle() below), and it can't be started again.

import { dayKey, dayBefore, seeded } from '../../shared/calendar.js';
export { dayKey, dayBefore }; // (the days are the arcade's: ../../shared/calendar.js)

export const BALLS = 9;
export const ticketsFor = score => Math.floor(score / 10); // a ticket for every 10 points

// How often each hole gets called: mostly the middle rings, a 50 now and then, a 100 rarely.
const DRAW = [20, 20, 30, 30, 30, 40, 40, 40, 50, 50, 100];

// The card for a day: drawn from the date with the arcade's seeded random, so every phone draws the same one.
export function cardFor(key) {
  const r = seeded('roll-up:' + key);
  const calls = [];
  let hundreds = 0;
  while (calls.length < 9) {
    const v = DRAW[Math.floor(r() * DRAW.length)];
    if (v === 100 && hundreds) continue; // one 100 a day at most
    if (v === 100) hundreds++;
    calls.push(v);
  }
  return { key, calls, golden: Math.floor(r() * 9) };
}

// Roll Up's save once a card left part-way on an earlier day has counted as played that day, with the balls rolled
// (going: { key, score, balls }, the card on the go). It's a card like any other from then on: it keeps the run of days
// going, and it pays the tickets its balls scored (its daily.won: Roll Up pays them when it next opens and finds it;
// the floor only reads this). Today's card on the go, or none, leaves the save as it is.
export function settle(s, today = dayKey()) {
  const g = s && s.going;
  if (!g || g.key === today) return s;
  const { going, ...rest } = s;
  // (one with no day, or older than a card already played, is nothing to count)
  if (typeof g !== 'object' || typeof g.key !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(g.key) || (s.daily?.key && s.daily.key >= g.key)) return rest;
  const balls = Array.isArray(g.balls) ? g.balls.slice(0, BALLS) : [];
  const score = balls.reduce((t, b) => t + (Number(b?.points) || 0), 0);
  const prev = s.daily;
  const streak = prev && prev.key === dayBefore(g.key) && Array.isArray(prev.balls) ? (Number(prev.streak) || 1) + 1 : 1;
  const won = ticketsFor(score);
  return { ...rest, games: (Number(s.games) || 0) + 1, longest: Math.max(Number(s.longest) || 0, streak), daily: { key: g.key, score, balls, won, streak, unfinished: true } };
}

// What a ball is worth: its hole, doubled for a called shot, doubled again for the golden ball.
export function points(value, { call = null, golden = false } = {}) {
  const hit = call != null && value === call;
  return { points: value * (hit ? 2 : 1) * (golden ? 2 : 1), hit };
}

// The line to send someone: the day, the score, the run of days played when there's one, a star for each call hit, and
// where Roll Up is.
export function shareLine(key, score, marks, streak = 1) {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y, m - 1, d, 12).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const run = streak > 1 ? ` · ${streak} days in a row` : '';
  return `Roll Up · ${day} · ${score.toLocaleString('en-US')}${run}\n${marks.map(h => (h ? '★' : '☆')).join('')}\nfree-play.junkdrawer.works/roll-up/`;
}
