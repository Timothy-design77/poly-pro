import { writeFile } from 'node:fs/promises';

const outputPath = process.argv[2] || '/tmp/poly-pro-fake-mic.wav';
const sampleRate = 48_000;
const durationSeconds = 24;
const channels = 1;
const bitsPerSample = 16;
const frameCount = sampleRate * durationSeconds;
const samples = new Int16Array(frameCount);

// Deterministic pseudo-random generator so CI receives identical audio each run.
let seed = 0x5eed1234;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

// Low background noise plus a decaying, broadband percussion transient every
// 500 ms (120 BPM). The pattern alternates spectral character so recording,
// onset detection, scoring, and classification paths receive realistic input.
for (let i = 0; i < frameCount; i += 1) {
  const t = i / sampleRate;
  const beatIndex = Math.floor(t / 0.5);
  const beatPhase = t - beatIndex * 0.5;
  const isDownbeat = beatIndex % 4 === 0;

  let value = (random() * 2 - 1) * 0.0025;

  if (beatPhase < 0.065) {
    const envelope = Math.exp(-beatPhase * (isDownbeat ? 52 : 70));
    const low = Math.sin(2 * Math.PI * (isDownbeat ? 92 : 180) * beatPhase);
    const mid = Math.sin(2 * Math.PI * (isDownbeat ? 310 : 720) * beatPhase);
    const high = (random() * 2 - 1) * (isDownbeat ? 0.25 : 0.55);
    value += envelope * (low * 0.58 + mid * 0.24 + high * 0.18);
  }

  // Add a softer off-beat transient to exercise subdivision/onset handling.
  const offBeatPhase = ((t + 0.25) % 0.5);
  if (offBeatPhase < 0.025) {
    const envelope = Math.exp(-offBeatPhase * 115);
    value += envelope * ((random() * 2 - 1) * 0.22 + Math.sin(2 * Math.PI * 1100 * offBeatPhase) * 0.12);
  }

  const clamped = Math.max(-1, Math.min(1, value));
  samples[i] = Math.round(clamped * 32767);
}

const bytesPerSample = bitsPerSample / 8;
const dataSize = samples.length * bytesPerSample;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0, 'ascii');
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8, 'ascii');
buffer.write('fmt ', 12, 'ascii');
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
buffer.writeUInt16LE(channels * bytesPerSample, 32);
buffer.writeUInt16LE(bitsPerSample, 34);
buffer.write('data', 36, 'ascii');
buffer.writeUInt32LE(dataSize, 40);

for (let i = 0; i < samples.length; i += 1) {
  buffer.writeInt16LE(samples[i], 44 + i * 2);
}

await writeFile(outputPath, buffer);
console.log(JSON.stringify({ outputPath, sampleRate, durationSeconds, frames: frameCount, bytes: buffer.length }));
