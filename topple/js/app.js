// Topple: a coin pusher, on the Free Play floor. This file runs it: aiming the chute, the cup of coins, the tickets
// and prizes that come over the edge, and the cards. js/machine.js is the machine (matter-js slides the coins),
// js/draw.js draws it in perspective and js/sound.js makes the noises.
// Every two coins over the front edge are a ticket (and a gold one is ten), paid into the arcade's wallet
// (../shared/wallet.js) as the second goes over; a prize pushed off goes on the arcade's shelf. The coins on the deck
// are kept between visits, so a pile left hanging over the edge is still hanging there next time.

import { createMachine, edgePays, DECK, PAYS } from './machine.js';
import { dayKey } from '../../shared/calendar.js';
import { createDraw } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { soundOn, switchSound } from '../../shared/sound.js';
import { TRINKETS } from '../../shared/prizes.js';
import { openCounter, bigPrize, counterOpen, toast, feed, bestLine, pocketButton, tickets, PAYOUT, fmt } from '../../shared/counter.js';
import { insets } from '../../shared/insets.js';
import { claim, titleLine, endLine } from '../../shared/special.js';
import { topFive, place, onList, count } from '../../shared/records.js';

const $ = id => document.getElementById(id);
const KEY = 'free-play.topple';
const CUP = 20;          // coins in a cup
const STEP = 1000 / 60;  // the machine runs in steps of 1/60 s, whatever the screen's frame rate

// ---------- what's kept between visits ----------
// Topple's own: the best cup, how many cups, the sound, the coins on the deck, a cup still being played, and a coin
// over the edge still waiting for the next to make a ticket (odd).
const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  s = s && typeof s === 'object' ? s : {};
  // a cup still being played, or one whose last coin went down just before leaving (finished when it comes back), with
  // the prizes it's pushed off (a cup saved before it kept them has none)
  const prizes = Array.isArray(s.cup?.prizes) ? s.cup.prizes.filter(k => TRINKETS.some(t => t.kind === k)) : [];
  const cup = s.cup && Number.isInteger(s.cup.left) && s.cup.left >= 0 && s.cup.left <= CUP ? { left: s.cup.left, won: Math.max(0, Math.floor(s.cup.won) || 0), prizes } : null;
  s = { best: 0, cups: 0, sound: true, ...s, cup };
  for (const k of ['best', 'cups', 'prizes']) if (k in s) s[k] = Number.isFinite(+s[k]) ? +s[k] : 0; // a hand-edited or broken number
  s.odd = Number.isInteger(s.odd) && s.odd > 0 && s.odd < PAYS.coins ? s.odd : 0;
  return s;
}
function save() {
  saved.field = machine.save();
  saved.cup = cup;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the coins still push */ }
}
sound.setEnabled(soundOn(saved.sound));

// The next prize the attendant puts on: one of the four, now and then the gem.
const trinket = kind => TRINKETS.find(t => t.kind === kind);
const nextPrize = () => (Math.random() < 0.08 ? 'gem' : ['watch', 'car', 'keyring', 'robot'][Math.floor(Math.random() * 4)]);

// ---------- the machine and the picture of it ----------
const machine = createMachine(window.Matter, { field: saved.field, prizes: [nextPrize()] });
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
    deck.classList.toggle('narrower', deck.offsetWidth < 220);
  }
}
addEventListener('resize', layout);
layout();
if (document.fonts) Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('600 15px Figtree')]).then(() => draw.repaint()).catch(() => {});

// ---------- the cup, and dropping coins ----------
let cup = saved.cup;     // { left, won, prizes }: the coins still in it, the tickets and the prizes (kinds) this cup has won, or null between cups
// The cup just finished, while its card is up: coins that still go over count for it, on the card and towards the
// best cup and the top five, until Another cup. { won, prizes, before: the best cup before it, first: whether it was
// the first cup, top: the top five before it, date: the day it was played }
let done = null;
let aim = DECK.W / 2;    // where the chute is, mm across
let paused = false, timeScale = 1, lastDrop = 0, lastFall = 0, ended = false;
const carded = () => !$('title').hidden || !$('over').hidden || !$('menu').hidden || counterOpen();

function dropCoin() {
  sound.unlock();
  if (!cup || cup.left <= 0 || carded()) return false;
  if (!machine.drop(aim)) return false;
  cup.left--;
  lastDrop = performance.now();
  hud();
  return true;
}

// A quick double tap on a card's button: the first tap closes the card, and the second lands on the glass where the
// button was. A touch that starts this soon after a card or the prize counter closes is taken for that second tap, and
// doesn't aim or drop a coin.
let shut = -Infinity;
const closed = () => { shut = performance.now(); };
const justShut = () => performance.now() - shut < 350;

// Touch the glass to aim: the chute follows the finger along its rail, and letting go drops a coin.
let finger = null;
canvas.addEventListener('pointerdown', e => {
  sound.unlock();
  if (e.button > 0 || carded() || !cup || justShut()) return;
  finger = e.pointerId;
  aim = clampAim(draw.railX(e.clientX));
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without */ }
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => { if (e.pointerId === finger) aim = clampAim(draw.railX(e.clientX)); });
canvas.addEventListener('pointerup', e => { if (e.pointerId === finger) { finger = null; dropCoin(); } });
canvas.addEventListener('pointercancel', e => { if (e.pointerId === finger) finger = null; });
const clampAim = x => Math.max(12, Math.min(DECK.W - 12, x));
$('drop').addEventListener('click', () => dropCoin());

// The keyboard: arrows move the chute while they're held, Space drops. Once a key's been pressed, the deck says so.
const keys = new Set();
let keyed = false;
addEventListener('keydown', e => {
  if (counterOpen()) return; // the counter takes its own keys
  if (!keyed && ['ArrowLeft', 'ArrowRight', 'ArrowDown', ' ', 'Enter'].includes(e.key)) { keyed = true; document.querySelector('.deck .say').textContent = '← → aim, Space drops'; }
  if (e.key === 'Escape') { toggleMenu(); return; }
  if (e.target.closest && e.target.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
  if (!$('title').hidden && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { keys.add(e.key); e.preventDefault(); }
  if ((e.key === ' ' || e.key === 'ArrowDown') && !e.repeat) { e.preventDefault(); dropCoin(); }
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => keys.clear());

// ---------- what comes over the edge ----------
const pops = [];
let glow = 0;
function happened() {
  for (const e of machine.take()) {
    if (e === 'drop') sound.drop();
    else if (e === 'land') sound.land();
    else if (e === 'scrape') sound.scrape();
    else if (e === 'chase') sound.chase();
    else if (e === 'open') sound.open();
    else if (e === 'bonus') { sound.bonus(); glow = 2.4; say('Bonus! A shower of coins.'); }
  }
  for (const f of machine.takeFalls()) {
    lastFall = performance.now();
    if (f.edge === 'side') {
      if (f.kind === 'prize') { sound.gone(); toast(`The ${trinket(f.prize).name.toLowerCase()} went down the side. There'll be another one on in a moment.`); restockSoon(); }
      else sound.lost();
      continue;
    }
    if (f.kind === 'prize') {
      const t = trinket(f.prize);
      wallet.give(t);
      saved.prizes = (saved.prizes || 0) + 1;
      // the cup's card says so too (once it's up, a prize the pile still pushes over goes on it as well)
      if (cup) cup.prizes.push(f.prize);
      else if (done) { done.prizes.push(f.prize); showDone(); }
      sound.prize();
      toast(`You won ${t.say}! It's on your shelf.`);
      say(`You won ${t.say}.`);
      pops.push({ x: f.x, text: t.emoji, t: 0, big: true });
      glow = 2.4;
      restockSoon();
    } else {
      // every second silver coin pays a ticket, and a gold one pays ten
      const pay = edgePays(f.kind, saved.odd), n = pay.tickets;
      saved.odd = pay.odd;
      sound.won(f.kind === 'gold');
      if (!n) continue;
      wallet.pay(n);
      if (cup) cup.won += n;
      else if (done) lateCoins(n);
      // coins going over together add up in one pop, rather than a row of +1s on top of each other
      const near = pops.find(p => p.n && p.t < 0.4 && Math.abs(p.x - f.x) < 75);
      if (near) { near.n += n; near.big ||= n > 1; near.x = (near.x + f.x) / 2; near.t = Math.min(near.t, 0.1); }
      else pops.push({ x: f.x, n, t: 0, big: n > 1 });
    }
    hud(true);
  }
}
let restockTimer = 0;
function restockSoon() {
  clearTimeout(restockTimer);
  restockTimer = setTimeout(() => {
    const had = machine.pieces.some(p => p.kind === 'prize');
    machine.restock(nextPrize());
    if (!had && machine.pieces.some(p => p.kind === 'prize')) { sound.restock(); say('Another prize is on the pusher.'); }
  }, 1500);
}

function say(text) { $('live').textContent = text; }

// The cup's empty once the last coin's down and the pile has gone quiet (or long enough has passed). The shelf may
// still push a few more over after that: they count for the cup too, on its card (see lateCoins).
function checkEnd(now) {
  if (!cup || cup.left > 0 || ended) return;
  const quiet = now - Math.max(lastDrop, lastFall);
  if (machine.showering || machine.dropping.length) return;
  if (quiet > 2600 || now - lastDrop > 9000) endCup();
}

let feeding = () => {};
$('payout').innerHTML = PAYOUT;
function endCup() {
  ended = true;
  done = { won: cup.won, prizes: cup.prizes, before: saved.best || 0, first: !saved.cups, top: topFive(saved), date: dayKey() };
  saved.cups = (saved.cups || 0) + 1;
  count({ round: 'topple' });
  cup = null;
  // today's special: 25 more tickets, out of the slot with the cup's (or with a late coin that makes it, below)
  done.bonus = claim('topple', { score: done.won });
  showDone();
  say(`The cup's empty: ${tickets(done.won)}.${done.bonus ? " Today's special!" : ''}`);
  $('over').hidden = false;
  feeding();
  feeding = feed($('payout'), done.won + done.bonus, { tick: () => sound.ticket(), onDone: cheer });
  $('again').focus({ preventScroll: true });
}
function lateCoins(n) {
  done.won += n;
  done.bonus ||= claim('topple', { score: done.won });
  showDone();
  feeding();
  feeding = feed($('payout'), done.won + done.bonus, { fresh: false, onDone: cheer });
}
const newBest = () => done.won > done.before && !done.first;
function showDone() {
  const { won, before } = done;
  // onto the top five (again, with late coins: from the five as they were before it)
  const { list, rank, entry } = place(done.top, won, done.date);
  if (entry) saved.top = list;
  if (won > (saved.best || 0)) saved.best = won;
  save();
  $('overT').textContent = `${CUP} coins, ${tickets(won)}`;
  $('overSpecial').textContent = endLine(done.bonus);
  $('overSpecial').hidden = !done.bonus;
  wonPrizes(done.prizes);
  bestLine($('overBest'), newBest() && ['A new best cup!', `The old one was ${tickets(before)}.`], `${onList(rank)}Best cup: ${tickets(saved.best)}.`);
  hud();
}
// The prizes a cup pushed off, under its card's heading: 'And a toy car and a lucky keyring for your shelf.'
const NUMBER = ['', 'a', 'two', 'three', 'four', 'five', 'six'];
const plural = name => name + (/(ch|sh|s|x)$/.test(name) ? 'es' : 's');
function wonPrizes(kinds) {
  const el = $('overPrize');
  el.hidden = !kinds.length;
  if (!kinds.length) return;
  const counts = new Map();
  for (const k of kinds) counts.set(k, (counts.get(k) || 0) + 1);
  const said = [...counts].map(([k, n]) => (n === 1 ? trinket(k).say : `${NUMBER[n] || n} ${plural(trinket(k).name.toLowerCase())}`));
  const list = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said[0];
  const pics = document.createElement('span');
  pics.className = 'e'; pics.setAttribute('aria-hidden', 'true');
  pics.textContent = kinds.map(k => trinket(k).emoji).join('');
  el.replaceChildren(`And ${list} for your shelf.`, pics);
}

// A new best cup rings out once its tickets are out (or a late coin makes it one), and the sign's bulbs blaze: once a cup.
function cheer() {
  if (!done || done.cheered || !newBest()) return;
  done.cheered = true;
  sound.best();
  glow = 2.4;
}

// ---------- the scoreboard ----------
function hud(bump = false) {
  $('won').textContent = fmt(cup ? cup.won : done ? done.won : 0);
  const have = wallet.read().tickets;
  $('tix').textContent = fmt(have);
  pocketButton($('tixBtn'), have);
  // Under the title card with no cup on the go, the next cup waits full (Drop wakes up with Play); after one, the end
  // card shows it empty.
  const left = cup ? cup.left : $('title').hidden ? 0 : CUP;
  $('left').textContent = left;
  $('coinsWord').textContent = left === 1 ? 'coin' : 'coins';
  document.querySelector('.cup').classList.toggle('empty', !left);
  $('drop').disabled = !(cup && cup.left);
  if (bump) { const b = $('won'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  $('titleBest').textContent = saved.cups ? `Best cup: ${tickets(saved.best)}.` : '';
  $('play').textContent = cup && cup.left > 0 ? 'Carry on' : 'Play';
}

// ---------- cards ----------
function start() {
  sound.unlock();
  $('title').hidden = true;
  $('over').hidden = true;
  closed();
  feeding();
  done = null;
  if (!cup) { cup = { left: CUP, won: 0, prizes: [] }; ended = false; }
  hud();
  save();
}
$('play').addEventListener('click', start);
$('again').addEventListener('click', start);

function toggleMenu(open = $('menu').hidden) {
  if (!$('title').hidden || !$('over').hidden) return;
  $('menu').hidden = !open;
  paused = open;
  finger = null; keys.clear();
  if (open) { save(); $('resume').focus({ preventScroll: true }); } else closed();
}
$('menuBtn').addEventListener('click', () => { sound.unlock(); toggleMenu(); });
$('resume').addEventListener('click', () => toggleMenu(false));
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

// ---------- the prize counter (the arcade's) ----------
function openPrizes() {
  finger = null;
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
addEventListener('free-play:wallet', () => hud());
addEventListener('pageshow', () => hud()); // back from the floor, where tickets may have been spent

// Topple open in another tab, or this page brought back by Back as it was: look at the save again, so a cup ending here
// adds to what's there now instead of writing an old copy over it. The deck, the cup and the coin waiting for its
// pair are this page's own.
function reread() {
  Object.assign(saved, { ...load(), field: saved.field, cup: saved.cup, odd: saved.odd });
  sound.setEnabled(soundOn(saved.sound));
  soundLabel();
  hud();
}
addEventListener('storage', e => { if (e.key === KEY) reread(); });
addEventListener('pageshow', e => { if (e.persisted) reread(); });
// the coins stay where they are for next time
addEventListener('pagehide', save);
// Leaving the page mid-cup (a call, another app, the phone locked) opens the menu, so the shelf waits there rather
// than carrying on the moment the page is back.
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); toggleMenu(true); } });

// ---------- every frame ----------
// Behind the title card the deck waits, as it does behind the menu, so whatever goes over the edge comes from a cup
// being played and counts for it. (Behind the end card it runs on: what still goes over counts for the cup just done.)
let last = performance.now(), owed = 0, lastLip = machine.lip;
function tick(now) {
  const dt = Math.min(100, now - last);
  last = now;
  const still = paused || !$('title').hidden;
  if (!still) {
    owed = Math.min(owed + dt * timeScale, STEP * 6 * timeScale);
    while (owed >= STEP) { machine.step(); owed -= STEP; happened(); }
    if (keys.size) aim = clampAim(aim + (keys.has('ArrowRight') ? 1 : -1) * 190 * dt / 1000);
    checkEnd(now);
  }
  const speed = Math.min(1, Math.abs(machine.lip - lastLip) / (dt / 1000 || 1) / 60);
  lastLip = machine.lip;
  sound.motor(still ? 0 : speed);
  for (const p of pops) p.t += dt / 1000;
  while (pops.length && pops[0].t > 1.1) pops.shift();
  glow = Math.max(0, glow - dt / 1000);
  draw.frame(machine, { now, aim, ready: machine.ready && !!cup && cup.left > 0, pops, glow, emoji: kind => trinket(kind)?.emoji || '🎁' });
  requestAnimationFrame(tick);
}

hud();
// Today's special, when it's Topple's day: its goal on the title card (or that it's made).
function special() { const t = titleLine('topple'); $('titleSpecial').textContent = t; $('titleSpecial').hidden = !t; }
special();
addEventListener('pageshow', special);
addEventListener('storage', e => { if (e.key === null || e.key?.startsWith('free-play.')) special(); });
// Back to a cup whose last coin went down just before leaving: it's finished, so its card comes up instead of the
// title card (and whatever the pile still pushes over counts for it).
if (cup && cup.left === 0) { $('title').hidden = true; endCup(); }
requestAnimationFrame(tick);

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: drop at a spot without a finger, and run the clock faster.
window.topple = {
  machine,
  get cup() { return cup; },
  get saved() { return saved; },
  get glow() { return glow; },
  start,
  drop(x) { if (x != null) aim = clampAim(x); return dropCoin(); },
  set speed(k) { timeScale = k; },
  draw,
};
