// Highrise's pictures: a cabinet with a night skyline inside, and in the middle of it the tower, its windows the
// stacker's grid. What never moves (the cabinet, the sky, the other buildings, the tower's dark windows) is painted
// once per resize; each frame lights the windows, moves the row, drops what falls and blinks the beacon.
// Everything is in units of a 40th of a window; resize() works out how big that is on this screen.

import { COLS, FLOORS, MINOR, MINOR_BONUS, MAJOR_BONUS } from './tower.js';

const CELL = 40;
const TOWER = { x0: -34, x1: COLS * CELL + 52, y0: -26, y1: FLOORS * CELL + 14 }; // the tower's front, round the grid
const SKY = { x0: -78, x1: COLS * CELL + 96, y0: -110, y1: FLOORS * CELL + 46 };  // the window onto the city
const CAB = { x0: -98, x1: COLS * CELL + 116, y0: -228, y1: FLOORS * CELL + 70 };
const MARQ = { x0: -80, x1: COLS * CELL + 98, y0: -212, y1: -128 };
const C = {
  night: '#0a0f2c', indigo: '#1b2157', violet: '#2b2470', blue: '#5cc8ff', ink: '#060a1e',
  pane: '#131a40', frame: '#262f66', warm: '#ffc861', warmDeep: '#ff9a3c', glow: '#fff3c8', gold: '#f2c14e', cream: '#fbeed2',
};
const rowY = floor => (FLOORS - floor) * CELL;     // the top of a floor's windows
const colX = col => col * CELL;

export function createDraw(canvas) {
  const ctx = canvas.getContext('2d');
  const back = document.createElement('canvas');
  let k = 1, ox = 0, oy = 0, dpr = 1;

  const P = (x, y) => ({ x: ox + x * k, y: oy + y * k });
  const R = r => ({ x: ox + r.x0 * k, y: oy + r.y0 * k, w: (r.x1 - r.x0) * k, h: (r.y1 - r.y0) * k });
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

  // Fits the cabinet in the page, clear of the scoreboard (top) and the controls (bottom, or right on a wide screen).
  function resize(w, h, ratio, { top = 0, bottom = 0, right = 0 } = {}) {
    dpr = ratio;
    canvas.width = back.width = Math.round(w * dpr);
    canvas.height = back.height = Math.round(h * dpr);
    const cw = CAB.x1 - CAB.x0, ch = CAB.y1 - CAB.y0, room = h - top - bottom - 8;
    k = Math.min((w - right - 12) / cw, room / ch, 1.05);
    ox = (w - right - cw * k) / 2 - CAB.x0 * k;
    oy = top + 4 + Math.max(0, room - ch * k) * 0.35 - CAB.y0 * k;
    repaint();
  }
  const cabinet = () => { const r = R(CAB); return { left: r.x, width: r.w, top: r.y, bottom: r.y + r.h }; };

  function window_(c, col, floor, fill) {
    const p = P(colX(col) + 5, rowY(floor) + 5), s = (CELL - 10) * k;
    roundRect(c, p.x, p.y, s, s, 3 * k); c.fillStyle = fill; c.fill();
  }

  function repaint() {
    const c = back.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, back.width, back.height);
    const cab = R(CAB), sky = R(SKY), marq = R(MARQ), tower = R(TOWER);
    // the cabinet: indigo, with deco stripes down its sides
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .55)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
    roundRect(c, cab.x, cab.y, cab.w, cab.h, 20 * k); c.fillStyle = '#121845'; c.fill();
    c.restore();
    const g = c.createLinearGradient(cab.x, 0, cab.x + cab.w, 0);
    g.addColorStop(0, '#161c52'); g.addColorStop(0.5, '#262c78'); g.addColorStop(1, '#161c52');
    roundRect(c, cab.x + 5, cab.y + 5, cab.w - 10, cab.h - 10, 16 * k); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(92, 200, 255, .22)'; c.lineWidth = 2;
    for (const x of [cab.x + 12 * k, cab.x + 18 * k, cab.x + cab.w - 12 * k, cab.x + cab.w - 18 * k]) {
      c.beginPath(); c.moveTo(x, marq.y + marq.h + 10 * k); c.lineTo(x, cab.y + cab.h - 14 * k); c.stroke();
    }
    // the sign: deco, blue neon on the night
    roundRect(c, marq.x, marq.y, marq.w, marq.h, 12 * k); c.fillStyle = C.ink; c.fill();
    c.lineWidth = 3; c.strokeStyle = C.gold; c.stroke();
    c.save();
    c.font = `400 ${48 * k}px Bungee, Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (c.letterSpacing !== undefined) c.letterSpacing = `${3 * k}px`;
    c.shadowColor = C.blue; c.shadowBlur = 18 * k; c.fillStyle = '#dff4ff';
    const mid = P((MARQ.x0 + MARQ.x1) / 2, (MARQ.y0 + MARQ.y1) / 2 + 3);
    c.fillText('HIGHRISE', mid.x, mid.y);
    c.shadowBlur = 5 * k; c.fillText('HIGHRISE', mid.x, mid.y);
    c.restore();
    // the city at night: the sky, stars, and the buildings either side, a few windows lit
    c.save();
    roundRect(c, sky.x, sky.y, sky.w, sky.h, 10 * k); c.clip();
    const sg = c.createLinearGradient(0, sky.y, 0, sky.y + sky.h);
    sg.addColorStop(0, '#0b0f33'); sg.addColorStop(0.6, '#1c1d5a'); sg.addColorStop(1, '#3a2a6e');
    c.fillStyle = sg; c.fillRect(sky.x, sky.y, sky.w, sky.h);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    c.fillStyle = 'rgba(255, 255, 255, .7)';
    for (let i = 0; i < 40; i++) { const x = sky.x + rnd() * sky.w, y = sky.y + rnd() * sky.h * 0.5; c.fillRect(x, y, rnd() < 0.8 ? 1 : 2, rnd() < 0.8 ? 1 : 2); }
    const blocks = [[-78, 300, 40], [-50, 420, 38], [-20, 360, 30], [COLS * CELL + 10, 340, 34], [COLS * CELL + 40, 260, 40], [COLS * CELL + 70, 400, 30]];
    for (const [x, y, w] of blocks) {
      const p = P(x, y);
      c.fillStyle = '#10143a'; c.fillRect(p.x, p.y, w * k, sky.y + sky.h - p.y);
      for (let wy = y + 14; wy < SKY.y1 - 10; wy += 22) for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        const q = P(wx, wy);
        c.fillStyle = rnd() < 0.18 ? 'rgba(255, 200, 97, .55)' : 'rgba(40, 46, 100, .6)';
        c.fillRect(q.x, q.y, 5 * k, 8 * k);
      }
    }
    // the tower: its front, an antenna on top, and its windows dark
    const ant = P((COLS * CELL) / 2, TOWER.y0);
    c.fillStyle = '#3a4384'; c.fillRect(ant.x - 2 * k, ant.y - 64 * k, 4 * k, 64 * k);
    c.fillRect(ant.x - 14 * k, ant.y - 16 * k, 28 * k, 16 * k);
    roundRect(c, tower.x, tower.y, tower.w, tower.h + 40 * k, 6 * k);
    const tg = c.createLinearGradient(tower.x, 0, tower.x + tower.w, 0);
    tg.addColorStop(0, '#20275e'); tg.addColorStop(0.5, '#2c3478'); tg.addColorStop(1, '#1c2256');
    c.fillStyle = tg; c.fill();
    for (let f = 1; f <= FLOORS; f++) {
      for (let col = 0; col < COLS; col++) {
        const p = P(colX(col) + 3, rowY(f) + 3), s = (CELL - 6) * k;
        roundRect(c, p.x, p.y, s, s, 4 * k);
        c.fillStyle = f === MINOR || f === FLOORS ? '#4a3d74' : C.frame; c.fill();
        window_(c, col, f, f === MINOR || f === FLOORS ? '#1d1a44' : C.pane);
      }
      // the floor's number down the left
      const n = P(-17, rowY(f) + CELL / 2);
      c.font = `600 ${12 * k}px Figtree, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(251, 238, 210, .45)'; c.fillText(String(f), n.x, n.y);
    }
    // the prize floors, marked down the right: the minor's tickets, and the trophy at the top
    const m = P(COLS * CELL + 26, rowY(MINOR) + CELL / 2), t = P(COLS * CELL + 26, rowY(FLOORS) + CELL / 2);
    c.font = `400 ${13 * k}px Bungee, Impact, sans-serif`; c.fillStyle = C.gold;
    c.fillText(`+${MINOR_BONUS}`, m.x, m.y);
    c.font = `${22 * k}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    c.fillText('🏆', t.x, t.y - 2 * k);
    const t2 = P(COLS * CELL + 26, rowY(FLOORS) + CELL + 4);
    c.font = `400 ${10 * k}px Bungee, Impact, sans-serif`; c.fillText(`+${MAJOR_BONUS}`, t2.x, t2.y);
    // the street
    const st = P(0, FLOORS * CELL + 18);
    c.fillStyle = '#0a0d26'; c.fillRect(sky.x, st.y, sky.w, sky.y + sky.h - st.y);
    c.restore();
    // the frame round the window
    roundRect(c, sky.x - 3, sky.y - 3, sky.w + 6, sky.h + 6, 12 * k);
    c.lineWidth = 6; c.strokeStyle = '#c9d2e6'; c.stroke();
  }

  // A window lit: warm, with a glow round it; brighter for the moving row.
  function lit(col, floor, { bright = false, alpha = 1, dx = 0, dy = 0, spin = 0 } = {}) {
    const p = P(colX(col) + CELL / 2 + dx, rowY(floor) + CELL / 2 + dy), s = (CELL - 10) * k;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y); ctx.rotate(spin);
    ctx.fillStyle = bright ? 'rgba(255, 243, 200, .35)' : 'rgba(255, 190, 90, .22)';
    roundRect(ctx, -s * 0.75, -s * 0.75, s * 1.5, s * 1.5, 8 * k); ctx.fill();
    const g = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
    g.addColorStop(0, bright ? '#fffbe8' : '#ffe1a0'); g.addColorStop(1, bright ? C.warm : C.warmDeep);
    roundRect(ctx, -s / 2, -s / 2, s, s, 3 * k); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .35)'; ctx.fillRect(-s / 2 + 3 * k, -s / 2 + 3 * k, s * 0.35, s * 0.18);
    ctx.restore();
  }

  // s: what's on the tower now. rows (the floors built), mover ({ floor, start, width } or null), falling
  // ([{ col, floor, t }]), flash ({ floor, t }), pops ([{ floor, text, t }]), cheer (seconds since topping out, or -1),
  // dim (the tower going dark after a game, 0 to 1).
  function frame({ now = 0, rows = [], mover = null, falling = [], flash = null, pops = [], cheer = -1, dim = 0 } = {}) {
    const t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(back, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = R(SKY);
    ctx.save();
    roundRect(ctx, sky.x, sky.y, sky.w, sky.h, 10 * k); ctx.clip();
    // the beacon on the antenna
    const b = P((COLS * CELL) / 2, TOWER.y0 - 66);
    const on = Math.floor(t * 1.2) % 2 === 0;
    ctx.fillStyle = on ? 'rgba(255, 70, 70, .35)' : 'rgba(255, 70, 70, .06)'; ctx.beginPath(); ctx.arc(b.x, b.y, 9 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? '#ff5a5a' : '#6a2030'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5 * k, 0, Math.PI * 2); ctx.fill();
    // fireworks over the city when it's topped out
    if (cheer >= 0) fireworks(cheer);
    // the floors built, the newest flashing as it lands; the whole tower lighting up floor by floor when it's topped
    rows.forEach((cols, i) => {
      const floor = i + 1, flashing = flash && flash.floor === floor && flash.t < 0.35 && Math.floor(flash.t * 14) % 2 === 0;
      const alpha = dim ? Math.max(0.35, 1 - dim * 0.65) : 1;
      for (const col of cols) lit(col, floor, { bright: flashing, alpha });
      if (cheer >= 0) {
        const wave = cheer * 18 - floor;
        if (wave > 0) for (let col = 0; col < COLS; col++) if (!cols.includes(col)) lit(col, floor, { alpha: Math.min(0.85, wave / 4) * (0.6 + 0.4 * Math.sin(t * 6 + col + floor)) });
      }
    });
    if (mover) for (let i = 0; i < mover.width; i++) lit(mover.start + i, mover.floor, { bright: true });
    for (const f of falling) {
      const g = f.t * f.t * 900;
      lit(f.col, f.floor, { alpha: Math.max(0, 1 - f.t / 0.9), dy: g, dx: (f.col < 3 ? -1 : 1) * f.t * 20, spin: (f.col < 3 ? -1 : 1) * f.t * 3 });
    }
    // what the floor just built said: PERFECT, or a ticket
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of pops) {
      const q = P((COLS * CELL) / 2, rowY(p.floor) - 10 - p.t * 40);
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1);
      ctx.font = `400 ${18 * k}px Bungee, Impact, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(6, 10, 30, .85)'; ctx.strokeText(p.text, q.x, q.y);
      ctx.fillStyle = p.gold ? C.gold : C.glow; ctx.fillText(p.text, q.x, q.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // the floor being built, picked out down the left
    if (mover) {
      const n = P(-17, rowY(mover.floor) + CELL / 2);
      ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(n.x, n.y, 10 * k, 0, Math.PI * 2); ctx.fill();
      ctx.font = `700 ${12 * k}px Figtree, system-ui, sans-serif`; ctx.fillStyle = C.ink;
      ctx.fillText(String(mover.floor), n.x, n.y);
    }
  }

  function fireworks(s) {
    const bursts = [[40, -70, 0], [230, -40, 0.4], [130, -90, 0.8], [300, 60, 1.2], [-40, 80, 1.6], [160, -60, 2.0]];
    for (const [x, y, at] of bursts) {
      const u = (s - at) % 2.4;
      if (u < 0 || u > 1.1) continue;
      const c = P(x, y), r = u * 60 * k;
      ctx.globalAlpha = Math.max(0, 1 - u / 1.1);
      ctx.fillStyle = [C.gold, C.blue, '#ff6fae', C.glow][Math.round(at * 2.5) % 4];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r + u * u * 20 * k, 2.2 * k, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  // Where a window is on the page (for the screenshot tool).
  const at = (col, floor) => P(colX(col) + CELL / 2, rowY(floor) + CELL / 2);

  return { resize, repaint, frame, cabinet, at, get grid() { const a = P(-40, rowY(FLOORS) - 70), b = P(COLS * CELL + 56, FLOORS * CELL + 30); return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }; } };
}
