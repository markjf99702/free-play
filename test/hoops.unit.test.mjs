// Hoops' court on its own, without a browser:  node --test test/hoops.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourt, ticketsFor, tipFor, reach, REACH, power, flickFor, readFlick, floorY, FLICK, SWEET, R, BALLS, ROUND, SLIDE, BONUS, CAGE, HOOP, RAMP, LAUNCH } from '../hoops/js/court.js';

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

// A finger's path up the screen: `ms` long, sampled every `every` ms, at `speed` px a second (times `grow` by the end,
// speeding up), leaning `lean` px across for every px up.
function stroke({ ms = 150, every = 8, speed = 1200, grow = 1, lean = 0, t0 = 1000, x = 195, y = 640 } = {}) {
  const s = [{ t: t0, x, y }];
  for (let t = every; t <= ms + 1e-9; t += every) {
    const v = speed * (1 + (grow - 1) * t / ms), p = s[s.length - 1], up = v * every / 1000;
    s.push({ t: t0 + t, x: p.x + lean * up, y: p.y - up });
  }
  return s;
}
// How the page read a flick before a rest before lifting counted: its last 90 ms, and the last 220 ms for its direction.
function readBefore(s) {
  const last = s[s.length - 1];
  const from = ms => { let i = s.length - 1; while (i > 0 && last.t - s[i - 1].t <= ms) i--; return s[i]; };
  const first = from(90), dt = (last.t - first.t) / 1000;
  if (dt <= 0.004 || last.y - first.y > -4) return null;
  const start = from(220);
  return { speed: Math.hypot(last.x - first.x, last.y - first.y) / dt, dx: last.x - start.x, dy: last.y - start.y };
}
// A thumb resting on the glass for `ms` after a stroke, trembling a pixel, before it lifts.
function rest(s, ms, every = 8) {
  const out = [...s], end = s[s.length - 1];
  for (let t = every, k = 0; t <= ms; t += every, k++) out.push({ t: end.t + t, x: end.x + (k % 2 ? 1 : -1), y: end.y + (k % 3 ? 0 : 1) });
  return out;
}

test('a clean flick is read just as it always was: its last tenth of a second', () => {
  for (const every of [4, 8, 16]) for (const grow of [1, 1.5, 3]) for (const lean of [0, 0.3, -0.5]) for (const ms of [60, 150, 400]) {
    const s = stroke({ every, grow, lean, ms }), now = readFlick(s), was = readBefore(s);
    assert.deepEqual(now, was, `a ${ms} ms flick every ${every} ms, ${grow}x faster by the end, leaning ${lean}`);
  }
  assert.equal(readFlick([{ t: 0, x: 195, y: 640 }]), null, 'a tap');
  const drag = Array.from({ length: 13 }, (_, i) => ({ t: 5000 + i * 100, x: 195, y: 640 - i * 18 }));
  assert.equal(readFlick(drag), null, 'a slow drag');
});

test('a flick that rests a moment before the finger lifts throws at the speed it reached', () => {
  for (const ms of [40, 100, 160, 200]) {
    const clean = stroke({ grow: 2 }), s = rest(clean, ms), now = readFlick(s), was = readBefore(s), want = readBefore(clean);
    assert.ok(now && Math.abs(now.speed / want.speed - 1) < 0.02, `rested ${ms} ms: read at ${now?.speed.toFixed(0)} px/s, the flick was ${want.speed.toFixed(0)}`);
    assert.ok(Math.abs(now.dx) < 2 && now.dy < -100, `and straight up the screen (${now.dx}, ${now.dy})`);
    if (ms >= 100) assert.ok(!was || was.speed < want.speed / 4, `read the old way it was ${was ? was.speed.toFixed(0) + ' px/s' : 'nothing'}`);
  }
  // resting longer than a quarter of a second isn't a flick
  assert.equal(readFlick(rest(stroke(), 400)), null, 'resting 400 ms');
});

test('a ticket for every 4 points', () => {
  assert.equal(ticketsFor(0), 0);
  assert.equal(ticketsFor(3), 0);
  assert.equal(ticketsFor(4), 1);
  assert.equal(ticketsFor(121), 30);
});

// How hard it is, pinned: Mark played it and signed off the retune. The steady player from the tuning bot it was
// retuned with (hoops-people.mjs) throws as soon as a ball is in the pocket, leads the sliding hoop by half, and flicks
// with a wobble in how hard and which way. Real players' natural flicks differ, so they play 6 rounds at each of five:
// from about a third softer than the sweet flick to about two thirds harder. Seeded, so it's the same 30 rounds every
// run. Today they average about 90 a round; a change to the rim, the ramp, the flick or the clock that moves that by
// 15 or 20 shows up here.
test('how hard it is: a steady player averages about 90 a round, whatever their natural flick', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(0.5); };
  const p = { s: 0.18, a: 3.5, gap: 0.9, lead: 0.5 };
  const scores = [];
  for (const bias of [-0.45, -0.25, 0, 0.25, 0.5]) for (let k = 0; k < 6; k++) {
    const c = createCourt({ random: rnd });
    let wait = 0.5;
    while (!c.over) {
      c.step(1 / 60); wait -= 1 / 60; c.take();
      if (wait <= 0 && c.pocket() && !c.buzzer) {
        const target = c.hoop.x + p.lead * c.hoop.vx * 0.78;
        c.shoot(power(FLICK.sweet * Math.exp(bias + gauss() * p.s)), Math.atan2(target, HOOP.z - LAUNCH.z) + gauss() * p.a * 0.71 * Math.PI / 180);
        wait = p.gap * (0.8 + 0.4 * rnd());
      }
    }
    scores.push(c.score);
  }
  const mean = scores.reduce((a, c) => a + c, 0) / scores.length;
  assert.ok(mean >= 75 && mean <= 110, `a steady player averaged ${mean.toFixed(0)}`);
});

test('the end card says to flick harder when most misses fell short, and softer when most went long', () => {
  // where a throw comes down through the hoop's height: the sweet one in the middle of it, softer short, harder long
  assert.ok(Math.abs(reach(SWEET)) < 0.01);
  assert.ok(reach(SWEET * 0.9) < REACH.short && reach(SWEET * 1.2) > REACH.long);
  assert.equal(reach(SWEET * 0.3), -Infinity, "one that never gets as high as the hoop");
  for (const [k, word, tip] of [[0.85, 'short', 'Most fell short: flick a little harder.'], [1.25, 'long', 'Most went long: flick a little softer.']]) {
    const c = createCourt({ random: seeded(5) });
    for (let i = 0; i < 3; i++) {
      ready(c);
      const b = c.shoot(SWEET * k, 0);
      outcome(c, b);
      assert.equal(c.misses, i + 1, `the ${word} throw ${i + 1} missed`);
      assert.equal(tipFor(c), i < 2 ? null : tip, `after ${i + 1} ${word}`);
    }
    assert.equal(c[word], 3);
  }
  // misses on line, by their aim, are neither
  const c = createCourt({ random: seeded(6) });
  for (let i = 0; i < 3; i++) { ready(c); outcome(c, c.shoot(SWEET, 0.2)); }
  assert.deepEqual([c.misses, c.short, c.long, tipFor(c)], [3, 0, 0, null]);
  // most, by the numbers: two of four isn't
  assert.equal(tipFor({ misses: 4, short: 2, long: 0 }), null);
  assert.equal(tipFor({ misses: 5, short: 1, long: 3 }), 'Most went long: flick a little softer.');
});
