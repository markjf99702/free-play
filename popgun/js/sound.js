// Popgun's sounds, all made on the spot with Web Audio: no sound files.
// The browser only allows sound after a tap or key, so unlock() is called from the first one.

let ac = null, out = null, enabled = true;

const TICK = 3; // how loud a ticket's click is

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
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.003);
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
function bell(f, at, peak, decay = 0.8) {
  tone('sine', f, f, peak, decay, at);
  tone('sine', f * 2.76, f * 2.76, peak * 0.4, decay * 0.5, at);
  tone('sine', f * 5.4, f * 5.4, peak * 0.15, decay * 0.25, at);
}

// The popgun going off: the pop of the cork, and the spring.
export function pop() {
  if (!ac || !enabled) return;
  burst('bandpass', 900, 1.5, 0.5, 0.05);
  tone('sine', 260, 90, 0.35, 0.08);
  tone('triangle', 1400, 700, 0.04, 0.12, 0.02);
}

// A cork knocking over a tin target: a tink, higher for the smaller ones, and a sparkle for the golden duck.
const TINK = { duck: 1150, rabbit: 1450, star: 1900, gold: 1250, bell: 0 };
export function hit(kind) {
  if (!ac || !enabled) return;
  if (kind === 'bell') { bell(1046, 0, 0.3, 1.4); bell(1046, 0.22, 0.24, 1.4); return; }
  const f = TINK[kind] || 1300;
  tone('triangle', f, f * 0.98, 0.22, 0.18);
  tone('sine', f * 2.4, f * 2.4, 0.08, 0.1);
  burst('highpass', 4000, 0.7, 0.12, 0.03);
  tone('sine', 220, 140, 0.12, 0.1, 0.06); // it clanks down
  if (kind === 'gold') [1568, 1976, 2349, 3136].forEach((n, i) => bell(n, 0.08 + i * 0.07, 0.12, 0.5));
}

// A tap while the gun reloads: the trigger's dry click on a spring that isn't set.
export function dry() {
  if (!ac || !enabled) return;
  burst('bandpass', 2400, 3, 2.4, 0.014);
  tone('triangle', 1100, 820, 0.25, 0.045);
}

// A golden duck coming round the conveyor: a little tinkle. A bell: a small ding-ding.
export function arrive(kind) {
  if (!ac || !enabled) return;
  if (kind === 'bell') { bell(1568, 0, 0.07, 0.5); bell(1568, 0.13, 0.055, 0.5); return; }
  [2349, 2793, 3136].forEach((f, i) => bell(f, i * 0.06, 0.05, 0.35));
}

// A cork into the painted backdrop.
export function miss() {
  if (!ac || !enabled) return;
  burst('lowpass', 500, 0.8, 0.25, 0.08);
  tone('sine', 140, 80, 0.15, 0.1);
  burst('bandpass', 1000, 1.2, 1.4, 0.03); tone('triangle', 560, 320, 0.2, 0.06); // (the part a phone plays)
}

// The moon, hit: a boing.
export function boing() {
  if (!ac || !enabled) return;
  tone('sine', 300, 600, 0.18, 0.12); tone('sine', 600, 250, 0.15, 0.3, 0.1);
}

// Five in a row.
export function streak() {
  if (!ac || !enabled) return;
  [784, 988, 1175, 1568].forEach((f, i) => bell(f, i * 0.07, 0.16, 0.5));
}

// The round's over: a little tune.
export function over() {
  if (!ac || !enabled) return;
  [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.11, 0.2));
}

// A new best, once the tickets are out: four tin bells, climbing.
export function best() {
  if (!ac || !enabled) return;
  [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.13, i === 3 ? 0.22 : 0.18, i === 3 ? 1.2 : 0.7));
}

// A ticket out of the slot: a short click of white noise round 2.5 kHz, with a tiny tick on top.
export function ticket() {
  if (!ac || !enabled) return;
  const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noise();
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 1.5;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(TICK, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + 0.03);
  const o = ac.createOscillator(), h = ac.createGain();
  o.type = 'triangle'; o.frequency.value = 1400;
  h.gain.setValueAtTime(0.0001, t); h.gain.linearRampToValueAtTime(TICK * 0.5, t + 0.0005); h.gain.exponentialRampToValueAtTime(0.0001, t + 0.004);
  o.connect(h); h.connect(out);
  o.start(t); o.stop(t + 0.02);
}

export function buy() {
  if (!ac || !enabled) return;
  bell(1175, 0, 0.2); bell(1568, 0.09, 0.18);
}
