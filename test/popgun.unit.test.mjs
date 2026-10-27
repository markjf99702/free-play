// Popgun's gallery on its own, without a browser:  node --test test/popgun.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGallery, ticketsFor, KINDS, ROWS, CORKS, FLIGHT, RELOAD, STREAK, W } from '../popgun/js/gallery.js';

function seeded(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const run = (g, s) => { for (let i = 0; i < Math.round(s * 60); i++) g.step(1 / 60); };
// A standing target that will still be in the booth when a cork gets there, and where to aim to meet it.
function lead(g, kind) {
  for (const row of g.rows) for (const t of row.targets) {
    if (t.hit || (kind && t.kind !== kind)) continue;
    const x = t.x + row.dir * row.now * FLIGHT;
    if (x > 60 && x < W - 60) return { t, row, x, y: row.rail - KINDS[t.kind].h / 2 };
  }
  return null;
}

test('the rows run their own ways at their own speeds, surging a little, and every target comes round again', () => {
  const g = createGallery({ random: seeded(1) });
  const before = g.rows.map(r => r.targets.map(t => t.x));
  run(g, 1);
  g.rows.forEach((row, i) => row.targets.forEach((t, j) => {
    const moved = ((t.x - before[i][j]) % row.loop + row.loop) % row.loop;
    const want = ((ROWS[i].dir * row.travel) % row.loop + row.loop) % row.loop;
    assert.ok(Math.abs(moved - want) < 1, `row ${i} moved ${moved.toFixed(1)}, its chain ${want.toFixed(1)}`);
  }));
  assert.deepEqual(g.rows.map(r => r.dir), [1, -1, 1], 'each row the other way from the one below');
  const seen = g.rows.map(() => [Infinity, 0]);
  for (let i = 0; i < 60 * 10; i++) { g.step(1 / 60); g.rows.forEach((r, n) => { seen[n][0] = Math.min(seen[n][0], r.now); seen[n][1] = Math.max(seen[n][1], r.now); }); }
  g.rows.forEach((r, n) => {
    assert.ok(seen[n][0] < r.speed * 0.85 && seen[n][1] > r.speed * 1.15, `row ${n} ran between ${seen[n][0].toFixed(0)} and ${seen[n][1].toFixed(0)}`);
    assert.ok(seen[n][0] > r.speed * 0.7 && seen[n][1] < r.speed * 1.3, 'but never much more or less');
  });
  run(g, 30);
  for (const row of g.rows) for (const t of row.targets) assert.ok(t.x >= -row.loop && t.x <= W + row.loop, 'nothing wanders off the conveyor');
});

test('a cork has to lead a moving target: aimed at where it is, it misses the fast ones', () => {
  const g = createGallery({ random: seeded(2) });
  run(g, 0.5);
  const star = lead(g, 'star');
  // where it is now, not where it'll be
  g.fire(star.t.x, star.y);
  run(g, FLIGHT + 0.02);
  const e = g.take().find(e => e.miss || e.hit);
  assert.ok(e.miss, 'a star moves its own width while the cork is in the air');
  run(g, RELOAD);
  const s2 = lead(g, 'star');
  g.fire(s2.x, s2.y);
  run(g, FLIGHT + 0.02);
  const e2 = g.take().find(e => e.miss || e.hit);
  assert.equal(e2.hit, 'star', 'led properly, it hits');
  assert.equal(g.score, KINDS.star.points);
  assert.ok(s2.t.hit, 'and the star goes down');
  run(g, 0.3);
  assert.equal(s2.t.down, 1);
});

test('a cork fired at a target that has moved on by the time it lands says which one it was behind', () => {
  const g = createGallery({ random: seeded(2) });
  run(g, 0.5);
  const star = lead(g, 'star');
  g.fire(star.t.x, star.y); // dead on its centre, as it is now
  run(g, FLIGHT + 0.02);
  const e = g.take().find(e => e.miss || e.hit);
  assert.equal(e.miss, true);
  assert.equal(e.behind, 'star', 'the star it was aimed at ran on, so the cork landed behind it');
  // at the empty backdrop, it was behind nothing
  run(g, RELOAD);
  g.fire(5, 5); run(g, FLIGHT + 0.02);
  const e2 = g.take().find(e => e.miss || e.hit);
  assert.equal(e2.miss, true);
  assert.equal(e2.behind, undefined);
  // and at a target another cork knocks down first, it wasn't behind it either: it missed a fallen tin
  run(g, RELOAD);
  const d = lead(g, 'duck');
  const x = d.t.x + d.row.dir * d.row.now * FLIGHT;
  g.fire(x, d.y);
  run(g, RELOAD + 0.01);
  g.fire(d.t.x, d.y);
  run(g, FLIGHT + 0.02);
  const after = g.take().filter(e => e.miss || e.hit);
  assert.equal(after[0].hit, 'duck');
  assert.equal(after[1].miss, true);
  assert.equal(after[1].behind, undefined);
});

test('a round is twenty corks, one at a time, and ends when the last has landed', () => {
  const g = createGallery({ random: seeded(3) });
  assert.equal(g.corks, CORKS);
  assert.equal(g.fire(100, 100), true);
  assert.equal(g.fire(100, 100), false, 'the gun has to reload');
  for (let i = 1; i < CORKS; i++) { run(g, RELOAD + 0.01); assert.equal(g.fire(100, 100), true); }
  assert.equal(g.corks, 0);
  assert.equal(g.over, false, 'the last cork is still in the air');
  run(g, RELOAD + 0.01);
  assert.equal(g.fire(100, 100), false, 'no corks left');
  run(g, FLIGHT);
  assert.equal(g.over, true);
  assert.ok(g.take().includes('over'));
});

test('a cork in the bell wins three more; five hits in a row are worth fifty more', () => {
  const g = createGallery({ random: seeded(4) });
  const bell = g.rows[0].targets.find(t => t.kind !== 'bell');
  bell.kind = 'bell';
  let n = 0;
  while (!lead(g, 'bell') && n++ < 600) g.step(1 / 60);
  const b = lead(g, 'bell');
  g.fire(b.x, b.y); run(g, FLIGHT + 0.02);
  assert.equal(g.corks, CORKS - 1 + 3);
  const before = g.score;
  for (let i = 0; i < 4; i++) {
    run(g, RELOAD);
    const d = lead(g, 'duck') || lead(g, 'rabbit') || lead(g);
    g.fire(d.x, d.y); run(g, FLIGHT + 0.02);
  }
  assert.equal(g.streak, 5);
  const events = g.take().filter(e => e.hit);
  assert.ok(events.at(-1).run, 'the fifth hit in a row says so');
  assert.equal(g.score - before, events.slice(1).reduce((a, e) => a + e.points, 0) + STREAK.bonus);
  run(g, RELOAD);
  g.fire(5, 5); run(g, FLIGHT + 0.02);
  assert.equal(g.streak, 0, 'a miss ends the run');
});

test('a knocked-down target can\'t be hit again until it comes round', () => {
  const g = createGallery({ random: seeded(5) });
  run(g, 0.3);
  const d = lead(g, 'duck');
  g.fire(d.x, d.y); run(g, FLIGHT + 0.02);
  assert.ok(d.t.hit);
  run(g, RELOAD);
  const x = d.t.x + d.row.dir * d.row.now * FLIGHT;
  g.fire(x, d.y); run(g, FLIGHT + 0.02);
  assert.ok(g.take().some(e => e.miss));
  run(g, (d.row.loop + 200) / (d.row.speed * 0.7));
  assert.equal(d.t.hit, false, 'round the back, it stands up again');
});

test('a ticket for every 20 points', () => {
  assert.deepEqual([0, 19, 20, 345, 880].map(ticketsFor), [0, 0, 1, 17, 44]);
});

test('a golden duck or a bell coming round says so as it comes into view, once', () => {
  const g = createGallery({ random: seeded(7) });
  const seen = [];
  for (let i = 0; i < 60 * 120; i++) {
    g.step(1 / 60);
    for (const e of g.take()) {
      if (!e.arrive) continue;
      const row = g.rows.find(r => r.targets.some(t => t.x === e.x));
      const t = row.targets.find(t => t.x === e.x), w = KINDS[t.kind].w;
      assert.equal(t.kind, e.arrive, 'it says what came');
      assert.ok(e.arrive === 'gold' || e.arrive === 'bell', `a ${e.arrive} arrives quietly`);
      assert.ok(t.x + w / 2 > 0 && t.x - w / 2 < W, 'as it comes into view');
      const was = t.x - row.dir * row.now / 60;
      assert.ok(!(was + w / 2 > 0 && was - w / 2 < W), 'and not before: a step earlier it was out of sight');
      seen.push(e.arrive);
    }
  }
  assert.ok(seen.includes('gold') && seen.includes('bell'), `two minutes of the conveyor bring both round (${seen})`);
});

// How hard it is, pinned: Mark played it and signed it off. The good player from the tuning bot he signed it off with
// (popgun-bot.mjs) picks a target that will still be in the booth when the cork gets there, favouring bells, golden
// ducks and stars, and leads it, judging its speed a little wrong and aiming with a wobble. Seeded, so it's the same
// 200 rounds every run. Today they average about 290 a round; a change to the speeds, the surges, the hit boxes or the
// points that moves that by 50 or so shows up here.
test('how hard it is: a good player averages about 290 a round', () => {
  const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const pl = { jitter: 0.05, judge: 0.12, sigma: 22, lead: 0.85, think: 0.7, likes: { bell: 5, gold: 5, star: 2.5, rabbit: 1.5, duck: 1 } };
  const scores = [];
  for (let s = 1; s <= 200; s++) {
    const r = seeded(s * 7 + 4), g = createGallery({ random: seeded(s) });
    let wait = 0.5;
    while (!g.over && g.clock < 300) {
      g.step(1 / 60); wait -= 1 / 60; g.take();
      if (wait > 0 || !g.ready) continue;
      let best = null, bs = 0;
      for (const row of g.rows) for (const t of row.targets) {
        if (t.hit) continue;
        const fx = t.x + row.dir * row.now * FLIGHT;
        if (fx < 30 || fx > W - 30) continue;
        const sc = pl.likes[t.kind] * (0.5 + r());
        if (sc > bs) { bs = sc; best = { row, t }; }
      }
      if (!best) { wait = 0.1; continue; }
      const k = KINDS[best.t.kind], seen = best.row.now * (1 + gauss(r) * pl.judge);
      g.fire(best.t.x + best.row.dir * (seen * FLIGHT * pl.lead + best.row.now * gauss(r) * pl.jitter) + gauss(r) * pl.sigma, best.row.rail - k.h * 0.5 + gauss(r) * pl.sigma);
      wait = pl.think * (0.7 + r() * 0.6);
    }
    scores.push(g.score);
  }
  const mean = scores.reduce((a, c) => a + c, 0) / scores.length;
  assert.ok(mean >= 245 && mean <= 340, `a good player averaged ${mean.toFixed(0)}`);
});
