// Plays Roll Up, on the Free Play floor, in Chromium through the real page:  node test/roll-up.e2e.mjs  (needs Playwright)
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
// With `down` set, the server's gone: it drops every connection it's offered. (The browser's offline switch alone
// doesn't stop a service worker's own requests in this Chromium, so it can't show what the offline copy holds.)
let down = false;
const server = createServer(async (req, res) => {
  if (down) { req.socket.destroy(); return; }
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
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

await page.goto(base + 'roll-up/');
await page.evaluate(() => document.fonts.ready);
const mode = () => page.evaluate(() => rollUp.mode);
// The page going out of sight and back (another app, a call, the phone locked), as the browser tells it.
const hide = gone => page.evaluate(gone => {
  if (gone) Object.defineProperty(document, 'hidden', { value: true, configurable: true }); else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, gone);
// What the sound is doing: the audio running or asleep, and how loud the loop is.
const audio = () => page.evaluate(() => ({ state: window.__loops[0]?.context.state, loop: window.__loops[0]?.gain.value }));
const ballOnScreen = () => page.evaluate(() => { const b = rollUp.ball; const s = rollUp.scene.project({ x: b.x, y: b.y, z: b.z }); return { x: s.x, y: s.y }; });

// The title card, then a game.
assert.ok(await page.isVisible('#title'), 'the title card shows first');
await hide(true);
assert.ok(await page.isHidden('#menu'), 'leaving the page from the title card opened the menu');
await hide(false);
// The menu stays shut while a card is up, by the menu button or Escape: the card has its own buttons.
await page.click('#menuBtn');
assert.ok(await page.isHidden('#menu'), 'the menu button opened the menu over the title card');
await page.keyboard.press('Escape');
assert.ok(await page.isHidden('#menu'), 'Escape opened the menu over the title card');
assert.equal(await mode(), 'title');
await page.click('#play');
assert.equal(await mode(), 'aim');
assert.ok(await page.isVisible('#hint'), 'a first-timer is told how to roll');
assert.equal(await page.textContent('#hint'), 'Drag the ball, flick it up the lane');

// A slow drag isn't a throw: the ball goes back behind the line, moved across to where the finger left it.
let at = await ballOnScreen();
await page.mouse.move(at.x, at.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) { await page.mouse.move(at.x + i * 4, at.y - i * 2); await page.waitForTimeout(60); }
await page.mouse.up();
assert.equal(await mode(), 'aim', 'a slow drag should not roll the ball');
const moved = await page.evaluate(() => rollUp.ball.x);
assert.ok(moved > 3, `the ball should move across with the finger (x = ${moved.toFixed(1)})`);

// One pushed slowly over the red line doesn't roll either: it goes back, the line flashes and says why.
at = await ballOnScreen();
await page.mouse.move(at.x, at.y);
await page.mouse.down();
assert.ok(await page.isHidden('#hint'), 'the hint goes while the ball is dragged');
for (let i = 1; i <= 40 && await mode() === 'drag'; i++) { await page.mouse.move(at.x, at.y - i * 6); await page.waitForTimeout(40); }
await page.mouse.up();
assert.equal(await mode(), 'aim', 'a ball pushed slowly over the line should not roll');
assert.ok(await page.evaluate(() => rollUp.fouled > 0), 'the red line flashes');
assert.equal(await page.textContent('#live'), 'Flick it before the red line.');
assert.ok(await page.isVisible('#hint'), 'the hint comes back');

// A flick rolls it up the lane, and it scores.
at = await ballOnScreen();
await page.mouse.move(at.x, at.y);
await page.mouse.down();
for (let i = 1; i <= 7; i++) { await page.mouse.move(at.x, at.y - i * 20); await page.waitForTimeout(12); }
await page.mouse.up();
assert.equal(await mode(), 'roll', 'a flick should roll the ball');
assert.ok(await page.isHidden('#hint'), 'the hint goes once the first ball is rolled');
await page.waitForFunction(() => rollUp.thrown === 1, null, { timeout: 15000 });
const first = await page.evaluate(() => rollUp.score);
assert.ok([0, 10, 20, 30, 40, 50, 100].includes(first), `the first ball scored ${first}`);
assert.match(await page.textContent('#live'), /points/, 'the score is read out');

// A touch up the lane, past where a grab starts, isn't a grab: it says where to start, even after the first ball.
await page.waitForFunction(() => rollUp.mode === 'aim', null, { timeout: 15000 });
assert.ok(await page.isHidden('#hint'));
const upLane = await page.evaluate(() => rollUp.scene.unproject(195, 450));
assert.ok(upLane.z > 108 && upLane.z < 210, `y 450 is on the lane past the grab (z ${upLane.z.toFixed(0)})`);
await page.touchscreen.tap(195, 450);
assert.equal(await mode(), 'aim', 'a touch up the lane is not a grab');
assert.ok(await page.isVisible('#hint'), 'the hint comes back');
assert.equal(await page.textContent('#hint'), 'Start on the ball, then flick');
assert.ok(await page.evaluate(() => rollUp.pinged > 0), 'and a ring pulses round the ball');
await page.waitForFunction(() => document.getElementById('hint').hidden, null, { timeout: 2500 });

// The other eight, quickly. (After games with a best of 50.)
await page.evaluate(() => { rollUp.speed = 6; Object.assign(rollUp.saved, { best: 50, games: 3 }); });
for (let i = 0; i < 8; i++) {
  await page.waitForFunction(() => rollUp.mode === 'aim', null, { timeout: 15000 });
  await page.evaluate(() => rollUp.roll(0, 305, 0));
}
await page.waitForFunction(() => rollUp.mode === 'over', null, { timeout: 30000 });
await page.evaluate(() => { rollUp.speed = 1; });
assert.ok(await page.isVisible('#over'), 'the game-over card shows after nine balls');
await countsAlong(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).tickets), Math.floor((await page.evaluate(() => rollUp.score)) / 10));
await page.click('#menuBtn');
assert.ok(await page.isHidden('#menu'), 'the menu button opened the menu over the game-over card');
await page.keyboard.press('Escape');
assert.ok(await page.isHidden('#menu'), 'Escape opened the menu over the game-over card');
assert.equal(await mode(), 'over');
assert.equal(await page.locator('#tally span').count(), 9, 'it lists all nine balls');
const score = await page.evaluate(() => rollUp.score);
assert.ok(score >= 8 * 20, `eight rolls at 305 should score well (got ${score})`);
// one ball of the nine was golden, and it scored double
const balls = await page.evaluate(() => rollUp.game.balls);
assert.equal(balls.filter(b => b.golden).length, 1, 'one golden ball a game');
for (const b of balls) assert.equal(b.points, b.value * (b.golden ? 2 : 1), 'the golden ball scores double, the rest as they land');
assert.equal(score, balls.reduce((t, b) => t + b.points, 0));
assert.equal(await page.locator('#tally .golden').count(), 1, 'the golden ball stands out in the tally');
const stored = await page.evaluate(() => ({ ...JSON.parse(localStorage.getItem('free-play.roll-up')), ...JSON.parse(localStorage.getItem('free-play.wallet')) }));
assert.equal(stored.tickets, Math.floor(score / 10), "a ticket for every 10 points, into the arcade's wallet");
assert.equal(stored.best, score);
assert.deepEqual(await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('free-play.totals') || '{}'); return [t.rounds, t.tickets]; }), [{ 'roll-up': 1 }, stored.tickets], "the game and its tickets are counted in the arcade's totals");
await page.waitForFunction(t => document.querySelector('.fp-won b').textContent === String(t), stored.tickets, { timeout: 8000 });
assert.ok(await page.evaluate(() => document.querySelector('.fp-strip').offsetHeight > 20), 'the tickets feed out of the slot');
assert.deepEqual(await bestLine(), { text: 'A new best! Your old one was 50.', big: true, size: '18px' });
assert.equal(await page.textContent('#overT'), `Nine balls ${score.toLocaleString('en-US')} points`);
assert.equal(await page.textContent('#again'), 'Roll again');
assert.ok(await page.isHidden('#overTip'), 'a game rolled about right has nothing to say about how to roll');
assert.equal(await page.textContent('#live'), `Game over: ${score.toLocaleString('en-US')} points, ${Math.floor(score / 10)} tickets. A new best.`, 'what a screen reader hears at the end of the game');

// The prize counter: buy the cheapest thing, and it goes on the shelf.
await page.click('#overPrizes');
assert.ok(await page.isVisible('.fp-sheet'));
await page.click('.fp-prize >> nth=0');
assert.match(await page.textContent('.fp-toast'), /You got a lollipop/);
assert.match(await page.textContent('.fp-shelf'), /🍭/);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).tickets), stored.tickets - 5);
await page.waitForTimeout(800); // (a tap right after a trade is taken for a double tap, and ignored)
await page.click('.fp-prize >> nth=15');
assert.match(await page.textContent('.fp-toast'), /more tickets/, 'a prize you can’t afford says how many more you need');
await page.click('.fp-x');

// Everything is still there after a reload.
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.match(await page.textContent('#titleBest'), new RegExp(`Best: ${score.toLocaleString('en-US')}`));
assert.equal(await page.textContent('#tix'), String(stored.tickets - 5));

// Today's card: nine called shots. Rolling at each call's speed hits most of them.
await page.click('#daily');
assert.equal(await mode(), 'aim');
const card = await page.evaluate(() => rollUp.game.card);
assert.equal(card.calls.length, 9);
assert.ok(await page.isVisible('#callNote'), 'the called hole is shown before rolling');
// The notes float mid-lane: clear of the red line and of where a finger takes the ball, and under the board.
const lane = await page.evaluate(async () => {
  const { ground, LANE } = await import(new URL('js/physics.js', location.href).href);
  const y = z => rollUp.scene.project({ x: 0, y: ground(z), z }).y;
  return { notes: document.querySelector('.notes').getBoundingClientRect().bottom, foul: y(LANE.foul), grab: y(LANE.foul + 50) };
});
assert.ok(lane.notes <= lane.grab + 1 && lane.notes < lane.foul - 40, `the notes come down to ${lane.notes.toFixed(0)}, the red line is at ${lane.foul.toFixed(0)}`);
assert.equal(await page.textContent('#callV'), String(card.calls[0]));
const SPEED = { 20: [0, 250], 30: [0, 280], 40: [0, 305], 50: [0, 332], 100: [26, 374] };
const rollCall = async i => {
  await page.waitForFunction(() => rollUp.mode === 'aim', null, { timeout: 15000 });
  if (i === card.golden) assert.ok(await page.isVisible('#goldNote'), 'the golden ball is pointed out when it comes up');
  await page.evaluate(([vx, vz]) => rollUp.roll(vx, vz, 0), SPEED[card.calls[i]]);
};
await page.evaluate(() => { rollUp.speed = 6; });
for (let i = 0; i < 3; i++) await rollCall(i);
await page.waitForFunction(() => rollUp.thrown === 3 && rollUp.mode === 'aim', null, { timeout: 15000 });
// Once it's started, the card is yours: the menu doesn't offer to start it again.
await page.click('#menuBtn');
assert.ok(await page.isHidden('#restart'), "the menu offers 'Start a new game' on today's card");
await page.click('#resume');
// Left part-way, it's kept where it was, and Roll Up opens on it: the balls rolled, the score and the golden ball.
const part = await page.evaluate(() => ({ score: rollUp.score, balls: rollUp.game.balls }));
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.roll-up')).going), { key: card.key, ...part });
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.ok(await page.isHidden('#title'), 'Roll Up opens on the card, not its title card');
assert.deepEqual(await page.evaluate(() => [rollUp.mode, rollUp.thrown, rollUp.score, rollUp.game.balls, rollUp.game.card.key]), ['aim', 3, part.score, part.balls, card.key]);
assert.equal(await page.textContent('#ballNo'), 'Ball 4 of 9');
assert.equal(await page.textContent('.fp-toast'), "Today's card, where you left it: ball 4 of 9.");
assert.equal(await page.evaluate(() => rollUp.ball.golden), card.golden === 3, 'the golden ball is where it was');
// Left with a ball still rolling, it's played out as the page goes: it can't be rolled again.
await page.evaluate(([vx, vz]) => rollUp.roll(vx, vz, 0), SPEED[card.calls[3]]);
assert.equal(await mode(), 'roll');
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.deepEqual(await page.evaluate(() => [rollUp.mode, rollUp.thrown]), ['aim', 4], 'the ball left rolling counts');
await page.evaluate(() => { rollUp.speed = 6; });
for (let i = 4; i < 9; i++) await rollCall(i);
await page.waitForFunction(() => rollUp.mode === 'over', null, { timeout: 30000 });
await page.evaluate(() => { rollUp.speed = 1; });
const daily = await page.evaluate(() => rollUp.saved.daily);
assert.equal(daily.key, card.key);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('free-play.roll-up')).going), undefined, "once it's played, it isn't on the go");
assert.deepEqual(daily.balls.slice(0, 3), part.balls, 'the card is the one started before');
const called = daily.balls.filter(b => b.hit).length;
assert.ok(called >= 5, `rolling for each call should hit most of them (hit ${called})`);
for (const b of daily.balls) assert.equal(b.points, b.value * (b.hit ? 2 : 1) * (b.golden ? 2 : 1));
assert.ok(await page.isVisible('#stars'));
assert.match(await page.textContent('#stars'), new RegExp(`${called} of 9 calls`));
// (eight calls or more is the Roll Up trophy, and the card says so)
assert.equal(await page.isVisible('#overFeat'), called >= 8, `${called} calls, and the trophy's line ${called >= 8 ? "isn't" : 'is'} there`);
await page.click('#share');
const shared = await page.evaluate(() => navigator.clipboard.readText());
assert.match(shared, new RegExp(`^Roll Up · .+ · ${daily.score.toLocaleString('en-US')}\n[★☆]{9}\nfree-play\\.junkdrawer\\.works/roll-up/$`), `the share line: ${shared}`);
// Its card says which game it was over the score, and its big button is for a regular game, not today's card again.
assert.equal(await page.textContent('#overT small'), "Today's card");
assert.equal(await page.textContent('#again'), 'Play a regular game');

// Once it's played, today's card shows how it went instead of starting again.
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.textContent('#daily'), `Today: ${daily.score.toLocaleString('en-US')}`);
await page.click('#daily');
assert.ok(await page.isVisible('#over'), 'today’s result shows again');
assert.equal(await mode(), 'title', 'and no new game starts');

// The keyboard: Enter to play, hold Space to wind up, let go to roll. Once a key's been pressed, the first ball's hint
// says how on a keyboard.
await page.keyboard.press('Enter');
assert.equal(await mode(), 'aim');
assert.ok(await page.isVisible('#hint'));
assert.equal(await page.textContent('#hint'), '← → move, hold Space to roll');
await page.keyboard.press('ArrowLeft');
await page.keyboard.down('Space');
await page.waitForTimeout(500);
await page.keyboard.up('Space');
assert.equal(await mode(), 'roll', 'Space should roll the ball');

// The menu, opened mid-roll, hushes the rumble of the ball on the lane.
await page.waitForFunction(() => window.__loops[0]?.gain.value > 0.05, null, { timeout: 3000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
assert.ok((await audio()).loop < 0.01, `the ball rumbles on behind the menu (${(await audio()).loop})`);
await page.click('#resume');

// Leaving the page mid-game opens the menu, so the ball waits there for the player to come back.
await hide(true);
assert.ok(await page.isVisible('#menu'), 'leaving the page mid-game did not open the menu');
// and the sound sleeps until the page is back
await page.waitForFunction(() => window.__loops[0].context.state === 'suspended', null, { timeout: 2000 });
assert.equal((await audio()).loop, 0);
const away = await page.evaluate(() => JSON.stringify(rollUp.ball));
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => JSON.stringify(rollUp.ball)), away, 'the ball rolls on behind the menu');
await hide(false);
await page.waitForFunction(() => window.__loops[0].context.state === 'running', null, { timeout: 2000 });
await page.click('#resume');

// The menu pauses, and comes back.
await page.click('#menuBtn');
assert.ok(await page.isVisible('#menu'));
await page.click('#resume');
assert.ok(await page.isHidden('#menu'));
// Start a new game, from the menu mid-game: a fresh game, with no card left up.
await page.click('#menuBtn');
await page.click('#restart');
assert.deepEqual([await mode(), await page.evaluate(() => rollUp.thrown)], ['aim', 0]);
assert.ok(await page.isHidden('#menu') && await page.isHidden('#title') && await page.isHidden('#over'));

// The wind-up meter turns red where a straight roll from the middle of the lane sails over the rings into the 10, and
// a faint tick marks the 50: rolled from the tick it drops in the 50, and from just into the red it goes over.
const marks = await page.evaluate(() => rollUp.meterMarks());
assert.ok(marks.red > 0.35 && marks.red < 0.7 && marks.tick > 0.2 && marks.tick < marks.red, `the meter's marks: ${JSON.stringify(marks)}`);
await page.evaluate(() => { rollUp.speed = 6; });
for (const [k, ring] of [[marks.tick, 50], [marks.red + 0.03, 10]]) {
  await page.evaluate(() => rollUp.start());
  await page.waitForFunction(() => rollUp.mode === 'aim');
  await page.evaluate(k => rollUp.roll(0, rollUp.keyRoll(k), 0), k);
  await page.waitForFunction(() => rollUp.thrown === 1, null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => rollUp.game.balls[0].value), ring, `a straight roll from ${k.toFixed(3)} on the meter`);
}
await page.evaluate(() => { rollUp.speed = 1; });

// Fits a phone: nothing scrolls sideways.
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page scrolls sideways on a phone');

// Chrome would offer to install it.
const cdp = await ctx.newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
assert.deepEqual(installabilityErrors, [], 'Chrome says it can’t be installed');

// Works offline once it has been opened: with the server down and the browser offline, it opens from the offline copy.
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });
down = true;
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => typeof window.rollUp === 'object', null, { timeout: 10000 }).catch(() => assert.fail('the game did not start offline'));
await ctx.setOffline(false);
down = false;

// Asked for less motion, the push-in onto the board cuts in and out rather than gliding: through a roll, it's only ever
// all the way in or all the way out.
{
  const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' });
  const still = await calm.newPage();
  still.on('pageerror', e => problems.push('less motion: ' + e.message));
  await still.goto(base + 'roll-up/');
  await still.evaluate(() => rollUp.start());
  await still.waitForFunction(() => rollUp.mode === 'aim');
  const zooms = await still.evaluate(async () => {
    const seen = new Set();
    rollUp.roll(0, 305, 0);
    while (rollUp.mode !== 'aim' && rollUp.mode !== 'over') { seen.add(Math.round(rollUp.zoom * 1000) / 1000); await new Promise(r => requestAnimationFrame(r)); }
    return [...seen].sort();
  });
  assert.deepEqual(zooms, [0, 1], `with less motion asked for, the push-in passed through ${zooms.join(', ')}`);
  await calm.close();
}

// Eight of the nine calls on today's card: the Roll Up trophy goes on the shelf, and the card says so. (Nine balls,
// all but the fourth on their calls, left just before the card came up: it opens on the card's end.)
{
  const nine = await ctx.newPage();
  nine.on('pageerror', e => problems.push('eight calls: ' + e.message));
  await nine.goto(base + 'roll-up/');
  await nine.evaluate(async () => {
    const { cardFor, dayKey } = await import(new URL('js/daily.js', location.href).href);
    const c = cardFor(dayKey());
    const balls = c.calls.map((v, i) => i === 3
      ? { value: 10, points: 10 * (i === c.golden ? 2 : 1), golden: i === c.golden, call: v, hit: false }
      : { value: v, points: v * 2 * (i === c.golden ? 2 : 1), golden: i === c.golden, call: v, hit: true });
    const s = JSON.parse(localStorage.getItem('free-play.roll-up'));
    delete s.daily;
    localStorage.setItem('free-play.roll-up', JSON.stringify({ ...s, going: { key: c.key, score: balls.reduce((t, b) => t + b.points, 0), balls } }));
  });
  const had = await nine.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).prizes['trophy-roll-up'] || 0);
  await nine.reload();
  await nine.waitForFunction(() => rollUp.mode === 'over', null, { timeout: 10000 });
  assert.equal(await nine.textContent('#overFeat'), '🏆 Eight of the nine calls! The Roll Up trophy is on your shelf.');
  assert.equal(await nine.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).prizes['trophy-roll-up']), had + 1);
  assert.equal(await nine.evaluate(() => rollUp.saved.daily.trophy), true);
  // Left after eight balls, all on their calls, and the day over: it counts as played as Roll Up next opens, and that's
  // the trophy too. (The save as it was is put back after.)
  const kept = await nine.evaluate(() => localStorage.getItem('free-play.roll-up'));
  await nine.evaluate(async () => {
    const { cardFor, dayKey, dayBefore } = await import(new URL('js/daily.js', location.href).href);
    const c = cardFor(dayBefore(dayKey()));
    const balls = c.calls.slice(0, 8).map((v, i) => ({ value: v, points: v * 2 * (i === c.golden ? 2 : 1), golden: i === c.golden, call: v, hit: true }));
    const s = JSON.parse(localStorage.getItem('free-play.roll-up'));
    delete s.daily;
    localStorage.setItem('free-play.roll-up', JSON.stringify({ ...s, going: { key: c.key, score: balls.reduce((t, b) => t + b.points, 0), balls } }));
  });
  await nine.reload();
  await nine.waitForFunction(() => window.rollUp?.saved.daily, null, { timeout: 10000 });
  assert.deepEqual(await nine.evaluate(() => [rollUp.saved.daily.unfinished, rollUp.saved.daily.trophy, rollUp.saved.going]), [true, true, undefined]);
  assert.equal(await nine.evaluate(() => JSON.parse(localStorage.getItem('free-play.wallet')).prizes['trophy-roll-up']), had + 2, 'a card left after eight calls gets the trophy');
  await nine.evaluate(s => localStorage.setItem('free-play.roll-up', s), kept);
  await nine.close();
}

// Three balls rolled too hard, over the rings into the 10: the end card says what to try next time.
{
  const hard = await ctx.newPage();
  hard.on('pageerror', e => problems.push('too hard: ' + e.message));
  await hard.goto(base + 'roll-up/');
  await hard.evaluate(() => { rollUp.start(); rollUp.speed = 6; });
  for (let i = 0; i < 9; i++) {
    await hard.waitForFunction(() => rollUp.mode === 'aim', null, { timeout: 15000 });
    await hard.evaluate(i => rollUp.roll(0, i < 3 ? 450 : 305, 0), i);
  }
  await hard.waitForFunction(() => rollUp.mode === 'over', null, { timeout: 30000 });
  assert.equal(await hard.evaluate(() => rollUp.game.balls.filter(b => b.hard).length), 3);
  assert.ok(await hard.isVisible('#overTip'));
  assert.equal(await hard.textContent('#overTip'), 'Gentler: the 50 wants a medium roll.');
  await hard.close();
}

// Leaving after the ninth ball has dropped, before the game-over card, by the menu's Back to the arcade: the game is
// over all the same, and it pays as the page goes.
{
  const late = await ctx.newPage();
  late.on('pageerror', e => problems.push('leaving late: ' + e.message));
  await late.goto(base + 'roll-up/');
  await late.evaluate(() => { rollUp.start(); rollUp.speed = 6; });
  for (let i = 0; i < 9; i++) {
    await late.waitForFunction(() => rollUp.mode === 'aim', null, { timeout: 15000 });
    if (i === 8) await late.evaluate(() => { rollUp.speed = 1; });
    await late.evaluate(() => rollUp.roll(0, 305, 0));
  }
  await late.waitForFunction(() => rollUp.thrown === 9, null, { timeout: 15000, polling: 'raf' });
  await late.keyboard.press('Escape');
  assert.deepEqual(await late.evaluate(() => [rollUp.mode, document.getElementById('menu').hidden]), ['result', false]);
  const then = await late.evaluate(() => ({ score: rollUp.score, games: rollUp.saved.games, tickets: JSON.parse(localStorage.getItem('free-play.wallet') || '{"tickets":0}').tickets }));
  await late.click('#menu a.to-floor');
  await late.waitForSelector('#rollUpStat');
  const now = await late.evaluate(() => ({ games: JSON.parse(localStorage.getItem('free-play.roll-up')).games, tickets: JSON.parse(localStorage.getItem('free-play.wallet')).tickets }));
  assert.deepEqual(now, { games: then.games + 1, tickets: then.tickets + Math.floor(then.score / 10) }, 'a game left before its card still pays and counts');
  await late.close();
}

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
