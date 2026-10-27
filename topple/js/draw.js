// Topple's pictures: the cabinet, and the machine inside it seen from where you'd stand, looking down through the glass.
// js/machine.js works flat, from above; this puts it in perspective with a simple camera, giving the shelf its height.
// What never moves (the cabinet, the back wall, the deck, the glass) is painted once per resize into two layers, and
// each frame draws the moving parts between them: the shelf, the coins, the chute and the lights.

import { DECK, PUSHER, COIN, CHUTE, POCKETS, PRIZE } from './machine.js';

const WALL_TOP = 168;                         // how high the back and side walls go, mm
const POCKET = { y: 96, r: 13 };              // the bonus pockets along the back wall
const RAIL = 148;                             // the chute's rail
const SIGN = POCKET.y - 33;                   // the back wall's sign, under the pockets (the chute rides over them)
// Asked for less motion (the system's setting, read each frame, so a change shows at once): lights hold steady.
const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

// The camera: above and in front of the machine, looking down at the middle of the deck.
const EYE = { x: DECK.W / 2, y: 470, z: 480 }, AT = { y: 0, z: 118 };
const F = (() => { const dy = AT.y - EYE.y, dz = AT.z - EYE.z, n = Math.hypot(dy, dz); return { y: dy / n, z: dz / n }; })();
const U = { y: -F.z, z: F.y };

// Where a point in the machine lands in the picture, in camera units (before resize() scales it to the page).
function view(x, y, z) {
  const ry = y - EYE.y, rz = z - EYE.z;
  const d = ry * F.y + rz * F.z;
  return { x: (x - EYE.x) / d, y: -(ry * U.y + rz * U.z) / d, s: 1 / d };
}

const C = {
  teal: '#0e7c78', tealDark: '#085451', tealLight: '#16a39b', cream: '#fbeed2', gold: '#f2c14e', goldDeep: '#c98f1c',
  coral: '#ff6b57', navy: '#0b1d29', chrome: '#d6dde4', steel: '#6d7b88', ink: '#071218',
};
const LOOK = {
  coin: { rim: '#6f7a86', face: '#cdd4dc', ring: '#a7b1bc', shine: 'rgba(255,255,255,.6)' },
  gold: { rim: '#8f5f0e', face: '#f4c24a', ring: '#d39524', shine: 'rgba(255,246,200,.85)' },
};

export function createDraw(canvas) {
  const ctx = canvas.getContext('2d');
  const back = document.createElement('canvas'), front = document.createElement('canvas');
  let k = 1, ox = 0, oy = 0, dpr = 1, box = null;

  // A point in the machine, on the page in CSS pixels; s is how many pixels a millimetre is there.
  const at = (x, y, z) => { const p = view(x, y, z); return { x: ox + k * p.x, y: oy + k * p.y, s: k * p.s }; };
  const quad = (c, pts) => { c.beginPath(); pts.forEach(([x, y, z], i) => { const p = at(x, y, z); c[i ? 'lineTo' : 'moveTo'](p.x, p.y); }); c.closePath(); };

  // The cabinet's layout, in camera units: the window onto the machine, the sign above it and the front panel below.
  function measure() {
    const pts = [view(0, WALL_TOP, 0), view(DECK.W, WALL_TOP, 0), view(-8, -46, DECK.D + 4), view(DECK.W + 8, -46, DECK.D + 4)];
    const win = { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) };
    const w = win.x1 - win.x0, bezel = w * 0.045;
    return {
      win,
      cab: { x0: win.x0 - bezel, x1: win.x1 + bezel, y0: win.y0 - w * 0.2, y1: win.y1 + w * 0.19 },
      marq: { x0: win.x0 + w * 0.02, x1: win.x1 - w * 0.02, y0: win.y0 - w * 0.175, y1: win.y0 - w * 0.035 },
      tray: { x0: win.x0 + w * 0.3, x1: win.x1 - w * 0.3, y0: win.y1 + w * 0.04, y1: win.y1 + w * 0.11 },
    };
  }
  const R = (r, pad = 0) => ({ x: ox + k * r.x0 - pad, y: oy + k * r.y0 - pad, w: k * (r.x1 - r.x0) + pad * 2, h: k * (r.y1 - r.y0) + pad * 2 });
  function roundRect(c, r, rad) { c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, rad); }

  // Fits the cabinet in the page, clear of the scoreboard (top) and the controls (bottom, or right on a wide screen).
  function resize(w, h, ratio, { top = 0, bottom = 0, right = 0 } = {}) {
    dpr = ratio;
    canvas.width = back.width = front.width = Math.round(w * dpr);
    canvas.height = back.height = front.height = Math.round(h * dpr);
    const m = measure(), cw = m.cab.x1 - m.cab.x0, ch = m.cab.y1 - m.cab.y0;
    const room = h - top - bottom - 8;
    k = Math.min((w - right - 12) / cw, room / ch, 620 / cw);
    ox = (w - right - cw * k) / 2 - m.cab.x0 * k;
    oy = top + 4 + Math.max(0, room - ch * k) * 0.35 - m.cab.y0 * k;
    box = m;
    repaint();
  }
  function repaint() { paintBack(); paintFront(); }
  const cabinet = () => { const r = R(box.cab); return { left: r.x, width: r.w, top: r.y, bottom: r.y + r.h }; };
  // Where on the chute's rail (mm across) a point on the page is, for aiming with a finger.
  function railX(px) {
    const a = at(0, RAIL, CHUTE.z), b = at(DECK.W, RAIL, CHUTE.z);
    return ((px - a.x) / (b.x - a.x)) * DECK.W;
  }

  function paintBack() {
    const c = back.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, back.width, back.height);
    const cab = R(box.cab), win = R(box.win), marq = R(box.marq);
    // the cabinet: teal, darker at the edges, with chrome trim
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .55)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
    roundRect(c, cab, 22); c.fillStyle = C.tealDark; c.fill();
    c.restore();
    const g = c.createLinearGradient(cab.x, 0, cab.x + cab.w, 0);
    g.addColorStop(0, '#0a5f5c'); g.addColorStop(0.2, C.teal); g.addColorStop(0.5, '#129089'); g.addColorStop(0.8, C.teal); g.addColorStop(1, '#0a5f5c');
    roundRect(c, { x: cab.x + 5, y: cab.y + 5, w: cab.w - 10, h: cab.h - 10 }, 18); c.fillStyle = g; c.fill();
    // the sign: navy, a gold rim, and the name with its letters toppling
    roundRect(c, marq, 12); c.fillStyle = C.navy; c.fill();
    c.lineWidth = 3; c.strokeStyle = C.gold; c.stroke();
    const size = marq.h * 0.56, word = 'TOPPLE';
    c.font = `400 ${size}px Bungee, Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const widths = [...word].map(l => c.measureText(l).width), total = widths.reduce((a, b) => a + b, 0) + size * 0.06 * (word.length - 1);
    let x = marq.x + marq.w / 2 - total / 2;
    [...word].forEach((l, i) => {
      const lean = [-0.05, 0.04, -0.03, 0.05, -0.04, 0.16][i];
      c.save();
      c.translate(x + widths[i] / 2, marq.y + marq.h / 2 + size * 0.04 + (i === 5 ? size * 0.05 : 0));
      c.rotate(lean);
      c.fillStyle = C.coral; c.fillText(l, size * 0.05, size * 0.06);
      const lg = c.createLinearGradient(0, -size / 2, 0, size / 2); lg.addColorStop(0, '#fff2bf'); lg.addColorStop(0.55, C.gold); lg.addColorStop(1, C.goldDeep);
      c.fillStyle = lg; c.fillText(l, 0, 0);
      c.restore();
      x += widths[i] + size * 0.06;
    });
    // inside the glass
    c.save();
    roundRect(c, win, 10); c.clip();
    c.fillStyle = C.ink; c.fillRect(win.x, win.y, win.w, win.h);
    // the back wall: deep teal with a gold sunburst, the pockets and the chute's rail
    quad(c, [[0, PUSHER.height, 0], [DECK.W, PUSHER.height, 0], [DECK.W, WALL_TOP, 0], [0, WALL_TOP, 0]]);
    const wallTop = at(0, WALL_TOP, 0), wallBottom = at(0, PUSHER.height, 0);
    const wg = c.createLinearGradient(0, wallTop.y, 0, wallBottom.y);
    wg.addColorStop(0, '#0c3d4a'); wg.addColorStop(1, '#0f5a5c');
    c.fillStyle = wg; c.fill();
    c.save(); c.clip();
    const sun = at(DECK.W / 2, PUSHER.height, 0);
    c.fillStyle = 'rgba(242, 193, 78, .1)';
    for (let i = 0; i < 18; i++) {
      const a0 = Math.PI + (i / 18) * Math.PI, a1 = a0 + Math.PI / 36, L = win.w;
      c.beginPath(); c.moveTo(sun.x, sun.y); c.lineTo(sun.x + Math.cos(a0) * L, sun.y + Math.sin(a0) * L); c.lineTo(sun.x + Math.cos(a1) * L, sun.y + Math.sin(a1) * L); c.fill();
    }
    c.restore();
    // the pockets, dark (their lights are lit each frame), and a sign under them
    for (let i = 0; i < POCKETS; i++) {
      const p = at(((i + 0.5) / POCKETS) * DECK.W, POCKET.y, 0);
      c.fillStyle = C.chrome; c.beginPath(); c.ellipse(p.x, p.y, (POCKET.r + 3) * p.s, (POCKET.r + 3) * p.s, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#04090c'; c.beginPath(); c.ellipse(p.x, p.y, POCKET.r * p.s, POCKET.r * p.s, 0, 0, Math.PI * 2); c.fill();
    }
    const lab = at(DECK.W / 2, SIGN, 0);
    c.font = `400 ${11 * lab.s}px Bungee, Impact, sans-serif`; c.fillStyle = 'rgba(251, 238, 210, .55)';
    c.fillText('DROP ONE IN THE LIT POCKET', lab.x, lab.y);
    quad(c, [[0, RAIL - 3, 4], [DECK.W, RAIL - 3, 4], [DECK.W, RAIL + 3, 4], [0, RAIL + 3, 4]]);
    c.fillStyle = C.steel; c.fill();
    quad(c, [[0, RAIL + 1, 4], [DECK.W, RAIL + 1, 4], [DECK.W, RAIL + 3, 4], [0, RAIL + 3, 4]]);
    c.fillStyle = C.chrome; c.fill();
    // the deck the coins slide on, and the gaps at its front corners where the side walls stop
    quad(c, [[-40, 0, DECK.D - DECK.gutter], [0, 0, DECK.D - DECK.gutter], [0, 0, DECK.D], [-40, 0, DECK.D]]); c.fillStyle = '#020506'; c.fill();
    quad(c, [[DECK.W, 0, DECK.D - DECK.gutter], [DECK.W + 40, 0, DECK.D - DECK.gutter], [DECK.W + 40, 0, DECK.D], [DECK.W, 0, DECK.D]]); c.fill();
    quad(c, [[0, 0, 0], [DECK.W, 0, 0], [DECK.W, 0, DECK.D], [0, 0, DECK.D]]);
    const dg = c.createLinearGradient(0, at(0, 0, 0).y, 0, at(0, 0, DECK.D).y);
    dg.addColorStop(0, '#0a2a30'); dg.addColorStop(1, '#123a40');
    c.fillStyle = dg; c.fill();
    c.strokeStyle = 'rgba(160, 230, 225, .07)'; c.lineWidth = 1;
    for (let z = 20; z < DECK.D; z += 20) { quad(c, [[0, 0, z], [DECK.W, 0, z]]); c.stroke(); }
    // the side walls: glass, from the back wall to where the gutters start
    for (const x of [0, DECK.W]) {
      quad(c, [[x, 0, 0], [x, WALL_TOP, 0], [x, WALL_TOP, DECK.D - DECK.gutter], [x, 0, DECK.D - DECK.gutter]]);
      c.fillStyle = 'rgba(150, 225, 230, .08)'; c.fill();
      c.strokeStyle = 'rgba(210, 250, 250, .35)'; c.lineWidth = 1.5;
      quad(c, [[x, 0, DECK.D - DECK.gutter], [x, WALL_TOP, DECK.D - DECK.gutter]]); c.stroke();
      quad(c, [[x, 0, 0], [x, 0, DECK.D - DECK.gutter]]); c.stroke();
    }
    c.restore();
  }

  function paintFront() {
    const c = front.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, front.width, front.height);
    const win = R(box.win), tray = R(box.tray);
    c.save();
    roundRect(c, win, 10); c.clip();
    // the front edge: a chrome lip, and the face below it the coins go over
    quad(c, [[-50, 0, DECK.D], [DECK.W + 50, 0, DECK.D], [DECK.W + 50, -60, DECK.D], [-50, -60, DECK.D]]);
    const fg = c.createLinearGradient(0, at(0, 0, DECK.D).y, 0, at(0, -60, DECK.D).y);
    fg.addColorStop(0, C.chrome); fg.addColorStop(0.1, '#8d99a5'); fg.addColorStop(0.12, '#1b2a31'); fg.addColorStop(1, '#05090b');
    c.fillStyle = fg; c.fill();
    // the glass: a couple of long reflections
    c.fillStyle = 'rgba(255, 255, 255, .05)';
    c.beginPath(); c.moveTo(win.x + win.w * 0.62, win.y); c.lineTo(win.x + win.w * 0.78, win.y); c.lineTo(win.x + win.w * 0.36, win.y + win.h); c.lineTo(win.x + win.w * 0.2, win.y + win.h); c.fill();
    c.fillStyle = 'rgba(255, 255, 255, .06)';
    c.beginPath(); c.moveTo(win.x + win.w * 0.82, win.y); c.lineTo(win.x + win.w * 0.86, win.y); c.lineTo(win.x + win.w * 0.44, win.y + win.h); c.lineTo(win.x + win.w * 0.4, win.y + win.h); c.fill();
    c.restore();
    // the frame round the glass
    roundRect(c, { x: win.x - 4, y: win.y - 4, w: win.w + 8, h: win.h + 8 }, 13);
    c.lineWidth = 7; c.strokeStyle = C.chrome; c.stroke();
    // the payout tray, where what's won comes out
    roundRect(c, tray, tray.h / 2); c.fillStyle = C.chrome; c.fill();
    roundRect(c, { x: tray.x + 5, y: tray.y + 5, w: tray.w - 10, h: tray.h - 10 }, (tray.h - 10) / 2);
    const tg = c.createLinearGradient(0, tray.y, 0, tray.y + tray.h); tg.addColorStop(0, '#000'); tg.addColorStop(1, '#1d2b31');
    c.fillStyle = tg; c.fill();
    c.font = `400 ${Math.max(9, tray.h * 0.2)}px Bungee, Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(251, 238, 210, .85)';
    c.fillText('EVERY COIN OVER THE EDGE IS A TICKET', tray.x + tray.w / 2, tray.y + tray.h + tray.h * 0.55);
  }

  // ---------- each frame ----------
  function coin(c, x, y, z, kind, alpha = 1, tilt = 0) {
    const p = at(x, y + COIN.thick, z), q = at(x, y + COIN.thick, z + COIN.r);
    const rx = COIN.r * p.s, ry = Math.max(0.5, (q.y - p.y) * Math.cos(tilt) + rx * Math.abs(Math.sin(tilt)) * 0.9);
    const th = COIN.thick * p.s * 0.8, l = LOOK[kind] || LOOK.coin;
    c.globalAlpha = alpha;
    c.fillStyle = l.rim; c.beginPath(); c.ellipse(p.x, p.y + th, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = l.face; c.beginPath(); c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = l.ring; c.lineWidth = Math.max(0.6, rx * 0.12);
    c.beginPath(); c.ellipse(p.x, p.y, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = l.shine; c.lineWidth = Math.max(0.6, rx * 0.14);
    c.beginPath(); c.ellipse(p.x, p.y, rx * 0.86, ry * 0.86, 0, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
    c.globalAlpha = 1;
  }

  // A prize: a little blister card lying on the deck, its toy standing up on it.
  function prize(c, piece, y, emoji) {
    const verts = piece.vertices, top = y + 8;
    c.beginPath(); verts.forEach((v, i) => { const p = at(v.x, y, v.y); c[i ? 'lineTo' : 'moveTo'](p.x, p.y + 0); }); c.closePath();
    c.fillStyle = '#7a2d22'; c.fill();
    c.beginPath(); verts.forEach((v, i) => { const p = at(v.x, top, v.y); c[i ? 'lineTo' : 'moveTo'](p.x, p.y); }); c.closePath();
    c.fillStyle = C.coral; c.fill(); c.strokeStyle = '#ffd3c7'; c.lineWidth = 1.2; c.stroke();
    const m = at(piece.position.x, top, piece.position.y);
    c.font = `${PRIZE.h * 1.25 * m.s}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText(emoji, m.x, m.y + PRIZE.h * 0.25 * m.s);
  }

  // m: the machine. aim: where the chute is, mm across. pops: "+1"s where coins went over ({ x, n or text, t, big }).
  // emoji(id): what a prize looks like. glow: 0 to 1, the sign blazing for a bonus.
  function frame(m, { now = 0, aim = DECK.W / 2, ready = true, pops = [], emoji = () => '🎁', glow = 0 } = {}) {
    const t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(back, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bulbs(t, glow);
    const win = R(box.win);
    ctx.save();
    roundRect(ctx, win, 10); ctx.clip();
    pockets(m.lights, t);
    // the chute on its rail, and where its coin will land
    const ch = at(aim, RAIL, 6), land = at(aim, PUSHER.height, CHUTE.z);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(251, 238, 210, .28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ch.x, ch.y + 14 * ch.s); ctx.lineTo(land.x, land.y); ctx.stroke(); ctx.setLineDash([]);
    const shelf = m.pieces.filter(p => p.layer === 'shelf').sort((a, b) => a.position.y - b.position.y);
    const deck = m.pieces.filter(p => p.layer === 'deck').sort((a, b) => a.position.y - b.position.y);
    // the shelf: the pusher's top, with stripes that move with it
    const lip = m.lip;
    quad(ctx, [[0, PUSHER.height, 0], [DECK.W, PUSHER.height, 0], [DECK.W, PUSHER.height, lip], [0, PUSHER.height, lip]]);
    ctx.fillStyle = '#1f6f73'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, .08)'; ctx.lineWidth = 6 * at(0, PUSHER.height, lip).s;
    for (let z = lip - 12; z > -20; z -= 24) { quad(ctx, [[0, PUSHER.height, z], [DECK.W, PUSHER.height, z]]); ctx.stroke(); }
    ctx.restore();
    for (const p of shelf) piece(p, PUSHER.height);
    for (const d of m.dropping) {
      const f = Math.min(1, d.t / CHUTE.fall);
      coin(ctx, d.x, RAIL - (RAIL - PUSHER.height) * f * f, CHUTE.z, d.kind, 1, (1 - f) * 1.2);
    }
    // its face, which does the pushing
    quad(ctx, [[0, 0, lip], [DECK.W, 0, lip], [DECK.W, PUSHER.height, lip], [0, PUSHER.height, lip]]);
    const top = at(0, PUSHER.height, lip), bottom = at(0, 0, lip);
    const fg = ctx.createLinearGradient(0, top.y, 0, bottom.y);
    fg.addColorStop(0, '#f4f7fa'); fg.addColorStop(0.35, C.chrome); fg.addColorStop(1, C.steel);
    ctx.fillStyle = fg; ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, .25)'; quad(ctx, [[0, 0, lip], [DECK.W, 0, lip], [DECK.W, 2, lip], [0, 2, lip]]); ctx.fill();
    for (const p of deck) piece(p, 0);
    // what's going over the edges
    for (const f of m.falling) {
      const g = f.t * f.t * 900, fade = Math.max(0, 1 - f.t / 0.45);
      if (fade <= 0 || f.kind === 'prize') continue;
      if (f.edge === 'front') coin(ctx, f.x, -g, DECK.D + 4 + f.t * 30, f.kind, fade, Math.min(1.3, f.t * 6));
      else coin(ctx, f.x + (f.x < 0 ? -1 : 1) * f.t * 40, -g, f.z, f.kind, fade * 0.7, Math.min(1.3, f.t * 6));
    }
    ctx.restore();
    // the chute's carriage, over the glass's top edge if it has to be
    roundRect(ctx, { x: ch.x - 17 * ch.s, y: ch.y - 9 * ch.s, w: 34 * ch.s, h: 24 * ch.s }, 5 * ch.s);
    ctx.fillStyle = C.coral; ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .35)'; ctx.fillRect(ch.x - 13 * ch.s, ch.y - 6 * ch.s, 26 * ch.s, 4 * ch.s);
    ctx.fillStyle = '#2a0f0b'; ctx.fillRect(ch.x - 11 * ch.s, ch.y + 8 * ch.s, 22 * ch.s, 4 * ch.s);
    if (ready) coin(ctx, aim, RAIL + 4, 6, 'coin', 1, 1.1);
    ctx.drawImage(front, 0, 0, front.width / dpr, front.height / dpr);
    // the pops: +1 rising off the front edge, gold for a gold coin
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of pops) {
      const q = at(Math.max(30, Math.min(DECK.W - 30, p.x)), 14 + p.t * 50, DECK.D); // kept clear of the glass's edges
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.1);
      ctx.font = `400 ${(p.big ? 18 : 13) * q.s * 1.7}px Bungee, Impact, sans-serif`;
      const text = p.text || `+${p.n}`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7, 18, 24, .8)'; ctx.strokeText(text, q.x, q.y);
      ctx.fillStyle = p.big ? C.gold : C.cream; ctx.fillText(text, q.x, q.y);
    }
    ctx.globalAlpha = 1;

    function piece(p, y) {
      if (p.kind === 'prize') prize(ctx, p, y + p.h, emoji(p.prize));
      else coin(ctx, p.position.x, y + p.h, p.position.y, p.kind);
    }
  }

  // The pockets' lights: off, chasing along, or one lit and open, with BONUS over it.
  function pockets(lights, t) {
    for (let i = 0; i < POCKETS; i++) {
      const lit = lights.state !== 'idle' && lights.at === i;
      const p = at(((i + 0.5) / POCKETS) * DECK.W, POCKET.y, 0), r = (POCKET.r + 3) * p.s;
      ctx.lineWidth = 3 * p.s;
      // the open pocket blinks; asked for less motion, it's lit bright and steady
      ctx.strokeStyle = lit ? (lights.state === 'open' && (calm?.matches || Math.floor(t * 8) % 2) ? '#fff6d0' : C.gold) : 'rgba(242, 193, 78, .25)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      if (lit) {
        ctx.fillStyle = 'rgba(242, 193, 78, .35)'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      if (lit && lights.state === 'open') {
        ctx.font = `400 ${10 * p.s}px Bungee, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.gold; ctx.fillText('BONUS', p.x, p.y - r - 8 * p.s);
      }
    }
  }

  // The bulbs round the sign, chasing; glow makes them all flash. Asked for less motion, they're all lit and steady,
  // and glow makes them all brighter, with no blinking.
  function bulbs(t, glow) {
    const r = R(box.marq), inset = 6, n = Math.max(8, Math.round((r.w - inset * 2) / 15));
    const step = (r.w - inset * 2) / n, phase = Math.floor(t * 3) % 2, still = !!calm?.matches, blaze = still && glow > 0;
    let i = 0;
    const bulb = (x, y) => {
      const on = still || (glow > 0 ? Math.floor(t * 10) % 2 === 0 || i % 2 : (i + phase) % 2 === 0);
      i++;
      if (on) { ctx.fillStyle = blaze ? 'rgba(255, 232, 170, .6)' : 'rgba(255, 220, 140, .35)'; ctx.beginPath(); ctx.arc(x, y, blaze ? 5.6 : 4.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = blaze ? '#fffbea' : on ? '#fff1c4' : '#5b4524'; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill();
    };
    for (let j = 0; j <= n; j++) { bulb(r.x + inset + j * step, r.y + inset - 1); bulb(r.x + inset + j * step, r.y + r.h - inset + 1); }
  }

  // Where the back wall's sign is, and the chute's carriage (with a coin in it) at an aim, on the page: for the tests.
  function sign() {
    const lab = at(DECK.W / 2, SIGN, 0);
    ctx.font = `400 ${11 * lab.s}px Bungee, Impact, sans-serif`;
    const w = ctx.measureText('DROP ONE IN THE LIT POCKET').width, h = 11 * lab.s;
    return { x: lab.x - w / 2, y: lab.y - h / 2, w, h };
  }
  function chute(aim) {
    const ch = at(aim, RAIL, 6), coin = at(aim, RAIL + 4 + COIN.r, 6);
    const top = Math.min(ch.y - 9 * ch.s, coin.y);
    return { x: ch.x - 17 * ch.s, y: top, w: 34 * ch.s, h: ch.y + 15 * ch.s - top };
  }

  return { resize, repaint, frame, cabinet, railX, at, sign, chute };
}
