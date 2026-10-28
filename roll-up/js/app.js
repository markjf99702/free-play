// Roll Up: skee-ball, a machine on the Free Play floor. This file runs the game: the turns, the flick, the score,
// today's card and the tickets. js/physics.js moves the ball, js/scene.js draws it and js/sound.js makes the noises.
// The tickets go into the arcade's one wallet (../shared/wallet.js), and the prize counter is the arcade's too.

import * as phys from './physics.js';
import { createScene } from './scene.js';
import * as sound from './sound.js';
import { dayKey, dayBefore, cardFor, points, shareLine, settle as settleOld, ticketsFor, feat, BALLS } from './daily.js';
import { trophy } from '../../shared/prizes.js';
import * as wallet from '../../shared/wallet.js';
import { soundOn, switchSound } from '../../shared/sound.js';
import { openCounter, bigPrize, counterOpen, toast, feed, bestLine, bump, pocketButton, tickets, PAYOUT, fmt } from '../../shared/counter.js';
import { insets } from '../../shared/insets.js';
import { topFive, place, onList, count } from '../../shared/records.js';

const $ = id => document.getElementById(id);
const KEY = 'free-play.roll-up';
const { LANE, R } = phys;
// Asked for less motion (the system's setting, read each frame): the push-in onto the board cuts rather than glides.
const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

// How a flick becomes a roll is the physics' (phys.flick): the flick is the finger's last FLICK.window ms, and one
// slower than FLICK.min up the lane isn't a roll.
const { FLICK } = phys;
// On a keyboard, Space held winds a meter up and down, and letting go rolls the ball straight up the lane, from 190 cm/s
// with the meter empty to 510 full.
const keyRoll = k => 190 + k * 320;
// Where the meter's marks go, worked out once by rolling straight up the middle of the lane in the physics at a run of
// points on the meter (with its bounces' random held at a half, so it comes out the same every time). The meter turns
// red from the first roll that sails over the rings into the 10, and a faint tick marks the middle of the run of rolls
// just under that which drop in the 50. Nothing sails over: it never turns red.
let marks = null;
function meterMarks() {
  if (marks) return marks;
  const fixed = () => 0.5, lands = k => phys.simulate(0, keyRoll(k), 0, fixed).value;
  let fifty = [], under = 0, over = null;
  for (let i = 15; i <= 50 && over == null; i++) {
    const k = i / 50, v = lands(k);
    if (v === 10) over = k;
    else {
      if (v === 50) fifty = fifty.length && fifty.at(-1) < k - 0.03 ? [k] : [...fifty, k];
      under = k;
    }
  }
  if (over != null) for (let j = 0; j < 5; j++) { const m = (under + over) / 2; if (lands(m) === 10) over = m; else under = m; }
  marks = { red: over ?? 2, tick: fifty.length ? (fifty[0] + fifty.at(-1)) / 2 : null };
  return marks;
}
(globalThis.requestIdleCallback || setTimeout)(meterMarks);

// ---------- what's kept between visits ----------
// Roll Up's own: the best score, games played, today's card (once played: daily; part-way: going) and the sound.
// Tickets and prizes are the arcade's.
const saved = load();
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* none yet, or storage is off */ }
  s = { best: 0, games: 0, sound: true, ...(s && typeof s === 'object' ? s : {}) };
  for (const k of ['best', 'games']) s[k] = Number.isFinite(+s[k]) ? +s[k] : 0; // a hand-edited or broken number
  return s;
}
// Today's card, if it's been played: a card saved without its balls doesn't count.
const playedToday = () => { const d = saved.daily; return d && d.key === dayKey() && Array.isArray(d.balls) ? d : null; };
// Today's card part-way through: its first ball has been rolled, and it waits where it was left.
const goingToday = () => { const g = saved.going; return g && g.key === dayKey() && Array.isArray(g.balls) ? g : null; };
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the game still plays */ }
}
// A card left part-way on an earlier day counts as played that day, with the balls it rolled (see settle() in
// daily.js), and they pay now.
function settleCard() {
  const s = settleOld(saved);
  if (s === saved) return;
  const played = s.daily !== saved.daily;
  for (const k of Object.keys(saved)) delete saved[k];
  Object.assign(saved, s);
  save();
  if (played) { count({ round: 'roll-up' }); wallet.pay(s.daily.won); if (s.daily.trophy) wallet.give(trophy('trophy-roll-up')); }
}
settleCard();
sound.setEnabled(soundOn(saved.sound));

// ---------- the scene ----------
const canvas = $('stage');
const scene = createScene(canvas);
const notes = document.querySelector('.notes');
function layout() {
  const hud = document.querySelector('.hud').getBoundingClientRect();
  scene.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1), {
    top: Math.max(hud.bottom + 4, 56),
    bottom: insets().bottom + 4, // clear of an iPhone's home indicator
  });
  // The notes about the ball in hand float mid-lane, from 150 cm up it: clear of the red line and of where a finger
  // takes the ball (up to 108 cm), and under the board.
  notes.style.bottom = `${innerHeight - scene.project({ x: 0, y: phys.ground(150), z: 150 }).y}px`;
}
addEventListener('resize', layout);
layout();
if (document.fonts) document.fonts.load('400 20px Bungee').then(() => scene.repaint()).catch(() => {});

// ---------- the game ----------
let mode = 'title';          // title → aim ⇄ drag → roll → result → (deal → aim) … → over
// balls: what each ball did, { value, points, golden, call, hit }. card: today's card, for a daily game.
let game = { thrown: 0, score: 0, balls: [], golden: -1, card: null };
let ball = phys.newBall(0);
let handX = 0;
let shown = 0;               // the score on the board, counting up to game.score
let resultT = 0, deal = null, drag = null, charge = null, thrownOnce = false;
let paused = false, timeScale = 1;
let foulAt = 0;              // when the ball was last carried over the red line too slowly to roll (the line flashes)
let pingAt = 0, pingOff = 0; // when a touch up the lane, past where a grab starts, last asked to start on the ball
const PING = 1500;           // how long that says so, in ms (the ring round the ball pulses for the first 600)
let zoom = 0;                // 0: the whole machine; 1: pushed in on the board while the ball's up there
const pops = [];
let flash = null;
const lights = { mode: 'idle', t: 0 };
const TROUGH_POP = 26;       // how far up the board (cm) a ball in the trough shows what it scored

// A new game, or today's card: a fresh one, or the one on the go, where it was left.
function newGame(daily = false) {
  const going = daily ? goingToday() : null;
  const card = daily ? cardFor(dayKey()) : null;
  // one ball of the nine is golden: today's card says which, otherwise it's a surprise
  game = { thrown: 0, score: 0, balls: [], card, golden: card ? card.golden : Math.floor(Math.random() * BALLS) };
  if (going) {
    game.balls = going.balls.slice(0, BALLS);
    game.thrown = game.balls.length;
    game.score = game.balls.reduce((t, b) => t + (Number(b?.points) || 0), 0);
  }
  shown = game.score;
  ball = phys.newBall(handX);
  ball.golden = game.golden === game.thrown;
  pops.length = 0; flash = null;
  lights.mode = 'idle';
  mode = 'aim';
  // (all nine rolled, and the page gone before the card came up: it's over)
  if (game.thrown >= BALLS) { mode = 'result'; resultT = 1.05; }
  hud();
}
// Today's card, as it stands: kept with every ball rolled, so leaving keeps it.
function keepCard() {
  saved.going = { key: game.card.key, score: game.score, balls: game.balls };
  save();
}

function trayCount() {
  if (mode === 'title') return BALLS - 1;
  if (mode === 'result' || mode === 'over') return BALLS - game.thrown;
  return BALLS - game.thrown - 1;
}
// Which tray spot holds the golden ball, if it's still waiting. The next ball is the last spot in the row.
function trayGold() {
  if (mode === 'title') return -1;
  const n = trayCount(), first = mode === 'result' || mode === 'over' ? game.thrown : game.thrown + 1;
  const i = n - 1 - (game.golden - first);
  return i >= 0 && i < n ? i : -1;
}
const callNow = () => (game.card && ['aim', 'drag', 'roll', 'deal'].includes(mode) ? game.card.calls[game.thrown] : null);

// What a ball that dropped into `value` is worth this time, and what the pop-up says about it.
function worth(value) {
  const call = game.card ? game.card.calls[game.thrown] : null;
  const w = points(value, { call, golden: ball.golden });
  const why = [w.hit && 'called', ball.golden && value && 'golden'].filter(Boolean);
  w.call = call;
  w.sub = why.length === 2 ? 'called + gold ×4' : why.length ? `${why[0]} ×2` : null;
  w.subColor = w.hit ? '#5ee6d8' : '#ffd36a';
  return w;
}

function throwBall(vx, vz) {
  phys.launch(ball, vx, vz);
  mode = 'roll';
  thrownOnce = true;
  handX = ball.x;
  if (game.card && !goingToday()) keepCard(); // the first ball rolled: the card is yours
  hud();
}
// A ball still rolling on today's card as the page goes, or goes out of sight: it's played out there and then, as it
// would have gone, so it can't be rolled again.
function rollOut() {
  if (!game.card || mode !== 'roll') return;
  phys.advance(ball, 30);
  sound.rolling(0);
  if (ball.state === 'done') scored();
}

// The ball is done: it dropped in a hole, fell in the trough, or didn't make the jump.
function scored() {
  const v = ball.value;
  const w = worth(v);
  let hard = false; // in the 10 from rolling too hard: three of those in a game, and its end card says so
  if (!ball.hole) {
    // a hole already rang its bell and showed its number as the ball dropped in. One in the trough rises from the
    // lower board on its side, clear of the 10s printed along the bottom edge and of the numbers down the middle
    const side = (ball.x < 0 ? -1 : 1) * Math.max(0.4, Math.min(0.6, Math.abs(ball.x) / phys.BOARD.half)) * phys.BOARD.half;
    const at = ball.why === 'short'
      ? { x: ball.x, y: phys.ground(LANE.foul + 30) + 8, z: LANE.foul + 30 }
      : phys.fromBoard(side, TROUGH_POP, 4);
    let { sub, subColor } = w;
    if (ball.why === 'trough') {
      // and says why, when it's plain: it flew past the 50 (or into the net), or never got as far as the 20
      const [twenty, fifty] = [20, 50].map(v => phys.RINGS.find(r => r.value === v));
      const why = ball.net || ball.top > fifty.s + fifty.r ? 'too hard' : ball.top < twenty.s - twenty.r ? 'a bit soft' : null;
      hard = why === 'too hard';
      if (why) { sub = sub ? `${sub}, ${why}` : why; subColor = w.sub ? subColor : null; }
    }
    pops.push({ text: v ? '+' + w.points : 'No jump', sub, subColor, ...at, age: 0, big: false });
    sound.score(v);
    lights.mode = 'score'; lights.t = 0;
  }
  game.score += w.points;
  game.balls.push({ value: v, points: w.points, golden: !!ball.golden, call: w.call, hit: w.hit, ...(hard && { hard }) });
  game.thrown++;
  if (game.card) keepCard();
  const left = BALLS - game.thrown;
  const extra = w.hit ? ', the called shot' : '';
  // (after the last ball, the end of the game says the rest: see gameOver)
  $('live').textContent = `${w.points} points${extra}.` + (left ? ` ${fmt(game.score)} so far, ${left} ${left === 1 ? 'ball' : 'balls'} left.` : '');
  mode = 'result';
  resultT = 0;
  hud();
}

function intoHole(hole) {
  const p = phys.fromBoard(hole.u, hole.s, 3);
  const w = worth(hole.value);
  pops.push({ text: '+' + w.points, sub: w.sub, subColor: w.subColor, ...p, age: 0, big: w.points >= 50 });
  flash = { hole, t: 0 };
  sound.drop();
  sound.score(w.hit || ball.golden ? Math.max(50, hole.value) : hole.value);
  lights.mode = hole.value === 100 || w.hit ? 'win' : 'score'; lights.t = 0;
  if (navigator.vibrate) try { navigator.vibrate(hole.value >= 50 ? [18, 40, 18] : 12); } catch { /* not allowed */ }
}

function nextBall() {
  const from = scene.traySpot(BALLS - game.thrown - 1);
  ball = phys.newBall(handX);
  ball.golden = game.golden === game.thrown;
  deal = { t: 0, from, to: { x: ball.x, y: ball.y, z: ball.z } };
  ball.x = from.x; ball.y = from.y; ball.z = from.z;
  mode = 'deal';
  hud();
}

function gameOver() {
  mode = 'over';
  const won = ticketsFor(game.score);
  const first = saved.games === 0;
  const result = { score: game.score, balls: game.balls, won };
  wallet.pay(won);
  saved.games++;
  count({ round: 'roll-up' });
  if (game.card) {
    // today's card: kept for the title card and the share line, with the run of days played
    const key = game.card.key, prev = saved.daily;
    result.key = key;
    result.streak = prev && prev.key === dayBefore(key) ? (prev.streak || 1) + 1 : 1;
    // eight of the nine calls: the trophy, onto the shelf now
    if (feat(game.balls)) { result.trophy = true; wallet.give(trophy('trophy-roll-up')); }
    saved.daily = result;
    saved.longest = Math.max(Number(saved.longest) || 0, result.streak); // the longest run of days, for the records
    delete saved.going;
  } else {
    result.isBest = game.score > saved.best && !first;
    result.was = saved.best;
    // onto the top five, with the day
    const p = place(topFive(saved), game.score);
    if (p.entry) saved.top = p.list;
    result.rank = p.rank;
    if (game.score > saved.best) saved.best = game.score;
  }
  save();
  dailyButton();
  const calls = game.card ? ` ${game.balls.filter(b => b.hit).length} of 9 calls.` : '';
  $('live').textContent = `Game over: ${fmt(game.score)} points, ${tickets(won)}.${calls}${result.isBest ? ' A new best.' : ''}`;
  showOver(result, true);
  if (result.isBest) { lights.mode = 'win'; lights.t = 0; }
  sound.fanfare();
}

// The game-over card, for a game just finished (the tickets feed out) or for today's card played earlier.
let feeding = () => {};
$('payout').innerHTML = PAYOUT;
// While a round's tickets feed out of the slot, the pocket in the corner counts along with them: it holds what the
// wallet holds less those still to come out. Once they're all out (or another round or leaving stops the strip), it
// holds them all, with a bump. (Today's card shown again counts nothing: its tickets went in long ago.)
let toCome = 0;
const counting = n => k => { toCome = n - k; hud(); if (k === n && n) bump($('tixBtn')); };
// Leaving after the ninth ball has dropped, before the game-over card (by the menu's Back to the arcade, say), the game
// is over all the same: it pays as the page goes (today's card is played), and its card is what's up if the page
// comes back.
addEventListener('pagehide', () => {
  rollOut();
  if (mode === 'result' && game.thrown >= BALLS) { $('menu').hidden = true; paused = false; gameOver(); }
  feeding();
});

function showOver(r, fresh) {
  const daily = !!r.key;
  // the heading in two lines: which game, small, and its score, big
  const which = document.createElement('small');
  which.textContent = daily ? "Today's card" : 'Nine balls';
  $('overT').replaceChildren(which, ' ', `${fmt(r.score)} ${r.score === 1 ? 'point' : 'points'}`);
  // the trophy, for eight of the nine calls on today's card (or all nine)
  $('overFeat').hidden = !r.trophy;
  $('overFeat').textContent = r.trophy ? `🏆 ${r.balls.every(b => b.hit) ? 'All nine calls' : 'Eight of the nine calls'}! The ${trophy('trophy-roll-up').name} is on your shelf.` : '';
  // what to try next time, when it's plain from the balls
  $('overTip').hidden = r.balls.filter(b => b.hard).length < 3;
  $('overTip').textContent = $('overTip').hidden ? '' : 'Gentler: the 50 wants a medium roll.';
  $('tally').replaceChildren(...r.balls.map(b => {
    const c = document.createElement('span');
    c.textContent = b.points;
    c.className = [b.golden && 'golden', b.hit && 'called', !b.golden && b.value >= 50 && 'hi'].filter(Boolean).join(' ');
    c.title = [b.hit && 'called shot', b.golden && 'golden ball'].filter(Boolean).join(', ');
    return c;
  }));
  $('stars').hidden = !daily;
  if (daily) {
    const hits = r.balls.filter(b => b.hit).length;
    $('stars').innerHTML = '';
    const b = document.createElement('b');
    b.textContent = r.balls.map(x => (x.hit ? '★' : '☆')).join('');
    $('stars').append(b, `${hits} of 9 calls${r.streak > 1 ? ` · ${r.streak} days in a row` : ''}`);
  }
  bestLine($('overBest'), !daily && r.isBest && ['A new best!', `Your old one was ${fmt(r.was)}.`], daily ? 'A new card comes at midnight.' : `${onList(r.rank)}Best: ${fmt(saved.best)}.`);
  $('share').hidden = !daily;
  $('again').textContent = daily ? 'Play a regular game' : 'Roll again';
  $('over').hidden = false;
  $('title').hidden = true;
  // the tickets come out of the slot one by one, and the strip grows
  feeding();
  // a new best rings out once the tickets are out, not over them
  feeding = feed($('payout'), r.won, { fresh, tick: () => sound.ticket(), onCount: fresh ? counting(r.won) : null, onDone: () => { if (fresh && r.isBest) sound.best(); } });
  hud();
  if (fresh) $('again').focus({ preventScroll: true });
}

// ---------- the scoreboard ----------
function hud() {
  $('score').textContent = fmt(Math.round(shown));
  const n = mode === 'result' || mode === 'over' ? game.thrown : game.thrown + 1;
  $('ballNo').textContent = mode === 'over' ? 'Game over' : `Ball ${Math.min(BALLS, Math.max(1, n))} of ${BALLS}`;
  const have = Math.max(0, wallet.read().tickets - toCome);
  $('tix').textContent = fmt(have);
  pocketButton($('tixBtn'), have);
  const pinged = mode === 'aim' && pingAt && performance.now() - pingAt < PING;
  $('hint').hidden = !(mode === 'aim' && (!thrownOnce || pinged));
  const hint = pinged ? 'Start on the ball, then flick' : keyed ? '← → move, hold Space to roll' : 'Drag the ball, flick it up the lane';
  if ($('hint').textContent !== hint) $('hint').textContent = hint;
  const ready = ['aim', 'drag', 'deal'].includes(mode);
  const call = callNow();
  $('callNote').hidden = !(ready && call);
  if (call) $('callV').textContent = call;
  $('goldNote').hidden = !(ready && ball.golden);
}

// ---------- flicking the ball ----------
function sample(e) {
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of list.length ? list : [e]) {
    const w = scene.unproject(ev.clientX, ev.clientY);
    if (w) drag.samples.push({ t: ev.timeStamp, x: w.x, z: w.z });
  }
  if (drag.samples.length > 40) drag.samples.splice(0, drag.samples.length - 40);
}

canvas.addEventListener('pointerdown', e => {
  sound.unlock();
  if (mode !== 'aim' || paused || charge) return;
  const w = scene.unproject(e.clientX, e.clientY);
  if (!w) return;
  if (w.z > LANE.foul + 50) {
    // a touch up by the board isn't a grab. One on the lane, short of the jump, is someone trying to: say where to start
    if (w.z < phys.JUMP.z0 && Math.abs(w.x) <= LANE.half) startOnBall();
    return;
  }
  pingAt = 0;
  drag = { id: e.pointerId, off: { x: ball.x - w.x, z: ball.z - w.z }, samples: [] };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without */ }
  mode = 'drag';
  hud(); // the hint has done its job
  sample(e);
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (mode !== 'drag' || !drag || e.pointerId !== drag.id) return;
  sample(e);
  const last = drag.samples[drag.samples.length - 1];
  if (!last) return;
  const lim = LANE.half - R - 0.5;
  ball.x = Math.max(-lim, Math.min(lim, last.x + drag.off.x));
  const z = last.z + drag.off.z;
  ball.z = Math.max(LANE.start - 12, Math.min(LANE.foul, z));
  ball.y = phys.ground(ball.z) + R;
  if (z >= LANE.foul) release(true); // over the line: it's gone
});
canvas.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) release(); });
canvas.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) { drag = null; settle(); } });

// over: the finger carried the ball over the red line, rather than lifting.
function release(over = false) {
  const s = drag.samples;
  drag = null;
  if (s.length < 2) return settle(over);
  const last = s[s.length - 1];
  let i = s.length - 2;
  while (i > 0 && last.t - s[i - 1].t <= FLICK.window) i--;
  const first = s[i], dt = (last.t - first.t) / 1000;
  if (dt <= 0.004) return settle(over);
  const vx = (last.x - first.x) / dt, vz = (last.z - first.z) / dt;
  if (vz < FLICK.min) return settle(over);
  const roll = phys.flick(vx, vz);
  throwBall(roll.vx, roll.vz);
}

// A touch up the lane, past where a grab starts: the hint comes back for a moment saying to start on the ball, a ring
// pulses round it, and the red line's click sounds, quietly.
function startOnBall() {
  pingAt = performance.now();
  sound.foul(0.5);
  $('live').textContent = 'Start on the ball, then flick.';
  hud();
  clearTimeout(pingOff);
  pingOff = setTimeout(hud, PING + 20);
}

// Not a throw: the ball goes back to its spot behind the line, where the finger left it across the lane. Carried over
// the red line too slowly to roll (foul), the line flashes and says so.
function settle(foul = false) {
  handX = ball.x;
  ball.z = LANE.start;
  ball.y = phys.ground(ball.z) + R;
  mode = 'aim';
  hud();
  if (foul) {
    foulAt = performance.now();
    sound.foul();
    $('live').textContent = 'Flick it before the red line.';
  }
}

// The keyboard: arrows move the ball, Space winds up and lets go.
const chargeLevel = () => { const p = ((performance.now() - charge.t0) / 1500) % 2; return p < 1 ? p : 2 - p; };
// Once a key's been pressed, the first ball's hint says how to roll on a keyboard.
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'Enter'];
let keyed = false;
addEventListener('keydown', e => {
  if (KEYS.includes(e.key) && !counterOpen() && !keyed) { keyed = true; hud(); }
  if (e.target.closest && e.target.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
  if (counterOpen()) return; // the counter takes its own keys
  if (e.key === 'Escape') { toggleMenu(); return; }
  if (paused) return;
  if (mode === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(); return; }
  if (mode !== 'aim') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const lim = LANE.half - R - 0.5;
    ball.x = Math.max(-lim, Math.min(lim, ball.x + (e.key === 'ArrowLeft' ? -1.6 : 1.6)));
    handX = ball.x;
    e.preventDefault();
  } else if ((e.key === ' ' || e.key === 'ArrowUp') && !e.repeat && !charge) {
    sound.unlock();
    charge = { t0: performance.now() };
    e.preventDefault();
  }
});
addEventListener('keyup', e => {
  if (!charge || (e.key !== ' ' && e.key !== 'ArrowUp')) return;
  const k = chargeLevel();
  charge = null;
  if (mode === 'aim') throwBall(0, keyRoll(k));
});

// ---------- cards ----------
function start(daily = false) {
  sound.unlock();
  $('title').hidden = true;
  $('over').hidden = true;
  newGame(daily);
}
$('play').addEventListener('click', () => start());
$('again').addEventListener('click', () => start());

// Today's card: play it once a day; after that the button shows how it went.
function dailyButton() {
  const d = playedToday(), done = !!d;
  $('daily').classList.toggle('done', !!done);
  $('daily').textContent = done ? `Today: ${fmt(d.score)}` : "Today's card";
  // yesterday's card played, the run of days goes on with today's
  const y = saved.daily, run = !done && y?.key === dayBefore(dayKey()) && Array.isArray(y.balls) ? (Number(y.streak) || 1) + 1 : 0;
  $('dailyHow').textContent = done
    ? `${d.balls.filter(b => b.hit).length} of 9 calls${d.streak > 1 ? `, ${d.streak} days in a row` : ''}. A new card comes at midnight.`
    : `Nine called shots, the same for everyone today. One go a day, kept where you leave it. Hit the call for double.${run ? ` Play it to make it ${run} days in a row.` : ''}`;
}
$('daily').addEventListener('click', () => {
  sound.unlock();
  const d = playedToday();
  if (d) showOver(d, false);
  else start(true);
});
dailyButton();

$('share').addEventListener('click', async () => {
  const d = saved.daily;
  if (!d || !Array.isArray(d.balls)) return;
  const text = shareLine(d.key, d.score, d.balls.map(b => b.hit), d.streak);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere.'); }
  catch { toast(text.replace(/\n/g, '  ')); }
});

function toggleMenu(open = $('menu').hidden) {
  if (!$('title').hidden || !$('over').hidden) return; // a card is up: it has its own buttons
  $('menu').hidden = !open;
  paused = open;
  // today's card can't be started again: only a regular game can
  $('restart').hidden = !!game.card;
  if (open) { drag = null; charge = null; if (mode === 'drag') settle(); sound.rolling(0); $('resume').focus({ preventScroll: true }); }
}
$('menuBtn').addEventListener('click', () => { sound.unlock(); toggleMenu(); });
$('resume').addEventListener('click', () => toggleMenu(false));
// Leaving the page mid-round (a call, another app, the phone locked) opens the menu, so the round waits there
// rather than carrying on the moment the page is back.
// (A ball rolling on today's card is played out first: see rollOut.)
document.addEventListener('visibilitychange', () => { if (document.hidden && $('title').hidden && $('over').hidden) { rollOut(); toggleMenu(true); } });
$('restart').addEventListener('click', () => { start(!!game.card); toggleMenu(false); });
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
  if (mode === 'drag') settle();
  paused = true;
  sound.rolling(0); // a ball held mid-roll goes quiet
  openCounter({
    onBuy: p => { sound.unlock(); if (bigPrize(p)) sound.handOver(); else sound.buy(); },
    onClose: () => {
      paused = !$('menu').hidden; hud();
      // back to the game: the keys go to it again, not to the ticket button the counter handed the focus back to
      if ($('title').hidden && $('over').hidden && $('menu').hidden) document.activeElement?.blur();
    },
  });
}
$('tixBtn').addEventListener('click', () => { sound.unlock(); openPrizes(); });
for (const id of ['toPrizes', 'overPrizes', 'menuPrizes']) $(id).addEventListener('click', openPrizes);
addEventListener('free-play:wallet', hud);
addEventListener('pageshow', hud); // back from the floor, where tickets may have been spent

// Roll Up open in another tab, or this page brought back by Back as it was: look at the save again, so a game ending
// here adds to what's there now (today's card among it) instead of writing an old copy over it.
function reread() {
  const now = load();
  for (const k of Object.keys(saved)) delete saved[k];
  Object.assign(saved, now);
  settleCard();
  sound.setEnabled(soundOn(saved.sound));
  soundLabel();
  dailyButton();
  titleBest();
  // today's card, played on in the other tab: this one goes on from where that one is, or shows how it went
  if (game.card && ['aim', 'deal', 'result'].includes(mode)) {
    const d = playedToday(), g = goingToday();
    if (d && d.key === game.card.key) { $('menu').hidden = true; paused = false; mode = 'title'; showOver(d, false); }
    else if (g && g.balls.length > game.thrown) newGame(true);
  }
}
addEventListener('storage', e => { if (e.key === KEY) reread(); });
addEventListener('pageshow', e => { if (e.persisted) reread(); });

// ---------- every frame ----------
let last = performance.now();
const hits = [];
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * timeScale;
  last = now;
  if (!paused) update(dt);
  scene.frame({
    ball, tray: trayCount(), trayGold: trayGold(), call: callNow(), pops, flash, lights, now, zoom: zoom * zoom * (3 - 2 * zoom),
    foul: foulAt && now - foulAt < 1200 ? (now - foulAt) / 1000 : null,
    ping: mode === 'aim' && pingAt && now - pingAt < 600 ? (now - pingAt) / 1000 : null,
    charge: charge && mode === 'aim' ? chargeLevel() : null, meter: charge ? meterMarks() : null,
  });
  requestAnimationFrame(tick);
}

function update(dt) {
  lights.t += dt;
  const close = (mode === 'roll' && ball.z > LANE.foul + 40) || (mode === 'result' && ball.why !== 'short');
  if (calm?.matches) zoom = close ? 1 : 0; // (as Tilt's slide between floors does)
  else zoom += ((close ? 1 : 0) - zoom) * Math.min(1, dt * (close ? 2.6 : 4));
  if (lights.mode !== 'idle' && lights.t > (lights.mode === 'win' ? 2.6 : 1.4)) lights.mode = 'idle';
  if (flash) { flash.t += dt; if (flash.t > 1.2) flash = null; }
  for (const p of pops) p.age += dt;
  while (pops.length && pops[0].age > 1.6) pops.shift();
  if (shown < game.score) { shown = Math.min(game.score, shown + Math.max(60, (game.score - shown) * 6) * dt); hud(); }

  if (mode === 'roll') {
    hits.length = 0;
    phys.advance(ball, dt, hits);
    for (const h of hits) {
      if (h.kind === 'hole') intoHole(ball.hole);
      else sound.hit(h.kind, h.speed);
    }
    const c = ball.contact;
    sound.rolling(c && c.surface === 'lane' ? Math.hypot(ball.vx, ball.vy, ball.vz) : 0);
    if (ball.state === 'done') { sound.rolling(0); scored(); }
  } else if (mode === 'result') {
    resultT += dt;
    if (resultT > 1.05) { if (game.thrown < BALLS) nextBall(); else gameOver(); }
  } else if (mode === 'deal') {
    deal.t += dt;
    const k = Math.min(1, deal.t / 0.38), e = 1 - (1 - k) ** 3;
    ball.x = deal.from.x + (deal.to.x - deal.from.x) * e;
    ball.z = deal.from.z + (deal.to.z - deal.from.z) * e;
    ball.y = deal.from.y + (deal.to.y - deal.from.y) * e + Math.sin(k * Math.PI) * 5;
    if (k >= 1) { Object.assign(ball, deal.to); deal = null; mode = 'aim'; hud(); }
  }
}

hud();
function titleBest() { $('titleBest').textContent = saved.best ? `Best: ${fmt(saved.best)}.` : ''; }
titleBest();
requestAnimationFrame(tick);

// Today's card part-way through: Roll Up opens on it, where it was left.
if (goingToday()) {
  $('title').hidden = true;
  newGame(true);
  const next = `Today's card, where you left it: ball ${Math.min(BALLS, game.thrown + 1)} of ${BALLS}.`;
  toast(next);
  $('live').textContent = next;
}

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// For the tests and the screenshot tool: roll without a finger, and run the clock faster.
window.rollUp = {
  get mode() { return mode; },
  get score() { return game.score; },
  get thrown() { return game.thrown; },
  get ball() { return ball; },
  get saved() { return saved; },
  get game() { return game; },
  get fouled() { return foulAt; },
  get pinged() { return pingAt; },
  get zoom() { return zoom; },
  start,
  roll(vx, vz, x) {
    if (mode !== 'aim') return false;
    if (x != null) ball.x = x;
    throwBall(vx, vz);
    return true;
  },
  set speed(k) { timeScale = k; },
  scene,
  meterMarks,
  keyRoll,
};
