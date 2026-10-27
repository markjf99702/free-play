// Bonkers' sounds, all made on the spot with Web Audio: no sound files.
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
// A beep held flat for `len` seconds, then let go: the scoreboard's and the cabinet's own voice.
function beep(type, f, at, len, peak) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.setValueAtTime(peak, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + len + 0.1);
}


// A mole popping up: a quick squeaky boing, with a sparkle for a golden one. A peek is just a sniff.
export function pop(gold = false) {
  if (!ac || !enabled) return;
  tone('sine', 380, 760, 0.12, 0.09);
  if (gold) [2637, 3136, 3951].forEach((f, i) => bell(f, 0.05 + i * 0.05, 0.03));
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
  // the knock a phone's speaker can play (the thump under it is too low for one)
  burst('bandpass', 1200, 1.3, 2.4, 0.035); tone('triangle', 560, 300, 0.65, 0.08);
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
  burst('bandpass', 900, 1.2, 2.2, 0.035); tone('triangle', 440, 240, 0.5, 0.08); // (the part a phone plays)
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
// The frenzy: six quick beeps, each doubled a fifth up.
export function frenzy() {
  if (!ac || !enabled) return;
  for (let i = 0; i < 6; i++) { const f = i % 2 ? 660 : 880; beep('square', f, i * 0.1, 0.06, 0.06); beep('square', f * 1.5, i * 0.1, 0.06, 0.04); }
}
// Each of the last five seconds: a short beep, higher for the last one.
export function count(n) {
  if (!ac || !enabled) return;
  const f = n === 1 ? 1175 : 880, t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = f;
  const v = n === 1 ? 0.08 : 0.1;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.005);
  g.gain.setValueAtTime(v, t + (n === 1 ? 0.16 : 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + (n === 1 ? 0.22 : 0.12));
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + 0.25);
}
// Time's up: three notes falling, the last held.
export function over() {
  if (!ac || !enabled) return;
  [[659, 0, 0.14], [523, 0.19, 0.14], [392, 0.38, 0.45]].forEach(([f, at, len]) => {
    beep('square', f, at, len, 0.05); beep('triangle', f * 2, at, len, 0.038);
  });
}

// A new best, once the tickets are out: four bells, climbing.
export function best() {
  if (!ac || !enabled) return;
  [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.13, i === 3 ? 0.24 : 0.2));
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
