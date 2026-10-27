// Hoops' picture: the machine in perspective, from behind your shoulder. The ramp is painted like a little court and
// runs away from you up to the backboard, inside a net cage, with the scoreboard and the sign above. Everything that
// doesn't move (the room, the back panel, the cage, the ramp, the front of the machine) is painted once per resize;
// each frame adds the scoreboard's numbers, the sliding backboard, the rim and its net, and the balls.
// Everything is in js/court.js's centimetres.

import { R, CAGE, HOOP, BOARD, RAMP, LAUNCH, floorY } from './court.js';

const V = (x, y, z) => ({ x, y, z });
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return V(a.x / l, a.y / l, a.z / l); };

const EYE = V(0, 92, -232), LOOK = V(0, 124, 200);
const TOP = 284;                                       // the top of the sign
// Points the picture has to show: the front of the machine below the pocket, and the top of the sign.
const KEY = [V(-42, -8, CAGE.front), V(42, -8, CAGE.front), V(-CAGE.half - 4, TOP, CAGE.back), V(CAGE.half + 4, TOP, CAGE.back)];
const FRONT = { y0: -8, y1: CAGE.lip - 3 };            // the front panel, up to just under the pocket's lip, so the ball in it shows
const C = {
  room0: '#0b1030', room1: '#1a0f2e', blue: '#1d3fa8', blueDeep: '#0f2266', blueLight: '#3a6ae0', orange: '#ff8a1f', orangeDeep: '#c75a10',
  planks: ['#d9a066', '#d29a5f', '#deaa70', '#cf9358', '#d6a063', '#e0ad74'], rim: '#ff5a1f', led: '255, 59, 47', cream: '#fff6e6',
  chrome: '#c9d2de', net: 'rgba(244, 246, 251, .85)', ink: '#10142a',
};

export function createDraw(canvas) {
  const ctx = canvas.getContext('2d');
  const back = document.createElement('canvas'), front = document.createElement('canvas');
  let dpr = 1, F = 1, ox = 0, oy = 0, W = 0, H = 0;
  const fw = norm(sub(LOOK, EYE)), rt = norm(V(fw.z, 0, -fw.x));
  const up = V(fw.y * rt.z - fw.z * rt.y, fw.z * rt.x - fw.x * rt.z, fw.x * rt.y - fw.y * rt.x);

  function P(p, y, z) {
    if (y !== undefined) p = V(p, y, z);
    const d = sub(p, EYE), depth = dot(d, fw), k = F / depth;
    return { x: ox + k * dot(d, rt), y: oy - k * dot(d, up), k };
  }
  // A point on the screen, back on the upright plane at depth z.
  function onDepth(sx, sy, z) {
    const a = (sx - ox) / F, b = -(sy - oy) / F;
    const dir = V(fw.x + a * rt.x + b * up.x, fw.y + a * rt.y + b * up.y, fw.z + a * rt.z + b * up.z);
    const t = (z - EYE.z) / dir.z;
    return V(EYE.x + t * dir.x, EYE.y + t * dir.y, z);
  }

  function resize(w, h, ratio, { top = 0, bottom = 0, right = 0 } = {}) {
    dpr = ratio; W = w; H = h;
    canvas.width = back.width = front.width = Math.round(w * dpr);
    canvas.height = back.height = front.height = Math.round(h * dpr);
    F = 1; ox = 0; oy = 0;
    const pts = KEY.map(p => P(p));
    const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
    const y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
    const room = h - top - bottom - 8;
    F = Math.min((w - right - 16) / (x1 - x0), room / (y1 - y0));
    ox = (w - right) / 2 - F * (x0 + x1) / 2;
    oy = top + 4 + Math.max(0, room - F * (y1 - y0)) * 0.4 - F * y0;
    repaint();
  }
  function cabinet() {
    const pts = KEY.map(p => P(p));
    const left = Math.min(...pts.map(p => p.x)), right = Math.max(...pts.map(p => p.x));
    return { left, width: right - left, top: Math.min(...pts.map(p => p.y)), bottom: Math.max(...pts.map(p => p.y)) };
  }
  const css = c => c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Draw on an upright plane at depth z, in centimetres from (cx, cy) on it, with v running down.
  function plane(c, z, cx, cy, fn) {
    const o = P(cx, cy, z), a = P(cx + 10, cy, z), b = P(cx, cy - 10, z);
    c.save();
    c.setTransform(dpr * (a.x - o.x) / 10, dpr * (a.y - o.y) / 10, dpr * (b.x - o.x) / 10, dpr * (b.y - o.y) / 10, dpr * o.x, dpr * o.y);
    fn(c);
    c.restore();
  }
  function poly(c, pts, fill) {
    c.beginPath();
    pts.forEach((p, i) => { const s = P(p); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
  }
  function line(c, pts, stroke, width) {
    c.beginPath();
    pts.forEach((p, i) => { const s = P(p); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
    c.strokeStyle = stroke; c.lineWidth = width; c.stroke();
  }
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const onFloor = (x, z, lift = 0.3) => V(x, floorY(x, z) + lift, z);

  // ---------- painted once: the room, the back of the machine, the cage, the ramp ----------
  function repaint() {
    let c = back.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, back.width, back.height);
    css(c);
    // the arcade, dark, with the glow of other machines
    const room = c.createLinearGradient(0, 0, 0, H); room.addColorStop(0, C.room0); room.addColorStop(1, C.room1);
    c.fillStyle = room; c.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 18; i++) {
      const x = rnd() * W, y = rnd() * H * 0.8, r = 20 + rnd() * 60;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, ['rgba(255, 138, 31, .16)', 'rgba(58, 106, 224, .2)', 'rgba(255, 59, 47, .12)'][i % 3]); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }

    // the back panel and the head of the machine, with the sign
    const hw = CAGE.half + 4;
    plane(c, CAGE.back + 1, 0, 180, g => {
      g.save(); g.shadowColor = 'rgba(0, 0, 0, .55)'; g.shadowBlur = 24;
      rr(g, -hw, 180 - TOP, 2 * hw, TOP - 30, 10); g.fillStyle = C.blueDeep; g.fill();
      g.restore();
      const pg = g.createLinearGradient(0, 180 - 228, 0, 180 - 40);
      pg.addColorStop(0, C.blue); pg.addColorStop(1, C.blueDeep);
      g.fillStyle = pg; g.fillRect(-CAGE.half, 180 - 228, 2 * CAGE.half, 188);
      // a big faint ball painted behind the board, and stripes
      g.strokeStyle = 'rgba(255, 138, 31, .22)'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 180 - 138, 70, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-70, 180 - 138); g.lineTo(70, 180 - 138); g.moveTo(0, 180 - 208); g.lineTo(0, 180 - 68); g.stroke();
      g.beginPath(); g.ellipse(-62, 180 - 138, 30, 64, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.beginPath(); g.ellipse(62, 180 - 138, 30, 64, 0, Math.PI / 2, Math.PI * 1.5); g.stroke();
      for (const [y, col] of [[180 - 172, C.orange], [180 - 176, C.cream]]) { g.fillStyle = col; g.fillRect(-CAGE.half, y, 2 * CAGE.half, 2.4); }
      // the slot the board runs along
      rr(g, -CAGE.half + 6, 180 - 152, 2 * CAGE.half - 12, 8, 4); g.fillStyle = 'rgba(0, 0, 0, .45)'; g.fill();
      g.fillStyle = 'rgba(201, 210, 222, .7)'; g.fillRect(-CAGE.half + 8, 180 - 149, 2 * CAGE.half - 16, 2);
      // the scoreboard's housing (its numbers are lit each frame)
      rr(g, -74, 180 - 226, 148, 48, 6); g.fillStyle = '#05060c'; g.fill();
      g.lineWidth = 2; g.strokeStyle = C.orange; g.stroke();
      // the sign
      const sy = 180 - TOP;
      rr(g, -hw + 10, sy + 3, 2 * hw - 20, 48, 9); g.fillStyle = C.orangeDeep; g.fill();
      rr(g, -hw + 13, sy + 6, 2 * hw - 26, 42, 7);
      const sg = g.createLinearGradient(0, sy + 6, 0, sy + 48); sg.addColorStop(0, '#ff9c3a'); sg.addColorStop(1, C.orange);
      g.fillStyle = sg; g.fill();
      g.font = '400 30px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.blueDeep; g.fillText('HOOPS', 2, sy + 30);
      g.fillStyle = C.cream; g.fillText('HOOPS', 0, sy + 28);
    });

    // the cage: nets down the sides and over the top, between chrome rails
    const zs = [], ys = [];
    for (let z = CAGE.front; z <= CAGE.back; z += 18) zs.push(z);
    for (let y = -10; y <= CAGE.roof; y += 18) ys.push(y);
    for (const s of [-1, 1]) {
      const x = s * CAGE.half;
      poly(c, [V(x, floorY(x, CAGE.front), CAGE.front), V(x, floorY(x, CAGE.back), CAGE.back), V(x, CAGE.roof, CAGE.back), V(x, CAGE.roof, CAGE.front)], 'rgba(10, 16, 48, .55)');
      c.lineWidth = 0.8;
      for (const z of zs) line(c, [V(x, floorY(x, z), z), V(x, CAGE.roof, z)], 'rgba(244, 246, 251, .12)', 0.8);
      for (const y of ys) {
        const pts = [];
        for (const z of [CAGE.front, RAMP.z0, CAGE.back]) if (y > floorY(x, z)) pts.push(V(x, y, z));
        if (pts.length > 1) line(c, pts, 'rgba(244, 246, 251, .12)', 0.8);
      }
    }
    for (let x = -CAGE.half; x <= CAGE.half; x += 20) line(c, [V(x, CAGE.roof, CAGE.front), V(x, CAGE.roof, CAGE.back)], 'rgba(244, 246, 251, .07)', 0.8);
    for (const z of zs) line(c, [V(-CAGE.half, CAGE.roof, z), V(CAGE.half, CAGE.roof, z)], 'rgba(244, 246, 251, .07)', 0.8);

    // the ramp: hardwood planks, painted like a court
    for (const s of [-1, 1]) {
      const x = s * CAGE.half;
      poly(c, [onFloor(0, RAMP.z0, 0), onFloor(x, RAMP.z0, 0), onFloor(x, CAGE.back, 0), onFloor(0, CAGE.back, 0)], C.planks[0]);
    }
    const plank = 10;
    for (let x = -CAGE.half, i = 0; x < CAGE.half; x += plank, i++) {
      const x1 = x + plank, mid = x < 0 && x1 > 0;
      const pts = mid ? [onFloor(x, RAMP.z0, 0), onFloor(0, RAMP.z0, 0), onFloor(x1, RAMP.z0, 0), onFloor(x1, CAGE.back, 0), onFloor(0, CAGE.back, 0), onFloor(x, CAGE.back, 0)]
        : [onFloor(x, RAMP.z0, 0), onFloor(x1, RAMP.z0, 0), onFloor(x1, CAGE.back, 0), onFloor(x, CAGE.back, 0)];
      poly(c, pts, C.planks[(i * 7) % C.planks.length]);
      line(c, [onFloor(x, RAMP.z0, 0.05), onFloor(x, CAGE.back, 0.05)], 'rgba(110, 62, 24, .35)', 0.8);
    }
    // the key under the hoop, the free-throw circle, and an arc for the three-point line
    const key = [];
    for (const [x, z] of [[-26, 150], [26, 150], [26, CAGE.back], [-26, CAGE.back]]) key.push(onFloor(x, z, 0.1));
    poly(c, key, 'rgba(29, 63, 168, .88)');
    line(c, [...key, key[0]], C.cream, Math.max(1, F * 1.6 / 400));
    const circle = [];
    for (let i = 0; i <= 24; i++) { const a = Math.PI + (i / 24) * Math.PI; circle.push(onFloor(Math.cos(a) * 26, 150 + Math.sin(a) * 26, 0.1)); }
    line(c, circle, C.cream, Math.max(1, F * 1.6 / 330));
    const arc = [];
    for (let x = -CAGE.half + 6; x <= CAGE.half - 6; x += 4) arc.push(onFloor(x, HOOP.z - Math.sqrt(170 * 170 - x * x), 0.1));
    line(c, arc, C.cream, Math.max(1, F * 1.6 / 300));
    // the groove down the middle that lines the balls up for the pocket
    const gw = R + 3, groove = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; groove.push(onFloor(Math.cos(a) * gw, RAMP.chute + Math.sin(a) * gw, 0.15)); }
    poly(c, [onFloor(gw, RAMP.z0, 0.15), ...groove, onFloor(-gw, RAMP.z0, 0.15)], 'rgba(70, 34, 10, .3)');
    line(c, [onFloor(-gw, RAMP.z0, 0.2), ...groove.slice().reverse(), onFloor(gw, RAMP.z0, 0.2)], 'rgba(90, 44, 14, .55)', Math.max(1, F * 1.2 / 260));
    // the pocket at your end, where the balls come back to
    for (const s of [-1, 1]) poly(c, [onFloor(0, CAGE.front, 0), onFloor(s * CAGE.half, CAGE.front, 0), onFloor(s * CAGE.half, RAMP.z0, 0), onFloor(0, RAMP.z0, 0)], '#2a1c14');
    line(c, [onFloor(-CAGE.half, RAMP.z0, 0.1), onFloor(0, RAMP.z0, 0.1), onFloor(CAGE.half, RAMP.z0, 0.1)], 'rgba(0, 0, 0, .5)', 2);
    // chrome rails along the cage's edges
    for (const s of [-1, 1]) {
      const x = s * CAGE.half;
      line(c, [V(x, CAGE.roof, CAGE.front), V(x, CAGE.roof, CAGE.back)], C.chrome, Math.max(1.5, F * 3 / 350));
      line(c, [V(x, floorY(x, CAGE.front) + 2, CAGE.front), V(x, floorY(x, RAMP.z0) + 2, RAMP.z0), V(x, floorY(x, CAGE.back) + 2, CAGE.back)], C.chrome, Math.max(1.5, F * 4 / 350));
      line(c, [V(x, floorY(x, CAGE.back), CAGE.back), V(x, CAGE.roof, CAGE.back)], C.chrome, Math.max(1.5, F * 3 / 480));
    }

    // ---------- in front: the front of the machine, below the pocket ----------
    c = front.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, front.width, front.height);
    css(c);
    plane(c, CAGE.front, 0, 0, g => {
      const fwid = CAGE.half + 6;
      g.save(); g.shadowColor = 'rgba(0, 0, 0, .5)'; g.shadowBlur = 20; g.shadowOffsetY = 6;
      rr(g, -fwid, -FRONT.y1, 2 * fwid, FRONT.y1 - FRONT.y0 + 30, 6); g.fillStyle = C.blueDeep; g.fill();
      g.restore();
      const fg = g.createLinearGradient(0, -FRONT.y1, 0, -FRONT.y0);
      fg.addColorStop(0, C.blueLight); fg.addColorStop(0.2, C.blue); fg.addColorStop(1, C.blueDeep);
      rr(g, -fwid + 1.5, -FRONT.y1, 2 * fwid - 3, FRONT.y1 - FRONT.y0 + 26, 5); g.fillStyle = fg; g.fill();
      g.fillStyle = C.orange; g.fillRect(-fwid + 1.5, -FRONT.y1, 2 * fwid - 3, 2);
      g.fillStyle = C.cream; g.fillRect(-fwid + 1.5, -FRONT.y1 + 2, 2 * fwid - 3, 0.8);
      // the ticket mouth, and a row of little lights
      rr(g, -9, -FRONT.y1 + 6, 18, 3, 1.5); g.fillStyle = '#05060c'; g.fill();
      for (let x = -fwid + 10; x <= fwid - 10; x += 8) {
        if (Math.abs(x) < 16) continue;
        g.beginPath(); g.arc(x, -FRONT.y1 + 7.5, 1.2, 0, Math.PI * 2); g.fillStyle = 'rgba(255, 214, 132, .85)'; g.fill();
      }
    });
  }

  // ---------- the scoreboard ----------
  // Seven-segment numbers in red, the unlit segments faintly there.
  const SEG = { a: [0, 0, 1, 0], b: [1, 0, 1, 1], c: [1, 1, 1, 2], d: [0, 2, 1, 2], e: [0, 1, 0, 2], f: [0, 0, 0, 1], g: [0, 1, 1, 1] };
  const DIGIT = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  function led(g, text, x, y, w, h, lit) {
    const dw = w / text.length;
    [...text].forEach((ch, i) => {
      const on = ch === ' ' ? '' : DIGIT[+ch];
      for (const [s, [x0, y0, x1, y1]] of Object.entries(SEG)) {
        const bx = x + i * dw + dw * 0.18, by = y + h * 0.06, sw = dw * 0.56, sh = h * 0.44;
        g.beginPath(); g.moveTo(bx + x0 * sw, by + y0 * sh); g.lineTo(bx + x1 * sw, by + y1 * sh);
        const yes = on.includes(s);
        g.strokeStyle = yes ? `rgba(${lit}, 1)` : `rgba(${lit}, .1)`;
        g.shadowBlur = yes ? 6 : 0;
        g.stroke();
      }
    });
  }
  const lamps = { bonus: false, hot: false };
  function scoreboard(court, t) {
    plane(ctx, CAGE.back, 0, 202, g => {
      g.lineCap = 'round'; g.lineWidth = 3.4; g.shadowColor = `rgba(${C.led}, .9)`;
      const score = String(Math.min(999, court.score)).padStart(3, ' ');
      const left = String(Math.ceil(court.left)).padStart(2, ' ');
      const hurry = court.left <= 10 && court.left > 0 && !court.over;
      led(g, score, -68, -17, 48, 30, C.led);
      led(g, left, 30, -17, 36, 30, hurry && Math.sin(t * 12) < 0 ? '255, 160, 80' : C.led);
      g.shadowBlur = 0;
      g.font = '600 5.5px Figtree, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255, 246, 230, .75)';
      g.fillText('SCORE', -44, 19); g.fillText('TIME', 48, 19);
      // two lamps between them: 3 points, and the rim alight
      const lamp = (x, on, col, label) => {
        g.beginPath(); g.arc(x, -6, 3.2, 0, Math.PI * 2);
        g.fillStyle = on ? col : 'rgba(255, 255, 255, .08)'; g.shadowColor = col; g.shadowBlur = on ? 8 : 0; g.fill(); g.shadowBlur = 0;
        g.fillStyle = on ? C.cream : 'rgba(255, 246, 230, .35)'; g.fillText(label, x, 6);
      };
      // (lit while the round runs: after the buzzer a basket is worth what the deck says again)
      const running = !court.buzzer && !court.over;
      lamps.bonus = court.bonus && running; lamps.hot = court.fire && running;
      lamp(16, lamps.bonus, '#ffd23f', '3 PTS');
      lamp(-6, lamps.hot, '#ff7a1f', 'HOT');
    });
  }

  // ---------- the backboard, the rim and the net ----------
  function board(hx) {
    plane(ctx, BOARD.z, hx, (BOARD.y0 + BOARD.y1) / 2, g => {
      const w = BOARD.half, h = (BOARD.y1 - BOARD.y0) / 2;
      g.save(); g.shadowColor = 'rgba(0, 0, 0, .45)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
      rr(g, -w, -h, 2 * w, 2 * h, 3); g.fillStyle = 'rgba(232, 240, 252, .94)'; g.fill();
      g.restore();
      g.lineWidth = 3; g.strokeStyle = C.orange; rr(g, -w + 1.5, -h + 1.5, 2 * w - 3, 2 * h - 3, 2); g.stroke();
      const ty = (BOARD.y0 + BOARD.y1) / 2 - HOOP.y;   // the target square, just above the rim
      g.lineWidth = 2; g.strokeStyle = C.orange; g.strokeRect(-14, ty - 24, 28, 21);
      g.fillStyle = 'rgba(255, 255, 255, .5)'; g.beginPath(); g.moveTo(-w + 6, -h + 3); g.lineTo(-w + 22, -h + 3); g.lineTo(-w + 8, h - 3); g.lineTo(-w + 3, h - 3); g.fill();
      // the bracket that holds the rim
      g.fillStyle = '#5a6272'; g.fillRect(-6, ty - 2, 12, 7);
    });
  }
  // The rim's ring, the net's rings below it, and which bits of them are behind the middle of the hoop.
  function hoopParts(hoop, t) {
    const n = 14, kick = hoop.kick, wob = Math.sin(kick * 12) * kick;
    const rings = [
      { r: HOOP.r, y: HOOP.y, sx: 0 },
      { r: (HOOP.r + HOOP.low) / 2 + 1.5 * wob, y: HOOP.y - HOOP.net * 0.5 - 4 * kick, sx: hoop.sway * 5 },
      { r: HOOP.low + 3 * wob, y: HOOP.y - HOOP.net - 8 * kick, sx: hoop.sway * 11 },
    ];
    const pt = (ring, a) => V(hoop.x + ring.sx + Math.cos(a) * ring.r, ring.y, HOOP.z + Math.sin(a) * ring.r);
    const strands = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
      strands.push([pt(rings[0], a0), pt(rings[1], a1)], [pt(rings[0], a2), pt(rings[1], a1)]);
      strands.push([pt(rings[1], a1), pt(rings[2], a0)], [pt(rings[1], a1), pt(rings[2], a2)]);
    }
    const rim = [];
    for (let i = 0; i <= 40; i++) rim.push(pt(rings[0], (i / 40) * Math.PI * 2));
    return { strands, rim };
  }
  function drawNet(parts, behind) {
    ctx.lineCap = 'round';
    for (const [a, b] of parts.strands) {
      if ((a.z + b.z) / 2 > HOOP.z !== behind) continue;
      const pa = P(a), pb = P(b);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = behind ? 'rgba(200, 206, 220, .7)' : C.net; ctx.lineWidth = Math.max(0.8, pa.k * 0.9); ctx.stroke();
    }
  }
  function drawRim(parts, behind, hot, t, hx) {
    const seg = [];
    for (let i = 0; i < parts.rim.length - 1; i++) {
      const a = parts.rim[i], b = parts.rim[i + 1];
      if (((a.z + b.z) / 2 > HOOP.z) === behind) seg.push([a, b]);
    }
    const k = P(V(hx, HOOP.y, HOOP.z)).k;
    for (const [w, col] of [[3.2, hot ? '#ffcf3a' : '#a8320e'], [2.2, hot ? '#ff9a2a' : C.rim]]) {
      ctx.beginPath();
      for (const [a, b] of seg) { const pa = P(a), pb = P(b); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); }
      ctx.strokeStyle = col; ctx.lineWidth = w * k; ctx.lineCap = 'round';
      if (hot) { ctx.shadowColor = '#ff7a1f'; ctx.shadowBlur = 14; }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    if (hot && !behind) {
      // flames licking up off the front of the rim
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.08 + 0.84 * i / 8), p = P(V(hx + Math.cos(a) * HOOP.r, HOOP.y, HOOP.z + Math.sin(a) * HOOP.r));
        const tall = (9 + 6 * Math.sin(t * 13 + i * 2.1)) * k, wide = 3.2 * k;
        const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y - tall);
        g.addColorStop(0, 'rgba(255, 210, 63, .95)'); g.addColorStop(0.6, 'rgba(255, 106, 31, .7)'); g.addColorStop(1, 'rgba(255, 59, 47, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(p.x - wide, p.y); ctx.quadraticCurveTo(p.x - wide * 0.4, p.y - tall * 0.6, p.x + Math.sin(t * 9 + i) * wide * 0.6, p.y - tall);
        ctx.quadraticCurveTo(p.x + wide * 0.4, p.y - tall * 0.6, p.x + wide, p.y); ctx.fill();
      }
    }
  }

  // ---------- the balls ----------
  function shadow(b) {
    const fy = floorY(b.x, b.z), lift = b.y - R - fy;
    if (lift > 160) return;
    const c = P(V(b.x, fy + 0.2, b.z)), far = P(V(b.x, fy + 0.2, b.z + R)), side = P(V(b.x + R, fy + 0.2, b.z));
    const a = Math.max(0, 0.42 - lift / 400), s = 1 + lift / 160;
    ctx.fillStyle = `rgba(40, 18, 6, ${a})`;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.abs(side.x - c.x) * 0.9 * s, Math.max(0.5, Math.abs(c.y - far.y)) * 0.9 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  function ball(b, pos) {
    const c = P(pos), r = R * c.k;
    if (r < 0.5) return;
    const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.1, c.x, c.y, r);
    if (b.gold) { g.addColorStop(0, '#fff6c8'); g.addColorStop(0.45, '#f2c14e'); g.addColorStop(1, '#8a5a0c'); }
    else { g.addColorStop(0, '#ffb070'); g.addColorStop(0.45, '#ee7a26'); g.addColorStop(1, '#7a3008'); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    // its seams, turning as it rolls
    ctx.save();
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = b.gold ? 'rgba(90, 50, 6, .75)' : 'rgba(30, 12, 4, .8)'; ctx.lineWidth = Math.max(0.7, r * 0.09);
    const turn = b.roll;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, r, Math.abs(Math.cos(turn)) * r, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x - r, c.y + Math.sin(turn) * r * 0.1); ctx.lineTo(c.x + r, c.y - Math.sin(turn) * r * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c.x - r * 0.95, c.y, r * 0.55, r * 1.1, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c.x + r * 0.95, c.y, r * 0.55, r * 1.1, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.restore();
    if (b.gold) {
      ctx.fillStyle = 'rgba(255, 255, 255, .85)';
      const s = r * 0.32, x = c.x + r * 0.55, y = c.y - r * 0.65;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.25, y + s * 0.25);
      ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25); ctx.fill();
    }
  }

  // court: the machine. hold: how far the ball in the pocket is lifted to throw (0 to 1). pops: { text, t, gold, big }
  // rising off the hoop. aim: the keyboard's aim (radians), and meter: its throw meter (0 to 1), or null.
  function frame(court, { now = 0, hold = 0, pops = [], aim = null, meter = null } = {}) {
    const t = now / 1000, hoop = court.hoop;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(back, 0, 0);
    css(ctx);
    scoreboard(court, t);
    board(hoop.x);
    const parts = hoopParts(hoop, t);
    const held = hold > 0 ? court.pocket() : null;
    const where = b => b === held ? V(b.x + (LAUNCH.x - b.x) * hold, b.y + (LAUNCH.y - b.y) * hold, b.z + (LAUNCH.z - b.z) * hold) : V(b.x, b.y, b.z);
    const depth = b => -dot(sub(V(b.x, b.y, b.z), EYE), fw);
    const sorted = [...court.balls].sort((a, b) => depth(a) - depth(b));
    for (const b of sorted) shadow(b);
    const inside = b => b.z > HOOP.z || (Math.hypot(b.x - hoop.x, b.z - HOOP.z) < HOOP.r + R * 0.5 && b.y < HOOP.y + R * 1.5 && b.y > HOOP.y - HOOP.net - R);
    drawRim(parts, true, court.fire, t, hoop.x);
    drawNet(parts, true);
    for (const b of sorted) if (inside(b)) ball(b, where(b));
    drawNet(parts, false);
    drawRim(parts, false, court.fire, t, hoop.x);
    // the ball being lifted out of the pocket comes up over the front of the machine once it's clear of the lip
    const lifted = held && hold >= 0.5 ? held : null;
    for (const b of sorted) if (!inside(b) && b !== lifted) ball(b, where(b));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(front, 0, 0);
    css(ctx);
    if (lifted) ball(lifted, where(lifted));
    // the keyboard's aim, and how hard it'll throw
    if (aim !== null) {
      const a = P(V(LAUNCH.x, LAUNCH.y, LAUNCH.z)), b = P(V(LAUNCH.x + Math.tan(aim) * (HOOP.z - LAUNCH.z), HOOP.y, HOOP.z));
      ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 246, 230, .5)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 246, 230, .8)'; ctx.fill();
    }
    if (meter !== null) {
      const a = P(V(LAUNCH.x + 30, LAUNCH.y, LAUNCH.z)), h = 110, w = 14;
      rr(ctx, a.x, a.y - h, w, h, 5); ctx.fillStyle = 'rgba(5, 6, 12, .75)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255, 246, 230, .3)'; ctx.stroke();
      ctx.fillStyle = C.orange; ctx.fillRect(a.x + 3, a.y - h * meter, w - 6, h * meter);
      // the light, where to let go: drawn over the fill, so it shows wherever the fill has got to
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffe27a'; ctx.shadowColor = 'rgba(255, 210, 63, .9)'; ctx.shadowBlur = 6;
      ctx.strokeRect(a.x - 1.5, a.y - h * 0.565, w + 3, h * 0.13);
      ctx.restore();
    }
    // what a basket was worth, rising off the hoop
    words(pops, hoop, now);
  }

  // The words rising off the hoop: the newest lowest, just over the rim, and an older one nudged up over it as a new
  // one comes. They rise as they fade, but stop at the foot of the scoreboard, so they never land on its numbers.
  let lastNow = 0;
  const laid = [];
  function words(pops, hoop, now) {
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    laid.length = 0;
    const shown = pops.filter(p => p.t >= 0);
    if (!shown.length) return;
    const at = P(V(hoop.x, HOOP.y + 8, HOOP.z)), k = Math.min(1.3, Math.max(0.8, at.k / 1.2));
    const ceil = P(V(0, 178, CAGE.back)).y + 3, gap = 2 * k;   // the scoreboard's lower edge, and a little room
    const h = p => (p.big ? 22 : p.word ? 15 : 18) * k;
    // where each goes: rising from the rim, the older over the newer, and none above the scoreboard's foot
    const y = shown.map(p => at.y - h(p) / 2 - Math.min(1, p.t) * 36);
    for (let i = shown.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] - (h(shown[i]) + h(shown[i + 1])) / 2 - gap);
    for (let i = 0; i < shown.length; i++) {
      y[i] = Math.max(y[i], ceil + h(shown[i]) / 2);
      if (i) y[i] = Math.max(y[i], y[i - 1] + (h(shown[i - 1]) + h(shown[i])) / 2 + gap);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, ceil - 3, W, H); ctx.clip();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    shown.forEach((p, i) => {
      // eased toward its place, so one nudged up by a newer one moves up rather than jumping
      p.at = p.at == null ? y[i] : p.at + (y[i] - p.at) * Math.min(1, dt * 16);
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - p.t));
      ctx.font = `400 ${h(p)}px Bungee, Impact, sans-serif`;
      ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(16, 20, 42, .85)'; ctx.strokeText(p.text, at.x, p.at);
      ctx.fillStyle = p.gold ? '#ffd23f' : C.cream; ctx.fillText(p.text, at.x, p.at);
      laid.push({ text: p.text, top: p.at - h(p) / 2, bottom: p.at + h(p) / 2 });
    });
    ctx.restore();
  }

  // Where a flick on the screen is pointing at the hoop: from the ball in the pocket along (dx, dy), as far up the
  // screen as the rim, and back across to the hoop's depth. Returns how far across the hoop's plane it points.
  function aimAt(dx, dy) {
    const a = P(V(LAUNCH.x, LAUNCH.y, LAUNCH.z)), rim = P(V(0, HOOP.y, HOOP.z));
    if (dy >= -0.001) return null;
    const s = (rim.y - a.y) / dy;
    return onDepth(a.x + dx * s, rim.y, HOOP.z).x;
  }

  // (for the tests: the lamps as last lit, and where the words were last drawn under the scoreboard's foot)
  return { resize, repaint, frame, cabinet, aimAt, at: P, lamps, get words() { return { laid: [...laid], foot: P(V(0, 178, CAGE.back)).y }; } };
}
