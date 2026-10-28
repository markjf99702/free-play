// The arcade's shared parts on their own, without a browser:  node --test test/arcade.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// a stand-in for the browser's localStorage
const kept = new Map();
globalThis.localStorage = { getItem: k => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: k => kept.delete(k) };
globalThis.dispatchEvent = () => true;
const wallet = await import('../shared/wallet.js');
const { PRIZES, PLUSH, SHELF } = await import('../shared/prizes.js');
const { TABLES } = await import('../tilt/js/tables.js');

test('counts read as people write them, with commas', async () => {
  const { fmt } = await import('../shared/counter.js');
  assert.equal(fmt(0), '0');
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1234), '1,234');
  assert.equal(fmt(99999), '99,999');
  assert.equal(fmt(1234567), '1,234,567');
  assert.equal(fmt('2500'), '2,500');
  assert.equal(fmt(NaN), '0');
  assert.equal(fmt(undefined), '0');
});

test("a round that paid nothing says how close it came: 'Two more points and it's a ticket.'", async () => {
  const { shortOfATicket } = await import('../shared/counter.js');
  assert.equal(shortOfATicket(2, 4), "Two more points and it's a ticket.");
  assert.equal(shortOfATicket(3, 4), "One more point and it's a ticket.");
  assert.equal(shortOfATicket(0, 4), "Four more points and it's a ticket.");
  assert.equal(shortOfATicket(10, 20), "Ten more points and it's a ticket.");
  assert.equal(shortOfATicket(10, 15), "Five more points and it's a ticket.");
  assert.equal(shortOfATicket(0, 30), "Thirty more points and it's a ticket.", "Popgun's round that missed every time");
  assert.equal(shortOfATicket(5, 30), "Twenty-five more points and it's a ticket.");
  assert.equal(shortOfATicket(6450, 10000), "3,550 more points and it's a ticket.");
  assert.equal(shortOfATicket(0, 5000), "5,000 more points and it's a ticket.");
});

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

test("a trade taken back puts its tickets back and takes it off the shelf, and only what's there", () => {
  kept.clear();
  const events = [];
  globalThis.dispatchEvent = e => { events.push(e.type); return true; };
  const lolly = PRIZES.find(p => p.id === 'lollipop'), duck = PRIZES.find(p => p.id === 'duck');
  wallet.pay(90);
  wallet.buy(lolly); wallet.buy(lolly); wallet.buy(duck);
  assert.deepEqual(wallet.read(), { tickets: 5, prizes: { lollipop: 2, duck: 1 } });
  events.length = 0;
  assert.deepEqual(wallet.refund(lolly), { tickets: 10, prizes: { lollipop: 1, duck: 1 } });
  assert.deepEqual(events, ['free-play:wallet'], 'the pockets on the page hear about it');
  wallet.refund(duck);
  assert.deepEqual(wallet.read(), { tickets: 85, prizes: { lollipop: 1 } }, 'the last one off the shelf takes its place with it');
  wallet.refund(lolly);
  assert.deepEqual(wallet.read(), { tickets: 90, prizes: {} }, 'back to what there was before the trades');
  events.length = 0;
  assert.equal(wallet.refund(lolly), null, 'nothing on the shelf, nothing to take back');
  assert.deepEqual(wallet.read(), { tickets: 90, prizes: {} }, 'and no tickets out of thin air');
  assert.deepEqual(events, [], 'and nothing written');
  globalThis.dispatchEvent = () => true;
});

test('a plush from the claw goes straight on the shelf, and costs nothing', () => {
  kept.clear();
  wallet.pay(12);
  const frog = PLUSH.find(p => p.kind === 'frog');
  wallet.give(frog); wallet.give(frog);
  assert.deepEqual(wallet.read(), { tickets: 12, prizes: { 'plush-frog': 2 } });
  assert.ok(SHELF.includes(frog) && !PRIZES.includes(frog), "it's on the shelf, but not for sale at the counter");
});

test('a wallet someone has meddled with reads as something sensible', () => {
  for (const junk of ['nope', '[1,2]', '{"tickets":"lots","prizes":5}', '{"tickets":-4}']) {
    kept.set('free-play.wallet', junk);
    const w = wallet.read();
    assert.ok(Number.isInteger(w.tickets) && w.tickets >= 0 && typeof w.prizes === 'object', junk);
  }
});

test("a bad number from a machine doesn't touch the pocket", () => {
  kept.clear();
  wallet.pay(214);
  const was = kept.get('free-play.wallet');
  for (const bad of [NaN, undefined, null, -3, 0, 0.6, Infinity, -Infinity, 'lots', '', {}, []]) {
    wallet.pay(bad);
    assert.equal(kept.get('free-play.wallet'), was, `pay(${String(bad)}) wrote nothing`);
    wallet.merge(bad);
    assert.equal(kept.get('free-play.wallet'), was, `merge(${String(bad)}) wrote nothing`);
  }
  wallet.pay('7');
  assert.deepEqual(wallet.read(), { tickets: 221, prizes: {} }, 'a number written as text still counts');
  wallet.merge(0, { duck: 1, junk: 'x', none: 0 });
  assert.deepEqual(wallet.read(), { tickets: 221, prizes: { duck: 1 } }, 'carried prizes count in without any tickets');
});

test("a prize with no name, or no price, isn't traded, given or taken back", () => {
  kept.clear();
  wallet.pay(50);
  const was = kept.get('free-play.wallet');
  for (const bad of [{}, null, undefined, { id: '' }, { id: 3, cost: 5 }, { cost: 5 }]) {
    assert.equal(wallet.give(bad), null, `give(${JSON.stringify(bad)})`);
    assert.equal(wallet.buy(bad), null, `buy(${JSON.stringify(bad)})`);
    assert.equal(wallet.refund(bad), null, `refund(${JSON.stringify(bad)})`);
  }
  for (const cost of [undefined, NaN, Infinity, -5, '5']) assert.equal(wallet.buy({ id: 'lollipop', cost }), null, `buy at a cost of ${String(cost)}`);
  assert.equal(kept.get('free-play.wallet'), was, 'nothing was written');
  wallet.give({ id: 'lollipop' });
  assert.equal(wallet.refund({ id: 'lollipop' }), null, 'nothing taken back without a price');
  assert.deepEqual(wallet.read(), { tickets: 50, prizes: { lollipop: 1 } });
});

test("whatever else is kept in the pocket stays there through every trade", () => {
  // a newer copy of the arcade might keep more in the pocket; this one leaves it as it is
  const more = { goal: 'unicorn', earned: 12000, log: [{ at: 1, n: 5 }] };
  kept.set('free-play.wallet', JSON.stringify({ tickets: 500, prizes: { duck: 1 }, ...more }));
  const lolly = PRIZES.find(p => p.id === 'lollipop');
  const steps = {
    pay: () => wallet.pay(10), buy: () => wallet.buy(lolly), refund: () => wallet.refund(lolly),
    give: () => wallet.give(PLUSH[0]), merge: () => wallet.merge(3, { duck: 1 }),
  };
  for (const [name, step] of Object.entries(steps)) {
    const was = kept.get('free-play.wallet');
    assert.ok(step(), name);
    assert.notEqual(kept.get('free-play.wallet'), was, `${name} wrote the pocket`);
    const saved = JSON.parse(kept.get('free-play.wallet'));
    for (const [k, v] of Object.entries(more)) assert.deepEqual(saved[k], v, `${k} survived ${name}`);
  }
  assert.deepEqual(wallet.read(), { ...more, tickets: 513, prizes: { duck: 2, [PLUSH[0].id]: 1 } });
});

test('no page is sent with a ticket count already in it', async () => {
  // js fills them in from the pocket: until then they're empty, never a 0 that a returning player would see
  const { readFile } = await import('node:fs/promises');
  for (const page of ['', 'roll-up/', 'tilt/', 'clutch/', 'topple/', 'highrise/', 'popgun/', 'bonkers/', 'hoops/']) {
    const html = await readFile(new URL(`../${page}index.html`, import.meta.url), 'utf8');
    const counts = [...html.matchAll(/id="tixT?"[^>]*>([^<]*)</g)].map(m => m[1]);
    assert.equal(counts.length, 1, `${page || 'the floor'} has its ticket count`);
    assert.doesNotMatch(counts[0], /\d/, `${page || 'the floor'} is sent with ${counts[0]} tickets`);
  }
  // and the floor's cabinets wait for the saves too, rather than saying what a first visit would
  const floor = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const stats = [...floor.matchAll(/class="stat" id="(\w+)">([^<]*)</g)];
  assert.equal(stats.length, 8);
  for (const [, id, text] of stats) assert.equal(text, '', `#${id} is sent saying "${text}"`);
});

test('counts saved as text read as numbers, and stay numbers', () => {
  kept.set('free-play.wallet', '{"tickets":"50","prizes":{"lollipop":"2","duck":2.7,"kite":0,"bear":-1,"dice":"x","disc":null,"unicorn":1e999}}');
  assert.deepEqual(wallet.read(), { tickets: 50, prizes: { lollipop: 2, duck: 2 } });
  wallet.buy(PRIZES.find(p => p.id === 'lollipop'));
  assert.deepEqual(JSON.parse(kept.get('free-play.wallet')), { tickets: 45, prizes: { lollipop: 3, duck: 2 } }, "a '2' and one more is 3, not '21'");
  kept.set('free-play.wallet', '{"tickets":"50","prizes":{"plush-frog":"2"}}');
  wallet.give(PLUSH.find(p => p.kind === 'frog'));
  assert.deepEqual(wallet.read(), { tickets: 50, prizes: { 'plush-frog': 3 } });
  wallet.pay(5);
  assert.equal(wallet.read().tickets, 55, 'the 50 kept as text are added to, not written over');
});

test('the prize counter and the tables pay-outs', () => {
  const ids = new Set(PRIZES.map(p => p.id));
  assert.equal(ids.size, PRIZES.length, 'prize ids are unique');
  for (let i = 1; i < PRIZES.length; i++) assert.ok(PRIZES[i].cost > PRIZES[i - 1].cost, 'cheapest first');
  for (const p of PRIZES) assert.match(p.say, /^(a|an) /, `${p.name} is handed over as "a …"`);
  for (const [id, t] of Object.entries(TABLES)) assert.ok(t.perTicket > 0, `Tilt's ${id} table says what a ticket costs`);
  // a ticket for every 5,000 on Classic and Space, and every 2,500 on Haunted House, the hard one
  assert.deepEqual(Object.fromEntries(Object.entries(TABLES).map(([id, t]) => [id, t.perTicket])), { classic: 5000, space: 5000, haunted: 2500 });
});

test("the line under the shelf counts each set won outright: '4 of 7 plush'", async () => {
  const { collected } = await import('../shared/counter.js');
  assert.equal(collected({}), "0 of 7 plush · 0 of Topple's 5 prizes · 0 of 8 trophies");
  const some = { 'plush-frog': 3, 'plush-star': 1, 'plush-bear': 1, 'plush-alien': 2, 'trinket-gem': 1, 'trophy-hoops': 4, lollipop: 9, giraffe: 1 };
  assert.equal(collected(some), "4 of 7 plush · 1 of Topple's 5 prizes · 1 of 8 trophies", 'each counted once, however many, and what was traded for left out');
  const { OUTRIGHT, SHELF, PRIZES } = await import('../shared/prizes.js');
  assert.deepEqual(OUTRIGHT, SHELF.filter(p => !PRIZES.includes(p)), 'everything on the shelf but what the counter sells');
  assert.deepEqual(OUTRIGHT.filter(p => p.rare).map(p => p.id), ['plush-star', 'trinket-gem'], "the rare ones, a '?' until won");
});

test('above the enormous unicorn, a giant gorilla and a life-size giraffe to save up for', () => {
  assert.deepEqual(PRIZES.slice(-3).map(p => [p.id, p.emoji, p.name, p.cost]), [
    ['unicorn', '🦄', 'Enormous unicorn', 2500], ['gorilla', '🦍', 'Giant gorilla', 5000], ['giraffe', '🦒', 'Life-size giraffe', 10000],
  ]);
  kept.clear();
  wallet.pay(15000);
  assert.ok(wallet.buy(PRIZES.find(p => p.id === 'gorilla')) && wallet.buy(PRIZES.find(p => p.id === 'giraffe')));
  assert.deepEqual(wallet.read(), { tickets: 0, prizes: { gorilla: 1, giraffe: 1 } });
  assert.ok(SHELF.some(p => p.id === 'giraffe'), 'and it sits on the shelf');
});

// A .fp-payout box as feed() sees it: the strip, the count and its word.
function payoutBox() {
  const strip = { style: {} }, count = { textContent: '' }, word = { textContent: '' };
  return { strip, count, word, querySelector: s => ({ '.fp-strip': strip, '.fp-won b': count, '.fp-won span': word })[s] };
}

test("the dispenser says when the last ticket is out, and not when it's stopped", async t => {
  const { feed } = await import('../shared/counter.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const run = ms => { for (let i = 0; i < ms; i += 5) t.mock.timers.tick(5); }; // (a timer set by a timer waits for the next tick)
  const box = payoutBox();
  let done = 0, ticks = 0;
  feed(box, 120, { tick: () => ticks++, onDone: () => done++ });
  run(500 + 55 * 10);
  assert.equal(done, 0, 'not while the strip is still feeding');
  run(5000);
  assert.equal(done, 1, 'once, when the last ticket is out');
  assert.equal(box.count.textContent, '120');
  assert.equal(ticks, 40, 'in batches, a click each');
  // stopped part-way (another round started): no cheer for it
  const stop = feed(payoutBox(), 120, { onDone: () => done++ });
  run(700);
  stop();
  run(5000);
  assert.equal(done, 1, 'a stopped strip has no onDone');
  // a payout shown again, not fed (today's card played earlier, or late coins): all out at once
  feed(payoutBox(), 7, { fresh: false, onDone: () => done++ });
  assert.equal(done, 2);
});

// An installed offline copy is downloaded whole again only when sw.js changes. Otherwise each file in it is refreshed
// only when a page that loads it is visited online, so the copy could hold one release's shared/counter.js beside
// another's topple/js/app.js, and a page opened from it would run that mix. sw.js carries a fingerprint of every file
// it keeps, so a change to any of them is a change to sw.js too.
test('sw.js changes whenever a file in the offline copy does', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const root = new URL('../', import.meta.url);
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  const shell = [...sw.match(/SHELL = \[([^\]]*)\]/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
  const all = createHash('sha1');
  // each file in the list's order, an address ('./', 'hoops/') read as its index.html
  for (const f of shell) all.update(createHash('sha1').update(await readFile(new URL(f.endsWith('/') ? f + 'index.html' : f, root))).digest());
  const files = all.digest('hex').slice(0, 8);
  const kept = sw.replace(/SHELL = \[[^\]]*\]/, '').match(/const FILES = '([0-9a-f]*)'; \/\/ test\/arcade\.test\.mjs checks this/)?.[1];
  assert.equal(kept, files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
});

test("the arcade's calendar: the player's own day, the day before, days apart, and a day as people say it", async () => {
  const { dayKey, dayBefore, daysApart, dayName, seeded } = await import('../shared/calendar.js');
  assert.equal(dayKey(new Date(2026, 9, 28, 23, 59)), '2026-10-28', "late in the evening it's still the player's own day");
  assert.equal(dayKey(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  assert.equal(daysApart('2026-10-27', '2026-10-28'), 1);
  assert.equal(daysApart('2026-10-28', '2026-03-08'), -234);
  assert.equal(daysApart('2026-03-07', '2026-03-09'), 2, 'across the clocks going forward');
  assert.equal(dayName('2026-10-27', '2026-10-28'), 'Oct 27');
  assert.equal(dayName('2025-12-31', '2026-10-28'), 'Dec 31, 2025', 'with the year when it is not this one');
  assert.equal(dayName(null), '');
  const a = seeded('special:2026-10-28'), b = seeded('special:2026-10-28'), c = seeded('special:2026-10-29');
  const run = r => Array.from({ length: 5 }, r);
  assert.deepEqual(run(a), run(b), 'the same text, the same numbers');
  assert.notDeepEqual(run(seeded('special:2026-10-28')), run(c));
  assert.ok(run(seeded('x')).every(x => x >= 0 && x < 1));
});

test("each machine's top five: best first, with the day, from the best it kept before there was a list", async () => {
  const { topFive, place, onList } = await import('../shared/records.js');
  assert.deepEqual(topFive({ best: 340 }), [{ score: 340, date: null }], 'a save from before the list starts it from its best');
  assert.deepEqual(topFive({ best: 0 }), []);
  assert.deepEqual(topFive({}), []);
  assert.deepEqual(topFive({ best: 340, top: [{ score: 300, date: '2026-10-27' }, null, { score: 'x' }, { score: 0 }, { score: 120, date: '2026-10-20' }] }),
    [{ score: 300, date: '2026-10-27' }, { score: 120, date: '2026-10-20' }], 'only what can be read, and the list over the old best');
  let list = [];
  const ranks = [];
  for (const score of [200, 500, 200, 50, 800, 10, 5, 0]) { const p = place(list, score, '2026-10-28'); list = p.list; ranks.push(p.rank); }
  assert.deepEqual(ranks, [0, 0, 2, 3, 0, -1, -1, -1], 'a level score goes in under the one already there; one under a full list, or a 0, goes nowhere');
  assert.deepEqual(list.map(e => e.score), [800, 500, 200, 200, 50]);
  assert.ok(list.every(e => e.date === '2026-10-28'));
  assert.equal(onList(0), '', 'the top is a new best, said on its own');
  assert.equal(onList(1), 'Number 2 on your list. ');
  assert.equal(onList(4), 'Number 5 on your list. ');
  assert.equal(onList(-1), '');
});

test("the all-time totals count every ticket won, every trade and every round, in a save of their own", async () => {
  const { readTotals, count, TOTALS } = await import('../shared/records.js');
  const { dayKey } = await import('../shared/calendar.js');
  kept.clear();
  assert.deepEqual(readTotals(), { since: null, tickets: 0, traded: 0, rounds: {} });
  wallet.pay(40); wallet.pay(12);
  const lolly = PRIZES.find(p => p.id === 'lollipop');
  wallet.buy(lolly); wallet.buy(lolly); wallet.refund(lolly);
  wallet.merge(500, { duck: 1 }); // brought over from an old address: not won here
  wallet.give(PLUSH[0]);
  count({ round: 'hoops' }); count({ round: 'hoops' }); count({ round: 'tilt' });
  assert.deepEqual(readTotals(), { since: dayKey(), tickets: 52, traded: 1, rounds: { hoops: 2, tilt: 1 } });
  assert.equal(wallet.read().tickets, 547, 'the pocket is the pocket');
  assert.equal(JSON.parse(kept.get('free-play.wallet')).traded, undefined, 'and the totals are not in it');
  // the day it started counting stays the first one
  kept.set(TOTALS, JSON.stringify({ ...JSON.parse(kept.get(TOTALS)), since: '2026-10-01' }));
  count({ tickets: 3 });
  assert.equal(readTotals().since, '2026-10-01');
  // a meddled-with save counts from what it can read
  for (const junk of ['nope', '[1]', '{"tickets":"lots","rounds":[3],"traded":-2}', '{"rounds":{"hoops":"4","x":-1}}']) {
    kept.set(TOTALS, junk);
    const t = readTotals();
    assert.ok(Number.isInteger(t.tickets) && t.tickets >= 0 && Number.isInteger(t.traded) && t.traded >= 0 && typeof t.rounds === 'object', junk);
  }
  assert.deepEqual(readTotals().rounds, { hoops: 4 });
  count({ traded: -1 });
  assert.equal(readTotals().traded, 0, 'never fewer than none');
});

test("today's special: one machine a day, the same for everyone, every one in turn, and 25 tickets once a day", async () => {
  const { specialFor, claim, madeToday, meets, titleLine, endLine, MACHINES, GOALS, BONUS, KEY } = await import('../shared/special.js');
  const { dayKey } = await import('../shared/calendar.js');
  assert.deepEqual(MACHINES, ['tilt', 'topple', 'highrise', 'popgun', 'bonkers', 'hoops'], "every machine with a round's score to set a goal on");
  assert.deepEqual(specialFor('2026-10-28'), specialFor('2026-10-28'), 'the same for everyone');
  // over two years: every run of six days from the first has each machine once, never the same two days running
  let prev = null;
  const seen = [];
  for (let d = 0; d < 730; d++) {
    const s = specialFor(dayKey(new Date(2026, 0, 5 + d, 12)));
    assert.ok(MACHINES.includes(s.machine));
    assert.notEqual(s.machine, prev, `the same two days running at day ${d}`);
    prev = s.machine;
    seen.push(s.machine);
    if (s.machine === 'tilt') assert.equal(s.goal, GOALS.tilt[s.table]);
    else assert.equal(s.goal, GOALS[s.machine]);
  }
  for (let i = 0; i + 6 <= seen.length; i += 6) assert.equal(new Set(seen.slice(i, i + 6)).size, 6, `days ${i} to ${i + 5}`);
  // what it says
  const on = m => { for (let d = 0; ; d++) { const k = dayKey(new Date(2026, 9, 1 + d, 12)); if (specialFor(k).machine === m) return k; } };
  assert.equal(specialFor(on('bonkers')).goalText, 'score 250 in a round');
  assert.equal(specialFor(on('topple')).goalText, 'win 12 tickets in one cup');
  assert.equal(specialFor(on('highrise')).goalText, 'build 10 floors');
  assert.match(specialFor(on('tilt')).goalText, /^score (100,000 on Classic|400,000 on Space|50,000 on Haunted House)$/);
  // a round that makes it, on its day, pays once
  kept.clear();
  const day = on('bonkers');
  assert.equal(claim('hoops', { score: 900 }, day), 0, "another machine's round, on Bonkers' day");
  assert.equal(claim('bonkers', { score: 240 }, day), 0, 'short of the goal');
  assert.equal(titleLine('bonkers', day), "Today's special: score 250 in a round for 25 more tickets.");
  assert.equal(titleLine('hoops', day), '');
  assert.equal(claim('bonkers', { score: 250 }, day), BONUS);
  assert.equal(wallet.read().tickets, BONUS, 'into the pocket');
  assert.deepEqual(JSON.parse(kept.get(KEY)), { key: day, machine: 'bonkers' }, 'in a save of its own');
  assert.ok(madeToday(day));
  assert.equal(claim('bonkers', { score: 800 }, day), 0, 'once a day');
  assert.equal(wallet.read().tickets, BONUS);
  assert.equal(titleLine('bonkers', day), "Today's special: made. A new one tomorrow.");
  assert.equal(endLine(BONUS), "Today's special! 25 more tickets.");
  assert.equal(endLine(0), '');
  // Tilt's is on its table
  const t = specialFor(on('tilt')), other = ['classic', 'space', 'haunted'].find(id => id !== t.table);
  assert.ok(meets(t, { score: t.goal, table: t.table }));
  assert.ok(!meets(t, { score: t.goal * 10, table: other }), 'not on another table');
});

test("a trophy for each machine's hardest feat: on the shelf, together at the end, never at the counter", async () => {
  const { TROPHIES, SHELF, PRIZES, trophy } = await import('../shared/prizes.js');
  assert.deepEqual(TROPHIES.map(t => t.id), ['trophy-roll-up', 'trophy-tilt-classic', 'trophy-tilt-space', 'trophy-tilt-haunted', 'trophy-highrise', 'trophy-popgun', 'trophy-bonkers', 'trophy-hoops']);
  assert.deepEqual(SHELF.slice(-TROPHIES.length), TROPHIES, 'together at the end of the shelf');
  for (const t of TROPHIES) {
    assert.ok(!PRIZES.includes(t) && !('cost' in t), `${t.name} isn't for sale`);
    assert.match(t.say, /^the .+ trophy$/);
    assert.match(t.plinth, /^#[0-9a-f]{6}$/, `${t.name} stands on a plinth in its machine's colours`);
    assert.ok(t.feat && !/^TILT_/.test(t.feat), `${t.name} says what it's for`);
    assert.equal(trophy(t.id), t);
  }
  assert.equal(new Set(SHELF.map(p => p.id)).size, SHELF.length, 'every id on the shelf is its own');
  // what each machine's rules count as its feat
  const { feat: popgun, FEAT: P } = await import('../popgun/js/gallery.js');
  assert.ok(popgun({ over: true, shots: 23, hits: 23 }), 'every cork a hit, the bell among them');
  assert.ok(!popgun({ over: true, shots: 20, hits: 20 }), 'twenty of twenty, without the bell, is not it');
  assert.ok(!popgun({ over: true, shots: 26, hits: 25 }));
  assert.ok(!popgun({ over: false, shots: 23, hits: 23 }), 'not until the round is over');
  assert.equal(P.corks, 23);
  const { feat: bonkers } = await import('../bonkers/js/burrow.js');
  assert.ok(bonkers({ over: true, misses: 0, bonks: 40 }));
  assert.ok(!bonkers({ over: true, misses: 0, bonks: 39 }), 'a round with no miss, but too few bonked');
  assert.ok(!bonkers({ over: true, misses: 1, bonks: 52 }));
  assert.ok(!bonkers({ over: true, misses: 0, bonks: 0 }), "a round with no swings isn't it");
  const { feat: hoops } = await import('../hoops/js/court.js');
  assert.ok(hoops({ over: true, baskets: 65 }));
  assert.ok(!hoops({ over: true, baskets: 64 }));
  const { nineCalls } = await import('../roll-up/js/daily.js');
  const ball = hit => ({ value: 30, points: 60, hit });
  assert.ok(nineCalls(Array.from({ length: 9 }, () => ball(true))));
  assert.ok(!nineCalls([...Array.from({ length: 8 }, () => ball(true)), ball(false)]));
  assert.ok(!nineCalls(Array.from({ length: 8 }, () => ball(true))), "eight balls rolled isn't nine calls");
});
