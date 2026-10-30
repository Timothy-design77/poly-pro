// Sample editing helpers, moved verbatim from CustomSampleManager.

/** Detect content boundaries above threshold. Returns 0–1 fractions. */
export function detectContent(pcm: Float32Array, threshold: number): { start: number; end: number } {
  let s = 0;
  let e = pcm.length - 1;
  while (s < pcm.length && Math.abs(pcm[s]) < threshold) s++;
  while (e > s && Math.abs(pcm[e]) < threshold) e--;
  // Pre-roll 1ms, post-tail 10ms
  s = Math.max(0, s - 48);
  e = Math.min(pcm.length - 1, e + 480);
  return { start: s / pcm.length, end: (e + 1) / pcm.length };
}

/** Linear interpolation resample. */
export function resample(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const outLen = Math.round(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, pcm.length - 1);
    const frac = srcIdx - lo;
    out[i] = pcm[lo] * (1 - frac) + pcm[hi] * frac;
  }
  return out;
}

/** Encode Float32Array to 16-bit mono WAV blob, normalized to -0.9dB. */
export function float32ToWav(pcm: Float32Array, sampleRate: number): Blob {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const abs = Math.abs(pcm[i]);
    if (abs > peak) peak = abs;
  }
  const scale = peak > 0 ? 0.9 / peak : 1;

  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };

  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i] * scale;
    v.setInt16(off, Math.max(-32768, Math.min(32767, s < 0 ? s * 0x8000 : s * 0x7FFF)), true);
    off += 2;
  }

  return new Blob([buf], { type: 'audio/wav' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
