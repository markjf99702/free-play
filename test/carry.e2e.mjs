// The move into the arcade, in Chromium:  node test/carry.e2e.mjs  (needs Playwright)
// All three addresses are served from here (the browser can't reach the real ones): Free Play from this repo, and
// tilt.junkdrawer.works and roll-up.junkdrawer.works from a copy of the carry.html they serve now. Saves left at the
// old addresses should arrive on Free Play's first visit, in one reload, and only once.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const HOME = 'https://free-play.junkdrawer.works';
const OLD = ['tilt', 'roll-up'];

// What tilt.junkdrawer.works/carry.html and roll-up.junkdrawer.works/carry.html answer (from those repos), with each
// address's own prefix.
const oldCarry = name => `<!doctype html><meta charset="utf-8"><script>
const KEYS = ['${name}.'];
addEventListener('message', e => {
  if (e.origin !== '${HOME}' || !e.data || e.data.carry !== true) return;
  const local = {};
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (KEYS.some(p => key.startsWith(p))) local[key] = localStorage.getItem(key); }
  e.source.postMessage({ carried: { local } }, e.origin);
});
</script>`;

const browser = await pw.chromium.launch();

async function context({ missing = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(`${HOME}/**`, async route => {
    let path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path.endsWith('/')) path += 'index.html';
    try { route.fulfill({ status: 200, contentType: TYPES[extname(path)] || 'text/html', body: await readFile(join(root, path)) }); }
    catch { route.fulfill({ status: 404, body: '' }); }
  });
  for (const name of OLD) {
    await ctx.route(`https://${name}.junkdrawer.works/**`, route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/carry.html' && !missing.includes(name)) return route.fulfill({ status: 200, contentType: 'text/html', body: oldCarry(name) });
      if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>old</title>' });
      return route.fulfill({ status: 404, body: '' });
    });
  }
  return ctx;
}

// What a player left at the old addresses.
const TILT = { table: 'space', spaceScores: [{ score: 333300, date: '2026-10-15' }], scores: [{ score: 120000, date: '2026-10-12' }], sound: false };
const ROLL = { best: 410, tickets: 57, games: 5, sound: true, prizes: { duck: 1, lollipop: 2 } };
async function leaveSaves(ctx) {
  const page = await ctx.newPage();
  await page.goto('https://tilt.junkdrawer.works/');
  await page.evaluate(v => localStorage.setItem('tilt.v1', v), JSON.stringify(TILT));
  await page.goto('https://roll-up.junkdrawer.works/');
  await page.evaluate(v => { localStorage.setItem('roll-up.v1', v); localStorage.setItem('other-thing', 'not ours'); }, JSON.stringify(ROLL));
  await page.close();
}
const loads = page => {
  const n = { count: 0 };
  page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) n.count++; });
  return n;
};
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));

// Both old addresses answer: everything arrives, in one reload.
{
  const ctx = await context();
  await leaveSaves(ctx);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  const n = loads(page);
  await page.goto(HOME + '/');
  await page.waitForFunction(() => document.getElementById('tix')?.textContent === '57', null, { timeout: 15000 });
  assert.equal(n.count, 2, 'the page should load once more after the saves arrive, and only once');
  const got = await storage(page);
  assert.deepEqual(JSON.parse(got['free-play.tilt']), TILT, "Tilt's saves come over as they were");
  const own = JSON.parse(got['free-play.roll-up']);
  assert.deepEqual(own, { best: 410, games: 5, sound: true }, "Roll Up's own saves come over without the tickets and prizes");
  assert.deepEqual(JSON.parse(got['free-play.wallet']), { tickets: 57, prizes: { duck: 1, lollipop: 2 } }, 'its tickets and prizes go in the wallet');
  assert.deepEqual(JSON.parse(got['free-play.carried']), { tilt: 'done', 'roll-up': 'done' });
  assert.ok(!('other-thing' in got), "nothing that isn't a machine's comes along");
  assert.match(await page.textContent('#tiltStat'), /333,300, on Space/, 'the floor shows the carried Tilt score');
  assert.match(await page.textContent('#rollUpStat'), /Best: 410\./);

  // The next visit loads once, and the tickets aren't counted twice.
  await page.reload();
  await page.waitForFunction(() => document.getElementById('tix')?.textContent === '57');
  assert.equal(n.count, 3, 'a second visit should load once');

  // Each machine finds its saves: Tilt opens on Space with its score, Roll Up has its best.
  await page.goto(HOME + '/tilt/');
  await page.waitForFunction(() => window.tilt);
  assert.equal(await page.evaluate(() => window.tilt.table.name), 'Space');
  assert.equal(await page.textContent('#bestLine'), 'Best: 333,300.');
  assert.match(await page.textContent('#tixT'), /^57$/);
  await page.goto(HOME + '/roll-up/');
  await page.waitForFunction(() => window.rollUp);
  assert.match(await page.textContent('#titleBest'), /Best: 410/);
  assert.equal(await page.textContent('#tix'), '57');
  assert.deepEqual(problems, []);
  await ctx.close();
}

// Roll Up's old address hasn't got carry.html (yet): the floor still opens, with Tilt's saves, and tries again later.
{
  const ctx = await context({ missing: ['roll-up'] });
  await leaveSaves(ctx);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(HOME + '/');
  await page.waitForFunction(() => window.freePlay, null, { timeout: 15000 });
  assert.ok(Date.now() - t0 < 9000, 'a missing old address only holds the page up a few seconds');
  const got = await storage(page);
  assert.deepEqual(JSON.parse(got['free-play.carried']), { tilt: 'done', 'roll-up': 1 });
  assert.ok(got['free-play.tilt'] && !got['free-play.roll-up']);
  await ctx.close();
}

await browser.close();
console.log('all good');
