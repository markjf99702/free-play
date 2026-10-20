// Renders the pictures: the cabinet screens on the floor (floor/*.jpg), the README's (docs/*.png) and the link
// preview (og.png):  node tools/screenshots.mjs
// Math.random and the date are fixed, so the same pictures come out every time.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
let UPNG = null;
try { UPNG = require('upng-js'); } catch { /* without it og.png is saved as it comes */ }
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
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });
await mkdir(join(root, 'floor'), { recursive: true });

// A regular: some tickets, a few prizes, a best on each machine and today's card played, three plush from the claw and
// a toy car pushed off Topple's deck.
const SAVES = {
  'free-play.wallet': { tickets: 214, prizes: { lollipop: 2, 'spider-ring': 1, duck: 1, dinosaur: 1, 'plush-frog': 2, 'plush-ghost': 1, 'trinket-car': 1 } },
  'free-play.clutch': { goes: 11, won: { frog: 2, ghost: 1 }, sound: true },
  'free-play.topple': { best: 34, cups: 6, prizes: 1, sound: true },
  'free-play.roll-up': { best: 340, games: 7, sound: true },
  'free-play.tilt': { table: 'classic', scores: [{ score: 412650, date: '2026-10-17' }], spaceScores: [{ score: 288400, date: '2026-10-18' }] },
};

async function open(path, viewport, deviceScaleFactor, saves = SAVES) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(saves => {
    let a = 4; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const Real = Date, fixed = new Real(2026, 9, 18, 10).getTime(); // 18 October 2026, so today's card is always the same
    window.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
    try { for (const [k, v] of Object.entries(saves)) localStorage.setItem(k, JSON.stringify(v)); } catch { }
  }, saves);
  await page.goto(base + path);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return page;
}

// Roll Up, pushed in on the board as a ball drops into the 50.
async function rollUpBoard(page) {
  await page.evaluate(() => { rollUp.start(); rollUp.speed = 8; });
  for (const v of [280, 305]) { await page.waitForFunction(() => rollUp.mode === 'aim'); await page.evaluate(v => rollUp.roll(0, v, 0), v); }
  await page.waitForFunction(() => rollUp.mode === 'aim');
  await page.evaluate(() => { rollUp.speed = 1; rollUp.roll(0, 332, 0); });
  await page.waitForFunction(() => rollUp.ball.state === 'sinking' || rollUp.mode === 'result');
  await page.waitForTimeout(260);
}

// The cabinet screens, 4:3: Roll Up's ball in the air over the rings, and Tilt's demo ball among the bumpers.
{
  const page = await open('roll-up/', { width: 390, height: 844 }, 2);
  await page.evaluate(() => { rollUp.start(); rollUp.roll(0, 332, 0); });
  await page.waitForFunction(() => rollUp.ball.z > 244 && rollUp.ball.state === 'rolling'); // in the air over the trough
  await page.screenshot({ path: join(root, 'floor/roll-up.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 150, width: 390, height: 292 } });
  await page.context().close();
}
{
  const page = await open('roll-up/', { width: 390, height: 844 }, 2);
  await rollUpBoard(page);
  await page.screenshot({ path: join(root, 'docs/phone-roll-up.png') });
  await page.context().close();
}
{
  const page = await open('tilt/', { width: 390, height: 844 }, 2);
  await page.evaluate(() => { document.getElementById('title').hidden = true; });
  await page.waitForTimeout(1600); // the demo ball up among the bumpers
  await page.screenshot({ path: join(root, 'floor/tilt.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 60, width: 390, height: 292 } });
  await page.context().close();
}

// Clutch: the claw coming up out of the heap with a plush. (The plush and the grabs are dealt from the fixed
// Math.random, so it's the same go every time; a go that comes up empty is skipped.)
{
  const page = await open('clutch/', { width: 390, height: 844 }, 2);
  await page.click('#play');
  for (let tries = 0; tries < 8; tries++) {
    await page.waitForFunction(() => clutch.state === 'ready' && document.getElementById('win').hidden || !document.getElementById('win').hidden, null, { timeout: 30000 });
    await page.evaluate(() => {
      document.getElementById('more').click();
      const top = clutch.machine.toys.filter(t => t.position.x > 220).sort((a, b) => a.position.y - b.position.y)[0];
      clutch.go(top.position.x);
    });
    await page.waitForFunction(() => clutch.state === 'carry' || (clutch.state === 'lift' && clutch.machine.claw.y < 350), null, { timeout: 20000 });
    if (await page.evaluate(() => clutch.state === 'lift' && !!clutch.machine.held)) break;
  }
  const [a, b] = await page.evaluate(() => [clutch.draw.at(0, 250), clutch.draw.at(600, 700)]);
  await page.screenshot({ path: join(root, 'floor/clutch.jpg'), type: 'jpeg', quality: 82, clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y } });
  await page.screenshot({ path: join(root, 'docs/phone-clutch.png') });
  await page.context().close();
}

// Topple: coins going over the front edge, a few seconds into a cup.
{
  const page = await open('topple/', { width: 390, height: 844 }, 2);
  await page.click('#play');
  for (let i = 0; i < 8; i++) {
    await page.evaluate(i => topple.drop([90, 210, 150, 120, 180, 60, 240, 150][i]), i);
    await page.waitForTimeout(420);
  }
  await page.waitForFunction(() => topple.machine.falling.some(f => f.edge === 'front' && f.t > 0.05 && f.t < 0.15), null, { timeout: 20000, polling: 16 });
  const [l, r, b] = await page.evaluate(() => [topple.draw.at(-6, 0, 250), topple.draw.at(306, 0, 250), topple.draw.at(0, -24, 250)]);
  const w = r.x - l.x, h = w * 0.75;
  await page.screenshot({ path: join(root, 'floor/topple.jpg'), type: 'jpeg', quality: 82, clip: { x: l.x, y: b.y - h, width: w, height: h } });
  await page.screenshot({ path: join(root, 'docs/phone-topple.png') });
  await page.context().close();
}

// The floor, a game of Tilt paying out, and the prize counter.
{
  const page = await open('', { width: 390, height: 844 }, 2);
  await page.waitForTimeout(3600); // the sign's second tube catches
  await page.screenshot({ path: join(root, 'docs/phone-floor.png') });
  await page.click('#trade');
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(root, 'docs/phone-counter.png') });
  await page.context().close();
}
{
  const page = await open('tilt/', { width: 390, height: 844 }, 2);
  await page.click('#startBtn');
  await page.waitForTimeout(400);
  await page.evaluate(() => { tilt.game.score = 268550; });
  await page.click('#menuBtn');
  await page.click('#quitBtn');
  await page.waitForTimeout(4400);
  await page.screenshot({ path: join(root, 'docs/phone-tilt.png') });
  await page.context().close();
}

// Link preview, 1200 x 630: the sign and one line on the left, the machines' screens on the right.
{
  const page = await open('', { width: 1200, height: 630 }, 1);
  const data = async (f, type) => `data:${type};base64,${(await readFile(join(root, f))).toString('base64')}`;
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Outline; src: url(${await data('fonts/bungee-outline.woff2', 'font/woff2')}); }
    @font-face { font-family: Bungee; src: url(${await data('fonts/bungee.woff2', 'font/woff2')}); }
    @font-face { font-family: Figtree; src: url(${await data('fonts/figtree.woff2', 'font/woff2')}); font-weight: 300 900; }
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
    body { background: radial-gradient(ellipse at 30% 0%, rgba(255,95,162,.2), transparent 60%), #0d0b1f; color: #fbeed2; font-family: Figtree; position: relative; }
    .left { position: absolute; left: 70px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; }
    h1 { margin: 0; font: 400 128px/.92 Outline; }
    .free { color: #ffd0e3; text-shadow: 0 0 4px #ff5fa2, 0 0 16px #ff5fa2, 0 0 40px rgba(255,95,162,.7); display: block; }
    .play { color: #d6fffb; text-shadow: 0 0 4px #4ff0e0, 0 0 16px #4ff0e0, 0 0 40px rgba(79,240,224,.7); display: block; }
    p { margin: 34px 0 0; font-size: 34px; line-height: 1.25; font-weight: 600; }
    small { display: block; margin-top: 20px; font-size: 24px; color: rgba(251,238,210,.6); }
    .shot { position: absolute; width: 300px; height: 225px; border-radius: 12px; border: 8px solid #050407; box-shadow: 0 24px 60px rgba(0,0,0,.6); background: center / cover; }
    .a { right: 330px; top: 46px; transform: rotate(-4deg); box-shadow: 0 0 0 3px #f2c14e, 0 24px 60px rgba(0,0,0,.6); background-image: url(${await data('floor/roll-up.jpg', 'image/jpeg')}); }
    .b { right: 40px; top: 70px; transform: rotate(3deg); box-shadow: 0 0 0 3px #ffa53a, 0 24px 60px rgba(0,0,0,.6); background-image: url(${await data('floor/tilt.jpg', 'image/jpeg')}); }
    .c { right: 350px; top: 330px; transform: rotate(2deg); box-shadow: 0 0 0 3px #ff5fa2, 0 24px 60px rgba(0,0,0,.6); background-image: url(${await data('floor/clutch.jpg', 'image/jpeg')}); }
    .d { right: 56px; top: 350px; transform: rotate(-3deg); box-shadow: 0 0 0 3px #16a39b, 0 24px 60px rgba(0,0,0,.6); background-image: url(${await data('floor/topple.jpg', 'image/jpeg')}); }
  </style></head><body>
    <div class="left"><h1><span class="free">Free</span><span class="play">Play</span></h1>
      <p>An arcade on your phone: <span style="white-space:nowrap">skee-ball</span>, pinball, a claw machine, a coin pusher and a prize counter.</p><small>free-play.junkdrawer.works</small></div>
    <div class="shot a"></div><div class="shot b"></div><div class="shot c"></div><div class="shot d"></div>
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot();
  await writeFile(join(root, 'og.png'), UPNG ? palette(png) : png);
  await page.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');

// Squeezes the share image down to 256 colours, which keeps it small enough for link previews.
function palette(png) {
  const img = UPNG.decode(png);
  const rgba = UPNG.toRGBA8(img)[0];
  return Buffer.from(UPNG.encode([rgba], img.width, img.height, 256));
}
