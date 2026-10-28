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
import { SHELF } from '../shared/prizes.js';

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

// The floor: the sign, a cabinet for each machine, an empty pocket and an empty shelf.
assert.equal(await page.textContent('#tix'), '0');
assert.equal(await page.locator('.cab').count(), 8);
assert.match(await page.textContent('#rollUpStat'), /Today's card is ready/);
assert.match(await page.textContent('#shelf'), /Nothing on your shelf/);
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
assert.deepEqual(hops.map(h => h[0]), [...MACHINES, 'Prize counter'], 'the row of machines under the pocket');
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

// A prize the pocket can't run to says how far short it is, to a screen reader too (it's only dimmed to the eye).
const pocket = async w => { await page.evaluate(w => localStorage.setItem('free-play.wallet', JSON.stringify(w)), w); await page.reload(); };
await pocket({ tickets: 7, prizes: {} });
await page.click('#trade');
assert.deepEqual(await page.locator('.fp-prize').evaluateAll(els => els.slice(0, 2).map(e => e.getAttribute('aria-label'))), ['Lollipop, 5 tickets', 'Spider ring, 10 tickets, 3 more than you have']);
await page.click('.fp-x');

// One ticket is one ticket: one short of a lollipop, and one left in the pocket.
await pocket({ tickets: 4, prizes: {} });
await page.click('#trade');
await page.click('.fp-prize >> nth=0');
assert.equal(await page.textContent('.fp-toast'), 'You need 1 more ticket for that.');
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
await page.focus('.fp-prize >> nth=15');
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(() => document.activeElement.className), 'fp-undo', 'Tab from the last prize reaches Undo');
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
assert.equal(await stored(), was, 'undone from the keyboard too');
assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'lollipop', 'and the keyboard goes back to the prize');
await page.click('.fp-x');
assert.equal(await page.textContent('#tix'), '120');

// The shelf, on the floor and in the counter: every row of prizes stands on a plank of its own, and an empty shelf has
// none running through what it says. (Read off the pixels down the shelf's left edge, clear of the prizes.)
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
    const feet = [...new Set([...shelf.children].filter(e => !e.matches('.empty, .fp-empty')).map(e => Math.round(e.getBoundingClientRect().bottom - box.top)))];
    return { feet, bands: bands.map(([a, b]) => [a / k, (b + 1) / k]) };
  }, [sel, png]);
}
for (const [kinds, rows] of [[0, 0], [3, 1], [10, 2], [SHELF.length, 4]]) {
  await pocket({ tickets: 50, prizes: Object.fromEntries(SHELF.slice(0, kinds).map((p, i) => [p.id, (i % 3) + 1])) });
  for (const [where, sel] of [['the floor', '#shelf'], ['the counter', '.fp-shelf']]) {
    if (sel === '.fp-shelf') await page.click('#trade');
    const { feet, bands } = await planks(sel);
    assert.ok(kinds ? feet.length >= rows : !feet.length, `${where}: ${kinds} kinds of prize on a phone take ${feet.length} rows`);
    assert.equal(bands.length, feet.length, `${where}, ${feet.length} rows: ${bands.length} planks`);
    feet.forEach((foot, i) => assert.ok(bands[i][0] > foot - 12 && bands[i][1] < foot + 3, `${where}: row ${i + 1}, at ${foot} px, isn't on its plank (${bands[i]})`));
    if (sel === '.fp-shelf') await page.click('.fp-x');
  }
}

// A tap on a prize on the shelf says what it is, on the floor and in the counter.
await pocket({ tickets: 50, prizes: { 'plush-frog': 3, 'plush-alien': 1 } });
assert.deepEqual(await page.locator('#shelf button').evaluateAll(els => els.map(e => e.getAttribute('aria-label'))), ['Plush frog, 3', 'Plush alien']);
await page.tap('#shelf button >> nth=0');
assert.equal(await page.textContent('.fp-toast'), 'Plush frog. You have 3.');
await page.tap('#shelf button >> nth=1');
assert.equal(await page.textContent('.fp-toast'), 'Plush alien.');
await page.click('#trade');
await page.tap('.fp-shelf button >> nth=1');
assert.equal(await page.textContent('.fp-toast'), 'Plush alien.');
assert.ok(await page.isVisible('.fp-sheet .fp-toast'), 'in the counter, the name comes up at its foot');
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
const DAILY = ['free-play.roll-up', 'free-play.topple', 'free-play.clutch'];
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
assert.match(await page.textContent('#dailyHow'), / Play it to make it 4 days in a row\.$/);
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

// Every file the pages loaded is kept for offline.
const shell = [...(await readFile(join(root, 'sw.js'), 'utf8')).match(/SHELL = \[([^\]]*)\]/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
assert.deepEqual([...loaded].filter(f => f !== 'sw.js' && !shell.includes(f)), [], 'files the pages load but sw.js does not keep');

// Chrome would offer to install it.
const cdp = await ctx.newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
assert.deepEqual(installabilityErrors, [], 'Chrome says it can’t be installed');
const { errors } = await cdp.send('Page.getAppManifest');
assert.deepEqual(errors, []);

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
// machine and Tilt's Haunted House open from the copy, with all their fonts and pictures.
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
for (const [path, name] of [...Object.entries(OFFLINE), ['tilt/?table=haunted', 'tilt']]) {
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
// The network answers at last, with a newer floor: it goes into the offline copy.
gh.later = true;
gh.stall = false;
for (const [req, res] of gh.held.splice(0)) serveLikePages(req, res);
assert.equal((await waiting).status(), 404);
await until(async () => (await gp.evaluate(async name => (await (await caches.open(name)).match('./'))?.text(), copy + '-next'))?.includes('<!-- later -->'), 10000, "the network's late answer did not go into the offline copy");
await ghCtx.close();
pages.close();

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log(`all good (on a weak connection ${opened.join(' and ')})`);
