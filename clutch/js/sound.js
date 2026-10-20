// Clutch's sounds, all made on the spot with Web Audio: no sound files.
// The browser only allows sound after a tap or key, so unlock() is called from the first one.

let ac = null, out = null, enabled = true;
let hum = null; // the claw's motor: a low buzz and a whine through a filter, louder while something's moving

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
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90;
  const src = ac.createBufferSource(); src.buffer = noise(); src.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2;
  const g = ac.createGain(); g.gain.value = 0;
  const ng = ac.createGain(); ng.gain.value = 0.5;
  o.connect(f); src.connect(ng); ng.connect(f); f.connect(g); g.connect(out);
  o.start(); src.start();
  hum = { o, f, g };
}

// The motor: on (0 to 1) and how hard it's working (0 to 1, higher whines higher: lifting a load, say).
export function motor(on, effort = 0.5) {
  if (!ac || !hum) return;
  const t = ac.currentTime;
  hum.g.gain.setTargetAtTime(on * 0.07, t, 0.05);
  hum.o.frequency.setTargetAtTime(70 + effort * 70, t, 0.08);
  hum.f.frequency.setTargetAtTime(380 + effort * 700, t, 0.08);
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
function bell(f, at, peak) {
  tone('sine', f, f, peak, 0.9, at);
  tone('sine', f * 2.01, f * 2.01, peak * 0.35, 0.45, at);
  tone('sine', f * 3.02, f * 3.02, peak * 0.15, 0.25, at);
}

// The big button going down.
export function press() {
  if (!ac || !enabled) return;
  burst('bandpass', 1800, 1.4, 0.25, 0.03);
  tone('square', 240, 200, 0.05, 0.04);
}

// The arms snapping shut, and opening over the chute.
export function close() {
  if (!ac || !enabled) return;
  tone('triangle', 900, 520, 0.16, 0.08);
  burst('bandpass', 2600, 3, 0.35, 0.05);
  burst('bandpass', 3400, 4, 0.22, 0.04, 0.05);
}
export function open() {
  if (!ac || !enabled) return;
  burst('bandpass', 2200, 3, 0.25, 0.05);
  tone('triangle', 520, 760, 0.1, 0.08);
}

// A plush coming loose, and landing back on the heap.
export function slip() {
  if (!ac || !enabled) return;
  tone('triangle', 520, 240, 0.12, 0.4);
  tone('sine', 150, 70, 0.3, 0.16, 0.32);
  burst('lowpass', 500, 0.7, 0.25, 0.12, 0.32);
}

// Won: the plush thumps down the chute and into the door, and the machine plays its little tune.
export function won(rare) {
  if (!ac || !enabled) return;
  tone('sine', 170, 80, 0.45, 0.16);
  burst('lowpass', 600, 0.7, 0.3, 0.12);
  const notes = rare ? [784, 988, 1175, 1568, 1976, 2349] : [659, 784, 988, 1319];
  notes.forEach((f, i) => bell(f, 0.18 + i * 0.1, 0.24));
}

// A trade at the prize counter.
export function buy() {
  if (!ac || !enabled) return;
  bell(1175, 0, 0.22); bell(1568, 0.09, 0.2);
}
