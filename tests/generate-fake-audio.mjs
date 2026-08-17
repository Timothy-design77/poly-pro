import { writeFile } from 'node:fs/promises';

const outputPath = process.argv[2] || '/tmp/poly-pro-fake-mic.wav';
const sampleRate = 48_000;
const durationSeconds = 30;
const frameCount = sampleRate * durationSeconds;
const samples = new Int16Array(frameCount);

let seed = 0x5eed1234;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

for (let index = 0; index < frameCount; index += 1) {
  const time = index / sampleRate;
  const beatIndex = Math.floor(time / 0.5);
  const beatPhase = time - beatIndex * 0.5;
  let value = (random() * 2 - 1) * 0.002;

  if (beatPhase < 0.06) {
    const envelope = Math.exp(-beatPhase * 65);
    const fundamental = beatIndex % 4 === 0 ? 95 : 220;
    value += envelope * (
      Math.sin(2 * Math.PI * fundamental * beatPhase) * 0.62
      + Math.sin(2 * Math.PI * 720 * beatPhase) * 0.2
      + (random() * 2 - 1) * 0.18
    );
  }

  samples[index] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
}

const dataBytes = samples.byteLength;
const buffer = Buffer.alloc(44 + dataBytes);
buffer.write('RIFF', 0, 'ascii');
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8, 'ascii');
buffer.write('fmt ', 12, 'ascii');
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36, 'ascii');
buffer.writeUInt32LE(dataBytes, 40);
for (let index = 0; index < samples.length; index += 1) {
  buffer.writeInt16LE(samples[index], 44 + index * 2);
}

await writeFile(outputPath, buffer);
console.log(JSON.stringify({ outputPath, sampleRate, durationSeconds, bytes: buffer.length }));
