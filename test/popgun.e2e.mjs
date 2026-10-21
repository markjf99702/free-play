// Plays Popgun, on the Free Play floor, in Chromium through the real page:  node test/popgun.e2e.mjs  (needs Playwright)
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

await page.goto(base + 'popgun/');
await page.evaluate(() => document.fonts.ready);
const corks = () => page.evaluate(() => popgun.gallery.corks);
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
const ready = () => page.waitForFunction(() => popgun.gallery.ready, null, { timeout: 5000 });
// Where on the page to tap to meet a standing target of a kind (any, if none given), leading it as it moves.
const aimAt = kind => page.evaluate(kind => {
  const g = popgun.gallery;
  for (const row of g.rows) for (const t of row.targets) {
    if (t.hit || (kind && t.kind !== kind)) continue;
    const x = t.x + row.dir * row.now * 0.32;
    if (x > 90 && x < 470) return popgun.draw.at(x, row.rail - 26);
  }
  return null;
}, kind);

// The title card, and the targets already running behind it.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
await page.click('#play');
assert.equal(await corks(), 20);
assert.equal(await page.locator('#tray i').count(), 20, 'twenty corks on the counter');

// A tap ahead of a duck knocks it down.
await ready();
let p = await aimAt('duck');
await page.mouse.click(p.x, p.y);
assert.equal(await corks(), 19);
await page.waitForFunction(() => popgun.gallery.hits === 1, null, { timeout: 2000 });
assert.equal(await page.textContent('#score'), '10');

// A tap on the counter doesn't fire, and the gun has to reload between corks.
const counter = await page.evaluate(() => popgun.draw.at(150, 600));
await ready();
await page.mouse.click(counter.x, counter.y);
assert.equal(await corks(), 19, 'the counter is not a target');
await page.evaluate(() => { popgun.fire(200, 200); popgun.fire(200, 200); });
assert.equal(await corks(), 18, 'two shots straight after each other fire one cork');

// With a mouse the sights follow it; the keyboard moves them and fires.
p = await page.evaluate(() => popgun.draw.at(280, 250));
await page.mouse.move(p.x, p.y);
assert.ok(await page.evaluate(() => document.getElementById('stage').classList.contains('aiming')), 'the pointer becomes the sights');
await ready();
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(150); await page.keyboard.up('ArrowUp');
await page.keyboard.press(' ');
assert.equal(await corks(), 17);

// The menu stops the conveyors.
await page.keyboard.press('Escape');
assert.ok(await page.isVisible('#menu'));
const xs = await page.evaluate(() => popgun.gallery.rows[0].targets[0].x);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => popgun.gallery.rows[0].targets[0].x), xs, 'the targets wait while the menu is open');
await page.click('#sound');
assert.equal(await page.evaluate(() => popgun.saved.sound), false);
await page.click('#resume');

// The rest of the corks, and the round's over: a ticket for every 20 points.
const t0 = await tickets();
await page.evaluate(() => { popgun.speed = 3; });
while (!(await page.evaluate(() => popgun.gallery.over))) {
  await page.waitForFunction(() => popgun.gallery.ready || popgun.gallery.over);
  const q = await page.evaluate(() => {
    const g = popgun.gallery;
    for (const row of g.rows) for (const t of row.targets) {
      if (t.hit) continue;
      const x = t.x + row.dir * row.now * 0.32;
      if (x > 60 && x < 500) return { x, y: row.rail - 22 };
    }
    return { x: 280, y: 250 };
  });
  await page.evaluate(q => popgun.fire(q.x, q.y), q);
}
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
const score = await page.evaluate(() => popgun.gallery.score);
assert.ok(score > 100, `a steady hand scores (${score})`);
assert.equal(await page.textContent('#overT'), `${score.toLocaleString('en-US')} points`);
assert.equal(await tickets(), t0 + Math.floor(score / 20));
assert.equal(await page.evaluate(() => popgun.saved.best), score);
await page.click('#again');
assert.equal(await corks(), 20, 'another round, another twenty corks');
assert.equal(await page.textContent('#score'), '0');

// A wide screen: the booth in the middle, the corks beside it, nothing sideways.
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(100);
const wide = await page.evaluate(() => ({ cab: popgun.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(wide.deck.left >= wide.cab.left + wide.cab.width, 'the corks sit beside the booth');
assert.ok(wide.sw <= 1280 && wide.deck.right <= 1280);
await page.setViewportSize({ width: 360, height: 640 });
await page.waitForTimeout(100);
const small = await page.evaluate(() => ({ cab: popgun.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(small.deck.top >= small.cab.bottom - 4 && small.deck.bottom <= 640, 'on a small phone the corks sit under the booth, on screen');
assert.ok(small.sw <= 360);
await page.setViewportSize({ width: 390, height: 844 });

// Back on the floor, Popgun's cabinet has the best round.
await page.goto(base);
assert.equal(await page.textContent('#popgunStat'), `Best: ${score.toLocaleString('en-US')}.`);

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log(`all good (a round scored ${score})`);
