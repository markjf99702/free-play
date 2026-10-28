// The arcade's one Sound switch. Each machine has a Sound button in its menu, and the floor has one at its foot: flip
// any of them and every machine goes on or off with it. It's kept in a save of its own (free-play.sound: { on }),
// apart from the pocket. Until it's first flipped, each machine keeps the setting it had (its own save's `sound`).
// Every page hears a flip, here or in another tab, as free-play:sound.

export const KEY = 'free-play.sound';

// The arcade's switch: true or false, or null if it's never been flipped.
export function arcadeSound() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* never flipped, or storage is off */ }
  return typeof s?.on === 'boolean' ? s.on : null;
}

// Whether a machine makes sound: the arcade's switch, or, before it's been flipped, the machine's own setting
// (`own`, from its save: anything but false is on).
export function soundOn(own = true) {
  const a = arcadeSound();
  return a === null ? own !== false : a;
}

// Flips the arcade's switch, for every machine. Returns what it's now set to.
export function switchSound(on) {
  on = !!on;
  try { localStorage.setItem(KEY, JSON.stringify({ on })); } catch { /* storage off: this page goes on as set */ }
  dispatchEvent(new CustomEvent('free-play:sound', { detail: on }));
  return on;
}

// Flipped in another tab (or the whole of storage cleared, key null): this one follows.
globalThis.addEventListener?.('storage', e => {
  if (e.key === KEY || e.key === null) dispatchEvent(new CustomEvent('free-play:sound', { detail: arcadeSound() }));
});
