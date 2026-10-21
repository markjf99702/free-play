// Popgun's gallery: the rows of tin targets on their conveyors, the corks in flight, and the score. Plain rules with
// a clock that only moves when step() is called, so node can test it (test/popgun.unit.test.mjs); js/draw.js draws it.
//
// The back of the booth is W across and H down, y down. Three rows of targets run along rails, each row the other way
// from the one below: ducks at the bottom, slow and big; rabbits in the middle; small fast stars up top. Now and
// then a golden duck comes along the bottom, and a bell along the top: a cork in the bell wins three more corks.
// A cork takes a moment to get there (FLIGHT), so a moving target has to be led. A hit knocks the target flat, and
// it stands up again once it's been round the back of the conveyor.

export const W = 560, H = 560;
export const CORKS = 20;            // in a round
export const FLIGHT = 0.26;         // seconds from the gun to the back of the booth
export const RELOAD = 0.3;          // seconds between shots
export const STREAK = { run: 5, bonus: 50 }; // five hits in a row: fifty more
export const MUZZLE = { x: W / 2, y: H + 90 }; // where the corks come from, down on the counter

// Each target: its size (the tin cutout, standing on its rail), and what a hit is worth.
export const KINDS = {
  duck: { w: 74, h: 58, points: 10 },
  gold: { w: 74, h: 58, points: 100 },
  rabbit: { w: 56, h: 76, points: 20 },
  star: { w: 50, h: 50, points: 50 },
  bell: { w: 46, h: 52, points: 0, corks: 3 },
};
// The rows, top first: where the rail is, which way and how fast it runs (units a second), and what comes along it.
export const ROWS = [
  { rail: 160, dir: 1, speed: 132, gap: 128, kinds: [['star', 0.9], ['bell', 0.1]] },
  { rail: 300, dir: -1, speed: 92, gap: 124, kinds: [['rabbit', 1]] },
  { rail: 440, dir: 1, speed: 64, gap: 136, kinds: [['duck', 0.9], ['gold', 0.1]] },
];
const MARGIN = 80; // how far past the booth's sides a target goes before it's round the back

export function createGallery({ random = Math.random } = {}) {
  const pick = kinds => { let r = random(); for (const [k, p] of kinds) { if ((r -= p) < 0) return k; } return kinds[0][0]; };
  // each row's targets, evenly spaced along a loop a little longer than the booth is wide
  const rows = ROWS.map(row => {
    const n = Math.ceil((W + 2 * MARGIN) / row.gap), loop = n * row.gap;
    const offset = random() * row.gap;
    const targets = Array.from({ length: n }, (_, i) => ({ x: -MARGIN + offset + i * row.gap, kind: pick(row.kinds), down: 0, hit: false }));
    return { ...row, loop, targets };
  });
  let clock = 0, reload = 0, corks = CORKS, score = 0, streak = 0, shots = 0, hits = 0, over = false;
  const flights = [];   // corks on their way: { from, to, t }
  let events = [];

  function step(dt) {
    clock += dt;
    reload = Math.max(0, reload - dt);
    for (const row of rows) {
      for (const t of row.targets) {
        t.x += row.dir * row.speed * dt;
        // round the back of the conveyor: in again at the other side, standing, maybe something else
        if (row.dir > 0 && t.x > W + MARGIN) { t.x -= row.loop; renew(row, t); }
        if (row.dir < 0 && t.x < -MARGIN) { t.x += row.loop; renew(row, t); }
        if (t.hit) t.down = Math.min(1, t.down + dt * 6);
      }
    }
    for (const f of flights) f.t += dt;
    while (flights.length && flights[0].t >= FLIGHT) land(flights.shift());
    if (!corks && !flights.length && !over) { over = true; events.push('over'); }
  }
  function renew(row, t) { t.kind = pick(row.kinds); t.hit = false; t.down = 0; }

  // The target (if any) a point on the back of the booth is on, right now: inside its cutout, near enough.
  function targetAt(x, y) {
    for (const row of rows) {
      for (const t of row.targets) {
        if (t.hit) continue;
        const k = KINDS[t.kind];
        if (Math.abs(x - t.x) <= k.w * 0.48 && y <= row.rail + 2 && y >= row.rail - k.h * 0.98) return { row, t };
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
    // what's happened since the last look: 'pop', { hit, x, y, points, corks, run }, { miss, x, y }, 'over'
    take() { const e = events; events = []; return e; },
  };
}

// The tickets a round's score pays.
export const ticketsFor = score => Math.floor(score / 20);
