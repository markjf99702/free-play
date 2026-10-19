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

// A regular: some tickets, a few prizes, a best on each machine and today's card played.
const SAVES = {
  'free-play.wallet': { tickets: 214, prizes: { lollipop: 2, 'spider-ring': 1, duck: 1, dinosaur: 1 } },
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

// Link preview, 1200 x 630: the sign and one line on the left, the two machines' screens on the right.
{
  const page = await open('', { width: 1200, height: 630 }, 1);
  const data = async (f, type) => `data:${type};base64,${(await readFile(join(root, f))).toString('base64')}`;
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Outline; src: url(${await data('fonts/bungee-outline.woff2', 'font/woff2')}); }
    @font-face { font-family: Bungee; src: url(${await data('fonts/bungee.woff2', 'font/woff2')}); }
    @font-face { font-family: Figtree; src: url(${await data('fonts/figtree.woff2', 'font/woff2')}); font-weight: 300 900; }
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
    body { background: radial-gradient(ellipse at 30% 0%, rgba(255,95,162,.2), transparent 60%), #0d0b1f; color: #fbeed2; font-family: Figtree; position: relative; }
    .left { position: absolute; left: 70px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
    h1 { margin: 0; font: 400 128px/.92 Outline; }
    .free { color: #ffd0e3; text-shadow: 0 0 4px #ff5fa2, 0 0 16px #ff5fa2, 0 0 40px rgba(255,95,162,.7); display: block; }
    .play { color: #d6fffb; text-shadow: 0 0 4px #4ff0e0, 0 0 16px #4ff0e0, 0 0 40px rgba(79,240,224,.7); display: block; }
    p { margin: 34px 0 0; font-size: 36px; line-height: 1.25; font-weight: 600; }
    small { display: block; margin-top: 20px; font-size: 24px; color: rgba(251,238,210,.6); }
    .shot { position: absolute; width: 420px; height: 315px; border-radius: 16px; border: 10px solid #050407; box-shadow: 0 24px 60px rgba(0,0,0,.6); background: center / cover; }
    .a { right: 150px; top: 40px; transform: rotate(-3deg); box-shadow: 0 0 0 3px #f2c14e, 0 24px 60px rgba(0,0,0,.6); background-image: url(${await data('floor/roll-up.jpg', 'image/jpeg')}); }
    .b { right: 56px; top: 280px; transform: rotate(4deg); box-shadow: 0 0 0 3px #ffa53a, 0 24px 60px rgba(0,0,0,.6); background-image: url(${await data('floor/tilt.jpg', 'image/jpeg')}); }
  </style></head><body>
    <div class="left"><h1><span class="free">Free</span><span class="play">Play</span></h1>
      <p>An arcade on your phone: <span style="white-space:nowrap">skee-ball</span>, pinball and a prize counter.</p><small>free-play.junkdrawer.works</small></div>
    <div class="shot a"></div><div class="shot b"></div>
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
