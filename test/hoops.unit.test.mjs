// Hoops' court on its own, without a browser:  node --test test/hoops.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourt, ticketsFor, power, flickFor, floorY, FLICK, SWEET, R, BALLS, ROUND, SLIDE, BONUS, CAGE, HOOP, RAMP, LAUNCH } from '../hoops/js/court.js';

function seeded(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const run = (c, s, each = () => {}) => { for (let i = 0; i < Math.round(s * 60); i++) { c.step(1 / 60); if (each(c) === true) return true; } return false; };
const events = c => c.take();
// Wait for a ball in the pocket, then throw it at a sweet flick, aimed where the hoop will be when it gets there.
const ready = c => run(c, 6, c => !!c.pocket());
function ahead(c) {
  const h = c.hoop, period = c.bonus ? 4 : 5.5;
  const x = h.amp * Math.sin(h.phase + 2 * Math.PI * 0.78 / period);
  return Math.atan2(x - LAUNCH.x, HOOP.z - LAUNCH.z);
}
function sweet(c) { ready(c); return c.shoot(power(FLICK.sweet), ahead(c)); }
// Play on till a shot comes down one way or the other; returns its basket or miss event.
function outcome(c, ball) {
  let found = null;
  run(c, 5, c => { for (const e of events(c)) if (e.basket === ball.id || e.miss === ball.id) found = e; return !!found; });
  return found;
}

test('the four balls wait in a line down the ramp, the front one in the pocket', () => {
  const c = createCourt();
  run(c, 2);
  assert.equal(c.balls.length, BALLS);
  assert.equal(c.pocket(), c.balls[0]);
  assert.equal(c.balls.filter(b => b.gold).length, 1, 'one of them gold');
  for (const b of c.balls) {
    assert.ok(Math.abs(b.x) < 1, 'down the middle of the ramp');
    assert.ok(Math.hypot(b.vx, b.vy, b.vz) < 5, 'at rest');
    assert.ok(b.y > floorY(b.x, b.z) + R - 1.5, 'on the ramp, not in it');
  }
  for (let i = 1; i < BALLS; i++) {
    const a = c.balls[i - 1], b = c.balls[i];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 2 * R - 0.5, 'not inside each other');
  }
});

test('a sweet flick at a still hoop goes in, and the ball rolls back down to the line', () => {
  const c = createCourt();
  run(c, 1); events(c);
  assert.ok(Math.abs(flickFor(power(2)) - 2) < 1e-9, 'a flick and its throw undo each other');
  const b = c.shoot(power(FLICK.sweet), 0);
  assert.ok(b);
  assert.equal(c.shots, 1);
  assert.equal(b.y, LAUNCH.y);
  const e = outcome(c, b);
  assert.equal(e.basket, b.id);
  assert.equal(e.points, 2);
  assert.equal(c.score, 2);
  assert.equal(c.baskets, 1);
  // back down the ramp, behind the others, within a few seconds
  const back = run(c, 4, () => !b.shot && b.z < 90 && Math.hypot(b.vx, b.vy, b.vz) < 30 && b.y < floorY(b.x, b.z) + R + 2);
  assert.ok(back, `it came back (it's at z ${b.z.toFixed(0)})`);
});

test('the speeds that go in sit around a sweet flick: a bit softer misses, a bit harder still drops, off the board', () => {
  const tryAt = k => { const c = createCourt(); run(c, 1); events(c); const b = c.shoot(SWEET * k, 0); return outcome(c, b); };
  assert.ok(tryAt(0.9).miss !== undefined, 'short');
  assert.ok(tryAt(1.0).basket !== undefined, 'right in');
  assert.ok(tryAt(1.08).basket !== undefined, 'long, off the glass');
  assert.ok(tryAt(1.25).miss !== undefined, 'far too long');
  const wide = createCourt(); run(wide, 1); events(wide);
  assert.ok(outcome(wide, wide.shoot(power(FLICK.sweet), 0.12)).miss !== undefined, 'well wide');
  const flick = s => power(FLICK.sweet * s) / SWEET;
  assert.ok(flick(1) > 1.02 && flick(1) < 1.1, 'a sweet flick throws a touch past the middle of the hoop');
  assert.ok(flick(0.6) > 0.98 && flick(1.6) < 1.11, 'anything from about half the sweet flick to two-thirds harder again throws in range');
  assert.ok(flick(0.3) < 0.95 && flick(3) > 1.15, 'well off either way goes short or long');
});

test('only the ball in the pocket can be thrown: four in the air, and the fifth flick waits', () => {
  const c = createCourt();
  run(c, 1);
  const thrown = [];
  for (let i = 0; i < BALLS; i++) {
    run(c, 3, c => !!c.pocket());
    thrown.push(c.shoot(power(FLICK.sweet * 0.5), 0)); // short, so they land on the ramp and roll back
  }
  assert.equal(new Set(thrown.map(b => b && b.id)).size, BALLS, 'each ball thrown once');
  assert.equal(c.shoot(power(FLICK.sweet), 0), null, 'none left in the pocket');
  assert.ok(run(c, 6, c => !!c.pocket()), 'they come back');
});

test('the gold ball is worth double, three in a row set the rim alight, and a miss puts it out', () => {
  const c = createCourt({ timed: false });
  run(c, 1); events(c);
  const got = [];
  for (let i = 0; i < 4; i++) {
    const b = sweet(c);
    const e = outcome(c, b);
    assert.equal(e.basket, b.id, `throw ${i + 1} went in`);
    got.push({ ...e, wasFire: e.fire });
    if (i === 2) assert.ok(c.fire, 'alight after three');
  }
  for (const e of got) assert.equal(e.points, (2 + (e.fire ? 1 : 0)) * (e.gold ? 2 : 1));
  assert.ok(got.some(e => e.gold), 'the gold ball came round');
  assert.ok(!got[0].fire && !got[1].fire && !got[2].fire && got[3].fire, 'the fourth was thrown with the rim alight');
  assert.equal(c.streak, 4);
  ready(c);
  const short = c.shoot(power(FLICK.sweet * 0.4), 0);
  const seen = [];
  run(c, 4, c => { seen.push(...events(c)); return seen.some(e => e.miss === short.id); });
  assert.ok(seen.some(e => e.fire === false), 'it went out');
  assert.ok(!c.fire);
  assert.equal(c.streak, 0);
});

test('a round: the hoop stays still, then slides, then a basket is worth 3, then the buzzer', () => {
  const c = createCourt({ random: seeded(3) });
  const marks = {};
  let widest = 0;
  run(c, ROUND + 6, c => {
    for (const e of events(c)) if (typeof e === 'string') marks[e] ??= c.clock;
    if (c.clock < ROUND - SLIDE) assert.ok(c.hoop.x === 0, 'still at first');
    widest = Math.max(widest, Math.abs(c.hoop.x));
    return c.over;
  });
  assert.ok(Math.abs(marks.slide - (ROUND - SLIDE)) < 0.02, `slides from ${ROUND - SLIDE}s`);
  assert.ok(Math.abs(marks.bonus - (ROUND - BONUS)) < 0.02, `3 points from ${ROUND - BONUS}s`);
  assert.equal(marks.buzzer, ROUND);
  assert.ok(marks.over >= ROUND);
  assert.ok(widest > HOOP.slide * 0.8 && widest <= HOOP.slide + 0.01, `slides about ${HOOP.slide} either way (${widest.toFixed(1)})`);
  assert.equal(c.shoot(power(FLICK.sweet), 0), null, 'no throwing after the buzzer');
});

test('in the last ten seconds a basket is worth 3, and one in the air at the buzzer still counts', () => {
  const c = createCourt({ random: seeded(4) });
  run(c, ROUND - BONUS + 0.5); events(c);
  assert.ok(c.bonus);
  let made = null;
  for (let i = 0; i < 12 && !made; i++) {
    const b = sweet(c);
    const e = outcome(c, b);
    if (e.basket !== undefined) made = e;
  }
  assert.ok(made, 'one went in');
  assert.equal(made.points, (3 + (made.fire ? 1 : 0)) * (made.gold ? 2 : 1));
  // now one thrown just before time, landing after it
  let late = null;
  for (let tries = 0; tries < 30 && !late; tries++) {
    const d = createCourt({ random: seeded(10 + tries) });
    run(d, ROUND - 0.4);
    if (!d.pocket()) continue;
    events(d);
    const b = d.shoot(power(FLICK.sweet), ahead(d));
    const seen = [];
    run(d, 6, d => { seen.push(...events(d)); return d.over; });
    const e = seen.find(e => e.basket === b.id);
    if (e) { late = e; assert.ok(seen.indexOf('buzzer') < seen.indexOf(e), 'it went in after the buzzer'); assert.ok(e.buzzer); assert.ok(seen.indexOf(e) < seen.indexOf('over'), 'and the round waited for it'); }
  }
  assert.ok(late, 'a buzzer beater went in');
});

test('wherever they go, the balls stay in the machine and always come back', () => {
  const rnd = seeded(5);
  for (let round = 0; round < 3; round++) {
    const c = createCourt({ random: rnd });
    let wait = 0;
    run(c, ROUND + 4, c => {
      wait -= 1 / 60;
      if (wait <= 0 && c.pocket() && !c.buzzer) { c.shoot(power(FLICK.sweet * (0.5 + rnd() * 1.4)), (rnd() - 0.5) * 0.5); wait = 0.3 + rnd() * 0.6; }
      for (const b of c.balls) {
        assert.ok(Math.abs(b.x) <= CAGE.half - R + 1, 'inside the side nets');
        assert.ok(b.y <= CAGE.roof - R + 1, 'under the roof');
        assert.ok(b.z <= CAGE.back - R + 1, 'in front of the back');
        assert.ok(b.y >= floorY(b.x, b.z) + R - 2.5, 'not through the ramp');
      }
    });
    assert.ok(c.over);
    run(c, 6);
    for (const b of c.balls) assert.ok(b.z < RAMP.z0 + 4 * 2 * R && Math.hypot(b.vx, b.vy, b.vz) < 20, `ball ${b.id} came back down (z ${b.z.toFixed(0)})`);
  }
});

test('a ticket for every 4 points', () => {
  assert.equal(ticketsFor(0), 0);
  assert.equal(ticketsFor(3), 0);
  assert.equal(ticketsFor(4), 1);
  assert.equal(ticketsFor(121), 30);
});
