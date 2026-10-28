// Topple's machine on its own, without a browser:  node --test test/topple.unit.test.mjs
// matter-js is a browser script that sets a global, so it's run as one here, the way a page would (see
// test/clutch.unit.test.mjs for why it has to share this file's globals).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createMachine, edgePays, DECK, PUSHER, POCKETS } from '../topple/js/machine.js';
import { TRINKETS, PRIZES, PLUSH } from '../shared/prizes.js';

new vm.Script(readFileSync(new URL('../shared/matter.min.js', import.meta.url), 'utf8')).runInThisContext();
const { Matter } = globalThis;

function seeded(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const run = (m, seconds, each = () => {}) => { for (let i = 0; i < seconds * 60; i++) { m.step(); each(m); } };
const tally = m => {
  const t = { won: 0, gold: 0, lost: 0, prizes: [] };
  for (const f of m.takeFalls()) {
    if (f.edge === 'side') t.lost++;
    else if (f.kind === 'prize') t.prizes.push(f.prize);
    else if (f.kind === 'gold') t.gold++;
    else t.won++;
  }
  return t;
};

test('a new machine comes stocked: the deck packed, the shelf full, gold coins and a prize waiting', () => {
  const m = createMachine(Matter, { random: seeded(1), prizes: ['car'] });
  const deck = m.pieces.filter(p => p.layer === 'deck'), shelf = m.pieces.filter(p => p.layer === 'shelf');
  assert.ok(deck.length > 80, `${deck.length} coins on the deck`);
  assert.ok(shelf.length > 20, `${shelf.length} coins on the shelf`);
  assert.equal(m.pieces.filter(p => p.kind === 'gold').length, 2);
  assert.deepEqual(m.pieces.filter(p => p.kind === 'prize').map(p => p.prize), ['car']);
  assert.deepEqual(m.takeFalls(), [], 'what fell off while it settled is not anyone\'s');
  for (const p of m.pieces) assert.ok(p.position.x > 0 && p.position.x < DECK.W && p.position.y > 0 && p.position.y < DECK.D);
});

test('the shelf slides back and forth between its two stops', () => {
  const m = createMachine(Matter, { random: seeded(2) });
  let lo = Infinity, hi = -Infinity;
  run(m, PUSHER.period * 1.2, m => { lo = Math.min(lo, m.lip); hi = Math.max(hi, m.lip); });
  assert.ok(Math.abs(lo - PUSHER.near) < 1 && Math.abs(hi - PUSHER.far) < 1, `the lip went from ${lo.toFixed(1)} to ${hi.toFixed(1)}`);
});

test('a dropped coin lands on the shelf, and the chute takes a moment to reload', () => {
  const m = createMachine(Matter, { random: seeded(3) });
  const before = m.pieces.length;
  assert.equal(m.drop(150), true);
  assert.equal(m.drop(150), false, 'a second coin straight after the first');
  run(m, 0.3);
  const t = tally(m);
  assert.equal(m.pieces.length + t.won + t.gold + t.lost + t.prizes.length, before + 1, 'it is on the machine');
  const coin = m.pieces.at(-1);
  assert.equal(coin.layer, 'shelf');
  assert.ok(Math.abs(coin.position.x - 150) < 25);
  assert.equal(m.drop(150), true, 'the chute is ready again');
});

test('coins dropped on the shelf push coins over the front edge, about as many as go in', () => {
  const m = createMachine(Matter, { random: seeded(4) });
  const r = seeded(40);
  let dropped = 0, bonus = 0;
  const t = { won: 0, gold: 0, lost: 0, prizes: [] };
  const add = s => { t.won += s.won; t.gold += s.gold; t.lost += s.lost; t.prizes.push(...s.prizes); };
  const start = m.pieces.length;
  for (let i = 0; i < 100; i++) {
    m.drop(20 + r() * (DECK.W - 40)); dropped++;
    run(m, 0.8, m => { for (const e of m.take()) if (e === 'bonus') bonus++; });
    add(tally(m));
  }
  run(m, 8); add(tally(m));
  const out = t.won + t.gold + t.lost + t.prizes.length;
  const added = dropped + bonus * 8; // (and a prize that's gone isn't put back here)
  assert.ok(t.won > 60, `${t.won} coins over the front from ${dropped} dropped`);
  assert.ok(Math.abs(out - (added + start - m.pieces.length)) <= 0, 'every piece that left the machine went over an edge');
  assert.ok(Math.abs(m.pieces.length - start) < 25, `the field held steady (${start} to ${m.pieces.length})`);
  const sides = t.lost / (t.won + t.gold + t.lost);
  assert.ok(sides > 0.02 && sides < 0.25, `${(sides * 100).toFixed(0)}% went off the sides`);
});

test('a ticket for every two silver coins over the front edge, and ten for a gold one', () => {
  let odd = 0;
  const paid = ['coin', 'coin', 'coin', 'gold', 'coin', 'coin', 'gold'].map(kind => { const p = edgePays(kind, odd); odd = p.odd; return p.tickets; });
  assert.deepEqual(paid, [0, 1, 0, 10, 1, 0, 10], 'the second coin of each pair pays, and a gold coin pays whatever the count');
  assert.equal(odd, 1, 'the last coin waits for the next');
  assert.deepEqual(edgePays('coin'), { tickets: 0, odd: 1 }, 'a first coin pays nothing yet');
});

test('nothing gets through the walls: every piece stays on the machine until it goes over an edge', () => {
  const m = createMachine(Matter, { random: seeded(5) });
  const r = seeded(50);
  for (let i = 0; i < 40; i++) {
    m.drop(r() * DECK.W);
    run(m, 0.6, m => {
      for (const p of m.pieces) {
        const { x, y: z } = p.position;
        assert.ok(z > 0 && z <= DECK.D + 1, `a piece at z ${z.toFixed(1)}`);
        if (z < DECK.D - DECK.gutter - 12) assert.ok(x > 0 && x < DECK.W, `a piece through a side wall at x ${x.toFixed(1)}, z ${z.toFixed(1)}`);
        if (p.layer === 'shelf') assert.ok(z < m.lip + 2, 'a piece riding the shelf in front of its lip');
      }
    });
  }
});

test('a coin through the lit pocket brings a shower down on the shelf', () => {
  const m = createMachine(Matter, { random: seeded(6) });
  run(m, 0.5);
  assert.equal(m.lights.state, 'idle');
  // wait for the lights to stop on a pocket, then drop through a different one, and then through it
  let n = 0;
  while (m.lights.state !== 'open' && n++ < 60 * 20) m.step();
  assert.equal(m.lights.state, 'open', 'the lights stop on a pocket now and then');
  m.take();
  const lit = m.lights.at, other = (lit + 3) % POCKETS;
  m.drop((other + 0.5) * DECK.W / POCKETS);
  assert.ok(!m.take().includes('bonus'), 'an unlit pocket does nothing');
  run(m, 0.35);
  assert.equal(m.lights.state, 'open', 'the pocket is still lit');
  tally(m);
  const before = m.pieces.length;
  m.drop((lit + 0.5) * DECK.W / POCKETS);
  assert.ok(m.take().includes('bonus'));
  assert.ok(m.showering);
  run(m, 3);
  const t = tally(m);
  assert.equal(m.pieces.length + t.won + t.gold + t.lost + t.prizes.length, before + 1 + 8, 'the coin and eight more came down');
  assert.equal(m.lights.state, 'idle', 'and the pocket goes dark');
});

test('what the machine keeps between visits brings every piece back where it was', () => {
  const a = createMachine(Matter, { random: seeded(7), prizes: ['robot'] });
  run(a, 2);
  const kept = JSON.parse(JSON.stringify(a.save()));
  const b = createMachine(Matter, { random: seeded(99), field: kept });
  assert.equal(b.pieces.length, a.pieces.length);
  assert.deepEqual(b.save().coins, kept.coins);
  assert.equal(b.pieces.find(p => p.kind === 'prize').prize, 'robot');
  run(b, 2);
  assert.ok(b.pieces.length > 100, 'and it carries on from there');
  // coins hanging at the front edge or out in the gutters past the side walls are still on the machine, and come back
  const edge = JSON.parse(JSON.stringify(kept));
  edge.coins[0] = [-1.5, DECK.D - 20, 0, 0];
  edge.coins[1] = [DECK.W + 1.5, DECK.D - 30, 0, 0];
  edge.coins[2] = [150, DECK.D, 0, 1];
  const e = createMachine(Matter, { random: seeded(98), field: edge });
  assert.deepEqual(e.save().coins, edge.coins, 'the deck comes back as it was, not a fresh one');
  // a save someone has meddled with is ignored, and the machine starts fresh
  for (const junk of [null, {}, { coins: 'lots' }, { coins: [[1e9, 5, 0, 0]] }, { ...kept, coins: kept.coins.map(c => [-5, ...c.slice(1)]) }]) {
    const c = createMachine(Matter, { random: seeded(8), field: junk });
    assert.ok(c.pieces.length > 100 && c.pieces.every(p => p.position.x > 0 && p.position.x < DECK.W));
  }
});

test('a deck kept without a prize gets one back straight away', () => {
  // (left in the moment after a prize went over, before the attendant put the next one on)
  const a = createMachine(Matter, { random: seeded(11), prizes: ['robot'] });
  run(a, 1);
  const kept = JSON.parse(JSON.stringify({ ...a.save(), prize: null }));
  const b = createMachine(Matter, { random: seeded(12), field: kept, prizes: ['car'] });
  assert.deepEqual(b.pieces.filter(p => p.kind === 'prize').map(p => p.prize), ['car'], 'a prize sits on the deck');
  assert.equal(b.pieces.length, a.pieces.length, 'and the coins came back as they were');
  const c = createMachine(Matter, { random: seeded(13), field: a.save(), prizes: ['car'] });
  assert.deepEqual(c.pieces.filter(p => p.kind === 'prize').map(p => p.prize), ['robot'], "a kept prize isn't joined by another");
});

test('coins still coming down when the deck is kept come back on the shelf', () => {
  const m = createMachine(Matter, { random: seeded(6) });
  let n = 0;
  while (m.lights.state !== 'open' && n++ < 60 * 20) m.step();
  assert.equal(m.lights.state, 'open');
  m.drop((m.lights.at + 0.5) * DECK.W / POCKETS);
  assert.ok(m.take().includes('bonus'));
  m.step(); m.step();
  assert.ok(m.showering && m.dropping.length === 1, 'the coin is on its way down, and the shower still to come');
  const coins = m.pieces.filter(p => p.kind !== 'prize'), gold = coins.filter(p => p.kind === 'gold').length;
  const kept = JSON.parse(JSON.stringify(m.save()));
  assert.equal(kept.coins.length, coins.length + 1 + 8, 'the coin in the chute and the eight in the shower are kept');
  const golds = kept.coins.filter(c => c[3] === 1).length;
  assert.ok(golds >= gold && golds <= gold + 1, 'a gold one in the shower stays gold');
  const back = createMachine(Matter, { random: seeded(14), field: kept });
  assert.equal(back.pieces.filter(p => p.kind !== 'prize').length, kept.coins.length, 'and they all come back');
  const underChute = back.pieces.filter(p => p.layer === 'shelf' && Math.abs(p.position.y - 14) < 0.5).length;
  assert.ok(underChute >= 9, 'on the shelf, under the chute');
});

test('a prize is only put on when the last one has gone', () => {
  const m = createMachine(Matter, { random: seeded(9), prizes: ['watch'] });
  m.restock('gem');
  assert.equal(m.pieces.filter(p => p.kind === 'prize').length, 1);
  // (taken off the list the machine keeps, as going over an edge does)
  m.pieces.splice(m.pieces.findIndex(p => p.kind === 'prize'), 1);
  m.restock('gem');
  assert.equal(m.pieces.find(p => p.kind === 'prize').prize, 'gem');
});

test("Topple's prizes have a place on the shelf", () => {
  const kinds = TRINKETS.map(t => t.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  const ids = [...PRIZES, ...PLUSH, ...TRINKETS].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no prize shares an id with another');
  for (const t of TRINKETS) assert.match(t.say, /^(a|an) /);
});
