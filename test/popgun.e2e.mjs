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
// Which of the page's sounds play: the function in its sound.js each tone or noise is made for, and when.
await ctx.addInitScript(() => {
  window.__sounds = [];
  for (const k of ['createOscillator', 'createBufferSource']) {
    const make = AudioContext.prototype[k];
    AudioContext.prototype[k] = function () {
      const at = /at (?:Module\.)?(\w+) \([^)]*\/js\/sound\.js/.exec(new Error().stack.split('\n').filter(l => !/at (tone|burst|bell|env|noise|white|chink) /.test(l)).join('\n'));
      if (at) window.__sounds.push([at[1], performance.now()]);
      return make.call(this);
    };
  }
});
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

await page.goto(base + 'popgun/');
await page.evaluate(() => document.fonts.ready);
const corks = () => page.evaluate(() => popgun.gallery.corks);
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
// Which cards are up.
const cards = () => page.evaluate(() => ['title', 'over', 'menu', 'choose'].filter(id => document.getElementById(id)?.hidden === false));
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

// A real finger's tap, as a phone sends it: down, and up 40 ms later.
const cdp = await ctx.newCDPSession(page);
async function tap({ x, y }) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const middle = sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);

// The title card, and the targets already running behind it.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
await page.click('#play');
assert.equal(await corks(), 20);
assert.equal(await page.locator('#tray i').count(), 20, 'twenty corks on the counter');

// A tap ahead of a duck knocks it down. (A tap this soon after Play is taken for the second tap of a double tap on it,
// below, so the test waits a moment first.)
await page.waitForTimeout(400);
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
const twice = await page.evaluate(() => { const shots = [popgun.fire(200, 200), popgun.fire(200, 200)]; return [...shots, popgun.jogging, __sounds.some(s => s[0] === 'dry')]; });
assert.equal(await corks(), 18, 'two shots straight after each other fire one cork');
assert.deepEqual(twice, [true, false, true, true], 'the second, while the gun reloads, is a dry click and a jog of the gun');

// With a mouse the sights follow it; the keyboard moves them and fires.
p = await page.evaluate(() => popgun.draw.at(280, 250));
await page.mouse.move(p.x, p.y);
assert.ok(await page.evaluate(() => document.getElementById('stage').classList.contains('aiming')), 'the pointer becomes the sights');
await ready();
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(150); await page.keyboard.up('ArrowUp');
await page.keyboard.press(' ');
assert.equal(await corks(), 17);

// The prize counter, opened mid-round and shut with Escape: Space fires again, rather than opening it again.
await page.click('#tixBtn');
assert.ok(await page.isVisible('.fp-sheet'));
await page.keyboard.press('Escape');
assert.ok(await page.isHidden('.fp-sheet'));
await ready();
await page.keyboard.press(' ');
assert.ok(await page.isHidden('.fp-sheet'), 'Space after the counter opened it again');
assert.equal(await corks(), 16, 'Space after the counter fires a cork');

// The menu stops the conveyors.
await page.keyboard.press('Escape');
assert.ok(await page.isVisible('#menu'));
const xs = await page.evaluate(() => popgun.gallery.rows[0].targets[0].x);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => popgun.gallery.rows[0].targets[0].x), xs, 'the targets wait while the menu is open');
await page.click('#sound');
assert.equal(await page.evaluate(() => popgun.saved.sound), false);
await page.click('#resume');
// Leaving the page mid-round opens the menu, so the targets wait there for the player to come back.
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-round did not open the menu');
const away = await page.evaluate(() => popgun.gallery.rows[0].targets[0].x);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => popgun.gallery.rows[0].targets[0].x), away, 'the targets run on behind the menu');
await hide(false);
await page.click('#resume');

// The rest of the corks, and the round's over: a ticket for every 30 points. (After rounds with a best of 40.)
await page.evaluate(() => Object.assign(popgun.saved, { best: 40, rounds: 2 }));
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
await countsAlong(await tickets(), Math.floor(score / 30));
assert.ok(score > 100, `a steady hand scores (${score})`);
assert.ok(await page.isHidden('#overTip'), 'a round led well has nothing to say about aiming ahead');
assert.equal(await page.textContent('#overT'), `${score.toLocaleString('en-US')} points`);
await page.waitForFunction(t => document.getElementById('live').textContent === t, `${score.toLocaleString('en-US')} points. ${Math.floor(score / 30)} tickets.`, { timeout: 2000 }).catch(() => {});
assert.equal(await page.textContent('#live'), `${score.toLocaleString('en-US')} points. ${Math.floor(score / 30)} tickets.`, 'what a screen reader hears at the end of the round');
assert.equal(await tickets(), t0 + Math.floor(score / 30));
assert.equal(await page.evaluate(() => popgun.saved.best), score);
// a new best, said big and in gold, and the sign's bulbs blaze for it once the tickets are out
assert.deepEqual(await bestLine(), { text: 'A new best! Your old one was 40.', big: true, size: '18px' });
await page.waitForFunction(n => document.querySelector('#over .fp-won b').textContent === String(n), Math.floor(score / 30), { timeout: 8000 });
await page.waitForFunction(() => popgun.glow > 0, null, { timeout: 1000 });
// A quick double tap on Another round starts it: the second tap lands on the booth where the button was, and doesn't
// fire a cork.
await page.evaluate(() => { window.__downs = []; document.getElementById('stage').addEventListener('pointerdown', () => __downs.push(performance.now())); document.getElementById('again').addEventListener('click', () => { window.__again = performance.now(); }); });
const again = await middle('#again');
await tap(again);
const shut = Date.now();
await page.waitForTimeout(110);
await tap(again);
await page.waitForTimeout(300);
const second = await page.evaluate(() => __downs.map(t => Math.round(t - __again)));
assert.equal(second.length, 1, 'the second tap landed on the booth');
assert.deepEqual(await page.evaluate(() => [popgun.gallery.corks, popgun.gallery.shots]), [20, 0], `the second tap of a double tap on Another round, ${second[0]} ms after the first, fired a cork`);
assert.equal(await page.textContent('#score'), '0');
// A tap on the booth half a second after the card went is a shot like any other.
await page.waitForTimeout(Math.max(0, shut + 500 - Date.now()));
await tap(await page.evaluate(() => popgun.draw.at(280, 250)));
assert.deepEqual(await page.evaluate(() => [popgun.gallery.corks, popgun.gallery.shots]), [19, 1], 'a tap on the booth half a second after Another round fires a cork');

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

// The menu opened in the moment between the last cork landing and the end card, by Escape or by leaving the page,
// holds the card back: only the menu shows, and after Keep playing the end card comes up by itself, buttons working.
await page.goto(base + 'popgun/');
await page.click('#play');
for (const leave of ['Escape', 'hide']) {
  await page.evaluate(() => { popgun.speed = 10; });
  while (!(await page.evaluate(() => popgun.gallery.over))) {
    await page.waitForFunction(() => popgun.gallery.ready || !popgun.gallery.corks, null, { timeout: 5000, polling: 'raf' });
    // the last cork fired, the clock goes back to normal speed for the moment it takes to land
    await page.evaluate(() => { if (popgun.gallery.ready) popgun.fire(280, 250); if (!popgun.gallery.corks) popgun.speed = 1; });
  }
  if (leave === 'Escape') await page.keyboard.press('Escape'); else await hide(true);
  await page.waitForTimeout(1100);
  assert.deepEqual(await cards(), ['menu'], `after ${leave} as the last cork landed, only the menu shows`);
  if (leave === 'hide') await hide(false);
  await page.click('#resume');
  await page.waitForSelector('#over:not([hidden])', { timeout: 3000 });
  assert.deepEqual(await cards(), ['over'], `after ${leave} and Keep playing, the end card shows by itself`);
  await page.click('#again');
  assert.equal(await page.evaluate(() => popgun.mode), 'play', 'Play again works');
  assert.deepEqual(await cards(), []);
}
// Leaving by the menu's Back to the arcade in that moment still pays the round: it was over, and its tickets and its
// count go in as the page goes.
await page.evaluate(() => { popgun.speed = 10; });
while (!(await page.evaluate(() => popgun.gallery.over))) {
  await page.waitForFunction(() => popgun.gallery.ready || !popgun.gallery.corks, null, { timeout: 5000, polling: 'raf' });
  await page.evaluate(() => { if (popgun.gallery.ready) popgun.fire(280, 250); if (!popgun.gallery.corks) popgun.speed = 1; });
}
await page.keyboard.press('Escape');
assert.deepEqual(await cards(), ['menu']);
const gap = await page.evaluate(() => ({ score: popgun.gallery.score, rounds: popgun.saved.rounds }));
const hadGap = await tickets();
await page.click('#menu a.to-floor');
await page.waitForSelector('#popgunStat');
assert.equal(await tickets(), hadGap + Math.floor(gap.score / 30), 'a round left as its end card came still pays');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.popgun')).rounds), gap.rounds + 1, 'and counts');
// (and back with the sound on, for listening behind the next end card)
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('free-play.popgun')); localStorage.setItem('free-play.popgun', JSON.stringify({ ...s, sound: true })); });
await page.goto(base + 'popgun/');
await page.click('#play');

// A round of one hit says so in the singular, and a round that pays no ticket says how far off one it was: one duck,
// and the other nineteen corks at the moon. (After rounds of 900 and 50: it goes third on the list.)
await page.evaluate(() => { Object.assign(popgun.saved, { best: 900, top: [{ score: 900, date: '2026-10-01' }, { score: 50, date: '2026-10-02' }] }); popgun.speed = 3; });
while (!(await page.evaluate(() => popgun.gallery.over))) {
  await page.waitForFunction(() => popgun.gallery.ready || popgun.gallery.over);
  await page.evaluate(() => {
    const g = popgun.gallery, row = g.rows[2];
    const duck = g.hits ? null : row.targets.find(t => !t.hit && t.kind === 'duck' && t.x + row.dir * row.now * 0.32 > 60 && t.x + row.dir * row.now * 0.32 < 500);
    if (duck) popgun.fire(duck.x + row.dir * row.now * 0.32, row.rail - 22);
    else if (g.hits) popgun.fire(560 - 92, 70);
  });
  await page.waitForTimeout(20);
}
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
const [hit, scored] = await page.evaluate(() => [popgun.gallery.hits, popgun.gallery.score]);
assert.deepEqual([hit, scored], [1, 10], 'one duck hit, and nothing else');
assert.equal(await page.textContent('#overHow'), "1 hit from 20 corks. Twenty more points and it's a ticket.");
assert.equal(await page.textContent('#overBest'), 'Number 3 on your list. Best: 900.');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.popgun')).top.map(e => e.score)), [900, 50, 10]);
// Behind the end card the booth goes on turning, quietly: a golden duck or a bell coming round doesn't chime there.
assert.equal(await page.evaluate(() => popgun.saved.sound), true, 'the sound is on');
await page.evaluate(() => { window.__sounds.length = 0; popgun.speed = 10; });
await page.waitForTimeout(6000);
assert.deepEqual(await page.evaluate(() => window.__sounds.filter(([f]) => f === 'arrive').length), 0, 'arrivals chimed behind the end card');
assert.ok(await page.isHidden('#overTip'), "corks at the moon weren't behind anything");

// A round fired dead on the targets as they are: the corks land behind them, and the end card says to aim further ahead.
await page.click('#again');
await page.evaluate(() => { popgun.speed = 3; });
while (!(await page.evaluate(() => popgun.gallery.over))) {
  await page.waitForFunction(() => popgun.gallery.ready || popgun.gallery.over);
  await page.evaluate(() => {
    const row = popgun.gallery.rows[0], star = row.targets.find(t => !t.hit && t.kind === 'star' && t.x > 60 && t.x < 500);
    if (star) popgun.fire(star.x, row.rail - 22); else popgun.fire(560 - 92, 70);
  });
  await page.waitForTimeout(20);
}
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
const behind = await page.evaluate(() => [popgun.gallery.behind, popgun.gallery.shots - popgun.gallery.hits]);
assert.ok(behind[0] * 2 >= behind[1], `${behind[0]} of ${behind[1]} misses landed behind`);
assert.ok(await page.isVisible('#overTip'));
assert.equal(await page.textContent('#overTip'), 'Most corks landed just behind: aim further ahead.');

// Each kind of target's hit shape (gallery.js's TIN) is its picture: drawn by the page's own drawing on a canvas of its
// own, four times over, facing each way, every bit of painted tin counts as a hit and the shape holds no bare air.
// (Its peg on the chain is left out, and so is the golden duck's twinkle: it's the duck's shape.)
const fit = await page.evaluate(async () => {
  const { TIN } = await import(new URL('js/gallery.js', location.href).href);
  const S = 4, out = {};
  for (const kind of ['duck', 'rabbit', 'star', 'bell']) for (const dir of [1, -1]) {
    const canvas = document.createElement('canvas');
    canvas.width = 160 * S; canvas.height = 120 * S;
    const c = canvas.getContext('2d');
    c.setTransform(S, 0, 0, S, 80 * S, 100 * S); // its rail at (80, 100)
    popgun.draw.target(c, kind, 0, 0, dir, 0, 0);
    const px = c.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0, bare = 0, tin = 0, air = 0;
    // every other pixel, each read at its middle
    for (let py = 0; py < canvas.height; py += 2) for (let qx = 0; qx < canvas.width; qx += 2) {
      const x = (qx + 0.5) / S - 80, y = (py + 0.5) / S - 100;
      if (Math.abs(x) <= 8 && y >= -7 && y <= 1) continue; // the peg
      const on = px[(py * canvas.width + qx) * 4 + 3] >= 128;
      const shape = TIN[kind](x * dir, y);
      if (on) { painted++; if (!shape) bare++; }
      if (shape) { tin++; if (!on) air++; }
    }
    out[`${kind}${dir < 0 ? ', facing left' : ''}`] = { painted, bare, tin, air };
  }
  return out;
});
for (const [kind, { painted, bare, tin, air }] of Object.entries(fit)) {
  assert.ok(painted > 1000, `${kind}: drawn`);
  assert.ok(bare / painted < 0.01, `${kind}: ${bare} of ${painted} points of painted tin aren't a hit`);
  assert.ok(air / tin < 0.01, `${kind}: ${air} of ${tin} points of its hit shape are bare air`);
}

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log(`all good (a round scored ${score})`);
