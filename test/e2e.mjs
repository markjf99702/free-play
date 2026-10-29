// Walks round the Free Play floor in Chromium through the real pages:  node test/e2e.mjs  (needs Playwright)
// In from the floor to each machine and back, with the tickets each one pays adding up in the one wallet, the prize
// counter from the floor, every file the pages load kept for offline, Chrome offering to install it, all of it
// opening again offline, each machine's control deck on a shorter phone and clear of an iPhone's home indicator and
// notch, everything on the cards big enough to tap, a new release's offline copy made whole from the server, and the
// floor and a machine opening from it on a weak connection. (Each machine's own browser test,
// test/<machine>.e2e.mjs, plays it in depth.)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { SHELF, OUTRIGHT } from '../shared/prizes.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
// With `down` set, the server's gone: it drops every connection it's offered. (The browser's offline switch alone
// doesn't stop a service worker's own requests in this Chromium, so it can't show what the offline copy holds.)
let down = false;
const server = createServer(async (req, res) => {
  if (down) { req.socket.destroy(); return; }
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  // (anything that isn't there gets the arcade's 404.html, as GitHub Pages does)
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404, { 'content-type': 'text/html' }); res.end(await readFile(join(root, '404.html'))); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
// Today's special is made already in every page here, so its 25 tickets don't land on a round a test counts. (The
// special has tests of its own, on a day of their own: openOn() opens a context without this.)
const openOn = browser.newContext.bind(browser);
browser.newContext = async (...a) => {
  const c = await openOn(...a);
  await c.addInitScript(() => {
    try {
      const d = new Date(), key = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
      if (!localStorage.getItem('free-play.special')) localStorage.setItem('free-play.special', JSON.stringify({ key, machine: 'made by the tests' }));
    } catch { /* storage off */ }
  });
  return c;
};
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [], loaded = new Set();
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); else loaded.add(new URL(r.url()).pathname.slice(1) || './'); });
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
// Waits for ok() to come true, for up to ms, or fails saying what didn't happen.
const until = async (ok, ms, what) => {
  for (const end = Date.now() + ms; !(await ok());) { assert.ok(Date.now() < end, what); await new Promise(r => setTimeout(r, 100)); }
};

await page.goto(base);
await page.evaluate(() => document.fonts.ready);

// The floor: the sign, a cabinet for each machine, an empty pocket, and a shelf with nothing on it but the outlines of
// what's won outright, and a line under it saying none of it is won yet.
assert.equal(await page.textContent('#tix'), '0');
assert.equal(await page.locator('.cab').count(), 8);
assert.match(await page.textContent('#rollUpStat'), /Today's card is ready/);
// (the line under the shelf, its no-break spaces read as spaces: see collected() in shared/counter.js)
const tally = async sel => (await page.textContent(sel)).replaceAll('\u00a0', ' ');
assert.equal(await page.locator('#shelf .fp-item').count(), OUTRIGHT.length);
assert.equal(await page.locator('#shelf .fp-yet').count(), OUTRIGHT.length, 'every one of them an outline');
assert.equal(await tally('#collected'), "0 of 7 plush · 0 of Topple's 5 prizes · 0 of 8 trophies");
// Each cabinet says what its machine is before it's been played: Hoops' hoop starts to slide 20 seconds in.
assert.equal(await page.textContent('#hoopsStat'), 'Forty-five seconds. Twenty\u00a0in, the hoop starts to slide.');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the floor scrolls sideways on a phone');
// To a screen reader each cabinet is a link named by its machine and what it says about you (its description comes
// after, as the link's description, and the picture keeps its own words), and the purse says it opens the counter.
// (A name as Chromium's accessibility tree has it: the first line of the element's ARIA snapshot, which is YAML, so a
// name with an apostrophe in it comes in single quotes, the apostrophe doubled.)
const nameOf = async loc => {
  const top = (await loc.ariaSnapshot()).split('\n')[0];
  const line = top.startsWith("- '") ? top.slice(3).replace(/':?$/, '').replace(/''/g, "'") : top.slice(2).replace(/:$/, '');
  return line.match(/^[a-z]+ "(.*)"$/)?.[1];
};
const cabinetNames = async () => { const out = []; for (const cab of await page.locator('.cab').all()) out.push(await nameOf(cab)); return out; };
const MACHINES = ['Roll Up', 'Tilt', 'Clutch', 'Topple', 'Highrise', 'Popgun', 'Bonkers', 'Hoops'];
for (const [i, name] of (await cabinetNames()).entries()) {
  assert.ok(name?.startsWith(MACHINES[i] + ' ') && name.length < 120, `cabinet ${i + 1} is named "${name}" (${name?.length} characters)`);
}
assert.equal(await page.locator('.cab.roll-up').getAttribute('aria-describedby'), 'rollUpWhat');
assert.equal(await nameOf(page.locator('#purse')), '0 tickets · Prize counter', "the purse's name");
assert.equal(await page.textContent('#trade'), 'Trade tickets', "the booth's button with nothing to trade");
// The pocket says to the eye too that it opens the counter. Under it, a row of the machines in the cabinets' order and
// the prize counter, all on the first screen: a tap on one brings its cabinet to the top of the screen (the counter at
// the foot of the floor, into view), the keyboard goes with it, and the address stays as it was.
assert.ok((await page.locator('#purse .to').boundingBox())?.width > 50, "the pocket doesn't show that it opens the prize counter");
// (and the pocket stays one line, with a pocketful of tickets, from the narrowest phones up: on those, under 360 px,
// only a screen reader hears that it opens the counter)
await page.evaluate(() => { document.getElementById('tix').textContent = '123,456'; });
for (const width of [320, 344, 359, 360, 390]) {
  await page.setViewportSize({ width, height: 844 });
  const { h, shown } = await page.evaluate(() => ({ h: document.getElementById('purse').getBoundingClientRect().height, shown: document.querySelector('#purse .to').getBoundingClientRect().width > 50 }));
  assert.ok(h < 48, `at ${width} px, the pocket is ${Math.round(h)} px tall: on two lines`);
  assert.equal(shown, width >= 360, `at ${width} px, the pocket ${shown ? 'shows' : "doesn't show"} that it opens the prize counter`);
}
assert.equal(await nameOf(page.locator('#purse')), '123,456 tickets · Prize counter', "the purse's name on the narrowest phones");
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.freePlay.pocket());
const hops = await page.locator('.aisle a').evaluateAll(els => els.map(a => [a.textContent, a.getBoundingClientRect().bottom]));
assert.deepEqual(hops.map(h => h[0]), [...MACHINES, 'Prize counter', 'Records'], 'the row of machines under the pocket');
assert.ok(Math.max(...hops.map(h => h[1])) <= 844, `the row of machines runs ${Math.round(Math.max(...hops.map(h => h[1])) - 844)} px below the first screen`);
for (const [hop, sel] of [['hoops', '.cab.hoops'], ['topple', '.cab.topple'], ['counter', '.booth']]) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.tap(`.aisle a.${hop}`);
  await until(() => page.evaluate(sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return sel === '.booth' ? r.top >= 0 && r.bottom <= innerHeight : Math.abs(r.top - 14) < 2;
  }, sel), 4000, `a tap on ${hop} in the row didn't bring it into view`);
  assert.equal(page.url(), base, `a tap on ${hop} in the row changed the address`);
  assert.ok(await page.evaluate(sel => document.activeElement === document.querySelector(sel), sel), `the keyboard didn't go with ${hop}`);
}
await page.evaluate(() => scrollTo(0, 0));

// Roll Up: in from the floor, a game, and its tickets.
await page.click('.cab.roll-up');
await page.waitForURL(base + 'roll-up/');
await page.click('#play');
await page.evaluate(() => { rollUp.speed = 8; });
for (let i = 0; i < 9; i++) {
  await page.waitForFunction(() => rollUp.mode === 'aim', null, { timeout: 15000 });
  await page.evaluate(() => rollUp.roll(0, 305, 0));
}
await page.waitForFunction(() => rollUp.mode === 'over', null, { timeout: 30000 });
const rolled = await page.evaluate(() => rollUp.score);
assert.equal(await tickets(), Math.floor(rolled / 10), 'Roll Up pays a ticket for every 10 points');

// Back to the floor, which shows them, and Roll Up's best.
await page.click('#over .back a');
await page.waitForURL(base);
assert.equal(await page.textContent('#tix'), String(Math.floor(rolled / 10)));
assert.match(await page.textContent('#rollUpStat'), new RegExp(`Best: ${rolled.toLocaleString('en-US')}\\.$`));

// Tilt: a game ended from its menu, and its tickets on top.
const before = await tickets();
await page.click('.cab.tilt');
await page.waitForURL(base + 'tilt/');
assert.equal(await page.textContent('#tixT'), String(before), "Tilt's title card shows the arcade's tickets");
await page.click('#startBtn');
await page.evaluate(() => { window.tilt.game.score = 154320; });
await page.click('#menuBtn');
await page.click('#quitBtn'); // (End game asks first)
await page.click('#quitBtn');
await page.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 5000 });
assert.equal(await tickets(), before + 30, 'Classic pays a ticket for every 5,000 points');
await page.waitForFunction(() => document.querySelector('#over .fp-won b').textContent === '30', null, { timeout: 8000 });
await page.click('#over a.ghost');
await page.waitForURL(base);
assert.equal(await page.textContent('#tiltStat'), 'Best: 154,320, on Classic.');

// Clutch: in from the floor, a go, and back by its menu.
await page.click('.cab.clutch');
await page.waitForURL(base + 'clutch/');
assert.equal(await page.textContent('#tix'), String(await tickets()), "Clutch's scoreboard shows the arcade's tickets");
await page.click('#play');
await page.evaluate(() => { clutch.speed = 4; clutch.go(400); });
await page.waitForFunction(() => clutch.state === 'move');
await page.waitForFunction(() => clutch.state === 'ready', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.getElementById('win').hidden) document.getElementById('more').click(); });
await page.click('#menuBtn');
await page.click('#menu a.to-floor');
await page.waitForURL(base);
assert.match(await page.textContent('#clutchStat'), /plush won|Pays in plush/);
// Back by Clutch's own link, the floor opens at Clutch's cabinet rather than at the top of a long page.
const inView = sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; }, sel);
assert.ok(await inView('.cab.clutch'), "back from Clutch, its cabinet isn't in view");
// A reload leaves the floor where it is, and so do Back and Forward. (With the browser putting nothing back itself,
// so that any scrolling is the floor's own.)
await page.evaluate(() => { history.scrollRestoration = 'manual'; scrollTo(0, 0); });
await page.reload();
await page.waitForFunction(() => !!window.freePlay);
assert.equal(await page.evaluate(() => scrollY), 0, 'a reload of the floor went to Clutch');
await page.goto(base + 'hoops/');
await page.goBack();
await page.waitForFunction(() => !!window.freePlay);
assert.equal(await page.evaluate(() => scrollY), 0, 'Back to the floor went to Clutch');

// Topple: in from the floor, a few coins and the tickets they push over, and back.
await page.click('.cab.topple');
await page.waitForURL(base + 'topple/');
await page.waitForFunction(() => !!window.topple);
// (what the pocket had as the cup began: the deck waits behind the title card, so nothing goes in it before Play)
const beforeTopple = await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
await page.click('#play');
await page.evaluate(() => { topple.speed = 4; });
for (let i = 0; i < 6; i++) { await page.waitForFunction(() => topple.machine.ready); await page.evaluate(() => topple.drop(150)); }
await page.waitForFunction(() => topple.cup.won > 0, null, { timeout: 20000 });
// (read together: the coins keep going over while the test looks)
const [paid, won] = await page.evaluate(() => [JSON.parse(localStorage.getItem('free-play.wallet')).tickets, topple.cup.won]);
assert.equal(paid, beforeTopple + won, 'Topple pays its cup\'s tickets into the pocket as the coins go over');
await page.click('#menuBtn');
await page.click('#menu a.to-floor');
await page.waitForURL(base);

// Highrise: in from the floor, a few floors and their tickets, and back.
const beforeHighrise = await tickets();
await page.click('.cab.highrise');
await page.waitForURL(base + 'highrise/');
await page.click('#play');
for (let i = 0; i < 4; i++) { await page.waitForFunction(() => highrise.ready); await page.evaluate(() => highrise.stopAt(3)); }
await page.waitForFunction(() => highrise.ready);
await page.evaluate(() => highrise.stopAt(0));
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.equal(await tickets(), beforeHighrise + 4, 'Highrise pays a ticket a floor');
await page.click('#over .back a');
await page.waitForURL(base);
assert.equal(await page.textContent('#highriseStat'), 'Highest: floor 4.');

// Popgun: in from the floor, a round, its tickets, and back.
const beforePopgun = await tickets();
await page.click('.cab.popgun');
await page.waitForURL(base + 'popgun/');
await page.click('#play');
await page.evaluate(() => { popgun.speed = 4; });
while (!(await page.evaluate(() => popgun.gallery.over))) {
  await page.waitForFunction(() => popgun.gallery.ready || popgun.gallery.over);
  await page.evaluate(() => popgun.fire(280, 420));
}
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
const shot = await page.evaluate(() => popgun.gallery.score);
assert.equal(await tickets(), beforePopgun + Math.floor(shot / 30), 'Popgun pays a ticket for every 30 points');
await page.click('#over .back a');
await page.waitForURL(base);

// Bonkers: in from the floor, a round, its tickets, and back.
const beforeBonkers = await tickets();
await page.click('.cab.bonkers');
await page.waitForURL(base + 'bonkers/');
await page.click('#play');
await page.evaluate(() => { bonkers.speed = 6; });
while (!(await page.evaluate(() => bonkers.burrow.over))) {
  await page.evaluate(() => { const m = bonkers.burrow.moles.find(m => m.state === 'rising' && m.rise > 0.6); if (m) bonkers.swing([50, 150, 250, 350, 450][m.hole], -40); });
  await page.waitForTimeout(30);
}
const bonked = await page.evaluate(() => bonkers.burrow.score);
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.equal(await tickets(), beforeBonkers + Math.floor(bonked / 15), 'Bonkers pays a ticket for every 15 points');
await page.click('#over .back a');
await page.waitForURL(base);

// Hoops: in from the floor, a round, its tickets, and back.
const beforeHoops = await tickets();
await page.click('.cab.hoops');
await page.waitForURL(base + 'hoops/');
await page.click('#play');
await page.evaluate(() => { hoops.speed = 6; });
while (!(await page.evaluate(() => hoops.court.over))) {
  await page.evaluate(() => { if (hoops.court.pocket()) hoops.shoot(hoops.sweet(), 0); });
  await page.waitForTimeout(30);
}
const hooped = await page.evaluate(() => hoops.court.score);
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.ok(hooped > 0, 'baskets went in');
assert.equal(await tickets(), beforeHoops + Math.floor(hooped / 4), 'Hoops pays a ticket for every 4 points');
await page.click('#over .back a');
await page.waitForURL(base);

// With every machine played, each cabinet's name still starts with the machine and stays short.
for (const [i, name] of (await cabinetNames()).entries()) {
  assert.ok(name?.startsWith(MACHINES[i] + ' ') && name.length < 120, `played: cabinet ${i + 1} is named "${name}" (${name?.length} characters)`);
}

// The prize counter, from the floor.
const have = await tickets();
await page.click('#trade');
assert.ok(await page.isVisible('.fp-sheet'));
await page.click('.fp-prize >> nth=2');
assert.match(await page.textContent('.fp-toast'), /You got a balloon/);
await page.click('.fp-x');
assert.ok(await page.isHidden('.fp-sheet'));
assert.equal(await page.textContent('#tix'), String(have - 15));
assert.match(await page.textContent('#shelf'), /🎈/, 'the balloon is on the shelf');

// A prize the pocket can't run to is dimmed, and says how far off it is under its price ('3 to go'), and to a screen
// reader too.
const pocket = async w => { await page.evaluate(w => localStorage.setItem('free-play.wallet', JSON.stringify(w)), w); await page.reload(); };
await pocket({ tickets: 7, prizes: {} });
await page.click('#trade');
assert.deepEqual(await page.locator('.fp-prize').evaluateAll(els => els.slice(0, 2).map(e => e.getAttribute('aria-label'))), ['Lollipop, 5 tickets', 'Spider ring, 10 tickets, 3 more than you have']);
assert.deepEqual(await page.locator('.fp-prize').evaluateAll(els => els.map(e => e.querySelector('.g')?.textContent || '')).then(g => [g[0], g[1], g[15], g[17]]), ['', '3 to go', '2,493 to go', '9,993 to go']);
await page.click('.fp-x');

// One ticket is one ticket: one short of a lollipop, and one left in the pocket.
await pocket({ tickets: 4, prizes: {} });
await page.click('#trade');
await page.click('.fp-prize >> nth=0');
assert.equal(await page.textContent('.fp-toast'), 'You need 1 more ticket for that. Save up for this');
await page.click('.fp-x');
await pocket({ tickets: 1, prizes: {} });
assert.equal((await page.textContent('#purse')).trim(), '1 ticket · Prize counter', 'the purse at 1');
assert.equal(await page.textContent('#trade'), 'Trade your 1 ticket');
await page.click('#trade');
assert.equal((await page.textContent('.fp-bal')).trim(), '1 ticket', "the counter's heading at 1");
await page.click('.fp-x');
await pocket({ tickets: 12345, prizes: {} });
assert.equal(await page.textContent('#trade'), 'Trade your 12,345 tickets');

// A double tap at the counter buys one, not two; two taps a second apart buy two.
const stored = () => page.evaluate(() => localStorage.getItem('free-play.wallet'));
const tapPrize = async n => {
  const box = await page.locator('.fp-prize').nth(n).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};
await pocket({ tickets: 10, prizes: {} });
await page.click('#trade');
await tapPrize(0);
await page.waitForTimeout(120);
await tapPrize(0);
await page.waitForTimeout(300);
assert.deepEqual(JSON.parse(await stored()), { tickets: 5, prizes: { lollipop: 1 } }, 'a double tap on the lollipop bought it once');
assert.match(await page.textContent('.fp-toast'), /^You got a lollipop\. ?Undo$/);
await page.waitForTimeout(1000);
await tapPrize(0);
await page.waitForTimeout(300);
assert.deepEqual(JSON.parse(await stored()), { tickets: 0, prizes: { lollipop: 2 } }, 'a second tap a second later buys another');
assert.match(await page.textContent('.fp-toast'), /^You got a lollipop\. That's 2 on your shelf\./);
await page.click('.fp-x');

// A trade can be undone, and leaves the pocket as it was. The Undo button is a thumb's height, and on the keyboard
// it comes straight after the prizes.
await pocket({ tickets: 120, prizes: { duck: 1, 'plush-frog': 2 } });
const was = await stored();
await page.click('#trade');
await tapPrize(1);
const undoBox = await page.locator('.fp-undo').boundingBox();
assert.ok(undoBox.height >= 44, `the Undo button is ${undoBox.height}px tall`);
const clear = await page.evaluate(() => {
  const s = document.querySelector('.fp-sheet-in');
  s.scrollTop = s.scrollHeight;
  const tiles = [...document.querySelectorAll('.fp-prize')].map(e => e.getBoundingClientRect().bottom);
  return document.querySelector('.fp-toast').getBoundingClientRect().top - Math.max(...tiles);
});
assert.ok(clear > 0, `scrolled to the end, the toast is clear of the bottom row (${clear}px)`);
await page.waitForTimeout(800);
await page.click('.fp-undo');
assert.equal(await stored(), was, 'the pocket is as it was before the trade');
assert.match(await page.textContent('.fp-toast'), /^Traded back\. Your 10 tickets are back in your pocket\.$/);
assert.equal(await page.textContent('.fp-bal b'), '120');
await page.waitForTimeout(800);
await page.focus('.fp-prize >> nth=0');
await page.keyboard.press('Enter');
assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'lollipop', 'the keyboard stays on the prize');
await page.focus('.fp-prize >> nth=17');
await page.keyboard.press('Tab');
assert.ok(await page.evaluate(() => document.activeElement.matches('.fp-undo')), 'Tab from the last prize reaches Undo');
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
assert.equal(await stored(), was, 'undone from the keyboard too');
assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'lollipop', 'and the keyboard goes back to the prize');
await page.click('.fp-x');
assert.equal(await page.textContent('#tix'), '120');

// Saving up for a prize. A tap on one the pocket can't run to says how far short it is, with a choice to save up for
// it; once picked, it's in gold at the counter, and the floor's pocket says how far off it is in place of 'Prize
// counter' (a screen reader still hears both), under the tickets on a phone. Once there's enough it says so, and
// trading for it ends the saving up (Undo puts it back). A tap on it while it's still to go can stop the saving up.
const goalSaved = () => page.evaluate(() => localStorage.getItem('free-play.goal'));
await pocket({ tickets: 1320, prizes: {} });
await page.click('#trade');
await page.click('.fp-prize[data-id="bear"]');
assert.equal(await page.textContent('.fp-toast'), 'You need 180 more tickets for that. Save up for this');
assert.ok((await page.locator('.fp-toast .fp-act').boundingBox()).height >= 44, 'the choice is a thumb tall');
await page.click('.fp-toast .fp-act');
assert.equal(await goalSaved(), '{"id":"bear"}');
assert.equal(await page.textContent('.fp-toast'), 'Saving up for the giant teddy bear: 180 to go.');
assert.deepEqual(await page.locator('.fp-prize.goal').evaluateAll(els => els.map(e => [e.dataset.id, e.querySelector('.g').textContent, e.getAttribute('aria-label')])),
  [['bear', '180 to go', 'Giant teddy bear, 1,500 tickets, 180 more than you have, saving up for it']]);
await page.click('.fp-x');
assert.equal(await page.textContent('#goal'), '180 to the giant teddy bear');
assert.ok(await page.isVisible('#goal'), 'the pocket says how far off it is');
assert.ok((await page.locator('#purse .to').boundingBox()).width <= 1, "in place of 'Prize counter'");
assert.match(await page.locator('#purse').ariaSnapshot(), /^- button "1,320 tickets · Prize counter · 180 to the giant teddy bear"/, "the purse's name, saving up");
for (const width of [320, 390, 1280]) {
  await page.setViewportSize({ width, height: 844 });
  const [purse, tix, goal] = await page.evaluate(() => ['purse', 'tix', 'goal'].map(id => document.getElementById(id).getBoundingClientRect().toJSON()));
  assert.ok(purse.left >= 16 && purse.right <= width - 16, `at ${width} px, the pocket runs off the side`);
  if (width < 560) assert.ok(goal.top >= tix.bottom - 4 && purse.height < 64, `at ${width} px, the goal goes under the tickets (${Math.round(purse.height)} px)`);
  else assert.ok(Math.abs(goal.top - tix.top) < 12 && purse.height < 48, `at ${width} px, the goal is beside the tickets`);
}
await page.setViewportSize({ width: 390, height: 844 });
await pocket({ tickets: 1500, prizes: {} });
assert.equal(await page.textContent('#goal'), 'Enough for the giant teddy bear!');
await page.click('#trade');
assert.equal(await page.textContent('.fp-prize.goal .g'), 'Saved up!');
await page.click('.fp-prize[data-id="bear"]');
assert.equal(await goalSaved(), null, 'traded for, the saving up is done');
assert.equal(await page.locator('.fp-prize.goal').count(), 0);
await page.waitForTimeout(800);
await page.click('.fp-undo');
assert.equal(await goalSaved(), '{"id":"bear"}', 'and back with Undo');
await pocket({ tickets: 1320, prizes: {} });
await page.click('#trade');
await page.click('.fp-prize[data-id="bear"]');
assert.equal(await page.textContent('.fp-toast'), "You need 180 more tickets for the giant teddy bear. You're saving up for it. Stop saving");
await page.click('.fp-toast .fp-act');
assert.equal(await goalSaved(), null);
assert.equal(await page.textContent('.fp-toast'), "You've stopped saving up for the giant teddy bear.");
await page.click('.fp-prize[data-id="giraffe"]');
await page.click('.fp-toast .fp-act');
assert.equal(await goalSaved(), '{"id":"giraffe"}', 'another prize to save up for');
await page.click('.fp-x');
assert.equal(await page.textContent('#goal'), '8,680 to the life-size giraffe');
// (picked in another tab, the pocket here says so)
const other = await ctx.newPage();
await other.goto(base);
await other.evaluate(() => localStorage.setItem('free-play.goal', JSON.stringify({ id: 'unicorn' })));
await until(async () => (await page.textContent('#goal')) === '1,180 to the enormous unicorn', 3000, 'a goal picked in another tab');
await other.evaluate(() => localStorage.removeItem('free-play.goal'));
await until(async () => await page.isHidden('#goal'), 3000, 'a goal dropped in another tab');
assert.equal((await page.textContent('#purse')).trim(), '1,320 tickets · Prize counter');
await other.close();

// A big prize, 600 tickets and up, is handed over: it comes down large onto a plank at the foot of the counter, with a
// line of its own and Undo under it, all on the screen. A small one keeps its short line. Set to cut down motion, the
// phone shows the prize already on its plank.
await pocket({ tickets: 3000, prizes: {} });
await page.click('#trade');
await page.click('.fp-prize[data-id="lollipop"]');
assert.equal(await page.locator('.fp-toast.fp-handover').count(), 0, 'a lollipop is just handed over');
await page.waitForTimeout(800);
await page.click('.fp-prize[data-id="unicorn"]');
assert.ok(await page.isVisible('.fp-sheet .fp-toast.fp-handover'), 'the unicorn is handed over at the foot of the counter');
assert.equal(await page.textContent('.fp-big'), '🦄');
assert.equal(await page.textContent('.fp-toast'), '🦄The enormous unicorn comes down off the top shelf. 2,500 tickets. Undo');
assert.equal(await page.getAttribute('.fp-big', 'aria-hidden'), 'true', 'a screen reader hears the line, not the emoji');
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.fp-big i')).animationName), 'fp-down', 'it comes down');
await page.waitForTimeout(900);
const handed = await page.evaluate(() => {
  const box = e => document.querySelector(e).getBoundingClientRect();
  const t = box('.fp-toast'), big = box('.fp-big i'), plank = box('.fp-big'), undo = box('.fp-undo');
  return { inside: t.left >= 0 && t.right <= innerWidth && t.top >= 0 && t.bottom <= innerHeight, onPlank: Math.abs(big.bottom - plank.bottom) < 12, size: big.height, undo: undo.height };
});
assert.ok(handed.inside, 'the hand-over is on the screen');
assert.ok(handed.onPlank && handed.size > 50, `the unicorn sits large on its plank (${JSON.stringify(handed)})`);
assert.ok(handed.undo >= 44, 'Undo is a thumb tall');
await page.click('.fp-undo');
assert.match(await page.textContent('.fp-toast'), /^Traded back\./);
assert.equal(await page.locator('.fp-toast.fp-handover').count(), 0, 'and the hand-over goes with Undo');
await page.click('.fp-x');
const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
const cp = await calm.newPage();
await cp.goto(base);
await cp.evaluate(() => localStorage.setItem('free-play.wallet', JSON.stringify({ tickets: 900, prizes: {} })));
await cp.reload();
await cp.click('#trade');
await cp.click('.fp-prize[data-id="flamingo"]');
assert.equal(await cp.textContent('.fp-toast'), '🦩The blow-up flamingo comes down off the top shelf. 900 tickets. Undo');
assert.equal(await cp.evaluate(() => getComputedStyle(document.querySelector('.fp-big i')).animationName), 'none', 'set to cut down motion, nothing drops');
await calm.close();

// The shelf, on the floor and in the counter: every row of prizes stands on a plank of its own, the outlines of what's
// still to win as well. (Read off the pixels down the shelf's left edge, clear of the prizes.)
async function planks(sel) {
  const png = (await page.locator(sel).screenshot()).toString('base64');
  return page.evaluate(async ([sel, png]) => {
    const shelf = document.querySelector(sel), box = shelf.getBoundingClientRect();
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const k = img.width / box.width, px = g.getImageData(Math.round(5 * k), 0, 1, img.height).data;
    const bands = [];
    for (let y = 0; y < img.height; y++) {
      if (!(px[y * 4] > px[y * 4 + 2] + 20 && px[y * 4] > 55)) continue; // brown
      if (bands.length && bands.at(-1)[1] >= y - 1) bands.at(-1)[1] = y;
      else bands.push([y, y]);
    }
    const feet = [...new Set([...shelf.children].map(e => Math.round(e.getBoundingClientRect().bottom - box.top)))];
    return { feet, bands: bands.map(([a, b]) => [a / k, (b + 1) / k]) };
  }, [sel, png]);
}
for (const [kinds, rows] of [[0, 3], [3, 3], [10, 4], [SHELF.length, 5]]) {
  await pocket({ tickets: 50, prizes: Object.fromEntries(SHELF.slice(0, kinds).map((p, i) => [p.id, (i % 3) + 1])) });
  for (const [where, sel] of [['the floor', '#shelf'], ['the counter', '.fp-shelf']]) {
    if (sel === '.fp-shelf') await page.click('#trade');
    const { feet, bands } = await planks(sel);
    assert.ok(feet.length >= rows, `${where}: ${kinds} kinds of prize on a phone take ${feet.length} rows`);
    assert.equal(bands.length, feet.length, `${where}, ${feet.length} rows: ${bands.length} planks`);
    feet.forEach((foot, i) => assert.ok(bands[i][0] > foot - 12 && bands[i][1] < foot + 3, `${where}: row ${i + 1}, at ${foot} px, isn't on its plank (${bands[i]})`));
    if (sel === '.fp-shelf') await page.click('.fp-x');
  }
}

// A tap on a prize on the shelf says what it is, on the floor and in the counter.
await pocket({ tickets: 50, prizes: { 'plush-frog': 3, 'plush-alien': 1 } });
assert.deepEqual(await page.locator('#shelf button:not(.fp-yet)').evaluateAll(els => els.map(e => e.getAttribute('aria-label'))), ['Plush frog, 3', 'Plush alien']);
await page.tap('#shelf button:not(.fp-yet) >> nth=0');
assert.equal(await page.textContent('.fp-toast'), 'Plush frog. You have 3.');
await page.tap('#shelf button:not(.fp-yet) >> nth=1');
assert.equal(await page.textContent('.fp-toast'), 'Plush alien.');
await page.click('#trade');
await page.tap('.fp-shelf button:not(.fp-yet) >> nth=1');
assert.equal(await page.textContent('.fp-toast'), 'Plush alien.');
assert.ok(await page.isVisible('.fp-sheet .fp-toast'), 'in the counter, the name comes up at its foot');
await page.click('.fp-x');

// What's won outright has its place on the shelf from the start, in the order it sits there once won: a faint outline
// until then (the rare ones a '?'), named as not won yet, and a tap says where it's won, or what a trophy is for. Tab
// leaves the outlines out. The line under the shelf counts each set.
const places = await page.locator('#shelf .fp-item').evaluateAll(els => els.map(e => [e.getAttribute('aria-label'), e.classList.contains('fp-yet'), e.tabIndex]));
assert.deepEqual(places.slice(0, 7), [
  ['Plush bear, not won yet', true, -1], ['Plush chick, not won yet', true, -1], ['Plush frog, 3', false, 0], ['Plush ghost, not won yet', true, -1],
  ['Plush penguin, not won yet', true, -1], ['Plush alien', false, 0], ['Something rare from Clutch, not won yet', true, -1],
]);
assert.deepEqual(places.slice(7, 12).map(p => p[0]), ['Plastic watch, not won yet', 'Toy car, not won yet', 'Lucky keyring, not won yet', 'Wind-up robot, not won yet', 'Something rare from Topple, not won yet']);
assert.equal(places.length, OUTRIGHT.length);
assert.equal(await tally('#collected'), "2 of 7 plush · 0 of Topple's 5 prizes · 0 of 8 trophies");
assert.equal(await page.locator('#shelf .fp-rare').evaluateAll(els => els.map(e => e.textContent).join('')), '', "(a '?' that's drawn, so the shelf's words are its names)");
for (const [label, said] of [
  ['Plush bear, not won yet', "Plush bear. Not won yet. It's in Clutch's heap."],
  ['Something rare from Clutch, not won yet', "Something rare. Not won yet. It turns up in Clutch's heap now and then."],
  ['Toy car, not won yet', "Toy car. Not won yet. It turns up on Topple's deck."],
  ['Something rare from Topple, not won yet', "Something rare. Not won yet. It turns up on Topple's deck now and then."],
  ['Hoops trophy, not won yet', 'Hoops trophy, for 32 baskets in a round. Not won yet.'],
]) {
  await page.tap(`#shelf [aria-label="${label}"]`);
  assert.equal(await page.textContent('.fp-toast'), said, `a tap on ${label}`);
}
await pocket({ tickets: 50, prizes: Object.fromEntries(OUTRIGHT.map(p => [p.id, 1])) });
assert.equal(await page.locator('#shelf .fp-yet').count(), 0, 'with everything won, no outlines');
assert.equal(await tally('#collected'), "7 of 7 plush · 5 of Topple's 5 prizes · 8 of 8 trophies");
await page.click('#trade');
assert.equal(await tally('.fp-collected'), "7 of 7 plush · 5 of Topple's 5 prizes · 8 of 8 trophies", 'and the same in the counter');
await page.click('.fp-x');

// Scrolling the counter scrolls the counter, not the floor behind it: opened from the foot of the floor and scrolled
// up past its top, it leaves the floor where it was.
await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
const foot = await page.evaluate(() => scrollY);
await page.click('#trade');
await page.mouse.move(195, 600);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(50); }
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => scrollY), foot, 'scrolling up the counter scrolled the floor behind it');
await page.click('.fp-x');

// Saves with an odd value in them still open: a best of null (what a NaN is saved as), and today's card saved
// without its balls. (The saves there were are put back after.)
const ODD = ['free-play.popgun', 'free-play.bonkers', 'free-play.hoops', 'free-play.roll-up', 'free-play.topple'];
const saves = await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), ODD);
const day = new Date(), today = [day.getFullYear(), day.getMonth() + 1, day.getDate()].map(n => String(n).padStart(2, '0')).join('-');
await page.evaluate(([keys, today]) => {
  for (const k of keys) localStorage.setItem(k, JSON.stringify({ best: null, rounds: 3 }));
  localStorage.setItem('free-play.roll-up', JSON.stringify({ best: 120, games: 4, daily: { key: today, score: 5 } }));
  localStorage.setItem('free-play.topple', JSON.stringify({ best: 1, cups: 2 })); // (and a best cup of one ticket)
}, [ODD, today]);
for (const [path, name] of [['popgun/', 'popgun'], ['bonkers/', 'bonkers'], ['hoops/', 'hoops']]) {
  await page.goto(base + path);
  await page.waitForFunction(name => !!window[name], name, { timeout: 5000 });
  assert.equal(await page.textContent('#titleBest'), 'Best: 0.', `${name} opens with a best of null`);
}
await page.goto(base + 'roll-up/');
await page.waitForFunction(() => !!window.rollUp, null, { timeout: 5000 });
assert.equal(await page.textContent('#daily'), "Today's card", "a card with no balls isn't today's played card");
await page.goto(base + 'topple/');
await page.waitForFunction(() => !!window.topple, null, { timeout: 5000 });
assert.equal(await page.textContent('#titleBest'), 'Best cup: 1 ticket.');
await page.goto(base);
await page.waitForFunction(() => !!window.freePlay, null, { timeout: 5000 });
assert.equal(await page.textContent('#rollUpStat'), "Today's card is ready: nine called shots. Best: 120.");
assert.equal(await page.textContent('#toppleStat'), 'Best cup: 1 ticket.');
await page.evaluate(([keys, saves]) => keys.forEach((k, i) => (saves[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saves[i]))), [ODD, saves]);

// A daily player's cabinets: Roll Up's run of days, with today's card played or still to play (and its title card says
// so too), a Topple cup on the go, and more than one lucky star from Clutch. (The saves there were are put back after.)
const DAILY = ['free-play.roll-up', 'free-play.topple', 'free-play.clutch', 'free-play.wallet'];
const dailySaves = await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), DAILY);
const yday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 12);
const yesterday = [yday.getFullYear(), yday.getMonth() + 1, yday.getDate()].map(n => String(n).padStart(2, '0')).join('-');
const nine = Array.from({ length: 9 }, (_, i) => ({ value: 30, points: 30, hit: i < 5 }));
const seed = saves => page.evaluate(saves => { for (const [k, v] of Object.entries(saves)) localStorage.setItem(k, JSON.stringify(v)); }, saves);
await seed({
  'free-play.roll-up': { best: 450, games: 9, daily: { key: today, score: 310, balls: nine, streak: 6 } },
  'free-play.topple': { best: 34, cups: 3, cup: { left: 12, won: 5, prizes: [] } },
  'free-play.clutch': { goes: 30, won: { frog: 3, star: 2 } },
});
await page.reload();
await page.waitForFunction(() => !!window.freePlay);
assert.equal(await page.textContent('#rollUpStat'), "Today's card: 310, 5 of 9 calls, 6 days in a row. Best: 450.");
assert.equal(await page.textContent('#toppleStat'), 'A cup on the go: 12 coins left. Best cup: 34 tickets.');
assert.equal(await page.textContent('#clutchStat'), '5 plush won, 2 lucky stars among them.');
await seed({ 'free-play.roll-up': { best: 450, games: 9, daily: { key: yesterday, score: 200, balls: nine, streak: 3 } } });
await page.reload();
await page.waitForFunction(() => !!window.freePlay);
assert.equal(await page.textContent('#rollUpStat'), "Today's card is ready. Play it to make it 4 days in a row. Best: 450.");
await page.goto(base + 'roll-up/');
await page.waitForFunction(() => !!window.rollUp, null, { timeout: 5000 });
// (on Roll Up's small title card, back after a game, the line under its buttons is just the run of days)
assert.equal(await page.textContent('#dailyHow'), 'Play it to make it 4 days in a row.');
assert.ok(await page.isVisible('#dailyHow'));
await page.goto(base);
await page.waitForFunction(() => !!window.freePlay, null, { timeout: 5000 });
// Today's card part-way through: the cabinet says how many balls are left.
const three = nine.slice(0, 3);
await seed({ 'free-play.roll-up': { best: 450, games: 9, going: { key: today, score: 90, balls: three } } });
await page.reload();
await page.waitForFunction(() => !!window.freePlay);
assert.equal(await page.textContent('#rollUpStat'), "Today's card on the go: 6 balls left. Best: 450.");
// Left part-way yesterday, it counted as played then, with the balls rolled: the run of days goes on, and Roll Up pays
// for those balls when it next opens (once).
const dby = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 2, 12);
const dayBeforeYesterday = [dby.getFullYear(), dby.getMonth() + 1, dby.getDate()].map(n => String(n).padStart(2, '0')).join('-');
await seed({ 'free-play.roll-up': { best: 450, games: 9, daily: { key: dayBeforeYesterday, score: 200, balls: nine, streak: 2 }, going: { key: yesterday, score: 90, balls: three } } });
await page.reload();
await page.waitForFunction(() => !!window.freePlay);
assert.equal(await page.textContent('#rollUpStat'), "Today's card is ready. Play it to make it 4 days in a row. Best: 450.");
const pocketBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
for (let visit = 0; visit < 2; visit++) {
  await page.goto(base + 'roll-up/');
  await page.waitForFunction(() => !!window.rollUp, null, { timeout: 5000 });
  assert.ok(await page.isVisible('#title'), "yesterday's card isn't today's: Roll Up opens on its title card");
  assert.equal(await page.textContent('#dailyHow'), 'Play it to make it 4 days in a row.');
  assert.deepEqual(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('free-play.roll-up')); return [s.going, s.games, s.daily.key, s.daily.score, s.daily.streak]; }), [undefined, 10, yesterday, 90, 3]);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).tickets), pocketBefore + 9, `paid for its three balls, once (visit ${visit + 1})`);
}
await page.goto(base);
await page.waitForFunction(() => !!window.freePlay, null, { timeout: 5000 });
await page.evaluate(([keys, saves]) => keys.forEach((k, i) => (saves[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saves[i]))), [DAILY, dailySaves]);

// A machine played in another tab: the floor's cabinet says so without a reload, and so does the pocket.
const tab = await ctx.newPage();
await tab.goto(base + 'popgun/');
await tab.waitForFunction(() => !!window.popgun, null, { timeout: 5000 });
const [popSave, walletSave] = await tab.evaluate(() => ['free-play.popgun', 'free-play.wallet'].map(k => localStorage.getItem(k)));
await tab.evaluate(() => {
  localStorage.setItem('free-play.popgun', JSON.stringify({ ...JSON.parse(localStorage.getItem('free-play.popgun') || '{}'), best: 777, rounds: 9 }));
  localStorage.setItem('free-play.wallet', JSON.stringify({ ...JSON.parse(localStorage.getItem('free-play.wallet')), tickets: 4321 }));
});
await page.waitForFunction(() => document.getElementById('popgunStat').textContent === 'Best: 777.', null, { timeout: 3000 });
assert.equal(await page.textContent('#tix'), '4,321', 'the pocket follows the other tab');
await tab.evaluate(saves => Object.entries(saves).forEach(([k, v]) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v))),
  { 'free-play.popgun': popSave, 'free-play.wallet': walletSave });
await tab.close();

// One Sound switch for the whole arcade, at the foot of the floor and in every machine's menu. Before it's first
// flipped each machine keeps its own (Topple muted on its own stays muted, the rest are on), and the floor's says on
// while any of them is. Flipped on the floor, every machine is off, a machine open in another tab too; flipped in a
// machine, every machine is on again and the floor follows. (The saves there were are put back after.)
{
  const KEYS = ['free-play.sound', 'free-play.topple'];
  const was = await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), KEYS);
  await page.evaluate(() => {
    localStorage.removeItem('free-play.sound');
    localStorage.setItem('free-play.topple', JSON.stringify({ ...JSON.parse(localStorage.getItem('free-play.topple') || '{}'), sound: false }));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.freePlay);
  const said = (p, id = 'sound') => p.evaluate(id => [document.getElementById(id).textContent, document.getElementById(id).getAttribute('aria-pressed')], id);
  assert.deepEqual(await said(page), ['Sound: on', 'true'], 'the floor says on while any machine is');
  const box = await page.locator('#sound').boundingBox();
  assert.ok(box.height >= 44, `the floor's Sound button is ${box.height} px tall`);
  const other = await ctx.newPage();
  const hook = { 'roll-up': 'rollUp', tilt: 'tilt', clutch: 'clutch', topple: 'topple', highrise: 'highrise', popgun: 'popgun', bonkers: 'bonkers', hoops: 'hoops' };
  const visit = async m => { await other.goto(base + m + '/'); await other.waitForFunction(h => !!window[h], hook[m], { timeout: 10000 }); };
  await visit('topple');
  assert.deepEqual(await said(other), ['Sound: off', 'false'], 'Topple muted on its own stays muted until the switch is flipped');
  await visit('popgun');
  assert.deepEqual(await said(other), ['Sound: on', 'true']);
  await page.click('#sound');
  assert.deepEqual(await said(page), ['Sound: off', 'false']);
  assert.equal(await page.evaluate(() => localStorage.getItem('free-play.sound')), '{"on":false}');
  await other.waitForFunction(() => document.getElementById('sound').textContent === 'Sound: off', null, { timeout: 3000 }); // Popgun, open in the other tab
  for (const m of Object.keys(hook)) {
    await visit(m);
    assert.deepEqual(await said(other, m === 'tilt' ? 'soundBtn' : 'sound'), ['Sound: off', 'false'], `${m} still has sound on`);
  }
  // Hoops, the last one open, flipped from its menu: on again, everywhere
  await other.evaluate(() => document.getElementById('sound').click());
  assert.deepEqual(await said(other), ['Sound: on', 'true']);
  await page.waitForFunction(() => document.getElementById('sound').textContent === 'Sound: on', null, { timeout: 3000 });
  await visit('topple');
  assert.deepEqual(await said(other), ['Sound: on', 'true'], "the switch is Topple's too now");
  await other.close();
  await page.evaluate(([keys, saves]) => keys.forEach((k, i) => (saves[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saves[i]))), [KEYS, was]);
}

// Records, at the end of the row of machines: each machine's top five with its days, what else it keeps worth a look,
// and the all-time totals. (The saves there were are put back after.)
{
  const KEYS = ['free-play.roll-up', 'free-play.tilt', 'free-play.clutch', 'free-play.topple', 'free-play.highrise', 'free-play.popgun', 'free-play.bonkers', 'free-play.hoops', 'free-play.totals'];
  const was = await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), KEYS);
  await page.evaluate(keys => keys.forEach(k => localStorage.removeItem(k)), KEYS);
  await page.evaluate(([today]) => {
    const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    put('free-play.roll-up', { best: 410, games: 9, longest: 6, top: [{ score: 410, date: '2026-10-21' }, { score: 380, date: today }] });
    put('free-play.tilt', { scores: [{ score: 268550, date: '2026-10-24' }], hauntedScores: [{ score: 96200, date: '2025-12-31' }] });
    put('free-play.clutch', { goes: 40, won: { frog: 3, star: 1 } });
    put('free-play.topple', { best: 34, cups: 4, prizes: 1, top: [{ score: 34, date: '2026-10-20' }] });
    put('free-play.highrise', { best: 15, games: 8, tops: 2, top: [{ score: 15, date: '2026-10-26' }, { score: 11, date: '2026-10-23' }] });
    put('free-play.bonkers', { best: 795, rounds: 3 }); // a best from before there was a list: no day
    put('free-play.totals', { since: '2026-10-28', tickets: 1874, traded: 9, rounds: { 'roll-up': 12, tilt: 4 } });
  }, [today]);
  await page.goto(base);
  await page.waitForFunction(() => !!window.freePlay);
  await page.click('.aisle a.records');
  await page.waitForURL(base + 'records/');
  await page.waitForFunction(() => !!window.records);
  const text = id => page.evaluate(id => document.getElementById(id).innerText.replace(/\s+/g, ' ').trim(), id);
  assert.deepEqual([await text('totTickets'), await text('totRounds'), await text('totTraded'), await text('since')], ['1,874', '16', '9', 'Counted since Oct 28.']);
  const short = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  assert.equal(await text('rollUpRec'), `410 Oct 21 380 ${short} Longest run of days on today's card: 6.`);
  assert.equal(await text('tiltRec'), 'Classic 268,550 Oct 24 Haunted House 96,200 Dec 31, 2025');
  assert.equal(await text('clutchRec'), '4 plush won 🐸 3 🌟 1');
  assert.equal(await text('toppleRec'), '34 tickets Oct 20 1 prize pushed off the deck.');
  assert.equal(await text('highriseRec'), 'Floor 15 Oct 26 Floor 11 Oct 23 Topped out twice.');
  assert.equal(await text('bonkersRec'), '795', 'a best kept from before the list, with no day');
  assert.equal(await text('popgunRec'), 'No rounds yet.');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the records scroll sideways on a phone');
  // a machine's name goes to it, and the way back goes to the floor
  assert.equal(await page.getAttribute('#recHoops', 'href'), '../hoops/');
  await page.click('.to-floor');
  await page.waitForURL(base);
  await page.evaluate(([keys, was]) => keys.forEach((k, i) => (was[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, was[i]))), [KEYS, was]);
}

// From the floor to a machine and back, the pages crossfade (a view transition, in a browser that has them), and the
// machine's title card fades up; Tilt's on its sheet. On a phone set to cut down motion, neither: a plain cut.
for (const reducedMotion of ['no-preference', 'reduce']) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion, serviceWorkers: 'block' });
  await c.addInitScript(() => addEventListener('pagereveal', e => { window.__crossfade = !!e.viewTransition; }));
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(e.message));
  await p.goto(base);
  await p.waitForFunction(() => !!window.freePlay);
  const fades = reducedMotion === 'no-preference';
  for (const [m, hook, card] of [['hoops', 'hoops', '#title'], ['tilt', 'tilt', '#title']]) {
    await p.click(`.cab.${m}`);
    await p.waitForURL(base + m + '/');
    await p.waitForFunction(h => !!window[h], hook);
    assert.equal(await p.evaluate(() => window.__crossfade), fades, `in to ${m}, with ${reducedMotion} motion: ${fades ? 'no crossfade' : 'a crossfade'}`);
    assert.equal(await p.evaluate(sel => getComputedStyle(document.querySelector(sel)).animationName, card), fades ? 'fp-card-up' : 'none', `${m}'s title card, with ${reducedMotion} motion`);
    await p.click('#title .to-floor');
    await p.waitForURL(base);
    await p.waitForFunction(() => !!window.freePlay);
    assert.equal(await p.evaluate(() => window.__crossfade), fades, `back from ${m}, with ${reducedMotion} motion`);
  }
  await c.close();
}

// In a Safari tab on an iPhone, a line under the pocket says to add Free Play to the Home Screen and play there, so
// Safari can't clear the tickets (Safari clears a site's saves after seven days of use without a visit; a Home Screen
// app keeps its own count), and that it starts there with an empty pocket (a Home Screen app has its own storage, so
// what was won in the tab doesn't come along), with the row of machines still on the first screen, until its × puts it
// away for good. Not in the Home Screen app, not in Chrome on an iPhone, and not here in Chromium.
{
  assert.equal(await page.isHidden('#keep'), true, 'the Home Screen line shows in Chromium on a computer');
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
  const phone = async (standalone, userAgent = IPHONE) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent, serviceWorkers: 'block' });
    await c.addInitScript(s => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => s, configurable: true }), standalone);
    const p = await c.newPage();
    p.on('pageerror', e => problems.push(e.message));
    await p.goto(base);
    await p.waitForFunction(() => !!window.freePlay);
    return p;
  };
  const tab = await phone(false);
  assert.equal(await tab.isVisible('#keep'), true, "in a Safari tab on an iPhone there's no line about the Home Screen");
  assert.equal((await tab.textContent('#keep span')).replaceAll('\u00a0', ' '), "Add Free Play to your Home Screen and play there, so Safari can't clear your tickets. It starts with an empty pocket."); // ('Home Screen' kept together)
  const row = await tab.locator('.aisle a').evaluateAll(els => Math.max(...els.map(a => a.getBoundingClientRect().bottom)));
  assert.ok(row <= 844, `with the Home Screen line, the row of machines runs ${Math.round(row - 844)} px below the first screen`);
  const x = await tab.locator('#keepX').boundingBox();
  assert.ok(x.width >= 44 && x.height >= 44, `the line's × is ${x.width} x ${x.height} px`);
  assert.match(await tab.locator('#keepX').ariaSnapshot(), /^- button "Hide this"/, "the line's × to a screen reader");
  await tab.tap('#keepX');
  assert.equal(await tab.isHidden('#keep'), true, 'the × leaves the line up');
  await tab.reload();
  await tab.waitForFunction(() => !!window.freePlay);
  assert.equal(await tab.isHidden('#keep'), true, 'put away, the line comes back on the next visit');
  await tab.context().close();
  for (const [standalone, ua, where] of [[true, IPHONE, 'the Home Screen app'], [false, CHROME, 'Chrome on an iPhone']]) {
    const p = await phone(standalone, ua);
    assert.equal(await p.isHidden('#keep'), true, `the Home Screen line shows in ${where}`);
    await p.context().close();
  }
}

// Today's special under the pocket, on a day that's Tilt's (Oct 31, 2026, on Haunted House): which machine, its goal,
// and the badge on its cabinet; and once it's made, that it's made. Tilt's title card says the goal too.
{
  const sc = await openOn({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await sc.clock.setFixedTime(new Date(2026, 9, 31, 12));
  const sp = await sc.newPage();
  sp.on('pageerror', e => problems.push('special: ' + e.message));
  sp.on('request', r => { if (r.url().startsWith(base)) loaded.add(new URL(r.url()).pathname.slice(1) || './'); });
  await sp.goto(base);
  await sp.waitForFunction(() => !!window.freePlay);
  assert.equal(await sp.textContent('#today'), "Today's special: Tilt. Score 50,000 on Haunted House for 25 more tickets.");
  assert.equal(await sp.getAttribute('#today a', 'href'), 'tilt/?table=haunted', "the name goes to Tilt on the day's table");
  const badges = await sp.evaluate(() => [...document.querySelectorAll('.cab')].map(c => [c.id, c.querySelector('.coin').textContent]));
  assert.deepEqual(badges.filter(([, t]) => t !== 'Free play'), [['tilt', 'Special']], "the badge says Special on Tilt's cabinet only");
  assert.equal(await sp.getAttribute('.cab.tilt', 'aria-describedby'), 'tiltWhat today', 'and a screen reader hears it with the cabinet');
  const under = await sp.evaluate(() => [document.getElementById('purse').getBoundingClientRect().bottom, document.getElementById('today').getBoundingClientRect().top]);
  assert.ok(under[1] >= under[0], 'the line is under the pocket');
  await sp.click('#today a');
  await sp.waitForURL(base + 'tilt/?table=haunted');
  await sp.waitForFunction(() => !!window.tilt);
  assert.equal(await sp.evaluate(() => document.querySelector('#tables input:checked').value), 'haunted', 'Tilt opens on the table the special is on');
  assert.equal(await sp.textContent('#titleSpecial'), "Today's special: score 50,000 on Haunted House for 25 more tickets.");
  await sp.evaluate(() => localStorage.setItem('free-play.special', JSON.stringify({ key: '2026-10-31', machine: 'tilt' })));
  await sp.goto(base);
  await sp.waitForFunction(() => !!window.freePlay);
  assert.equal(await sp.textContent('#today'), "Today's special: Tilt. You made it: 25 more tickets. A new one tomorrow.");
  await sc.close();
}

// Every file the pages loaded is kept for offline.
const shell = [...(await readFile(join(root, 'sw.js'), 'utf8')).match(/SHELL = \[([^\]]*)\]/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
assert.deepEqual([...loaded].filter(f => f !== 'sw.js' && !shell.includes(f)), [], 'files the pages load but sw.js does not keep');

// Chrome would offer to install it.
const cdp = await ctx.newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
assert.deepEqual(installabilityErrors, [], 'Chrome says it can’t be installed');
const { errors, manifest } = await cdp.send('Page.getAppManifest');
assert.deepEqual(errors, []);
// Its id is fixed, and the same as the one Chrome gave it before it had one (its start), so a copy installed then is
// the same app. A long press on the installed app's icon (on Android: Chrome there shows the first few), or a
// right-click on a computer, lists the machines in the floor's order, each with an icon cut from its cabinet's picture.
assert.equal(manifest.id, base, "the app's id");
const shortcuts = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8')).shortcuts;
assert.deepEqual(manifest.shortcuts.map(s => [s.name, s.url]), MACHINES.map(m => [m, base + m.toLowerCase().replace(' ', '-') + '/']), "the app's shortcuts");
for (const s of shortcuts) {
  const png = await readFile(join(root, s.icons[0].src));
  assert.deepEqual([s.icons[0].sizes, png.readUInt32BE(16), png.readUInt32BE(20)], ['96x96', 96, 96], `${s.name}'s shortcut icon`);
}

// The floor on a wide screen: two rows of four from 1,180 px wide (a laptop's), and two by two below that (a
// tablet's). The cabinets in a row end together, their Play buttons in a line (with the pointer away, so none is
// lifted), the prize counter stays its own width under them, and nothing goes sideways.
for (const [width, height, across] of [[1280, 860, 4], [1180, 800, 4], [1179, 800, 2], [1024, 768, 2]]) {
  await page.setViewportSize({ width, height });
  await page.mouse.move(2, 2);
  const rows = await page.evaluate(() => {
    const by = new Map();
    for (const cab of document.querySelectorAll('.cab')) {
      const top = Math.round(cab.getBoundingClientRect().top), go = cab.querySelector('.go').getBoundingClientRect().top;
      by.set(top, [...(by.get(top) || []), Math.round(go)]);
    }
    return [...by.values()];
  });
  assert.deepEqual(rows.map(r => r.length), Array(8 / across).fill(across), `at ${width} px, the cabinets in rows: ${JSON.stringify(rows)}`);
  for (const r of rows) assert.ok(Math.max(...r) - Math.min(...r) <= 1, `at ${width} px, Play buttons in a row at ${r.join(' and ')} px`);
  assert.equal(await page.evaluate(() => Math.round(document.querySelector('.booth').getBoundingClientRect().width)), 900, `at ${width} px, the prize counter's width`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `at ${width} px, the floor scrolls sideways`);
}
await page.setViewportSize({ width: 390, height: 844 });

// Offline: someone who has been to the floor once, and nowhere else, loses the connection. Once the offline copy
// holds every file, the server goes down and the browser goes offline (so the pages see it), and the floor, every
// machine, Tilt's Haunted House and the records open from the copy, with all their fonts and pictures.
const OFFLINE = { '': 'freePlay', 'roll-up/': 'rollUp', 'tilt/': 'tilt', 'clutch/': 'clutch', 'topple/': 'topple', 'highrise/': 'highrise', 'popgun/': 'popgun', 'bonkers/': 'bonkers', 'hoops/': 'hoops' };
const away = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const ap = await away.newPage();
ap.on('pageerror', e => problems.push(e.message));
ap.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });
await ap.goto(base);
await ap.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
await until(() => ap.evaluate(async shell => (await Promise.all(shell.map(f => caches.match(f)))).every(Boolean), shell), 20000, 'the offline copy never held every file');
down = true;
await away.setOffline(true);
for (const [path, name] of [...Object.entries(OFFLINE), ['records/', 'records'], ['tilt/?table=haunted', 'tilt']]) {
  const called = path || 'the floor';
  await ap.goto(base + path).catch(e => assert.fail(`${called} did not open offline: ${e.message.split('\n')[0]}`));
  await ap.waitForFunction(name => !!window[name], name, { timeout: 10000 }).catch(() => assert.fail(`${called} opened offline, but not its game`));
  const [faces, pictures] = await ap.evaluate(async () => {
    await document.fonts.ready;
    return [[...document.fonts].filter(f => f.status === 'error').map(f => f.family), [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src)];
  });
  assert.deepEqual(faces, [], `${called}'s fonts didn't load offline`);
  assert.deepEqual(pictures, [], `${called}'s pictures didn't load offline`);
}
assert.equal(await ap.evaluate(() => window.tilt.table.name), 'Haunted House', "Tilt's link to a table opened another offline");
// A mistyped address gets the arcade's own page saying so, at any depth, styled, with its fonts, and links to the
// floor and every machine that work from there. Offline it comes from the copy (not the floor's page at the wrong
// address, unstyled, which is what it was), and a script, a style or a picture the copy hasn't got fails, rather than
// coming back as a page.
const ADDRESSES = ['/', ...Object.keys(OFFLINE).slice(1).map(p => '/' + p)];
const lostPage = async (path, how) => {
  const seen = await ap.evaluate(async () => {
    await document.fonts.ready;
    return {
      says: document.querySelector('h1')?.textContent, styled: getComputedStyle(document.body).backgroundColor,
      faces: [...document.fonts].filter(f => f.status !== 'loaded').map(f => `${f.family} ${f.status}`),
      links: [...document.querySelectorAll('.home, ul a')].map(a => a.pathname),
    };
  });
  assert.equal(seen.says, "That machine isn't on the floor.", `${path}, ${how}`);
  assert.equal(seen.styled, 'rgb(13, 11, 31)', `${path}, ${how}, has no styles`);
  assert.deepEqual(seen.faces, [], `${path}, ${how}: fonts that didn't load`);
  assert.deepEqual(seen.links, ADDRESSES, `${path}, ${how}: its links`);
};
for (const path of ['hoop/', 'tilt/tables/haunted/']) {
  await ap.goto(base + path);
  await lostPage(path, 'offline');
}
await ap.click('a[href="/hoops/"]');
await ap.waitForFunction(() => !!window.hoops, null, { timeout: 10000 }).catch(() => assert.fail("the lost page's link to Hoops did not open it offline"));
const missing = await ap.evaluate(() => Promise.all(['js/nope.js', 'css/nope.css', 'floor/nope.jpg']
  .map(f => fetch('../' + f).then(r => `${f}: ${r.status} ${r.headers.get('content-type')}`, () => null))));
assert.deepEqual(missing, [null, null, null], 'files the offline copy has not got came back as something');
await away.setOffline(false);
down = false;
// and online, from the server, with GitHub's 404 status
assert.equal((await ap.goto(base + 'hoop/')).status(), 404);
await lostPage('hoop/', 'online');
await ap.click('a[href="/clutch/"]');
await ap.waitForFunction(() => !!window.clutch, null, { timeout: 10000 });
await away.close();

// On a computer each machine's title card says how to play it on the keyboard, in its menu's words (Tilt, in its pause
// card's); on a phone, which has no keys, it doesn't. The menu says the same on a computer; on a phone it says how to
// play by touch instead (Tilt's pause card says both, touch first, on a computer).
for (const [opts, shown] of [[{ viewport: { width: 1280, height: 800 } }, true], [{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, false]]) {
  const kc = await browser.newContext({ ...opts, serviceWorkers: 'block' });
  const kp = await kc.newPage();
  kp.on('pageerror', e => problems.push(e.message));
  for (const [path, name] of Object.entries(OFFLINE).slice(1)) {
    await kp.goto(base + path);
    await kp.waitForFunction(name => !!window[name], name, { timeout: 10000 });
    const [line, seen, menu, menuSeen, touch, touchSeen] = await kp.evaluate(() => {
      const keys = document.querySelector('#title .keys');
      const menu = [...document.querySelectorAll('#menu .how, #pause .keys')].find(p => /keyboard/.test(p.textContent));
      // (the menu's shut, so what its own rules make of each line)
      const touch = document.querySelector('#menu .touch, #pause .ctl:not(.keys)');
      const on = el => !!el && getComputedStyle(el).display !== 'none';
      return [keys?.textContent, !!keys?.getClientRects().length, menu?.textContent, on(menu), touch?.textContent, on(touch)];
    });
    assert.ok(line && line === menu, `${name}'s title card's keyboard line "${line}" isn't its menu's "${menu}"`);
    assert.equal(seen, shown, `${name}'s keyboard line ${shown ? "isn't" : 'is'} shown ${shown ? 'on a computer' : 'on a phone'}`);
    assert.equal(menuSeen, shown, `${name}'s menu's keyboard line ${shown ? "isn't" : 'is'} shown ${shown ? 'on a computer' : 'on a phone'}`);
    assert.ok(touch && !/keyboard/i.test(touch), `${name}'s menu has no line saying how to play by touch`);
    assert.equal(touchSeen, name === 'tilt' || !shown, `${name}'s menu's touch line "${touch}" ${shown ? 'is' : "isn't"} shown ${shown ? 'on a computer' : 'on a phone'}`);
  }
  await kc.close();
}

// On a wide screen, where the deck stands beside the cabinet, every card stands over the cabinet and keeps off what's
// on the deck: the title, the menu, the end of a round (Clutch's win) and Highrise's choice at floor 11.
const wide = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const wp = await wide.newPage();
wp.on('pageerror', e => problems.push(e.message));
for (const [width, height] of [[1280, 800], [1024, 768]]) {
  await wp.setViewportSize({ width, height });
  for (const name of ['clutch', 'topple', 'highrise', 'popgun', 'bonkers', 'hoops']) {
    await wp.goto(base + name + '/');
    await wp.waitForFunction(name => !!window[name], name, { timeout: 10000 });
    await wp.evaluate(() => document.fonts.ready);
    const over = await wp.evaluate(() => {
      const on = [...document.querySelectorAll('#deck *')].map(el => el.getBoundingClientRect()).filter(r => r.width);
      const deck = Math.min(...on.map(r => r.left)), out = [];
      for (const card of document.querySelectorAll('.card')) {
        for (const c of document.querySelectorAll('.card')) c.hidden = c !== card;
        const r = card.getBoundingClientRect();
        if (r.right > deck) out.push(`${card.id} runs ${Math.round(r.right - deck)} px onto the deck`);
        if (r.left < 16 || r.right > innerWidth - 16) out.push(`${card.id} runs off the window`);
      }
      return out;
    });
    assert.deepEqual(over, [], `${name}'s cards at ${width} x ${height}`);
  }
}
await wide.close();

// On a shorter phone each machine's cabinet is narrower, and the control deck under it: everything on the deck stays
// on it, a hint shows whole or not at all (no line cut off below, no word cut off at the side), the points-a-basket
// label on Hoops' deck stays on one line, and nothing on a deck is smaller than 11 px, the smallest size Apple's Human
// Interface Guidelines give for text on iOS (Typography, "Ensuring legibility").
const decks = await browser.newContext({ deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const dp = await decks.newPage();
dp.on('pageerror', e => problems.push(e.message));
for (const [width, height] of [[390, 844], [390, 664], [360, 640], [375, 548], [360, 560]]) {
  await dp.setViewportSize({ width, height });
  for (const name of ['clutch', 'topple', 'highrise', 'popgun', 'bonkers', 'hoops']) {
    await dp.goto(base + name + '/');
    await dp.waitForFunction(name => !!window[name], name, { timeout: 10000 });
    await dp.evaluate(() => document.fonts.ready);
    const off = await dp.evaluate(() => {
      const deck = document.getElementById('deck'), d = deck.getBoundingClientRect(), off = [];
      const name = el => `${el.className || el.tagName.toLowerCase()} "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
      for (const el of deck.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < d.left - 1 || r.right > d.right + 1 || r.top < d.top - 1 || r.bottom > d.bottom + 1)) off.push('off the deck: ' + name(el));
      }
      for (const say of deck.querySelectorAll('.say')) {
        if (say.offsetWidth && say.scrollHeight > say.clientHeight + 1) off.push('cut short: ' + name(say));
        if (say.offsetWidth && say.scrollWidth > say.clientWidth + 1) off.push('cut off at the side: ' + name(say));
      }
      const label = deck.querySelector('.worth span');
      if (label && label.offsetHeight > 1.6 * parseFloat(getComputedStyle(label).fontSize)) off.push('on two lines: ' + name(label));
      for (const el of deck.querySelectorAll('*')) {
        const words = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()), size = parseFloat(getComputedStyle(el).fontSize);
        if (words && el.getClientRects().length && size < 11) off.push(`${size} px: ` + name(el));
      }
      return off;
    });
    assert.deepEqual(off, [], `${name}'s deck at ${width} x ${height}`);
  }
}
await decks.close();

// Added to an iPhone's home screen, a page runs under the notch and the home indicator. Each machine keeps its cabinet
// and control deck above the indicator's strip (the bottom 34 px), and on its side keeps its score and buttons clear
// of the notch and the rounded corners (47 px in from each side).
const notch = await browser.newContext({ deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const np = await notch.newPage();
np.on('pageerror', e => problems.push(e.message));
const npc = await notch.newCDPSession(np);
for (const [width, height, insets] of [[390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], [844, 390, { top: 0, bottom: 21, left: 47, right: 47 }]]) {
  await np.setViewportSize({ width, height });
  await npc.send('Emulation.setSafeAreaInsetsOverride', { insets });
  for (const name of ['rollUp', 'tilt', 'clutch', 'topple', 'highrise', 'popgun', 'bonkers', 'hoops']) {
    await np.goto(base + (name === 'rollUp' ? 'roll-up' : name) + '/');
    await np.waitForFunction(name => !!window[name], name, { timeout: 10000 });
    const at = await np.evaluate(() => {
      const box = sel => document.querySelector(sel)?.getBoundingClientRect();
      const hud = document.querySelector('.hud, .backbox'), kids = [...hud.children].map(k => k.getBoundingClientRect()).filter(r => r.width);
      return { deck: box('#deck')?.bottom, left: Math.min(...kids.map(r => r.left)), right: Math.max(...kids.map(r => r.right)) };
    });
    if (at.deck && width < height) assert.ok(at.deck <= height - insets.bottom, `${name}'s deck comes down to ${Math.round(height - at.deck)} px from the bottom, in the home indicator's strip`);
    assert.ok(at.left >= insets.left && at.right <= width - insets.right, `${name}'s score and buttons run from ${Math.round(at.left)} to ${Math.round(at.right)} px, under the notch or a corner`);
  }
}
await notch.close();

// On a tall phone held upright, Bonkers and Popgun put about three quarters of the height they have to spare above the
// cabinet and a quarter below the deck, so the lawn and the targets sit nearer the thumb, with the deck still clear of
// the home indicator. (A tablet held upright, where the cabinet stops growing before it fills the width, keeps about
// a third above.)
const tall = await browser.newContext({ deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const tp0 = await tall.newPage();
tp0.on('pageerror', e => problems.push(e.message));
const tallCdp = await tall.newCDPSession(tp0);
for (const [width, height, insets, low] of [[390, 844, { top: 47, bottom: 34, left: 0, right: 0 }, true], [390, 844, { top: 0, bottom: 0, left: 0, right: 0 }, true], [430, 932, { top: 59, bottom: 34, left: 0, right: 0 }, true], [768, 1024, { top: 0, bottom: 0, left: 0, right: 0 }, false]]) {
  await tp0.setViewportSize({ width, height });
  await tallCdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  for (const name of ['bonkers', 'popgun']) {
    await tp0.goto(base + name + '/');
    await tp0.waitForFunction(name => !!window[name], name, { timeout: 10000 });
    const { above, below } = await tp0.evaluate(([name, bottom]) => {
      const cab = window[name].draw.cabinet(), hud = document.querySelector('.hud').getBoundingClientRect(), deck = document.getElementById('deck').getBoundingClientRect();
      return { above: cab.top - hud.bottom, below: innerHeight - bottom - deck.bottom };
    }, [name, insets.bottom]);
    const at = `${name} at ${width} x ${height}${insets.top ? ' under a notch' : ''}: ${Math.round(above)} px above the cabinet and ${Math.round(below)} px below the deck`;
    assert.ok(below >= 0, at);
    assert.ok(low ? above > 2 * below : above <= below + 1, at);
  }
}
await tall.close();

// On a phone on its side (an iPhone 14's 844 x 390 under its notch, and an iPhone SE's 667 x 375), each card stands in
// two columns, what it says on the left and its buttons on the right, and every button and link on it is in sight
// without scrolling, clear of the notch and the home indicator: each machine's title card, its menu and the end of a
// round (played, with a new best and a full strip of tickets), Clutch's win, Highrise's choice at floor 11, and Roll
// Up's today's card. Roll Up's note asking for the phone upright keeps clear of the notch, and goes while a card is up.
const side = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const sp = await side.newPage();
sp.on('pageerror', e => problems.push(e.message));
const sideCdp = await side.newCDPSession(sp);
await sp.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  // (bests of 1, so each round's end card has a new best on it; Tilt's top five full)
  for (const k of ['roll-up', 'topple', 'highrise', 'popgun', 'bonkers', 'hoops']) localStorage.setItem('free-play.' + k, JSON.stringify({ best: 1, rounds: 1, games: 1, cups: 1 }));
  localStorage.setItem('free-play.tilt', JSON.stringify({ table: 'classic', scores: [1, 2, 3, 4].map(n => ({ score: n * 1000, date: '2026-10-01' })) }));
});
const SIDEWAYS = [[844, 390, { top: 0, bottom: 21, left: 47, right: 47 }], [667, 375, { top: 0, bottom: 0, left: 0, right: 0 }]];
const sideways = async (name, id) => {
  for (const [width, height, insets] of SIDEWAYS) {
    await sp.setViewportSize({ width, height });
    await sideCdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await sp.waitForTimeout(100);
    const out = await sp.evaluate(([id, insets]) => {
      const card = document.getElementById(id), box = card.querySelector('.card') || card, b = box.getBoundingClientRect(), out = [];
      const words = card.querySelector('.words, h2'), acts = card.querySelector('.acts, .col');
      if (!words || !acts || acts.getBoundingClientRect().left < words.getBoundingClientRect().right - 1) out.push('not in two columns');
      if (box.scrollHeight > box.clientHeight + 1) out.push(`scrolls ${box.scrollHeight - box.clientHeight} px`);
      for (const el of card.querySelectorAll('button, a, summary')) {
        if (!el.getClientRects().length || el.closest('[hidden]')) continue;
        const r = el.getBoundingClientRect(), what = `"${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24)}"`;
        if (r.top < Math.max(0, b.top) - 1 || r.bottom > Math.min(innerHeight - insets.bottom, b.bottom) + 1) out.push(`${what} out of sight, ${Math.round(r.top)} to ${Math.round(r.bottom)} px down`);
        if (r.left < insets.left || r.right > innerWidth - insets.right) out.push(`${what} under the notch`);
      }
      return out;
    }, [id, insets]);
    assert.deepEqual(out, [], `${name}'s ${id} card at ${width} x ${height}`);
  }
  await sp.setViewportSize({ width: 844, height: 390 });
  await sideCdp.send('Emulation.setSafeAreaInsetsOverride', { insets: SIDEWAYS[0][2] });
};
// opens the page; checks its title card and, once it's playing, its menu
const openSideways = async (path, hook, start) => {
  await sp.goto(base + path);
  await sp.waitForFunction(hook => !!window[hook], hook, { timeout: 10000 });
  await sp.evaluate(() => document.fonts.ready);
  await sideways(hook, 'title');
  await sp.click(start);
  await sp.click('#menuBtn');
  await sideways(hook, hook === 'tilt' ? 'pause' : 'menu');
  await sp.click(hook === 'tilt' ? '#resumeBtn' : '#resume');
};
// waits for the end of the round, and the strip of tickets to finish feeding out
const ended = async (id = 'over') => {
  await sp.waitForSelector(`#${id}:not([hidden])`, { timeout: 60000 });
  await sp.waitForFunction(() => { const b = document.querySelector('#over .fp-won b'); return !b || b.dataset.n === b.textContent || ((b.dataset.n = b.textContent), false); }, null, { timeout: 10000, polling: 400 });
};
// Roll Up: today's card, played through, and the note.
await openSideways('roll-up/', 'rollUp', '#daily');
const note = () => sp.evaluate(() => { const n = document.querySelector('.upright'); return n.getClientRects().length ? Math.round(n.getBoundingClientRect().right) : null; });
assert.ok((await note()) <= 844 - 47, `Roll Up's upright note reaches ${await note()} px across, under the notch`);
await sp.click('#menuBtn');
assert.equal(await note(), null, "Roll Up's upright note shows over its menu");
await sp.click('#resume');
await sp.evaluate(() => { rollUp.speed = 8; });
for (let i = 0; i < 9; i++) {
  await sp.waitForFunction(() => rollUp.mode === 'aim', null, { timeout: 15000 });
  await sp.evaluate(v => rollUp.roll(0, v, 0), [305, 332, 280][i % 3]);
}
await ended();
assert.ok(await sp.isVisible('#stars'), "Roll Up's end card isn't today's card");
await sideways('rollUp', 'over');
assert.equal(await note(), null, "Roll Up's upright note shows over its end card");
// Tilt: a game ended from the menu.
await openSideways('tilt/', 'tilt', '#startBtn');
await sp.evaluate(() => { window.tilt.game.score = 954320; });
await sp.click('#menuBtn');
await sp.click('#quitBtn');
await sp.click('#quitBtn');
await ended();
await sideways('tilt', 'over');
// (an eight-digit score keeps to its own third of the card, clear of the top five's 1., on an iPhone 14 and an iPhone
// SE, and on the biggest iPhone, 932 x 430 under its notch)
await sp.evaluate(() => { document.getElementById('final').textContent = (98765430).toLocaleString('en-US'); });
for (const [width, height, insets] of [...SIDEWAYS, [932, 430, { top: 0, bottom: 21, left: 59, right: 59 }]]) {
  await sp.setViewportSize({ width, height });
  await sideCdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  await sp.waitForTimeout(100);
  const past = await sp.evaluate(() => {
    const f = document.getElementById('final'), range = document.createRange();
    range.selectNodeContents(f);
    return Math.round(range.getBoundingClientRect().right - f.closest('.words').getBoundingClientRect().right);
  });
  assert.ok(past <= 0, `at ${width} x ${height}, Tilt's eight-digit score runs ${past} px past its column, into the top five`);
}
await sp.setViewportSize({ width: 844, height: 390 });
await sideCdp.send('Emulation.setSafeAreaInsetsOverride', { insets: SIDEWAYS[0][2] });
// (How to play, opened on the title card, runs down the right, and the title and the tables stay at the top)
await sp.goto(base + 'tilt/');
await sp.waitForFunction(() => !!window.tilt, null, { timeout: 10000 });
await sp.click('#title summary');
const howDown = await sp.evaluate(() => Math.round(document.querySelector('#title .words').getBoundingClientRect().top - document.querySelector('#title .card').getBoundingClientRect().top));
assert.ok(howDown < 40, `with How to play open, Tilt's title starts ${howDown} px down its card, on a phone on its side`);
// Clutch: its win card, as a go that wins puts it up.
await openSideways('clutch/', 'clutch', '#play');
await sp.evaluate(() => { document.getElementById('win').hidden = false; document.getElementById('winT').textContent = 'You got a lucky star!'; });
await sideways('clutch', 'win');
// Topple: a whole cup.
await openSideways('topple/', 'topple', '#play');
await sp.evaluate(() => { topple.speed = 4; });
for (let i = 0; i < 20; i++) {
  await sp.waitForFunction(() => topple.machine.ready, null, { timeout: 10000 });
  await sp.evaluate(x => topple.drop(x), [150, 90, 210][i % 3]);
}
await ended();
await sideways('topple', 'over');
// Highrise: up to floor 11, and the minor prize.
await openSideways('highrise/', 'highrise', '#play');
while (await sp.evaluate(() => highrise.tower.built) < 11) {
  await sp.waitForFunction(() => highrise.ready, null, { timeout: 5000 });
  await sp.evaluate(() => highrise.stopAt(3));
}
await ended('choose');
await sideways('highrise', 'choose');
await sp.click('#takeMinor');
await ended();
await sideways('highrise', 'over');
// Popgun, Bonkers and Hoops: a round each.
await openSideways('popgun/', 'popgun', '#play');
await sp.evaluate(() => { popgun.speed = 4; });
while (!(await sp.evaluate(() => popgun.gallery.over))) {
  await sp.waitForFunction(() => popgun.gallery.ready || popgun.gallery.over);
  await sp.evaluate(() => popgun.fire(280, 420));
}
await ended();
await sideways('popgun', 'over');
await openSideways('bonkers/', 'bonkers', '#play');
await sp.evaluate(() => { bonkers.speed = 6; });
while (!(await sp.evaluate(() => bonkers.burrow.over))) {
  await sp.evaluate(() => { const m = bonkers.burrow.moles.find(m => m.state === 'rising' && m.rise > 0.6); if (m) bonkers.swing([50, 150, 250, 350, 450][m.hole], -40); });
  await sp.waitForTimeout(30);
}
await ended();
await sideways('bonkers', 'over');
await openSideways('hoops/', 'hoops', '#play');
await sp.evaluate(() => { hoops.speed = 6; });
while (!(await sp.evaluate(() => hoops.court.over))) {
  await sp.evaluate(() => { if (hoops.court.pocket()) hoops.shoot(hoops.sweet(), 0); });
  await sp.waitForTimeout(30);
}
await ended();
await sideways('hoops', 'over');
assert.ok(await sp.evaluate(() => document.getElementById('overBest').classList.contains('fp-best')), "Hoops' end card has no new best on it");
await side.close();

// A machine's title card, back after a round. On a first visit it has it all: the sign, what the machine is, how to
// play it, and Play. Once the machine has been played, it's the sign, Play, the prize counter and the best, at the
// foot of the screen and not much more than half as tall, so the machine playing by itself shows above it; what the
// machine is and how to play it fold under How to play, which opens and shuts them with Play still in sight. The page
// knows which it is from its <head> (the mark is on <html> once the page is read, before its own scripts run), so the
// whole card doesn't show first and then shrink. Upright on a phone, on a computer and on a phone on its side (in two columns, every button in sight, clear of
// the notch and the home indicator). Roll Up's line under its buttons, on the small card, says only how today's card
// went; what today's card is goes under How to play.
const PLAYED = { 'roll-up': ['rollUp', 'games'], clutch: ['clutch', 'goes'], topple: ['topple', 'cups'], highrise: ['highrise', 'games'], popgun: ['popgun', 'rounds'], bonkers: ['bonkers', 'rounds'], hoops: ['hoops', 'rounds'] };
const TITLE_SIZES = [[390, 844, { top: 47, bottom: 34, left: 0, right: 0 }, 12], [1280, 800, { top: 0, bottom: 0, left: 0, right: 0 }, 12], [844, 390, { top: 0, bottom: 21, left: 47, right: 47 }, 8], [667, 375, { top: 0, bottom: 0, left: 0, right: 0 }, 8]];
const wholeCard = {};
for (const back of [false, true]) {
  for (const [width, height, insets, foot] of TITLE_SIZES) {
    const phone = width !== 1280;
    const tc = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone, serviceWorkers: 'block' });
    await tc.addInitScript(([back, played]) => {
      if (back && !sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        for (const [m, [, field]] of Object.entries(played)) localStorage.setItem('free-play.' + m, JSON.stringify({ best: 40, [field]: 1, ...(m === 'clutch' && { won: { frog: 1 } }) }));
      }
      // whether the page is marked as played once it's read, before its scripts run
      document.addEventListener('readystatechange', () => { if (document.readyState === 'interactive') window.__markedFirst = document.documentElement.classList.contains('fp-back'); });
    }, [back, PLAYED]);
    const p = await tc.newPage();
    p.on('pageerror', e => problems.push(e.message));
    await (await tc.newCDPSession(p)).send('Emulation.setSafeAreaInsetsOverride', { insets });
    for (const [m, [hook]] of Object.entries(PLAYED)) {
      const at = `${m}'s title card ${back ? 'back after a round' : 'on a first visit'} at ${width} x ${height}`;
      await p.goto(base + m + '/');
      await p.waitForFunction(hook => !!window[hook], hook, { timeout: 10000 });
      await p.evaluate(() => document.fonts.ready);
      const look = () => p.evaluate(([insets, side]) => {
        const card = document.getElementById('title'), b = card.getBoundingClientRect(), out = [];
        const shown = el => !!el && el.getClientRects().length > 0;
        for (const el of card.querySelectorAll('button, a')) {
          if (!shown(el)) continue;
          const r = el.getBoundingClientRect(), what = `"${el.textContent.trim().slice(0, 24)}"`;
          if (r.top < Math.max(0, b.top) - 1 || r.bottom > Math.min(innerHeight - insets.bottom, b.bottom) + 1) out.push(`${what} out of sight, ${Math.round(r.top)} to ${Math.round(r.bottom)} px down`);
          if (r.left < insets.left || r.right > innerWidth - insets.right) out.push(`${what} under the notch`);
        }
        // (one button over another keeps clear of it, a little more than the depth of a big button's edge)
        const buttons = [...card.querySelectorAll('button')].filter(shown).map(el => [el.textContent.trim().slice(0, 24), el.getBoundingClientRect()]);
        for (const [i, [n, r]] of buttons.entries()) for (const [o, s] of buttons.slice(i + 1)) {
          if (r.left < s.right && s.left < r.right && r.top < s.bottom + 8 && s.top < r.bottom + 8) out.push(`"${n}" and "${o}" touch`);
        }
        if (side) {
          const words = card.querySelector('.words').getBoundingClientRect(), acts = card.querySelector('.acts').getBoundingClientRect();
          if (acts.left < words.right - 1) out.push('not in two columns');
        }
        const fold = document.getElementById('fold'), f = fold.getBoundingClientRect();
        return {
          out, top: b.top, bottom: b.bottom, height: b.height, marked: document.documentElement.classList.contains('fp-back'), first: window.__markedFirst,
          rules: [...card.querySelectorAll('.lede, .how:not(.daily-rule, .keys)')].map(shown), fold: shown(fold) && { w: f.width, h: f.height, open: fold.getAttribute('aria-expanded') },
          kept: ['play', 'toPrizes', 'titleBest'].map(id => shown(document.getElementById(id)) && !!document.getElementById(id).textContent.trim()),
        };
      }, [insets, width > height && height <= 500]);
      const l = await look();
      assert.deepEqual(l.out, [], at);
      assert.equal(l.marked, back, `${at}: the page is ${back ? 'not ' : ''}marked as played`);
      assert.equal(l.first, back, `${at}: the page is marked only by its own scripts, once it's drawn`);
      assert.deepEqual(l.kept, [true, true, back], `${at}: Play, the prize counter and the best`);
      if (!back) {
        assert.ok(l.rules.every(Boolean) && !l.fold, `${at}: what the machine is and how to play it aren't all on it`);
        wholeCard[at.replace(' on a first visit', '')] = l.height;
        continue;
      }
      assert.ok(l.rules.every(r => !r), `${at}: what the machine is and how to play it aren't folded away`);
      assert.ok(l.fold && l.fold.open === 'false' && l.fold.w >= 44 && l.fold.h >= 44, `${at}: How to play is ${JSON.stringify(l.fold)}`);
      assert.ok(Math.abs(height - insets.bottom - foot - l.bottom) <= 1, `${at}: it ends ${Math.round(height - l.bottom)} px from the foot of the screen`);
      const whole = wholeCard[at.replace(' back after a round', '')];
      // (Roll Up's, with its second row of buttons, is the tallest: about 0.62 of its whole card on a phone on its side)
      assert.ok(l.height <= 0.65 * whole, `${at}: ${Math.round(l.height)} px tall, against ${Math.round(whole)} px for the whole card`);
      await p.click('#fold');
      const o = await look();
      assert.deepEqual(o.out, [], `${at}, How to play open`);
      assert.ok(o.rules.every(Boolean) && o.fold.open === 'true', `${at}: How to play doesn't open`);
      await p.click('#fold');
      assert.ok((await look()).rules.every(r => !r), `${at}: How to play doesn't shut`);
    }
    await tc.close();
  }
}
// (Roll Up's line under its buttons: what today's card is, on a first visit; on the small card, nothing until today's
// is played, and then how it went, with what it is under How to play)
{
  const rc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const rp = await rc.newPage();
  rp.on('pageerror', e => problems.push(e.message));
  const daily = async () => {
    await rp.goto(base + 'roll-up/');
    await rp.waitForFunction(() => !!window.rollUp, null, { timeout: 10000 });
    return rp.evaluate(() => {
      const shown = el => el.getClientRects().length > 0, line = document.getElementById('dailyHow'), rule = document.querySelector('#title .daily-rule');
      const was = shown(rule);
      document.getElementById('fold').click();
      return { line: shown(line) ? line.textContent : null, rule: [was, shown(rule)] };
    });
  };
  assert.deepEqual(await daily(), { line: 'Nine called shots, the same for everyone today. One go a day, kept where you leave it. Hit the call for double.', rule: [false, false] }, "Roll Up's line about today's card on a first visit");
  await rp.evaluate(() => localStorage.setItem('free-play.roll-up', JSON.stringify({ best: 120, games: 1 })));
  assert.deepEqual(await daily(), { line: null, rule: [false, true] }, "Roll Up's line about today's card, back after a game");
  await rp.evaluate(today => localStorage.setItem('free-play.roll-up', JSON.stringify({ best: 120, games: 1, daily: { key: today, balls: [{ hit: true }, { hit: false }], score: 120, streak: 3 } })), today);
  assert.deepEqual(await daily(), { line: '1 of 9 calls, 3 days in a row. A new card comes at midnight.', rule: [false, true] }, "Roll Up's line about today's card, played today");
  await rc.close();
}

// Everything to tap on the floor and on every card is 44 px each way at least (Apple's Human Interface Guidelines,
// and WCAG 2.2's 2.5.5): the way back to the floor, the links at the foot of each card, the counter's close. The
// 40 px buttons along the top answer a tap a few px round them too (checked 2.5 px out). (The prizes on a shelf, a
// row of 40 px tiles, are left out.)
const taps = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const tp = await taps.newPage();
tp.on('pageerror', e => problems.push(e.message));
const tooSmall = (label, within) => tp.evaluate(([label, within]) => {
  const out = [], hit = (el, x, y) => el.contains(document.elementFromPoint(x, y));
  for (const el of document.querySelector(within).querySelectorAll('a, button, summary')) {
    const r = el.getBoundingClientRect();
    if (!r.width || el.closest('[hidden]') || el.matches('.fp-item')) continue;
    let { width: w, height: h } = r;
    const x = r.left + w / 2, y = r.top + h / 2;
    if (el.closest('.hud') && hit(el, r.left - 2.5, y) && hit(el, r.right + 2.5, y) && hit(el, x, r.top - 2.5) && hit(el, x, r.bottom + 2.5)) { w += 5; h += 5; }
    if (w < 44 || h < 44) out.push(`${label}: "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24)}" ${Math.round(w)} x ${Math.round(h)}`);
  }
  return out;
}, [label, within]);
const small = [];
await tp.goto(base);
await tp.waitForFunction(() => !!window.freePlay, null, { timeout: 10000 });
await tp.evaluate(() => document.fonts.ready);
small.push(...await tooSmall('the floor', 'body'));
await tp.click('#trade');
small.push(...await tooSmall('the counter', '.fp-sheet'));
for (const [path, name] of Object.entries(OFFLINE).slice(1)) {
  await tp.goto(base + path);
  await tp.waitForFunction(name => !!window[name], name, { timeout: 10000 });
  await tp.evaluate(() => document.fonts.ready);
  for (const card of ['title', 'menu', 'over']) {
    await tp.evaluate(card => {
      const cards = { title: ['title'], menu: ['menu', 'pause'], over: ['over', 'win'] };
      for (const [k, ids] of Object.entries(cards)) for (const id of ids) { const el = document.getElementById(id); if (el) el.hidden = k !== card; }
    }, card);
    small.push(...await tooSmall(`${name}'s ${card} card`, 'body'));
  }
}
assert.deepEqual([...new Set(small)], [], 'smaller than 44 px to tap');
await taps.close();

// A page saved as a single file (how a machine is tried out before it joins the floor) says so with data-single on
// <html>: it hides every link back to the floor, which isn't there, and keeps no offline copy. Tilt leaves its address
// alone too, as the copy may be inside someone else's page.
const solo = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const one = await solo.newPage();
one.on('pageerror', e => problems.push(e.message));
await solo.route(/\/(index\.html)?(\?.*)?$/, async route => {
  const res = await route.fetch();
  await route.fulfill({ response: res, body: (await res.text()).replace('<html lang="en">', '<html lang="en" data-single>') });
});
for (const [path, name] of Object.entries(OFFLINE)) {
  if (name === 'tilt') await one.evaluate(() => localStorage.setItem('free-play.tilt', JSON.stringify({ table: 'space' })));
  await one.goto(base + path);
  await one.waitForFunction(name => !!window[name] && 'single' in document.documentElement.dataset, name, { timeout: 10000 });
  await one.waitForTimeout(300);
  const left = await one.evaluate(() => [...document.querySelectorAll('a[href="../"]')]
    .filter(a => { const t = a.closest('.to-floor'); return !t || getComputedStyle(t).display !== 'none'; }).map(a => a.textContent.trim()));
  assert.deepEqual(left, [], `${path || 'the floor'}, as a single file, still has links back to the floor`);
  assert.equal(await one.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, `${path || 'the floor'}, as a single file, keeps an offline copy`);
  if (name === 'tilt') assert.equal(new URL(one.url()).search, '', 'Tilt, as a single file, changed its address');
}
await solo.close();

// The offline copy, from a server that answers the way GitHub Pages does: a browser may keep each file for ten
// minutes (cache-control: max-age=600), and ask again by its ETag. With `next` it serves a new release: sw.js under a
// new cache name, and a change to Topple's machine.js. With `stall` it's a weak connection (a train, a captive wifi):
// it takes each request and holds on to it, until `stall` goes and the floor has changed by then.
const gh = { next: false, stall: false, held: [], later: false };
const pages = createServer(async (req, res) => {
  if (gh.stall) { gh.held.push([req, res]); return; }
  await serveLikePages(req, res);
}).listen(0);
async function serveLikePages(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404, { 'content-type': 'text/html' }); res.end(await readFile(join(root, '404.html'))); return; }
  if (gh.next && path === '/sw.js') body = Buffer.from(String(body).replace(/free-play-v\d+/, '$&-next'));
  if (gh.next && path === '/topple/js/machine.js') body = Buffer.concat([body, Buffer.from('\n// the next release\n')]);
  if (gh.later && path === '/index.html') body = Buffer.concat([body, Buffer.from('\n<!-- later -->\n')]);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  const head = { etag, 'cache-control': 'max-age=600', 'content-type': TYPES[extname(path)] || 'text/html' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
  res.writeHead(200, head);
  res.end(body);
}
const ghBase = `http://localhost:${pages.address().port}/`;
const ghCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const gp = await ghCtx.newPage();
gp.on('pageerror', e => problems.push(e.message));
await gp.goto(ghBase);
await gp.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
const copy = await gp.evaluate(async () => (await caches.keys()).join());

// A new release goes up a minute later, and the next check for one finds it: the new offline copy is all new, though
// the browser still has its own copies of the old files.
gh.next = true;
await gp.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
await until(async () => (await gp.evaluate(() => caches.keys())).join() === copy + '-next', 20000, 'the new release made no new offline copy');
const kept = await gp.evaluate(async name => (await (await caches.open(name)).match('topple/js/machine.js'))?.text(), copy + '-next');
assert.ok(kept?.endsWith('// the next release\n'), "the new release's offline copy kept an old file");

// On a weak connection the floor and a machine still open, from the offline copy, after a few seconds' wait for the
// network: the page and every file it loads (were any of them left waiting on the network, it wouldn't open).
gh.stall = true;
const opened = [];
for (const [path, name, called] of [['', 'freePlay', 'the floor'], ['hoops/', 'hoops', 'Hoops']]) {
  const t0 = Date.now();
  await gp.goto(ghBase + path, { timeout: 20000 });
  await gp.waitForFunction(name => !!window[name], name, { timeout: 5000 });
  const took = Date.now() - t0;
  assert.ok(took < 8000, `${called} took ${took} ms to open on a weak connection`);
  opened.push(`${called} opened in ${(took / 1000).toFixed(1)} s`);
}
// A page the copy hasn't got waits on for the network, however long it takes.
const waiting = gp.goto(ghBase + 'not-kept.html', { timeout: 30000 });
await new Promise(r => setTimeout(r, 6000));
assert.equal(new URL(gp.url()).pathname, '/hoops/', 'a page the offline copy has not got gave up on the network');
// The network answers at last, with a newer floor. It stays out of the offline copy: the floor opened from the copy,
// with its files, and a newer floor kept beside them would mix two releases the next time it opens from there.
gh.later = true;
gh.stall = false;
for (const [req, res] of gh.held.splice(0)) serveLikePages(req, res);
assert.equal((await waiting).status(), 404);
await new Promise(r => setTimeout(r, 2000));
const floorKept = () => gp.evaluate(async name => (await (await caches.open(name)).match('./'))?.text(), copy + '-next');
assert.ok(!(await floorKept())?.includes('<!-- later -->'), "the network's late answer for a page that opened from the copy went into the copy");
// Opened with the network answering, the newer floor does go in.
await gp.goto(ghBase);
await until(async () => (await floorKept())?.includes('<!-- later -->'), 10000, 'the floor from the network did not go into the offline copy');
await ghCtx.close();
pages.close();

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log(`all good (on a weak connection ${opened.join(' and ')})`);
