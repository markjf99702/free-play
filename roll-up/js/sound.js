// Roll Up's sounds, all made on the spot with Web Audio: no sound files.
// The browser only allows sound after a tap or key, so unlock() is called from the first one.

let ac = null, out = null, enabled = true;
let rumble = null; // the rolling ball: looping noise through a filter

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
    startRumble();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}

export function setEnabled(on) {
  enabled = on;
  if (out) out.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.02);
}

// Out of sight (another tab or app, the phone locked, or off to the floor) the page gets no frames to turn the rumble
// of a rolling ball down by, so it would carry on as it was: hush it, and let the sound sleep until the page is back.
let woke = false; // the sound was running when the page went
function asleep() {
  if (!ac) return;
  if (rumble) { rumble.g.gain.cancelScheduledValues(ac.currentTime); rumble.g.gain.value = 0; }
  if (ac.state === 'running') { woke = true; ac.suspend().catch(() => {}); }
}
function awake() {
  if (!ac || !woke) return;
  woke = false;
  if (enabled) ac.resume().catch(() => {});
}
document.addEventListener('visibilitychange', () => (document.hidden ? asleep() : awake()));
addEventListener('pagehide', asleep);
addEventListener('pageshow', awake);

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15; }
  }
  return noiseBuf;
}

function startRumble() {
  const src = ac.createBufferSource();
  src.buffer = noise(); src.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 0.7;
  const g = ac.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(out);
  src.start();
  rumble = { f, g };
}

// speed in cm/s while the ball rolls on wood; 0 when it's in the air or on the felt
export function rolling(speed) {
  if (!ac || !rumble) return;
  const k = Math.min(1, speed / 420);
  rumble.g.gain.setTargetAtTime(k * 0.55, ac.currentTime, 0.04);
  rumble.f.frequency.setTargetAtTime(160 + k * 520, ac.currentTime, 0.05);
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
  s.start(t, Math.random()); s.stop(t + decay + 0.05);
}

// A short knock of white noise round `freq`: the part of a thump a phone's speaker can play.
function knock(freq, peak, decay) {
  const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = white();
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = ac.createGain();
  env(g, t, peak, decay);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
}

// Something the ball hit, from js/physics.js's list.
export function hit(kind, speed) {
  if (!ac || !enabled) return;
  const k = Math.min(1, speed / 320);
  if (k < 0.06) return;
  switch (kind) {
    case 'board': tone('sine', 150, 70, 0.55 * k, 0.12); burst('lowpass', 900, 0.8, 0.35 * k, 0.05); knock(1200, 2.2 * k, 0.035); tone('triangle', 600, 300, 0.4 * k, 0.07); break;
    case 'jump': tone('sine', 110, 60, 0.4 * k, 0.1); break;
    case 'lip': case 'rim': tone('triangle', 1500, 1100, 0.22 * k, 0.05); burst('bandpass', 3200, 2, 0.4 * k, 0.035); break;
    case 'wall': tone('sine', 280, 190, 0.3 * k, 0.07); burst('lowpass', 1600, 0.7, 0.25 * k, 0.04); break;
    case 'net': burst('highpass', 1800, 0.5, 0.3 * k, 0.14); break;
    case 'back': burst('lowpass', 700, 0.7, 0.3 * k, 0.08); break;
  }
}

// Into a hole: a plunk, then the rumble of the ball running down the return.
export function drop() {
  if (!ac || !enabled) return;
  tone('sine', 360, 120, 0.4, 0.18);
  burst('lowpass', 500, 0.6, 0.25, 0.5, 0.12);
}

// The ball carried over the red line too slowly to roll: the 'No jump' buzz, softly (and more softly still, k < 1, for
// a touch up the lane that wasn't on the ball).
export function foul(k = 1) {
  if (!ac || !enabled) return;
  tone('square', 120, 90, 0.06 * k, 0.22);
}

const NOTES = { 10: [523], 20: [587], 30: [659], 40: [784], 50: [880, 1319], 100: [784, 988, 1175, 1568] };
export function score(value) {
  if (!ac || !enabled) return;
  if (!value) { tone('square', 120, 90, 0.12, 0.32); return; }
  (NOTES[value] || [523]).forEach((f, i) => bell(f, i * 0.085, value >= 50 ? 0.32 : 0.26));
}
function bell(f, at, peak) {
  tone('sine', f, f, peak, 0.9, at);
  tone('sine', f * 2.01, f * 2.01, peak * 0.35, 0.45, at);
  tone('sine', f * 3.02, f * 3.02, peak * 0.15, 0.25, at);
}

// White noise, for the ticket's click (the noise above is weighted low, for thumps and rumbles).
let whiteBuf = null;
function white() {
  if (!whiteBuf) {
    whiteBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = whiteBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return whiteBuf;
}
// A ticket out of the slot: a short click of white noise round 2.5 kHz, with a tiny tick on top.
export function ticket() {
  if (!ac || !enabled) return;
  const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = white();
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

// A new best, once the tickets are out: four bells, climbing.
export function best() {
  if (!ac || !enabled) return;
  [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.13, i === 3 ? 0.24 : 0.2));
}

export function fanfare() {
  if (!ac || !enabled) return;
  [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.11, 0.24));
}

export function buy() {
  if (!ac || !enabled) return;
  bell(1175, 0, 0.22); bell(1568, 0.09, 0.2);
}

// A big prize handed over at the counter (600 tickets and up): a longer fanfare, up five bells as it comes down off
// the top shelf, and a chord as it lands on the plank.
export function handOver() {
  if (!ac || !enabled) return;
  [523, 659, 784, 1047, 1319].forEach((f, i) => bell(f, i * 0.11, 0.2));
  [784, 1047, 1568].forEach(f => bell(f, 0.7, 0.15));
}
