// Roll Up's physics and scoring on their own, without a browser:  node --test test/roll-up.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, flick, newBall, launch, advance, ground, RINGS, HOLES, BOARD, R, STEP } from '../roll-up/js/physics.js';

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
  for (let i = 0; i < 400; i++) {
    // the hardest flicks roll at 1,000 cm/s and more, and the widest go more across the lane than up it
    const fast = i >= 300, sp = fast ? 400 + rnd() * 900 : 120 + rnd() * 320, a = (rnd() - 0.5) * (fast ? 2.4 : 0.5);
    const b = simulate(sp * Math.sin(a), sp * Math.cos(a), (rnd() - 0.5) * 40, rnd);
    assert.equal(b.state, 'done', `roll ${i} never finished`);
    assert.ok(allowed.has(b.value), `roll ${i} scored ${b.value}`);
    assert.ok(b.t < 15, `roll ${i} took ${b.t.toFixed(1)}s`);
  }
});

// A flick as the finger makes it: `speed` cm/s along the lane, `angle` radians off straight up it.
const flickAt = (speed, angle) => flick(speed * Math.sin(angle), speed * Math.cos(angle));
// Rolled from where the finger let go of it: x across the lane, z up it.
function rollFrom(v, x, z, random) {
  const b = newBall(x);
  b.z = z; b.y = ground(z) + R;
  launch(b, v.vx, v.vz);
  for (let i = 0; i < 20 * 600 && b.state !== 'done'; i++) advance(b, STEP, [], random);
  return b;
}
const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

test('a flick up to what the 50 needs rolls just as it always has', () => {
  // as it was: the speed eased toward 420, the angle 0.85 of the finger's (and no flick that rolls the 50 is wider)
  for (let speed = 80; speed <= 850; speed += 10) for (let angle = -0.37; angle <= 0.37; angle += 0.037) {
    const was = 420 * (1 - Math.exp(-speed / 480)), a = angle * 0.85, now = flickAt(speed, angle);
    assert.ok(Math.abs(now.vx - was * Math.sin(a)) < 1e-9 && Math.abs(now.vz - was * Math.cos(a)) < 1e-9, `a ${speed} cm/s flick at ${angle.toFixed(2)}`);
  }
});

test('a flick harder than the 50 needs rolls harder still, and sails over the rings into the 10', () => {
  let last = 0;
  for (let speed = 100; speed <= 6000; speed += 50) {
    const v = Math.hypot(flickAt(speed, 0).vx, flickAt(speed, 0).vz);
    assert.ok(v > last, `a ${speed} cm/s flick rolls at ${v.toFixed(0)}, no harder than one 50 slower`);
    last = v;
  }
  const at = speed => Math.hypot(flickAt(speed, 0).vx, flickAt(speed, 0).vz);
  assert.ok(at(2000) > 500 && at(4000) > 800, `flicks of 2,000 and 4,000 cm/s roll at ${at(2000).toFixed(0)} and ${at(4000).toFixed(0)}`);
  // straight up the lane, from across it and from anywhere a flick lets go
  const rnd = seeded(5);
  let tens = 0, n = 0;
  for (const speed of [1000, 1500, 2000, 3000, 4000]) for (const x of [-12, -6, 0, 6, 12]) for (const z of [18, 38, 58]) {
    n++;
    if (rollFrom(flickAt(speed, 0), x, z, rnd).value === 10) tens++;
  }
  assert.ok(tens >= n * 0.8, `${tens} of ${n} of the hardest straight flicks went in the 10`);
});

test('the widest flicks go as wide as the finger does, however wide', () => {
  let last = -Infinity, least = Infinity;
  for (let deg = -89; deg <= 89; deg += 1) {
    const v = flickAt(1500, deg * Math.PI / 180), a = Math.atan2(v.vx, v.vz);
    if (last > -Infinity) least = Math.min(least, (a - last) / (Math.PI / 180));
    last = a;
  }
  assert.ok(least >= 0.4, `a degree more on the flick turned the roll by as little as ${least.toFixed(2)} of a degree`);
});

// The hardest flick used to be one roll: the speed eased to 420 cm/s and the angle stopped at a limit, so a flick as
// hard and wide as it goes, from about 10 cm off the middle, banked off the wall into the far 100 nine times in nine.
// Now a player flicking as hard as they can (anywhere from 2,000 to 4,000 cm/s), and as wide as they like, with a
// natural wobble in the angle, doesn't get a 100 on more than about 2 rolls in 5 from anywhere on the lane.
test('the hardest, widest flick is a long shot at a 100 from anywhere', () => {
  const rnd = seeded(11), wobble = seeded(12);
  const gauss = () => Math.sqrt(-2 * Math.log(wobble() + 1e-12)) * Math.cos(2 * Math.PI * wobble());
  let worst = { p: 0 };
  for (const z of [18, 38, 58]) for (const x of [-18, -10, -4, 4, 10, 18]) for (const angle of [0.4, 0.6, 0.8, 1]) {
    let hits = 0; const N = 40;
    for (let i = 0; i < N; i++) if (rollFrom(flickAt(2000 + rnd() * 2000, angle + gauss() * 2.5 * Math.PI / 180), x, z, rnd).value === 100) hits++;
    if (hits / N > worst.p) worst = { p: hits / N, x, z, angle };
  }
  assert.ok(worst.p <= 0.4, `from x ${worst.x}, z ${worst.z} at ${worst.angle} the hardest flick dropped in a 100 ${(worst.p * 100).toFixed(0)}% of the time`);
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

test("today's card left part-way waits all day, and counts as played at midnight with the balls rolled", async () => {
  const { settle } = await import('../roll-up/js/daily.js');
  const ball = (value, points = value) => ({ value, points, golden: false, call: 30, hit: false });
  const going = { key: '2026-10-27', score: 150, balls: [ball(50), ball(30, 60), ball(40)] };
  // on its own day it's still on the go: nothing changes
  const today = { best: 200, games: 4, going };
  assert.equal(settle(today, '2026-10-27'), today);
  // the next day it's played: the balls rolled, what they scored and pay, and the run of days
  const s = settle({ ...today, daily: { key: '2026-10-26', score: 210, balls: [], streak: 3 } }, '2026-10-28');
  assert.equal(s.going, undefined, "it isn't on the go any more");
  assert.deepEqual(s.daily, { key: '2026-10-27', score: 150, balls: going.balls, won: 15, streak: 4, unfinished: true });
  assert.equal(s.games, 5, 'a game played');
  assert.equal(s.best, 200, "and a card's score isn't a regular game's best");
  // a run of days starts again after a day missed, and a card with no balls rolled is played for nothing
  assert.equal(settle({ going, daily: { key: '2026-10-20', balls: [], streak: 6 } }, '2026-10-29').daily.streak, 1);
  assert.deepEqual(settle({ going: { key: '2026-10-27', balls: [] } }, '2026-10-28').daily, { key: '2026-10-27', score: 0, balls: [], won: 0, streak: 1, unfinished: true });
  // one with no day, or a day already played, is dropped without counting
  for (const bad of [{ going: { balls: [] } }, { going: 'x' }, { going: { key: '2026-10-27', balls: [] }, daily: { key: '2026-10-27', balls: [] } }]) {
    const t = settle(bad, '2026-10-28');
    assert.equal(t.going, undefined, JSON.stringify(bad));
    assert.equal(t.daily, bad.daily, JSON.stringify(bad));
  }
});
