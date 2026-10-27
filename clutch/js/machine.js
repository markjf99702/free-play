// Clutch's machine: the glass box, the heap of plush, and the claw, in a matter-js world (the library is passed in,
// so node can run it too: test/clutch.unit.test.mjs). Nothing here draws; js/draw.js does that from what's in here.
//
// Units are millimetres, y down. The box is 600 wide and 760 deep. The chute is the front-left corner, behind a clear
// wall: the claw starts above it, and anything dropped in falls through the floor there and out of the prize door.
//
// A go: the claw slides right while the button's held (move), drops when it's let go (drop) until it comes to rest
// on the heap, the way a claw on a cable goes slack, closes its two arms (close), lifts (lift), carries what it holds
// back over the chute (carry), opens (release) and waits a moment for anything to fall (settle). Let go before it's
// clear of the chute's wall (a tap on the button, say), and it slides back home instead (home): that's not a go, since
// nothing dropped on from there can win.
// The machine moves the claw and its arms itself, and matter-js pushes the plush out of their way. Plush doesn't squash
// here the way it does in a real machine, so the grab itself is judged when the arms close: how squarely the plush sits
// between them, and whether the hooks closed under its middle or only round its sides. A plush that's caught then hangs
// from the claw (on a little give, so it sways) and may slip off on the way to the chute: a good grab rarely does,
// a poor one usually does, and wherever it drops, it falls for real.

export const BOX = { W: 600, H: 760, floor: 700, chute: { x0: 16, x1: 140 }, guard: { x: 150, top: 440 } };
export const HOME = { x: 78, y: 110 };
const ARM = { pivot: 20, drop: 12, shaft: 118, tip: 34, thick: 12 };
const OPEN = 0.52, SHUT = -0.22;          // arm angles, radians: splayed out, and past straight so the hooks meet
const SPEED = { move: 170, drop: 240, lift: 150, carry: 210, close: 1.1 }; // mm/s, and radians/s for the arms
const CLEAR = 20;                         // mm past the chute's wall the claw has to be for letting go to drop it
const REST = 4;                           // how hard (mm of give) the claw presses on the heap before it's resting on it
const EASE = [0.06, 0.14];                // how far the arms ease open on the way up, radians (somewhere in this range)
// How likely a caught plush is to slip off each second on the way up: SLIP.base for a perfect grab, rising steeply
// with how far short of perfect the grab was. grip runs 0 (barely) to 1 (squarely, hooks under its middle).
const SLIP = { base: 0.04, poor: 6 };
const WEAK = { chance: 0.3, grip: 0.7 };  // now and then the claw just doesn't grip as hard, the way real ones are set
const STEP = 1000 / 60;
const DEEPEST = BOX.floor - ARM.drop - ARM.shaft - 8; // as low as the hub goes, hooks just off the floor

// The plush, each a cluster of circles (cx, cy, r in mm, about its middle). draw.js gives each its face.
export const KINDS = {
  bear: { name: 'Bear', parts: [[0, 16, 36], [0, -30, 27], [-19, -52, 10], [19, -52, 10]] },
  chick: { name: 'Chick', parts: [[0, 10, 38], [16, -30, 23]] },
  frog: { name: 'Frog', parts: [[-17, 4, 29], [17, 4, 29], [-18, -24, 11], [18, -24, 11]] },
  ghost: { name: 'Ghost', parts: [[0, -8, 36], [-25, 26, 11], [0, 31, 11], [25, 26, 11]] },
  penguin: { name: 'Penguin', parts: [[0, 14, 30], [0, -26, 25]] },
  alien: { name: 'Alien', parts: [[0, -10, 33], [0, 30, 21]] },
  star: { name: 'Lucky star', parts: [[0, 0, 34]], rare: true },
};
const COMMON = ['bear', 'chick', 'frog', 'ghost', 'penguin', 'alien'];

export function createMachine(Matter, { random = Math.random, plush = 14 } = {}) {
  const { Engine, Bodies, Body, Composite, Query, Constraint } = Matter;
  const engine = Engine.create({ gravity: { x: 0, y: 1.6 }, positionIterations: 12, velocityIterations: 10, constraintIterations: 6 });
  const world = engine.world;
  const CLAW = -1; // the claw's parts never collide with each other

  // The box: floor (with the chute's hole), walls, ceiling, and the clear guard round the chute.
  const wall = (x, y, w, h, label) => Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.8, label });
  const floor = wall((BOX.chute.x1 + BOX.W) / 2, BOX.floor + 100, BOX.W - BOX.chute.x1, 200, 'floor'); // thick, so nothing's pushed through
  Composite.add(world, [
    floor,
    wall(-20, BOX.H / 2, 40, BOX.H * 2, 'wall'), wall(BOX.W + 20, BOX.H / 2, 40, BOX.H * 2, 'wall'),
    wall(BOX.W / 2, -20, BOX.W, 40, 'ceiling'),
    wall(BOX.guard.x, (BOX.guard.top + BOX.floor) / 2, 10, BOX.floor - BOX.guard.top, 'guard'),
  ]);

  // The claw: a hub on the cable and two arms, each a shaft with a hook at the bottom pointing in.
  const hub = Bodies.rectangle(HOME.x, HOME.y, 64, 26, { isStatic: true, collisionFilter: { group: CLAW }, label: 'hub' });
  const arms = [-1, 1].map(side => {
    const px = HOME.x + side * ARM.pivot, py = HOME.y + ARM.drop;
    const shaft = Bodies.rectangle(px, py + ARM.shaft / 2, ARM.thick, ARM.shaft, { label: 'arm' });
    const tip = Bodies.rectangle(px - side * (ARM.tip / 2 - ARM.thick / 2), py + ARM.shaft - ARM.thick / 2, ARM.tip, ARM.thick, { label: 'hook' });
    const arm = Body.create({ parts: [shaft, tip], isStatic: true, friction: 0.9, frictionStatic: 1.2, collisionFilter: { group: CLAW } });
    // where the arm's pivot sits relative to its middle, with the arm hanging straight down
    arm.pivot = { x: px - arm.position.x, y: py - arm.position.y };
    arm.side = side;
    return arm;
  });
  Composite.add(world, [hub, ...arms]);

  // claw.angles: how far each arm is swung out (radians); the left one opens anticlockwise, the right one clockwise.
  // claw.shut: how far in each arm closes this go (SHUT, unless it meets a plush first).
  const claw = { x: HOME.x, y: HOME.y, angles: [OPEN, OPEN], shut: [SHUT, SHUT] };
  const toys = []; // the plush in the box: matter bodies with .kind and .tone
  let state = 'ready', t = 0, ease = 1, won = [], events = [], restock = 0, steps = 0;

  // Puts the hub and arms where claw says, moving them there (so whatever they push moves the right way).
  function pose() {
    Body.setPosition(hub, { x: claw.x, y: claw.y }, true);
    arms.forEach((arm, i) => {
      const a = claw.angles[i] * -arm.side, c = Math.cos(a), s = Math.sin(a);
      const piv = { x: claw.x + arm.side * ARM.pivot, y: claw.y + ARM.drop };
      Body.setAngle(arm, a, true);
      Body.setPosition(arm, { x: piv.x - (arm.pivot.x * c - arm.pivot.y * s), y: piv.y - (arm.pivot.x * s + arm.pivot.y * c) }, true);
    });
  }
  pose();

  function addToy(kind, x, y) {
    const k = KINDS[kind], scale = 0.92 + random() * 0.16;
    const parts = k.parts.map(([cx, cy, r]) => Bodies.circle(x + cx * scale, y + cy * scale, r * scale, { label: 'plush' }));
    const toy = Body.create({ parts, friction: 0.85, frictionStatic: 1.1, restitution: 0.02, frictionAir: 0.025, label: 'toy' });
    Body.setDensity(toy, 0.0011);
    Body.setAngle(toy, (random() - 0.5) * 1.2);
    toy.kind = kind; toy.scale = scale; toy.tone = random();
    toys.push(toy);
    Composite.add(world, toy);
    return toy;
  }

  // Fills the heap: plush dropped in one at a time from up top, mostly the common ones, now and then a lucky star.
  function fill(n, settle) {
    for (let i = 0; i < n; i++) {
      const kind = random() < 0.06 ? 'star' : COMMON[Math.floor(random() * COMMON.length)];
      addToy(kind, 210 + random() * 340, 200);
      for (let k = 0; k < settle; k++) { pose(); Engine.update(engine, STEP); }
    }
  }
  fill(plush, 26);
  for (let i = 0; i < 240; i++) { pose(); Engine.update(engine, STEP); } // let it settle before anyone looks

  // How hard the claw is pressing on what's under it: the deepest overlap of its arms, or of the hub, with a plush or the floor.
  const pressing = () => Math.max(0, ...arms.flatMap(part => Query.collides(part, [...toys, floor]).map(c => c.depth)));
  const pressingHub = () => Math.max(0, ...Query.collides(hub, [...toys, floor]).map(c => c.depth));

  // The plush the claw has hold of (if any), how well, and the line it hangs on.
  let held = null, line = null, gripped = 0;
  // How well the claw holds the plush between its arms when they close: 0 to 1, or 0 for nothing there.
  function judge(toy) {
    const dx = toy.position.x - claw.x;
    const hooks = claw.y + ARM.drop + ARM.shaft;          // where the hooks are
    const r = KINDS[toy.kind].parts[0][2] * toy.scale;    // the plush's main round, near enough its belly
    const centred = (1 - Math.min(1, Math.abs(dx) / 30)) ** 1.2;
    const under = Math.max(0, Math.min(1, (hooks - toy.position.y) / (r * 1.1))); // hooks closed under its middle?
    const between = toy.position.y > claw.y + 10 && toy.position.y < hooks + 6;
    return between ? centred * (0.25 + 0.75 * under) : 0;
  }
  // As the arms start to close: the plush they'll catch (if any), and how far each arm swings before its hook meets it.
  function grab() {
    let best = null, q = 0;
    for (const toy of toys) { const g = judge(toy); if (g > q) { q = g; best = toy; } }
    claw.shut = [SHUT, SHUT];
    if (!best || q < 0.15) return;
    held = best; gripped = q * (0.85 + random() * 0.25) * (random() < WEAK.chance ? WEAK.grip : 1);
    held.collisionFilter.group = CLAW; // it rides between the arms now, so it doesn't fight them
    line = Constraint.create({ bodyA: hub, pointA: { x: held.position.x - claw.x, y: held.position.y - claw.y }, bodyB: held, length: 0, stiffness: 0.08, damping: 0.08 });
    Composite.add(world, line);
    // each arm closes until its hook is well into the plush's middle, squeezing into the stuffing the way a real one does
    const keep = [...claw.angles];
    const r = KINDS[held.kind].parts[0][2] * held.scale;
    arms.forEach((arm, i) => {
      const reach = held.position.x - arm.side * r * 0.45; // where the hook's inner end stops, short of the far side
      for (let a = keep[i]; a > SHUT; a -= 0.01) {
        claw.angles[i] = a; pose();
        const inner = arm.side < 0 ? Math.max(...arm.parts[2].vertices.map(v => v.x)) : Math.min(...arm.parts[2].vertices.map(v => v.x));
        if (arm.side < 0 ? inner >= reach : inner <= reach) { claw.shut[i] = a; break; }
      }
      claw.angles[i] = keep[i];
    });
    pose();
  }
  function letGo() {
    if (!held) return;
    Composite.remove(world, line);
    held.clearing = true; // it goes back to bumping into the claw once it's fallen clear of the arms, not while inside them
    events.push('slip');
    held = null; line = null;
  }

  // A caught plush may slip off on the way: each moment a little likelier, the poorer the grab.
  function slipping(dt) {
    if (!held) return;
    const hazard = SLIP.base + SLIP.poor * (1 - gripped) ** 3;
    if (random() < hazard * dt) letGo();
  }

  // One step of 1/60 s. holding: whether the button is down.
  function step(holding) {
    const dt = 1 / 60;
    t += dt;
    switch (state) {
      case 'ready':
        if (holding) { state = 'move'; events.push('start'); }
        break;
      case 'move':
        if (holding && claw.x < BOX.W - 46) claw.x = Math.min(BOX.W - 46, claw.x + SPEED.move * dt);
        else if (claw.x < BOX.guard.x + CLEAR) { state = 'home'; t = 0; events.push('short'); }
        else { state = 'drop'; t = 0; events.push('drop'); }
        break;
      case 'home':
        // let go too soon: back over the chute, and ready for a proper go
        claw.x = Math.max(HOME.x, claw.x - SPEED.carry * dt);
        if (claw.x <= HOME.x) { state = 'ready'; t = 0; events.push('ready'); }
        break;
      case 'drop': {
        // down until it's resting on something (what it only brushes, it pushes aside), or as low as it goes
        const was = claw.y;
        claw.y = Math.min(DEEPEST, claw.y + SPEED.drop * dt);
        pose();
        if (pressingHub() > REST || pressing() > REST * 3) claw.y = was; // resting on it, or wedged
        if (claw.y === was || claw.y >= DEEPEST) { state = 'close'; t = 0; grab(); events.push('close'); }
        break;
      }
      case 'close':
        // the arms swing in, pushing the heap aside, until their hooks meet what they're closing on (or each other)
        claw.angles = claw.angles.map((a, i) => Math.max(claw.shut[i], a - SPEED.close * dt));
        if (claw.angles.every((a, i) => a <= claw.shut[i]) && t > 0.2) {
          state = 'lift'; t = 0; events.push('lift');
          ease = EASE[0] + random() * (EASE[1] - EASE[0]); // the grip it keeps on the way up is never quite what it closed with
        }
        break;
      case 'lift':
        if (t > 0.25) claw.y = Math.max(HOME.y, claw.y - SPEED.lift * dt);
        if (t < 0.6) claw.angles = claw.angles.map(a => a + ease * dt / 0.6); // easing open a little
        slipping(dt);
        if (claw.y <= HOME.y) { state = 'carry'; t = 0; }
        break;
      case 'carry':
        claw.x = Math.max(HOME.x, claw.x - SPEED.carry * dt);
        slipping(dt);
        if (claw.x <= HOME.x) { state = 'release'; t = 0; events.push('release'); }
        break;
      case 'release':
        if (held) { letGo(); events.pop(); events.push('let-go'); } // over the chute: opens and lets it fall in
        claw.angles = claw.angles.map(a => Math.min(OPEN, a + SPEED.close * 1.6 * dt));
        if (t > 0.6) { state = 'settle'; t = 0; }
        break;
      case 'settle':
        // ready again once anything dropped in the chute is through it
        if (t > 0.8 && (t > 3 || !toys.some(toy => toy.position.x < BOX.guard.x))) { state = 'ready'; t = 0; events.push('ready'); }
        break;
    }
    pose();
    Engine.update(engine, STEP);

    for (const toy of toys) {
      if (toy.clearing && !arms.some(arm => Query.collides(arm, [toy]).length)) { toy.clearing = false; toy.collisionFilter.group = 0; }
    }
    // anything through the chute's hole is won; anything that's somehow got out anywhere else goes back on the heap
    for (let i = toys.length - 1; i >= 0; i--) {
      const toy = toys[i];
      if (toy.position.y < BOX.floor + 70) continue;
      if (toy.position.x < BOX.guard.x) {
        Composite.remove(world, toy);
        toys.splice(i, 1);
        won.push({ kind: toy.kind, tone: toy.tone });
        events.push('won:' + toy.kind);
      } else {
        Body.setPosition(toy, { x: 300 + random() * 200, y: 160 });
        Body.setVelocity(toy, { x: 0, y: 0 });
      }
    }
    // a heap running low gets topped up between goes, the way the attendant would: a few more, one at a time
    if (state === 'ready' && toys.length < 9 && !restock) restock = 5;
    if (restock && ++steps % 20 === 0) { fill(1, 0); restock--; }
  }

  return {
    step,
    get state() { return state; },
    get claw() { return claw; },
    get held() { return held; },
    get toys() { return toys; },
    arms, hub,
    // what's happened since the last look: 'start', 'short' (let go too soon: no go), 'drop', 'close', 'lift',
    // 'release', 'let-go', 'slip', 'ready', 'won:<kind>'
    take() { const e = events; events = []; return e; },
    // the plush won since the last look, { kind, tone } each
    takeWon() { const w = won; won = []; return w; },
  };
}
