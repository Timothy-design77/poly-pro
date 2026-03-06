// Generate count-in WAV samples: 4 distinct tones for "1, 2, 3, 4"
// Each has a unique pitch, formant character, and clear attack
// 48kHz, mono, 16-bit PCM, ~180ms each (long enough to be clearly different from clicks)

import { writeFileSync } from 'fs';

const SAMPLE_RATE = 48000;

function createWav(samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * 2;
  const blockAlign = 2;
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(16, offset); offset += 2;

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

// Count sounds: ascending pitched tones with vowel-like formant character
// Each is ~180ms — long enough to feel like a "count", not a click
// Sharp attack, smooth decay, distinct pitch per number

// "ONE" — lowest, warm, open sound (like "uh")
// F0=220Hz, F1=600Hz, F2=1000Hz
const count1 = generateSamples(180, (t) => {
  const env = Math.min(1, t * 3000) * Math.exp(-t * 12);
  const f0 = Math.sin(2 * Math.PI * 220 * t);
  const f1 = Math.sin(2 * Math.PI * 600 * t) * 0.6;
  const f2 = Math.sin(2 * Math.PI * 1000 * t) * 0.2;
  return (f0 + f1 + f2) * env * 0.55;
});

// "TWO" — slightly higher, rounder (like "oo")
// F0=262Hz, F1=310Hz, F2=870Hz
const count2 = generateSamples(180, (t) => {
  const env = Math.min(1, t * 3000) * Math.exp(-t * 12);
  const f0 = Math.sin(2 * Math.PI * 262 * t);
  const f1 = Math.sin(2 * Math.PI * 310 * t) * 0.5;
  const f2 = Math.sin(2 * Math.PI * 870 * t) * 0.3;
  return (f0 + f1 + f2) * env * 0.55;
});

// "THREE" — higher, brighter (like "ee")
// F0=330Hz, F1=270Hz, F2=2300Hz
const count3 = generateSamples(180, (t) => {
  const env = Math.min(1, t * 3000) * Math.exp(-t * 12);
  const f0 = Math.sin(2 * Math.PI * 330 * t);
  const f1 = Math.sin(2 * Math.PI * 270 * t) * 0.4;
  const f2 = Math.sin(2 * Math.PI * 2300 * t) * 0.35;
  return (f0 + f1 + f2) * env * 0.55;
});

// "FOUR" — highest, clear, bright
// F0=392Hz, F1=500Hz, F2=1400Hz
const count4 = generateSamples(180, (t) => {
  const env = Math.min(1, t * 3000) * Math.exp(-t * 12);
  const f0 = Math.sin(2 * Math.PI * 392 * t);
  const f1 = Math.sin(2 * Math.PI * 500 * t) * 0.5;
  const f2 = Math.sin(2 * Math.PI * 1400 * t) * 0.25;
  return (f0 + f1 + f2) * env * 0.55;
});

const counts = { 'count-1': count1, 'count-2': count2, 'count-3': count3, 'count-4': count4 };

for (const [name, samples] of Object.entries(counts)) {
  const wav = createWav(samples);
  writeFileSync(`public/sounds/${name}.wav`, wav);
  console.log(`Generated ${name}.wav (${samples.length} samples, ${(samples.length / SAMPLE_RATE * 1000).toFixed(0)}ms)`);
}

console.log('\nCount-in sounds generated.');
console.log('To use real voice recordings, replace these files with your own WAVs.');
