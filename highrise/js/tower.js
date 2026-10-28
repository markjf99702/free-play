// Highrise's tower: a stacker, as plain rules with no clock of its own (so node can test it: test/highrise.unit.test.mjs).
// The grid is a building's front, COLS windows across and FLOORS floors up. On each floor a row of lit windows slides
// from side to side, and stopping it sets it down: windows with a lit window under them stay lit, and the rest fall
// off. The row on the next floor is as wide as what stayed lit, but never wider than that floor allows: three
// windows to start, two from floor 6 and one from floor 11. It moves faster the higher it gets, and each row sets off
// from somewhere new, going either way, so no spot on the floor is easier to build on than another.
// js/app.js keeps the time and asks where the row is; js/draw.js draws it.

export const COLS = 7;
export const FLOORS = 15;
export const MINOR = 11;           // the minor prize floor: take the bonus and stop, or keep going for the top
export const MINOR_BONUS = 25;     // tickets, on top of a ticket a floor
export const MAJOR_BONUS = 100;    // tickets for topping out, with the trophy

// The widest row a floor allows, and how long the row takes to move one window along there (ms).
export const most = floor => (floor <= 5 ? 3 : floor <= 10 ? 2 : 1);
export const stepMs = floor => Math.max(70, Math.round(162 * 0.945 ** (floor - 1)));

export function createTower({ random = Math.random } = {}) {
  const rows = [];        // the floors built, bottom first: each the columns lit on it, in order
  let width = 3;          // windows in the row that's moving now
  // Where in its back-and-forth the row sets off: 0 is the left wall heading right, COLS - width the right wall,
  // and on from there heading back left.
  const setOff = () => Math.floor(random() * 2 * (COLS - width));
  let phase = setOff();

  // Where the moving row's left end is, ms after it set off: it bounces between the walls a window at a time.
  function moverAt(ms) {
    const max = COLS - width, period = 2 * max;
    const step = Math.floor(Math.max(0, ms) / stepMs(rows.length + 1));
    const p = (phase + step) % period;
    return p <= max ? p : period - p;
  }

  // Sets the moving row down with its left end at start. What stayed lit and what fell, and what that means:
  // over (nothing stayed), minor (the minor prize floor is built), top (the top floor is built).
  function place(start) {
    const floor = rows.length + 1;
    const cols = Array.from({ length: width }, (_, i) => start + i);
    const below = rows[rows.length - 1];
    const kept = below ? cols.filter(c => below.includes(c)) : cols;
    const dropped = cols.filter(c => !kept.includes(c));
    const result = { floor, cols, kept, dropped, perfect: !!below && !dropped.length, over: !kept.length, minor: false, top: false };
    if (result.over) return result;
    rows.push(kept);
    result.minor = floor === MINOR;
    result.top = floor === FLOORS;
    width = Math.min(kept.length, most(floor + 1));
    phase = setOff();
    return result;
  }

  return {
    rows,
    moverAt,
    place,
    get floor() { return rows.length + 1; },   // the floor being built
    get built() { return rows.length; },
    get width() { return width; },
  };
}

// What a game pays: a ticket for every floor built, and the minor or the major bonus.
export function payout({ built, tookMinor = false }) {
  return built + (tookMinor ? MINOR_BONUS : 0) + (built >= FLOORS ? MAJOR_BONUS : 0);
}
