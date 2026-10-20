// Topple's sounds, all made on the spot with Web Audio: no sound files.
// The browser only allows sound after a tap or key, so unlock() is called from the first one.

let ac = null, out = null, enabled = true;
let hum = null; // the pusher's motor, always running, a little louder as it changes direction

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    out = ac.createGain();
    out.gain.value = enabled ? 0.8 : 0;
    const squash = ac.createDynamicsCompressor();
    out.connect(squash); squash.connect(ac.destination);
    startHum();
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
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15; }
  }
  return noiseBuf;
}

function startHum() {
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 1;
  const g = ac.createGain(); g.gain.value = 0;
  o.connect(f); f.connect(g); g.connect(out);
  o.start();
  hum = { o, f, g };
}

// The motor, with how fast the pusher's moving right now (0 to 1).
export function motor(speed) {
  if (!ac || !hum) return;
  const t = ac.currentTime;
  hum.g.gain.setTargetAtTime(0.025 + speed * 0.03, t, 0.1);
  hum.f.frequency.setTargetAtTime(160 + speed * 160, t, 0.1);
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
  s.start(t, Math.random()); s.stop(t + decay + 0.05);
}
function bell(f, at, peak) {
  tone('sine', f, f, peak, 0.8, at);
  tone('sine', f * 2.01, f * 2.01, peak * 0.35, 0.4, at);
}
// Metal on metal: a couple of high partials that don't quite agree, and a tick.
function chink(peak, at = 0, pitch = 1) {
  tone('sine', 3150 * pitch, 3150 * pitch, peak, 0.12, at);
  tone('sine', 4730 * pitch, 4730 * pitch, peak * 0.6, 0.08, at);
  burst('bandpass', 5200 * pitch, 3, peak * 0.9, 0.025, at);
}

// A coin let go from the chute, and landing on the shelf.
export function drop() {
  if (!ac || !enabled) return;
  burst('bandpass', 2400, 2, 0.18, 0.03);
}
export function land() {
  if (!ac || !enabled) return;
  chink(0.12, 0, 0.9 + Math.random() * 0.2);
  chink(0.06, 0.05 + Math.random() * 0.03, 1 + Math.random() * 0.15);
}

// Coins scraped off the shelf's lip onto the deck.
export function scrape() {
  if (!ac || !enabled) return;
  burst('bandpass', 1800, 1.2, 0.08, 0.09);
  chink(0.04, 0.02, 0.8);
}

// A coin over the front edge, down into the tray; a gold one rings out.
export function won(gold) {
  if (!ac || !enabled) return;
  chink(gold ? 0.16 : 0.1, 0, gold ? 0.7 : 0.85 + Math.random() * 0.1);
  chink(0.08, 0.14, 0.75);
  if (gold) [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, 0.12 + i * 0.07, 0.18));
}
export function lost() {
  if (!ac || !enabled) return;
  tone('sine', 420, 180, 0.05, 0.25);
}

// The lights chasing along the pockets, and stopping on one.
export function chase() {
  if (!ac || !enabled) return;
  for (let i = 0; i < 12; i++) tone('square', 880 + i * 40, 880 + i * 40, 0.035, 0.04, i * (0.04 + i * 0.006));
}
export function open() {
  if (!ac || !enabled) return;
  bell(1319, 0, 0.18); bell(1319, 0.16, 0.18);
}
export function bonus() {
  if (!ac || !enabled) return;
  [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => bell(f, i * 0.09, 0.2));
}

// A prize over the edge.
export function prize() {
  if (!ac || !enabled) return;
  [392, 523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.11, 0.24));
}

export function ticket() {
  if (!ac || !enabled) return;
  burst('highpass', 3500, 0.7, 0.18, 0.018);
}

export function buy() {
  if (!ac || !enabled) return;
  bell(1175, 0, 0.22); bell(1568, 0.09, 0.2);
}
