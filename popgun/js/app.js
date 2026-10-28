// Popgun: a carnival shooting gallery, on the Free Play floor. This file runs it: aiming, firing, the round of corks,
// the score and the tickets at the end. js/gallery.js has the targets and the rules, js/draw.js draws the booth and
// js/sound.js makes the noises. Tickets go into the arcade's wallet (../shared/wallet.js) at the end of a round.

import { createGallery, ticketsFor, tipFor, PER_TICKET, CORKS, W, H, feat } from './gallery.js';
import { createDraw, MOON } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { soundOn, switchSound } from '../../shared/sound.js';
import { openCounter, bigPrize, counterOpen, feed, bestLine, bump, pocketButton, tickets, shortOfATicket, PAYOUT, fmt } from '../../shared/counter.js';
import { insets } from '../../shared/insets.js';
import { claim, titleLine, endLine } from '../../shared/special.js';
import { trophy } from '../../shared/prizes.js';
import { topFive, place, onList, count } from '../../shared/records.js';

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
sound.setEnabled(soundOn(saved.sound));

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
    // The cards stand over the cabinet, not the middle of the window, so they keep off the deck beside it (as far as
    // the window allows: a card stays 16 px inside it). On a phone held upright they're in the middle.
    const half = Math.min(380, innerWidth - 32) / 2;
    document.documentElement.style.setProperty('--card-x', `${Math.max(16 + half, Math.min(innerWidth - 16 - half, cab.left + cab.width / 2))}px`);
  } else {
    document.documentElement.style.removeProperty('--card-x');
    Object.assign(deck.style, { left: `${cab.left + cab.width * 0.05}px`, width: `${cab.width * 0.9}px`, top: `${cab.bottom - 2}px` });
    // On a short phone the cabinet is narrower, and the deck with it: its hint gets smaller, then goes (see the CSS).
    deck.classList.toggle('narrow', deck.offsetWidth < 290);
    deck.classList.toggle('narrower', deck.offsetWidth < 265);
  }
}
addEventListener('resize', layout);
layout();
if (document.fonts) Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('600 15px Figtree')]).then(() => draw.repaint()).catch(() => {});

// ---------- a round ----------
let gallery = createGallery();
let mode = 'title';           // title → play → over
let aim = { x: W / 2, y: H / 2 }, cross = false, recoil = 9, wink = -1, glow = 0, jog = -1, paused = false, timeScale = 1;
let endIn = 0;                // seconds from the last cork landing to the end card, on the round's clock (it waits while paused)
let told = 0;                 // how many times this round a cork that landed behind its target has said 'Aim ahead!'
const marks = [], pops = [];
const carded = () => !$('title').hidden || !$('over').hidden || !$('menu').hidden || counterOpen();

function newRound() {
  gallery = createGallery();
  mode = 'play';
  marks.length = 0; pops.length = 0; endIn = 0; told = 0;
  hud();
}

// A cork at a point on the back of the booth.
function fire(x, y) {
  sound.unlock();
  if (mode !== 'play' || paused || carded()) return false;
  if (y > H || y < -10 || x < -10 || x > W + 10) return false; // the counter, the awning or the posts
  aim = { x, y };
  if (!gallery.fire(x, y)) {
    // a tap while the gun reloads: a dry click and a jog of the gun, so it's plain no cork went
    if (gallery.corks > 0 && !gallery.over) { sound.dry(); jog = 0; }
    return false;
  }
  recoil = 0;
  hud();
  return true;
}

function happened() {
  for (const e of gallery.take()) {
    if (e === 'pop') sound.pop();
    else if (e.arrive) { if (mode === 'play') sound.arrive(e.arrive); } // (the booth turns behind the cards too: quietly)
    else if (e === 'over') endIn = 0.7;
    else if (e.miss) {
      const moon = Math.hypot(e.x - MOON.x, e.y - MOON.y) < MOON.r;
      if (moon) { wink = 0; sound.boing(); } else sound.miss();
      // A cork that landed behind the tin it was fired at, which ran on while it flew: the first few times in a round,
      // a bigger puff and a word, since a tap dead on a rabbit or a star can't ever catch it.
      const ahead = e.behind && told < 3;
      if (ahead) { told++; pops.push({ x: Math.max(80, Math.min(W - 80, e.x)), y: e.y, text: 'Aim ahead!', t: 0 }); }
      marks.push({ x: e.x, y: e.y, t: 0, big: ahead });
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
// While a round's tickets feed out of the slot, the pocket in the corner counts along with them: it holds what the
// wallet holds less those still to come out. Once they're all out (or another round or leaving stops the strip), it
// holds them all, with a bump.
let toCome = 0;
const counting = n => k => { toCome = n - k; hud(); if (k === n && n) bump($('tixBtn')); };
// Leaving in the moment between the last cork landing and the end card (by the menu's Back to the arcade, say), the
// round is over all the same: it pays as the page goes, and its card is what's up if the page comes back.
addEventListener('pagehide', () => {
  if (endIn > 0) { endIn = 0; $('menu').hidden = true; paused = false; endRound(); }
  feeding();
});

function endRound() {
  if (mode !== 'play') return;
  mode = 'over';
  const score = gallery.score, won = ticketsFor(score), first = !saved.rounds;
  wallet.pay(won);
  saved.rounds++;
  count({ round: 'popgun' });
  // the trophy, for the machine's hardest feat: onto the shelf now
  const feated = feat(gallery);
  if (feated) wallet.give(trophy('trophy-popgun'));
  $('overFeat').textContent = feated ? `🏆 Every cork a hit! The ${trophy('trophy-popgun').name} is on your shelf.` : '';
  $('overFeat').hidden = !feated;
  // today's special: 25 more tickets, out of the slot with the rest
  const bonus = claim('popgun', { score });
  $('overSpecial').textContent = endLine(bonus);
  $('overSpecial').hidden = !bonus;
  const old = saved.best, isBest = score > old && !first;
  // onto the top five, with the day
  const { list, rank, entry } = place(topFive(saved), score);
  if (entry) saved.top = list;
  if (score > saved.best) saved.best = score;
  save();
  sound.over();
  $('overT').textContent = `${score.toLocaleString('en-US')} ${score === 1 ? 'point' : 'points'}`;
  tip(tipFor(gallery));
  // and with no ticket, how far off one it was
  const { hits, shots } = gallery;
  $('overHow').textContent = `${hits} ${hits === 1 ? 'hit' : 'hits'} from ${shots} ${shots === 1 ? 'cork' : 'corks'}. `
    + (won ? `A ticket for every ${PER_TICKET} points.` : shortOfATicket(score, PER_TICKET));
  bestLine($('overBest'), isBest && ['A new best!', `Your old one was ${fmt(old)}.`], `${onList(rank)}Best: ${saved.best.toLocaleString('en-US')}.`);
  say(`${fmt(score)} ${score === 1 ? 'point' : 'points'}. ${tickets(won + bonus)}.${bonus ? " Today's special!" : ''}${feated ? ` ${$('overFeat').textContent.slice(3)}` : ''}`);
  $('over').hidden = false;
  feeding();
  // a new best rings out once the tickets are out, not over them, and the sign's bulbs blaze for it
  feeding = feed($('payout'), won + bonus, { tick: () => sound.ticket(), onCount: counting(won + bonus), onDone: () => { if (isBest) { sound.best(); glow = 2.4; } } });
  $('again').focus({ preventScroll: true });
  hud();
}

function start() {
  sound.unlock();
  $('title').hidden = true;
  $('over').hidden = true;
  closed();
  feeding();
  newRound();
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);

function say(text) { $('live').textContent = text; }
// The end card's line on what to try next time, when the round makes it plain (or nothing).
function tip(text) { $('overTip').hidden = !text; $('overTip').textContent = text || ''; }

// ---------- aiming and firing ----------
// A quick double tap on a card's button: the first tap closes the card, and the second lands on the booth where the
// button was. A tap that starts this soon after a card or the prize counter closes is taken for that second tap, and
// doesn't fire a cork.
let shut = -Infinity;
function closed() { shut = performance.now(); }
const justShut = () => performance.now() - shut < 350;

// A tap (or a click) fires where it lands. With a mouse the sights follow it, so you can see where the cork will go.
canvas.addEventListener('pointerdown', e => {
  if (e.button > 0 || justShut()) return;
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
  const have = Math.max(0, wallet.read().tickets - toCome);
  $('tix').textContent = fmt(have);
  pocketButton($('tixBtn'), have);
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
  if (open) $('resume').focus({ preventScroll: true }); else closed();
}
$('menuBtn').addEventListener('click', () => { sound.unlock(); toggleMenu(); });
$('resume').addEventListener('click', () => toggleMenu(false));
// Leaving the page mid-round (a call, another app, the phone locked) opens the menu, so the round waits there
// rather than carrying on the moment the page is back.
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') toggleMenu(true); });
$('sound').addEventListener('click', () => {
  saved.sound = switchSound(!soundOn(saved.sound)); save();
  sound.setEnabled(saved.sound);
  soundLabel();
});
function soundLabel() {
  const on = soundOn(saved.sound);
  $('sound').textContent = `Sound: ${on ? 'on' : 'off'}`;
  $('sound').setAttribute('aria-pressed', String(on));
}
soundLabel();
// flipped on the floor, or on any machine in another tab: this one follows
addEventListener('free-play:sound', () => { sound.setEnabled(soundOn(saved.sound)); soundLabel(); });

function openPrizes() {
  paused = true;
  openCounter({
    onBuy: p => { sound.unlock(); if (bigPrize(p)) sound.handOver(); else sound.buy(); },
    onClose: () => {
      paused = !$('menu').hidden; hud(); closed();
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
  sound.setEnabled(soundOn(saved.sound));
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
  if (jog >= 0 && (jog += dt) > 0.2) jog = -1;
  glow = Math.max(0, glow - dt);
  for (const m of marks) m.t += dt;
  while (marks.length && marks[0].t > 1.2) marks.shift();
  for (const p of pops) p.t += dt;
  while (pops.length && pops[0].t > 1.1) pops.shift();
  draw.frame(gallery, { now, aim, cross: cross && mode === 'play', marks, pops, recoil, wink, glow, jog, ready: mode !== 'play' || gallery.ready });
  requestAnimationFrame(tick);
}

hud();
requestAnimationFrame(tick);

// Today's special, when it's Popgun's day: its goal on the title card (or that it's made).
function special() { const t = titleLine('popgun'); $('titleSpecial').textContent = t; $('titleSpecial').hidden = !t; }
special();
addEventListener('pageshow', special);
addEventListener('storage', e => { if (e.key === null || e.key?.startsWith('free-play.')) special(); });

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: fire at a spot without a finger, and run the clock faster.
window.popgun = {
  get gallery() { return gallery; },
  get mode() { return mode; },
  get saved() { return saved; },
  get glow() { return glow; },
  get jogging() { return jog >= 0; },
  start,
  fire,
  set speed(k) { timeScale = k; },
  draw,
};
