// Plays Clutch, on the Free Play floor, in Chromium through the real page:  node test/clutch.e2e.mjs  (needs Playwright)
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
// The machine's own loop sound (its motor, or the rumble of the ball), as the page makes it, so the test can listen.
await ctx.addInitScript(() => {
  window.__loops = [];
  const make = AudioContext.prototype.createGain;
  AudioContext.prototype.createGain = function () {
    const g = make.call(this);
    if (/startHum|startRumble/.test(new Error().stack)) window.__loops.push(g);
    return g;
  };
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });

await page.goto(base + 'clutch/');
await page.evaluate(() => document.fonts.ready);
const state = () => page.evaluate(() => clutch.state);
const clawX = () => page.evaluate(() => clutch.machine.claw.x);
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
// What the sound is doing: the audio running or asleep, and how loud the loop is.
const audio = () => page.evaluate(() => ({ state: window.__loops[0]?.context.state, loop: window.__loops[0]?.gain.value }));
// The claw home again. Any go can win (even one that only brushes the heap), so a win card that comes up is put away,
// without moving the mouse off the button.
async function ready() {
  await page.waitForFunction(() => clutch.state === 'ready', null, { timeout: 30000 });
  await page.evaluate(() => { if (!document.getElementById('win').hidden) document.getElementById('more').click(); });
}

// The title card, and the claw stays put while it's up.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
assert.equal(await page.textContent('#won'), '0');
const box = await page.locator('#hold').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up();
assert.equal(await state(), 'ready', 'the button does nothing behind the title card');
await page.click('#play');
assert.ok(await page.isHidden('#title'));

// Holding the button slides the claw across; letting go drops it.
const home = await clawX();
await page.mouse.down();
await page.waitForTimeout(700);
assert.equal(await state(), 'move');
assert.ok(await page.evaluate(() => document.getElementById('hold').classList.contains('down')), 'the button shows it is held');
const slid = await clawX();
assert.ok(slid > home + 60, `holding for 0.7s moved the claw ${(slid - home).toFixed(0)}mm`);
await page.mouse.up();
await page.waitForFunction(() => clutch.state === 'drop' || clutch.state === 'close', null, { timeout: 2000 });
const dropped = await clawX();
assert.ok(Math.abs(dropped - slid) < 20, 'it drops where it was let go');
await ready();
assert.equal(await clawX(), home, 'the claw comes back over the chute');
assert.equal(await page.evaluate(() => clutch.saved.goes), 1);

// A held button doesn't start the next go by itself: it has to go down again.
await page.mouse.down();
await page.waitForFunction(() => clutch.state === 'move');
await page.waitForTimeout(250);
await page.mouse.up();
await page.waitForFunction(() => clutch.state === 'drop' || clutch.state === 'close');
await page.mouse.down();
await ready();
await page.waitForTimeout(300);
assert.equal(await state(), 'ready', 'a press left over from the last go should not start the next one');
await page.mouse.up();

// The keyboard: hold Space, let go.
await page.keyboard.down(' ');
await page.waitForTimeout(500);
assert.equal(await state(), 'move');
await page.keyboard.up(' ');
await page.waitForFunction(() => clutch.state !== 'move');
await ready();

// The menu pauses a go where it is.
await page.evaluate(() => clutch.go(420));
await page.waitForFunction(() => clutch.state === 'lift' && clutch.machine.claw.y < 500, null, { timeout: 15000 });
await page.keyboard.press('Escape');
assert.ok(await page.isVisible('#menu'));
const stopped = await page.evaluate(() => clutch.machine.claw.y);
await page.waitForTimeout(400);
assert.equal(await page.evaluate(() => clutch.machine.claw.y), stopped, 'the claw waits while the menu is open');
await page.click('#sound');
assert.equal(await page.evaluate(() => clutch.saved.sound), false);
await page.click('#resume');
await ready();

// Leaving the page with the button held lets go of it and opens the menu, so the claw waits there for the player to
// come back, and drops once they do.
const hb = await page.locator('#hold').boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.waitForFunction(() => clutch.state === 'move');
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-go did not open the menu');
assert.ok(!(await page.evaluate(() => document.getElementById('hold').classList.contains('down'))), 'the button is still held behind the menu');
const away = await clawX();
await page.waitForTimeout(300);
assert.equal(await clawX(), away, 'the claw moves on behind the menu');
await hide(false);
await page.mouse.up();
await page.click('#resume');
await page.waitForFunction(() => clutch.state === 'drop' || clutch.state === 'close', null, { timeout: 2000 });
await ready();

// Goes aimed at the plush on top of the heap, till one comes out of the prize door.
await page.evaluate(() => { clutch.speed = 4; });
let goes = 0;
while (await page.isHidden('#win') && goes < 25) {
  await page.evaluate(() => {
    const top = clutch.machine.toys.filter(t => t.position.x > 200).sort((a, b) => a.position.y - b.position.y)[0];
    clutch.go(top.position.x);
  });
  goes++;
  await page.waitForFunction(() => clutch.state === 'move');
  await page.waitForFunction(() => clutch.state === 'ready' || !document.getElementById('win').hidden, null, { timeout: 30000 });
  await page.waitForTimeout(100);
}
assert.ok(await page.isVisible('#win'), `nothing won in ${goes} goes aimed at the top of the heap`);
const won = await page.evaluate(() => clutch.saved.won);
assert.ok(Object.keys(won).length > 0);
assert.match(await page.textContent('#winT'), /^You got (a plush \w+|the lucky star)/);
const n = await page.evaluate(() => Object.values(clutch.saved.won).reduce((a, b) => a + b, 0));
assert.equal(await page.textContent('#won'), String(n), 'the scoreboard counts it');
const wallet = await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')));
assert.equal(wallet.tickets, 0, 'the claw pays no tickets');
for (const [kind, k] of Object.entries(won)) assert.equal(wallet.prizes['plush-' + kind], k, `the ${kind} is on the shelf`);
assert.equal(Object.entries(wallet.prizes).filter(([id]) => id.startsWith('plush-')).reduce((a, [, k]) => a + k, 0), n);

// While the card's up, the button doesn't start a go; "See your shelf" opens the counter with it there.
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up();
assert.equal(await state(), 'ready');
await page.click('#winShelf');
assert.ok(await page.isHidden('#win'));
assert.ok(await page.isVisible('.fp-sheet'));
const shelf = await page.textContent('.fp-shelf');
assert.match(shelf, /[🐻🐥🐸👻🐧👽🌟]/u, 'the plush is on the shelf in the counter');
await page.click('.fp-x');
assert.ok(await page.isHidden('.fp-sheet'));

// Leaving the page with the motor running hushes it, and the sound sleeps until the page is back.
await page.click('#menuBtn');
await page.waitForSelector('#menu:not([hidden])', { timeout: 3000 });
await page.click('#sound');
assert.equal(await page.evaluate(() => clutch.saved.sound), true);
await page.click('#resume');
await ready();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForFunction(() => clutch.state === 'move' && window.__loops[0]?.gain.value > 0.03, null, { timeout: 3000 });
await hide(true);
await page.waitForFunction(() => window.__loops[0].context.state === 'suspended', null, { timeout: 2000 });
assert.equal((await audio()).loop, 0, 'the motor hums on with the page out of sight');
await hide(false);
await page.mouse.up();
await page.waitForFunction(() => window.__loops[0].context.state === 'running', null, { timeout: 2000 });
await page.click('#resume');
await ready();

// A wide screen: the cabinet in the middle, its control deck standing beside it, nothing sideways.
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(100);
const wide = await page.evaluate(() => ({ cab: clutch.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(wide.deck.left >= wide.cab.left + wide.cab.width, 'the deck stands beside the cabinet');
assert.ok(wide.sw <= 1280 && wide.deck.right <= 1280);
await page.setViewportSize({ width: 360, height: 640 });
await page.waitForTimeout(100);
const small = await page.evaluate(() => ({ cab: clutch.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(small.deck.top >= small.cab.bottom - 4 && small.deck.bottom <= 640, 'on a small phone the deck sits under the cabinet, on screen');
assert.ok(small.sw <= 360);
await page.setViewportSize({ width: 390, height: 844 });

// Back on the floor, Clutch's cabinet says what it's given you.
await page.goto(base);
assert.match(await page.textContent('#clutchStat'), new RegExp(`^${n} plush won`));
assert.match(await page.textContent('#shelf'), /[🐻🐥🐸👻🐧👽🌟]/u);

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log(`all good (a win in ${goes} aimed goes)`);
