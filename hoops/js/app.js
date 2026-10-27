// Hoops: a basketball machine on the Free Play floor. This file runs it: the flick, the round, the score and the
// tickets at the end. js/court.js has the balls, the hoop and the rules, js/draw.js draws the machine, and
// js/sound.js makes the noises. Tickets go into the arcade's wallet (../shared/wallet.js) at the end of a round.

import { createCourt, ticketsFor, power, flickFor, FLICK, SWEET, HOOP, LAUNCH } from './court.js';
import { createDraw } from './draw.js';
import * as sound from './sound.js';
import * as wallet from '../../shared/wallet.js';
import { openCounter, counterOpen, feed, bestLine, bump, PAYOUT, fmt } from '../../shared/counter.js';
import { insets } from '../../shared/insets.js';

const $ = id => document.getElementById(id);
const KEY = 'free-play.hoops';
const STEP = 1 / 60;
const WINDOW = 90;             // ms: how much of the end of a flick counts toward its speed
const STROKE = 220;            // ms: and toward its direction, since a thumb tends to curl off to the side at the end

// ---------- what's kept between visits ----------
// Hoops' own: the best round, how many rounds, and the sound.
const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  s = { best: 0, rounds: 0, sound: true, ...(s && typeof s === 'object' ? s : {}) };
  for (const k of ['best', 'rounds']) s[k] = Number.isFinite(+s[k]) ? +s[k] : 0; // a hand-edited or broken number
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the balls still bounce */ }
}
sound.setEnabled(saved.sound);

// ---------- the picture ----------
const canvas = $('stage');
const draw = createDraw(canvas);
const deck = $('deck');

// On a phone the deck sits under the machine, the width of it; on a wide screen it stands beside it.
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
    Object.assign(deck.style, { left: `${cab.left + cab.width * 0.02}px`, width: `${cab.width * 0.96}px`, top: `${cab.bottom - 2}px` });
    // On a short phone the cabinet is narrower, and the deck with it: its hint gets smaller, then goes (see the CSS).
    deck.classList.toggle('narrow', deck.offsetWidth < 290);
    deck.classList.toggle('narrower', deck.offsetWidth < 220);
  }
}
addEventListener('resize', layout);
layout();
if (document.fonts) Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('600 15px Figtree')]).then(() => draw.repaint()).catch(() => {});

// ---------- a round ----------
let court = createCourt({ timed: false });
let mode = 'title';            // title → play → over (behind the title, the machine shoots by itself)
let paused = false, timeScale = 1, hold = 0, demoIn = 1;
let endIn = 0;                 // seconds from the last ball landing to the end card, on the round's clock (it waits while paused)
let tickets = wallet.read().tickets; // the pocket, read again only when it changes (see the scoreboard)
const pops = [];
const carded = () => !$('title').hidden || !$('over').hidden || !$('menu').hidden || counterOpen();

function newRound() {
  court = createCourt();
  mode = 'play';
  tickets = wallet.read().tickets;
  pops.length = 0; flicks.clear(); keyAim = null; charge = null; early = null; endIn = 0;
  hud();
}

// Throw the ball in the pocket: speed in cm/s, aim in radians off straight ahead. One let go a moment before the
// next ball's there waits for it, briefly.
const EARLY = 0.35;            // seconds
let early = null;
function throwIt(speed, aim) {
  sound.unlock();
  if (mode !== 'play' || paused || carded()) return null;
  const b = court.shoot(speed, aim);
  early = b || court.buzzer ? null : { speed, aim, left: EARLY };
  happened();
  return b;
}

// What the balls did since the last look. The scoreboard is only redone when something happened: 60 times a second,
// it had the phone redoing it for nothing.
function happened() {
  const events = court.take();
  for (const e of events) {
    if (mode !== 'play') continue; // the machine playing by itself keeps quiet
    if (e === 'slide') { sound.slide(); say('The hoop is on the move.'); pops.push({ text: 'On the move!', t: -0.2, y: 34 }); }
    else if (e === 'bonus') { sound.bonus(); say('Last ten seconds: 3 points a basket.'); pops.push({ text: '3 points!', t: -0.2, y: 34, gold: true, big: true }); }
    else if (e === 'buzzer') { sound.buzzer(); say('Time.'); }
    else if (e === 'over') endIn = 0.7;
    else if (e.shot !== undefined) sound.shot();
    else if (e.rim !== undefined) sound.rim(e.rim);
    else if (e.board !== undefined) sound.board(e.board);
    else if (e.thud !== undefined) sound.thud(e.thud);
    else if (e.knock !== undefined) sound.knock(e.knock);
    else if (e.basket !== undefined) {
      sound.basket(e.swish, e.gold);
      const word = e.buzzer ? 'At the buzzer!' : e.swish ? 'Swish!' : e.bank ? 'Off the glass!' : null;
      pops.push({ text: `+${e.points}`, t: 0, gold: e.gold || e.fire, big: e.points > 3 });
      if (word) pops.push({ text: word, t: -0.05, y: 24, gold: e.buzzer, word: true });
      bump($('score'));
    } else if (e.fire === true) { sound.fire(true); say('Three in a row: the rim is alight.'); pops.push({ text: 'On fire!', t: -0.15, y: 50, gold: true, big: true }); }
    else if (e.fire === false) sound.fire(false);
  }
  if (events.length) hud();
}

let feeding = () => {};
$('payout').innerHTML = PAYOUT;
// While a round's tickets feed out of the slot, the pocket in the corner counts along with them: it holds what the
// wallet holds less those still to come out. Once they're all out (or another round or leaving stops the strip), it
// holds them all, with a bump.
let toCome = 0;
const counting = n => k => { toCome = n - k; hud(); if (k === n && n) bump($('tixBtn')); };
addEventListener('pagehide', () => feeding());

function endRound() {
  if (mode !== 'play') return;
  mode = 'over';
  const score = court.score, won = ticketsFor(score), first = !saved.rounds;
  wallet.pay(won);
  saved.rounds++;
  const old = saved.best, isBest = score > old && !first;
  if (score > saved.best) saved.best = score;
  save();
  const n = court.baskets, swish = court.swishes;
  $('overT').textContent = `${score.toLocaleString('en-US')} ${score === 1 ? 'point' : 'points'}`;
  $('overHow').textContent = `${n} ${n === 1 ? 'basket' : 'baskets'} from ${court.shots} ${court.shots === 1 ? 'shot' : 'shots'}`
    + (swish ? `, ${swish === n ? (n === 1 ? 'nothing but net' : 'all of them nothing but net') : `${swish} nothing but net`}` : '') + '. A ticket for every 4 points.';
  bestLine($('overBest'), isBest && ['A new best!', `Your old one was ${fmt(old)}.`], `Best: ${saved.best.toLocaleString('en-US')}`);
  $('over').hidden = false;
  feeding();
  // a new best rings out once the tickets are out, not over them
  feeding = feed($('payout'), won, { tick: () => sound.ticket(), onCount: counting(won), onDone: () => { if (isBest) sound.best(); } });
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

// ---------- the flick ----------
// Each finger down is a flick in the making; when it lifts, the last part of its path says how hard and which way.
const flicks = new Map();
function track(e) {
  const s = flicks.get(e.pointerId);
  if (!s) return;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of list.length ? list : [e]) s.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  if (s.length > 40) s.splice(0, s.length - 40);
}
canvas.addEventListener('pointerdown', e => {
  sound.unlock();
  if (e.button > 0 || mode !== 'play' || paused || carded()) return;
  flicks.set(e.pointerId, [{ t: e.timeStamp, x: e.clientX, y: e.clientY }]);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without */ }
  e.preventDefault();
});
canvas.addEventListener('pointermove', track);
canvas.addEventListener('pointerup', e => {
  const s = flicks.get(e.pointerId);
  if (!s) return;
  // a finger lifting where it last was adds nothing but a pause
  const at = s[s.length - 1];
  if (e.clientX !== at.x || e.clientY !== at.y) track(e);
  flicks.delete(e.pointerId);
  flick(s);
});
canvas.addEventListener('pointercancel', e => flicks.delete(e.pointerId));

function flick(s) {
  const last = s[s.length - 1];
  const from = ms => { let i = s.length - 1; while (i > 0 && last.t - s[i - 1].t <= ms) i--; return s[i]; };
  const first = from(WINDOW), dt = (last.t - first.t) / 1000;
  if (dt <= 0.004 || last.y - first.y > -4) return null;
  const cab = draw.cabinet();
  const speed = Math.hypot(last.x - first.x, last.y - first.y) / dt / (cab.bottom - cab.top);
  // which way: the whole stroke, or the last part of a long one
  const start = from(STROKE), dx = last.x - start.x, dy = last.y - start.y;
  if (speed < FLICK.min || dy > -4 || Math.abs(dx) > -dy * 1.7) return null;
  const across = draw.aimAt(dx, dy);
  if (across === null) return null;
  return throwIt(power(speed), Math.atan2(across - LAUNCH.x, HOOP.z - LAUNCH.z));
}

// The keyboard: the arrows aim, and holding Space winds up a throw; let go when the meter's in the light.
let keyAim = null, charge = null;
const meterNow = () => { const p = ((performance.now() - charge) / 1000) % 2; return p < 1 ? p : 2 - p; };
addEventListener('keydown', e => {
  if (counterOpen()) return; // the counter takes its own keys
  if (e.key === 'Escape') { toggleMenu(); return; }
  if (e.target.closest && e.target.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
  if (!$('title').hidden && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start(); return; }
  if (mode !== 'play' || paused || carded()) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    keyAim = Math.max(-0.2, Math.min(0.2, (keyAim ?? 0) + (e.key === 'ArrowLeft' ? -0.01 : 0.01)));
  } else if ((e.key === ' ' || e.key === 'ArrowUp') && !e.repeat && charge === null) {
    e.preventDefault();
    sound.unlock();
    keyAim ??= 0;
    charge = performance.now();
  }
});
addEventListener('keyup', e => {
  if ((e.key !== ' ' && e.key !== 'ArrowUp') || charge === null) return;
  const m = meterNow();
  charge = null;
  // the middle of the meter is the sweet flick
  throwIt(power(m * 2 * FLICK.sweet), keyAim ?? 0);
});

// ---------- the scoreboard ----------
// Each line is only written when it says something new.
const put = (id, text) => { const el = $(id); if (el.textContent !== String(text)) el.textContent = text; };
function hud() {
  put('score', court.score.toLocaleString('en-US'));
  put('tix', fmt(Math.max(0, tickets - toCome)));
  const playing = mode === 'play';
  const worth = (playing && court.bonus ? 3 : 2) + (playing && court.fire ? 1 : 0);
  if ($('worth').textContent !== String(worth)) { $('worth').textContent = worth; if (playing) bump($('worth')); }
  put('worthWord', 'points a basket');
  $('worthBox').classList.toggle('bonus', playing && court.bonus);
  $('worthBox').classList.toggle('hot', playing && court.fire);
  put('titleBest', saved.rounds ? `Best: ${saved.best.toLocaleString('en-US')}.` : '');
}

// ---------- the menu and the prize counter ----------
function toggleMenu(open = $('menu').hidden) {
  if (!$('title').hidden || !$('over').hidden) return;
  $('menu').hidden = !open;
  paused = open;
  if (open) { flicks.clear(); charge = null; early = null; $('resume').focus({ preventScroll: true }); }
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
// tickets won or spent here, at the counter, in another tab, or on the floor while this page was kept: read them again
const pocket = () => { tickets = wallet.read().tickets; hud(); };
addEventListener('free-play:wallet', pocket);
addEventListener('pageshow', pocket);

// Hoops open in another tab, or this page brought back by Back as it was: look at the save again, so a round ending
// here adds to what's there now instead of writing an old copy over it.
function reread() {
  Object.assign(saved, load());
  sound.setEnabled(saved.sound);
  soundLabel();
  hud();
}
addEventListener('storage', e => { if (e.key === KEY) reread(); });
addEventListener('pageshow', e => { if (e.persisted) reread(); });

// Behind the title, the machine shoots by itself now and then, mostly in.
function demo(dt) {
  demoIn -= dt;
  if (demoIn > 0) return;
  demoIn = 1 + Math.random() * 0.8;
  const r = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  court.shoot(power(FLICK.sweet * (1 + 0.06 * r())), 0.012 * r());
}

// ---------- every frame ----------
let last = performance.now(), owed = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    owed = Math.min(owed + dt * timeScale, STEP * 6 * timeScale);
    while (owed >= STEP) {
      court.step(STEP); owed -= STEP;
      if (early && mode === 'play') {
        early.left -= STEP;
        if (court.pocket()) { court.shoot(early.speed, early.aim); early = null; } else if (early.left <= 0) early = null;
      }
      if (mode === 'title') demo(STEP);
      if (endIn > 0 && (endIn -= STEP) < 1e-6) { endIn = 0; endRound(); }
      if (mode === 'play') happened(); else court.take();
    }
  }
  // a finger down (or Space held) lifts the ball in the pocket, ready to throw
  const ready = (flicks.size > 0 || charge !== null) && mode === 'play' && court.pocket();
  hold = Math.max(0, Math.min(1, hold + (ready ? dt * 12 : -dt * 8)));
  for (const p of pops) p.t += dt;
  while (pops.length && pops[0].t > 1.1) pops.shift();
  draw.frame(court, { now, hold, pops, aim: mode === 'play' ? keyAim : null, meter: charge !== null ? meterNow() : null });
  requestAnimationFrame(tick);
}

hud();
requestAnimationFrame(tick);

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: throw without a finger, and run the clock faster.
window.hoops = {
  get court() { return court; },
  get mode() { return mode; },
  get saved() { return saved; },
  start,
  shoot: throwIt,
  flick,
  sweet: () => power(FLICK.sweet),
  aimAt: x => Math.atan2(x - LAUNCH.x, HOOP.z - LAUNCH.z),
  flickFor,
  SWEET,
  set speed(k) { timeScale = k; },
  draw,
};
