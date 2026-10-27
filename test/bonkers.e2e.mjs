// Plays Bonkers, on the Free Play floor, in Chromium through the real page:  node test/bonkers.e2e.mjs  (needs Playwright)
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
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });

await page.goto(base + 'bonkers/');
await page.evaluate(() => document.fonts.ready);
const tickets = () => page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets);
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
// Which cards are up.
const cards = () => page.evaluate(() => ['title', 'over', 'menu', 'choose'].filter(id => document.getElementById(id)?.hidden === false));
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
// The best line under the dispenser: what it says, whether it's dressed as a new best, and how big its headline is.
const bestLine = () => page.evaluate(() => { const e = document.getElementById('overBest'); return { text: e.textContent, big: e.classList.contains('fp-best'), size: getComputedStyle(e.querySelector('b') || e).fontSize }; });
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
const HOLES = [50, 150, 250, 350, 450];
// The hole a mole is up in right now (a bare-headed one, unless any will do), waiting for one if need be.
const upHole = (any = false) => page.waitForFunction(any => {
  const m = bonkers.burrow.moles.find(m => m.state === 'rising' && m.rise > 0.6 && (any || !m.hat));
  return m ? m.hole + 1 : 0;
}, any, { timeout: 15000, polling: 16 }).then(h => h.jsonValue()).then(n => n - 1);

// The title card, and the moles already about their business behind it.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
await page.click('#play');
assert.equal(await page.textContent('#left'), '45');

// A tap on a mole that's up bonks it.
let hole = await upHole();
let p = await page.evaluate(h => bonkers.draw.at(h, -40), HOLES[hole]);
await page.mouse.click(p.x, p.y);
assert.equal(await page.evaluate(() => bonkers.burrow.bonks), 1);
assert.ok(await page.evaluate(() => bonkers.burrow.score) >= 10);
assert.match(await page.textContent('#score'), /^[1-9]/, 'the scoreboard shows it');

// A tap on an empty hole is a miss, and a tap down in the ground isn't a swing at all.
const before = await page.evaluate(() => bonkers.burrow.swings);
const empty = await page.evaluate(() => [0, 1, 2, 3, 4].find(i => !bonkers.burrow.moles.some(m => m.hole === i)));
p = await page.evaluate(h => bonkers.draw.at(h, -40), HOLES[empty]);
await page.mouse.click(p.x, p.y);
assert.equal(await page.evaluate(() => bonkers.burrow.swings), before + 1);
assert.equal(await page.evaluate(() => bonkers.burrow.run), 0, 'a miss ends the run');
p = await page.evaluate(() => bonkers.draw.at(250, 200));
await page.mouse.click(p.x, p.y);
assert.equal(await page.evaluate(() => bonkers.burrow.swings), before + 1, 'the ground under the lawn is not a hole');

// The scoreboard is only redone when something changes, and the pocket only read when it does.
const load = await busy();
assert.ok(load.reads === 0 && load.muts < 20, `a second of play read the pocket ${load.reads} times and rewrote the scoreboard ${load.muts} times`);

// The number keys swing at the holes.
hole = await upHole();
const bonks = await page.evaluate(() => bonkers.burrow.bonks);
await page.keyboard.press(String(hole + 1));
assert.equal(await page.evaluate(() => bonkers.burrow.bonks), bonks + 1);

// The menu stops the clock.
await page.keyboard.press('Escape');
assert.ok(await page.isVisible('#menu'));
const clock = await page.evaluate(() => bonkers.burrow.clock);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => bonkers.burrow.clock), clock, 'the moles wait while the menu is open');
await page.click('#sound');
assert.equal(await page.evaluate(() => bonkers.saved.sound), false);
await page.click('#sound');
assert.equal(await page.evaluate(() => bonkers.saved.sound), true, 'and on again');
await page.click('#resume');
// Leaving the page mid-round opens the menu, so the moles wait there for the player to come back.
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-round did not open the menu');
const away = await page.evaluate(() => bonkers.burrow.clock);
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => bonkers.burrow.clock), away, 'the moles run on behind the menu');
await hide(false);
await page.click('#resume');

// The rest of the round, quickly, and its tickets: one for every 15 points.
const t0 = await tickets();
await page.evaluate(() => { bonkers.speed = 4; __sounds.length = 0; });
let frenzy = false, shown = false;
while (!(await page.evaluate(() => bonkers.burrow.over))) {
  frenzy ||= await page.evaluate(() => document.querySelector('.clock').classList.contains('frenzy'));
  shown ||= await page.evaluate(() => bonkers.pops.some(p => p.text === 'Frenzy!'));
  await page.evaluate(() => { const m = bonkers.burrow.moles.find(m => m.state === 'rising' && m.rise > 0.6); if (m) bonkers.swing([50, 150, 250, 350, 450][m.hole], -40); });
  await page.waitForTimeout(30);
}
assert.ok(frenzy, 'the clock says when it is a frenzy');
assert.ok(shown, 'and so does the lawn, in words');
assert.equal(await page.evaluate(() => __sounds.filter(s => s[0] === 'count').length), 5, 'a beep for each of the last five seconds');
const score = await page.evaluate(() => bonkers.burrow.score);
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
await countsAlong(await tickets(), Math.floor(score / 15));
assert.ok(score > 200, `a quick hand scores (${score})`);
assert.equal(await page.textContent('#overT'), `${score.toLocaleString('en-US')} points`);
await page.waitForFunction(t => document.getElementById('live').textContent === t, `${score.toLocaleString('en-US')} points. ${Math.floor(score / 15)} tickets.`, { timeout: 2000 }).catch(() => {});
assert.equal(await page.textContent('#live'), `${score.toLocaleString('en-US')} points. ${Math.floor(score / 15)} tickets.`, 'what a screen reader hears at the end of the round');
assert.equal(await tickets(), t0 + Math.floor(score / 15));
assert.equal(await page.evaluate(() => bonkers.saved.best), score);
assert.deepEqual(await bestLine(), { text: `Best: ${score.toLocaleString('en-US')}.`, big: false, size: '13px' }, 'a first round is never a new best');
// Behind the card the moles carry on, but the scoreboard keeps the round's score, whatever redraws it.
await page.waitForTimeout(300);
await page.evaluate(() => { dispatchEvent(new Event('free-play:wallet')); dispatchEvent(new Event('pageshow')); });
assert.equal(await page.textContent('#score'), score.toLocaleString('en-US'), 'the scoreboard went back to 0 behind the end card');
await page.click('#again');
assert.equal(await page.textContent('#score'), '0');
assert.equal(await page.textContent('#left'), '45', 'another round, another 45 seconds');

// A wide screen: the cabinet in the middle, the clock beside it, nothing sideways.
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(100);
const wide = await page.evaluate(() => ({ cab: bonkers.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(wide.deck.left >= wide.cab.left + wide.cab.width, 'the clock stands beside the cabinet');
assert.ok(wide.sw <= 1280 && wide.deck.right <= 1280);
await page.setViewportSize({ width: 360, height: 640 });
await page.waitForTimeout(100);
const small = await page.evaluate(() => ({ cab: bonkers.draw.cabinet(), deck: document.getElementById('deck').getBoundingClientRect().toJSON(), sw: document.documentElement.scrollWidth }));
assert.ok(small.deck.top >= small.cab.bottom - 4 && small.deck.bottom <= 640, 'on a small phone the clock sits under the cabinet, on screen');
assert.ok(small.sw <= 360);
await page.setViewportSize({ width: 390, height: 844 });

// Back on the floor, Bonkers' cabinet has the best round.
await page.goto(base);
assert.equal(await page.textContent('#bonkersStat'), `Best: ${score.toLocaleString('en-US')}.`);

// The menu opened in the moment between the buzzer and the end card, by Escape or by leaving the page, holds the card
// back: only the menu shows, and after Keep playing the end card comes up by itself, with its buttons working.
await page.goto(base + 'bonkers/');
await page.click('#play');
for (const leave of ['Escape', 'hide']) {
  await page.evaluate(() => { bonkers.speed = 20; });
  await page.waitForFunction(() => bonkers.burrow.left < 3, null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => { bonkers.speed = 1; });
  await page.waitForFunction(() => bonkers.burrow.over, null, { timeout: 5000, polling: 'raf' });
  if (leave === 'Escape') await page.keyboard.press('Escape'); else await hide(true);
  await page.waitForTimeout(1300);
  assert.deepEqual(await cards(), ['menu'], `after ${leave} at the buzzer, only the menu shows`);
  if (leave === 'hide') await hide(false);
  await page.click('#resume');
  await page.waitForSelector('#over:not([hidden])', { timeout: 3000 });
  assert.deepEqual(await cards(), ['over'], `after ${leave} and Keep playing, the end card shows by itself`);
  await page.click('#again');
  assert.equal(await page.evaluate(() => bonkers.mode), 'play', 'Play again works');
  assert.deepEqual(await cards(), []);
}
// Leaving by the menu's Back to the arcade in that moment still pays the round: it was over, and its tickets and its
// count go in as the page goes.
{
  await page.evaluate(() => { bonkers.speed = 20; });
  await page.waitForFunction(() => bonkers.burrow.left < 3, null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => { bonkers.speed = 1; });
  await page.waitForFunction(() => bonkers.burrow.over, null, { timeout: 5000, polling: 'raf' });
  await page.keyboard.press('Escape');
  assert.deepEqual(await cards(), ['menu']);
  const gap = await page.evaluate(() => ({ score: bonkers.burrow.score, rounds: bonkers.saved.rounds }));
  const had = await tickets();
  await page.click('#menu a.to-floor');
  await page.waitForSelector('#bonkersStat');
  assert.equal(await tickets(), had + Math.floor(gap.score / 15), 'a round left as its end card came still pays');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.bonkers')).rounds), gap.rounds + 1, 'and counts');
  await page.goto(base + 'bonkers/');
  await page.click('#play');
}

// A round that beats the best from before says so, big and in gold, with the old best in it.
await page.evaluate(() => { bonkers.saved.best = 20; bonkers.speed = 6; });
while (!(await page.evaluate(() => bonkers.burrow.over))) {
  await page.evaluate(() => { const m = bonkers.burrow.moles.find(m => m.state === 'rising' && m.rise > 0.6); if (m) bonkers.swing([50, 150, 250, 350, 450][m.hole], -40); });
  await page.waitForTimeout(30);
}
const beat = await page.evaluate(() => bonkers.burrow.score);
assert.ok(beat > 20, 'the round beat 20');
await page.waitForSelector('#over:not([hidden])', { timeout: 5000 });
assert.deepEqual(await bestLine(), { text: 'A new best! Your old one was 20.', big: true, size: '18px' });
// Another round straight away, before the strip's done, and the pocket holds all the round's tickets at once.
assert.ok((await pocketNow())[1] < Math.floor(beat / 15), 'the strip was done before Another round');
await page.click('#again');
assert.equal((await pocketNow())[0], await tickets(), 'another round started part-way through the strip, and the pocket holds them all');
assert.ok(await page.evaluate(() => document.getElementById('tixBtn').classList.contains('bump')));

assert.deepEqual(problems, [], 'problems while playing');
await browser.close();
server.close();
console.log(`all good (a round scored ${score})`);
