/**
 * Spectrogram — FFT-based frequency band extraction.
 *
 * Takes raw PCM audio (Float32Array) and produces per-window energy
 * for three frequency bands:
 *   Bass  (20–500 Hz)   → warm red/orange
 *   Mid   (500–4000 Hz) → green
 *   High  (4000 Hz+)    → cyan/blue
 *
 * Used by TimelineTab to render a frequency-colored waveform.
 */

export interface SpectrogramData {
  /** Per-window RMS energy for bass band (20–500 Hz) */
  bass: Float32Array;
  /** Per-window RMS energy for mid band (500–4000 Hz) */
  mid: Float32Array;
  /** Per-window RMS energy for high band (4000+ Hz) */
  high: Float32Array;
  /** Per-window total RMS (for coloring/sizing) */
  total: Float32Array;
  /** Downsampled peak envelope for mini-map (256 points max) */
  miniMapEnvelope: Float32Array;
  /** Number of FFT windows */
  windowCount: number;
  /** Samples per hop (for time alignment) */
  hopSize: number;
  /** Sample rate of the source audio */
  sampleRate: number;
  /** Peak total energy (for normalization) */
  peakEnergy: number;
}

const FFT_SIZE = 512;
const HOP_SIZE = 256;

/**
 * Hann window function — reduces spectral leakage.
 */
function createHannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return win;
}

/**
 * Simple in-place radix-2 Cooley-Tukey FFT.
 * Operates on interleaved [real, imag, real, imag, ...] buffer.
 */
function fftInPlace(buf: Float32Array, n: number): void {
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      // Swap real parts
      let tmp = buf[i * 2];
      buf[i * 2] = buf[j * 2];
      buf[j * 2] = tmp;
      // Swap imag parts
      tmp = buf[i * 2 + 1];
      buf[i * 2 + 1] = buf[j * 2 + 1];
      buf[j * 2 + 1] = tmp;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wR = Math.cos(angle);
    const wI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curR = 1, curI = 0;
      for (let j = 0; j < halfLen; j++) {
        const evenIdx = (i + j) * 2;
        const oddIdx = (i + j + halfLen) * 2;

        const tR = curR * buf[oddIdx] - curI * buf[oddIdx + 1];
        const tI = curR * buf[oddIdx + 1] + curI * buf[oddIdx];

        buf[oddIdx] = buf[evenIdx] - tR;
        buf[oddIdx + 1] = buf[evenIdx + 1] - tI;
        buf[evenIdx] += tR;
        buf[evenIdx + 1] += tI;

        const newR = curR * wR - curI * wI;
        curI = curR * wI + curI * wR;
        curR = newR;
      }
    }
  }
}

/**
 * Compute spectrogram data from raw PCM audio.
 *
 * @param pcm - Raw Float32Array of mono audio samples
 * @param sampleRate - Sample rate (e.g. 48000)
 * @returns SpectrogramData with per-band energy arrays
 */
export function computeSpectrogram(pcm: Float32Array, sampleRate: number): SpectrogramData {
  const windowCount = Math.max(1, Math.floor((pcm.length - FFT_SIZE) / HOP_SIZE) + 1);

  const bass = new Float32Array(windowCount);
  const mid = new Float32Array(windowCount);
  const high = new Float32Array(windowCount);
  const total = new Float32Array(windowCount);

  const hannWindow = createHannWindow(FFT_SIZE);
  const halfFFT = FFT_SIZE / 2;
  const freqPerBin = sampleRate / FFT_SIZE;

  // Precompute bin ranges for each band
  const bassCutoff = Math.ceil(500 / freqPerBin);      // ~500 Hz
  const midCutoff = Math.ceil(4000 / freqPerBin);      // ~4000 Hz
  // high = midCutoff to halfFFT

  // Interleaved FFT buffer [real, imag, real, imag, ...]
  const fftBuf = new Float32Array(FFT_SIZE * 2);

  let peakEnergy = 0;

  for (let w = 0; w < windowCount; w++) {
    const offset = w * HOP_SIZE;

    // Fill FFT buffer with windowed samples
    for (let i = 0; i < FFT_SIZE; i++) {
      const sampleIdx = offset + i;
      fftBuf[i * 2] = sampleIdx < pcm.length ? pcm[sampleIdx] * hannWindow[i] : 0;
      fftBuf[i * 2 + 1] = 0;
    }

    // Run FFT
    fftInPlace(fftBuf, FFT_SIZE);

    // Extract band energies (sum of squared magnitudes)
    let bassE = 0, midE = 0, highE = 0;

    for (let bin = 1; bin < halfFFT; bin++) {
      const re = fftBuf[bin * 2];
      const im = fftBuf[bin * 2 + 1];
      const mag2 = re * re + im * im;

      if (bin < bassCutoff) {
        bassE += mag2;
      } else if (bin < midCutoff) {
        midE += mag2;
      } else {
        highE += mag2;
      }
    }

    // RMS-like normalization
    bass[w] = Math.sqrt(bassE / bassCutoff);
    mid[w] = Math.sqrt(midE / (midCutoff - bassCutoff));
    high[w] = Math.sqrt(highE / (halfFFT - midCutoff));
    total[w] = Math.sqrt((bassE + midE + highE) / halfFFT);

    if (total[w] > peakEnergy) peakEnergy = total[w];
  }

  // Normalize all bands to 0–1 range using peak energy
  if (peakEnergy > 0) {
    const invPeak = 1 / peakEnergy;
    for (let w = 0; w < windowCount; w++) {
      bass[w] = Math.min(1, bass[w] * invPeak);
      mid[w] = Math.min(1, mid[w] * invPeak);
      high[w] = Math.min(1, high[w] * invPeak);
      total[w] = Math.min(1, total[w] * invPeak);
    }
  }

  // Mini-map: downsample to max 512 points using peak envelope
  const miniMapSize = Math.min(512, windowCount);
  const miniMapEnvelope = new Float32Array(miniMapSize);
  const windowsPerPoint = windowCount / miniMapSize;

  for (let i = 0; i < miniMapSize; i++) {
    const start = Math.floor(i * windowsPerPoint);
    const end = Math.floor((i + 1) * windowsPerPoint);
    let peak = 0;
    for (let w = start; w < end && w < windowCount; w++) {
      if (total[w] > peak) peak = total[w];
    }
    miniMapEnvelope[i] = peak;
  }

  return {
    bass,
    mid,
    high,
    total,
    miniMapEnvelope,
    windowCount,
    hopSize: HOP_SIZE,
    sampleRate,
    peakEnergy,
  };
}

/**
 * Apply a high-pass filter to the spectrogram by zeroing bass energy
 * below the cutoff frequency. Returns a new SpectrogramData with
 * filtered values (does not modify original).
 */
export function filterSpectrogram(
  data: SpectrogramData,
  highPassHz: number,
): SpectrogramData {
  if (highPassHz <= 20) return data; // No filter needed

  const freqPerBin = data.sampleRate / FFT_SIZE;
  const cutoffBin = Math.ceil(highPassHz / freqPerBin);
  const bassCutoff = Math.ceil(500 / freqPerBin);

  // If high-pass is above 500Hz, bass is fully zeroed, mid partially filtered
  const bassRatio = highPassHz >= 500 ? 0 : Math.max(0, 1 - cutoffBin / bassCutoff);
  const midStart = Math.ceil(500 / freqPerBin);
  const midEnd = Math.ceil(4000 / freqPerBin);
  const midRatio = highPassHz >= 4000 ? 0 : highPassHz <= 500 ? 1 : Math.max(0, 1 - (cutoffBin - midStart) / (midEnd - midStart));

  const newBass = new Float32Array(data.windowCount);
  const newMid = new Float32Array(data.windowCount);
  const newTotal = new Float32Array(data.windowCount);

  for (let w = 0; w < data.windowCount; w++) {
    newBass[w] = data.bass[w] * bassRatio;
    newMid[w] = data.mid[w] * midRatio;
    newTotal[w] = newBass[w] + newMid[w] + data.high[w];
  }

  return {
    ...data,
    bass: newBass,
    mid: newMid,
    total: newTotal,
  };
}

/** Frequency band color constants */
export const BAND_COLORS = {
  bass: { h: 15, s: 80, l: 55 },   // Warm red/orange
  mid: { h: 140, s: 60, l: 50 },   // Green
  high: { h: 195, s: 80, l: 55 },  // Cyan/blue
} as const;

/** Convert HSL to CSS string with optional alpha */
export function bandColor(band: 'bass' | 'mid' | 'high', alpha = 1): string {
  const c = BAND_COLORS[band];
  return `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;
}
