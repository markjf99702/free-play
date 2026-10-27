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
// Which of the page's sounds play: the function in its sound.js each tone or noise is made for, and when.
await ctx.addInitScript(() => {
  window.__sounds = [];
  for (const k of ['createOscillator', 'createBufferSource']) {
    const make = AudioContext.prototype[k];
    AudioContext.prototype[k] = function () {
      const at = /at (?:Module\.)?(\w+) \([^)]*\/js\/sound\.js/.exec(new Error().stack.split('\n').filter(l => !/at (tone|burst|bell|env|noise|white|chink) /.test(l)).join('\n'));
      const now = performance.now(), last = window.__sounds.at(-1);
      if (at && !(last && last[0] === at[1] && now - last[1] < 2)) window.__sounds.push([at[1], now]);
      return make.call(this);
    };
  }
});
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
// Which cards are up.
const cards = () => page.evaluate(() => ['title', 'over', 'menu', 'choose'].filter(id => document.getElementById(id)?.hidden === false));
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
// How busy the scoreboard keeps the page over a second of play: lines rewritten, and reads of the pocket.
const busy = () => page.evaluate(async () => {
  let reads = 0, muts = 0;
  const get = Storage.prototype.getItem;
  Storage.prototype.getItem = function (k) { if (k === 'free-play.wallet') reads++; return get.call(this, k); };
  const mo = new MutationObserver(l => { muts += l.length; });
  mo.observe(document.querySelector('.hud'), { subtree: true, childList: true, characterData: true, attributes: true });
  mo.observe(document.getElementById('deck'), { subtree: true, childList: true, characterData: true, attributes: true });
  await new Promise(r => setTimeout(r, 1000));
  mo.disconnect();
  Storage.prototype.getItem = get;
  return { reads, muts };
});
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

// The scoreboard is only redone when something changes, and the pocket only read when it does.
await page.waitForFunction(() => !hoops.court.balls.some(b => b.shot), null, { timeout: 6000 });
const load = await busy();
assert.ok(load.reads === 0 && load.muts < 20, `a second of play read the pocket ${load.reads} times and rewrote the scoreboard ${load.muts} times`);

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
await page.click('#sound');
assert.equal(await page.evaluate(() => hoops.saved.sound), true, 'and on again');
await page.click('#resume');
// Leaving the page mid-round opens the menu, so the clock waits there for the player to come back.
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-round did not open the menu');
const away = await court('clock');
await page.waitForTimeout(300);
assert.equal(await court('clock'), away, 'the clock runs on behind the menu');
await hide(false);
await page.click('#resume');

// The rest of the round, quickly, aiming where the hoop will be, and its tickets: one for every 4 points. (After
// rounds with a best of 10.)
await page.evaluate(() => Object.assign(hoops.saved, { best: 10, rounds: 2 }));
const t0 = await tickets();
await page.evaluate(() => { hoops.speed = 4; __sounds.length = 0; });
let bonus = false, lit = false, most = 0;
const high = [];
while (!(await court('over'))) {
  bonus ||= await page.evaluate(() => document.getElementById('worthBox').classList.contains('bonus'));
  // the words over the hoop: no more than two at once, and none up on the scoreboard
  const w = await page.evaluate(() => ({ n: hoops.pops.length, lamp: hoops.draw.lamps.bonus, ...hoops.draw.words }));
  most = Math.max(most, w.n); lit ||= w.lamp;
  for (const l of w.laid) if (l.top < w.foot) high.push(`${l.text} at ${l.top.toFixed(0)}, over ${w.foot.toFixed(0)}`);
  await page.evaluate(() => {
    const c = hoops.court;
    if (!c.pocket() || c.buzzer) return;
    const x = c.hoop.amp * Math.sin(c.hoop.phase + 2 * Math.PI * 0.78 / (c.bonus ? 4 : 5.5));
    hoops.shoot(hoops.sweet(), hoops.aimAt(x));
  });
  await page.waitForTimeout(40);
}
assert.ok(bonus, 'the deck says when a basket is worth 3');
assert.ok(lit, 'and so does the 3 PTS lamp');
assert.ok(most <= 2, `${most} words over the hoop at once`);
assert.deepEqual(high, [], 'words up on the scoreboard');
// After the buzzer the lamps go out: a basket is worth what the deck says again.
await page.waitForTimeout(100);
assert.deepEqual(await page.evaluate(() => ({ ...hoops.draw.lamps })), { bonus: false, hot: false }, 'the lamps are still lit after the buzzer');
assert.equal(await page.evaluate(() => __sounds.filter(s => s[0] === 'count').length), 5, 'a beep for each of the last five seconds');
const score = await court('score');
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
await countsAlong(await tickets(), Math.floor(score / 4));
assert.ok(score > 40, `a steady hand scores (${score})`);
assert.equal(await page.textContent('#overT'), `${score.toLocaleString('en-US')} points`);
assert.match(await page.textContent('#overHow'), /^\d+ baskets? from \d+ shots?/);
assert.equal(await tickets(), t0 + Math.floor(score / 4));
assert.equal(await page.evaluate(() => hoops.saved.best), score);
assert.deepEqual(await bestLine(), { text: 'A new best! Your old one was 10.', big: true, size: '18px' });
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

// The menu opened in the moment between the buzzer and the end card, by Escape or by leaving the page, holds the card
// back: only the menu shows, and after Keep playing the end card comes up by itself, with its buttons working.
await page.goto(base + 'hoops/');
await page.click('#play');
for (const leave of ['Escape', 'hide']) {
  await page.evaluate(() => { hoops.speed = 20; });
  await page.waitForFunction(() => hoops.court.left < 3, null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => { hoops.speed = 1; });
  await page.waitForFunction(() => hoops.court.over, null, { timeout: 8000, polling: 'raf' });
  if (leave === 'Escape') await page.keyboard.press('Escape'); else await hide(true);
  await page.waitForTimeout(1100);
  assert.deepEqual(await cards(), ['menu'], `after ${leave} at the buzzer, only the menu shows`);
  if (leave === 'hide') await hide(false);
  await page.click('#resume');
  await page.waitForSelector('#over:not([hidden])', { timeout: 3000 });
  assert.deepEqual(await cards(), ['over'], `after ${leave} and Keep playing, the end card shows by itself`);
  await page.click('#again');
  assert.equal(await page.evaluate(() => hoops.mode), 'play', 'Play again works');
  assert.deepEqual(await cards(), []);
}

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log(`all good (a round scored ${score})`);
