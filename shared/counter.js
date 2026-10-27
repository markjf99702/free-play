// The prize counter, the ticket dispenser and a small toast, for every page on the floor.
// The counter builds itself the first time it opens, so a page only needs shared/arcade.css and a button.

import { PRIZES, SHELF } from './prizes.js';
import { read, buy, refund } from './wallet.js';

export const TICKET = '<svg class="fp-tix" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 2h20v3.6a2.4 2.4 0 0 0 0 4.8V14H2v-3.6a2.4 2.4 0 0 0 0-4.8z" fill="#f2944e"/><path d="M8 3.5v9" stroke="#fbeed2" stroke-width="1" stroke-dasharray="1.4 1.2"/><circle cx="15" cy="8" r="2.6" fill="#fbeed2"/></svg>';

let sheet = null, opts = {}, lastFocus = null;
// A second tap this soon after a trade is the same tap twice (a double tap, or a finger that bounced), whichever prize
// it lands on: the grid is drawn again after a trade, and a new row on the shelf can move it down under the finger.
const SAME_TAP = 700;
let lastTrade = -Infinity;

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
      <div class="fp-foot"></div>
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
  // the grid is drawn afresh, so a prize picked with the keyboard keeps the focus
  const had = grid.contains(document.activeElement) ? document.activeElement.dataset.id : null;
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
    b.dataset.id = p.id;
    b.addEventListener('click', () => trade(p));
    grid.append(b);
    if (p.id === had) b.focus({ preventScroll: true });
  }
}

function trade(p) {
  if (performance.now() - lastTrade < SAME_TAP) return;
  const have = read().tickets;
  const w = buy(p);
  if (!w) return toast(`You need ${p.cost - have} more tickets for that.`);
  lastTrade = performance.now();
  opts.onBuy?.(p);
  const n = w.prizes[p.id];
  // Only the latest trade can be undone, and only once: its Undo goes when the toast does, or the next one comes.
  const undo = () => {
    if (performance.now() - lastTrade < SAME_TAP) return; // the second tap of a double tap, landing where the toast came up
    if (toastUndo !== undo) return;
    toastUndo = null;
    lastTrade = performance.now(); // and a double tap on Undo doesn't trade whatever is under it once it's gone
    const focused = toastEl.contains(document.activeElement);
    toast(refund(p) ? `Traded back. Your ${p.cost.toLocaleString('en-US')} tickets are back in your pocket.` : `There's no ${p.name.toLowerCase()} on your shelf to trade back.`);
    if (!counterOpen()) return;
    render();
    // the Undo button has gone: the keyboard goes back to the prize
    if (focused) sheet.querySelector(`.fp-prize[data-id="${p.id}"]`)?.focus({ preventScroll: true });
  };
  toast(`You got ${p.say}.${n > 1 ? ` That's ${n} on your shelf.` : ''}`, { undo });
  render();
}

// opts.onBuy(prize): a page's sound for a trade. opts.onClose(): back to the game.
export function openCounter(o = {}) {
  if (!sheet) build();
  opts = o;
  lastFocus = document.activeElement;
  render();
  // the toast moves into the counter while it's open: at its foot, clear of the prizes, and inside the dialog
  sheet.querySelector('.fp-foot').append(toastBox());
  sheet.hidden = false;
  sheet.querySelector('.fp-x').focus({ preventScroll: true });
}
export function closeCounter() {
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  // a trade can only be undone at the counter
  if (toastUndo) { toastUndo = null; toastEl.hidden = true; }
  document.body.append(toastBox());
  lastFocus?.focus?.({ preventScroll: true });
  opts.onClose?.();
}
export const counterOpen = () => !!sheet && !sheet.hidden;

// A line at the foot of the screen (or of the counter, while it's open) for a moment. With undo, it carries an Undo
// button for a few seconds longer.
let toastEl = null, toastTimer = 0, toastUndo = null;
function toastBox() {
  if (!toastEl) {
    toastEl = document.createElement('p');
    toastEl.className = 'fp-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.hidden = true;
    document.body.append(toastEl);
  }
  return toastEl;
}
export function toast(text, { undo } = {}) {
  const el = toastBox();
  el.textContent = text;
  toastUndo = undo || null;
  el.classList.toggle('undoable', !!undo);
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fp-undo';
    b.textContent = 'Undo';
    b.addEventListener('click', undo);
    el.append(' ', b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; toastUndo = null; }, undo ? 5000 : 2400);
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
