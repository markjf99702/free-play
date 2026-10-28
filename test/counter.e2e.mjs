// The prize counter on every page on the floor, in Chromium through the real pages:  node test/counter.e2e.mjs
// (needs Playwright). On the floor and on each machine: the arcade's tickets with their commas, the counter opened
// from the ticket count, a lollipop traded for, and Escape closing the counter and nothing else; and each page's link
// preview pointing at that page. On a computer, the keyboard kept in the counter and the page held still behind it.
// Back closing the counter, on the floor and on Tilt, and on a page brought back as it was by Back and Forward.
// (test/e2e.mjs walks the floor in depth, and each machine's own test plays it.)
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
// another tab on the floor, which wins or spends tickets while a page is open
const other = await ctx.newPage();
await other.goto(base);
const problems = [];
// og.png, in words: what a link to any page shows
const OG_ALT = "FREE PLAY in pink and teal neon over the line 'An arcade on your phone: eight machines on free play, and a prize counter.' Beside it, screens from the eight machines: skee-ball rings, a pinball table, a claw over a heap of plush, a coin pusher's deck, a stacker's tower, a shooting gallery's ducks and rabbits, moles in their tunnels, and a basketball dropping through the hoop under SWISH! +3.";
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
  // (Topple's deck waits behind its title card, so no coin goes over into the pocket while the counter is checked.)
  await page.evaluate(() => document.fonts.ready);

  // A link to the page shows that page, with a picture from the live site.
  assert.equal(await page.getAttribute('meta[property="og:url"]', 'content'), HOME + path, `${where}: og:url`);
  assert.match(await page.getAttribute('meta[property="og:image"]', 'content'), /^https:\/\/free-play\.junkdrawer\.works\/\S+\.png$/, `${where}: og:image`);
  // and says what's in the picture, for anyone who can't see it
  const ogAlt = await page.getAttribute('meta[property="og:image:alt"]', 'content');
  if ((await page.getAttribute('meta[property="og:image"]', 'content')).endsWith('/og.png')) assert.equal(ogAlt, OG_ALT, `${where}: og:image:alt`);
  else assert.ok(ogAlt && ogAlt.length > 40, `${where}: og:image:alt`);

  assert.equal(await text(tix), '1,234', `${where}: the tickets, with a comma`);
  // the ticket count in a machine's corner says what it is and how many, to a screen reader too
  if (opener === '#tixBtn') assert.match(await page.locator(opener).ariaSnapshot(), /^- button "Prize counter, 1,234 tickets"/, `${where}: the ticket button's name`);
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

  // Tickets won or spent in another tab show up here as well, in the ticket count and in an open counter.
  const elsewhere = async (tickets, lollipops) => {
    await other.evaluate(w => localStorage.setItem('free-play.wallet', JSON.stringify(w)), { tickets, prizes: { lollipop: lollipops } });
    await page.waitForFunction(([sel, t]) => document.querySelector(sel).textContent.trim() === t, [tix, tickets.toLocaleString('en-US')], { timeout: 3000 }).catch(() => {});
    assert.equal(await text(tix), tickets.toLocaleString('en-US'), `${where}: tickets changed in another tab`);
  };
  await elsewhere(4321, 3);
  await page.click(hook === 'tilt' ? '#pausePrizes' : opener); // (Tilt's game is paused by now)
  await elsewhere(2, 4);
  assert.equal(await text('.fp-bal b'), '2', `${where}: the open counter's balance, changed in another tab`);
  if (opener === '#tixBtn') {
    await other.evaluate(() => localStorage.setItem('free-play.wallet', JSON.stringify({ tickets: 1, prizes: { lollipop: 4 } })));
    await page.waitForFunction(() => document.getElementById('tixBtn').getAttribute('aria-label') === 'Prize counter, 1 ticket', null, { timeout: 3000 }).catch(() => {});
    assert.equal(await page.getAttribute('#tixBtn', 'aria-label'), 'Prize counter, 1 ticket', `${where}: the ticket button's name at 1`);
    await elsewhere(2, 4);
  }
  if (hook === 'tilt') {
    await other.evaluate(() => localStorage.setItem('free-play.wallet', JSON.stringify({ tickets: 1, prizes: { lollipop: 4 } })));
    await page.waitForFunction(() => document.getElementById('prizesBtn').textContent === '1 ticket · Prize counter', null, { timeout: 3000 }).catch(() => {});
    assert.equal(await page.textContent('#prizesBtn'), '1 ticket · Prize counter', "tilt: the title card's button at 1");
    await elsewhere(2, 4);
  }
  assert.equal(await page.getAttribute('.fp-shelf .fp-item', 'aria-label'), 'Lollipop, 4', `${where}: the open counter's shelf, changed in another tab`);
  assert.equal(await page.locator('.fp-prize:not(.short)').count(), 0, `${where}: with 2 tickets nothing at the counter is affordable`);
  await page.keyboard.press('Escape');
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

// The prizes stand four a row, on a phone as on a computer (and on Hoops' page as on the floor's), and three a row on
// the narrowest phones, under 350 px. Each is a thumb's height to tap at least, with its name and price inside it.
for (const [path, hook, opener] of [PAGES[0], PAGES[8]]) {
  for (const [width, height, across] of [[320, 640, 3], [349, 640, 3], [350, 640, 4], [360, 640, 4], [390, 844, 4], [430, 932, 4], [1280, 800, 4]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + path);
    await page.evaluate(() => localStorage.setItem('free-play.wallet', JSON.stringify({ tickets: 1320, prizes: {} })));
    await page.reload();
    await page.waitForFunction(hook => !!window[hook], hook, { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(sel => document.querySelector(sel).click(), opener); // (Hoops' is behind its title card)
    const grid = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('.fp-prize')], boxes = tiles.map(t => t.getBoundingClientRect());
      const out = [];
      tiles.forEach((t, i) => {
        if (boxes[i].height < 44) out.push(`${t.dataset.id} is ${Math.round(boxes[i].height)} px tall`);
        for (const s of t.querySelectorAll('.n, .c')) {
          const r = s.getBoundingClientRect();
          if (s.scrollWidth > s.clientWidth + 1 || r.left < boxes[i].left || r.right > boxes[i].right) out.push(`${t.dataset.id}'s ${s.className === 'n' ? 'name' : 'price'} runs out of it`);
        }
      });
      return { n: tiles.length, first: boxes.filter(b => Math.abs(b.top - boxes[0].top) < 2).length, rows: new Set(boxes.map(b => Math.round(b.top))).size, out };
    });
    const at = `${path || 'the floor'} at ${width} px`;
    assert.equal(grid.first, across, `${at}: ${grid.first} prizes a row`);
    assert.equal(grid.rows, Math.ceil(grid.n / across), `${at}: ${grid.n} prizes in ${grid.rows} rows`);
    assert.deepEqual(grid.out, [], `${at}: the prizes`);
    await page.keyboard.press('Escape');
  }
}
await page.setViewportSize({ width: 390, height: 844 });

// On a computer, on the floor and on a machine: opened from the keyboard, the counter keeps it. Tab goes round its
// buttons and never to the page behind; a click on a blank part of it, then Escape, still closes it; and the keyboard
// is back on the button that opened it. A mouse wheel over the backdrop beside it leaves the page where it was.
await page.setViewportSize({ width: 1280, height: 800 });
const inSheet = () => page.evaluate(() => !!document.activeElement?.closest('.fp-sheet'));
for (const [path, hook, opener] of [['', 'freePlay', '#purse'], ['hoops/', 'hoops', '#tixBtn']]) {
  const where = path || 'the floor';
  await page.goto(base + path);
  await page.evaluate(() => localStorage.setItem('free-play.wallet', JSON.stringify({ tickets: 12345, prizes: { lollipop: 3, duck: 1, 'plush-frog': 2 } })));
  await page.reload();
  await page.waitForFunction(hook => !!window[hook], hook, { timeout: 10000 });
  await page.focus(opener);
  await page.keyboard.press('Enter');
  assert.ok(await page.isVisible('.fp-sheet'), `${where}: Enter opens the counter`);
  // (once round every button in it: Close, the shelf and the prizes)
  const outside = [], round = await page.locator('.fp-sheet button').count();
  for (let i = 1; i <= round; i++) { await page.keyboard.press('Tab'); if (!(await inSheet())) outside.push(i); }
  assert.deepEqual(outside, [], `${where}: Tabs that left the counter`);
  assert.equal(await focused(), 'fp-x', `${where}: Tab from the last prize goes round to Close`);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'giraffe', `${where}: Shift+Tab from Close goes round to the last prize`);
  const shelf = await page.locator('.fp-shelf').boundingBox();
  await page.mouse.click(shelf.x + shelf.width - 12, shelf.y + 12);
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('.fp-sheet'), `${where}: Escape after a click on the shelf closes the counter`);
  assert.equal(await focused(), opener.slice(1), `${where}: the keyboard is back on ${opener}`);
  assert.equal(await page.evaluate(() => document.querySelectorAll('body > [inert]').length), 0, `${where}: the page is left inert`);
  if (!path) await page.evaluate(() => scrollTo(0, 600));
  const y = await page.evaluate(() => scrollY);
  await page.evaluate(sel => document.querySelector(sel).click(), opener); // (where it is, without scrolling to it)
  await page.mouse.move(40, 400);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40); }
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => scrollY), y, `${where}: a wheel over the backdrop scrolled the page behind the counter`);
  await page.click('.fp-x');
  assert.equal(await page.evaluate(() => scrollY), y, `${where}: closing the counter moved the page`);
}
await page.setViewportSize({ width: 390, height: 844 });

// Back closes the counter (it's a step in the page's history), on the floor and on Tilt with a table in its address,
// and leaves the address as it was. Closed by ×, the counter takes its step back off, so the next Back leaves the
// page for the one before.
const atRest = () => page.waitForFunction(() => !history.state?.fpCounter, null, { timeout: 3000 });
for (const [path, hook, opener] of [['', 'freePlay', '#purse'], ['tilt/?table=space', 'tilt', '#prizesBtn']]) {
  const where = path || 'the floor', before = path ? base : base + 'hoops/';
  await page.goto(before);
  await page.goto(base + path);
  await page.waitForFunction(hook => !!window[hook], hook, { timeout: 10000 });
  await page.click(opener);
  await page.goBack();
  assert.ok(await page.isHidden('.fp-sheet'), `${where}: Back closes the counter`);
  assert.equal(page.url(), base + path, `${where}: Back with the counter open left the page`);
  if (hook === 'tilt') assert.equal(await page.evaluate(() => window.tilt.table.name), 'Space', 'tilt: the table after Back');
  await page.click(opener);
  await page.click('.fp-x');
  await atRest();
  assert.equal(page.url(), base + path, `${where}: closing the counter changed the address`);
  if (hook === 'tilt') assert.equal(await page.evaluate(() => window.tilt.table.name), 'Space', 'tilt: the table after ×');
  await page.goBack();
  assert.equal(page.url(), before, `${where}: after ×, Back went somewhere other than the page before`);
}

// A browser that keeps pages for Back and Forward as they were (as phones do), which takes Playwright's full Chromium
// with that turned back on: the floor, its counter opened and closed by Back, Forward onto the counter's step, then off
// to a machine and Back again. The floor comes back as it was, with the counter's step on top of its history and the
// counter shut, and from there it opens and closes as ever, and the next Back is the page before.
let kept = 'checked';
const cache = await pw.chromium.launch({ channel: 'chromium', ignoreDefaultArgs: ['--disable-back-forward-cache'] }).catch(() => null);
if (!cache) kept = "skipped: Playwright's full Chromium isn't installed";
else try {
  const bp = await (await cache.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
  bp.on('pageerror', e => problems.push(e.message));
  await bp.goto(base + 'hoops/');
  await bp.goto(base);
  await bp.waitForFunction(() => !!window.freePlay);
  await bp.evaluate(() => addEventListener('pageshow', e => { window.restored = e.persisted; }));
  await bp.click('#purse');
  await bp.goBack();
  await bp.goForward();
  assert.ok(await bp.evaluate(() => history.state?.fpCounter && document.querySelector('.fp-sheet').hidden), "Forward onto the counter's step leaves it shut");
  await bp.goto(base + 'hoops/');
  await bp.goBack({ waitUntil: 'commit' }); // (a page brought back as it was has no load event)
  await bp.waitForFunction(() => window.restored !== undefined, null, { timeout: 5000 }).catch(() => {});
  assert.ok(await bp.evaluate(() => window.restored), "the floor didn't come back as it was");
  assert.ok(await bp.evaluate(() => history.state?.fpCounter), "the floor came back on the counter's step");
  assert.ok(await bp.isHidden('.fp-sheet'), 'the floor came back with the counter open');
  await bp.click('#purse');
  assert.ok(await bp.isVisible('.fp-sheet'), 'the counter opens');
  await bp.keyboard.press('Escape');
  await bp.waitForFunction(() => !history.state?.fpCounter, null, { timeout: 3000 });
  assert.ok(await bp.isHidden('.fp-sheet'));
  assert.equal(bp.url(), base);
  await bp.goBack({ waitUntil: 'commit' });
  assert.equal(bp.url(), base + 'hoops/', 'after the counter, Back went somewhere other than the page before the floor');
} finally { await cache.close(); }

assert.deepEqual(problems, [], 'problems at the counter');
await browser.close();
server.close();
console.log(`all good (the page kept for Back: ${kept})`);
