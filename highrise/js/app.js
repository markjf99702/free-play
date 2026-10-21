// Highrise: a stacker, on the Free Play floor. This file runs it: the clock the rows move by, the stop button, the
// choice at floor 11, and the tickets and trophy at the end. js/tower.js has the rules, js/draw.js draws the tower
// and js/sound.js makes the noises. Tickets go into the arcade's wallet (../shared/wallet.js) at the end of a game,
// and the trophy onto its shelf.

import { createTower, payout, FLOORS, MINOR } from './tower.js';
import { createDraw } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { TROPHIES } from '../../shared/prizes.js';
import { openCounter, counterOpen, feed, PAYOUT } from '../../shared/counter.js';

const $ = id => document.getElementById(id);
const KEY = 'free-play.highrise';
const PAUSE = 260;   // ms between a row landing and the next one setting off
const words = ['', 'One floor', 'Two floors', 'Three floors', 'Four floors', 'Five floors', 'Six floors', 'Seven floors', 'Eight floors', 'Nine floors', 'Ten floors', 'Eleven floors', 'Twelve floors', 'Thirteen floors', 'Fourteen floors', 'Fifteen floors'];

// ---------- what's kept between visits ----------
// Highrise's own: the highest floor built, games played, times topped out, and the sound.
const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  return { best: 0, games: 0, tops: 0, sound: true, ...(s && typeof s === 'object' ? s : {}) };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the tower still builds */ }
}
sound.setEnabled(saved.sound);

// ---------- the picture ----------
const canvas = $('stage');
const draw = createDraw(canvas);
const deck = $('deck');

// On a phone the controls sit under the cabinet, the width of it; on a wide screen they stand beside it.
function layout() {
  const side = innerWidth > innerHeight * 1.05;
  deck.classList.toggle('side', side);
  const hud = document.querySelector('.hud').getBoundingClientRect();
  const top = Math.max(hud.bottom + 2, 54);
  deck.style.width = side ? '170px' : '';
  draw.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1), side
    ? { top, bottom: 8, right: 190 }
    : { top, bottom: deck.offsetHeight });
  const cab = draw.cabinet();
  if (side) {
    Object.assign(deck.style, { left: `${cab.left + cab.width + 18}px`, top: `${(cab.top + cab.bottom) / 2 - deck.offsetHeight / 2}px` });
  } else {
    Object.assign(deck.style, { left: `${cab.left + cab.width * 0.04}px`, width: `${cab.width * 0.92}px`, top: `${cab.bottom - 2}px` });
  }
}
addEventListener('resize', layout);
layout();
if (document.fonts) Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('600 15px Figtree')]).then(() => draw.repaint()).catch(() => {});

// ---------- a game ----------
let tower = createTower();
let mode = 'title';      // title → play ⇄ (choose at floor 11) → ending → over
let clock = 0;           // ms the game has been running (it stops while paused)
let rowFrom = 0;         // when on that clock the moving row set off
let shown = 0;           // where the moving row is on screen now: the stop button sets it down there
let tookMinor = false, ended = null;
const falling = [], pops = [];
let flash = null, cheer = -1, dim = 0, paused = false;
const carded = () => !$('title').hidden || !$('choose').hidden || !$('over').hidden || !$('menu').hidden || counterOpen();

function newGame() {
  tower = createTower();
  mode = 'play'; tookMinor = false; ended = null;
  falling.length = 0; pops.length = 0; flash = null; cheer = -1; dim = 0;
  rowFrom = clock + PAUSE;
  hud();
}

// The row is set down where it's shown.
function stop() {
  sound.unlock();
  if (mode !== 'play' || paused || clock < rowFrom || carded()) return;
  const r = tower.place(shown);
  for (const col of r.dropped) falling.push({ col, floor: r.floor, t: 0 });
  if (r.dropped.length) sound.drop();
  if (r.over) {
    sound.fail();
    say(`The tower stops at ${tower.built} ${tower.built === 1 ? 'floor' : 'floors'}.`);
    mode = 'ending'; ended = { at: clock + 1000 };
    return;
  }
  flash = { floor: r.floor, t: 0 };
  sound.place(r.floor, r.perfect);
  // (a single window that lands is just a landing, not a perfect one)
  if (r.perfect && r.cols.length > 1) { pops.length = 0; pops.push({ floor: r.floor, text: 'Perfect', t: 0 }); }
  if (r.top) {
    cheer = 0; sound.top();
    pops.length = 0; pops.push({ floor: r.floor, text: 'Topped out!', t: 0, gold: true });
    say('Topped out! The trophy is yours.');
    mode = 'ending'; ended = { at: clock + 2600 };
  } else if (r.minor) {
    sound.minor();
    say('Floor 11. Take the minor prize, or keep going?');
    mode = 'choose';
    setTimeout(() => { if (mode === 'choose') { $('choose').hidden = false; $('takeMinor').focus({ preventScroll: true }); } }, 450);
  } else {
    say(`Floor ${r.floor}${r.dropped.length ? `, ${r.kept.length} ${r.kept.length === 1 ? 'window' : 'windows'} left` : ''}.`);
    rowFrom = clock + PAUSE;
  }
  hud();
}

$('takeMinor').addEventListener('click', () => { $('choose').hidden = true; tookMinor = true; endGame(); });
$('keepGoing').addEventListener('click', () => { $('choose').hidden = true; mode = 'play'; rowFrom = clock + PAUSE * 2; $('stop').focus({ preventScroll: true }); });

let feeding = () => {};
$('payout').innerHTML = PAYOUT;
function endGame() {
  mode = 'over';
  const built = tower.built, top = built >= FLOORS, won = payout({ built, tookMinor });
  const first = !saved.games;
  wallet.pay(won);
  if (top) wallet.give(TROPHIES[0]);
  saved.games++;
  const isBest = built > saved.best && !first;
  if (built > saved.best) saved.best = built;
  if (top) saved.tops = (saved.tops || 0) + 1;
  save();
  $('overT').textContent = top ? 'Topped out!' : tookMinor ? 'Floor 11, and the minor prize' : built >= MINOR ? `${words[built]}. So close.` : built ? words[built] : 'Not a floor';
  $('overHow').textContent = top ? 'All fifteen floors. The Highrise trophy is on your shelf.'
    : tookMinor ? `A ticket for every floor, and 25 for stopping at the minor prize.`
    : built >= MINOR ? 'The 25 went with it, but every floor still pays a ticket.'
    : built ? 'A ticket for every floor.' : 'The first row has to land somewhere: try again.';
  $('overBest').textContent = isBest ? 'Your highest yet.' : `Highest: floor ${saved.best}`;
  $('over').hidden = false;
  feeding();
  feeding = feed($('payout'), won, { tick: () => sound.ticket() });
  $('again').focus({ preventScroll: true });
  hud();
}

function start() {
  sound.unlock();
  $('title').hidden = true;
  $('over').hidden = true;
  feeding();
  newGame();
  $('stop').focus({ preventScroll: true });
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);

function say(text) { $('live').textContent = text; }

// ---------- the stop button ----------
for (const el of [$('stop'), canvas]) {
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    $('stop').classList.add('down');
    stop();
  });
}
addEventListener('pointerup', () => $('stop').classList.remove('down'));
addEventListener('pointercancel', () => $('stop').classList.remove('down'));
$('stop').addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (counterOpen()) return; // the counter takes its own keys
  if (e.key === 'Escape') { toggleMenu(); return; }
  if (e.target.closest && e.target.closest('button:not(#stop), a') && (e.key === ' ' || e.key === 'Enter')) return;
  if (!$('title').hidden && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start(); return; }
  if ((e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') && !e.repeat) { e.preventDefault(); stop(); }
});

// ---------- the scoreboard ----------
function hud() {
  $('floorNo').textContent = mode === 'title' ? '1' : Math.min(FLOORS, mode === 'play' ? tower.floor : tower.built || 1);
  $('tix').textContent = wallet.read().tickets;
  $('titleBest').textContent = saved.games ? `Highest: floor ${saved.best}.${saved.tops ? ` Topped out ${saved.tops === 1 ? 'once' : saved.tops === 2 ? 'twice' : `${saved.tops} times`}.` : ''}` : '';
}

// ---------- the menu and the prize counter ----------
function toggleMenu(open = $('menu').hidden) {
  if (!$('title').hidden || !$('over').hidden || !$('choose').hidden) return;
  $('menu').hidden = !open;
  paused = open;
  if (open) $('resume').focus({ preventScroll: true });
}
$('menuBtn').addEventListener('click', () => { sound.unlock(); toggleMenu(); });
$('resume').addEventListener('click', () => toggleMenu(false));
$('sound').addEventListener('click', () => {
  saved.sound = !saved.sound; save();
  sound.setEnabled(saved.sound);
  soundLabel();
});
function soundLabel() {
  $('sound').textContent = `Sound: ${saved.sound ? 'on' : 'off'}`;
  $('sound').setAttribute('aria-pressed', String(saved.sound));
}
soundLabel();

function openPrizes() {
  paused = true;
  openCounter({
    onBuy: () => sound.buy(),
    onClose: () => { paused = !$('menu').hidden; hud(); },
  });
}
$('tixBtn').addEventListener('click', () => { sound.unlock(); openPrizes(); });
for (const id of ['toPrizes', 'overPrizes', 'menuPrizes']) $(id).addEventListener('click', openPrizes);
addEventListener('free-play:wallet', hud);
addEventListener('pageshow', hud); // back from the floor, where tickets may have been spent

// ---------- every frame ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused) clock += dt;
  const s = dt / 1000;
  for (const f of falling) f.t += s;
  while (falling.length && falling[0].t > 1) falling.shift();
  for (const p of pops) p.t += s;
  while (pops.length && pops[0].t > 1) pops.shift();
  if (flash) flash.t += s;
  if (cheer >= 0) cheer += s;
  if (mode === 'over' || mode === 'ending' && !cheer) dim = Math.min(1, dim + s);
  if (mode === 'ending' && clock >= ended.at) endGame();

  // the moving row: on the floor being built while playing (it appears as it sets off, not before, so it never sits
  // still anywhere), and on the ground floor behind the title card
  let mover = null;
  if (mode === 'title' || (mode === 'play' && clock >= rowFrom)) {
    const at = tower.moverAt(mode === 'title' ? clock : clock - rowFrom);
    if (mode === 'play' && at !== shown) sound.tick(tower.floor);
    shown = at;
    mover = { floor: tower.floor, start: at, width: tower.width };
  }
  draw.frame({ now, rows: tower.rows, mover, falling, flash, pops, cheer, dim: mode === 'over' && cheer < 0 ? dim : 0 });
  requestAnimationFrame(tick);
}

hud();
requestAnimationFrame(tick);

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: set a row down at a given place, without waiting for it to get there.
window.highrise = {
  get tower() { return tower; },
  get mode() { return mode; },
  get saved() { return saved; },
  get ready() { return mode === 'play' && clock >= rowFrom && !paused; },
  get shown() { return shown; },
  start,
  stop,
  stopAt(start) { if (!(mode === 'play' && clock >= rowFrom)) return false; shown = start; stop(); return true; },
  draw,
};
