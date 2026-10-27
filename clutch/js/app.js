// Clutch: a claw machine, on the Free Play floor. This file runs it: the button, the goes, the plush won and the cards.
// js/machine.js is the machine (matter-js moves the plush), js/draw.js draws it and js/sound.js makes the noises.
// It's the one machine that pays in prizes, not tickets: each plush won goes straight on the arcade's shelf
// (../shared/wallet.js). The prize counter is the arcade's too.

import { createMachine } from './machine.js';
import { createDraw, drawPlush } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { PLUSH } from '../../shared/prizes.js';
import { openCounter, counterOpen, fmt } from '../../shared/counter.js';
import { insets } from '../../shared/insets.js';

const $ = id => document.getElementById(id);
const KEY = 'free-play.clutch';
const STEP = 1000 / 60; // the machine runs in steps of 1/60 s, whatever the screen's frame rate

// ---------- what's kept between visits ----------
// Clutch's own: how many goes, how many of each plush won, and the sound. The plush themselves are on the arcade's shelf.
const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  s = s && typeof s === 'object' ? s : {};
  // (numbers checked, so a hand-edited or broken one can't stop the page or turn a count into text)
  const count = v => (Number.isFinite(+v) ? +v : 0);
  const won = {};
  if (s.won && typeof s.won === 'object') for (const [kind, n] of Object.entries(s.won)) won[kind] = count(n);
  return { sound: true, ...s, goes: count(s.goes), won };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the claw still works */ }
}
sound.setEnabled(saved.sound);
const total = () => Object.values(saved.won).reduce((a, n) => a + (Number(n) || 0), 0);
const plushFor = kind => PLUSH.find(p => p.kind === kind);

// ---------- the machine and the picture of it ----------
const machine = createMachine(window.Matter);
const canvas = $('stage');
const draw = createDraw(canvas);
const deck = $('deck');

// On a phone the control deck sits under the cabinet, the width of it; on a wide screen it stands beside it.
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
  } else {
    Object.assign(deck.style, { left: `${cab.left + cab.width * 0.04}px`, width: `${cab.width * 0.92}px`, top: `${cab.bottom - 2}px` });
    // On a short phone the cabinet is narrower, and the deck with it: its hint gets smaller, then goes (see the CSS).
    deck.classList.toggle('narrow', deck.offsetWidth < 290);
    deck.classList.toggle('narrower', deck.offsetWidth < 220);
  }
}
addEventListener('resize', layout);
layout();
if (document.fonts) Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('600 15px Figtree')]).then(() => draw.repaint()).catch(() => {});

// ---------- the button ----------
// down: the button's held. armed: it went down while the claw was ready, so it starts a go (a press left over from
// the last go doesn't start the next one by itself).
let down = false, armed = false, aim = null;
let paused = false, timeScale = 1;
const carded = () => !$('title').hidden || !$('win').hidden || !$('menu').hidden || counterOpen();

function press(e) {
  sound.unlock();
  if (carded() || down) return;
  e?.preventDefault();
  down = true;
  armed = machine.state === 'ready';
  $('hold').classList.add('down');
  sound.press();
}
function release() {
  if (!down) return;
  down = false;
  $('hold').classList.remove('down');
}
const holding = () => (aim != null ? machine.claw.x < aim : down) && (machine.state !== 'ready' || armed || aim != null);

for (const el of [$('hold'), canvas]) {
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    press(e);
    try { el.setPointerCapture(e.pointerId); } catch { /* fine without */ }
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
}
$('hold').addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', release);

const HOLD_KEYS = [' ', 'Enter', 'ArrowRight'];
addEventListener('keydown', e => {
  if (counterOpen()) return; // the counter takes its own keys
  if (e.key === 'Escape') { toggleMenu(); return; }
  if (e.target.closest && e.target.closest('button:not(#hold), a') && (e.key === ' ' || e.key === 'Enter')) return;
  if (!$('title').hidden && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start(); return; }
  if (HOLD_KEYS.includes(e.key)) { e.preventDefault(); if (!e.repeat) press(); }
});
addEventListener('keyup', e => { if (HOLD_KEYS.includes(e.key)) release(); });

// ---------- a go ----------
let door = null, glow = 0;
const wins = [];
function happened() {
  for (const e of machine.take()) {
    if (e === 'start') { armed = false; saved.goes++; save(); }
    else if (e === 'drop') aim = null;
    else if (e === 'close') sound.close();
    else if (e === 'release') sound.open();
    else if (e === 'slip') { sound.slip(); say('It slipped.'); }
    else if (e === 'ready' && wins.length) showWin();
  }
  for (const w of machine.takeWon()) won(w);
}

function won(w) {
  const prize = plushFor(w.kind);
  wallet.give(prize);
  saved.won[w.kind] = (saved.won[w.kind] || 0) + 1;
  save();
  wins.push(w);
  door = { ...w, t: 0 };
  glow = 2.4;
  sound.won(w.kind === 'star');
  say(`You won ${prize.say}!`);
  if (navigator.vibrate) try { navigator.vibrate([20, 50, 20]); } catch { /* not allowed */ }
  hud(true);
}

// The win card, once the claw's back and ready: what came out of the door, drawn big.
function showWin() {
  const got = wins.splice(0);
  const names = got.map(w => plushFor(w.kind).say);
  $('winT').textContent = `You got ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}.`;
  $('winHow').textContent = got.some(w => w.kind === 'star')
    ? "The lucky star! They don't come along often. It's on your shelf now."
    : got.length > 1 ? "Two at once! They're on your shelf now, with your prizes." : "It's on your shelf now, with your prizes.";
  const art = $('winArt'), r = Math.min(2, devicePixelRatio || 1);
  art.width = 220 * r; art.height = 170 * r;
  const c = art.getContext('2d');
  c.setTransform(r, 0, 0, r, 0, 0);
  const s = got.length > 1 ? 0.95 : 1.25;
  got.slice(0, 3).forEach((w, i, all) => {
    const x = 110 + (i - (all.length - 1) / 2) * (200 / Math.max(2, all.length));
    drawPlush(c, w.kind, w.tone, x, 92, (i - (all.length - 1) / 2) * 0.12, s, 0.6);
  });
  $('win').hidden = false;
  $('more').focus({ preventScroll: true });
}
function closeWin() {
  $('win').hidden = true;
  door = null;
}
$('more').addEventListener('click', closeWin);
$('winShelf').addEventListener('click', () => { closeWin(); openPrizes(); });

function say(text) { $('live').textContent = text; }

// ---------- the scoreboard ----------
function hud(bump = false) {
  $('won').textContent = fmt(total());
  $('tix').textContent = fmt(wallet.read().tickets);
  if (bump) { const b = $('won'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  const n = total();
  $('titleBest').textContent = n ? `You've won ${fmt(n)} plush in ${fmt(saved.goes)} ${saved.goes === 1 ? 'go' : 'goes'}.` : '';
}

// ---------- cards ----------
function start() {
  sound.unlock();
  $('title').hidden = true;
  $('hold').focus({ preventScroll: true });
}
$('play').addEventListener('click', start);

function toggleMenu(open = $('menu').hidden) {
  if (!$('title').hidden || !$('win').hidden) return;
  $('menu').hidden = !open;
  paused = open;
  release();
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

// ---------- the prize counter (the arcade's) ----------
function openPrizes() {
  release();
  paused = true;
  openCounter({
    onBuy: () => sound.buy(),
    onClose: () => { paused = !$('menu').hidden; hud(); },
  });
}
$('tixBtn').addEventListener('click', () => { sound.unlock(); openPrizes(); });
for (const id of ['toPrizes', 'menuPrizes']) $(id).addEventListener('click', openPrizes);
addEventListener('free-play:wallet', () => hud());
addEventListener('pageshow', () => hud()); // back from the floor, where tickets may have been spent

// Clutch open in another tab, or this page brought back by Back as it was: look at the save again, so a go here adds
// to what's there now instead of writing an old copy over it.
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
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused) {
    owed = Math.min(owed + dt * timeScale, STEP * 6 * timeScale);
    while (owed >= STEP) { machine.step(holding()); owed -= STEP; happened(); }
  }
  const st = machine.state, busy = !paused && ['move', 'drop', 'lift', 'carry'].includes(st);
  sound.motor(busy ? 1 : 0, st === 'lift' ? (machine.held ? 0.9 : 0.7) : st === 'drop' ? 0.3 : 0.5);
  if (door) door.t += dt / 1000;
  glow = Math.max(0, glow - dt / 1000);
  draw.frame(machine, { now, door, glow });
  requestAnimationFrame(tick);
}

hud();
requestAnimationFrame(tick);

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: send the claw to a spot without a finger, and run the clock faster.
window.clutch = {
  get state() { return machine.state; },
  get saved() { return saved; },
  machine,
  start,
  // a go aimed at x (mm across the box): the claw slides there and drops
  go(x) {
    if (machine.state !== 'ready' || carded()) return false;
    aim = x;
    return true;
  },
  set speed(k) { timeScale = k; },
  draw,
};
