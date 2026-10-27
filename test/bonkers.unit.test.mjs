// Bonkers' burrow on its own, without a browser:  node --test test/bonkers.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBurrow, route, ticketsFor, HOLES, NODES, EDGES, ROUND, FRENZY, POINTS, MISS, RUN } from '../bonkers/js/burrow.js';

function seeded(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const run = (b, s, each = () => {}) => { for (let i = 0; i < Math.round(s * 60); i++) { b.step(1 / 60); each(b); } };
const upIn = b => b.moles.find(m => m.state === 'rising' && m.rise > 0.6);
const near = (x, y, [ax, ay], [bx, by]) => {
  const l2 = (bx - ax) ** 2 + (by - ay) ** 2, t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
};

test('every hole and burrow can be reached from every other, through the tunnels', () => {
  for (const a of Object.keys(NODES)) for (const b of Object.keys(NODES)) {
    const path = route(a, b);
    assert.equal(path[0], a); assert.equal(path.at(-1), b);
    for (let i = 1; i < path.length; i++) assert.ok(EDGES.some(([p, q]) => (p === path[i - 1] && q === path[i]) || (q === path[i - 1] && p === path[i])), `${path[i - 1]} to ${path[i]} isn't a tunnel`);
  }
});

test('the moles stay in their tunnels, and only ever come up through the holes', () => {
  const b = createBurrow({ random: seeded(1) });
  run(b, ROUND, b => {
    for (const m of b.moles) {
      const off = Math.min(...EDGES.map(([p, q]) => near(m.x, m.y, NODES[p], NODES[q])));
      assert.ok(off < 0.5, `a mole is ${off.toFixed(1)} out of the tunnels at ${m.x.toFixed(0)}, ${m.y.toFixed(0)}`);
      if (m.rise > 0) assert.ok(m.hole >= 0 && m.x === HOLES[m.hole] && m.y === 0, 'up, it is in a hole');
    }
    const holes = b.moles.filter(m => m.rise > 0).map(m => m.hole);
    assert.equal(new Set(holes).size, holes.length, 'never two moles in one hole');
  });
});

test('a round lasts 45 seconds, with a frenzy for the last ten, and gets busier as it goes', () => {
  const b = createBurrow({ random: seeded(2) });
  const pops = [0, 0, 0];
  let frenzyAt = null;
  run(b, ROUND + 1, b => {
    for (const e of b.take()) {
      if (e === 'frenzy') frenzyAt = b.clock;
      if (e.pop !== undefined) pops[b.clock < 15 ? 0 : b.clock < ROUND - FRENZY ? 1 : 2]++;
    }
  });
  assert.ok(b.over);
  assert.ok(Math.abs(frenzyAt - (ROUND - FRENZY)) < 0.05);
  const rates = [pops[0] / 15, pops[1] / (ROUND - FRENZY - 15), pops[2] / FRENZY];
  assert.ok(rates[0] > 0.5, `${rates[0].toFixed(2)} pops a second to start`);
  assert.ok(rates[2] > rates[0], `busier in the frenzy (${rates.map(r => r.toFixed(2)).join(', ')})`);
  assert.equal(b.swing(HOLES[2], -40), null, 'no swinging once the round is over');
});

test('a bonk on a mole that is up scores; a swing at nothing, or at a peek, costs 5 and ends the run', () => {
  const b = createBurrow({ random: seeded(3) });
  let m;
  while (!(m = upIn(b)) || m.hat) b.step(1 / 60);
  const before = b.score, kind = m.gold ? 'gold' : 'mole';
  const r = b.swing(HOLES[m.hole], -40);
  assert.ok(r.hit);
  assert.equal(b.score - before, POINTS[kind]);
  assert.equal(m.state, 'falling', 'bonked, it goes down seeing stars');
  assert.equal(b.run, 1);
  const empty = HOLES.findIndex((_, i) => !b.moles.some(x => x.hole === i));
  const s2 = b.score;
  assert.equal(b.swing(HOLES[empty], -40).hit, false);
  assert.equal(b.score, Math.max(0, s2 - MISS));
  assert.equal(b.run, 0);
  assert.equal(b.swing(600, -40), null, 'a swing off the lawn is not a swing at a hole');
  assert.equal(b.swing(HOLES[1], 120), null, 'nor is one at the ground under it');
  // a peeking mole can't be bonked
  let peek;
  while (!(peek = b.moles.find(x => x.state === 'peeking')) && !b.over) b.step(1 / 60);
  assert.ok(peek, 'a mole peeks in a round');
  b.take();
  assert.equal(b.swing(HOLES[peek.hole], -40).hit, false);
  assert.ok(b.take().some(e => e.miss !== undefined && e.peeking), 'and the miss says it was only a peek');
});

test('a hard hat takes two bonks, and ten in a row are worth fifty more', () => {
  const b = createBurrow({ random: seeded(4) });
  let hat = null;
  run(b, 40, b => { if (!hat) { const m = upIn(b); if (m && m.hat) hat = m; } });
  assert.ok(hat, 'a mole in a hard hat comes up in a round');
  const b2 = createBurrow({ random: seeded(4) });
  let got = null, second = null;
  run(b2, 44, b => {
    const m = upIn(b);
    if (!m) return;
    if (m.hat && !got) { const before = b.score; assert.ok(b.swing(HOLES[m.hole], -40).hat); assert.equal(b.score, before, 'the first knocks the hat off'); got = m; return; }
    const r = b.swing(HOLES[m.hole], -40);
    if (m === got && !second) second = r;
  });
  assert.ok(got);
  assert.equal(second.kind, 'hat', 'the second bonks it, for 30');
  const runs = Math.floor(b2.bonks / RUN.every);
  assert.ok(b2.bonks >= 20 && b2.run === b2.bonks, 'every mole bonked, none missed');
  assert.ok(b2.score >= b2.bonks * POINTS.mole + runs * RUN.bonus);
});

test('a mole whose hat was knocked off, and which got away, is an ordinary 10 when it next pops up', () => {
  for (let seed = 1; seed < 400; seed++) {
    const b = createBurrow({ random: seeded(seed) });
    let hatless = null, left = false;
    while (!b.over) {
      b.step(1 / 60); b.take();
      if (!hatless) {
        const m = b.moles.find(m => m.state === 'rising' && m.rise > 0.5 && m.hat);
        if (m) { assert.ok(b.swing(HOLES[m.hole], -40).hat); hatless = m; }
        continue;
      }
      if (!left) { left = ['travel', 'rest', 'sniff', 'home'].includes(hatless.state); continue; }
      if (hatless.state === 'rising' && hatless.rise > 0.5 && !hatless.hat && !hatless.gold) {
        const r = b.swing(HOLES[hatless.hole], -40);
        assert.equal(r.points, 10, 'bareheaded, it is an ordinary mole');
        return;
      }
    }
  }
  assert.fail('no hard hat got away and came back in 400 rounds');
});

test('a ticket for every 15 points', () => {
  assert.deepEqual([0, 14, 15, 340, 690].map(ticketsFor), [0, 0, 1, 22, 46]);
});

test('a mole popping up says whether it is golden, or in a hard hat', () => {
  const b = createBurrow({ random: seeded(5) });
  const pops = [];
  run(b, ROUND, b => { for (const e of b.take()) if (e.pop !== undefined) { const m = b.moles.find(m => m.hole === e.pop && m.state === 'rising'); pops.push({ e, m: { gold: m.gold, hat: m.hat } }); } });
  assert.ok(pops.length > 30);
  for (const { e, m } of pops) {
    assert.equal(typeof e.gold, 'boolean');
    assert.equal(e.gold, m.gold, 'gold as the mole is');
    assert.equal(e.hat, !!m.hat, 'and its hat');
  }
  assert.ok(pops.some(p => p.e.gold) || pops.length < 60, 'a round has a golden mole in it');
});

// How hard it is, pinned: Mark played it and signed it off. The good player from the tuning bot he signed it off with
// (bonkers-bot.mjs) notices a pop after half a second, a little sooner if they saw it coming up the tunnels, now and
// then swings at a peek, and swings again straight away at a mole whose hat came off. Seeded, so it's the same 100
// rounds every run. Today they average about 505 a round; a change to the pace, the pops or the points that moves that
// by 75 or so shows up here.
test('how hard it is: a good player (who reacts in half a second) averages about 500 a round', () => {
  const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const pl = { react: 0.5, spread: 0.09, anticipate: 0.5, jumpy: 0.15, busy: 0.15 };
  const scores = [];
  for (let s = 1; s <= 100; s++) {
    const r = seeded(s * 31 + 4), b = createBurrow({ random: seeded(s) });
    const queue = []; let freeAt = 0;
    while (!b.over) {
      b.step(1 / 60);
      for (const e of b.take()) {
        if (e.pop !== undefined) queue.push({ hole: e.pop, at: b.clock + Math.max(0.12, pl.react - (r() < pl.anticipate ? 0.15 : 0) + gauss(r) * pl.spread) });
        if (e.peek !== undefined && r() < pl.jumpy) queue.push({ hole: e.peek, at: b.clock + pl.react * 0.8 });
      }
      queue.sort((a, c) => a.at - c.at);
      while (queue.length && queue[0].at <= b.clock && b.clock >= freeAt) {
        const q = queue.shift();
        b.swing(HOLES[q.hole], -40);
        freeAt = b.clock + pl.busy;
        for (const e of b.take()) if (e.hat !== undefined) queue.unshift({ hole: e.hat, at: b.clock + pl.busy });
      }
    }
    scores.push(b.score);
  }
  const mean = scores.reduce((a, c) => a + c, 0) / scores.length;
  assert.ok(mean >= 430 && mean <= 580, `a good player averaged ${mean.toFixed(0)}`);
});
