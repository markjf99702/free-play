// The prize counter on every page on the floor, in Chromium through the real pages:  node test/counter.e2e.mjs
// (needs Playwright). On the floor and on each machine: the arcade's tickets with their commas, the counter opened
// from the ticket count, a lollipop traded for, and Escape closing the counter and nothing else; and each page's link
// preview pointing at that page. (test/e2e.mjs walks the floor in depth, and each machine's own test plays it.)
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
const HOME = 'https://free-play.junkdrawer.works/';

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });

// Each page, its test hook, where it shows the tickets and the button by them that opens the counter.
const PAGES = [
  ['', 'freePlay', '#tix', '#purse'],
  ['roll-up/', 'rollUp', '#tix', '#tixBtn'],
  ['tilt/', 'tilt', '#tixT', '#prizesBtn'],
  ['clutch/', 'clutch', '#tix', '#tixBtn'],
  ['topple/', 'topple', '#tix', '#tixBtn'],
  ['highrise/', 'highrise', '#tix', '#tixBtn'],
  ['popgun/', 'popgun', '#tix', '#tixBtn'],
  ['bonkers/', 'bonkers', '#tix', '#tixBtn'],
  ['hoops/', 'hoops', '#tix', '#tixBtn'],
];
const text = sel => page.evaluate(sel => document.querySelector(sel).textContent.trim(), sel);
const focused = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.className);

// Opens the counter with `opener`, trades for a lollipop, and closes it with Escape.
async function lollipop(where, tix, opener, from) {
  await page.click(opener);
  assert.ok(await page.isVisible('.fp-sheet'), `${where}: the counter opens from ${opener}`);
  assert.equal(await text('.fp-bal b'), from.toLocaleString('en-US'), `${where}: the counter's balance`);
  await page.click('.fp-prize >> nth=0');
  assert.match(await text('.fp-toast'), /^You got a lollipop\./, `${where}: the trade`);
  const left = (from - 5).toLocaleString('en-US');
  assert.equal(await text('.fp-bal b'), left, `${where}: the counter's balance after the trade`);
  assert.equal(await text(tix), left, `${where}: the ticket count after the trade`);
  assert.match(await text('.fp-shelf'), /🍭/u, `${where}: the lollipop is on the shelf`);
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('.fp-sheet'), `${where}: Escape closes the counter`);
  assert.equal(await focused(), opener.slice(1), `${where}: the keyboard is back on ${opener}`);
}

for (const [path, hook, tix, opener] of PAGES) {
  const where = path || 'the floor';
  await page.goto(base + path);
  await page.evaluate(() => localStorage.setItem('free-play.wallet', JSON.stringify({ tickets: 1234, prizes: {} })));
  await page.reload();
  await page.waitForFunction(hook => !!window[hook], hook, { timeout: 10000 });
  await page.evaluate(() => document.fonts.ready);

  // A link to the page shows that page, with a picture from the live site.
  assert.equal(await page.getAttribute('meta[property="og:url"]', 'content'), HOME + path, `${where}: og:url`);
  assert.match(await page.getAttribute('meta[property="og:image"]', 'content'), /^https:\/\/free-play\.junkdrawer\.works\/\S+\.png$/, `${where}: og:image`);

  assert.equal(await text(tix), '1,234', `${where}: the tickets, with a comma`);
  await lollipop(where, tix, opener, 1234);

  if (hook === 'tilt') {
    // Tilt's pause card has one too, and Escape there closes the counter and leaves the game paused.
    await page.click('#startBtn');
    await page.waitForFunction(() => window.tilt.game.mode === 'play');
    await page.click('#menuBtn');
    assert.ok(await page.isVisible('#pause'));
    await page.waitForTimeout(800); // (a tap right after a trade is taken for a double tap, and ignored)
    await lollipop('tilt, paused', tix, '#pausePrizes', 1229);
    assert.ok(await page.isVisible('#pause'), 'tilt: the pause card is still up');
  }
}

// On a phone the counter's heading stays on one line, whatever the balance, with the balance and the close button clear
// of it and of each other.
for (const [width, height] of [[360, 640], [390, 844]]) {
  await page.setViewportSize({ width, height });
  for (const tickets of [1320, 99999]) {
    await page.goto(base);
    await page.evaluate(tickets => localStorage.setItem('free-play.wallet', JSON.stringify({ tickets, prizes: {} })), tickets);
    await page.reload();
    await page.waitForFunction(() => !!window.freePlay);
    await page.evaluate(() => document.fonts.ready);
    await page.click('#purse');
    const head = await page.evaluate(() => {
      const box = sel => document.querySelector(sel).getBoundingClientRect();
      const h = document.querySelector('.fp-head h2');
      return { h: box('.fp-head h2'), size: parseFloat(getComputedStyle(h).fontSize), bal: box('.fp-bal'), x: box('.fp-x'), sheet: box('.fp-sheet-in') };
    });
    const at = `${width} px, ${tickets} tickets`;
    assert.ok(head.h.height < head.size * 1.6, `${at}: the heading wraps (${head.h.height} px tall)`);
    assert.ok(head.bal.height < 32, `${at}: the balance wraps (${head.bal.height} px tall)`);
    const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
    assert.ok(apart(head.h, head.bal) && apart(head.h, head.x) && apart(head.bal, head.x), `${at}: the heading, balance and close button overlap`);
    assert.ok(head.bal.right <= head.sheet.right && head.x.right <= head.sheet.right, `${at}: off the side`);
    await page.keyboard.press('Escape');
  }
}
await page.setViewportSize({ width: 390, height: 844 });

assert.deepEqual(problems, [], 'problems at the counter');
await browser.close();
server.close();
console.log('all good');
