// The arcade's shared parts on their own, without a browser:  node --test test/arcade.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// a stand-in for the browser's localStorage
const kept = new Map();
globalThis.localStorage = { getItem: k => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: k => kept.delete(k) };
globalThis.dispatchEvent = () => true;
const wallet = await import('../shared/wallet.js');
const { PRIZES } = await import('../shared/prizes.js');
const { TABLES } = await import('../tilt/js/tables.js');

test('every machine pays into one wallet, and the counter spends from it', () => {
  kept.clear();
  assert.deepEqual(wallet.read(), { tickets: 0, prizes: {} });
  wallet.pay(23); wallet.pay(18.9);
  assert.equal(wallet.read().tickets, 41, 'whole tickets only');
  const duck = PRIZES.find(p => p.id === 'duck');
  assert.equal(wallet.buy(duck), null, "a prize you can't afford stays on the counter");
  const lolly = PRIZES.find(p => p.id === 'lollipop');
  wallet.buy(lolly); wallet.buy(lolly);
  assert.deepEqual(wallet.read(), { tickets: 31, prizes: { lollipop: 2 } });
  wallet.merge(57, { duck: 1, lollipop: 1 });
  assert.deepEqual(wallet.read(), { tickets: 88, prizes: { lollipop: 3, duck: 1 } }, 'carried saves add to what is there');
});

test('a wallet someone has meddled with reads as something sensible', () => {
  for (const junk of ['nope', '[1,2]', '{"tickets":"lots","prizes":5}', '{"tickets":-4}']) {
    kept.set('free-play.wallet', junk);
    const w = wallet.read();
    assert.ok(Number.isInteger(w.tickets) && w.tickets >= 0 && typeof w.prizes === 'object', junk);
  }
});

test('the prize counter and the tables pay-outs', () => {
  const ids = new Set(PRIZES.map(p => p.id));
  assert.equal(ids.size, PRIZES.length, 'prize ids are unique');
  for (let i = 1; i < PRIZES.length; i++) assert.ok(PRIZES[i].cost > PRIZES[i - 1].cost, 'cheapest first');
  for (const p of PRIZES) assert.match(p.say, /^(a|an) /, `${p.name} is handed over as "a …"`);
  for (const [id, t] of Object.entries(TABLES)) assert.ok(t.perTicket > 0, `Tilt's ${id} table says what a ticket costs`);
});
