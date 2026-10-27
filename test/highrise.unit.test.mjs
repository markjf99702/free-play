// Highrise's rules on their own, without a browser:  node --test test/highrise.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTower, payout, most, stepMs, COLS, FLOORS, MINOR, MINOR_BONUS, MAJOR_BONUS } from '../highrise/js/tower.js';
import { TROPHIES, PRIZES, PLUSH, TRINKETS } from '../shared/prizes.js';

test('the row bounces from wall to wall a window at a time', () => {
  const t = createTower({ random: () => 0 });
  const step = stepMs(1), seen = [];
  for (let i = 0; i < 10; i++) seen.push(t.moverAt(i * step + 1));
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1], 'three windows wide, so its left end goes from 0 to 4 and back');
});

test('each row sets off from somewhere new, either way, so no spot on the floor gets a head start', () => {
  let seed = 5;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const starts = new Map();
  for (let game = 0; game < 800; game++) {
    const t = createTower({ random });
    const a = t.moverAt(0), b = t.moverAt(stepMs(1) + 1);
    assert.equal(Math.abs(a - b), 1, 'one window at a time');
    const key = `${a}${b > a ? '>' : '<'}`;
    starts.set(key, (starts.get(key) || 0) + 1);
  }
  // three wide: the left end sets off from 0 to 4, heading right from 0 to 3 and left from 4 to 1
  assert.deepEqual([...starts.keys()].sort(), ['0>', '1<', '1>', '2<', '2>', '3<', '3>', '4<']);
  for (const n of starts.values()) assert.ok(n > 60 && n < 140, 'each about as often as the others');
  // and a floor built doesn't decide where the next one starts
  const t = createTower({ random }), next = new Set();
  for (let i = 0; i < 12; i++) { t.place(2); next.add(t.moverAt(0)); }
  assert.ok(next.size > 2, 'the rows above set off from different places');
});

test('it gets faster as it climbs, and narrower: three windows, then two from floor 6, then one from 11', () => {
  for (let f = 2; f <= FLOORS; f++) assert.ok(stepMs(f) <= stepMs(f - 1));
  assert.ok(stepMs(1) >= 150 && stepMs(FLOORS) >= 70 && stepMs(FLOORS) < 80, `${stepMs(1)}ms to ${stepMs(FLOORS)}ms a window`);
  assert.deepEqual([1, 5, 6, 10, 11, 15].map(most), [3, 3, 2, 2, 1, 1]);
  const t = createTower();
  for (let f = 1; f <= 5; f++) t.place(2);
  assert.equal(t.width, 2, 'three lit windows on floor 5 still only make a row of two on floor 6');
  for (let f = 6; f <= 10; f++) t.place(2);
  assert.equal(t.width, 1);
});

test('windows hanging over the edge fall off, and the next row is only as wide as what stayed up', () => {
  const t = createTower();
  assert.deepEqual(t.place(1).kept, [1, 2, 3], 'the ground floor lands wherever it stops');
  const r = t.place(2);
  assert.deepEqual([r.kept, r.dropped, r.perfect], [[2, 3], [4], false]);
  assert.equal(t.width, 2);
  const p = t.place(2);
  assert.deepEqual([p.kept, p.perfect], [[2, 3], true]);
  const miss = t.place(4);
  assert.ok(miss.over, 'a row with nothing under it ends the game');
  assert.equal(t.built, 3, 'and builds no floor');
});

test('floor 11 is the minor prize, and the top floor the major', () => {
  const t = createTower();
  const results = [];
  for (let f = 1; f <= FLOORS; f++) results.push(t.place(3));
  assert.deepEqual(results.map(r => r.minor).indexOf(true) + 1, MINOR);
  assert.equal(results.filter(r => r.minor).length, 1);
  assert.ok(results[FLOORS - 1].top && results.slice(0, -1).every(r => !r.top));
  assert.equal(t.built, FLOORS);
});

test('a ticket a floor, the minor bonus if it was taken, and the major for the top', () => {
  assert.equal(payout({ built: 0 }), 0);
  assert.equal(payout({ built: 7 }), 7);
  assert.equal(payout({ built: MINOR, tookMinor: true }), MINOR + MINOR_BONUS);
  assert.equal(payout({ built: 13 }), 13, 'kept going and stopped short: just the floors');
  assert.equal(payout({ built: FLOORS }), FLOORS + MAJOR_BONUS);
});

test('the trophy has a place on the shelf', () => {
  const ids = [...PRIZES, ...PLUSH, ...TRINKETS, ...TROPHIES].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(TROPHIES[0].id, 'trophy-highrise');
});

// How hard it is, pinned: Mark played it and signed it off. A player who presses with about 35 ms of spread (and 5 ms
// late) picks the spot that keeps the most windows, waits for the row to get there, and presses in the middle of the
// moment it's there. Seeded, so it's the same 3,000 games every run. Today about 83% of them reach floor 11 and about
// 24% top out; a change to the speed, the widths or the start that moves either by 10 points shows up here.
test('how hard it is: a steady player reaches floor 11 about 83% of the time and tops out about 24%', () => {
  const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const random = seeded(3908), spread = seeded(124);
  const gauss = () => Math.sqrt(-2 * Math.log(spread() + 1e-12)) * Math.cos(2 * Math.PI * spread());
  const GAMES = 3000;
  let minor = 0, top = 0;
  for (let game = 0; game < GAMES; game++) {
    const t = createTower({ random });
    for (;;) {
      // the spot that keeps the most windows lit
      const below = t.rows[t.rows.length - 1];
      let target = 0, most = -1;
      for (let p = 0; p <= COLS - t.width; p++) {
        let kept = 0;
        for (let c = p; c < p + t.width; c++) if (!below || below.includes(c)) kept++;
        if (kept > most) { most = kept; target = p; }
      }
      // the first time the row gets there after a moment to look, and the press, aimed at the middle of its stay
      const step = stepMs(t.floor);
      let k = Math.ceil(400 / step);
      while (t.moverAt(k * step) !== target) k++;
      const r = t.place(t.moverAt(k * step + step / 2 + 5 + gauss() * 35));
      if (r.over || r.top) break;
    }
    if (t.built >= MINOR) minor++;
    if (t.built >= FLOORS) top++;
  }
  const pct = n => Math.round(n / GAMES * 1000) / 10;
  assert.ok(pct(minor) >= 73 && pct(minor) <= 93, `reached floor 11 in ${pct(minor)}% of games`);
  assert.ok(pct(top) >= 14 && pct(top) <= 34, `topped out in ${pct(top)}% of games`);
});
