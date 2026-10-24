// Hoops' court: the balls, the hoop and the round. Plain rules with a clock that only moves when step() is called,
// so node can test it (test/hoops.unit.test.mjs); js/draw.js draws it.
//
// A basketball machine from the ticket floor: a ramp inside a net cage, a backboard at the far end, and four balls
// that roll back down the ramp to a pocket at your end. Flick the one in the pocket up at the hoop: it flies, clanks
// off the rim or the board or drops through the net, and rolls back down for another go. Forty-five seconds a
// round. Twenty seconds in, the hoop starts to slide from side to side, and in the last ten a basket is worth 3.
// One of the balls is gold, and worth double. Three in a row set the rim alight: one more a basket till you miss.
// Units are centimetres and seconds. x runs across (right is +), y up, z away from you.

export const R = 9;                                   // a ball's radius
export const G = 981;
export const BALLS = 4;
export const ROUND = 45;                              // seconds
export const SLIDE = 25;                              // the last 25 of them, the hoop slides
export const BONUS = 10;                              // the last 10, a basket is worth 3
export const FIRE = 3;                                // baskets in a row to set the rim alight
export const CAGE = { half: 80, roof: 228, front: -14, lip: 12, back: 262 };
export const HOOP = { y: 120, z: 232, r: 22, tube: 1.2, net: 36, low: 13, slide: 22 }; // r: the ring to the middle of the tube
export const BOARD = { z: 259, half: 40, y0: 106, y1: 168 };
export const RAMP = { z0: 10, pocket: 0.05, slope: 0.206, vee: 0.16, chute: 64 }; // the pocket, then the ramp up to the board, and a V across
export const LAUNCH = { x: 0, y: 26, z: -4, angle: 58 * Math.PI / 180 };

const E = { rim: 0.4, board: 0.6, back: 0.5, net: 0.25, floor: 0.38, ball: 0.6 };

// The ramp's surface: a V across it, so the balls run down to the middle, steeper up by the board than in the pocket.
// It's the highest of four planes, so a ball only has to stay above each of them.
export const floorY = (x, z) => Math.max(RAMP.pocket * (z - RAMP.z0), RAMP.slope * (z - RAMP.z0)) + RAMP.vee * Math.abs(x);
const FLOORS = [];
for (const a of [RAMP.pocket, RAMP.slope]) for (const s of [1, -1]) {
  const l = Math.hypot(RAMP.vee, 1, a);
  FLOORS.push({ x: -RAMP.vee * s / l, y: 1 / l, z: -a / l });
}

// How hard to throw a ball from the pocket so it drops through the middle of a still hoop.
export const SWEET = (() => {
  const dz = HOOP.z - LAUNCH.z, dy = HOOP.y - LAUNCH.y, c = Math.cos(LAUNCH.angle);
  return Math.sqrt(G * dz * dz / (2 * c * c * (dz * Math.tan(LAUNCH.angle) - dy)));
})();

// How a flick becomes a throw. A flick's speed is measured in cabinet-heights a second up the screen, and a flick
// of `sweet` throws a touch harder than SWEET, into the middle of the speeds that go in (a little long still drops,
// off the board). Everyone flicks differently, so it's forgiving: the throw goes with how many times harder or
// softer the flick is, not how much, gently, and softer still more gently. Anything from about half the sweet flick
// to two-thirds as hard again throws in range; only well off either way goes short or long.
export const FLICK = { sweet: 2.4, min: 0.45, long: 1.05, soft: 0.12, hard: 0.12, most: 1.4 };
export const power = s => {
  const x = Math.log(s / FLICK.sweet);
  return SWEET * Math.min(FLICK.most, FLICK.long + x * (x < 0 ? FLICK.soft : FLICK.hard));
};
export const flickFor = v => {
  const k = v / SWEET - FLICK.long;
  return FLICK.sweet * Math.exp(k / (k < 0 ? FLICK.soft : FLICK.hard));
};

export function createCourt({ random = Math.random, timed = true } = {}) {
  let clock = 0, score = 0, streak = 0, fire = false, shots = 0, baskets = 0, swishes = 0;
  let sliding = false, bonus = false, buzzer = false, over = false, buzzedAt = 0;
  let events = [];
  const hoop = { x: 0, vx: 0, phase: 0, amp: 0, kick: 0, sway: 0 };

  // four balls, queued up the ramp from the pocket; the second one along is the gold one
  const balls = Array.from({ length: BALLS }, (_, i) => {
    const z = CAGE.front + R + 0.5 + i * (2 * R + 0.5);
    return {
      id: i, gold: i === 1, x: 0, y: floorY(0, z) + R / Math.cos(Math.atan(RAMP.vee)) + 0.1, z, vx: 0, vy: 0, vz: 0,
      roll: 0, spin: 0, shot: null, inNet: false, ground: false, heard: {},
    };
  });

  const left = () => Math.max(0, ROUND - clock);
  const noisy = (b, kind, speed, min) => {
    if (speed < min || (b.heard[kind] ?? -1) > clock - 0.08) return;
    b.heard[kind] = clock;
    events.push({ [kind]: Math.round(speed), ball: b.id });
  };

  // The hoop's slide: in from nothing over a couple of seconds, quicker in the last ten.
  const period = () => bonus ? 4.5 : 6;
  function moveHoop(h) {
    const want = sliding && !over ? HOOP.slide : 0;
    hoop.amp += (want - hoop.amp) * Math.min(1, h * (want ? 0.8 : 1.5));
    hoop.phase += h * 2 * Math.PI / period();
    const x = hoop.amp * Math.sin(hoop.phase);
    hoop.vx = (x - hoop.x) / h; hoop.x = x;
    hoop.kick = Math.max(0, hoop.kick - h * 2.2);
    hoop.sway += (hoop.vx * -0.004 - hoop.sway) * Math.min(1, h * 6);
  }

  // A ball against a plane through p with outward normal n, moving at w (the hoop and its board move across).
  function bounce(b, n, depth, e, rub, w = 0) {
    b.x += n.x * depth; b.y += n.y * depth; b.z += n.z * depth;
    const rx = b.vx - w, vn = rx * n.x + b.vy * n.y + b.vz * n.z;
    if (vn >= 0) return 0;
    const j = -(1 + e) * vn;
    let vx = rx + j * n.x, vy = b.vy + j * n.y, vz = b.vz + j * n.z;
    // a scuff along the surface
    const tn = vx * n.x + vy * n.y + vz * n.z;
    vx = n.x * tn + (vx - n.x * tn) * (1 - rub); vy = n.y * tn + (vy - n.y * tn) * (1 - rub); vz = n.z * tn + (vz - n.z * tn) * (1 - rub);
    b.vx = vx + w; b.vy = vy; b.vz = vz;
    return -vn;
  }

  function settle(b, h) {
    const wasY = b.y;
    b.vy -= G * h;
    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    b.ground = false;

    // the ramp
    for (const n of FLOORS) {
      const d = n.x * b.x + n.y * b.y + n.z * (b.z - RAMP.z0);
      if (d >= R) continue;
      const hit = bounce(b, n, R - d, 0, 0);
      if (hit > 40) { b.vx += n.x * hit * E.floor; b.vy += n.y * hit * E.floor; b.vz += n.z * hit * E.floor; noisy(b, 'thud', hit, 60); }
      b.ground = true;
    }
    if (b.ground) {
      const k = Math.max(0, 1 - 0.5 * h);
      b.vx *= k; b.vz *= k;
      // the last stretch is a groove down the middle, so they come back to the pocket one behind another
      if (b.z < RAMP.chute) b.vx -= (b.x * 500 + b.vx * 30) * h;
      if (b.shot) land(b);
    }
    // the cage: soft nets on the sides and the roof, the panel at the back, and the front of the machine below the pocket
    if (b.x - R < -CAGE.half) bounce(b, { x: 1, y: 0, z: 0 }, -CAGE.half - b.x + R, E.net, 0.2);
    if (b.x + R > CAGE.half) bounce(b, { x: -1, y: 0, z: 0 }, b.x + R - CAGE.half, E.net, 0.2);
    if (b.y + R > CAGE.roof) bounce(b, { x: 0, y: -1, z: 0 }, b.y + R - CAGE.roof, E.net, 0.2);
    if (b.z + R > CAGE.back) noisy(b, 'board', bounce(b, { x: 0, y: 0, z: -1 }, b.z + R - CAGE.back, E.back, 0.1), 40);
    if (b.z - R < CAGE.front && b.y < CAGE.lip) bounce(b, { x: 0, y: 0, z: 1 }, CAGE.front - b.z + R, 0.05, 0.3); // padded: a ball comes to rest against it
    // the backboard, sliding with the hoop
    if (b.z + R > BOARD.z && Math.abs(b.x - hoop.x) < BOARD.half + R * 0.5 && b.y > BOARD.y0 - R * 0.5 && b.y < BOARD.y1 + R * 0.5) {
      const hit = bounce(b, { x: 0, y: 0, z: -1 }, b.z + R - BOARD.z, E.board, 0.12, hoop.vx);
      if (hit > 20 && b.shot) b.shot.board = true;
      noisy(b, 'board', hit, 40);
    }
    // the rim: a ring of steel tube. The nearest point of it to the ball is straight out from the middle, toward the ball.
    const dx = b.x - hoop.x, dz = b.z - HOOP.z, rho = Math.hypot(dx, dz);
    if (rho > 0.001 && Math.abs(b.y - HOOP.y) < R + HOOP.tube + 1) {
      const qx = hoop.x + dx / rho * HOOP.r, qz = HOOP.z + dz / rho * HOOP.r;
      const nx = b.x - qx, ny = b.y - HOOP.y, nz = b.z - qz, d = Math.hypot(nx, ny, nz);
      if (d < R + HOOP.tube && d > 0.001) {
        const hit = bounce(b, { x: nx / d, y: ny / d, z: nz / d }, R + HOOP.tube - d, E.rim, 0.15, hoop.vx);
        if (hit > 15 && b.shot) b.shot.rim = true;
        noisy(b, 'rim', hit, 30);
      }
    }
    // through the hoop, going down: a basket (once a shot), and into the net, which slows it and lets it drop
    if (wasY >= HOOP.y && b.y < HOOP.y && b.vy < 0 && rho < HOOP.r - HOOP.tube) {
      b.inNet = true;
      hoop.kick = 1;
      if (b.shot && !b.shot.scored) basket(b);
    }
    if (b.inNet) {
      const down = (HOOP.y - b.y) / HOOP.net;
      if (down > 1.05 || down < -0.2) b.inNet = false;
      else {
        const lim = Math.max(0, HOOP.r + (HOOP.low - HOOP.r) * Math.max(0, down) - R * 0.55);
        const ex = b.x - hoop.x, ez = b.z - HOOP.z, er = Math.hypot(ex, ez);
        if (er > lim && er > 0.001) { b.x = hoop.x + ex / er * lim; b.z = HOOP.z + ez / er * lim; }
        const k = Math.min(1, h * 9);
        b.vx += (hoop.vx - b.vx) * k; b.vz -= b.vz * k;
        if (b.vy < -180) b.vy += (-180 - b.vy) * Math.min(1, h * 14);
      }
    }
    // out over the front of the machine: it's come back to you, and you drop it on the ramp
    if (b.z < CAGE.front - 4 && b.y >= CAGE.lip) {
      if (b.shot) land(b);
      Object.assign(b, { x: (random() - 0.5) * 30, z: 60, vx: 0, vy: 0, vz: 0 });
      b.y = floorY(b.x, b.z) + R + 4;
    }
    // how far it's rolled, for the picture
    const sp = Math.hypot(b.vx, b.vz);
    b.roll += (b.ground ? sp : b.spin) * h / R;
  }

  // Two balls knocking together.
  function knock(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, d = Math.hypot(dx, dy, dz);
    if (d >= 2 * R || d < 0.001) return;
    const nx = dx / d, ny = dy / d, nz = dz / d, push = (2 * R - d) / 2;
    a.x += nx * push; a.y += ny * push; a.z += nz * push;
    b.x -= nx * push; b.y -= ny * push; b.z -= nz * push;
    const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
    if (vn >= 0) return;
    const j = -(1 + E.ball) * vn / 2;
    a.vx += j * nx; a.vy += j * ny; a.vz += j * nz;
    b.vx -= j * nx; b.vy -= j * ny; b.vz -= j * nz;
    if (-vn > 60) events.push({ knock: Math.round(-vn) });
  }

  function basket(b) {
    const s = b.shot;
    s.scored = true;
    baskets++; streak++;
    const lit = fire;
    const base = bonus || buzzer ? 3 : 2;
    const points = (base + (lit ? 1 : 0)) * (b.gold ? 2 : 1);
    score += points;
    const swish = !s.rim && !s.board;
    if (swish) swishes++;
    events.push({ basket: b.id, points, swish, bank: s.board && !s.rim, gold: b.gold, fire: lit, buzzer: s.late });
    if (!fire && streak >= FIRE) { fire = true; events.push({ fire: true }); }
  }
  function land(b) {
    const s = b.shot;
    b.shot = null;
    if (s.scored) return;
    if (fire) events.push({ fire: false });
    streak = 0; fire = false;
    events.push({ miss: b.id });
  }

  // The ball in the pocket, if there's one there to throw: the front one of any down at your end of the groove,
  // even if it's still settling (or the next one along, just about to roll in).
  function pocket() {
    let best = null;
    for (const b of balls) {
      if (b.shot || b.z > RAMP.z0 + 6 || Math.abs(b.x) > 10 || b.y > floorY(b.x, b.z) + R + 10) continue;
      if (!best || b.z < best.z) best = b;
    }
    return best;
  }

  // The aim that would meet the hoop, thrown at this speed: where it'll have slid to by the time the ball gets there.
  function aimFor(speed) {
    const t = (HOOP.z - LAUNCH.z) / (speed * Math.cos(LAUNCH.angle));
    const x = hoop.amp * Math.sin(hoop.phase + t * 2 * Math.PI / period());
    return Math.atan2(x - LAUNCH.x, HOOP.z - LAUNCH.z);
  }

  // Throw the ball in the pocket: speed in cm/s, aim the angle off straight ahead (+ to the right).
  function shoot(speed, aim = 0) {
    if (over || buzzer) return null;
    const b = pocket();
    if (!b) return null;
    const a = Math.max(-0.5, Math.min(0.5, aim)), c = Math.cos(LAUNCH.angle);
    Object.assign(b, {
      x: LAUNCH.x, y: LAUNCH.y, z: LAUNCH.z, inNet: false,
      vx: speed * c * Math.sin(a), vy: speed * Math.sin(LAUNCH.angle), vz: speed * c * Math.cos(a), spin: -speed * 0.5,
    });
    b.shot = { at: clock, rim: false, board: false, scored: false, late: false };
    shots++;
    events.push({ shot: b.id });
    return b;
  }

  function sub(h) {
    if (timed && !buzzer) {
      clock = Math.min(ROUND, clock + h);
      if (!sliding && clock >= ROUND - SLIDE) { sliding = true; events.push('slide'); }
      if (!bonus && clock >= ROUND - BONUS) { bonus = true; events.push('bonus'); }
      if (clock >= ROUND) {
        buzzer = true; buzzedAt = 0; events.push('buzzer');
        for (const b of balls) if (b.shot) b.shot.late = true;
      }
    } else if (buzzer && !over) {
      buzzedAt += h;
      // the shots still in the air when it went count, once they've come down
      if (!balls.some(b => b.shot) || buzzedAt > 3) {
        for (const b of balls) b.shot = null;
        over = true; events.push('over');
      }
    }
    moveHoop(h);
    for (const b of balls) settle(b, h);
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) knock(balls[i], balls[j]);
  }

  function step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i++) sub(dt / n);
  }

  return {
    step,
    shoot,
    aimFor,
    pocket,
    balls,
    hoop,
    get clock() { return clock; },
    get left() { return left(); },
    get score() { return score; },
    get streak() { return streak; },
    get fire() { return fire; },
    get sliding() { return sliding; },
    get bonus() { return bonus; },
    get buzzer() { return buzzer; },
    get over() { return over; },
    get shots() { return shots; },
    get baskets() { return baskets; },
    get swishes() { return swishes; },
    // what's happened since the last look: { shot }, { rim }, { board }, { thud }, { knock },
    // { basket, points, swish, bank, gold, fire, buzzer }, { miss }, { fire: true | false }, 'slide', 'bonus', 'buzzer', 'over'
    take() { const e = events; events = []; return e; },
  };
}

export const ticketsFor = score => Math.floor(score / 4);
