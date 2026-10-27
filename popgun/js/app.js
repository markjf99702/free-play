// Popgun: a carnival shooting gallery, on the Free Play floor. This file runs it: aiming, firing, the round of corks,
// the score and the tickets at the end. js/gallery.js has the targets and the rules, js/draw.js draws the booth and
// js/sound.js makes the noises. Tickets go into the arcade's wallet (../shared/wallet.js) at the end of a round.

import { createGallery, ticketsFor, CORKS, W, H } from './gallery.js';
import { createDraw, MOON } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { openCounter, counterOpen, feed, PAYOUT, fmt } from '../../shared/counter.js';
import { insets } from '../../shared/insets.js';

const $ = id => document.getElementById(id);
const KEY = 'free-play.popgun';
const STEP = 1 / 60;

// ---------- what's kept between visits ----------
// Popgun's own: the best round, how many rounds, and the sound.
const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  s = { best: 0, rounds: 0, sound: true, ...(s && typeof s === 'object' ? s : {}) };
  for (const k of ['best', 'rounds']) s[k] = Number.isFinite(+s[k]) ? +s[k] : 0; // a hand-edited or broken number
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the corks still fly */ }
}
sound.setEnabled(saved.sound);

// ---------- the picture ----------
const canvas = $('stage');
const draw = createDraw(canvas);
const deck = $('deck');

// On a phone the tray of corks sits under the booth, the width of it; on a wide screen it stands beside it.
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
    Object.assign(deck.style, { left: `${cab.left + cab.width * 0.05}px`, width: `${cab.width * 0.9}px`, top: `${cab.bottom - 2}px` });
    // On a short phone the cabinet is narrower, and the deck with it: its hint gets smaller, then goes (see the CSS).
    deck.classList.toggle('narrow', deck.offsetWidth < 290);
    deck.classList.toggle('narrower', deck.offsetWidth < 220);
  }
}
addEventListener('resize', layout);
layout();
if (document.fonts) Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('600 15px Figtree')]).then(() => draw.repaint()).catch(() => {});

// ---------- a round ----------
let gallery = createGallery();
let mode = 'title';           // title → play → over
let aim = { x: W / 2, y: H / 2 }, cross = false, recoil = 9, wink = -1, glow = 0, paused = false, timeScale = 1;
let endIn = 0;                // seconds from the last cork landing to the end card, on the round's clock (it waits while paused)
const marks = [], pops = [];
const carded = () => !$('title').hidden || !$('over').hidden || !$('menu').hidden || counterOpen();

function newRound() {
  gallery = createGallery();
  mode = 'play';
  marks.length = 0; pops.length = 0; endIn = 0;
  hud();
}

// A cork at a point on the back of the booth.
function fire(x, y) {
  sound.unlock();
  if (mode !== 'play' || paused || carded()) return false;
  if (y > H || y < -10 || x < -10 || x > W + 10) return false; // the counter, the awning or the posts
  aim = { x, y };
  if (!gallery.fire(x, y)) return false;
  recoil = 0;
  hud();
  return true;
}

function happened() {
  for (const e of gallery.take()) {
    if (e === 'pop') sound.pop();
    else if (e === 'over') endIn = 0.7;
    else if (e.miss) {
      const moon = Math.hypot(e.x - MOON.x, e.y - MOON.y) < MOON.r;
      if (moon) { wink = 0; sound.boing(); } else sound.miss();
      marks.push({ x: e.x, y: e.y, t: 0 });
    } else if (e.hit) {
      sound.hit(e.hit);
      if (e.corks) { pops.push({ x: e.x, y: e.y, text: `+${e.corks} corks`, t: 0, gold: true }); say(`The bell! ${e.corks} more corks.`); }
      else pops.push({ x: e.x, y: e.y, text: `+${e.points}`, t: 0, gold: e.hit === 'gold', big: e.hit === 'gold' });
      if (e.run) {
        sound.streak(); glow = 1.6;
        pops.push({ x: W / 2, y: H * 0.55, text: 'Five in a row! +50', t: -0.15, gold: true, big: true });
      }
      hud();
    }
  }
}

let feeding = () => {};
$('payout').innerHTML = PAYOUT;
function endRound() {
  if (mode !== 'play') return;
  mode = 'over';
  const score = gallery.score, won = ticketsFor(score), first = !saved.rounds;
  wallet.pay(won);
  saved.rounds++;
  const isBest = score > saved.best && !first;
  if (score > saved.best) saved.best = score;
  save();
  sound.over();
  $('overT').textContent = `${score.toLocaleString('en-US')} ${score === 1 ? 'point' : 'points'}`;
  $('overHow').textContent = `${gallery.hits} hits from ${gallery.shots} corks. A ticket for every 20 points.`;
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

// ---------- aiming and firing ----------
// A tap (or a click) fires where it lands. With a mouse the sights follow it, so you can see where the cork will go.
canvas.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  const p = draw.toBooth(e.clientX, e.clientY);
  if (fire(p.x, p.y)) e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const p = draw.toBooth(e.clientX, e.clientY);
  const inside = p.y < H && p.y > -10 && p.x > -10 && p.x < W + 10;
  cross = inside && mode === 'play';
  canvas.classList.toggle('aiming', cross);
  if (inside) aim = p;
});
canvas.addEventListener('pointerleave', () => { cross = false; canvas.classList.remove('aiming'); });

// The keyboard: the arrows move the sights while they're held, Space fires.
const keys = new Set();
addEventListener('keydown', e => {
  if (counterOpen()) return; // the counter takes its own keys
  if (e.key === 'Escape') { toggleMenu(); return; }
  if (e.target.closest && e.target.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
  if (!$('title').hidden && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start(); return; }
  if (e.key.startsWith('Arrow')) { keys.add(e.key); cross = mode === 'play'; e.preventDefault(); }
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); cross = true; fire(aim.x, aim.y); }
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => keys.clear());

// ---------- the scoreboard ----------
function hud() {
  $('score').textContent = gallery.score.toLocaleString('en-US');
  $('tix').textContent = fmt(wallet.read().tickets);
  const left = mode === 'title' ? CORKS : gallery.corks;
  $('left').textContent = left;
  $('corksWord').textContent = left === 1 ? 'cork' : 'corks';
  document.querySelector('.corks').classList.toggle('empty', !left);
  const tray = $('tray');
  if (tray.childElementCount !== left) {
    tray.replaceChildren(...Array.from({ length: left }, (_, i) => { const c = document.createElement('i'); if (i >= CORKS) c.className = 'extra'; return c; }));
  }
  $('titleBest').textContent = saved.rounds ? `Best: ${saved.best.toLocaleString('en-US')}.` : '';
}

// ---------- the menu and the prize counter ----------
function toggleMenu(open = $('menu').hidden) {
  if (!$('title').hidden || !$('over').hidden) return;
  $('menu').hidden = !open;
  paused = open;
  keys.clear();
  if (open) $('resume').focus({ preventScroll: true });
}
$('menuBtn').addEventListener('click', () => { sound.unlock(); toggleMenu(); });
$('resume').addEventListener('click', () => toggleMenu(false));
// Leaving the page mid-round (a call, another app, the phone locked) opens the menu, so the round waits there
// rather than carrying on the moment the page is back.
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') toggleMenu(true); });
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
      // back to the game: the keys go to it again, not to the ticket button the counter handed the focus back to
      if (!carded()) document.activeElement?.blur();
    },
  });
}
$('tixBtn').addEventListener('click', () => { sound.unlock(); openPrizes(); });
for (const id of ['toPrizes', 'overPrizes', 'menuPrizes']) $(id).addEventListener('click', openPrizes);
addEventListener('free-play:wallet', hud);
addEventListener('pageshow', hud); // back from the floor, where tickets may have been spent

// Popgun open in another tab, or this page brought back by Back as it was: look at the save again, so a round ending
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
      gallery.step(STEP); owed -= STEP;
      if (endIn > 0 && (endIn -= STEP) < 1e-6) { endIn = 0; endRound(); }
      happened();
    }
    if (keys.size) {
      const v = 340 * dt;
      aim = {
        x: Math.max(0, Math.min(W, aim.x + ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * v)),
        y: Math.max(0, Math.min(H, aim.y + ((keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0)) * v)),
      };
    }
  }
  recoil += dt;
  if (wink >= 0) wink += dt;
  glow = Math.max(0, glow - dt);
  for (const m of marks) m.t += dt;
  while (marks.length && marks[0].t > 1.2) marks.shift();
  for (const p of pops) p.t += dt;
  while (pops.length && pops[0].t > 1.1) pops.shift();
  draw.frame(gallery, { now, aim, cross: cross && mode === 'play', marks, pops, recoil, wink, glow, ready: mode !== 'play' || gallery.ready });
  requestAnimationFrame(tick);
}

hud();
requestAnimationFrame(tick);

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: fire at a spot without a finger, and run the clock faster.
window.popgun = {
  get gallery() { return gallery; },
  get mode() { return mode; },
  get saved() { return saved; },
  start,
  fire,
  set speed(k) { timeScale = k; },
  draw,
};
