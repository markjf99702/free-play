// Highrise: a stacker, on the Free Play floor. This file runs it: the clock the rows move by, the stop button, the
// choice at floor 11, and the tickets and trophy at the end. js/tower.js has the rules, js/draw.js draws the tower
// and js/sound.js makes the noises. Tickets go into the arcade's wallet (../shared/wallet.js) at the end of a game,
// and the trophy onto its shelf.

import { createTower, payout, FLOORS, MINOR } from './tower.js';
import { createDraw } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { TROPHIES } from '../../shared/prizes.js';
import { openCounter, counterOpen, feed, bestLine, bump, pocketButton, PAYOUT, fmt } from '../../shared/counter.js';
import { insets } from '../../shared/insets.js';
import { topFive, place, onList } from '../../shared/records.js';

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
  s = { best: 0, games: 0, tops: 0, sound: true, ...(s && typeof s === 'object' ? s : {}) };
  for (const k of ['best', 'games', 'tops']) s[k] = Number.isFinite(+s[k]) ? +s[k] : 0; // a hand-edited or broken number
  return s;
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
  if (side) deck.classList.remove('narrow', 'narrower');
  const hud = document.querySelector('.hud').getBoundingClientRect();
  const top = Math.max(hud.bottom + 2, 54);
  deck.style.width = side ? '170px' : '';
  // Clear of an iPhone's home indicator, and of its notch on its side (see ../../shared/insets.js).
  const safe = insets();
  draw.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1), side
    ? { top, bottom: 8 + safe.bottom, right: 190 + safe.right }
    : { top, bottom: deck.offsetHeight + safe.bottom });
  const cab = draw.cabinet();
  if (side) {
    Object.assign(deck.style, { left: `${cab.left + cab.width + 18}px`, top: `${(cab.top + cab.bottom) / 2 - deck.offsetHeight / 2}px` });
    // The cards stand over the cabinet, not the middle of the window, so they keep off the deck beside it (as far as
    // the window allows: a card stays 16 px inside it). On a phone held upright they're in the middle.
    const half = Math.min(380, innerWidth - 32) / 2;
    document.documentElement.style.setProperty('--card-x', `${Math.max(16 + half, Math.min(innerWidth - 16 - half, cab.left + cab.width / 2))}px`);
  } else {
    document.documentElement.style.removeProperty('--card-x');
    Object.assign(deck.style, { left: `${cab.left + cab.width * 0.04}px`, width: `${cab.width * 0.92}px`, top: `${cab.bottom - 2}px` });
    // On a short phone the cabinet is narrower, and the deck with it: its hint gets smaller, then goes (see the CSS).
    deck.classList.toggle('narrow', deck.offsetWidth < 290);
    deck.classList.toggle('narrower', deck.offsetWidth < 270);
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
let tookMinor = false, ended = null, chooseAt = null;
const falling = [], pops = [];
let flash = null, cheer = -1, dim = 0, paused = false;
const carded = () => !$('title').hidden || !$('choose').hidden || !$('over').hidden || !$('menu').hidden || counterOpen();

function newGame() {
  tower = createTower();
  mode = 'play'; tookMinor = false; ended = null; chooseAt = null;
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
    pops.length = 0; pops.push({ floor: r.floor, text: 'Topped out!', t: 0, gold: true, hold: 2.6 }); // up for the whole ending
    say('Topped out! The trophy is yours.');
    mode = 'ending'; ended = { at: clock + 2600 };
  } else if (r.minor) {
    sound.minor();
    say('Floor 11. Take the minor prize, or keep going?');
    mode = 'choose'; chooseAt = clock + 450; // the card comes up on the game's clock, so it waits behind the menu
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
// While a round's tickets feed out of the slot, the pocket in the corner counts along with them: it holds what the
// wallet holds less those still to come out. Once they're all out (or another round or leaving stops the strip), it
// holds them all, with a bump.
let toCome = 0;
const counting = n => k => { toCome = n - k; hud(); if (k === n && n) bump($('tixBtn')); };
// Leaving while the tower tops out or falls, before its card (by the menu's Back to the arcade, say), the game is over
// all the same: it pays as the page goes, trophy and all, and its card is what's up if the page comes back.
addEventListener('pagehide', () => {
  if (mode === 'ending') { $('menu').hidden = true; paused = false; endGame(); }
  feeding();
});

function endGame() {
  mode = 'over';
  const built = tower.built, top = built >= FLOORS, won = payout({ built, tookMinor });
  const first = !saved.games;
  wallet.pay(won);
  if (top) wallet.give(TROPHIES[0]);
  saved.games++;
  const old = saved.best, isBest = built > old && !first;
  // onto the top five, with the day
  const { list, rank, entry } = place(topFive(saved), built);
  if (entry) saved.top = list;
  if (built > saved.best) saved.best = built;
  if (top) saved.tops = (saved.tops || 0) + 1;
  save();
  // the trophy, big, over a top-out's heading
  $('overTrophy').hidden = !top;
  $('overTrophy').textContent = TROPHIES[0].emoji;
  $('overT').textContent = top ? 'Topped out!' : tookMinor ? 'Floor 11, and the minor prize' : built >= MINOR ? `${words[built]}. So close.` : built ? words[built] : 'Not a floor';
  $('overHow').textContent = top ? 'All fifteen floors. The Highrise trophy is on your shelf.'
    : tookMinor ? `A ticket for every floor, and 25 for stopping at the minor prize.`
    : built >= MINOR ? 'The 25 went with it, but every floor still pays a ticket.'
    : built ? 'A ticket for every floor.' : 'The first row has to land somewhere: try again.';
  bestLine($('overBest'), isBest && ['Your highest yet!', `The old one was floor ${old}.`], `${onList(rank)}Highest: floor ${saved.best}.`);
  $('over').hidden = false;
  feeding();
  // the highest yet rings out once the tickets are out, not over them
  feeding = feed($('payout'), won, { tick: () => sound.ticket(), onCount: counting(won), onDone: () => { if (isBest) sound.best(); } });
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
  // the ground floor lands wherever it stops; every floor after that has one below it to land on
  const aim = mode === 'title' || tower.floor <= 1 ? 'Stop it anywhere to start' : 'Stop it on the floor below';
  if ($('aimHint').textContent !== aim) $('aimHint').textContent = aim;
  const have = Math.max(0, wallet.read().tickets - toCome);
  $('tix').textContent = fmt(have);
  pocketButton($('tixBtn'), have);
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
// Leaving the page mid-round (a call, another app, the phone locked) opens the menu, so the round waits there
// rather than carrying on the moment the page is back.
document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'play' || mode === 'choose')) toggleMenu(true); });
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
    onClose: () => {
      paused = !$('menu').hidden; hud();
      // back to the game: the keys go to the stop button again, not to the ticket button the counter handed the focus to
      if (!carded()) $('stop').focus({ preventScroll: true });
    },
  });
}
$('tixBtn').addEventListener('click', () => { sound.unlock(); openPrizes(); });
for (const id of ['toPrizes', 'overPrizes', 'menuPrizes']) $(id).addEventListener('click', openPrizes);
addEventListener('free-play:wallet', hud);
addEventListener('pageshow', hud); // back from the floor, where tickets may have been spent

// Highrise open in another tab, or this page brought back by Back as it was: look at the save again, so a game ending
// here adds to what's there now instead of writing an old copy over it.
function reread() {
  Object.assign(saved, load());
  sound.setEnabled(saved.sound);
  soundLabel();
  hud();
}
addEventListener('storage', e => { if (e.key === KEY) reread(); });
addEventListener('pageshow', e => { if (e.persisted) reread(); });

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
  while (pops.length && pops[0].t > (pops[0].hold || 1)) pops.shift();
  if (flash) flash.t += s;
  if (cheer >= 0) cheer += s;
  if (mode === 'over' || mode === 'ending' && !cheer) dim = Math.min(1, dim + s);
  if (mode === 'ending' && clock >= ended.at) endGame();
  if (mode === 'choose' && chooseAt !== null && clock >= chooseAt) {
    chooseAt = null;
    $('choose').hidden = false;
    $('takeMinor').focus({ preventScroll: true });
  }

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
  get pops() { return pops; },
  start,
  stop,
  stopAt(start) { if (!(mode === 'play' && clock >= rowFrom)) return false; shown = start; stop(); return true; },
  draw,
};
