// Bonkers' burrow: the moles, their tunnels, and the mallet. Plain rules with a clock that only moves when step() is
// called, so node can test it (test/bonkers.unit.test.mjs); js/draw.js draws it.
//
// A whack-a-mole with the side of the cabinet made of glass. The lawn runs along y = 0 with five holes in it; below
// is the ground in cross-section, with the moles' tunnels and two burrows. Each mole picks a free hole, runs through
// the tunnels to it (stopping to sniff at the junctions), climbs the shaft and pops up for a moment, then ducks back
// down and heads off somewhere else. Some only peek: a nose out, and back down. Some wear a hard hat, which the first
// bonk knocks off. Now and then one is golden. A bonked mole goes back to its burrow to see stars for a while.
// Units are a 500th of the cabinet's width; y runs down.

export const W = 500;
export const HOLES = [50, 150, 250, 350, 450];
export const ROUND = 45;                 // seconds
export const FRENZY = 10;                // the last ten of them: faster, and one more mole
export const POINTS = { mole: 10, hat: 30, gold: 50 };
export const MISS = 5;                   // what a swing at nothing costs
export const RUN = { every: 10, bonus: 50 }; // ten bonks in a row: fifty more
export const REACH = 48;                 // how far either side of a hole a swing still lands on it

// The tunnels: points in the ground, and the straight runs between them.
export const NODES = {
  h0: [50, 0], h1: [150, 0], h2: [250, 0], h3: [350, 0], h4: [450, 0],      // the holes
  s0: [50, 74], s1: [150, 74], s2: [250, 74], s3: [350, 74], s4: [450, 74], // the bottoms of their shafts
  j1: [100, 176], j2: [250, 176], j3: [400, 176],                           // the deep tunnel
  b1: [100, 272], b2: [400, 272],                                           // the burrows
};
export const EDGES = [
  ['h0', 's0'], ['h1', 's1'], ['h2', 's2'], ['h3', 's3'], ['h4', 's4'],
  ['s0', 's1'], ['s3', 's4'], ['s1', 'j1'], ['s2', 'j2'], ['s3', 'j3'],
  ['j1', 'j2'], ['j2', 'j3'], ['j1', 'b1'], ['j3', 'b2'],
];
const JUNCTIONS = new Set(['s1', 's3', 'j1', 'j2', 'j3']);
const len = (a, b) => Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);

// The shortest way through the tunnels from one point to another: the list of points, start to end.
const ROUTES = (() => {
  const near = {};
  for (const [a, b] of EDGES) { (near[a] ||= []).push(b); (near[b] ||= []).push(a); }
  const routes = {};
  for (const from of Object.keys(NODES)) {
    const dist = { [from]: 0 }, prev = {}, open = new Set(Object.keys(NODES));
    while (open.size) {
      let u = null;
      for (const n of open) if (dist[n] !== undefined && (u === null || dist[n] < dist[u])) u = n;
      if (u === null) break;
      open.delete(u);
      for (const v of near[u]) {
        const d = dist[u] + len(u, v);
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    for (const to of Object.keys(NODES)) {
      const path = [to];
      while (path[0] !== from) path.unshift(prev[path[0]]);
      routes[`${from}>${to}`] = path;
    }
  }
  return routes;
})();
export const route = (from, to) => ROUTES[`${from}>${to}`];

// How the round gets harder: from the first second (0) to the last (1), and faster again in the frenzy.
const pace = (f, frenzy) => ({
  speed: 250 + 100 * f + (frenzy ? 70 : 0),  // through the tunnels, units a second
  up: frenzy ? 0.42 : 0.78 - 0.28 * f,       // how long a mole stays up, seconds
  peek: 0.15 + 0.1 * f,                      // how many pops are only a peek
  moles: frenzy ? 5 : f > 0.3 ? 5 : 4,
});
const RISE = 0.11;                           // seconds to pop up (or duck down)

export function createBurrow({ random = Math.random } = {}) {
  let clock = 0, score = 0, run = 0, bonks = 0, swings = 0, over = false, frenzy = false;
  let events = [];
  const reserved = new Set();               // holes a mole is on its way to, or up in

  // a mole: where it is (node it's at, or between two), what it's doing, and what it's wearing
  const moles = Array.from({ length: 5 }, (_, i) => ({
    id: i, node: i % 2 ? 'b2' : 'b1', x: 0, y: 0, path: null, leg: 0, along: 0,
    state: 'rest', timer: 0.4 + i * 0.5 + random() * 0.4, hole: -1, rise: 0, hat: false, gold: false,
    stars: 0, face: 1, active: i < 3, plan: null,
  }));
  for (const m of moles) [m.x, m.y] = NODES[m.node];

  const f = () => Math.min(1, clock / ROUND);

  // Off to a free hole (or, now and then, home to the burrow for a rest).
  function setOff(m, home = false) {
    const free = HOLES.map((_, i) => i).filter(i => !reserved.has(i));
    if (home || !free.length) {
      const burrow = m.x < W / 2 ? 'b1' : 'b2';
      go(m, burrow, 'home');
      return;
    }
    const hole = free[Math.floor(random() * free.length)];
    reserved.add(hole);
    m.hole = hole;
    m.plan = random() < pace(f(), frenzy).peek ? 'peek' : 'pop';
    go(m, `h${hole}`, 'travel');
  }
  function go(m, to, state) {
    m.path = route(m.node, to);
    m.leg = 0; m.along = 0; m.state = m.path.length > 1 ? state : arrive(m, state);
  }
  function arrive(m, state) {
    if (state === 'home' || state === 'dazed') {
      m.state = 'rest'; m.timer = state === 'dazed' ? 0.7 + random() * 0.5 : 0.25 + random() * 0.4;
      if (!m.gold && random() < 0.18) m.hat = true; // it might come back out in a hard hat
      return m.state;
    }
    // at the top of the shaft: up it pops, or just its nose (or, if time's up, straight back down)
    if (over) { m.state = 'sinking'; return m.state; }
    m.state = m.plan === 'peek' ? 'peeking' : 'rising';
    m.gold = !m.hat && m.plan === 'pop' && random() < 0.07;
    m.timer = m.plan === 'peek' ? 0.45 : pace(f(), frenzy).up;
    events.push(m.plan === 'peek' ? { peek: m.hole } : { pop: m.hole, gold: m.gold, hat: !!m.hat });
    return m.state;
  }

  function stepMole(m, dt) {
    if (!m.active) return;
    const p = pace(f(), frenzy);
    m.stars = Math.max(0, m.stars - dt);
    switch (m.state) {
      case 'rest':
        m.timer -= dt;
        if (m.timer <= 0 && !over) setOff(m);
        break;
      case 'sniff':
        m.timer -= dt;
        if (m.timer <= 0) m.state = m.resume;
        break;
      case 'travel': case 'home': case 'dazed': {
        // along the tunnels, a leg at a time
        let move = (m.state === 'dazed' ? p.speed * 0.7 : p.speed) * dt;
        while (move > 0 && m.leg < m.path.length - 1) {
          const a = m.path[m.leg], b = m.path[m.leg + 1], l = len(a, b);
          const step = Math.min(move, l - m.along);
          m.along += step; move -= step;
          const [ax, ay] = NODES[a], [bx, by] = NODES[b];
          m.x = ax + (bx - ax) * (m.along / l); m.y = ay + (by - ay) * (m.along / l);
          if (bx !== ax) m.face = bx > ax ? 1 : -1;
          if (m.along >= l) {
            m.leg++; m.along = 0; m.node = b;
            // a sniff at a junction, which way to go (not on the way home dazed)
            if (m.state !== 'dazed' && JUNCTIONS.has(b) && m.leg < m.path.length - 1 && random() < 0.35) {
              m.resume = m.state; m.state = 'sniff'; m.timer = 0.12 + random() * 0.3;
              return;
            }
          }
        }
        if (m.leg >= m.path.length - 1) arrive(m, m.state);
        break;
      }
      case 'rising': case 'peeking': {
        const top = m.state === 'peeking' ? 0.28 : 1;
        m.rise = Math.min(top, m.rise + dt / RISE);
        m.timer -= dt;
        if (m.timer <= 0) {
          if (m.state === 'rising') events.push({ away: m.hole }); // it got away
          m.state = 'sinking';
        }
        break;
      }
      case 'sinking': case 'falling': {
        m.rise = Math.max(0, m.rise - dt / (m.state === 'falling' ? RISE * 3 : RISE));
        if (m.rise <= 0) {
          reserved.delete(m.hole);
          const dazed = m.state === 'falling';
          m.hole = -1; m.gold = false;
          if (dazed) go(m, m.x < W / 2 ? 'b1' : 'b2', 'dazed');
          else setOff(m, over || random() < 0.1);
        }
        break;
      }
    }
  }

  function step(dt) {
    if (over) { for (const m of moles) stepMole(m, dt); return; }
    clock += dt;
    if (!frenzy && clock >= ROUND - FRENZY) { frenzy = true; events.push('frenzy'); }
    const want = pace(f(), frenzy).moles;
    moles.forEach((m, i) => { if (i < want) m.active = true; });
    for (const m of moles) stepMole(m, dt);
    if (clock >= ROUND) {
      over = true;
      events.push('over');
      for (const m of moles) if (m.state === 'rising' || m.state === 'peeking') m.state = 'sinking';
    }
  }

  // The mallet coming down at x, y: on a hole (near enough) with a mole up in it, that's a bonk.
  function swing(x, y) {
    if (over || y > 30 || y < -150) return null;
    const hole = HOLES.findIndex(h => Math.abs(x - h) <= REACH);
    if (hole < 0) return null;
    swings++;
    const m = moles.find(m => m.hole === hole && m.state === 'rising' && m.rise > 0.4);
    if (!m) {
      run = 0; score = Math.max(0, score - MISS);
      const peeking = moles.some(m => m.hole === hole && m.state === 'peeking');
      events.push({ miss: hole, peeking });
      return { hole, hit: false };
    }
    if (m.hat) {
      // the hat goes flying, and the mole stays up a moment longer, surprised
      m.hat = false; m.wasHat = true; m.timer += 0.35;
      events.push({ hat: hole });
      return { hole, hit: true, hat: true };
    }
    const kind = m.gold ? 'gold' : m.wasHat ? 'hat' : 'mole';
    const points = POINTS[kind];
    bonks++; run++;
    score += points;
    const bonus = run % RUN.every === 0;
    if (bonus) score += RUN.bonus;
    m.state = 'falling'; m.stars = 2.4; m.wasHat = false;
    events.push({ bonk: hole, kind, points, run: bonus });
    return { hole, hit: true, kind, points };
  }

  return {
    step,
    swing,
    moles,
    get clock() { return clock; },
    get left() { return Math.max(0, ROUND - clock); },
    get frenzy() { return frenzy; },
    get over() { return over; },
    get score() { return score; },
    get run() { return run; },
    get bonks() { return bonks; },
    get swings() { return swings; },
    // what's happened since the last look: { pop, gold, hat }, { peek }, { bonk, kind, points, run }, { hat }, { miss, peeking },
    // { away }, 'frenzy', 'over'
    take() { const e = events; events = []; return e; },
  };
}

export const ticketsFor = score => Math.floor(score / 15);
