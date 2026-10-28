// Free Play's records: the top five on every machine, with the day each was set, what else each machine keeps that's
// worth a look (Roll Up's longest run of days, Highrise's top-outs, the plush Clutch has given you), and the arcade's
// all-time totals (../shared/records.js). It only reads the saves; nothing here changes them.

import { fmt } from '../shared/counter.js';
import { readTotals, topFive } from '../shared/records.js';
import { dayName } from '../shared/calendar.js';
import { settle } from '../roll-up/js/daily.js';
import { PLUSH } from '../shared/prizes.js';

const $ = id => document.getElementById(id);
const readSave = key => {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const times = n => (n === 1 ? 'once' : n === 2 ? 'twice' : `${fmt(n)} times`);

// A top five as a numbered list, best first, each with its day (a best from before the list has none).
function five(list, say) {
  const ol = el('ol', 'five');
  for (const e of list) {
    const li = el('li');
    li.append(el('b', null, say(e.score)), el('span', null, dayName(e.date)));
    ol.append(li);
  }
  return ol;
}
// One machine's box: its list, a line or two under it, or what it says before there's anything to show.
function fill(id, parts, none) {
  const box = $(id), kept = parts.filter(Boolean);
  box.replaceChildren(...(kept.length ? kept : [el('p', 'none', none)]));
}
const points = n => `${fmt(n)}`;

function render() {
  // the all-time totals, and since when they've been counted
  const t = readTotals(), rounds = Object.values(t.rounds).reduce((a, n) => a + n, 0);
  $('totTickets').textContent = fmt(t.tickets);
  $('totRounds').textContent = fmt(rounds);
  $('totTraded').textContent = fmt(t.traded);
  $('since').textContent = t.since ? `Counted since ${dayName(t.since)}.` : 'Counted from your next round on.';

  // Roll Up: its regular games, and the longest run of days it's had today's card played (a card left part-way on an
  // earlier day counts as played that day)
  const ru = settle(readSave('free-play.roll-up'));
  const run = Math.max(Number(ru.longest) || 0, Number(ru.daily?.streak) || 0);
  const ruTop = topFive(ru);
  fill('rollUpRec', [
    ruTop.length && five(ruTop, points),
    run > 1 && el('p', 'more', `Longest run of days on today's card: ${fmt(run)}.`),
  ], 'No games yet.');

  // Tilt: each table's best, and the day
  const tl = readSave('free-play.tilt');
  const tables = [['scores', 'Classic'], ['spaceScores', 'Space'], ['hauntedScores', 'Haunted House']].map(([key, name]) => {
    const best = Array.isArray(tl[key]) ? tl[key].find(s => s && Number.isFinite(+s.score) && +s.score > 0) : null;
    return best && { name, score: +best.score, date: typeof best.date === 'string' ? best.date : null };
  }).filter(Boolean);
  if (tables.length) {
    const ul = el('ul', 'tables');
    for (const b of tables) { const li = el('li'); li.append(el('i', null, b.name), el('b', null, fmt(b.score)), el('span', null, dayName(b.date))); ul.append(li); }
    fill('tiltRec', [ul], '');
  } else fill('tiltRec', [], 'No games yet.');

  // Clutch: the plush it's given you, kind by kind
  const won = readSave('free-play.clutch').won;
  const plush = PLUSH.map(p => ({ p, n: Math.max(0, Math.floor(Number(won?.[p.kind]) || 0)) })).filter(x => x.n);
  const all = plush.reduce((a, x) => a + x.n, 0);
  let row = null;
  if (all) {
    row = el('ul', 'plush');
    for (const { p, n } of plush) {
      const li = el('li');
      li.setAttribute('aria-label', `${p.name}, ${fmt(n)}`);
      li.append(el('span', 'e', p.emoji), el('b', null, fmt(n)));
      li.firstChild.setAttribute('aria-hidden', 'true');
      li.lastChild.setAttribute('aria-hidden', 'true');
      row.append(li);
    }
  }
  fill('clutchRec', [all && el('p', 'big', `${fmt(all)} plush won`), row], 'No plush yet.');

  // Topple: its best cups, and the prizes pushed off
  const tp = readSave('free-play.topple'), prizes = Math.max(0, Math.floor(Number(tp.prizes) || 0));
  const tpTop = topFive(tp);
  fill('toppleRec', [
    tpTop.length && five(tpTop, n => `${fmt(n)} ${n === 1 ? 'ticket' : 'tickets'}`),
    prizes && el('p', 'more', `${fmt(prizes)} ${prizes === 1 ? 'prize' : 'prizes'} pushed off the deck.`),
  ], 'No cups yet.');

  // Highrise: its highest towers, and how often it's been topped out
  const hr = readSave('free-play.highrise'), tops = Math.max(0, Math.floor(Number(hr.tops) || 0));
  const hrTop = topFive(hr);
  fill('highriseRec', [
    hrTop.length && five(hrTop, n => `Floor ${n}`),
    tops && el('p', 'more', `Topped out ${times(tops)}.`),
  ], 'No towers yet.');

  // Popgun, Bonkers and Hoops: their best rounds
  for (const m of ['popgun', 'bonkers', 'hoops']) {
    const top = topFive(readSave(`free-play.${m}`));
    fill(`${m}Rec`, [top.length && five(top, points)], 'No rounds yet.');
  }
}

render();
// back from a machine (the browser may keep this page as it was), or one played in another tab: look again
addEventListener('pageshow', render);
addEventListener('storage', e => { if (e.key === null || e.key.startsWith('free-play.')) render(); });

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

window.records = { render };
