// Today's special: one machine a day, the same for everyone, with a goal that about half of a casual player's rounds
// make, and 25 more tickets for making it, once a day. The floor says which (js/floor.js), the machine's title card
// repeats the goal, and its end card says when it's made. What's kept is the day it was last made, in a save of its
// own (free-play.special: { key, machine }).
//
// The goals come from the simulated players at the machines' pay rates: each is about the middle of a casual player's
// rounds (see the README). Clutch has no round with a score, so its goal is a plush named for the day, which about
// half of the simulated claw players' sittings of 20 goes win (6 in 10 aimed at the top of the heap, 4 in 10 dropped
// anywhere, 7 in 10 going after that plush).

import { dayKey, daysApart, seeded } from './calendar.js';
import { pay } from './wallet.js';
import { fmt } from './counter.js';
import { PLUSH } from './prizes.js';

export const KEY = 'free-play.special';
export const BONUS = 25;
// Tilt's goal is on one of its tables, drawn for the day with the machine, and Clutch's is one of its plush (any but
// the rare lucky star), drawn the same way.
export const GOALS = {
  tilt: { classic: 100000, space: 400000, haunted: 50000 },
  clutch: PLUSH.filter(p => !p.rare).map(p => p.kind),
  topple: 12, highrise: 10, popgun: 180, bonkers: 250, hoops: 55,
};
export const MACHINES = Object.keys(GOALS);
const NAMES = { tilt: 'Tilt', clutch: 'Clutch', topple: 'Topple', highrise: 'Highrise', popgun: 'Popgun', bonkers: 'Bonkers', hoops: 'Hoops' };
const TABLES = { classic: 'Classic', space: 'Space', haunted: 'Haunted House' };

// The machines, a run of days at a time: each run has every one of them once, in an order drawn for that run, and a
// run never starts with the machine that ended the run before, so it's never the same two days running.
const FIRST = '2026-01-05';
function run(n) {
  const r = seeded('special:' + n), order = [...MACHINES];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
function machineOn(key) {
  const d = daysApart(FIRST, key), n = Math.floor(d / MACHINES.length), order = run(n);
  if (order[0] === run(n - 1).at(-1)) [order[0], order[1]] = [order[1], order[0]];
  return order[d - n * MACHINES.length];
}

// The special for a day: { key, machine, name, goal, table (Tilt's), plush (Clutch's, its kind, which is its goal too),
// goalText ('score 250 in a round', 'win a plush frog') }.
export function specialFor(key = dayKey()) {
  const machine = machineOn(key);
  const s = { key, machine, name: NAMES[machine], table: null, plush: null, goal: GOALS[machine] };
  if (machine === 'tilt') {
    const ids = Object.keys(TABLES);
    s.table = ids[Math.floor(seeded('special-table:' + key)() * ids.length)];
    s.goal = GOALS.tilt[s.table];
  }
  if (machine === 'clutch') s.goal = s.plush = GOALS.clutch[Math.floor(seeded('special-plush:' + key)() * GOALS.clutch.length)];
  s.goalText = machine === 'tilt' ? `score ${fmt(s.goal)} on ${TABLES[s.table]}`
    : machine === 'clutch' ? `win ${PLUSH.find(p => p.kind === s.plush).say}`
      : machine === 'topple' ? `win ${s.goal} tickets in one cup`
        : machine === 'highrise' ? `build ${s.goal} floors`
          : `score ${fmt(s.goal)} in a round`;
  return s;
}

// Whether today's special has been made already (on any page, in any tab).
export function madeToday(key = dayKey()) {
  try { return JSON.parse(localStorage.getItem(KEY))?.key === key; } catch { return false; }
}

// Whether a round makes the special: { score } (Highrise's floors built, Topple's tickets in the cup), and Tilt's table;
// or on Clutch, a plush won: { kind }.
export const meets = (s, r) => !!r && (s.machine === 'clutch' ? r.kind === s.plush
  : Number(r.score) >= s.goal && (s.machine !== 'tilt' || r.table === s.table));

// A machine's round, at its end: if it's today's special, not made yet today, and the round makes it, it's made now and
// pays its 25 tickets into the pocket. Gives the tickets it paid (0 when it didn't).
export function claim(machine, result, key = dayKey()) {
  const s = specialFor(key);
  if (s.machine !== machine || madeToday(key) || !meets(s, result)) return 0;
  try { localStorage.setItem(KEY, JSON.stringify({ key, machine })); } catch { /* storage off: it pays all the same */ }
  pay(BONUS);
  return BONUS;
}

// What a machine's title card says about the special, when it's this machine's day: the goal, or that it's made.
export function titleLine(machine, key = dayKey()) {
  const s = specialFor(key);
  if (s.machine !== machine) return '';
  return madeToday(key) ? "Today's special: made. A new one tomorrow." : `Today's special: ${s.goalText} for ${BONUS} more tickets.`;
}
// What an end card says when the round made it.
export const endLine = paid => (paid ? `Today's special! ${paid} more tickets.` : '');
