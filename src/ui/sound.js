// Sunete sintetizate pe loc (Web Audio, fără fișiere) + vibrație + confetti la câștig.
// Pe iPhone sunetul pornește doar după o atingere, așa că îl deblocăm la prima atingere din aplicație.
// Vibrația merge doar pe Android (Safari nu are navigator.vibrate).
const CONFETTI = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.module.mjs';

let ctx = null;
addEventListener('pointerdown', () => {
  try { ctx ??= new AudioContext(); ctx.resume(); } catch { /* fără sunet */ }
}, { capture: true });
const ready = () => ctx?.state === 'running';
export const vibrate = ms => navigator.vibrate?.(ms);

function tone(freq, start, length, { type = 'sine', volume = 0.2, slide = 1 } = {}) {
  const t = ctx.currentTime + start, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + length);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

let noiseBuffer = null;
function noise(start, length, { freq = 2500, q = 1.5, volume = 0.3 } = {}) {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + start, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = noiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + length + 0.02);
}

export const sound = {
  // zarul lovește masa sau celălalt zar; strength 0..1
  clack(strength = 1) {
    if (!ready()) return;
    const v = Math.min(1, strength);
    noise(0, 0.05, { freq: 2200 + Math.random() * 1600, q: 3, volume: 0.35 * v });
    tone(900 + Math.random() * 500, 0, 0.04, { type: 'triangle', volume: 0.12 * v });
  },
  // lemn pe lemn (Jenga)
  wood(volume = 1) {
    if (!ready()) return;
    tone(520, 0, 0.09, { type: 'triangle', volume: 0.3 * volume, slide: 0.7 });
    noise(0, 0.03, { freq: 1200, q: 2, volume: 0.2 * volume });
  },
  tick() {
    if (!ready()) return;
    tone(1100, 0, 0.05, { type: 'triangle', volume: 0.15 });
  },
  beep(high) {
    if (!ready()) return;
    tone(high ? 1320 : 880, 0, high ? 0.3 : 0.12, { volume: 0.25 });
  },
  win() {
    if (!ready()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, { type: 'triangle', volume: 0.22 }));
  },
  lose() {
    if (!ready()) return;
    [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.3, { type: 'triangle', volume: 0.18 }));
  },
};

let confettiPromise = null;
// ai câștigat: confetti, fanfară, vibrație
export async function celebrate() {
  sound.win();
  vibrate([60, 40, 120]);
  try {
    const { default: confetti } = await (confettiPromise ??= import(CONFETTI));
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.65 }, disableForReducedMotion: true });
  } catch { /* fără confetti */ }
}
export function lost() {
  sound.lose();
  vibrate(200);
}
