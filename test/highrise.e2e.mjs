// Plays Highrise, on the Free Play floor, in Chromium through the real page:  node test/highrise.e2e.mjs  (needs Playwright)
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
const TYPES = { '.jpg': 'image/jpeg', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
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
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });

await page.goto(base + 'highrise/');
await page.evaluate(() => document.fonts.ready);
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
const ready = () => page.waitForFunction(() => highrise.ready, null, { timeout: 5000 });
// Which cards are up.
const cards = () => page.evaluate(() => ['title', 'over', 'menu', 'choose'].filter(id => document.getElementById(id)?.hidden === false));
// Builds floors with the rows set down where they're told (a straight tower at column 3), up to a floor.
async function build(to, at = 3) {
  while (await page.evaluate(() => highrise.tower.built) < to) { await ready(); await page.evaluate(at => highrise.stopAt(at), at); }
}

// The title card, with the row already sliding along the ground floor behind it.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
const box = await page.locator('#stop').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.mouse.up();
assert.equal(await page.evaluate(() => highrise.tower.built), 0, 'the stop button does nothing behind the title card');
await page.click('#play');

// The row moves, and the stop button sets it down where it is.
await ready();
const seen = new Set();
for (let i = 0; i < 8; i++) { seen.add(await page.evaluate(() => highrise.shown)); await page.waitForTimeout(70); }
assert.ok(seen.size > 2, 'the row slides along');
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.mouse.up();
const first = await page.evaluate(() => highrise.tower.rows[0]);
assert.equal(first.length, 3, 'the ground floor lands whole, wherever it stops');
assert.equal(await page.textContent('#floorNo'), '2');

// Space sets the next one down. It lands where the row is, so wait until the row is over the ground floor by two
// windows: one more step along (153 ms on floor 2) can't then take it off the edge, however slow the machine.
await page.waitForFunction(() => {
  const { tower, shown } = highrise;
  if (!highrise.ready) return false;
  let over = 0;
  for (let c = shown; c < shown + tower.width; c++) if (tower.rows[0].includes(c)) over++;
  return over >= Math.min(2, tower.width);
}, null, { timeout: 5000 });
await page.keyboard.press(' ');
assert.equal(await page.evaluate(() => highrise.tower.built), 2);

// The menu stops the row where it is.
await ready();
await page.keyboard.press('Escape');
const where = await page.textContent('#floorNo');
const shot = await page.evaluate(() => JSON.stringify(highrise.tower.rows));
await page.waitForTimeout(400);
await page.evaluate(() => highrise.stop());
assert.equal(await page.evaluate(() => JSON.stringify(highrise.tower.rows)), shot, 'nothing is set down while the menu is open');
await page.click('#resume');
assert.equal(where, '3');

// Leaving the page mid-game opens the menu, so the row waits there for the player to come back.
await ready();
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-game did not open the menu');
const away = await page.evaluate(() => highrise.shown);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => highrise.shown), away, 'the row slides on behind the menu');
await hide(false);
await page.click('#resume');

// Floor 11, taking the minor prize: 11 tickets and 25 more.
const t0 = await tickets();
await page.evaluate(() => highrise.start());
await build(11);
await page.waitForSelector('#choose:not([hidden])');
// Leaving the page there leaves the choice as it is: no menu over it.
await hide(true);
assert.ok(await page.isVisible('#choose') && await page.isHidden('#menu'), 'leaving the page covered the floor-11 choice');
await hide(false);
await page.click('#takeMinor');
assert.ok(await page.isVisible('#over'));
assert.equal(await tickets(), t0 + 36);
assert.match(await page.textContent('#overT'), /minor prize/);

// Floor 11 again, going on, and a row that misses on floor 12: the 25 goes, the floors still pay.
const t1 = await tickets();
await page.click('#again');
await build(11);
await page.waitForSelector('#choose:not([hidden])');
await page.click('#keepGoing');
await ready();
await page.evaluate(() => highrise.stopAt(0));
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.equal(await tickets(), t1 + 11);
assert.match(await page.textContent('#overT'), /Eleven floors\. So close\./);

// Highrise open in a second tab too, from before the next game.
const other = await ctx.newPage();
other.on('pageerror', e => problems.push('second tab: ' + e.message));
await other.goto(base + 'highrise/');
await other.waitForFunction(() => window.highrise);
const gamesBefore = await page.evaluate(() => highrise.saved.games);

// All fifteen: the trophy and 200 more.
const t2 = await tickets();
await page.click('#again');
await build(11);
await page.waitForSelector('#choose:not([hidden])');
await page.click('#keepGoing');
await build(15);
await page.waitForSelector('#over:not([hidden])', { timeout: 8000 });
assert.equal(await page.textContent('#overT'), 'Topped out!');
assert.equal(await tickets(), t2 + 215);
const shelf = await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).prizes);
assert.equal(shelf['trophy-highrise'], 1, 'the trophy is on the shelf');
assert.deepEqual(await page.evaluate(() => [highrise.saved.best, highrise.saved.tops]), [15, 1]);

// The second tab plays a short game after that: it adds to the save as it is now, not as it was when it opened.
await other.evaluate(() => highrise.start());
for (let i = 0; i < 2; i++) { await other.waitForFunction(() => highrise.ready, null, { timeout: 5000 }); await other.evaluate(() => highrise.stopAt(3)); }
await other.waitForFunction(() => highrise.ready, null, { timeout: 5000 });
await other.evaluate(() => highrise.stopAt(0));
await other.waitForSelector('#over:not([hidden])', { timeout: 5000 });
const kept = await other.evaluate(() => JSON.parse(localStorage.getItem('free-play.highrise')));
assert.deepEqual([kept.best, kept.tops, kept.games], [15, 1, gamesBefore + 2], 'the top-out in the other tab is kept, and both games count');
assert.equal(await other.textContent('#overBest'), 'Highest: floor 15');
await other.close();

// The menu opened just as floor 11 lands, before the choice comes up, by Escape or by leaving the page, holds the
// choice back: only the menu shows, and after Keep playing the choice comes up by itself, with its buttons working.
for (const leave of ['Escape', 'hide']) {
  await page.click('#again');
  await build(10);
  await ready();
  await page.evaluate(() => highrise.stopAt(3));
  if (leave === 'Escape') await page.keyboard.press('Escape'); else await hide(true);
  await page.waitForTimeout(800);
  assert.deepEqual(await cards(), ['menu'], `after ${leave} on floor 11, only the menu shows`);
  if (leave === 'hide') await hide(false);
  await page.click('#resume');
  await page.waitForSelector('#choose:not([hidden])', { timeout: 3000 });
  assert.deepEqual(await cards(), ['choose'], `after ${leave} and Keep playing, the choice shows by itself`);
  const t = await tickets();
  await page.click('#takeMinor');
  assert.deepEqual(await cards(), ['over']);
  assert.equal(await tickets(), t + 36, 'Take the 25 pays');
}

// A wide screen: the tower in the middle, its controls standing beside it, nothing sideways.
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(100);
const wide = await page.evaluate(() => ({ cab: highrise.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(wide.deck.left >= wide.cab.left + wide.cab.width, 'the controls stand beside the cabinet');
assert.ok(wide.sw <= 1280 && wide.deck.right <= 1280);
await page.setViewportSize({ width: 360, height: 640 });
await page.waitForTimeout(100);
const small = await page.evaluate(() => ({ cab: highrise.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(small.deck.top >= small.cab.bottom - 4 && small.deck.bottom <= 640, 'on a small phone the controls sit under the cabinet, on screen');
assert.ok(small.sw <= 360);
await page.setViewportSize({ width: 390, height: 844 });

// Back on the floor, Highrise's cabinet has the highest floor and the top.
await page.goto(base);
assert.equal(await page.textContent('#highriseStat'), 'Highest: floor 15. Topped out once.');
assert.match(await page.textContent('#shelf'), /🏆/);

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log('all good');
