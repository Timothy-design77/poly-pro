// Generate CC0-equivalent percussion WAV samples for Poly Pro
// 48kHz, mono, 16-bit PCM, ~20-50ms each

import { writeFileSync } from 'fs';

const SAMPLE_RATE = 48000;

function createWav(samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * 2; // 16-bit mono
  const blockAlign = 2;
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4; // chunk size
  buffer.writeUInt16LE(1, offset); offset += 2;  // PCM
  buffer.writeUInt16LE(1, offset); offset += 2;  // mono
  buffer.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(16, offset); offset += 2; // bits per sample

  // data chunk
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(val * 32767), offset);
    offset += 2;
  }

  return buffer;
}

function generateSamples(durationMs, fn) {
  const numSamples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = fn(t, i, numSamples);
  }
  return samples;
}

// 1. Woodblock - sharp transient, high-pitched resonance
const woodblock = generateSamples(40, (t, i, n) => {
  const env = Math.exp(-t * 120);
  const tone = Math.sin(2 * Math.PI * 880 * t) * 0.6 +
               Math.sin(2 * Math.PI * 1320 * t) * 0.3 +
               Math.sin(2 * Math.PI * 2200 * t) * 0.1;
  return tone * env * 0.9;
});

// 2. Clave - very short, bright, high attack
const clave = generateSamples(30, (t, i, n) => {
  const env = Math.exp(-t * 180);
  const tone = Math.sin(2 * Math.PI * 2500 * t) * 0.5 +
               Math.sin(2 * Math.PI * 3200 * t) * 0.3 +
               Math.sin(2 * Math.PI * 4800 * t) * 0.2;
  return tone * env * 0.85;
});

// 3. Metronome tick - classic clean click
const tick = generateSamples(20, (t, i, n) => {
  const env = Math.exp(-t * 250);
  const tone = Math.sin(2 * Math.PI * 1000 * t) * 0.7 +
               Math.sin(2 * Math.PI * 3000 * t) * 0.2;
  const noise = (Math.random() * 2 - 1) * 0.1 * Math.exp(-t * 400);
  return (tone + noise) * env * 0.9;
});

// 4. Sticks - two sticks clicking
const sticks = generateSamples(25, (t, i, n) => {
  const env = Math.exp(-t * 200);
  const tone = Math.sin(2 * Math.PI * 1800 * t) * 0.4 +
               Math.sin(2 * Math.PI * 2700 * t) * 0.3;
  const noise = (Math.random() * 2 - 1) * 0.3 * Math.exp(-t * 300);
  return (tone + noise) * env * 0.85;
});

// 5. Kick - low thump
const kick = generateSamples(50, (t, i, n) => {
  const pitchEnv = 160 * Math.exp(-t * 40) + 40;
  const env = Math.exp(-t * 30);
  const tone = Math.sin(2 * Math.PI * pitchEnv * t);
  return tone * env * 0.95;
});

// 6. Snare - sharp noise + tone
const snare = generateSamples(45, (t, i, n) => {
  const toneEnv = Math.exp(-t * 100);
  const noiseEnv = Math.exp(-t * 50);
  const tone = Math.sin(2 * Math.PI * 200 * t) * 0.4 * toneEnv;
  const noise = (Math.random() * 2 - 1) * 0.6 * noiseEnv;
  return (tone + noise) * 0.85;
});

// 7. Rimshot - sharp crack
const rimshot = generateSamples(30, (t, i, n) => {
  const env = Math.exp(-t * 150);
  const tone = Math.sin(2 * Math.PI * 800 * t) * 0.3 +
               Math.sin(2 * Math.PI * 1600 * t) * 0.2;
  const noise = (Math.random() * 2 - 1) * 0.5 * Math.exp(-t * 200);
  return (tone + noise) * env * 0.9;
});

// 8. Cowbell - metallic ring
const cowbell = generateSamples(50, (t, i, n) => {
  const env = Math.exp(-t * 40);
  const tone = Math.sin(2 * Math.PI * 560 * t) * 0.5 +
               Math.sin(2 * Math.PI * 845 * t) * 0.3 +
               Math.sin(2 * Math.PI * 1200 * t) * 0.2;
  return tone * env * 0.8;
});

// 9. Hi-hat closed - short noise burst
const hihat = generateSamples(25, (t, i, n) => {
  const env = Math.exp(-t * 200);
  const noise = (Math.random() * 2 - 1);
  // Bandpass effect via mixing high-freq tones
  const tone = Math.sin(2 * Math.PI * 6000 * t) * 0.2 +
               Math.sin(2 * Math.PI * 8000 * t) * 0.2 +
               Math.sin(2 * Math.PI * 10000 * t) * 0.1;
  return (noise * 0.5 + tone) * env * 0.7;
});

// 10. Shaker - granular noise
const shaker = generateSamples(40, (t, i, n) => {
  const env = Math.pow(Math.sin(Math.PI * i / n), 0.5);
  const noise = (Math.random() * 2 - 1);
  return noise * env * 0.5;
});

// 11. Bell - clear tone with harmonics
const bell = generateSamples(50, (t, i, n) => {
  const env = Math.exp(-t * 25);
  const tone = Math.sin(2 * Math.PI * 523 * t) * 0.5 +
               Math.sin(2 * Math.PI * 1047 * t) * 0.25 +
               Math.sin(2 * Math.PI * 1570 * t) * 0.15 +
               Math.sin(2 * Math.PI * 2093 * t) * 0.1;
  return tone * env * 0.75;
});

// 12. Marimba - warm mallet tone
const marimba = generateSamples(50, (t, i, n) => {
  const env = Math.exp(-t * 35);
  const tone = Math.sin(2 * Math.PI * 440 * t) * 0.6 +
               Math.sin(2 * Math.PI * 880 * t) * 0.2 +
               Math.sin(2 * Math.PI * 1320 * t) * 0.1;
  const attack = Math.min(1, t * 2000);
  return tone * env * attack * 0.8;
});

const sounds = {
  woodblock, clave, tick, sticks, kick, snare,
  rimshot, cowbell, hihat, shaker, bell, marimba
};

for (const [name, samples] of Object.entries(sounds)) {
  const wav = createWav(samples);
  writeFileSync(`public/sounds/${name}.wav`, wav);
  console.log(`Generated ${name}.wav (${samples.length} samples, ${(samples.length / SAMPLE_RATE * 1000).toFixed(0)}ms)`);
}

console.log('\nAll sounds generated.');
