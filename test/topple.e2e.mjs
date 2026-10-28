// Plays Topple, on the Free Play floor, in Chromium through the real page:  node test/topple.e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { TRINKETS } from '../shared/prizes.js';

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
// The best line under the dispenser: what it says, whether it's dressed as a new best, and how big its headline is.
const bestLine = () => page.evaluate(() => { const e = document.getElementById('overBest'); return { text: e.textContent, big: e.classList.contains('fp-best'), size: getComputedStyle(e.querySelector('b') || e).fontSize }; });
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });

await page.goto(base + 'topple/');
await page.evaluate(() => document.fonts.ready);
const left = () => page.evaluate(() => topple.cup?.left ?? 0);
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
// What the sound is doing: the audio running or asleep, and how loud the loop is.
const audio = () => page.evaluate(() => ({ state: window.__loops[0]?.context.state, loop: window.__loops[0]?.gain.value }));
const reloaded = () => page.waitForFunction(() => topple.machine.ready);

// A real finger's tap, as a phone sends it: down, and up 40 ms later.
const cdp = await ctx.newCDPSession(page);
async function tap({ x, y }) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const middle = sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);

// The title card, then a cup of twenty. A quick double tap on Play starts it: the second tap lands on the glass where
// the button was, and doesn't drop a coin.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
assert.equal(await page.textContent('#play'), 'Play');
// Under it, the deck shows the cup full, with Drop waiting for Play, and the scoreboard says what it counts.
assert.equal(await page.textContent('#left'), '20', 'a full cup waits under the title card');
assert.ok(await page.isDisabled('#drop'), 'Drop waits for Play');
assert.equal(await page.textContent('.hud .score small'), 'Won this cup');
await page.evaluate(() => { window.__downs = []; document.getElementById('stage').addEventListener('pointerdown', () => __downs.push(performance.now())); document.getElementById('play').addEventListener('click', () => { window.__play = performance.now(); }); });
const play = await middle('#play');
await tap(play);
const shut = Date.now();
await page.waitForTimeout(110);
await tap(play);
await page.waitForTimeout(300);
const second = await page.evaluate(() => __downs.map(t => Math.round(t - __play)));
assert.equal(second.length, 1, 'the second tap landed on the glass');
assert.ok(await page.isHidden('#title'));
assert.equal(await left(), 20, `the second tap of a double tap on Play, ${second[0]} ms after the first, dropped a coin`);
assert.equal(await page.textContent('#left'), '20');
// (what the pocket had as the cup began: everything the cup pushes over goes on top)
const atStart = await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets - topple.cup.won);
// (and from here on, a count of the coins that go over the front edge, to check what they paid)
const counting = await page.evaluate(() => {
  const m = topple.machine, take = m.takeFalls;
  window.__over = { coin: 0, gold: 0 };
  m.takeFalls = () => { const fell = take(); for (const f of fell) if (f.edge !== 'side' && f.kind !== 'prize') __over[f.kind === 'gold' ? 'gold' : 'coin']++; return fell; };
  return { tickets: JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets, odd: topple.saved.odd };
});

// Touching the glass moves the chute to the finger; letting go drops a coin there. A tap half a second after Play
// is a tap like any other.
const spot = await page.evaluate(() => [topple.draw.at(60, 148, 6), topple.draw.at(230, 148, 6)]);
await page.waitForTimeout(Math.max(0, shut + 500 - Date.now()));
await tap({ x: spot[0].x, y: spot[0].y + 120 });
assert.equal(await left(), 19, 'a tap on the glass half a second after Play drops a coin');
await reloaded();
await page.mouse.move(spot[0].x, spot[0].y + 120);
await page.mouse.down();
await page.mouse.move(spot[1].x, spot[1].y + 140, { steps: 5 });
assert.equal(await left(), 19, 'nothing drops while the finger is down');
await page.mouse.up();
assert.equal(await left(), 18);
await page.waitForTimeout(400);
const landed = await page.evaluate(() => topple.machine.pieces.filter(p => p.layer === 'shelf').map(p => p.position.x));
assert.ok(landed.some(x => Math.abs(x - 230) < 22), 'the coin landed on the shelf under where the finger let go');

// The drop button drops one where the chute is; the chute has to reload between coins.
await reloaded();
await page.evaluate(() => { document.getElementById('drop').click(); document.getElementById('drop').click(); });
assert.equal(await left(), 17, 'two presses straight after each other drop one coin');

// The keyboard: arrows move the chute, Space drops. Once a key's been pressed, the deck says how on a keyboard.
await reloaded();
assert.equal(await page.textContent('.deck .say'), 'Touch the glass to aim');
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
await page.keyboard.press(' ');
assert.equal(await left(), 16);
assert.equal(await page.textContent('.deck .say'), '← → aim, Space drops');

// A prize nudged over the edge goes on the shelf, and the attendant puts another one on.
const prize = await page.evaluate(() => { const p = topple.machine.pieces.find(p => p.kind === 'prize'); window.Matter.Body.setPosition(p, { x: 150, y: 252 }); return p.prize; });
await page.waitForFunction(() => !topple.machine.pieces.some(p => p.kind === 'prize'));
assert.match(await page.textContent('.fp-toast'), /^You won a/);
const shelf = await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).prizes);
assert.equal(shelf['trinket-' + prize], 1, 'the prize is on the arcade\'s shelf');
await page.waitForFunction(() => topple.machine.pieces.some(p => p.kind === 'prize'), null, { timeout: 5000 });
await page.waitForFunction(() => document.getElementById('live').textContent === 'Another prize is on the pusher.', null, { timeout: 1000 });
assert.deepEqual(await page.evaluate(() => topple.cup.prizes), [prize], 'the cup keeps the prize it won, for its card');

// The back wall's sign sits under the pockets, where the chute's carriage never covers it, wherever it's aimed.
const wall = await page.evaluate(() => {
  const s = topple.draw.sign(), hit = [];
  for (let x = 12; x <= 288; x += 4) { const c = topple.draw.chute(x); if (c.x < s.x + s.w && s.x < c.x + c.w && c.y < s.y + s.h && s.y < c.y + c.h) hit.push(x); }
  return hit;
});
assert.deepEqual(wall, [], 'the chute covers the sign at these aims');

// Every two coins over the front edge are a ticket, paid as the second goes over, and a gold coin is ten.
await page.evaluate(() => { topple.speed = 4; });
while (await left() > 3) { await reloaded(); await page.evaluate(() => topple.drop(40 + Math.random() * 220)); }
// (read together: coins are still going over while the test looks)
const [mid, shown, over] = await page.evaluate(() => [topple.cup.won, document.getElementById('won').textContent,
  { ...__over, odd: topple.saved.odd, tickets: JSON.parse(localStorage.getItem('free-play.wallet')).tickets }]);
assert.ok(mid > 0, 'some coins have gone over the edge');
assert.equal(shown, String(mid), 'the scoreboard shows this cup\'s tickets');
assert.ok(over.coin > 2, `${over.coin} coins went over the front edge`);
assert.equal(over.tickets - counting.tickets, Math.floor((counting.odd + over.coin) / 2) + 10 * over.gold, `${over.coin} coins and ${over.gold} gold ones over the edge, after ${counting.odd} waiting`);
assert.equal(over.odd, (counting.odd + over.coin) % 2, 'an odd coin waits for the next');

// The cup keeps between visits: the page comes back with the same coins left, and the deck as it was.
// The machine stands still while the deck is counted, so nothing goes over between the count and the reload.
await page.evaluate(() => { topple.speed = 0; });
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const pieces = await page.evaluate(() => topple.machine.pieces.length);
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.textContent('#play'), 'Carry on');
assert.equal(await left(), 3);
assert.ok(Math.abs(await page.evaluate(() => topple.machine.pieces.length) - pieces) <= 4, 'the coins on the deck came back');
assert.deepEqual(await page.evaluate(() => topple.cup.prizes), [prize], 'and so did the prize the cup won');
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
// Leaving the page mid-cup saves the deck and opens the menu, so the shelf waits there for the player to come back.
await page.evaluate(() => localStorage.removeItem('free-play.topple'));
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-cup did not open the menu');
assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.topple'))?.field), 'leaving the page did not save the deck');
const away = await page.evaluate(() => topple.machine.lip);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => topple.machine.lip), away, 'the shelf runs on behind the menu');
await hide(false);
await page.click('#resume');

// The last coins, and the cup's done once the pile goes quiet: the card says what it paid. (After cups with a best of 1.)
await page.evaluate(() => { topple.speed = 4; Object.assign(topple.saved, { best: 1, cups: 2 }); });
while (await left() > 0) { await reloaded(); await page.evaluate(() => topple.drop(150)); }
assert.ok(await page.isDisabled('#drop'), 'an empty cup has nothing to drop');
await page.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 20000 });
const won = Number((await page.textContent('#overT')).match(/(\d+) tickets?$/)[1]);
assert.ok(won >= mid);
assert.equal(await page.textContent('#live'), `The cup's empty: ${won} ${won === 1 ? 'ticket' : 'tickets'}.`, 'what a screen reader hears as the cup ends');
assert.ok(await tickets() >= won, 'the tickets are in the wallet');
assert.equal(await page.evaluate(() => topple.saved.cups), 3);
assert.deepEqual(await bestLine(), { text: 'A new best cup! The old one was 1 ticket.', big: true, size: '18px' });
// the prize it pushed off mid-cup is on its card too
const trinket = TRINKETS.find(t => t.kind === prize);
assert.equal(await page.textContent('#overPrize'), `And ${trinket.say} for your shelf.${trinket.emoji}`);
assert.ok(await page.isVisible('#overPrize'));
await page.waitForFunction(() => topple.glow > 0, null, { timeout: 4000 }); // the sign's bulbs blaze for it, once the tickets are out
// Coins the pile still pushes over while the card is up count for the cup: two nudged over the edge now (a ticket's
// worth, whatever was waiting), and any the shelf pushes. Once the deck is quiet, the card says what the pocket got.
// (Read together, in case one more goes over while the test looks.)
await page.evaluate(() => { for (const [i, c] of topple.machine.pieces.filter(p => p.layer === 'deck' && p.kind === 'coin').slice(0, 2).entries()) window.Matter.Body.setPosition(c, { x: 130 + i * 40, y: 252 }); });
await page.waitForFunction(n => Number(document.getElementById('overT').textContent.match(/(\d+) tickets?$/)[1]) > n, won, { timeout: 5000 });
await page.waitForTimeout(3000);
const [pocket, card, scoreboard, best] = await page.evaluate(() => [JSON.parse(localStorage.getItem('free-play.wallet')).tickets,
  Number(document.getElementById('overT').textContent.match(/(\d+) tickets?$/)[1]), document.getElementById('won').textContent, topple.saved.best]);
assert.equal(pocket - atStart, card, 'the card counts every ticket the cup paid');
assert.equal(scoreboard, String(card), "the scoreboard keeps the cup's figure while its card is up");
assert.equal(best, card, 'and the best cup is all of it');
await page.waitForFunction(n => document.querySelector('#over .fp-won b').textContent === String(n), card, { timeout: 5000 });
await page.click('#again');
assert.equal(await left(), 20, 'another cup');
assert.deepEqual(await page.evaluate(() => topple.cup.prizes), [], 'with no prizes yet');
// A prize pushed off the side goes to the house, and isn't the cup's.
await page.evaluate(() => { const p = topple.machine.pieces.find(p => p.kind === 'prize'); window.Matter.Body.setPosition(p, { x: -8, y: 215 }); });
await page.waitForFunction(() => /went down the side/.test(document.querySelector('.fp-toast')?.textContent || ''), null, { timeout: 5000 });
assert.deepEqual(await page.evaluate(() => topple.cup.prizes), [], 'a prize down the side is not won');

// Leaving the page hushes the pusher's motor, and the sound sleeps until the page is back.
await page.click('#menuBtn');
await page.waitForSelector('#menu:not([hidden])', { timeout: 3000 });
await page.click('#sound');
assert.equal(await page.evaluate(() => topple.saved.sound), true);
await page.click('#resume');
await page.waitForFunction(() => window.__loops[0]?.gain.value > 0.02, null, { timeout: 3000 });
await hide(true);
await page.waitForFunction(() => window.__loops[0].context.state === 'suspended', null, { timeout: 2000 });
assert.equal((await audio()).loop, 0, 'the motor hums on with the page out of sight');
await hide(false);
await page.waitForFunction(() => window.__loops[0].context.state === 'running', null, { timeout: 2000 });
await page.click('#resume');

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
