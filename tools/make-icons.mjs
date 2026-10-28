// Renders the PNG app icons from the SVGs, and each machine's shortcut icon from its cabinet's picture:
//   node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const rounded = await readFile(join(root, 'icon.svg'), 'utf8');
const square = await readFile(join(root, 'tools/icon-full-bleed.svg'), 'utf8');
const out = [
  ['icon-192.png', 192, rounded, true],
  ['icon-512.png', 512, rounded, true],
  ['icon-512-maskable.png', 512, square, false],
  ['icon-180.png', 180, square, false], // iOS rounds the corners itself
];

const browser = await pw.chromium.launch();
const page = await browser.newPage();
for (const [name, size, svg, clear] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: join(root, name), omitBackground: clear });
}

// The machines' own icons, for the installed app's shortcuts (a long press on its icon on Android, or a right-click on
// a computer, lists the machines: see manifest.webmanifest): 96 px squares cut from each cabinet's picture on the floor
// (floor/*.jpg), centred across and down the picture, and as tall as it, as each fraction says.
const CUTS = {
  'roll-up': [0.5, 0.56, 0.8], tilt: [0.5, 0.62, 0.76], clutch: [0.58, 0.55, 0.9], topple: [0.36, 0.6, 0.8],
  highrise: [0.42, 0.55, 0.9], popgun: [0.42, 0.66, 0.76], bonkers: [0.3, 0.45, 0.9], hoops: [0.5, 0.5, 0.92],
};
await page.setViewportSize({ width: 96, height: 96 });
for (const [m, [x, y, side]] of Object.entries(CUTS)) {
  const jpg = `data:image/jpeg;base64,${(await readFile(join(root, 'floor', `${m}.jpg`))).toString('base64')}`;
  await page.setContent('<canvas width="96" height="96"></canvas>');
  const png = await page.evaluate(async ([src, x, y, side]) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const s = side * img.height, c = document.querySelector('canvas').getContext('2d');
    const within = (at, size) => Math.min(Math.max(0, at * size - s / 2), size - s); // (kept inside the picture)
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, within(x, img.width), within(y, img.height), s, s, 0, 0, 96, 96);
    return c.canvas.toDataURL('image/png');
  }, [jpg, x, y, side]);
  await writeFile(join(root, m, 'icon-96.png'), Buffer.from(png.split(',')[1], 'base64'));
}
await browser.close();
console.log('icons written');
