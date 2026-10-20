// Clutch's machine on its own, without a browser:  node --test test/clutch.unit.test.mjs
// matter-js is a browser script that sets a global, so it's run as one here, the way a page would. (It has to share this
// file's globals: in a sandbox of its own, the options the machine hands it come from another realm and lose their
// defaults, and the claw passes straight through the plush.)
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createMachine, KINDS, BOX, HOME } from '../clutch/js/machine.js';
import { PLUSH, PRIZES } from '../shared/prizes.js';

new vm.Script(readFileSync(new URL('../clutch/js/matter.min.js', import.meta.url), 'utf8')).runInThisContext();
const { Matter } = globalThis;

function seeded(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// One go: hold the button until the claw's over x, let go, and wait for it to be ready again.
function go(m, x, check = () => {}) {
  let steps = 0;
  const events = [];
  while (m.state === 'ready' && steps < 5) { m.step(true); steps++; }
  while (m.state === 'move' && m.claw.x < x) { m.step(true); steps++; }
  while (m.state !== 'ready' && steps < 60 * 30) { m.step(false); steps++; check(m); }
  events.push(...m.take());
  return { won: m.takeWon(), steps, events };
}
// Over the middle of the plush on top of the heap (but clear of the chute's guard).
const topPlush = m => m.toys.filter(t => t.position.x > BOX.guard.x + 50).sort((a, b) => a.position.y - b.position.y)[0];

test('every go ends with the claw home and ready, wherever it was dropped', () => {
  const m = createMachine(Matter, { random: seeded(11) });
  const r = seeded(5);
  for (let i = 0; i < 12; i++) {
    const x = HOME.x + r() * (BOX.W - 46 - HOME.x);
    const g = go(m, x, m => {
      for (const toy of m.toys) {
        assert.ok(toy.position.x > 0 && toy.position.x < BOX.W, `a plush got out of the box sideways (go ${i})`);
      }
    });
    assert.equal(m.state, 'ready', `go ${i}, dropped at ${x.toFixed(0)}, never finished`);
    assert.ok(g.steps < 60 * 25, `go ${i} took ${(g.steps / 60).toFixed(1)}s`);
    assert.deepEqual([m.claw.x, m.claw.y], [HOME.x, HOME.y], 'the claw goes back over the chute');
  }
});

test('a go follows the machine through its moves, in order', () => {
  const m = createMachine(Matter, { random: seeded(3) });
  const { events } = go(m, 400);
  const order = events.filter(e => ['start', 'drop', 'close', 'lift', 'release', 'ready'].includes(e));
  assert.deepEqual(order, ['start', 'drop', 'close', 'lift', 'release', 'ready']);
});

test('the claw only moves while the button is held, and drops as soon as it is let go', () => {
  const m = createMachine(Matter, { random: seeded(4) });
  for (let i = 0; i < 30; i++) m.step(false);
  assert.equal(m.state, 'ready', 'nothing happens without the button');
  for (let i = 0; i < 31; i++) m.step(true);
  const x = m.claw.x;
  assert.ok(x > HOME.x + 60 && x < HOME.x + 120, `half a second of holding moved the claw ${(x - HOME.x).toFixed(0)}mm`);
  m.step(false);
  assert.equal(m.state, 'drop');
  for (let i = 0; i < 20; i++) m.step(true);
  assert.equal(m.claw.x, x, 'holding again once it has dropped does nothing');
});

test('aiming over the middle of a plush wins far more often than dropping anywhere', () => {
  let aimed = 0, anywhere = 0, gos = 0;
  for (let s = 1; s <= 10; s++) {
    const a = createMachine(Matter, { random: seeded(s) }), b = createMachine(Matter, { random: seeded(s) }), r = seeded(s * 31);
    for (let k = 0; k < 3; k++) {
      aimed += go(a, topPlush(a).position.x).won.length;
      anywhere += go(b, BOX.guard.x + 20 + r() * (BOX.W - 66 - BOX.guard.x)).won.length;
      gos++;
    }
  }
  assert.ok(aimed >= gos * 0.25, `aimed at the middle of a plush, ${aimed} wins in ${gos} goes`);
  assert.ok(aimed > anywhere * 1.5, `aimed ${aimed}, anywhere ${anywhere}`);
  assert.ok(aimed < gos * 0.85, `${aimed} wins in ${gos} goes is too easy for a claw machine`);
});

test('a plush is only won by falling down the chute, and it leaves the box when it is', () => {
  for (let s = 1; s <= 8; s++) {
    const m = createMachine(Matter, { random: seeded(s * 7) });
    for (let k = 0; k < 3; k++) {
      const before = m.toys.length;
      const target = topPlush(m);
      let wonAt = null;
      const { won } = go(m, target.position.x, m => { if (!wonAt && m.toys.length < before) wonAt = m.claw.x; });
      for (const w of won) assert.ok(KINDS[w.kind] && w.tone >= 0 && w.tone < 1, 'a win says what was won');
      if (won.length) assert.ok(wonAt != null && wonAt < BOX.guard.x + 100, 'it came out while the claw was over by the chute');
    }
  }
});

test('the heap is topped up when it runs low', () => {
  const m = createMachine(Matter, { random: seeded(9), plush: 6 });
  assert.equal(m.toys.length, 6);
  for (let i = 0; i < 200; i++) m.step(false);
  assert.ok(m.toys.length >= 9, `still only ${m.toys.length} plush after a few seconds`);
});

test('every kind of plush has a place on the shelf', () => {
  assert.deepEqual(PLUSH.map(p => p.kind).sort(), Object.keys(KINDS).sort());
  const ids = [...PRIZES, ...PLUSH].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no plush shares an id with a counter prize');
  for (const p of PLUSH) assert.match(p.say, /^(a|the) /, `${p.name} is handed over as "a …"`);
});
