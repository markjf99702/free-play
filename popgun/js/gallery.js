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

  // The target (if any) a point on the back of the booth is on, right now: inside its cutout, near enough.
  function targetAt(x, y) {
    for (const row of rows) {
      for (const t of row.targets) {
        if (t.hit) continue;
        // the tin itself, not the air round its edges
        const k = KINDS[t.kind];
        if (Math.abs(x - t.x) <= k.w * 0.4 && y <= row.rail - k.h * 0.06 && y >= row.rail - k.h * 0.92) return { row, t };
      }
    }
    return null;
  }

  // A cork at the point x, y on the back of the booth. False when there are no corks, or the gun's still reloading.
  function fire(x, y) {
    if (!corks || reload > 0 || over) return false;
    corks--; shots++;
    reload = RELOAD;
    flights.push({ to: { x, y }, t: 0 });
    events.push('pop');
    return true;
  }

  // A cork arriving: it knocks over whatever it meets there, or thuds into the backdrop.
  function land(f) {
    const at = targetAt(f.to.x, f.to.y);
    if (!at) { streak = 0; events.push({ miss: true, x: f.to.x, y: f.to.y }); return; }
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
    get ready() { return reload === 0 && corks > 0 && !over; },
    get over() { return over; },
    // what's happened since the last look: 'pop', { hit, x, y, points, corks, run }, { miss, x, y }, 'over', and
    // { arrive, x, y } as a golden duck or a bell comes round into view
    take() { const e = events; events = []; return e; },
  };
}

// The tickets a round's score pays.
export const ticketsFor = score => Math.floor(score / 20);
