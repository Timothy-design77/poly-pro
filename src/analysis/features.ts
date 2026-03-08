/**
 * Spectral Feature Extraction — Phase 8
 *
 * Extracts per-onset spectral features for instrument classification.
 * Features: spectral centroid, bandwidth, rolloff, ZCR, 5-band energy, attack time.
 *
 * Uses a 2048-sample FFT window centered on each onset for spectral features,
 * and a shorter window for temporal features (attack time).
 */

import type { DetectedOnset, SpectralFeatures, AnalysisProgress } from './types';

type ProgressCallback = (progress: AnalysisProgress) => void;

// ─── FFT (standalone, duplicated from onset-detection to keep module independent) ───

function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const N = real.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
  }
  for (let size = 2; size <= N; size *= 2) {
    const half = size / 2;
    const angle = -2 * Math.PI / size;
    const wR = Math.cos(angle);
    const wI = Math.sin(angle);
    for (let i = 0; i < N; i += size) {
      let curR = 1, curI = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const tR = curR * real[b] - curI * imag[b];
        const tI = curR * imag[b] + curI * real[b];
        real[b] = real[a] - tR;
        imag[b] = imag[a] - tI;
        real[a] += tR;
        imag[a] += tI;
        const nextR = curR * wR - curI * wI;
        curI = curR * wI + curI * wR;
        curR = nextR;
      }
    }
  }
}

// ─── Hann Window ───

function hannWindow(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return w;
}

// ─── Feature Extraction ───

const FFT_SIZE = 2048;

/** Band edges in Hz for 5-band energy: [sub-bass, low, mid, hi-mid, high] */
const BAND_EDGES = [0, 200, 800, 2500, 6000, 24000];

/**
 * Extract spectral features for a single onset.
 *
 * @param pcm - Full PCM buffer
 * @param sampleRate - Sample rate (typically 48000)
 * @param onsetSample - Sample index of the onset
 */
export function extractOnsetFeatures(
  pcm: Float32Array,
  sampleRate: number,
  onsetSample: number,
): SpectralFeatures {
  // Extract a window centered slightly after onset (onset + 0 to onset + FFT_SIZE)
  // This captures the body of the hit, not the silence before it
  const start = Math.max(0, onsetSample);
  const end = Math.min(pcm.length, start + FFT_SIZE);
  const windowLen = end - start;

  // Apply Hann window
  const hann = hannWindow(FFT_SIZE);
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);

  for (let i = 0; i < windowLen; i++) {
    real[i] = pcm[start + i] * hann[i];
  }

  // FFT
  fftInPlace(real, imag);

  // Magnitude spectrum (only positive frequencies)
  const numBins = FFT_SIZE / 2;
  const magnitudes = new Float32Array(numBins);
  let totalEnergy = 0;

  for (let i = 0; i < numBins; i++) {
    magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    totalEnergy += magnitudes[i] * magnitudes[i];
  }

  const binFreq = sampleRate / FFT_SIZE; // Hz per bin

  // ─── Spectral Centroid ───
  let weightedSum = 0;
  let magSum = 0;
  for (let i = 1; i < numBins; i++) {
    const freq = i * binFreq;
    weightedSum += freq * magnitudes[i];
    magSum += magnitudes[i];
  }
  const centroid = magSum > 0 ? weightedSum / magSum : 0;

  // ─── Spectral Bandwidth ───
  let bwSum = 0;
  for (let i = 1; i < numBins; i++) {
    const freq = i * binFreq;
    const diff = freq - centroid;
    bwSum += magnitudes[i] * diff * diff;
  }
  const bandwidth = magSum > 0 ? Math.sqrt(bwSum / magSum) : 0;

  // ─── Spectral Rolloff (85% energy) ───
  const rolloffThreshold = totalEnergy * 0.85;
  let cumulativeEnergy = 0;
  let rolloff = 0;
  for (let i = 0; i < numBins; i++) {
    cumulativeEnergy += magnitudes[i] * magnitudes[i];
    if (cumulativeEnergy >= rolloffThreshold) {
      rolloff = i * binFreq;
      break;
    }
  }

  // ─── Band Energy (5 bands) ───
  const bandEnergy: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (let i = 0; i < numBins; i++) {
    const freq = i * binFreq;
    const energy = magnitudes[i] * magnitudes[i];
    for (let b = 0; b < 5; b++) {
      if (freq >= BAND_EDGES[b] && freq < BAND_EDGES[b + 1]) {
        bandEnergy[b] += energy;
        break;
      }
    }
  }
  // Normalize band energies to proportions
  if (totalEnergy > 0) {
    for (let b = 0; b < 5; b++) {
      bandEnergy[b] /= totalEnergy;
    }
  }

  // ─── Zero Crossing Rate ───
  let crossings = 0;
  for (let i = start + 1; i < end; i++) {
    if ((pcm[i] >= 0 && pcm[i - 1] < 0) || (pcm[i] < 0 && pcm[i - 1] >= 0)) {
      crossings++;
    }
  }
  const zeroCrossingRate = windowLen > 1 ? crossings / (windowLen - 1) : 0;

  // ─── Attack Time ───
  // Measure time from onset to peak amplitude (in ms)
  const attackWindowSamples = Math.min(Math.round(sampleRate * 0.020), pcm.length - onsetSample); // 20ms max
  let peakVal = 0;
  let peakIdx = 0;
  for (let i = 0; i < attackWindowSamples; i++) {
    const idx = onsetSample + i;
    if (idx >= pcm.length) break;
    const absVal = Math.abs(pcm[idx]);
    if (absVal > peakVal) {
      peakVal = absVal;
      peakIdx = i;
    }
  }
  const attackTime = (peakIdx / sampleRate) * 1000; // ms

  return {
    centroid,
    bandwidth,
    rolloff,
    zeroCrossingRate,
    bandEnergy,
    attackTime,
  };
}

/**
 * Extract spectral features for all detected onsets.
 *
 * @param pcm - Full PCM buffer
 * @param sampleRate - Sample rate
 * @param onsets - Detected onsets with time in seconds
 * @param onProgress - Progress callback
 */
export async function extractAllFeatures(
  pcm: Float32Array,
  sampleRate: number,
  onsets: DetectedOnset[],
  onProgress?: ProgressCallback,
): Promise<SpectralFeatures[]> {
  const features: SpectralFeatures[] = [];
  const batchSize = 50; // Process in batches to yield to main thread

  for (let i = 0; i < onsets.length; i++) {
    const onsetSample = Math.round(onsets[i].time * sampleRate);
    features.push(extractOnsetFeatures(pcm, sampleRate, onsetSample));

    if ((i + 1) % batchSize === 0) {
      onProgress?.({ stage: 'spectral-features', progress: (i + 1) / onsets.length });
      // Yield to main thread
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  onProgress?.({ stage: 'spectral-features', progress: 1 });
  return features;
}
