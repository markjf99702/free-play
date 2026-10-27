// Bonkers' sounds, all made on the spot with Web Audio: no sound files.
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
function burst(type, freq, q, peak, decay, at = 0) {
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noise();
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  env(g, t, peak, decay);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t); s.stop(t + decay + 0.05);
}
function bell(f, at, peak) {
  tone('sine', f, f, peak, 0.6, at);
  tone('sine', f * 2.01, f * 2.01, peak * 0.3, 0.3, at);
}

// A mole popping up: a quick squeaky boing. A peek is just a sniff.
export function pop() {
  if (!ac || !enabled) return;
  tone('sine', 380, 760, 0.12, 0.09);
}
export function peek() {
  if (!ac || !enabled) return;
  burst('bandpass', 2600, 4, 0.06, 0.04); burst('bandpass', 2600, 4, 0.05, 0.04, 0.07);
}

// The mallet: a rubbery bonk on a mole (with a squeak), a clank off a hard hat, a thud on bare ground.
export function bonk(kind) {
  if (!ac || !enabled) return;
  tone('sine', 160, 70, 0.5, 0.14);
  burst('lowpass', 900, 0.8, 0.35, 0.06);
  tone('square', 900, 1400, 0.05, 0.08, 0.03);
  if (kind === 'gold') [1319, 1568, 2093, 2637].forEach((f, i) => bell(f, 0.06 + i * 0.06, 0.14));
}
export function hat() {
  if (!ac || !enabled) return;
  tone('triangle', 1250, 1100, 0.2, 0.25); tone('sine', 2700, 2600, 0.08, 0.2);
  burst('highpass', 4000, 0.7, 0.14, 0.04);
}
export function miss() {
  if (!ac || !enabled) return;
  tone('sine', 110, 60, 0.35, 0.12);
  burst('lowpass', 400, 0.7, 0.3, 0.1);
}

// A mole getting away: a raspberry.
export function away() {
  if (!ac || !enabled) return;
  tone('sawtooth', 180, 150, 0.04, 0.18);
}

// Ten in a row; the frenzy; the end of the round.
export function run() {
  if (!ac || !enabled) return;
  [784, 988, 1175, 1568].forEach((f, i) => bell(f, i * 0.07, 0.16));
}
export function frenzy() {
  if (!ac || !enabled) return;
  for (let i = 0; i < 6; i++) tone('square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.05, 0.08, i * 0.1);
}
export function over() {
  if (!ac || !enabled) return;
  tone('square', 440, 440, 0.07, 0.5); tone('square', 330, 330, 0.07, 0.7, 0.35);
}

// A new best, once the tickets are out: four bells, climbing.
export function best() {
  if (!ac || !enabled) return;
  [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.13, i === 3 ? 0.24 : 0.2));
}

export function ticket() {
  if (!ac || !enabled) return;
  burst('highpass', 3500, 0.7, 0.16, 0.018);
}

export function buy() {
  if (!ac || !enabled) return;
  bell(1175, 0, 0.2); bell(1568, 0.09, 0.18);
}
