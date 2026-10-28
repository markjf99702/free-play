// The Free Play floor: the tickets in your pocket, what each machine remembers about you, and the prize counter.
// Each machine keeps its own save (free-play.roll-up, free-play.tilt, free-play.clutch, free-play.topple,
// free-play.highrise, free-play.popgun, free-play.bonkers, free-play.hoops); the tickets and prizes are the arcade's
// (../shared/wallet.js). Nothing here changes a machine's save; it only reads it.

import * as wallet from '../shared/wallet.js';
import { openCounter, shelfItem, fmt, tickets } from '../shared/counter.js';
import { SHELF } from '../shared/prizes.js';
import { specialFor, madeToday, BONUS } from '../shared/special.js';
import { dayKey, dayBefore } from '../shared/calendar.js';
import { settle, BALLS } from '../roll-up/js/daily.js';

const $ = id => document.getElementById(id);
const readSave = key => {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

// A best, as every cabinet and card says it: 'Best: 1,340.'
const best = n => `Best: ${fmt(n)}.`;

function machines() {
  // Roll Up: today's card first, since it changes every day, with the run of days it's been played; then the best game.
  // (A card left part-way on an earlier day counts as played that day: see settle() in roll-up/js/daily.js.)
  const ru = settle(readSave('free-play.roll-up'));
  const daily = ru.daily && Array.isArray(ru.daily.balls) ? ru.daily : null;
  const run = Number(daily?.streak) || 1;
  const toRoll = ru.going?.key === dayKey() && Array.isArray(ru.going.balls) ? BALLS - Math.min(BALLS, ru.going.balls.length) : 0;
  const card = toRoll
    ? `Today's card on the go: ${toRoll} ${toRoll === 1 ? 'ball' : 'balls'} left.`
    : daily?.key === dayKey()
      ? `Today's card: ${fmt(daily.score)}, ${daily.balls.filter(b => b.hit).length} of 9 calls${run > 1 ? `, ${run} days in a row` : ''}.`
      : daily?.key === dayBefore(dayKey())
        ? `Today's card is ready. Play it to make it ${run + 1} days in a row.`
        : "Today's card is ready: nine called shots.";
  $('rollUpStat').textContent = ru.best ? `${card} ${best(ru.best)}` : card;

  // Tilt: the best score on any table, and which table.
  const t = readSave('free-play.tilt');
  const tables = { scores: 'Classic', spaceScores: 'Space', hauntedScores: 'Haunted House' };
  let top = null;
  for (const [key, name] of Object.entries(tables)) {
    const first = Array.isArray(t[key]) ? t[key].find(s => s && Number.isFinite(+s.score)) : null;
    if (first && (!top || +first.score > top.score)) top = { score: +first.score, name };
  }
  $('tiltStat').textContent = top ? `Best: ${fmt(top.score)}, on ${top.name}.` : 'Three balls a game. Nudge, but not too hard.';

  // Clutch: how many plush it's given you, and how many were the lucky star.
  const c = readSave('free-play.clutch');
  const won = c.won && typeof c.won === 'object' ? c.won : {};
  const plush = Object.values(won).reduce((n, k) => n + (Number(k) || 0), 0), stars = Number(won.star) || 0;
  $('clutchStat').textContent = plush
    ? `${fmt(plush)} plush won${stars > 1 ? `, ${fmt(stars)} lucky stars among them` : stars ? ', a lucky star among them' : ''}.`
    : 'Pays in plush, straight onto your shelf.';

  // Topple: a cup part-played first (one of 20 coins, with some down and some to go), then the best cup and any prizes
  // pushed off.
  const tp = readSave('free-play.topple');
  const prizes = Number(tp.prizes) || 0, left = Number.isInteger(tp.cup?.left) ? tp.cup.left : 0;
  const going = left > 0 && left < 20 ? `A cup on the go: ${left} ${left === 1 ? 'coin' : 'coins'} left.` : '';
  const cups = tp.cups ? `Best cup: ${tickets(tp.best || 0)}.${prizes ? ` ${prizes} ${prizes === 1 ? 'prize' : 'prizes'} pushed off.` : ''}` : '';
  $('toppleStat').textContent = [going, cups].filter(Boolean).join(' ') || 'Twenty coins a cup, and a prize on the deck.';

  // Highrise: the highest floor built, and how often it's been topped out.
  const hr = readSave('free-play.highrise');
  const tops = Number(hr.tops) || 0;
  $('highriseStat').textContent = hr.games
    ? `Highest: floor ${hr.best || 0}.${tops ? ` Topped out ${tops === 1 ? 'once' : tops === 2 ? 'twice' : `${tops} times`}.` : ''}`
    : 'Fifteen floors. Every one is a ticket.';

  // Popgun: the best round.
  const pg = readSave('free-play.popgun');
  $('popgunStat').textContent = pg.rounds ? best(pg.best || 0) : 'Twenty corks. A ticket for every 30 points.';

  // Bonkers: the best round.
  const bk = readSave('free-play.bonkers');
  $('bonkersStat').textContent = bk.rounds ? best(bk.best || 0) : 'Forty-five seconds. Watch them coming.';

  // Hoops: the best round.
  const hp = readSave('free-play.hoops');
  $('hoopsStat').textContent = hp.rounds ? best(hp.best || 0) : 'Forty-five seconds. Twenty\u00a0in, the hoop starts to slide.';
}

// Today's special, under the pocket: which machine, and its goal (or that it's made), and on that machine's cabinet the
// badge says Special rather than Free play (and a screen reader hears the line with the cabinet). The machine's name
// goes to it, and Tilt's to the day's table (a link that names a table opens on it).
function special() {
  const s = specialFor(), made = madeToday(), to = document.createElement('a');
  to.href = s.table ? `${s.machine}/?table=${s.table}` : `${s.machine}/`;
  to.textContent = s.name;
  const goal = s.goalText.charAt(0).toUpperCase() + s.goalText.slice(1);
  $('today').replaceChildren("Today's special: ", to, made ? `. You made it: ${BONUS} more tickets. A new one tomorrow.` : `. ${goal} for ${BONUS} more tickets.`);
  $('today').hidden = false;
  for (const cab of document.querySelectorAll('.cab')) {
    const on = cab.id === s.machine, coin = cab.querySelector('.coin');
    coin.textContent = on ? 'Special' : 'Free play';
    coin.classList.toggle('special', on);
    cab.setAttribute('aria-describedby', on ? `${cab.querySelector('.what').id} today` : cab.querySelector('.what').id);
  }
}

function pocket() {
  const w = wallet.read();
  $('tix').textContent = fmt(w.tickets);
  $('tixWord').textContent = w.tickets === 1 ? 'ticket' : 'tickets';
  // the booth's button says what there is to trade, once there's anything
  $('trade').textContent = w.tickets ? `Trade your ${tickets(w.tickets)}` : 'Trade tickets';
  const shelf = $('shelf');
  shelf.replaceChildren();
  const owned = SHELF.filter(p => w.prizes[p.id]);
  shelf.classList.toggle('empty', !owned.length);
  if (!owned.length) {
    const e = document.createElement('span');
    e.className = 'empty';
    e.textContent = 'Nothing on your shelf yet.';
    shelf.append(e);
  }
  for (const p of owned) shelf.append(shelfItem(p, w.prizes[p.id]));
}

const counter = () => openCounter({ onClose: pocket });
$('trade').addEventListener('click', counter);
$('purse').addEventListener('click', counter);
addEventListener('free-play:wallet', pocket);
// coming back from a machine (the browser may keep this page as it was): look again
addEventListener('pageshow', () => { pocket(); machines(); special(); });
// a machine played in another tab or window: its cabinet says so without a reload (the pocket hears about it from
// ../shared/counter.js, as a free-play:wallet)
addEventListener('storage', e => { if (e.key === null || e.key.startsWith('free-play.')) { machines(); special(); } });
pocket();
machines();
special();

// Back from a machine by one of its own links (there's no Back button on a phone's home-screen app), the floor opens
// at that machine's cabinet rather than at the top of a long page. A reload, or Back and Forward, are left where the
// browser puts them.
const CABINETS = ['roll-up', 'tilt', 'clutch', 'topple', 'highrise', 'popgun', 'bonkers', 'hoops'];
function backFrom() {
  try {
    if (performance.getEntriesByType('navigation')[0]?.type !== 'navigate' || !document.referrer) return;
    const from = new URL(document.referrer), here = location.pathname.replace(/[^/]*$/, '');
    if (from.origin !== location.origin || !from.pathname.startsWith(here)) return;
    const name = from.pathname.slice(here.length).split('/')[0];
    if (CABINETS.includes(name)) document.querySelector('.cab.' + name)?.scrollIntoView({ block: 'center' });
  } catch { /* no timing or no referrer: the top of the floor will do */ }
}
backFrom();

// The row of machines under the pocket: a tap on one goes to its cabinet (or the prize counter at the back), gliding
// there unless the phone is set to cut down motion, and leaves the address as it was, so the phone's Back still leaves
// the floor. The keyboard goes with it, so Tab carries on from there. (Without this script they're plain links to the
// same places. Records, at the end of the row, is a page of its own: a link like any other.)
for (const hop of document.querySelectorAll('.aisle a')) {
  hop.addEventListener('click', e => {
    const to = document.getElementById(hop.hash.slice(1));
    if (!to) return;
    e.preventDefault();
    to.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    to.focus({ preventScroll: true });
  });
}

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.freePlay = { pocket, machines, special };
