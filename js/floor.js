// The Free Play floor: the tickets in your pocket, what each machine remembers about you, and the prize counter.
// Each machine keeps its own save (free-play.roll-up, free-play.tilt, free-play.clutch); the tickets and prizes are
// the arcade's (../shared/wallet.js). Nothing here changes a machine's save; it only reads it.

import * as wallet from '../shared/wallet.js';
import { openCounter } from '../shared/counter.js';
import { SHELF } from '../shared/prizes.js';
import { dayKey } from '../roll-up/js/daily.js';

const $ = id => document.getElementById(id);
const fmt = n => Number(n).toLocaleString('en-US');
const readSave = key => {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

function machines() {
  // Roll Up: today's card first, since it changes every day; then the best game.
  const ru = readSave('free-play.roll-up');
  const today = ru.daily && ru.daily.key === dayKey() ? ru.daily : null;
  const card = today
    ? `Today's card: ${fmt(today.score)}, ${today.balls.filter(b => b.hit).length} of 9 calls.`
    : "Today's card is ready: nine called shots.";
  $('rollUpStat').textContent = ru.best ? `${card} Best ${fmt(ru.best)}.` : card;

  // Tilt: the best score on any table, and which table.
  const t = readSave('free-play.tilt');
  const tables = { scores: 'Classic', spaceScores: 'Space', hauntedScores: 'Haunted House' };
  let best = null;
  for (const [key, name] of Object.entries(tables)) {
    const top = Array.isArray(t[key]) ? t[key].find(s => s && Number.isFinite(+s.score)) : null;
    if (top && (!best || +top.score > best.score)) best = { score: +top.score, name };
  }
  $('tiltStat').textContent = best ? `Best ${fmt(best.score)}, on ${best.name}.` : 'Three balls a game. Nudge, but not too hard.';

  // Clutch: how many plush it's given you, and whether one was the lucky star.
  const c = readSave('free-play.clutch');
  const won = c.won && typeof c.won === 'object' ? c.won : {};
  const plush = Object.values(won).reduce((n, k) => n + (Number(k) || 0), 0);
  $('clutchStat').textContent = plush
    ? `${fmt(plush)} plush won${won.star ? ', a lucky star among them' : ''}.`
    : 'Pays in plush, straight onto your shelf.';
}

function pocket() {
  const w = wallet.read();
  $('tix').textContent = fmt(w.tickets);
  const shelf = $('shelf');
  shelf.replaceChildren();
  const owned = SHELF.filter(p => w.prizes[p.id]);
  if (!owned.length) {
    const e = document.createElement('span');
    e.className = 'empty';
    e.textContent = 'Nothing on your shelf yet.';
    shelf.append(e);
  }
  for (const p of owned) {
    const s = document.createElement('span');
    s.textContent = p.emoji; s.title = p.name;
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', w.prizes[p.id] > 1 ? `${w.prizes[p.id]} × ${p.name}` : p.name);
    if (w.prizes[p.id] > 1) { const n = document.createElement('sub'); n.textContent = w.prizes[p.id]; s.append(n); }
    shelf.append(s);
  }
}

const counter = () => openCounter({ onClose: pocket });
$('trade').addEventListener('click', counter);
$('purse').addEventListener('click', counter);
addEventListener('free-play:wallet', pocket);
// coming back from a machine (the browser may keep this page as it was): look again
addEventListener('pageshow', () => { pocket(); machines(); });
pocket();
machines();

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.freePlay = { pocket, machines };
