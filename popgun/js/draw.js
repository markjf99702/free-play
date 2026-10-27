// Popgun's pictures: a carnival shooting booth, its tin targets, the corks in flight and the popgun on the counter.
// The painted backdrop is drawn once per resize behind everything, and the booth's frame (posts, awning, sign and
// counter) once in front of it, so the targets slide out of sight behind the posts; each frame draws what moves
// between the two, then the gun on top. Everything is in js/gallery.js's units; resize() works out their size here.

import { W, H, ROWS, FLIGHT } from './gallery.js';

const CAB = { x0: -64, x1: W + 64, y0: -168, y1: H + 150 };
const SIGN = { x0: 70, x1: W - 70, y0: -160, y1: -98 };
const PIVOT = { x: W / 2, y: H + 138 }, BARREL = 74, GUN = 1.45; // the popgun turns about its grip; its size
export const MOON = { x: W - 92, y: 70, r: 38 };  // painted on the backdrop: it winks when it's hit
const C = {
  red: '#d63a2f', redDeep: '#8f1f19', cream: '#fbeed2', gold: '#f2c14e', wood: '#8a5a2b', woodDark: '#5a3816',
  sky: '#13204e', ink: '#1e1408', brass: '#d9a441', brassDark: '#8e6519',
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
    k = Math.min((w - right - 12) / cw, room / ch, 1.1);
    ox = (w - right - cw * k) / 2 - CAB.x0 * k;
    oy = top + 4 + Math.max(0, room - ch * k) * 0.35 - CAB.y0 * k;
    repaint();
  }
  // Where a point on the page is on the back of the booth (for aiming), and the other way round.
  const toBooth = (px, py) => ({ x: (px - ox) / k, y: (py - oy) / k });
  const cabinet = () => { const a = P(CAB.x0, CAB.y0), b = P(CAB.x1, CAB.y1); return { left: a.x, width: b.x - a.x, top: a.y, bottom: b.y }; };

  function setWorld(c) { c.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function star(c, x, y, R, r, n = 5) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r : R; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
    c.closePath();
  }

  function repaint() {
    // ---------- the backdrop ----------
    let c = back.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, back.width, back.height);
    setWorld(c);
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d1640'); sky.addColorStop(0.55, '#26215e'); sky.addColorStop(1, '#3b2466');
    c.fillStyle = sky; c.fillRect(-30, -20, W + 60, H + 40);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    c.fillStyle = 'rgba(255, 246, 220, .75)';
    for (let i = 0; i < 46; i++) { star(c, rnd() * W, rnd() * H * 0.62, 2.6, 1.1, 4); c.fill(); }
    // a Ferris wheel and a big top, far off
    c.strokeStyle = 'rgba(120, 100, 190, .45)'; c.lineWidth = 3;
    c.beginPath(); c.arc(96, 330, 92, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(96, 330); c.lineTo(96 + Math.cos(a) * 92, 330 + Math.sin(a) * 92); c.stroke(); }
    c.fillStyle = 'rgba(120, 100, 190, .35)';
    c.beginPath(); c.moveTo(380, 520); c.lineTo(440, 410); c.lineTo(500, 520); c.fill();
    // the strips the rows run along: clouds at the top, a hedge in the middle, the pond at the bottom
    const strip = (y, h, fill) => { c.fillStyle = fill; c.fillRect(-30, y, W + 60, h); };
    strip(ROWS[0].rail + 6, 30, '#3b3f8f');
    c.fillStyle = '#5156a8';
    for (let x = -20; x < W + 30; x += 46) { c.beginPath(); c.arc(x, ROWS[0].rail + 12, 18, Math.PI, 0); c.fill(); }
    strip(ROWS[1].rail + 6, 34, '#1f6b3a');
    c.fillStyle = '#2f8a4c';
    for (let x = -20; x < W + 30; x += 22) { c.beginPath(); c.arc(x, ROWS[1].rail + 10, 12, Math.PI, 0); c.fill(); }
    strip(ROWS[2].rail + 6, 60, '#1c5aa0');
    for (const row of ROWS) {
      c.fillStyle = C.brassDark; c.fillRect(-30, row.rail, W + 60, 8);
      c.fillStyle = C.brass; c.fillRect(-30, row.rail, W + 60, 3);
    }

    // ---------- the booth, in front ----------
    c = front.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, front.width, front.height);
    setWorld(c);
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .5)'; c.shadowBlur = 30 * k; c.shadowOffsetY = 10 * k;
    // the counter
    rr(c, CAB.x0, H + 10, CAB.x1 - CAB.x0, CAB.y1 - H - 10, [0, 0, 18, 18]); c.fillStyle = C.redDeep; c.fill();
    c.restore();
    rr(c, CAB.x0 + 6, H + 34, CAB.x1 - CAB.x0 - 12, CAB.y1 - H - 40, [0, 0, 14, 14]);
    const cg = c.createLinearGradient(0, H + 34, 0, CAB.y1); cg.addColorStop(0, C.red); cg.addColorStop(1, '#a8271f');
    c.fillStyle = cg; c.fill();
    c.fillStyle = C.gold;
    for (let x = 30; x < W; x += 100) { if (Math.abs(x + 20 - W / 2) < 90) continue; star(c, x + 20, H + 100, 14, 6); c.fill(); }
    const top = c.createLinearGradient(0, H + 6, 0, H + 34); top.addColorStop(0, '#b07a3e'); top.addColorStop(1, C.woodDark);
    c.fillStyle = top; c.fillRect(CAB.x0, H + 6, CAB.x1 - CAB.x0, 28);
    c.fillStyle = 'rgba(255, 255, 255, .18)'; c.fillRect(CAB.x0, H + 6, CAB.x1 - CAB.x0, 3);
    // the posts
    for (const x of [CAB.x0, W]) {
      const pg = c.createLinearGradient(x, 0, x + 64, 0); pg.addColorStop(0, C.woodDark); pg.addColorStop(0.5, C.wood); pg.addColorStop(1, C.woodDark);
      c.fillStyle = pg; c.fillRect(x, -60, 64, H + 70);
      c.fillStyle = 'rgba(0, 0, 0, .18)';
      for (let y = -40; y < H; y += 46) c.fillRect(x + 6, y, 52, 3);
    }
    // the awning: red and cream stripes, scalloped along the bottom
    c.save();
    c.beginPath(); c.rect(CAB.x0, -96, CAB.x1 - CAB.x0, 110); c.clip();
    for (let i = 0, x = CAB.x0; x < CAB.x1; x += 44, i++) { c.fillStyle = i % 2 ? C.cream : C.red; c.fillRect(x, -96, 44, 84); }
    for (let i = 0, x = CAB.x0; x < CAB.x1; x += 44, i++) { c.fillStyle = i % 2 ? C.cream : C.red; c.beginPath(); c.arc(x + 22, -12, 22, 0, Math.PI); c.fill(); }
    c.fillStyle = 'rgba(0, 0, 0, .15)'; c.fillRect(CAB.x0, -96, CAB.x1 - CAB.x0, 8);
    c.restore();
    // the sign over it, a painted board
    rr(c, SIGN.x0, SIGN.y0, SIGN.x1 - SIGN.x0, SIGN.y1 - SIGN.y0, 12); c.fillStyle = '#2a1a0c'; c.fill();
    c.lineWidth = 4; c.strokeStyle = C.gold; c.stroke();
    c.font = '400 46px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = C.redDeep; c.fillText('POPGUN', W / 2 + 3, (SIGN.y0 + SIGN.y1) / 2 + 6);
    c.fillStyle = C.cream; c.fillText('POPGUN', W / 2, (SIGN.y0 + SIGN.y1) / 2 + 3);
  }

  // ---------- each frame ----------
  // A tin target standing on its rail at x, facing the way it's going; down (0 to 1) is how far it's been knocked flat.
  function target(c, kind, x, rail, dir, down, t) {
    c.save();
    c.translate(x, rail);
    c.fillStyle = '#6b6b6b'; c.fillRect(-7, -6, 14, 6); // its peg on the chain
    c.scale(dir < 0 ? -1 : 1, Math.max(0.04, 1 - down));
    c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = C.ink;
    const bull = (bx, by, r) => {
      c.fillStyle = C.cream; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = C.red; c.beginPath(); c.arc(bx, by, r * 0.62, 0, Math.PI * 2); c.fill();
      c.fillStyle = C.cream; c.beginPath(); c.arc(bx, by, r * 0.26, 0, Math.PI * 2); c.fill();
    };
    if (kind === 'duck' || kind === 'gold') {
      const body = kind === 'gold' ? '#ffcf3a' : '#ffe066', edge = kind === 'gold' ? '#b8860b' : C.ink;
      c.strokeStyle = edge;
      c.fillStyle = body;
      c.beginPath(); c.ellipse(-6, -22, 30, 18, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(18, -42, 13, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#ff8a1f'; c.beginPath(); c.moveTo(29, -45); c.lineTo(42, -40); c.lineTo(29, -36); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = C.ink; c.beginPath(); c.arc(21, -45, 2.4, 0, Math.PI * 2); c.fill();
      bull(-8, -22, 10);
      if (kind === 'gold') {
        const s = Math.max(0, Math.sin(t * 4));
        c.fillStyle = `rgba(255, 255, 255, ${0.5 + s * 0.5})`; star(c, -26, -38, 6 * (0.6 + s * 0.4), 2, 4); c.fill();
        star(c, 6, -6, 4, 1.5, 4); c.fill();
      }
    } else if (kind === 'rabbit') {
      c.fillStyle = '#eef0f6';
      for (const ex of [2, 13]) { c.beginPath(); c.ellipse(ex, -66, 5, 14, ex > 5 ? 0.15 : -0.1, 0, Math.PI * 2); c.fill(); c.stroke(); }
      c.fillStyle = '#ffb3c6'; for (const ex of [2, 13]) { c.beginPath(); c.ellipse(ex, -66, 2, 9, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#eef0f6';
      c.beginPath(); c.ellipse(-2, -22, 21, 21, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(9, -46, 13, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(-22, -18, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = C.ink; c.beginPath(); c.arc(13, -48, 2.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff8fab'; c.beginPath(); c.arc(21, -44, 2.4, 0, Math.PI * 2); c.fill();
      bull(-2, -22, 10);
    } else if (kind === 'star') {
      c.fillStyle = C.gold; star(c, 0, -25, 26, 11); c.fill(); c.stroke();
      c.fillStyle = C.red; star(c, 0, -25, 18, 8); c.fill();
      bull(0, -25, 6);
    } else if (kind === 'bell') {
      c.fillStyle = C.brass;
      c.beginPath(); c.moveTo(-6, -50); c.quadraticCurveTo(-18, -46, -18, -26); c.quadraticCurveTo(-18, -12, -23, -8); c.lineTo(23, -8);
      c.quadraticCurveTo(18, -12, 18, -26); c.quadraticCurveTo(18, -46, 6, -50); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = C.brassDark; c.beginPath(); c.arc(0, -6, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 255, 255, .45)'; c.fillRect(-11, -42, 4, 22);
      c.save(); c.scale(dir < 0 ? -1 : 1, 1);
      c.font = '400 13px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = C.ink; c.fillText('+3', 0, -26);
      c.restore();
    }
    c.restore();
  }

  // s: what to draw. g: the gallery. aim: where the gun points ({ x, y }, on the back of the booth). cross: show a
  // crosshair there. marks: misses on the backdrop ({ x, y, t }). pops: what a hit was worth ({ x, y, text, t, gold }).
  // recoil: seconds since the last shot. wink: seconds since the moon was hit (or -1). glow: the sign's bulbs blazing.
  function frame(g, { now = 0, aim = { x: W / 2, y: H / 2 }, cross = false, marks = [], pops = [], recoil = 9, wink = -1, glow = 0, jog = -1, ready = true } = {}) {
    const t = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(back, 0, 0);
    setWorld(ctx);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, -20, W, H + 30); ctx.clip();
    moon(wink);
    // the pond's waves, rolling along under the ducks
    const pond = ROWS[2].rail + 10;
    ctx.strokeStyle = 'rgba(160, 210, 255, .55)'; ctx.lineWidth = 3;
    for (let row = 0; row < 3; row++) {
      ctx.beginPath();
      const off = (t * (row % 2 ? -18 : 24)) % 40;
      for (let x = -40 + off; x < W + 40; x += 40) { ctx.moveTo(x, pond + 10 + row * 16); ctx.quadraticCurveTo(x + 10, pond + 4 + row * 16, x + 20, pond + 10 + row * 16); }
      ctx.stroke();
    }
    // the chains the targets ride, moving
    for (const row of g.rows) {
      ctx.fillStyle = 'rgba(0, 0, 0, .35)';
      const off = ((row.travel * row.dir) % 16 + 16) % 16;
      for (let x = -16 + off; x < W + 16; x += 16) ctx.fillRect(x, row.rail + 4, 6, 3);
    }
    for (const m of marks) {
      ctx.globalAlpha = Math.max(0, 1 - m.t / 1.2);
      ctx.fillStyle = 'rgba(20, 10, 0, .5)'; ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 240, 210, .6)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, r0 = 7 + m.t * 10, r1 = 11 + m.t * 16; ctx.beginPath(); ctx.moveTo(m.x + Math.cos(a) * r0, m.y + Math.sin(a) * r0); ctx.lineTo(m.x + Math.cos(a) * r1, m.y + Math.sin(a) * r1); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (const row of g.rows) for (const tg of row.targets) target(ctx, tg.kind, tg.x, row.rail, row.dir, tg.down, t);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(front, 0, 0);
    setWorld(ctx);
    bulbs(t, glow);
    // what a hit was worth, rising off it
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of pops) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.1);
      ctx.font = `400 ${p.big ? 26 : 20}px Bungee, Impact, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30, 20, 8, .85)'; ctx.strokeText(p.text, p.x, p.y - 20 - p.t * 46);
      ctx.fillStyle = p.gold ? C.gold : C.cream; ctx.fillText(p.text, p.x, p.y - 20 - p.t * 46);
    }
    ctx.globalAlpha = 1;
    // the corks on their way, from the gun's muzzle to where they're going, getting smaller as they go
    const angle = Math.atan2(aim.y - PIVOT.y, aim.x - PIVOT.x);
    for (const f of g.flights) {
      const a = Math.atan2(f.to.y - PIVOT.y, f.to.x - PIVOT.x);
      const from = { x: PIVOT.x + Math.cos(a) * BARREL * GUN, y: PIVOT.y + Math.sin(a) * BARREL * GUN };
      const u = Math.min(1, f.t / FLIGHT), e = 1 - (1 - u) * (1 - u);
      const x = from.x + (f.to.x - from.x) * e, y = from.y + (f.to.y - from.y) * e - Math.sin(u * Math.PI) * 18;
      cork(x, y, 1.3 - u * 0.75, a);
    }
    gun(angle, recoil, ready, jog);
    if (cross) {
      ctx.strokeStyle = 'rgba(255, 246, 220, .9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(aim.x, aim.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(aim.x - 22, aim.y); ctx.lineTo(aim.x - 8, aim.y); ctx.moveTo(aim.x + 8, aim.y); ctx.lineTo(aim.x + 22, aim.y);
      ctx.moveTo(aim.x, aim.y - 22); ctx.lineTo(aim.x, aim.y - 8); ctx.moveTo(aim.x, aim.y + 8); ctx.lineTo(aim.x, aim.y + 22); ctx.stroke();
    }
  }

  function cork(x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2); ctx.scale(s, s);
    ctx.fillStyle = '#c99a5b'; rr(ctx, -6, -8, 12, 16, 3); ctx.fill();
    ctx.fillStyle = '#e2bd86'; ctx.beginPath(); ctx.ellipse(0, -8, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // The popgun: a wooden stock and a tin barrel, turned towards where it's aimed, kicking back a little when it fires,
  // and jogging from side to side for a tap that came while it reloaded (jog: seconds since, or -1).
  function gun(angle, recoil, ready, jog = -1) {
    const kick = Math.max(0, 1 - recoil / 0.12) * 10;
    const shake = jog >= 0 && jog < 0.16 ? Math.sin(jog * 80) * 4 * (1 - jog / 0.16) : 0;
    ctx.save();
    ctx.translate(PIVOT.x + shake, PIVOT.y + 6);
    ctx.rotate(angle + Math.PI / 2);
    ctx.scale(GUN, GUN);
    ctx.translate(0, kick);
    ctx.fillStyle = '#6b3f1a'; rr(ctx, -13, -6, 26, 56, 8); ctx.fill();
    ctx.fillStyle = '#8a552a'; rr(ctx, -9, -2, 8, 48, 4); ctx.fill();
    const bg = ctx.createLinearGradient(-9, 0, 9, 0); bg.addColorStop(0, '#5d6a77'); bg.addColorStop(0.45, '#dfe5ec'); bg.addColorStop(1, '#5d6a77');
    ctx.fillStyle = bg; rr(ctx, -8, -BARREL, 16, BARREL, 4); ctx.fill();
    ctx.fillStyle = '#2d3640'; rr(ctx, -10, -BARREL - 4, 20, 8, 3); ctx.fill();
    if (ready) { ctx.fillStyle = '#c99a5b'; rr(ctx, -6, -BARREL - 12, 12, 10, 3); ctx.fill(); }
    ctx.restore();
  }

  // The moon over the fair: it winks when it's hit.
  function moon(wink) {
    const { x, y, r } = MOON;
    ctx.fillStyle = 'rgba(255, 240, 200, .18)'; ctx.beginPath(); ctx.arc(x, y, r + 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff1c9'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200, 170, 110, .35)'; ctx.beginPath(); ctx.arc(x + 14, y - 12, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 16, y + 14, 5, 0, Math.PI * 2); ctx.fill();
    const winking = wink >= 0 && wink < 1.2;
    ctx.strokeStyle = '#7a5a2a'; ctx.fillStyle = '#7a5a2a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x - 12, y - 4, 3, 0, Math.PI * 2); ctx.fill();
    if (winking) { ctx.beginPath(); ctx.moveTo(x + 7, y - 4); ctx.lineTo(x + 17, y - 4); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x + 12, y - 4, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y + 6, winking ? 11 : 9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    if (winking) { ctx.fillStyle = 'rgba(255, 120, 140, .5)'; ctx.beginPath(); ctx.arc(x + 18, y + 8, 5, 0, Math.PI * 2); ctx.fill(); }
  }

  // The bulbs round the sign, chasing; glow makes them all flash.
  function bulbs(t, glow) {
    const n = 18, x0 = SIGN.x0 + 10, x1 = SIGN.x1 - 10, phase = Math.floor(t * 3) % 2;
    for (let i = 0; i <= n; i++) {
      for (const y of [SIGN.y0 + 7, SIGN.y1 - 7]) {
        const on = glow > 0 ? Math.floor(t * 10) % 2 === 0 || i % 2 : (i + phase) % 2 === 0;
        const x = x0 + (x1 - x0) * i / n;
        if (on) { ctx.fillStyle = 'rgba(255, 220, 140, .35)'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = on ? '#fff1c4' : '#6b4a2a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  return { resize, repaint, frame, cabinet, toBooth, at: P };
}
