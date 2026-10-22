// Bonkers' pictures: a sunny yellow cabinet, the lawn with its five holes, and the ground under it in cross-section,
// as if the side of the cabinet were glass: the tunnels, the two burrows, and the moles running about in them.
// The sky, the soil, the tunnels and the burrows are painted once per resize, and the front lip of the lawn and the
// cabinet's frame once in front, so a mole comes up out of its hole between the two. Everything is in
// js/burrow.js's units; resize() works out their size here.

import { W, HOLES, NODES, EDGES } from './burrow.js';

const CAB = { x0: -34, x1: W + 34, y0: -258, y1: 342 };
const SIGN = { x0: 20, x1: W - 20, y0: -248, y1: -182 };
const VIEW = { x0: 0, x1: W, y0: -172, y1: 320 };   // the glass: sky above the lawn, the ground below
const C = {
  yellow: '#ffc93c', amber: '#f29e1f', red: '#e2412f', redDeep: '#9a2216', sky: '#8fd3ff', grass: '#4fbf4a', grassDeep: '#2f8a36',
  soil: '#8a5a33', soilDeep: '#5b3a20', tunnel: '#3b2412', fur: '#6b4f3a', furDark: '#4a3526', nose: '#ff8fa3', ink: '#24170c', cream: '#fff6e0',
};

export function createDraw(canvas) {
  const ctx = canvas.getContext('2d');
  const back = document.createElement('canvas'), front = document.createElement('canvas');
  let k = 1, ox = 0, oy = 0, dpr = 1;
  const P = (x, y) => ({ x: ox + x * k, y: oy + y * k });

  function resize(w, h, ratio, { top = 0, bottom = 0, right = 0 } = {}) {
    dpr = ratio;
    canvas.width = back.width = front.width = Math.round(w * dpr);
    canvas.height = back.height = front.height = Math.round(h * dpr);
    const cw = CAB.x1 - CAB.x0, ch = CAB.y1 - CAB.y0, room = h - top - bottom - 8;
    k = Math.min((w - right - 12) / cw, room / ch, 1.15);
    ox = (w - right - cw * k) / 2 - CAB.x0 * k;
    oy = top + 4 + Math.max(0, room - ch * k) * 0.35 - CAB.y0 * k;
    repaint();
  }
  const toBurrow = (px, py) => ({ x: (px - ox) / k, y: (py - oy) / k });
  const cabinet = () => { const a = P(CAB.x0, CAB.y0), b = P(CAB.x1, CAB.y1); return { left: a.x, width: b.x - a.x, top: a.y, bottom: b.y }; };
  const world = c => c.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

  function repaint() {
    // ---------- behind: the cabinet, the sky, the ground and its tunnels ----------
    let c = back.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, back.width, back.height);
    world(c);
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .5)'; c.shadowBlur = 30 * k; c.shadowOffsetY = 10 * k;
    rr(c, CAB.x0, CAB.y0, CAB.x1 - CAB.x0, CAB.y1 - CAB.y0, 26); c.fillStyle = C.amber; c.fill();
    c.restore();
    const cg = c.createLinearGradient(CAB.x0, 0, CAB.x1, 0);
    cg.addColorStop(0, '#f2a51f'); cg.addColorStop(0.5, C.yellow); cg.addColorStop(1, '#f2a51f');
    rr(c, CAB.x0 + 5, CAB.y0 + 5, CAB.x1 - CAB.x0 - 10, CAB.y1 - CAB.y0 - 10, 22); c.fillStyle = cg; c.fill();
    // the sign
    rr(c, SIGN.x0, SIGN.y0, SIGN.x1 - SIGN.x0, SIGN.y1 - SIGN.y0, 14); c.fillStyle = C.redDeep; c.fill();
    rr(c, SIGN.x0 + 4, SIGN.y0 + 4, SIGN.x1 - SIGN.x0 - 8, SIGN.y1 - SIGN.y0 - 8, 11); c.fillStyle = C.red; c.fill();
    c.font = '400 46px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const word = 'BONKERS', mid = (SIGN.y0 + SIGN.y1) / 2 + 3;
    const wide = [...word].map(l => c.measureText(l).width), total = wide.reduce((a, b) => a + b, 0);
    let x = W / 2 - total / 2;
    [...word].forEach((l, i) => {
      const bob = i % 2 ? -3 : 3;
      c.fillStyle = C.redDeep; c.fillText(l, x + wide[i] / 2 + 3, mid + bob + 3);
      c.fillStyle = C.yellow; c.fillText(l, x + wide[i] / 2, mid + bob);
      x += wide[i];
    });
    // the glass: sky above the lawn
    c.save();
    rr(c, VIEW.x0, VIEW.y0, VIEW.x1 - VIEW.x0, VIEW.y1 - VIEW.y0, 12); c.clip();
    const sky = c.createLinearGradient(0, VIEW.y0, 0, 0); sky.addColorStop(0, '#5fb8f5'); sky.addColorStop(1, '#bfe7ff');
    c.fillStyle = sky; c.fillRect(VIEW.x0, VIEW.y0, W, -VIEW.y0);
    c.fillStyle = 'rgba(255, 255, 255, .9)';
    for (const [cx, cy, s] of [[90, -128, 1], [330, -146, 0.8], [440, -110, 0.6]]) {
      for (const [dx, dy, r] of [[-22, 4, 16], [0, -6, 22], [24, 2, 17], [8, 8, 15]]) { c.beginPath(); c.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2); c.fill(); }
    }
    c.fillStyle = '#ffe066'; c.beginPath(); c.arc(40, -140, 18, 0, Math.PI * 2); c.fill();
    // the ground in cross-section: layers of soil, a few stones and roots
    const soil = c.createLinearGradient(0, 0, 0, VIEW.y1); soil.addColorStop(0, '#9b6a3e'); soil.addColorStop(0.5, C.soil); soil.addColorStop(1, C.soilDeep);
    c.fillStyle = soil; c.fillRect(VIEW.x0, 0, W, VIEW.y1);
    c.fillStyle = 'rgba(0, 0, 0, .08)';
    for (const y of [60, 130, 210, 290]) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 50) c.quadraticCurveTo(x + 25, y + (x % 100 ? 8 : -8), x + 50, y); c.lineTo(W, y + 14); c.lineTo(0, y + 14); c.fill(); }
    let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 26; i++) { c.fillStyle = rnd() < 0.5 ? '#a0896f' : '#7d6b58'; c.beginPath(); c.ellipse(rnd() * W, 20 + rnd() * 290, 4 + rnd() * 6, 3 + rnd() * 4, rnd() * 3, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(214, 180, 130, .55)'; c.lineWidth = 2.5; c.lineCap = 'round';
    for (const x0 of [20, 205, 300, 480]) { c.beginPath(); c.moveTo(x0, 6); c.quadraticCurveTo(x0 + 10, 30, x0 - 4, 52); c.stroke(); }
    // the tunnels: dug out darker, with rounded ends
    c.strokeStyle = C.tunnel; c.lineWidth = 34; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [a, b] of EDGES) { if (a.startsWith('h')) continue; c.beginPath(); c.moveTo(...NODES[a]); c.lineTo(...NODES[b]); c.stroke(); }
    c.lineWidth = 30; for (const [a, b] of EDGES) if (a.startsWith('h')) { c.beginPath(); c.moveTo(NODES[a][0], 6); c.lineTo(...NODES[b]); c.stroke(); }
    c.strokeStyle = 'rgba(255, 220, 170, .08)'; c.lineWidth = 26;
    for (const [a, b] of EDGES) { c.beginPath(); c.moveTo(...NODES[a]); c.lineTo(...NODES[b]); c.stroke(); }
    // the burrows, snug: a bed of leaves and a lantern each
    for (const b of ['b1', 'b2']) {
      const [bx, by] = NODES[b];
      c.fillStyle = C.tunnel; c.beginPath(); c.ellipse(bx, by, 52, 34, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 200, 90, .18)'; c.beginPath(); c.ellipse(bx + 26, by - 10, 30, 22, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#8a6a2a'; c.beginPath(); c.ellipse(bx - 6, by + 22, 42, 9, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#b5862f'; for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(bx - 36 + i * 12, by + 20, 7, 3.5, i * 0.7, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#ffcf5a'; c.beginPath(); c.arc(bx + 34, by - 12, 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3a2a14'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx + 34, by - 17); c.lineTo(bx + 34, by - 30); c.stroke();
    }
    // the lawn, and the dark mouths of the holes in it
    const lawn = c.createLinearGradient(0, -10, 0, 12); lawn.addColorStop(0, '#6fd65f'); lawn.addColorStop(1, C.grassDeep);
    c.fillStyle = lawn; c.fillRect(VIEW.x0, -8, W, 20);
    for (const h of HOLES) { c.fillStyle = '#1e1208'; c.beginPath(); c.ellipse(h, -1, 34, 8, 0, 0, Math.PI * 2); c.fill(); }
    c.restore();

    // ---------- in front: the lawn's front edge, the glass and the frame ----------
    c = front.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, front.width, front.height);
    world(c);
    c.save();
    rr(c, VIEW.x0, VIEW.y0, VIEW.x1 - VIEW.x0, VIEW.y1 - VIEW.y0, 12); c.clip();
    // the near side of each hole's rim, and tufts of grass along the front, so moles come up out of the ground
    for (const h of HOLES) {
      c.fillStyle = '#7a5230'; c.beginPath(); c.ellipse(h, 3, 38, 9, 0, 0, Math.PI); c.fill();
      c.fillStyle = C.grassDeep; c.beginPath(); c.ellipse(h, 7, 40, 6, 0, 0, Math.PI); c.fill();
    }
    c.fillStyle = C.grass;
    for (let x = 0; x < W; x += 9) { if (HOLES.some(h => Math.abs(h - x) < 36)) continue; c.beginPath(); c.moveTo(x, 6); c.lineTo(x + 3, -6 - (x % 27) / 6); c.lineTo(x + 6, 6); c.fill(); }
    c.fillStyle = 'rgba(255, 255, 255, .07)';
    c.beginPath(); c.moveTo(W * 0.62, VIEW.y0); c.lineTo(W * 0.74, VIEW.y0); c.lineTo(W * 0.42, VIEW.y1); c.lineTo(W * 0.3, VIEW.y1); c.fill();
    c.restore();
    rr(c, VIEW.x0 - 4, VIEW.y0 - 4, VIEW.x1 - VIEW.x0 + 8, VIEW.y1 - VIEW.y0 + 8, 15);
    c.lineWidth = 7; c.strokeStyle = '#fff3c4'; c.stroke();
  }

  // ---------- the moles ----------
  // Underground, side on: running, sniffing at a junction, or curled up in the burrow.
  const lastY = [];
  function digger(m, t) {
    const sniff = m.state === 'sniff' ? Math.sin(t * 40) * 2 : 0;
    const resting = m.state === 'rest';
    // in a hole's shaft it climbs nose up (or goes down nose first)
    const shaft = HOLES.includes(Math.round(m.x)) && m.y > 0 && m.y < 74 && !resting;
    const down = m.y > (lastY[m.id] ?? m.y);
    lastY[m.id] = m.y;
    ctx.save();
    ctx.translate(m.x, m.y + (resting ? 10 : 0));
    if (shaft) ctx.rotate(down ? Math.PI / 2 : -Math.PI / 2);
    else ctx.scale(m.face, 1);
    const fur = m.gold ? '#f2c14e' : C.fur;
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, 0, resting ? 18 : 20, resting ? 11 : 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.nose; ctx.beginPath(); ctx.moveTo(21 + sniff, -5); ctx.lineTo(29 + sniff, -2); ctx.lineTo(21 + sniff, 2); ctx.fill();
    ctx.fillStyle = C.nose; ctx.beginPath(); ctx.ellipse(12, 10, 5, 3, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(-8, 10, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink;
    if (resting && m.stars <= 0) { ctx.fillRect(13, -5, 4, 1.5); } else { ctx.beginPath(); ctx.arc(15, -5, 1.8, 0, Math.PI * 2); ctx.fill(); }
    if (m.hat) hat(10, -10, 0.7);
    ctx.restore();
    if (m.stars > 0) stars(m.x + 6, m.y - 18, t, 0.8);
    if (resting && m.stars <= 0 && m.active) { ctx.fillStyle = 'rgba(255, 246, 224, .6)'; ctx.font = '400 11px Bungee, Impact, sans-serif'; ctx.fillText('z', m.x + 18, m.y - 10 - Math.abs(Math.sin(t * 2)) * 6); }
  }

  // Up out of its hole, face on: rise 0 is just under the lawn, 1 all the way up.
  function popper(m, t) {
    const x = HOLES[m.hole], dazed = m.state === 'falling';
    const cy = 8 - 54 * m.rise;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 60, -200, 120, 204); ctx.clip();
    const fur = m.gold ? '#f2c14e' : C.fur, dark = m.gold ? '#c8901c' : C.furDark;
    ctx.fillStyle = fur;
    rr(ctx, x - 22, cy, 44, 70, 18); ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x - 18, cy - 18, 7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + 18, cy - 18, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9b48f'; ctx.beginPath(); ctx.ellipse(x, cy + 10, 15, 11, 0, 0, Math.PI * 2); ctx.fill();
    // its face: beady eyes looking about (or crossed out, bonked), a big pink nose, whiskers and two teeth
    if (dazed) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      for (const ex of [-9, 9]) { ctx.beginPath(); ctx.moveTo(x + ex - 4, cy - 8); ctx.lineTo(x + ex + 4, cy); ctx.moveTo(x + ex + 4, cy - 8); ctx.lineTo(x + ex - 4, cy); ctx.stroke(); }
    } else {
      const look = m.state === 'peeking' ? Math.sin(t * 9) * 3 : 0;
      ctx.fillStyle = C.ink; for (const ex of [-9, 9]) { ctx.beginPath(); ctx.arc(x + ex + look, cy - 5, 3.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff'; for (const ex of [-9, 9]) { ctx.beginPath(); ctx.arc(x + ex + look - 1, cy - 6.4, 1.1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = C.nose; ctx.beginPath(); ctx.ellipse(x, cy + 4, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, cy + 13, 3.5, 5); ctx.fillRect(x + 0.5, cy + 13, 3.5, 5);
    ctx.strokeStyle = 'rgba(36, 23, 12, .6)'; ctx.lineWidth = 1.2;
    for (const s of [-1, 1]) for (const dy of [-2, 3]) { ctx.beginPath(); ctx.moveTo(x + s * 10, cy + 6); ctx.lineTo(x + s * 26, cy + 6 + dy); ctx.stroke(); }
    if (m.gold) { const s = Math.max(0, Math.sin(t * 5)); ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + 0.6 * s})`; sparkle(x + 20, cy - 22, 6); sparkle(x - 24, cy + 18, 4); }
    if (m.hat) hat(x, cy - 16, 1.2);
    ctx.restore();
    if (dazed || m.stars > 2) stars(x, cy - 34, t, 1.2);
  }

  function hat(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, 4, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 2, 17, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#e0a91c'; ctx.fillRect(-3, -15, 6, 17);
    ctx.restore();
  }
  function sparkle(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25); ctx.closePath(); ctx.fill(); }
  function stars(x, y, t, s) {
    ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) { const a = t * 5 + i * Math.PI * 2 / 3; sparkle(x + Math.cos(a) * 16 * s, y + Math.sin(a) * 5 * s, 5 * s); }
  }

  // The mallet: up, then down on the hole, then up again. swing: { hole, t } (seconds since it came down).
  function mallet(sw) {
    if (!sw || sw.t > 0.3) return;
    const x = HOLES[sw.hole];
    const down = sw.t < 0.05 ? sw.t / 0.05 : sw.t < 0.14 ? 1 : Math.max(0, 1 - (sw.t - 0.14) / 0.16);
    const a = -1.0 * (1 - down);
    ctx.save();
    ctx.translate(x + 92, -36);
    ctx.rotate(a);
    ctx.fillStyle = '#b07a3e'; rr(ctx, -92, -6, 92, 12, 5); ctx.fill();
    ctx.fillStyle = '#7a4f24'; rr(ctx, -30, -7, 30, 14, 6); ctx.fill();
    ctx.fillStyle = C.red; rr(ctx, -120, -26, 40, 52, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .3)'; rr(ctx, -114, -22, 8, 44, 4); ctx.fill();
    ctx.restore();
  }

  // b: the burrow. swing: the mallet's last swing. pops: what a bonk was worth ({ x, y, text, t, gold }).
  // glow: the sign blazing for a run.
  function frame(b, { now = 0, swing = null, pops = [], puffs = [] } = {}) {
    const t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(back, 0, 0);
    world(ctx);
    ctx.save();
    rr(ctx, VIEW.x0, VIEW.y0, VIEW.x1 - VIEW.x0, VIEW.y1 - VIEW.y0, 12); ctx.clip();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const m of b.moles) {
      if (['rising', 'peeking', 'sinking', 'falling'].includes(m.state)) popper(m, t);
      else digger(m, t);
    }
    for (const p of puffs) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / 0.5);
      ctx.fillStyle = '#a77b4f';
      for (let i = 0; i < 5; i++) { const a = Math.PI + (i / 4) * Math.PI; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * (10 + p.t * 50), -4 + Math.sin(a) * (6 + p.t * 30), 5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(front, 0, 0);
    world(ctx);
    mallet(swing);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1);
      ctx.font = `400 ${p.big ? 24 : 19}px Bungee, Impact, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(36, 23, 12, .85)'; ctx.strokeText(p.text, p.x, p.y - p.t * 40);
      ctx.fillStyle = p.gold ? '#ffd23f' : C.cream; ctx.fillText(p.text, p.x, p.y - p.t * 40);
    }
    ctx.globalAlpha = 1;
  }

  return { resize, repaint, frame, cabinet, toBurrow, at: P };
}
