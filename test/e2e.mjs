// Walks round the Free Play floor in Chromium through the real pages:  node test/e2e.mjs  (needs Playwright)
// In from the floor to each machine and back, with the tickets each one pays adding up in the one wallet, the prize
// counter from the floor, every file the pages load kept for offline, Chrome offering to install it, and all of it
// opening again offline. (Each machine's own browser test, test/<machine>.e2e.mjs, plays it in depth.)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { SHELF } from '../shared/prizes.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
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

await page.goto(base);
await page.evaluate(() => document.fonts.ready);

// The floor: the sign, a cabinet for each machine, an empty pocket and an empty shelf.
assert.equal(await page.textContent('#tix'), '0');
assert.equal(await page.locator('.cab').count(), 8);
assert.match(await page.textContent('#rollUpStat'), /Today's card is ready/);
assert.match(await page.textContent('#shelf'), /Nothing on your shelf/);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the floor scrolls sideways on a phone');

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
assert.match(await page.textContent('#rollUpStat'), new RegExp(`Best ${rolled.toLocaleString('en-US')}`));

// Tilt: a game ended from its menu, and its tickets on top.
const before = await tickets();
await page.click('.cab.tilt');
await page.waitForURL(base + 'tilt/');
assert.equal(await page.textContent('#tixT'), String(before), "Tilt's title card shows the arcade's tickets");
await page.click('#startBtn');
await page.evaluate(() => { window.tilt.game.score = 154320; });
await page.click('#menuBtn');
await page.click('#quitBtn');
await page.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 5000 });
assert.equal(await tickets(), before + 15, 'Classic pays a ticket for every 10,000 points');
await page.waitForFunction(() => document.querySelector('#over .fp-won b').textContent === '15', null, { timeout: 8000 });
await page.click('#over a.ghost');
await page.waitForURL(base);
assert.match(await page.textContent('#tiltStat'), /154,320, on Classic/);

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

// Topple: in from the floor, a few coins and the tickets they push over, and back.
const beforeTopple = await tickets();
await page.click('.cab.topple');
await page.waitForURL(base + 'topple/');
await page.click('#play');
await page.evaluate(() => { topple.speed = 4; });
for (let i = 0; i < 6; i++) { await page.waitForFunction(() => topple.machine.ready); await page.evaluate(() => topple.drop(150)); }
await page.waitForFunction(() => topple.cup.won > 0, null, { timeout: 20000 });
// (read together: the coins keep going over while the test looks)
const [paid, won] = await page.evaluate(() => [JSON.parse(localStorage.getItem('free-play.wallet')).tickets, topple.cup.won]);
assert.equal(paid, beforeTopple + won, 'Topple pays a ticket for every coin over the edge');
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
assert.equal(await tickets(), beforePopgun + Math.floor(shot / 20), 'Popgun pays a ticket for every 20 points');
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

// A double tap at the counter buys one, not two; two taps a second apart buy two.
const pocket = async w => { await page.evaluate(w => localStorage.setItem('free-play.wallet', JSON.stringify(w)), w); await page.reload(); };
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

// Saves with an odd value in them still open: a best of null (what a NaN is saved as), and today's card saved
// without its balls. (The saves there were are put back after.)
const ODD = ['free-play.popgun', 'free-play.bonkers', 'free-play.hoops', 'free-play.roll-up'];
const saves = await page.evaluate(keys => keys.map(k => localStorage.getItem(k)), ODD);
const day = new Date(), today = [day.getFullYear(), day.getMonth() + 1, day.getDate()].map(n => String(n).padStart(2, '0')).join('-');
await page.evaluate(([keys, today]) => {
  for (const k of keys) localStorage.setItem(k, JSON.stringify({ best: null, rounds: 3 }));
  localStorage.setItem('free-play.roll-up', JSON.stringify({ best: 120, games: 4, daily: { key: today, score: 5 } }));
}, [ODD, today]);
for (const [path, name] of [['popgun/', 'popgun'], ['bonkers/', 'bonkers'], ['hoops/', 'hoops']]) {
  await page.goto(base + path);
  await page.waitForFunction(name => !!window[name], name, { timeout: 5000 });
  assert.equal(await page.textContent('#titleBest'), 'Best: 0.', `${name} opens with a best of null`);
}
await page.goto(base + 'roll-up/');
await page.waitForFunction(() => !!window.rollUp, null, { timeout: 5000 });
assert.equal(await page.textContent('#daily'), "Today's card", "a card with no balls isn't today's played card");
await page.goto(base);
await page.waitForFunction(() => !!window.freePlay, null, { timeout: 5000 });
assert.equal(await page.textContent('#rollUpStat'), "Today's card is ready: nine called shots. Best 120.");
await page.evaluate(([keys, saves]) => keys.forEach((k, i) => (saves[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saves[i]))), [ODD, saves]);

// Every file the pages loaded is kept for offline.
const shell = [...(await readFile(join(root, 'sw.js'), 'utf8')).match(/SHELL = \[([^\]]*)\]/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
assert.deepEqual([...loaded].filter(f => f !== 'sw.js' && !shell.includes(f)), [], 'files the pages load but sw.js does not keep');

// Chrome would offer to install it.
const cdp = await ctx.newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
assert.deepEqual(installabilityErrors, [], 'Chrome says it can’t be installed');
const { errors } = await cdp.send('Page.getAppManifest');
assert.deepEqual(errors, []);

// The floor on a wide screen: the cabinets side by side, nothing sideways.
await page.setViewportSize({ width: 1280, height: 860 });
const tops = await page.locator('.cab').evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
assert.ok(Math.abs(tops[0] - tops[1]) < 8 && Math.abs(tops[2] - tops[3]) < 8 && tops[2] > tops[0] + 100, 'the cabinets stand two by two on a wide screen'); // (a hovered one lifts a little)
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
await page.setViewportSize({ width: 390, height: 844 });

// Offline: the floor and every machine open again.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
const OFFLINE = { '': 'freePlay', 'roll-up/': 'rollUp', 'tilt/': 'tilt', 'clutch/': 'clutch', 'topple/': 'topple', 'highrise/': 'highrise', 'popgun/': 'popgun', 'bonkers/': 'bonkers', 'hoops/': 'hoops' };
for (const [path, name] of Object.entries(OFFLINE)) {
  await page.goto(base + path);
  assert.ok(await page.evaluate(name => !!window[name], name), `${path || 'the floor'} did not open offline`);
}
await ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
