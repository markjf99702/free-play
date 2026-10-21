// Highrise's sounds, all made on the spot with Web Audio: no sound files.
// The browser only allows sound after a tap or key, so unlock() is called from the first one.

let ac = null, out = null, enabled = true;

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    out = ac.createGain();
    out.gain.value = enabled ? 0.8 : 0;
    const squash = ac.createDynamicsCompressor();
    out.connect(squash); squash.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}

export function setEnabled(on) {
  enabled = on;
  if (out) out.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.02);
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function env(g, t, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}
function tone(type, f0, f1, peak, decay, at = 0) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  env(g, t, peak, decay);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + decay + 0.05);
}
function burst(freq, q, peak, decay, at = 0) {
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noise();
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  env(g, t, peak, decay);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t); s.stop(t + decay + 0.05);
}
function bell(f, at, peak) {
  tone('sine', f, f, peak, 0.7, at);
  tone('sine', f * 2.01, f * 2.01, peak * 0.3, 0.35, at);
}

// The scale the floors climb: each floor built rings a note higher.
const SCALE = [0, 2, 4, 7, 9];
const note = n => 392 * 2 ** ((Math.floor(n / 5) * 12 + SCALE[n % 5]) / 12);

// The row moving along a window: a blip, higher up the tower.
export function tick(floor) {
  if (!ac || !enabled) return;
  tone('square', 520 + floor * 22, 520 + floor * 22, 0.025, 0.03);
}

// A row set down: a clunk, and the floor's note (with a sparkle for a perfect one).
export function place(floor, perfect) {
  if (!ac || !enabled) return;
  tone('sine', 180, 90, 0.35, 0.12);
  burst(1200, 1, 0.12, 0.05);
  bell(note(floor - 1), 0.02, 0.2);
  if (perfect) [1, 2].forEach(i => bell(note(floor - 1 + i * 2), 0.06 + i * 0.06, 0.12));
}

// Windows falling off the side.
export function drop() {
  if (!ac || !enabled) return;
  tone('sine', 900, 160, 0.08, 0.55, 0.03);
}

// Nothing stayed up: the tower stops there.
export function fail() {
  if (!ac || !enabled) return;
  tone('sawtooth', 220, 110, 0.12, 0.5);
  tone('sawtooth', 165, 82, 0.1, 0.6, 0.15);
}

// Floor 11, the minor prize: and the top floor, the major.
export function minor() {
  if (!ac || !enabled) return;
  [659, 784, 988, 1319].forEach((f, i) => bell(f, i * 0.1, 0.22));
}
export function top() {
  if (!ac || !enabled) return;
  [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => bell(f, i * 0.11, 0.24));
  for (let i = 0; i < 6; i++) burst(3000 + i * 400, 4, 0.08, 0.3, 1 + i * 0.25);
}

export function ticket() {
  if (!ac || !enabled) return;
  burst(3500, 0.7, 0.16, 0.018);
}

export function buy() {
  if (!ac || !enabled) return;
  bell(1175, 0, 0.22); bell(1568, 0.09, 0.2);
}
