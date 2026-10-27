// Hoops' sounds, all made on the spot with Web Audio: no sound files.
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
function burst(type, freq, q, peak, decay, at = 0, to = freq) {
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noise();
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = ac.createGain();
  env(g, t, peak, decay);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
}
function bell(f, at, peak) {
  tone('sine', f, f, peak, 0.6, at);
  tone('sine', f * 2.01, f * 2.01, peak * 0.3, 0.3, at);
}
const loud = (speed, top) => Math.min(1, speed / top);

// The throw: a soft whoosh off the fingers.
export function shot() {
  if (!ac || !enabled) return;
  burst('bandpass', 500, 1.2, 0.12, 0.16, 0, 1600);
}

// The ball on the steel rim: a clank, louder the harder it hit.
export function rim(speed) {
  if (!ac || !enabled) return;
  const v = 0.15 + 0.4 * loud(speed, 500), f = 620 + Math.random() * 80;
  tone('triangle', f, f * 0.97, v, 0.22); tone('square', f * 2.7, f * 2.6, v * 0.18, 0.12);
  burst('highpass', 3000, 0.7, v * 0.5, 0.03);
}
// The backboard, or the panel behind it: a thump with a rattle.
export function board(speed) {
  if (!ac || !enabled) return;
  const v = 0.12 + 0.35 * loud(speed, 600);
  tone('sine', 150, 90, v, 0.12); burst('bandpass', 1100, 2, v * 0.5, 0.08);
}
// A bounce on the ramp, or two balls knocking together.
export function thud(speed) {
  if (!ac || !enabled) return;
  const v = 0.06 + 0.3 * loud(speed, 500);
  tone('sine', 120, 70, v, 0.1); burst('lowpass', 500, 0.7, v * 0.4, 0.05);
}
export function knock(speed) {
  if (!ac || !enabled) return;
  const v = 0.05 + 0.25 * loud(speed, 400);
  tone('sine', 290, 220, v, 0.08);
}

// Through the net: a swish (a long one for nothing but net), and a chime for the points.
export function basket(swish, gold) {
  if (!ac || !enabled) return;
  burst('highpass', swish ? 2400 : 1800, 0.8, swish ? 0.3 : 0.2, swish ? 0.32 : 0.2, 0, swish ? 5200 : 3000);
  bell(1175, 0.05, 0.13); bell(1568, 0.11, 0.12);
  if (gold) [1319, 1568, 2093, 2637].forEach((f, i) => bell(f, 0.14 + i * 0.06, 0.13));
}

// The rim catching alight, and going out.
export function fire(on) {
  if (!ac || !enabled) return;
  if (on) { burst('lowpass', 300, 0.8, 0.3, 0.5, 0, 2400); [523, 659, 784, 1047].forEach((f, i) => bell(f, 0.05 + i * 0.06, 0.13)); }
  else tone('sine', 400, 180, 0.1, 0.35);
}

// The hoop setting off along its rail; the last ten seconds; the buzzer.
export function slide() {
  if (!ac || !enabled) return;
  tone('sawtooth', 90, 140, 0.05, 0.6); tone('square', 880, 880, 0.05, 0.1, 0.1); tone('square', 880, 880, 0.05, 0.1, 0.3);
}
export function bonus() {
  if (!ac || !enabled) return;
  for (let i = 0; i < 3; i++) tone('square', 988, 988, 0.06, 0.09, i * 0.14);
  tone('square', 1319, 1319, 0.07, 0.3, 0.42);
}
export function buzzer() {
  if (!ac || !enabled) return;
  tone('sawtooth', 196, 196, 0.16, 1.0); tone('square', 207, 207, 0.1, 1.0);
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
