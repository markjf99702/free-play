// Popgun's gallery: the rows of tin targets on their conveyors, the corks in flight, and the score. Plain rules with
// a clock that only moves when step() is called, so node can test it (test/popgun.unit.test.mjs); js/draw.js draws it.
//
// The back of the booth is W across and H down, y down. Three rows of targets run along rails, each row the other way
// from the one below: ducks at the bottom, slow and big; rabbits in the middle; small fast stars up top. Each row's
// motor runs a little faster, then a little slower, and back, so a lead that worked a moment ago won't quite now.
// Now and then a golden duck comes along the bottom, and a bell along the top: a cork in the bell wins three more.
// A cork takes a moment to get there (FLIGHT), so a moving target has to be led. A hit knocks the target flat, and
// it stands up again once it's been round the back of the conveyor.

export const W = 560, H = 560;
export const CORKS = 20;            // in a round
export const FLIGHT = 0.32;         // seconds from the gun to the back of the booth
export const RELOAD = 0.3;          // seconds between shots
export const STREAK = { run: 5, bonus: 50 }; // five hits in a row: fifty more
export const MUZZLE = { x: W / 2, y: H + 90 }; // where the corks come from, down on the counter

// Each target: its size (the tin cutout, standing on its rail), and what a hit is worth.
export const KINDS = {
  duck: { w: 74, h: 58, points: 10 },
  gold: { w: 74, h: 58, points: 100 },
  rabbit: { w: 56, h: 76, points: 20 },
  star: { w: 44, h: 44, points: 30 },
  bell: { w: 42, h: 48, points: 0, corks: 3 },
};
// The rows, top first: where the rail is, which way and how fast it runs (units a second, on average), and what
// comes along it.
export const ROWS = [
  { rail: 160, dir: 1, speed: 172, gap: 128, kinds: [['star', 0.94], ['bell', 0.06]] },
  { rail: 300, dir: -1, speed: 112, gap: 124, kinds: [['rabbit', 1]] },
  { rail: 440, dir: 1, speed: 76, gap: 136, kinds: [['duck', 0.9], ['gold', 0.1]] },
];
// Each target's painted tin, traced from js/draw.js's target(): in the target's own units, facing right with its rail
// at y = 0, and taking in the ink line round its edge (3 wide, so half of it outside). test/popgun.e2e.mjs draws each
// one and checks this against the picture, so a change to one needs the other.
const LINE = 1.5;
const inEllipse = (x, y, cx, cy, rx, ry, rot = 0, out = LINE) => {
  const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = dy * c - dx * s;
  return (u / (rx + out)) ** 2 + (v / (ry + out)) ** 2 <= 1;
};
// inside a polygon, or within the ink line of its edge
const inPolygon = (x, y, P, out = LINE) => {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    const l2 = (xj - xi) ** 2 + (yj - yi) ** 2, t = Math.max(0, Math.min(1, ((x - xi) * (xj - xi) + (y - yi) * (yj - yi)) / l2));
    if (Math.hypot(x - xi - t * (xj - xi), y - yi - t * (yj - yi)) <= out) return true;
  }
  return inside;
};
const starPoints = (cx, cy, R, r, n = 5) => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r : R; return [cx + Math.cos(a) * d, cy + Math.sin(a) * d]; });
// the bell's outline is four curves: each one followed along in short straight steps
const curve = (P, [x0, y0], [cx, cy], [x1, y1]) => { for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; P.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]); } return P; };
const BELL = [[-6, -50]];
curve(BELL, [-6, -50], [-18, -46], [-18, -26]); curve(BELL, [-18, -26], [-18, -12], [-23, -8]);
BELL.push([23, -8]);
curve(BELL, [23, -8], [18, -12], [18, -26]); curve(BELL, [18, -26], [18, -46], [6, -50]);
const STAR = starPoints(0, -25, 26, 11), BEAK = [[29, -45], [42, -40], [29, -36]];
const duck = (x, y) => inEllipse(x, y, -6, -22, 30, 18) || inEllipse(x, y, 18, -42, 13, 13) || inPolygon(x, y, BEAK);
export const TIN = {
  duck,
  gold: duck,
  rabbit: (x, y) => inEllipse(x, y, 2, -66, 5, 14, -0.1) || inEllipse(x, y, 13, -66, 5, 14, 0.15) || inEllipse(x, y, -2, -22, 21, 21)
    || inEllipse(x, y, 9, -46, 13, 13) || inEllipse(x, y, -22, -18, 6, 6),
  star: (x, y) => inPolygon(x, y, STAR),
  bell: (x, y) => inPolygon(x, y, BELL) || inEllipse(x, y, 0, -6, 5, 5, 0, 0), // and its clapper
};

const SURGE = 0.22;                 // how far a row's speed wanders either side of its average
const MARGIN = 80; // how far past the booth's sides a target goes before it's round the back

export function createGallery({ random = Math.random } = {}) {
  const pick = kinds => { let r = random(); for (const [k, p] of kinds) { if ((r -= p) < 0) return k; } return kinds[0][0]; };
  // each row's targets, evenly spaced along a loop a little longer than the booth is wide
  const rows = ROWS.map(row => {
    const n = Math.ceil((W + 2 * MARGIN) / row.gap), loop = n * row.gap;
    const offset = random() * row.gap;
    const targets = Array.from({ length: n }, (_, i) => ({ x: -MARGIN + offset + i * row.gap, kind: pick(row.kinds), down: 0, hit: false }));
    // now: how fast it's running this moment. travel: how far its chain has gone (for drawing the links).
    return { ...row, loop, targets, now: row.speed, travel: 0, surge: { period: 5 + random() * 3, phase: random() * Math.PI * 2 } };
  });
  let clock = 0, reload = 0, corks = CORKS, score = 0, streak = 0, shots = 0, hits = 0, over = false;
  let behind = 0;       // misses that landed just behind the tin they were fired at
  const flights = [];   // corks on their way: { from, to, t }
  let events = [];

  function step(dt) {
    clock += dt;
    reload = Math.max(0, reload - dt);
    for (const row of rows) {
      row.now = row.speed * (1 + SURGE * Math.sin((clock / row.surge.period) * Math.PI * 2 + row.surge.phase));
      row.travel += row.now * dt;
      for (const t of row.targets) {
        t.x += row.dir * row.now * dt;
        // round the back of the conveyor: in again at the other side, standing, maybe something else
        if (row.dir > 0 && t.x > W + MARGIN) { t.x -= row.loop; renew(row, t); }
        if (row.dir < 0 && t.x < -MARGIN) { t.x += row.loop; renew(row, t); }
        if (t.hit) t.down = Math.min(1, t.down + dt * 6);
        // a golden duck or a bell, just round the conveyor, coming into view
        if (t.coming && t.x + KINDS[t.kind].w / 2 > 0 && t.x - KINDS[t.kind].w / 2 < W) {
          t.coming = false;
          events.push({ arrive: t.kind, x: t.x, y: row.rail - KINDS[t.kind].h / 2 });
        }
      }
    }
    for (const f of flights) f.t += dt;
    while (flights.length && flights[0].t >= FLIGHT) land(flights.shift());
    if (!corks && !flights.length && !over) { over = true; events.push('over'); }
  }
  function renew(row, t) { t.kind = pick(row.kinds); t.hit = false; t.down = 0; t.coming = t.kind === 'gold' || t.kind === 'bell'; }

  // The target (if any) a point on the back of the booth is on, right now: inside the box round the middle of its
  // cutout, or anywhere on its painted tin (a duck's beak, a star's points, a rabbit's ears).
  function targetAt(x, y) {
    for (const row of rows) {
      for (const t of row.targets) {
        if (t.hit) continue;
        const k = KINDS[t.kind];
        if (Math.abs(x - t.x) <= k.w * 0.4 && y <= row.rail - k.h * 0.06 && y >= row.rail - k.h * 0.92) return { row, t };
        if (TIN[t.kind]((x - t.x) * row.dir, y - row.rail)) return { row, t };
      }
    }
    return null;
  }

  // A cork at the point x, y on the back of the booth. False when there are no corks, or the gun's still reloading.
  function fire(x, y) {
    if (!corks || reload > 0 || over) return false;
    corks--; shots++;
    reload = RELOAD;
    // the tin under the tap as it fires: if the cork misses and that tin's still standing, it ran on ahead of the cork
    const at = targetAt(x, y);
    flights.push({ to: { x, y }, t: 0, at: at && at.t, kind: at && at.t.kind });
    events.push('pop');
    return true;
  }

  // A cork arriving: it knocks over whatever it meets there, or thuds into the backdrop.
  function land(f) {
    const at = targetAt(f.to.x, f.to.y);
    if (!at) {
      streak = 0;
      const ran = f.at && !f.at.hit && f.at.kind === f.kind ? f.kind : undefined;
      if (ran) behind++;
      events.push(ran ? { miss: true, x: f.to.x, y: f.to.y, behind: ran } : { miss: true, x: f.to.x, y: f.to.y });
      return;
    }
    const { t } = at, k = KINDS[t.kind];
    t.hit = true;
    hits++; streak++;
    score += k.points;
    if (k.corks) corks += k.corks;
    const run = streak % STREAK.run === 0;
    if (run) score += STREAK.bonus;
    events.push({ hit: t.kind, x: t.x, y: at.row.rail - k.h / 2, points: k.points, corks: k.corks || 0, run });
  }

  return {
    step,
    fire,
    targetAt,
    rows,
    flights,
    get clock() { return clock; },
    get corks() { return corks; },
    get score() { return score; },
    get streak() { return streak; },
    get shots() { return shots; },
    get hits() { return hits; },
    get behind() { return behind; },
    get ready() { return reload === 0 && corks > 0 && !over; },
    get over() { return over; },
    // what's happened since the last look: 'pop', { hit, x, y, points, corks, run }, { miss, x, y }, 'over', and
    // { arrive, x, y } as a golden duck or a bell comes round into view. A miss at a tin that was under the tap when
    // the cork went, and has run on ahead of it, says which: { miss, x, y, behind: 'star' }.
    take() { const e = events; events = []; return e; },
  };
}

// What the end card says to try next time, when it's plain from the round: half or more of the misses (two at least)
// landed just behind the tin they were fired at. Otherwise null.
export function tipFor(g) {
  const misses = g.shots - g.hits;
  return g.behind >= 2 && g.behind * 2 >= misses ? 'Most corks landed just behind: aim further ahead.' : null;
}

// The trophy's feat: a round with every cork a hit, the bell among them (its three more corks too, so 23 or more).
export const FEAT = { corks: CORKS + 3 };
export const feat = g => g.over && g.shots >= FEAT.corks && g.hits === g.shots;

// The tickets a round's score pays: one for every PER_TICKET points.
export const PER_TICKET = 30;
export const ticketsFor = score => Math.floor(score / PER_TICKET);
