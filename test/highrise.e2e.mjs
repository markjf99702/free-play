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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
// The pocket in the corner as a round's tickets feed out of the slot, and how many the strip has fed so far. It counts
// along with the strip, from what it held before the round paid, and holds them all, with a bump, once they're out.
const pocketNow = () => page.evaluate(() => ['tix', 'payout'].map(id => Number(document.querySelector(id === 'tix' ? '#tix' : '#over .fp-won b').textContent.replace(/,/g, ''))));
async function countsAlong(total, won) {
  const [shown, fed] = await pocketNow();
  assert.ok(fed < won, `the strip had fed all ${won} before the test looked`);
  assert.equal(shown, total - won + fed, `with ${fed} of ${won} fed, the pocket shows ${shown} of ${total}`);
  await page.waitForFunction(won => document.querySelector('#over .fp-won b').textContent.replace(/,/g, '') === String(won), won, { timeout: 4000 });
  assert.equal((await pocketNow())[0], total, 'once the strip is done, the pocket holds them all');
  assert.ok(await page.evaluate(() => document.getElementById('tixBtn').classList.contains('bump')), 'and bumps');
}
// The best line under the dispenser: what it says, whether it's dressed as a new best, and how big its headline is.
const bestLine = () => page.evaluate(() => { const e = document.getElementById('overBest'); return { text: e.textContent, big: e.classList.contains('fp-best'), size: getComputedStyle(e.querySelector('b') || e).fontSize }; });
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
assert.ok(await page.isVisible('#title .lede') && await page.isHidden('#fold'), 'a first visit has the whole title card, with how to play on it');
const box = await page.locator('#stop').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.mouse.up();
assert.equal(await page.evaluate(() => highrise.tower.built), 0, 'the stop button does nothing behind the title card');
await page.click('#play');

// The row moves, and the stop button sets it down where it is. On the ground floor there's no floor below to stop it
// on, and the deck says so; from the next floor up it says to stop it on the one below.
await ready();
assert.equal(await page.textContent('#aimHint'), 'Stop it anywhere to start');
const seen = new Set();
for (let i = 0; i < 8; i++) { seen.add(await page.evaluate(() => highrise.shown)); await page.waitForTimeout(70); }
assert.ok(seen.size > 2, 'the row slides along');
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.mouse.up();
const first = await page.evaluate(() => highrise.tower.rows[0]);
assert.equal(first.length, 3, 'the ground floor lands whole, wherever it stops');
assert.equal(await page.textContent('#floorNo'), '2');
assert.equal(await page.textContent('#aimHint'), 'Stop it on the floor below');

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

// The prize counter, opened mid-game and shut with Escape: Space stops the row again, rather than opening it again.
await ready();
await page.click('#tixBtn');
assert.ok(await page.isVisible('.fp-sheet'));
await page.keyboard.press('Escape');
assert.ok(await page.isHidden('.fp-sheet'));
const built = await page.evaluate(() => highrise.tower.built);
await page.waitForFunction(() => {
  const { tower, shown } = highrise;
  if (!highrise.ready) return false;
  let over = 0;
  for (let c = shown; c < shown + tower.width; c++) if (tower.rows[tower.built - 1].includes(c)) over++;
  return over >= Math.min(2, tower.width);
}, null, { timeout: 5000 });
await page.keyboard.press(' ');
assert.ok(await page.isHidden('.fp-sheet'), 'Space after the counter opened it again');
assert.equal(await page.evaluate(() => highrise.tower.built), built + 1, 'Space after the counter stops the row');

// Floor 11, taking the minor prize: 11 tickets and 25 more.
const t0 = await tickets();
await page.evaluate(() => { Object.assign(highrise.saved, { best: 6, games: 2 }); delete highrise.saved.top; }); // (after games as high as floor 6)
await page.evaluate(() => highrise.start());
await build(11);
await page.waitForSelector('#choose:not([hidden])');
// Leaving the page there leaves the choice as it is: no menu over it.
await hide(true);
assert.ok(await page.isVisible('#choose') && await page.isHidden('#menu'), 'leaving the page covered the floor-11 choice');
await hide(false);
await page.click('#takeMinor');
assert.ok(await page.isVisible('#over'));
await countsAlong(await tickets(), 36);
assert.equal(await tickets(), t0 + 36);
assert.match(await page.textContent('#overT'), /minor prize/);
assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.totals') || '{}').rounds?.highrise) >= 1, "the game is counted in the arcade's totals");
assert.ok(await page.isHidden('#overTrophy'), 'the trophy is for a top-out');
assert.deepEqual(await bestLine(), { text: 'Your highest yet! The old one was floor 6.', big: true, size: '18px' });

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
assert.deepEqual(await bestLine(), { text: 'Number 2 on your list. Highest: floor 11.', big: false, size: '13px' }, 'as high as the highest is not higher, and goes on the list under it');
// the top five, best first, with the day each was set
const today = await page.evaluate(() => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-'); });
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.highrise')).top), [{ score: 11, date: today }, { score: 11, date: today }, { score: 6, date: null }]);

// Highrise open in a second tab too, from before the next game.
const other = await ctx.newPage();
other.on('pageerror', e => problems.push('second tab: ' + e.message));
await other.goto(base + 'highrise/');
await other.waitForFunction(() => window.highrise);
const gamesBefore = await page.evaluate(() => highrise.saved.games);

// All fifteen: the trophy and 100 more.
const t2 = await tickets();
await page.click('#again');
await build(11);
await page.waitForSelector('#choose:not([hidden])');
await page.click('#keepGoing');
await build(15);
// 'Topped out!' stays up through the ending, not fading out as an ordinary floor's word does after a second
await page.waitForTimeout(1600);
assert.ok(await page.evaluate(() => highrise.pops.some(p => p.text === 'Topped out!')), "'Topped out!' had gone 1.6 s into the ending");
await page.waitForSelector('#over:not([hidden])', { timeout: 8000 });
assert.equal(await page.textContent('#overT'), 'Topped out!');
// and the card has the trophy on it, big
assert.deepEqual(await page.evaluate(() => { const e = document.getElementById('overTrophy'); return [e.hidden, e.textContent, getComputedStyle(e).fontSize]; }), [false, '🏆', '72px']);
assert.deepEqual(await bestLine(), { text: 'Your highest yet! The old one was floor 11.', big: true, size: '18px' });
assert.equal(await tickets(), t2 + 115);
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
assert.equal(await other.textContent('#overBest'), 'Number 5 on your list. Highest: floor 15.', "and it goes on the list as it is now, the top-out at the top");
assert.deepEqual(kept.top.map(e => e.score), [15, 11, 11, 6, 2]);
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
assert.equal(await page.getAttribute('#shelf .fp-trophy:not(.fp-yet)', 'aria-label'), 'Highrise trophy', 'the trophy on the shelf, not its outline');

// Leaving while the tower falls, before its card, by the menu's Back to the arcade: the game is over all the same, and
// it pays as the page goes.
await page.goto(base + 'highrise/');
assert.ok(await page.isVisible('#fold') && await page.isHidden('#title .lede'), 'back after a game, the title card is the small one, with how to play folded under How to play');
await page.click('#play');
await build(2);
await ready();
const gamesThen = await page.evaluate(() => highrise.saved.games), t3 = await tickets();
await page.evaluate(() => highrise.stopAt(0));
assert.equal(await page.evaluate(() => highrise.mode), 'ending');
await page.keyboard.press('Escape');
assert.deepEqual(await cards(), ['menu']);
await page.click('#menu a.to-floor');
await page.waitForSelector('#highriseStat');
assert.equal(await tickets(), t3 + 2, 'a game left as its tower fell still pays');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.highrise')).games), gamesThen + 1, 'and counts');

// Today's special, on a day that's Highrise's (Oct 22, 2026): the title card says the goal, ten floors; a game that
// builds them pays 25 more tickets, out of the slot with the rest, and says so; and that's once a day.
{
  const sc = await openOn({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await sc.clock.setFixedTime(new Date(2026, 9, 22, 12));
  const sp = await sc.newPage();
  sp.on('pageerror', e => problems.push('special: ' + e.message));
  await sp.goto(base + 'highrise/');
  await sp.waitForFunction(() => !!window.highrise);
  assert.equal(await sp.textContent('#titleSpecial'), "Today's special: build 10 floors for 25 more tickets.");
  assert.ok(await sp.isVisible('#titleSpecial'));
  const pocket = () => sp.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
  const ten = async () => {
    await sp.evaluate(() => highrise.start());
    while (await sp.evaluate(() => highrise.tower.built) < 10) { await sp.waitForFunction(() => highrise.ready, null, { timeout: 5000 }); await sp.evaluate(() => highrise.stopAt(3)); }
    await sp.waitForFunction(() => highrise.ready, null, { timeout: 5000 });
    await sp.evaluate(() => highrise.stopAt(0)); // floor 11 missed: ten floors
    await sp.waitForSelector('#over:not([hidden])', { timeout: 5000 });
  };
  // nine floors isn't it
  await sp.evaluate(() => highrise.start());
  while (await sp.evaluate(() => highrise.tower.built) < 9) { await sp.waitForFunction(() => highrise.ready, null, { timeout: 5000 }); await sp.evaluate(() => highrise.stopAt(3)); }
  await sp.waitForFunction(() => highrise.ready, null, { timeout: 5000 });
  await sp.evaluate(() => highrise.stopAt(0));
  await sp.waitForSelector('#over:not([hidden])', { timeout: 5000 });
  assert.ok(await sp.isHidden('#overSpecial'), 'nine floors made the special');
  assert.equal(await pocket(), 9);
  const before = await pocket();
  await ten();
  assert.equal(await sp.textContent('#overSpecial'), "Today's special! 25 more tickets.");
  assert.ok(await sp.isVisible('#overSpecial'));
  assert.equal(await pocket(), before + 10 + 25, 'ten floors and the special');
  await sp.waitForFunction(() => document.querySelector('#over .fp-won b').textContent === '35', null, { timeout: 5000 });
  assert.deepEqual(await sp.evaluate(() => JSON.parse(localStorage.getItem('free-play.special'))), { key: '2026-10-22', machine: 'highrise' });
  // once a day
  const then = await pocket();
  await ten();
  assert.ok(await sp.isHidden('#overSpecial'));
  assert.equal(await pocket(), then + 10, 'the special pays once a day');
  await sp.reload();
  await sp.waitForFunction(() => !!window.highrise);
  assert.equal(await sp.textContent('#titleSpecial'), "Today's special: made. A new one tomorrow.");
  // and on another machine's day, Highrise's title card says nothing of it
  await sc.clock.setFixedTime(new Date(2026, 9, 23, 12));
  await sp.reload();
  await sp.waitForFunction(() => !!window.highrise);
  assert.ok(await sp.isHidden('#titleSpecial'), "the special's line shows on another machine's day");
  await sc.close();
}

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log('all good');
