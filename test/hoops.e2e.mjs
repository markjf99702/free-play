// Plays Hoops, on the Free Play floor, in Chromium through the real page:  node test/hoops.e2e.mjs  (needs Playwright)
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

await page.goto(base + 'hoops/');
await page.evaluate(() => document.fonts.ready);
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
const court = expr => page.evaluate(`hoops.court.${expr}`);
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
const pocket = () => page.waitForFunction(() => !!hoops.court.pocket(), null, { timeout: 8000, polling: 16 });
// A flick as the finger would make it: points up the screen from (x, y), `speed` cabinet-heights a second over 90ms.
const flickAt = (speed, x = 195, y = 640, across = 0) => page.evaluate(([speed, x, y, across]) => {
  const cab = hoops.draw.cabinet(), up = speed * (cab.bottom - cab.top) * 0.09;
  const s = [];
  for (let i = 0; i <= 6; i++) s.push({ t: 1000 + i * 15, x: x + across * up * i / 6, y: y - up * i / 6 });
  const b = hoops.flick(s);
  return b ? { id: b.id, vx: b.vx } : null;
}, [speed, x, y, across]);

// The title card, and the machine shooting by itself behind it.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
await page.waitForFunction(() => hoops.court.shots > 0, null, { timeout: 5000 });
assert.equal(await court('score'), 0, 'the machine playing by itself scores nothing');
await page.click('#play');
assert.equal(await court('shots'), 0, 'a fresh round');
assert.equal(await page.textContent('#worth'), '2');
assert.equal(await page.textContent('#score'), '0');

// A tap isn't a throw; a real drag up the screen is.
await pocket();
await page.mouse.click(195, 640);
assert.equal(await court('shots'), 0, 'a tap throws nothing');
await page.mouse.move(195, 660);
await page.mouse.down();
for (let i = 1; i <= 4; i++) await page.mouse.move(195, 660 - 50 * i);
await page.mouse.up();
assert.equal(await court('shots'), 1, 'a flick up the screen throws');
// one that starts down on the deck under the machine counts too
await pocket();
const deckAt = await page.evaluate(() => { const r = document.getElementById('deck').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.move(deckAt.x, deckAt.y);
await page.mouse.down();
for (let i = 1; i <= 4; i++) await page.mouse.move(deckAt.x, deckAt.y - 50 * i);
await page.mouse.up();
assert.equal(await court('shots'), 2, 'a flick from the deck throws');

// A sweet flick at the still hoop goes in, and the scoreboard says so.
await page.waitForFunction(() => !hoops.court.balls.some(b => b.shot), null, { timeout: 6000 });
const score0 = await court('score');
await pocket();
const sweet = await flickAt(2.4);
assert.ok(sweet && Math.abs(sweet.vx) < 1, 'straight up the screen is straight at the hoop');
await page.waitForFunction(s => hoops.court.score > s, score0, { timeout: 4000 });
assert.equal(await page.textContent('#score'), String(await court('score')));
// One aimed off to the right goes right; too gentle a flick, or one sideways, isn't a throw at all.
await pocket();
const right = await flickAt(2.4, 195, 640, 0.3);
assert.ok(right.vx > 20, `aimed right, it goes right (${right.vx.toFixed(0)})`);
await pocket();
assert.equal(await flickAt(0.2), null, 'too gentle');
assert.equal(await flickAt(2.4, 195, 640, 3), null, 'sideways');

// The keyboard: Space winds up a throw, letting go throws it.
await pocket();
const shots = await court('shots');
await page.keyboard.press('ArrowLeft');
await page.keyboard.down(' ');
await page.waitForTimeout(250);
await page.keyboard.up(' ');
assert.equal(await court('shots'), shots + 1, 'Space throws');

// The menu stops the clock.
await page.keyboard.press('Escape');
assert.ok(await page.isVisible('#menu'));
const clock = await court('clock');
await page.waitForTimeout(300);
assert.equal(await court('clock'), clock, 'the clock waits while the menu is open');
await page.click('#sound');
assert.equal(await page.evaluate(() => hoops.saved.sound), false);
await page.click('#resume');
// Leaving the page mid-round opens the menu, so the clock waits there for the player to come back.
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-round did not open the menu');
const away = await court('clock');
await page.waitForTimeout(300);
assert.equal(await court('clock'), away, 'the clock runs on behind the menu');
await hide(false);
await page.click('#resume');

// The rest of the round, quickly, aiming where the hoop will be, and its tickets: one for every 4 points.
const t0 = await tickets();
await page.evaluate(() => { hoops.speed = 4; });
let bonus = false;
while (!(await court('over'))) {
  bonus ||= await page.evaluate(() => document.getElementById('worthBox').classList.contains('bonus'));
  await page.evaluate(() => {
    const c = hoops.court;
    if (!c.pocket() || c.buzzer) return;
    const x = c.hoop.amp * Math.sin(c.hoop.phase + 2 * Math.PI * 0.78 / (c.bonus ? 4 : 5.5));
    hoops.shoot(hoops.sweet(), hoops.aimAt(x));
  });
  await page.waitForTimeout(40);
}
assert.ok(bonus, 'the deck says when a basket is worth 3');
const score = await court('score');
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.ok(score > 40, `a steady hand scores (${score})`);
assert.equal(await page.textContent('#overT'), `${score.toLocaleString('en-US')} points`);
assert.match(await page.textContent('#overHow'), /^\d+ baskets? from \d+ shots?/);
assert.equal(await tickets(), t0 + Math.floor(score / 4));
assert.equal(await page.evaluate(() => hoops.saved.best), score);
await page.click('#again');
assert.equal(await page.textContent('#score'), '0');
assert.ok(await court('left') > 44, 'another round, another 45 seconds');

// A wide screen: the machine in the middle, the deck beside it, nothing sideways.
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(100);
const wide = await page.evaluate(() => ({ cab: hoops.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(wide.deck.left >= wide.cab.left + wide.cab.width, 'the deck stands beside the machine');
assert.ok(wide.sw <= 1280 && wide.deck.right <= 1280);
await page.setViewportSize({ width: 360, height: 640 });
await page.waitForTimeout(100);
const small = await page.evaluate(() => ({ cab: hoops.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(small.deck.top >= small.cab.bottom - 4 && small.deck.bottom <= 640, 'on a small phone the deck sits under the machine, on screen');
assert.ok(small.sw <= 360);
await page.setViewportSize({ width: 390, height: 844 });

// Back on the floor, Hoops' cabinet has the best round.
await page.goto(base);
assert.equal(await page.textContent('#hoopsStat'), `Best: ${score.toLocaleString('en-US')}.`);

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log(`all good (a round scored ${score})`);
