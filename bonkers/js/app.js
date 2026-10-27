// Bonkers: whack-a-mole with a glass side, on the Free Play floor. This file runs it: the mallet, the round's clock,
// the score and the tickets at the end. js/burrow.js has the moles and the rules, js/draw.js draws the cabinet and the
// ground in cross-section, and js/sound.js makes the noises. Tickets go into the arcade's wallet
// (../shared/wallet.js) at the end of a round.

import { createBurrow, ticketsFor, HOLES, ROUND } from './burrow.js';
import { createDraw } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { openCounter, counterOpen, feed, PAYOUT, fmt } from '../../shared/counter.js';

const $ = id => document.getElementById(id);
const KEY = 'free-play.bonkers';
const STEP = 1 / 60;

// ---------- what's kept between visits ----------
// Bonkers' own: the best round, how many rounds, and the sound.
const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  s = { best: 0, rounds: 0, sound: true, ...(s && typeof s === 'object' ? s : {}) };
  for (const k of ['best', 'rounds']) s[k] = Number.isFinite(+s[k]) ? +s[k] : 0; // a hand-edited or broken number
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the moles don't mind */ }
}
sound.setEnabled(saved.sound);

// ---------- the picture ----------
const canvas = $('stage');
const draw = createDraw(canvas);
const deck = $('deck');

// On a phone the clock sits under the cabinet, the width of it; on a wide screen it stands beside it.
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
    Object.assign(deck.style, { left: `${cab.left + cab.width * 0.05}px`, width: `${cab.width * 0.9}px`, top: `${cab.bottom - 2}px` });
  }
}
addEventListener('resize', layout);
layout();
if (document.fonts) Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('600 15px Figtree')]).then(() => draw.repaint()).catch(() => {});

// ---------- a round ----------
let burrow = createBurrow();
let mode = 'title';            // title → play → over (behind the title, the moles go about their business)
let swingAt = null, paused = false, timeScale = 1;
const pops = [], puffs = [];
const carded = () => !$('title').hidden || !$('over').hidden || !$('menu').hidden || counterOpen();

function newRound() {
  burrow = createBurrow();
  mode = 'play';
  pops.length = 0; puffs.length = 0; swingAt = null;
  hud();
}

// The mallet coming down at a point in the cabinet.
function swing(x, y) {
  sound.unlock();
  if (mode !== 'play' || paused || carded()) return null;
  const r = burrow.swing(x, y);
  if (r) swingAt = { hole: r.hole, t: 0 };
  happened();
  return r;
}

function happened() {
  for (const e of burrow.take()) {
    if (e === 'frenzy') { sound.frenzy(); say('Frenzy! Ten seconds left.'); }
    else if (e === 'over') { sound.over(); setTimeout(endRound, 900); }
    else if (e.pop !== undefined) sound.pop();
    else if (e.peek !== undefined) sound.peek();
    else if (e.away !== undefined) sound.away();
    else if (e.hat !== undefined) { sound.hat(); pops.push({ x: HOLES[e.hat], y: -80, text: 'Clank!', t: 0 }); }
    else if (e.miss !== undefined) {
      sound.miss();
      puffs.push({ x: HOLES[e.miss], t: 0 });
      pops.push({ x: HOLES[e.miss], y: -60, text: e.peeking ? 'Only a peek!' : '−5', t: 0 });
    } else if (e.bonk !== undefined) {
      sound.bonk(e.kind);
      pops.push({ x: HOLES[e.bonk], y: -90, text: `+${e.points}`, t: 0, gold: e.kind !== 'mole', big: e.kind === 'gold' });
      if (e.run) { sound.run(); pops.push({ x: 250, y: -130, text: 'Ten in a row! +50', t: -0.1, gold: true, big: true }); }
    }
  }
  hud();
}

let feeding = () => {};
$('payout').innerHTML = PAYOUT;
function endRound() {
  if (mode !== 'play') return;
  mode = 'over';
  const score = burrow.score, won = ticketsFor(score), first = !saved.rounds;
  wallet.pay(won);
  saved.rounds++;
  const isBest = score > saved.best && !first;
  if (score > saved.best) saved.best = score;
  save();
  $('overT').textContent = `${score.toLocaleString('en-US')} ${score === 1 ? 'point' : 'points'}`;
  $('overHow').textContent = `${burrow.bonks} ${burrow.bonks === 1 ? 'mole' : 'moles'} bonked in ${ROUND} seconds. A ticket for every 15 points.`;
  $('overBest').textContent = isBest ? 'A new best.' : `Best: ${saved.best.toLocaleString('en-US')}`;
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
  newRound();
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);

function say(text) { $('live').textContent = text; }

// ---------- the mallet ----------
canvas.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  const p = draw.toBurrow(e.clientX, e.clientY);
  if (swing(p.x, p.y)) e.preventDefault();
});
addEventListener('keydown', e => {
  if (counterOpen()) return; // the counter takes its own keys
  if (e.key === 'Escape') { toggleMenu(); return; }
  if (e.target.closest && e.target.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
  if (!$('title').hidden && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start(); return; }
  const n = '12345'.indexOf(e.key);
  if (n >= 0 && !e.repeat) { e.preventDefault(); swing(HOLES[n], -30); }
});

// ---------- the scoreboard ----------
function hud() {
  $('score').textContent = burrow.score.toLocaleString('en-US');
  $('tix').textContent = fmt(wallet.read().tickets);
  const left = mode === 'play' ? Math.ceil(burrow.left) : mode === 'title' ? ROUND : 0;
  if ($('left').textContent !== String(left)) $('left').textContent = left;
  $('clockWord').textContent = left === 1 ? 'second' : 'seconds';
  document.querySelector('.clock').classList.toggle('frenzy', mode === 'play' && burrow.frenzy);
  $('titleBest').textContent = saved.rounds ? `Best: ${saved.best.toLocaleString('en-US')}.` : '';
}

// ---------- the menu and the prize counter ----------
function toggleMenu(open = $('menu').hidden) {
  if (!$('title').hidden || !$('over').hidden) return;
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

// Bonkers open in another tab, or this page brought back by Back as it was: look at the save again, so a round ending
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
let last = performance.now(), owed = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    owed = Math.min(owed + dt * timeScale, STEP * 6 * timeScale);
    while (owed >= STEP) {
      burrow.step(STEP); owed -= STEP;
      if (mode === 'play') happened();
      else { burrow.take(); if (burrow.over) burrow = createBurrow(); } // behind the title and the end card, quietly
    }
  }
  if (swingAt) swingAt.t += dt;
  for (const p of puffs) p.t += dt;
  while (puffs.length && puffs[0].t > 0.5) puffs.shift();
  for (const p of pops) p.t += dt;
  while (pops.length && pops[0].t > 1) pops.shift();
  draw.frame(burrow, { now, swing: swingAt, pops, puffs });
  requestAnimationFrame(tick);
}

hud();
requestAnimationFrame(tick);

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: swing without a finger, and run the clock faster.
window.bonkers = {
  get burrow() { return burrow; },
  get mode() { return mode; },
  get saved() { return saved; },
  start,
  swing,
  set speed(k) { timeScale = k; },
  draw,
};
