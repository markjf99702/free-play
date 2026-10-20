// The prize counter, the ticket dispenser and a small toast, for every page on the floor.
// The counter builds itself the first time it opens, so a page only needs shared/arcade.css and a button.

import { PRIZES, SHELF } from './prizes.js';
import { read, buy } from './wallet.js';

export const TICKET = '<svg class="fp-tix" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 2h20v3.6a2.4 2.4 0 0 0 0 4.8V14H2v-3.6a2.4 2.4 0 0 0 0-4.8z" fill="#f2944e"/><path d="M8 3.5v9" stroke="#fbeed2" stroke-width="1" stroke-dasharray="1.4 1.2"/><circle cx="15" cy="8" r="2.6" fill="#fbeed2"/></svg>';

let sheet = null, opts = {}, lastFocus = null;

function build() {
  sheet = document.createElement('section');
  sheet.className = 'fp-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'fp-counter-h');
  sheet.innerHTML = `<div class="fp-sheet-in">
      <div class="fp-head">
        <h2 id="fp-counter-h">Prize counter</h2>
        <span class="fp-bal">${TICKET}<b></b> tickets</span>
        <button type="button" class="fp-x" aria-label="Close">×</button>
      </div>
      <h3>Your shelf</h3>
      <div class="fp-shelf"></div>
      <h3>Trade your tickets</h3>
      <div class="fp-grid"></div>
    </div>`;
  document.body.append(sheet);
  sheet.querySelector('.fp-x').addEventListener('click', closeCounter);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeCounter(); });
  sheet.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeCounter(); } });
}

function render() {
  const w = read();
  sheet.querySelector('.fp-bal b').textContent = w.tickets;
  const shelf = sheet.querySelector('.fp-shelf');
  shelf.replaceChildren();
  const owned = SHELF.filter(p => w.prizes[p.id]);
  if (!owned.length) {
    const e = document.createElement('span');
    e.className = 'fp-empty';
    e.textContent = w.tickets ? 'Nothing yet. Pick something below.' : 'Nothing yet. Win tickets on any machine, then trade them here.';
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
  const grid = sheet.querySelector('.fp-grid');
  grid.replaceChildren();
  for (const p of PRIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fp-prize' + (w.tickets < p.cost ? ' short' : '');
    b.innerHTML = `<span class="e" aria-hidden="true"></span><span class="n"></span><span class="c">${TICKET}</span>`;
    b.querySelector('.e').textContent = p.emoji;
    b.querySelector('.n').textContent = p.name;
    b.querySelector('.c').append(String(p.cost));
    b.setAttribute('aria-label', `${p.name}, ${p.cost} tickets`);
    b.addEventListener('click', () => trade(p));
    grid.append(b);
  }
}

function trade(p) {
  const have = read().tickets;
  if (!buy(p)) return toast(`You need ${p.cost - have} more tickets for that.`);
  opts.onBuy?.(p);
  toast(`You got ${p.say}.`);
  render();
}

// opts.onBuy(prize): a page's sound for a trade. opts.onClose(): back to the game.
export function openCounter(o = {}) {
  if (!sheet) build();
  opts = o;
  lastFocus = document.activeElement;
  render();
  sheet.hidden = false;
  sheet.querySelector('.fp-x').focus({ preventScroll: true });
}
export function closeCounter() {
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  lastFocus?.focus?.({ preventScroll: true });
  opts.onClose?.();
}
export const counterOpen = () => !!sheet && !sheet.hidden;

let toastEl = null, toastTimer = 0;
export function toast(text) {
  if (!toastEl) { toastEl = document.createElement('p'); toastEl.className = 'fp-toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
}

// The tickets coming out of the machine's slot at the end of a game: the count climbs and the strip grows.
// `box` is a .fp-payout element; tick() is the page's click for each batch. Returns a function that stops it.
export function feed(box, n, { tick, fresh = true } = {}) {
  const strip = box.querySelector('.fp-strip'), count = box.querySelector('.fp-won b'), word = box.querySelector('.fp-won span');
  word.textContent = n === 1 ? 'ticket' : 'tickets';
  const show = k => {
    count.textContent = k;
    strip.style.height = Math.min(k, 7) * 22 + (k ? 4 : 0) + 'px';
    strip.style.backgroundPositionY = k * 22 + 'px';
  };
  if (!fresh) { show(n); return () => {}; }
  let k = 0, timer = 0;
  show(0);
  const step = () => {
    k = Math.min(n, k + Math.max(1, Math.round(n / 40)));
    show(k);
    tick?.();
    if (k < n) timer = setTimeout(step, 55);
  };
  timer = setTimeout(step, 500);
  return () => clearTimeout(timer);
}

// The markup for a payout, for a page to put in its game-over card.
export const PAYOUT = '<div class="fp-dispenser" aria-hidden="true"><span class="fp-mouth"></span><span class="fp-strip"></span></div><p class="fp-won"><b>0</b> <span>tickets</span></p>';
