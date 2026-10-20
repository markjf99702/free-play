// Plays Topple, on the Free Play floor, in Chromium through the real page:  node test/topple.e2e.mjs  (needs Playwright)
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

await page.goto(base + 'topple/');
await page.evaluate(() => document.fonts.ready);
const left = () => page.evaluate(() => topple.cup?.left ?? 0);
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
const reloaded = () => page.waitForFunction(() => topple.machine.ready);

// The title card, then a cup of twenty.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
assert.equal(await page.textContent('#play'), 'Play');
await page.click('#play');
assert.ok(await page.isHidden('#title'));
assert.equal(await left(), 20);
assert.equal(await page.textContent('#left'), '20');

// Touching the glass moves the chute to the finger; letting go drops a coin there.
const spot = await page.evaluate(() => [topple.draw.at(60, 148, 6), topple.draw.at(230, 148, 6)]);
await page.mouse.move(spot[0].x, spot[0].y + 120);
await page.mouse.down();
await page.mouse.move(spot[1].x, spot[1].y + 140, { steps: 5 });
assert.equal(await left(), 20, 'nothing drops while the finger is down');
await page.mouse.up();
assert.equal(await left(), 19);
await page.waitForTimeout(400);
const landed = await page.evaluate(() => topple.machine.pieces.filter(p => p.layer === 'shelf').map(p => p.position.x));
assert.ok(landed.some(x => Math.abs(x - 230) < 22), 'the coin landed on the shelf under where the finger let go');

// The drop button drops one where the chute is; the chute has to reload between coins.
await reloaded();
await page.evaluate(() => { document.getElementById('drop').click(); document.getElementById('drop').click(); });
assert.equal(await left(), 18, 'two presses straight after each other drop one coin');

// The keyboard: arrows move the chute, Space drops.
await reloaded();
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
await page.keyboard.press(' ');
assert.equal(await left(), 17);

// A prize nudged over the edge goes on the shelf, and the attendant puts another one on.
const prize = await page.evaluate(() => { const p = topple.machine.pieces.find(p => p.kind === 'prize'); window.Matter.Body.setPosition(p, { x: 150, y: 252 }); return p.prize; });
await page.waitForFunction(() => !topple.machine.pieces.some(p => p.kind === 'prize'));
assert.match(await page.textContent('.fp-toast'), /^You won a/);
const shelf = await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).prizes);
assert.equal(shelf['trinket-' + prize], 1, 'the prize is on the arcade\'s shelf');
await page.waitForFunction(() => topple.machine.pieces.some(p => p.kind === 'prize'), null, { timeout: 5000 });

// Every coin over the front edge is a ticket, paid as it goes over.
await page.evaluate(() => { topple.speed = 4; });
while (await left() > 3) { await reloaded(); await page.evaluate(() => topple.drop(40 + Math.random() * 220)); }
const mid = await page.evaluate(() => topple.cup.won);
assert.ok(mid > 0, 'some coins have gone over the edge');
assert.equal(await page.textContent('#won'), String(mid), 'the scoreboard shows this cup\'s tickets');

// The cup keeps between visits: the page comes back with the same coins left, and the deck as it was.
await page.evaluate(() => { topple.speed = 1; });
const pieces = await page.evaluate(() => topple.machine.pieces.length);
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.textContent('#play'), 'Carry on');
assert.equal(await left(), 3);
assert.ok(Math.abs(await page.evaluate(() => topple.machine.pieces.length) - pieces) <= 4, 'the coins on the deck came back');
await page.click('#play');

// The menu stops the shelf where it is.
await page.keyboard.press('Escape');
assert.ok(await page.isVisible('#menu'));
const lip = await page.evaluate(() => topple.machine.lip);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => topple.machine.lip), lip, 'the shelf waits while the menu is open');
await page.click('#sound');
assert.equal(await page.evaluate(() => topple.saved.sound), false);
await page.click('#resume');

// The last coins, and the cup's done once the pile goes quiet: the card says what it paid.
await page.evaluate(() => { topple.speed = 4; });
while (await left() > 0) { await reloaded(); await page.evaluate(() => topple.drop(150)); }
assert.ok(await page.isDisabled('#drop'), 'an empty cup has nothing to drop');
await page.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 20000 });
const won = Number((await page.textContent('#overT')).match(/(\d+) tickets?$/)[1]);
assert.ok(won >= mid);
assert.ok(await tickets() >= won, 'the tickets are in the wallet');
assert.equal(await page.evaluate(() => topple.saved.cups), 1);
await page.click('#again');
assert.equal(await left(), 20, 'another cup');

// A wide screen: the cabinet in the middle, its controls standing beside it, nothing sideways.
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(100);
const wide = await page.evaluate(() => ({ cab: topple.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(wide.deck.left >= wide.cab.left + wide.cab.width, 'the controls stand beside the cabinet');
assert.ok(wide.sw <= 1280 && wide.deck.right <= 1280);
await page.setViewportSize({ width: 360, height: 640 });
await page.waitForTimeout(100);
const small = await page.evaluate(() => ({ cab: topple.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(small.deck.top >= small.cab.bottom - 4 && small.deck.bottom <= 640, 'on a small phone the controls sit under the cabinet, on screen');
assert.ok(small.sw <= 360);
await page.setViewportSize({ width: 390, height: 844 });

// Back on the floor, Topple's cabinet has the best cup and the prize.
await page.goto(base);
assert.match(await page.textContent('#toppleStat'), new RegExp(`^Best cup: \\d+ tickets\\. 1 prize pushed off\\.`));

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log(`all good (a cup paid ${won} tickets)`);
