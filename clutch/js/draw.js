// Clutch's pictures: the cabinet, the glass box and everything in it, on one canvas, from js/machine.js's world.
// What never moves (the cabinet, the back of the box, the glass and the front panel) is painted once per resize into
// two layers, back and front, and each frame puts the claw and the plush between them.
// Everything is in the machine's millimetres; resize() works out how big a millimetre is on this screen.

import { BOX, KINDS } from './machine.js';

const CAB = { x0: -36, x1: 636, y0: -112, y1: 924 };   // the cabinet's outline
const MARQ = { x0: -18, x1: 618, y0: -98, y1: -24 };   // the sign on top
const RAIL = 26;                                        // the middle of the rail the claw's trolley runs on
const DOOR = { x0: 24, x1: 132, y0: 792, y1: 886 };     // the prize door, under the chute
const COIN = { x0: 446, x1: 578, y0: 792, y1: 886 };    // the coin door, set to free play
const CHROME = '#d5dbe4', STEEL = '#6b7487', DARK = '#2a1b2e';
// Asked for less motion (the system's setting, read each frame, so a change shows at once): lights hold steady.
const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');


// Each plush comes in a colour or two: [fill, edge, and the light patches some have].
const LOOKS = {
  bear: [['#c58447', '#8a552a', '#f3dfc4'], ['#e2ad6c', '#a8763d', '#fbead2'], ['#f4a9bd', '#c9738d', '#fde6ec']],
  chick: [['#ffd84a', '#dba11c'], ['#fff07d', '#e3be35']],
  frog: [['#72d35c', '#3d9638', '#c9f2a8'], ['#5fd3a6', '#2c9873', '#c4f5e0']],
  ghost: [['#f6f2ff', '#bcb0e0'], ['#e3fbf1', '#9fd6be']],
  penguin: [['#2e3a63', '#161c38', '#f7f4ee'], ['#3d3d4f', '#1d1d27', '#f7f4ee']],
  alien: [['#a8ea5c', '#68ad2e'], ['#b892ff', '#7a52d0']],
  star: [['#ffd23f', '#d98c12']],
};
const look = (kind, tone) => { const l = LOOKS[kind]; return l[Math.min(l.length - 1, Math.floor(tone * l.length))]; };

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); }
function eye(ctx, x, y, r) {
  ctx.fillStyle = DARK; circle(ctx, x, y, r);
  ctx.fillStyle = '#fff'; circle(ctx, x - r * 0.32, y - r * 0.36, r * 0.36);
}
function blush(ctx, x, y, r) { ctx.fillStyle = 'rgba(255, 105, 140, .38)'; circle(ctx, x, y, r); }
function smile(ctx, x0, y0, cx, cy, x1, y1, w = 2) {
  ctx.strokeStyle = DARK; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
}
function seam(ctx, [cx, cy, r], color) {
  ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.globalAlpha = 1;
}

// The faces, in each kind's own millimetres (the same ones as its parts in machine.js).
const FACES = {
  bear(ctx, colours, p) {
    const [, edge, light] = colours;
    ctx.fillStyle = colours === LOOKS.bear[2] ? light : '#f6b6c4';
    circle(ctx, -19, -52, 5.5); circle(ctx, 19, -52, 5.5);
    ctx.fillStyle = light; ctx.globalAlpha = 0.6; ellipse(ctx, 0, 22, 19, 16); ctx.globalAlpha = 1;
    seam(ctx, p[1], edge);
    ctx.fillStyle = light; ellipse(ctx, 0, -21, 12, 9);
    ctx.fillStyle = DARK; ellipse(ctx, 0, -25, 4.6, 3.3);
    ctx.strokeStyle = DARK; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4.5, -17.5); ctx.quadraticCurveTo(-2, -14.5, 0, -18); ctx.quadraticCurveTo(2, -14.5, 4.5, -17.5); ctx.stroke();
    eye(ctx, -10, -34, 3.3); eye(ctx, 10, -34, 3.3);
    ctx.fillStyle = light; circle(ctx, -17, 44, 7); circle(ctx, 17, 44, 7);
  },
  chick(ctx, [, edge], p) {
    ctx.fillStyle = edge; ctx.globalAlpha = 0.45; ellipse(ctx, -10, 14, 18, 12, -0.35); ctx.globalAlpha = 1;
    seam(ctx, p[1], edge);
    ctx.fillStyle = '#ff9a2e'; ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(32, -35); ctx.lineTo(46, -29); ctx.lineTo(32, -23); ctx.closePath(); ctx.fill(); ctx.stroke();
    eye(ctx, 22, -37, 3.4);
    blush(ctx, 25, -26, 4.5);
    ctx.strokeStyle = edge; ctx.lineWidth = 2.2;
    for (const x of [11, 16, 21]) { ctx.beginPath(); ctx.arc(x, -55, 3.2, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke(); }
    ctx.fillStyle = '#ff9a2e'; ellipse(ctx, -13, 46, 7, 3.5); ellipse(ctx, 9, 47, 7, 3.5);
  },
  frog(ctx, [, , light]) {
    ctx.fillStyle = light; ctx.globalAlpha = 0.7; ellipse(ctx, 0, 21, 24, 10); ctx.globalAlpha = 1;
    for (const x of [-18, 18]) {
      ctx.fillStyle = '#fff'; circle(ctx, x, -25, 8.5);
      eye(ctx, x + (x < 0 ? 1.2 : -1.2), -24, 4.6);
    }
    smile(ctx, -17, 7, 0, 21, 17, 7, 2.4);
    blush(ctx, -29, 9, 5); blush(ctx, 29, 9, 5);
  },
  ghost(ctx) {
    for (const s of [-1, 1]) {
      ctx.fillStyle = DARK; ellipse(ctx, s * 12, -13, 4.6, 6.6);
      ctx.fillStyle = '#fff'; circle(ctx, s * 12 - 1.6, -16, 1.7);
    }
    ctx.fillStyle = DARK; ellipse(ctx, 0, 4, 4, 5);
    blush(ctx, -22, -2, 5); blush(ctx, 22, -2, 5);
  },
  penguin(ctx, [, edge, light]) {
    ctx.fillStyle = edge; ellipse(ctx, -27, 12, 6, 15, 0.3); ellipse(ctx, 27, 12, 6, 15, -0.3);
    ctx.fillStyle = light; ellipse(ctx, 0, 18, 20, 23);
    circle(ctx, -8.5, -24, 10.5); circle(ctx, 8.5, -24, 10.5); ellipse(ctx, 0, -17, 14, 9);
    eye(ctx, -8, -27, 3.2); eye(ctx, 8, -27, 3.2);
    ctx.fillStyle = '#ff9a2e'; ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-5, -20); ctx.lineTo(5, -20); ctx.lineTo(0, -13); ctx.closePath(); ctx.fill(); ctx.stroke();
    blush(ctx, -16, -17, 3.8); blush(ctx, 16, -17, 3.8);
    ctx.fillStyle = '#ff9a2e'; ellipse(ctx, -10, 43, 7, 3.4); ellipse(ctx, 10, 43, 7, 3.4);
  },
  alien(ctx, [, edge], p) {
    ctx.strokeStyle = edge; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 9, -40); ctx.quadraticCurveTo(s * 12, -50, s * 17, -55); ctx.stroke();
      ctx.fillStyle = '#ff6fae'; circle(ctx, s * 17, -56, 4.2);
    }
    seam(ctx, p[0], edge);
    for (const s of [-1, 1]) {
      ctx.fillStyle = DARK; ellipse(ctx, s * 13, -12, 9, 6, s * 0.45);
      ctx.fillStyle = '#fff'; circle(ctx, s * 13 - 3, -14, 2.2);
    }
    smile(ctx, -6, 4, 0, 10, 6, 4, 2);
    ctx.fillStyle = edge; ctx.globalAlpha = 0.35; circle(ctx, -7, 31, 3.2); circle(ctx, 6, 36, 2.4); ctx.globalAlpha = 1;
  },
};

function starPath(ctx, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
}
function star(ctx, [base, edge], t) {
  ctx.lineJoin = 'round';
  starPath(ctx, 35, 20);
  ctx.fillStyle = edge; ctx.strokeStyle = edge; ctx.lineWidth = 11; ctx.fill(); ctx.stroke();
  ctx.fillStyle = base; ctx.strokeStyle = base; ctx.lineWidth = 6.5; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, .35)'; ellipse(ctx, -8, -12, 8, 4.5, -0.6);
  eye(ctx, -8, -3, 3.3); eye(ctx, 8, -3, 3.3);
  smile(ctx, -6, 6, 0, 12, 6, 6, 2);
  blush(ctx, -15, 5, 4); blush(ctx, 15, 5, 4);
  // it glitters
  ctx.fillStyle = '#fffbe6';
  [[-30, -26], [31, -14], [22, 30]].forEach(([x, y], i) => {
    const k = Math.max(0, Math.sin(t * 3.1 + i * 2.1));
    if (k < 0.05) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(1.4, -1.4); ctx.lineTo(6, 0); ctx.lineTo(1.4, 1.4); ctx.lineTo(0, 6);
    ctx.lineTo(-1.4, 1.4); ctx.lineTo(-6, 0); ctx.lineTo(-1.4, -1.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
}

// One plush: its middle (the point its kind's parts are measured from) at x, y, turned by angle, s times its usual size.
export function drawPlush(ctx, kind, tone, x, y, angle = 0, s = 1, t = 0) {
  const parts = KINDS[kind].parts, colours = look(kind, tone);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(s, s);
  if (kind === 'star') star(ctx, colours, t);
  else {
    // its outline, then its fill over that, so the rounds it's made of read as one shape
    ctx.fillStyle = colours[1];
    for (const [cx, cy, r] of parts) circle(ctx, cx, cy, r + 2.4);
    ctx.fillStyle = colours[0];
    for (const [cx, cy, r] of parts) circle(ctx, cx, cy, r);
    const [cx, cy, r] = parts[0];
    ctx.fillStyle = 'rgba(255, 255, 255, .16)';
    ellipse(ctx, cx - r * 0.34, cy - r * 0.42, r * 0.42, r * 0.25, -0.5);
    FACES[kind](ctx, colours, parts);
  }
  ctx.restore();
}

// Where a plush body's middle is: its first round, less that round's offset (turned and sized as the body is).
function middle(toy) {
  const p = toy.parts[1].position, [cx, cy] = KINDS[toy.kind].parts[0], c = Math.cos(toy.angle), s = Math.sin(toy.angle);
  return { x: p.x - (cx * c - cy * s) * toy.scale, y: p.y - (cx * s + cy * c) * toy.scale };
}

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

export function createDraw(canvas) {
  const ctx = canvas.getContext('2d');
  const back = document.createElement('canvas'), front = document.createElement('canvas');
  let k = 1, ox = 0, oy = 0, dpr = 1;

  function world(c) { c.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy); }

  function paintBack() {
    const c = back.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, back.width, back.height);
    world(c);
    // the cabinet: candy pink, darker at the edges
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .55)'; c.shadowBlur = 40 * k * dpr; c.shadowOffsetY = 14 * k * dpr;
    roundRect(c, CAB.x0, CAB.y0, CAB.x1 - CAB.x0, CAB.y1 - CAB.y0, 30);
    c.fillStyle = '#9c1d50'; c.fill();
    c.restore();
    cabinetFace(c);
    // the sign: a dark plate with CLUTCH in neon (its bulbs are lit each frame)
    roundRect(c, MARQ.x0, MARQ.y0, MARQ.x1 - MARQ.x0, MARQ.y1 - MARQ.y0, 16);
    c.fillStyle = '#170a26'; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#ffd36a'; c.stroke();
    c.save();
    c.font = '400 54px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#ff5fa2'; c.shadowBlur = 18 * k * dpr;
    c.fillStyle = '#ffd0e3';
    if (c.letterSpacing !== undefined) c.letterSpacing = '4px';
    c.fillText('CLUTCH', 300, (MARQ.y0 + MARQ.y1) / 2 + 3);
    c.shadowBlur = 6 * k * dpr; c.fillText('CLUTCH', 300, (MARQ.y0 + MARQ.y1) / 2 + 3);
    c.restore();
    // the back of the box: deep purple, lit from the top, with stars on the wallpaper
    c.save();
    c.beginPath(); c.rect(0, 0, BOX.W, BOX.H); c.clip();
    const g = c.createLinearGradient(0, 0, 0, BOX.H);
    g.addColorStop(0, '#2b1458'); g.addColorStop(0.55, '#3a1766'); g.addColorStop(1, '#22103f');
    c.fillStyle = g; c.fillRect(0, 0, BOX.W, BOX.H);
    const glow = c.createRadialGradient(300, 0, 20, 300, 0, 520);
    glow.addColorStop(0, 'rgba(255, 220, 255, .28)'); glow.addColorStop(1, 'rgba(255, 220, 255, 0)');
    c.fillStyle = glow; c.fillRect(0, 0, BOX.W, BOX.H);
    c.fillStyle = 'rgba(255, 210, 240, .1)';
    for (let y = 60, row = 0; y < BOX.H; y += 54, row++) {
      for (let x = row % 2 ? 27 : 0; x < BOX.W + 30; x += 54) { c.save(); c.translate(x, y); c.scale(0.22, 0.22); starPath(c, 30, 13); c.fill(); c.restore(); }
    }
    // the light strip along the top, and the rail the claw runs on
    c.fillStyle = 'rgba(255, 240, 250, .9)'; c.fillRect(0, 0, BOX.W, 5);
    c.fillStyle = STEEL; c.fillRect(0, RAIL - 6, BOX.W, 12);
    c.fillStyle = CHROME; c.fillRect(0, RAIL - 6, BOX.W, 5);
    for (const x of [6, BOX.W - 6]) { c.fillStyle = STEEL; c.fillRect(x - 6, 0, 12, RAIL + 10); }
    // down the chute: a dark hole in the floor, behind the clear guard
    const pit = c.createLinearGradient(0, BOX.floor - 10, 0, BOX.H);
    pit.addColorStop(0, '#120822'); pit.addColorStop(1, '#030106');
    c.fillStyle = pit; c.fillRect(0, BOX.floor - 4, BOX.chute.x1 + 4, BOX.H - BOX.floor + 4);
    c.restore();
  }

  function cabinetFace(c) {
    c.save();
    roundRect(c, CAB.x0 + 6, CAB.y0 + 6, CAB.x1 - CAB.x0 - 12, CAB.y1 - CAB.y0 - 12, 26);
    const g = c.createLinearGradient(CAB.x0, 0, CAB.x1, 0);
    g.addColorStop(0, '#c92a68'); g.addColorStop(0.18, '#ec4a86'); g.addColorStop(0.5, '#f25a91'); g.addColorStop(0.82, '#ec4a86'); g.addColorStop(1, '#c92a68');
    c.fillStyle = g; c.fill();
    c.restore();
  }

  function paintFront() {
    const c = front.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, front.width, front.height);
    world(c);
    // the clear guard round the chute, and its label
    c.fillStyle = 'rgba(190, 235, 255, .06)'; c.fillRect(0, BOX.guard.top, BOX.guard.x + 5, BOX.floor - BOX.guard.top);
    c.fillStyle = 'rgba(210, 240, 255, .22)'; c.fillRect(BOX.guard.x - 5, BOX.guard.top, 10, BOX.floor - BOX.guard.top);
    c.fillStyle = 'rgba(255, 255, 255, .6)'; c.fillRect(BOX.guard.x - 4, BOX.guard.top, 2, BOX.floor - BOX.guard.top);
    roundRect(c, BOX.guard.x - 6, BOX.guard.top - 4, 12, 8, 4); c.fillStyle = 'rgba(230, 248, 255, .7)'; c.fill();
    roundRect(c, 22, BOX.guard.top + 26, 104, 34, 10); c.fillStyle = 'rgba(255, 95, 162, .88)'; c.fill();
    c.font = '400 15px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff4f9';
    c.fillText('PRIZE ↓', 74, BOX.guard.top + 44);
    // the front edge of the floor the plush sit on
    const sill = c.createLinearGradient(0, BOX.floor, 0, BOX.H);
    sill.addColorStop(0, '#5d2a8c'); sill.addColorStop(0.08, '#3a1766'); sill.addColorStop(1, '#1d0b36');
    c.fillStyle = sill; c.fillRect(BOX.chute.x1, BOX.floor, BOX.W - BOX.chute.x1, BOX.H - BOX.floor);
    c.fillStyle = 'rgba(255, 210, 240, .5)'; c.fillRect(BOX.chute.x1, BOX.floor, BOX.W - BOX.chute.x1, 2);
    // the glass: a couple of long reflections, and shade in the corners
    c.save();
    c.beginPath(); c.rect(0, 0, BOX.W, BOX.H); c.clip();
    c.fillStyle = 'rgba(255, 255, 255, .05)';
    c.beginPath(); c.moveTo(390, 0); c.lineTo(470, 0); c.lineTo(170, BOX.H); c.lineTo(90, BOX.H); c.fill();
    c.fillStyle = 'rgba(255, 255, 255, .07)';
    c.beginPath(); c.moveTo(488, 0); c.lineTo(504, 0); c.lineTo(204, BOX.H); c.lineTo(188, BOX.H); c.fill();
    const v = c.createRadialGradient(300, 380, 260, 300, 380, 560);
    v.addColorStop(0, 'rgba(10, 4, 20, 0)'); v.addColorStop(1, 'rgba(10, 4, 20, .4)');
    c.fillStyle = v; c.fillRect(0, 0, BOX.W, BOX.H);
    c.restore();
    // the frame round the glass
    roundRect(c, -7, -7, BOX.W + 14, BOX.H + 14, 12);
    c.lineWidth = 10; c.strokeStyle = CHROME; c.stroke();
    c.lineWidth = 2; c.strokeStyle = STEEL; roundRect(c, -2, -2, BOX.W + 4, BOX.H + 4, 8); c.stroke();
    // the front panel under the glass: anything won falls behind it, into the prize door
    c.save();
    roundRect(c, CAB.x0 + 6, CAB.y0 + 6, CAB.x1 - CAB.x0 - 12, CAB.y1 - CAB.y0 - 12, 26); c.clip();
    c.beginPath(); c.rect(CAB.x0, BOX.H + 3, CAB.x1 - CAB.x0, CAB.y1 - BOX.H); c.clip();
    cabinetFace(c);
    c.restore();
    // the prize door: a dark hole with a smoky flap (drawn each frame, so it can swing)
    roundRect(c, DOOR.x0 - 6, DOOR.y0 - 6, DOOR.x1 - DOOR.x0 + 12, DOOR.y1 - DOOR.y0 + 12, 12);
    c.fillStyle = CHROME; c.fill();
    roundRect(c, DOOR.x0, DOOR.y0, DOOR.x1 - DOOR.x0, DOOR.y1 - DOOR.y0, 8);
    const hole = c.createLinearGradient(0, DOOR.y0, 0, DOOR.y1);
    hole.addColorStop(0, '#000'); hole.addColorStop(1, '#1b0d24');
    c.fillStyle = hole; c.fill();
    // the coin door, on free play
    roundRect(c, COIN.x0, COIN.y0, COIN.x1 - COIN.x0, COIN.y1 - COIN.y0, 10);
    c.fillStyle = '#1d1020'; c.fill(); c.lineWidth = 4; c.strokeStyle = CHROME; c.stroke();
    roundRect(c, COIN.x0 + 54, COIN.y0 + 14, 24, 34, 4); c.fillStyle = CHROME; c.fill();
    c.fillStyle = '#000'; c.fillRect(COIN.x0 + 64, COIN.y0 + 19, 4, 24);
    c.font = '400 15px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.shadowColor = 'rgba(255, 110, 40, .9)'; c.shadowBlur = 8 * k * dpr; c.fillStyle = '#ff7a3a';
    c.fillText('FREE PLAY', (COIN.x0 + COIN.x1) / 2, COIN.y1 - 22);
    c.restore();
    // and in the middle, what it's for
    c.font = '400 21px Bungee, Impact, sans-serif'; c.fillStyle = '#fff1f6';
    c.fillText('WIN A PLUSH', 289, 830);
    c.font = '600 15px Figtree, system-ui, sans-serif'; c.fillStyle = 'rgba(255, 241, 246, .8)';
    c.fillText('every go is free', 289, 858);
  }

  // Fits the cabinet in the page, clear of the scoreboard (top) and the control deck (bottom, or right on a wide screen).
  function resize(w, h, ratio, { top = 0, bottom = 0, right = 0 } = {}) {
    dpr = ratio;
    canvas.width = back.width = front.width = Math.round(w * dpr);
    canvas.height = back.height = front.height = Math.round(h * dpr);
    const room = h - top - bottom - 8, cw = CAB.x1 - CAB.x0, ch = CAB.y1 - CAB.y0;
    k = Math.min((w - right - 12) / cw, room / ch, 1.1);
    ox = (w - right - cw * k) / 2 - CAB.x0 * k;
    oy = top + 4 + Math.max(0, room - ch * k) * 0.35 - CAB.y0 * k;
    repaint();
  }
  function repaint() { paintBack(); paintFront(); }

  // Where the cabinet is on the page, in CSS pixels, so the control deck can line up under it; and where a point in
  // the machine is (for the screenshot tool).
  const cabinet = () => ({ left: ox + CAB.x0 * k, width: (CAB.x1 - CAB.x0) * k, top: oy + CAB.y0 * k, bottom: oy + CAB.y1 * k });
  const at = (x, y) => ({ x: ox + x * k, y: oy + y * k });

  // door: the plush just won, as it drops into the prize door ({ kind, tone, t } with t in seconds), or null.
  function frame(m, { now = 0, door = null, glow = 0 } = {}) {
    const t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(back, 0, 0);
    world(ctx);
    bulbs(t, glow);
    // inside the glass
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, BOX.W, BOX.H); ctx.clip();
    const { claw, hub } = m;
    // the trolley on the rail, and the cable down to the claw
    roundRect(ctx, claw.x - 28, RAIL - 12, 56, 24, 6); ctx.fillStyle = STEEL; ctx.fill();
    ctx.fillStyle = CHROME; roundRect(ctx, claw.x - 28, RAIL - 12, 56, 8, 6); ctx.fill();
    ctx.fillStyle = DARK; circle(ctx, claw.x - 16, RAIL + 12, 5); circle(ctx, claw.x + 16, RAIL + 12, 5);
    ctx.strokeStyle = '#1f2230'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(claw.x, RAIL + 12); ctx.lineTo(hub.position.x, hub.position.y - 34); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, .25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(claw.x - 0.8, RAIL + 12); ctx.lineTo(hub.position.x - 0.8, hub.position.y - 34); ctx.stroke();
    for (const toy of m.toys) {
      const c = middle(toy);
      drawPlush(ctx, toy.kind, toy.tone, c.x, c.y, toy.angle, toy.scale, t);
    }
    drawClaw(m);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(front, 0, 0);
    world(ctx);
    prizeDoor(door, t);
  }

  function drawClaw(m) {
    const { claw, hub, arms } = m;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const arm of arms) {
      ctx.beginPath();
      for (const part of arm.parts.slice(1)) {
        part.vertices.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](v.x, v.y));
        ctx.closePath();
      }
      ctx.lineWidth = 5; ctx.strokeStyle = '#4d5566'; ctx.stroke();
      ctx.fillStyle = CHROME; ctx.fill();
      // a shine down the shaft
      const s = arm.parts[1].vertices, a = arm.side < 0 ? [s[0], s[3]] : [s[1], s[2]];
      ctx.strokeStyle = 'rgba(255, 255, 255, .8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo((a[0].x * 3 + s[arm.side < 0 ? 1 : 0].x) / 4, (a[0].y * 3 + s[arm.side < 0 ? 1 : 0].y) / 4);
      ctx.lineTo((a[1].x * 3 + s[arm.side < 0 ? 2 : 3].x) / 4, (a[1].y * 3 + s[arm.side < 0 ? 2 : 3].y) / 4); ctx.stroke();
    }
    // the head: a motor housing on top, the hub the arms hang from, and their pins
    const { x, y } = hub.position;
    ctx.fillStyle = STEEL;
    ctx.beginPath(); ctx.ellipse(x, y - 13, 24, 22, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = CHROME;
    ctx.beginPath(); ctx.ellipse(x - 3, y - 15, 18, 17, 0, Math.PI, 0); ctx.fill();
    roundRect(ctx, x - 34, y - 14, 68, 28, 9); ctx.fillStyle = '#4d5566'; ctx.fill();
    roundRect(ctx, x - 32, y - 12, 64, 24, 8); ctx.fillStyle = '#ff5fa2'; ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .35)'; ctx.fillRect(x - 26, y - 9, 52, 4);
    for (const arm of arms) {
      const px = claw.x + arm.side * 20, py = claw.y + 12;
      ctx.fillStyle = '#4d5566'; circle(ctx, px, py, 6);
      ctx.fillStyle = CHROME; circle(ctx, px, py, 2.6);
    }
  }

  // The bulbs round the sign, chasing; glow (0 to 1) makes them all blaze, for a win. Asked for less motion, they're
  // all lit and steady, and a win's blaze is all of them brighter, with no blinking.
  function bulbs(t, glow) {
    const inset = 9, phase = Math.floor(t * 3) % 2, still = !!calm?.matches, blaze = still && glow > 0;
    const x0 = MARQ.x0 + inset, x1 = MARQ.x1 - inset, y0 = MARQ.y0 + inset, y1 = MARQ.y1 - inset;
    const across = (x1 - x0) / Math.round((x1 - x0) / 26), down = (y1 - y0) / Math.round((y1 - y0) / 26);
    let i = 0;
    const bulb = (x, y) => {
      const on = still || (glow > 0 ? Math.floor(t * 10) % 2 === 0 || i % 2 : (i + phase) % 2 === 0);
      i++;
      ctx.fillStyle = blaze ? 'rgba(255, 232, 170, .6)' : on ? 'rgba(255, 220, 140, .35)' : 'transparent';
      if (on) circle(ctx, x, y, blaze ? 8.5 : 6.5);
      ctx.fillStyle = blaze ? '#fffbea' : on ? '#fff1c4' : '#6b4a2a';
      circle(ctx, x, y, 3.4);
    };
    for (let x = x0; x < x1 + 1; x += across) { bulb(x, y0); bulb(x, y1); }
    for (let y = y0 + down; y < y1 - 1; y += down) { bulb(x0, y); bulb(x1, y); }
  }

  // The prize door: the plush just won drops into view behind the flap, and the flap swings up.
  function prizeDoor(door, t) {
    const w = DOOR.x1 - DOOR.x0, h = DOOR.y1 - DOOR.y0;
    let open = 0;
    if (door) {
      const k = Math.min(1, door.t / 0.35), drop = 1 - (1 - k) ** 2;
      open = Math.min(1, door.t / 0.25);
      ctx.save();
      roundRect(ctx, DOOR.x0, DOOR.y0, w, h, 8); ctx.clip();
      const bounce = door.t > 0.35 ? Math.sin(Math.min(1, (door.t - 0.35) / 0.3) * Math.PI) * 4 : 0;
      drawPlush(ctx, door.kind, door.tone, (DOOR.x0 + DOOR.x1) / 2, DOOR.y0 - 40 + drop * 92 - bounce, 0.12, 0.66, t);
      ctx.restore();
    }
    // the flap, hinged at the top: as it swings up it shows less of itself
    const fh = h * (1 - 0.82 * open);
    roundRect(ctx, DOOR.x0, DOOR.y0, w, fh, 8);
    ctx.fillStyle = 'rgba(40, 20, 50, .55)'; ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .1)'; ctx.fillRect(DOOR.x0 + 6, DOOR.y0 + 4, w - 12, Math.min(6, fh / 3));
    if (fh > 40) {
      ctx.font = '400 14px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 241, 246, .55)';
      ctx.fillText('PUSH', (DOOR.x0 + DOOR.x1) / 2, DOOR.y0 + fh / 2);
    }
  }

  return { resize, repaint, frame, cabinet, at };
}
