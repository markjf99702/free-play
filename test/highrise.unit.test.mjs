// Highrise's rules on their own, without a browser:  node --test test/highrise.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTower, payout, most, stepMs, COLS, FLOORS, MINOR, MINOR_BONUS, MAJOR_BONUS } from '../highrise/js/tower.js';
import { TROPHIES, PRIZES, PLUSH, TRINKETS } from '../shared/prizes.js';

test('the row bounces from wall to wall a window at a time, from the other side on each floor', () => {
  const t = createTower();
  const step = stepMs(1), seen = [];
  for (let i = 0; i < 10; i++) seen.push(t.moverAt(i * step + 1));
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1], 'three windows wide, so its left end goes from 0 to 4 and back');
  t.place(2);
  assert.equal(t.moverAt(0), COLS - 3, 'floor 2 sets off from the right');
  assert.equal(t.moverAt(stepMs(2) + 1), COLS - 4);
});

test('it gets faster as it climbs, and narrower: three windows, then two from floor 6, then one from 11', () => {
  for (let f = 2; f <= FLOORS; f++) assert.ok(stepMs(f) <= stepMs(f - 1));
  assert.ok(stepMs(1) >= 140 && stepMs(FLOORS) >= 60 && stepMs(FLOORS) < 70, `${stepMs(1)}ms to ${stepMs(FLOORS)}ms a window`);
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
