// Roll Up's physics and scoring on their own, without a browser:  node --test test/roll-up.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, RINGS, HOLES, BOARD, R } from '../roll-up/js/physics.js';

const still = () => 0.5; // the shake for a stuck ball, made predictable

test('a straight roll climbs the rings as it gets firmer, then sails over into the 10', () => {
  const cases = [[180, [0, 10]], [250, [20]], [280, [30]], [305, [40]], [332, [50]], [380, [10]]];
  for (const [speed, want] of cases) {
    const b = simulate(0, speed, 0, still);
    assert.ok(want.includes(b.value), `a ${speed} roll scored ${b.value} (${b.why}), expected ${want.join(' or ')}`);
  }
});

test('a ball in the trough knows how far up the board it got: past the 50 when rolled too hard, short of the 20 when soft', () => {
  const fifty = RINGS.find(r => r.value === 50), twenty = RINGS.find(r => r.value === 20);
  const hard = simulate(0, 450, 0, still);
  assert.equal(hard.why, 'trough');
  assert.ok(hard.top > fifty.s + fifty.r, `a hard roll got to ${hard.top.toFixed(1)} up the board, past the 50`);
  assert.equal(hard.net, true, 'and into the net');
  const soft = simulate(0, 220, 0, still);
  assert.equal(soft.why, 'trough');
  assert.ok(soft.top < twenty.s - twenty.r, `a soft one got to ${soft.top.toFixed(1)}, short of the 20`);
  assert.equal(soft.net, false);
  const fair = simulate(0, 280, 0, still);
  assert.ok(fair.top > twenty.s - twenty.r && fair.top < fifty.s + fifty.r && !fair.net, 'a fair one in between');
});

test('a roll too gentle to clear the jump rolls back for nothing', () => {
  const b = simulate(0, 150, 0, still);
  assert.equal(b.value, 0);
  assert.equal(b.why, 'short');
});

test('a firm roll angled at a corner can drop into a 100', () => {
  const b = simulate(26, 374, 0, still);
  assert.equal(b.value, 100);
  assert.equal(simulate(-26, 374, 0, still).value, 100, 'the left corner works the same way');
});

test('every roll ends, with a score the machine has', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const allowed = new Set([0, 10, 20, 30, 40, 50, 100]);
  for (let i = 0; i < 300; i++) {
    const b = simulate((rnd() - 0.5) * 80, 120 + rnd() * 320, (rnd() - 0.5) * 40, rnd);
    assert.equal(b.state, 'done', `roll ${i} never finished`);
    assert.ok(allowed.has(b.value), `roll ${i} scored ${b.value}`);
    assert.ok(b.t < 15, `roll ${i} took ${b.t.toFixed(1)}s`);
  }
});

test('each hole sits inside its own ring and clear of the ring inside it', () => {
  for (const [i, hole] of HOLES.entries()) {
    const ring = RINGS[i];
    const out = Math.hypot(hole.u - ring.u, hole.s - ring.s) + hole.r;
    assert.ok(out <= ring.r, `the ${hole.value} hole pokes through its ring`);
    if (hole.value < 50) {
      const inner = RINGS[i + 1];
      const gap = Math.hypot(hole.u - inner.u, hole.s - inner.s) - hole.r;
      assert.ok(gap >= inner.r - 0.01, `the ${hole.value} hole runs under the ${inner.value} ring`);
    }
    assert.ok(hole.r > R, 'a ball has to fit through every hole');
    assert.ok(Math.abs(hole.u) + hole.r < BOARD.half && hole.s + hole.r < BOARD.len, `the ${hole.value} hole is off the board`);
  }
});

test("today's card is the same all day, different the next, and fair", async () => {
  const { cardFor, dayKey, dayBefore, points, shareLine } = await import('../roll-up/js/daily.js');
  assert.deepEqual(cardFor('2026-10-18'), cardFor('2026-10-18'), 'everyone gets the same card');
  assert.notDeepEqual(cardFor('2026-10-18').calls, cardFor('2026-10-19').calls, 'a new card each day');
  for (let d = 1; d <= 120; d++) {
    const key = dayKey(new Date(2026, 0, d, 12));
    const c = cardFor(key);
    assert.equal(c.calls.length, 9);
    assert.ok(c.calls.every(v => [20, 30, 40, 50, 100].includes(v)), `${key}: calls ${c.calls}`);
    assert.ok(c.calls.filter(v => v === 100).length <= 1, `${key}: one 100 at most`);
    assert.ok(c.golden >= 0 && c.golden < 9);
  }
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  assert.deepEqual(points(40, { call: 40 }), { points: 80, hit: true });
  assert.deepEqual(points(40, { call: 30, golden: true }), { points: 80, hit: false });
  assert.deepEqual(points(100, { call: 100, golden: true }), { points: 400, hit: true });
  assert.deepEqual(points(0, { call: 20, golden: true }), { points: 0, hit: false });
  // the line to send: where Roll Up is now (the old roll-up.junkdrawer.works only forwards), with commas, and the run
  // of days played once there's one
  assert.equal(shareLine('2026-10-18', 340, [true, false, true]), 'Roll Up · Sun 18 Oct · 340\n★☆★\nfree-play.junkdrawer.works/roll-up/');
  assert.equal(shareLine('2026-10-27', 1240, [true, true], 1), 'Roll Up · Tue 27 Oct · 1,240\n★★\nfree-play.junkdrawer.works/roll-up/');
  assert.equal(shareLine('2026-10-27', 440, [false, true], 3), 'Roll Up · Tue 27 Oct · 440 · 3 days in a row\n☆★\nfree-play.junkdrawer.works/roll-up/');
});
