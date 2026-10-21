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
assert.equal(await page.locator('.cab').count(), 6);
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
const OFFLINE = { '': 'freePlay', 'roll-up/': 'rollUp', 'tilt/': 'tilt', 'clutch/': 'clutch', 'topple/': 'topple', 'highrise/': 'highrise', 'popgun/': 'popgun' };
for (const [path, name] of Object.entries(OFFLINE)) {
  await page.goto(base + path);
  assert.ok(await page.evaluate(name => !!window[name], name), `${path || 'the floor'} did not open offline`);
}
await ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
