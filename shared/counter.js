// The prize counter, the ticket dispenser and a small toast, for every page on the floor.
// The counter builds itself the first time it opens, so a page only needs shared/arcade.css and a button.

import { PRIZES, SHELF } from './prizes.js';
import { KEY, read, buy, refund } from './wallet.js';

// A count as people write it: 1,234 tickets. Anything that isn't a number reads as 0.
export const fmt = n => (Number.isFinite(+n) ? +n : 0).toLocaleString('en-US');
// And as many tickets: '1 ticket', '12,345 tickets'.
export const tickets = n => `${fmt(n)} ${+n === 1 ? 'ticket' : 'tickets'}`;
// The ticket count in a machine's corner is the way to the counter, and its name says both: 'Prize counter, 214 tickets'.
export function pocketButton(el, n) {
  const name = `Prize counter, ${tickets(n)}`;
  if (el.getAttribute('aria-label') !== name) el.setAttribute('aria-label', name);
}

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
  sheet.innerHTML = `<div class="fp-sheet-in" tabindex="-1">
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
}

// While the counter is open it has the keyboard to itself. Escape closes it wherever the focus is (a tap on a blank
// part of the sheet puts it on the sheet), before the page's own keys hear it, and Tab goes round the counter's
// buttons and no further.
function keys(e) {
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeCounter(); return; }
  if (e.key !== 'Tab') return;
  const stops = [...sheet.querySelectorAll('button')].filter(b => !b.disabled && b.getClientRects().length);
  if (!stops.length) return;
  const at = stops.indexOf(document.activeElement), to = e.shiftKey ? (at <= 0 ? stops.length - 1 : -1) : (at < 0 || at === stops.length - 1 ? 0 : -1);
  if (to < 0) return;
  e.preventDefault();
  stops[to].focus();
}

// Everything else on the page sits behind the open counter: out of reach of Tab, a tap and a screen reader (inert), and
// held still (fp-held on <html>, and fp-bar when it has a scroll bar that takes room), so a wheel or a flick over the
// backdrop doesn't scroll it. What was inert already stays as it was when the counter closes.
let held = [];
function hold(on) {
  for (const el of held) el.inert = false;
  held = on ? [...document.body.children].filter(el => el !== sheet && !el.inert) : [];
  for (const el of held) el.inert = true;
  const root = document.documentElement;
  root.classList.toggle('fp-bar', on && innerWidth > root.clientWidth);
  root.classList.toggle('fp-held', on);
  document[on ? 'addEventListener' : 'removeEventListener']('keydown', keys, true);
}

// The counter is a step in the page's history, as a sheet on a phone is: opening it adds an entry, so the phone's Back
// closes it rather than leaving the page (or, on the floor of the installed app, closing the app), and closing it any
// other way takes that entry off again. `going` is a Back of the counter's own still on its way: when it lands, the
// counter has nothing to do, unless it has been opened again meanwhile and needs an entry of its own once more.
let going = false;
const ours = () => !!globalThis.history?.state?.fpCounter; // (no history in node, where the tests import this)
function step() { try { history.pushState({ fpCounter: true }, ''); } catch { /* an address it can't change: Back leaves */ } }
globalThis.addEventListener?.('popstate', () => {
  if (going) { going = false; if (counterOpen() && !ours()) step(); return; }
  if (counterOpen() && !ours()) shut();
});
// A page opened afresh on the counter's entry (reloaded with the counter open, say) shows it shut, and the entry is
// the page's own from then on: a Back from it to the page's first entry would load the page again.
if (ours()) { try { history.replaceState(null, ''); } catch { /* as above */ } }

function render() {
  const w = read();
  sheet.querySelector('.fp-bal b').textContent = fmt(w.tickets);
  const shelf = sheet.querySelector('.fp-shelf');
  shelf.replaceChildren();
  const owned = SHELF.filter(p => w.prizes[p.id]);
  shelf.classList.toggle('empty', !owned.length);
  if (!owned.length) {
    const e = document.createElement('span');
    e.className = 'fp-empty';
    e.textContent = w.tickets ? 'Nothing yet. Pick something below.' : 'Nothing yet. Win tickets on any machine, then trade them here.';
    shelf.append(e);
  }
  for (const p of owned) shelf.append(shelfItem(p, w.prizes[p.id]));
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
    b.querySelector('.c').append(fmt(p.cost));
    b.setAttribute('aria-label', `${p.name}, ${fmt(p.cost)} tickets`);
    b.dataset.id = p.id;
    b.addEventListener('click', () => trade(p));
    grid.append(b);
    if (p.id === had) b.focus({ preventScroll: true });
  }
}

// A prize on a shelf, the floor's or the counter's: its emoji, with a badge for how many there are. A phone has no
// hover to show a name, so a tap says what it is. (Not straight after a trade: a double tap on a prize whose second
// tap lands on a new row of the shelf is still the one tap, and leaves the trade's Undo where it is.)
export function shelfItem(p, n) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fp-item';
  b.textContent = p.emoji;
  b.title = p.name;
  b.setAttribute('aria-label', n > 1 ? `${p.name}, ${fmt(n)}` : p.name);
  if (n > 1) {
    const c = document.createElement('sub');
    c.textContent = fmt(n);
    c.setAttribute('aria-hidden', 'true');
    b.append(c);
  }
  b.addEventListener('click', () => {
    if (performance.now() - lastTrade < SAME_TAP) return;
    toast(n > 1 ? `${p.name}. You have ${fmt(n)}.` : `${p.name}.`);
  });
  return b;
}

function trade(p) {
  if (performance.now() - lastTrade < SAME_TAP) return;
  const have = read().tickets;
  const w = buy(p);
  if (!w) return toast(`You need ${fmt(p.cost - have)} more tickets for that.`);
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
    toast(refund(p) ? `Traded back. Your ${fmt(p.cost)} tickets are back in your pocket.` : `There's no ${p.name.toLowerCase()} on your shelf to trade back.`);
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
  if (counterOpen()) return;
  opts = o;
  lastFocus = document.activeElement;
  render();
  // the toast moves into the counter while it's open: at its foot, clear of the prizes, and inside the dialog
  sheet.querySelector('.fp-foot').append(toastBox());
  sheet.hidden = false;
  hold(true);
  if (!ours() && !going) step();
  sheet.querySelector('.fp-x').focus({ preventScroll: true });
}
// Closed by ×, the backdrop or Escape: the counter's step in the history goes too.
export function closeCounter() {
  if (!counterOpen()) return;
  shut();
  if (ours() && !going) { going = true; history.back(); }
}
function shut() {
  sheet.hidden = true;
  hold(false);
  // a trade can only be undone at the counter
  if (toastUndo) { toastUndo = null; toastEl.hidden = true; }
  document.body.append(toastBox());
  lastFocus?.focus?.({ preventScroll: true });
  opts.onClose?.();
}
export const counterOpen = () => !!sheet && !sheet.hidden;

// Tickets won or spent in another tab or window of the arcade: this page hears about it as it does about its own
// (free-play:wallet, which every page's ticket count listens for), and an open counter shows the pocket as it is now.
globalThis.addEventListener?.('storage', e => {
  if (e.key !== KEY && e.key !== null) return; // (null: the whole of storage was cleared)
  dispatchEvent(new CustomEvent('free-play:wallet', { detail: read() }));
  if (counterOpen()) render();
});

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
// `box` is a .fp-payout element; tick() is the page's click for each batch, and onCount(k) hears each count as it's
// shown, so the pocket in the page's corner can count along. onDone() comes once the last ticket is out (straight away
// when it isn't a fresh payout), for the page's cheer. Returns a function that stops it (another round, or leaving):
// the strip and onCount go straight to all n, and there's no onDone.
export function feed(box, n, { tick, fresh = true, onCount, onDone } = {}) {
  const strip = box.querySelector('.fp-strip'), count = box.querySelector('.fp-won b'), word = box.querySelector('.fp-won span');
  word.textContent = n === 1 ? 'ticket' : 'tickets';
  const show = k => {
    count.textContent = fmt(k);
    strip.style.height = Math.min(k, 7) * 22 + (k ? 4 : 0) + 'px';
    strip.style.backgroundPositionY = k * 22 + 'px';
    onCount?.(k);
  };
  if (!fresh) { show(n); onDone?.(); return () => {}; }
  let k = 0, timer = 0, out = false;
  show(0);
  const step = () => {
    k = Math.min(n, k + Math.max(1, Math.round(n / 40)));
    show(k);
    tick?.();
    if (k < n) timer = setTimeout(step, 55);
    else { out = true; onDone?.(); }
  };
  timer = setTimeout(step, 500);
  return () => { clearTimeout(timer); if (!out) { out = true; show(n); } };
}

// A quick swell: the pocket in a machine's corner, as the last of a round's tickets go into it.
export function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

// The best line under the dispenser. A new best ([headline, what it beat]) is said big and in gold, the old best
// under it; anything else is the plain line.
export function bestLine(el, news, plain) {
  el.classList.toggle('fp-best', !!news);
  if (!news) { el.textContent = plain; return; }
  const head = document.createElement('b'), was = document.createElement('span');
  head.textContent = news[0];
  was.textContent = news[1];
  el.replaceChildren(head, ' ', was);
}

// The markup for a payout, for a page to put in its game-over card.
export const PAYOUT = '<div class="fp-dispenser" aria-hidden="true"><span class="fp-mouth"></span><span class="fp-strip"></span></div><p class="fp-won"><b>0</b> <span>tickets</span></p>';
