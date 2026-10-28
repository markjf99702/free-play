// Topple's machine: a coin pusher, seen from above, in a matter-js world (the library is passed in, so node can run it
// too: test/topple.unit.test.mjs). Nothing here draws; js/draw.js puts it in perspective.
//
// Units are millimetres. x runs across the machine (0 to DECK.W), z from the back wall (0) to the front edge (DECK.D),
// which is matter's y. There's no gravity in this world: coins lie flat and slide, and the deck's drag stops them.
//
// Two levels, the way a real pusher is built. The pusher is a long block that slides back and forth under the back
// wall. Its top is the shelf: coins dropped from the chute land on it and ride with it, and as it slides back the wall
// holds them, so the ones at the front are scraped off its lip onto the deck below. Its front face pushes the deck's
// coins towards the front edge: whatever goes over is won, and whatever goes off a side, past the end of the side
// walls, goes to the house.
// Along the back wall is a row of pockets. Now and then the lights chase along them and stop on one, which stays lit
// for a moment: a coin dropped through it brings a shower of coins down onto the shelf.

export const DECK = { W: 300, D: 250, gutter: 90 };          // side walls stop `gutter` short of the front edge
export const PUSHER = { near: 46, far: 110, height: 20, period: 3.4 }; // where its lip goes, and how long a push takes
export const COIN = { r: 10, thick: 3 };
export const CHUTE = { z: 14, height: 118, reload: 0.3, fall: 0.24 };  // the drop: where it lands, from how high
export const POCKETS = 7;                                      // along the back wall
const STEP = 1000 / 60;
const LIGHTS = { idle: [8, 15], chase: 1.3, open: 1.6 };       // seconds
const SHOWER = { coins: 8, gold: 0.4, every: 0.12 };
const DRAG = { deck: 0.2, shelf: 0.8 };                        // how fast a sliding coin stops, on the deck and on the shelf

// What can be on the deck besides coins: a gold coin (worth ten) and a prize, which goes on the arcade's shelf.
export const PRIZE = { w: 40, h: 26 };

// What a coin over the front edge pays, in tickets: one for every two silver coins, and ten for a gold one. `odd` is
// the silver coin already over and waiting for the next to make a ticket (0 or 1); the page keeps it between visits.
export const PAYS = { coins: 2, gold: 10 };
export function edgePays(kind, odd = 0) {
  if (kind === 'gold') return { tickets: PAYS.gold, odd };
  const n = odd + 1;
  return { tickets: Math.floor(n / PAYS.coins), odd: n % PAYS.coins };
}

export function createMachine(Matter, { random = Math.random, field = null, prizes = ['watch'] } = {}) {
  const { Engine, Bodies, Body, Composite } = Matter;
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 }, positionIterations: 10, velocityIterations: 8 });
  const world = engine.world;
  // what touches what: deck coins the pusher's face, shelf coins the back wall, and everything the side walls
  const WALL = 0x1, ON_DECK = 0x2, ON_SHELF = 0x4, FACE = 0x8, BACK = 0x10;
  const filters = {
    deck: { category: ON_DECK, mask: ON_DECK | WALL | FACE, group: 0 },
    shelf: { category: ON_SHELF, mask: ON_SHELF | WALL | BACK, group: 0 },
  };

  const wall = (x, y, w, h, category, mask) => Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.1, collisionFilter: { category, mask, group: 0 } });
  const sideLength = DECK.D - DECK.gutter + 200;
  Composite.add(world, [
    wall(-20, (DECK.D - DECK.gutter) - sideLength / 2, 40, sideLength, WALL, ON_DECK | ON_SHELF),
    wall(DECK.W + 20, (DECK.D - DECK.gutter) - sideLength / 2, 40, sideLength, WALL, ON_DECK | ON_SHELF),
    wall(DECK.W / 2, -20, DECK.W + 80, 40, BACK, ON_SHELF),
  ]);
  // The pusher's face: a long block whose front is the lip. Only deck coins touch it; shelf coins ride on top.
  const LONG = 400;
  const face = Bodies.rectangle(DECK.W / 2, PUSHER.near - LONG / 2, DECK.W + 80, LONG, { isStatic: true, friction: 0.05, collisionFilter: { category: FACE, mask: ON_DECK, group: 0 } });
  Composite.add(world, face);

  let clock = 0;                       // seconds the machine has been running: the pusher's place in its stroke
  const lipAt = s => PUSHER.near + (PUSHER.far - PUSHER.near) * (1 - Math.cos((s / PUSHER.period) * Math.PI * 2)) / 2;
  let lip = lipAt(0);
  const place = () => Body.setPosition(face, { x: DECK.W / 2, y: lip - LONG / 2 }, true);

  const pieces = [];   // coins and the prize, on the shelf or the deck: matter bodies with .kind and .layer
  const dropping = []; // coins on their way down from the chute: { x, t, kind }
  const falling = [];  // pieces gone over an edge, for the picture: { x, z, kind, prize, edge: 'front'|'side', t }
  let events = [], fell = [], reload = 0;

  function setLayer(body, layer) {
    body.layer = layer;
    body.collisionFilter = { ...filters[layer] };
    body.frictionAir = layer === 'deck' ? DRAG.deck : 0;
  }
  function addCoin(x, z, layer, kind = 'coin') {
    const coin = Bodies.circle(x, z, COIN.r, { friction: 0.15, frictionStatic: 0.3, restitution: 0, inertia: Infinity, slop: 0.03 });
    coin.kind = kind;
    coin.h = 0; // how far above where it's resting it still is, falling (for the picture)
    setLayer(coin, layer);
    pieces.push(coin);
    Composite.add(world, coin);
    return coin;
  }
  function addPrize(id, x, z, layer, angle = 0) {
    const prize = Bodies.rectangle(x, z, PRIZE.w, PRIZE.h, { chamfer: { radius: 7 }, friction: 0.2, restitution: 0, density: 0.0016, angle });
    prize.kind = 'prize'; prize.prize = id; prize.h = 0;
    setLayer(prize, layer);
    pieces.push(prize);
    Composite.add(world, prize);
    return prize;
  }
  function remove(piece) {
    Composite.remove(world, piece);
    pieces.splice(pieces.indexOf(piece), 1);
  }

  // The bonus lights along the back wall: idle, chasing along the pockets, or stopped on one, open for a coin.
  const lights = { state: 'idle', at: 3, t: 0, wait: LIGHTS.idle[0] + random() * (LIGHTS.idle[1] - LIGHTS.idle[0]), stop: 0 };
  let shower = [];     // coins still to come down in a bonus shower: [{ x, kind, at }]
  const pocketOf = x => Math.max(0, Math.min(POCKETS - 1, Math.floor((x / DECK.W) * POCKETS)));

  // ---------- the field ----------
  // A machine that's been running a while: the deck packed from the pusher to the front, the shelf full, a couple of
  // gold coins and a prize waiting. Settled by running it, and whatever falls off while it settles doesn't count.
  function stock() {
    const rows = (z0, z1, layer) => {
      for (let z = z0, row = 0; z < z1; z += COIN.r * 1.76, row++) {
        for (let x = COIN.r + 1 + (row % 2 ? COIN.r : 0); x < DECK.W - COIN.r; x += COIN.r * 2.04) {
          if (random() < 0.9) addCoin(x + (random() - 0.5) * 2, z + (random() - 0.5) * 2, layer);
        }
      }
    };
    clock = PUSHER.period / 2; lip = lipAt(clock); place(); // pushed all the way out
    rows(PUSHER.far + COIN.r + 1, DECK.D - COIN.r * 1.4, 'deck');
    rows(COIN.r + 1, PUSHER.far - COIN.r, 'shelf');
    const deck = pieces.filter(p => p.layer === 'deck');
    for (let i = 0; i < 2; i++) deck[Math.floor(random() * deck.length)].kind = 'gold';
    addPrize(prizes[0], 80 + random() * 140, 60, 'shelf', (random() - 0.5) * 0.6);
    for (let i = 0; i < 60 * 9; i++) tick(false);
    falling.length = 0; events = []; fell = [];
  }

  // From what save() kept: every piece where it was, and the pusher where it was in its stroke.
  function restore(f) {
    clock = Number(f.clock) || 0; lip = lipAt(clock); place();
    for (const [x, z, layer, kind] of f.coins.filter(inPlay)) addCoin(x, z, layer === 1 ? 'shelf' : 'deck', kind === 1 ? 'gold' : 'coin');
    if (f.prize) addPrize(f.prize.id, f.prize.x, f.prize.z, f.prize.layer === 1 ? 'shelf' : 'deck', f.prize.angle);
  }
  // A kept coin is still on the machine by the same rule a step uses to say one has gone over an edge: up to the
  // front edge itself, and out in the gutters past the ends of the side walls. (Coins hang there all the time, so a
  // stricter rule threw away the whole deck and stocked a fresh one.) A save with too few of those is ignored.
  const inPlay = c => Array.isArray(c) && c.length >= 3 && c.slice(0, 2).every(Number.isFinite)
    && c[1] > 0 && c[1] <= DECK.D && c[0] >= -2 && c[0] <= DECK.W + 2 && (c[1] > DECK.D - DECK.gutter - COIN.r || (c[0] > 0 && c[0] < DECK.W));
  const usable = f => f && Array.isArray(f.coins) && f.coins.length < 400 && f.coins.filter(inPlay).length > 40
    && (!f.prize || (typeof f.prize.id === 'string' && [f.prize.x, f.prize.z].every(Number.isFinite)));
  if (usable(field)) {
    restore(field);
    // a deck kept in the moment after its prize went over, before the attendant put the next one on, gets one now
    if (!pieces.some(p => p.kind === 'prize')) restock(prizes[0]);
  } else stock();

  // ---------- a step ----------
  function tick(live = true) {
    const dt = 1 / 60;
    clock += dt;
    lip = lipAt(clock);
    place();
    const vp = face.velocity.y;
    for (const p of pieces) {
      if (p.layer === 'shelf') {
        // the shelf carries what's on it: whatever it's sliding at, it's dragged towards the shelf's own speed
        const v = p.velocity;
        Body.setVelocity(p, { x: v.x * (1 - DRAG.shelf), y: vp + (v.y - vp) * (1 - DRAG.shelf) });
      }
      if (p.h > 0) p.h = Math.max(0, p.h - dt * 160);
    }
    Engine.update(engine, STEP);

    for (const p of [...pieces]) {
      const { x, y: z } = p.position;
      // off the shelf's lip, down onto the deck
      if (p.layer === 'shelf' && z > lip + 1) {
        setLayer(p, 'deck');
        p.h = PUSHER.height;
        if (live) events.push('scrape');
      }
      // over the front edge (won), or off a side past the walls (the house's)
      const edge = z > DECK.D ? 'front' : (x < -2 || x > DECK.W + 2) && z > DECK.D - DECK.gutter - COIN.r ? 'side' : null;
      if (edge) {
        remove(p);
        const f = { x, z, kind: p.kind, prize: p.prize, edge, t: 0 };
        falling.push(f);
        if (live) { fell.push(f); events.push(`${edge === 'front' ? 'won' : 'lost'}:${p.kind}${p.prize ? ':' + p.prize : ''}`); }
      }
    }
    for (const f of falling) f.t += dt;
    while (falling.length && falling[0].t > 1.2) falling.shift();
    if (!live) return;

    // coins on their way down from the chute land on the shelf
    for (const d of dropping) d.t += dt;
    while (dropping.length && dropping[0].t >= CHUTE.fall) {
      const d = dropping.shift();
      addCoin(d.x, CHUTE.z, 'shelf', d.kind);
      events.push('land');
    }
    reload = Math.max(0, reload - 1);
    lightsStep(dt);
    // a bonus shower, a coin at a time
    for (const s of shower) s.at -= dt;
    while (shower.length && shower[0].at <= 0) { const s = shower.shift(); dropping.push({ x: s.x, t: 0, kind: s.kind, shower: true }); }
  }

  function lightsStep(dt) {
    lights.t += dt;
    if (lights.state === 'idle' && lights.t > lights.wait) {
      lights.state = 'chase'; lights.t = 0; lights.stop = Math.floor(random() * POCKETS);
      events.push('chase');
    } else if (lights.state === 'chase') {
      // hops along the pockets, slowing, to stop on the one it picked
      const left = Math.max(0, LIGHTS.chase - lights.t), hops = Math.round(left * left * 9);
      lights.at = ((lights.stop - hops) % POCKETS + POCKETS) % POCKETS;
      if (lights.t > LIGHTS.chase) { lights.state = 'open'; lights.t = 0; lights.at = lights.stop; events.push('open'); }
    } else if (lights.state === 'open' && lights.t > LIGHTS.open) {
      lights.state = 'idle'; lights.t = 0;
      lights.wait = LIGHTS.idle[0] + random() * (LIGHTS.idle[1] - LIGHTS.idle[0]);
    }
  }

  // A coin from the chute at x. False while the chute's still reloading.
  function drop(x) {
    if (reload > 0) return false;
    x = Math.max(COIN.r + 2, Math.min(DECK.W - COIN.r - 2, x));
    reload = Math.round(CHUTE.reload * 60); // in steps
    dropping.push({ x, t: 0, kind: 'coin' });
    events.push('drop');
    if (lights.state === 'open' && pocketOf(x) === lights.at) {
      // through the lit pocket: the bonus, a shower of coins (and maybe a gold one) across the shelf
      lights.state = 'idle'; lights.t = 0; lights.wait = LIGHTS.idle[0] + random() * (LIGHTS.idle[1] - LIGHTS.idle[0]);
      const gold = random() < SHOWER.gold ? Math.floor(random() * SHOWER.coins) : -1;
      shower = Array.from({ length: SHOWER.coins }, (_, i) => ({ x: 20 + random() * (DECK.W - 40), kind: i === gold ? 'gold' : 'coin', at: 0.5 + i * SHOWER.every }));
      events.push('bonus');
    }
    return true;
  }

  // A new prize, put on the shelf by the attendant once the last one's gone.
  function restock(id) {
    if (pieces.some(p => p.kind === 'prize')) return;
    addPrize(id, 60 + random() * (DECK.W - 120), 24, 'shelf', (random() - 0.5) * 0.6);
  }

  // What to keep between visits: every piece on the shelf and the deck, and where the pusher is. Coins still on their
  // way down from the chute, and a shower still to come, are kept as landed on the shelf under the chute.
  function save() {
    const r = n => Math.round(n * 10) / 10;
    const prize = pieces.find(p => p.kind === 'prize');
    const coming = [...dropping, ...shower].map(d => [r(d.x), CHUTE.z, 1, d.kind === 'gold' ? 1 : 0]);
    return {
      clock: r(clock % PUSHER.period),
      coins: [...pieces.filter(p => p.kind !== 'prize').map(p => [r(p.position.x), r(p.position.y), p.layer === 'shelf' ? 1 : 0, p.kind === 'gold' ? 1 : 0]), ...coming],
      prize: prize ? { id: prize.prize, x: r(prize.position.x), z: r(prize.position.y), layer: prize.layer === 'shelf' ? 1 : 0, angle: r(prize.angle) } : null,
    };
  }

  return {
    step: () => tick(true),
    drop,
    restock,
    save,
    get lip() { return lip; },
    get pieces() { return pieces; },
    get dropping() { return dropping; },
    get falling() { return falling; },
    get lights() { return lights; },
    get showering() { return shower.length > 0 || dropping.some(d => d.shower); },
    get ready() { return reload === 0; },
    pocketOf,
    // what's happened since the last look: 'drop', 'land', 'scrape', 'chase', 'open', 'bonus',
    // 'won:coin', 'won:gold', 'won:prize:<id>', 'lost:…'
    take() { const e = events; events = []; return e; },
    // what's gone over an edge since the last look: { x, z, kind, prize, edge: 'front' or 'side' }
    takeFalls() { const f = fell; fell = []; return f; },
  };
}
