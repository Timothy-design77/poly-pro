/**
 * Onset Detection — Post-Processing Pipeline (Mode 2)
 *
 * This is the PRIMARY onset detector. Runs after recording stops.
 * Operates on full raw PCM buffer from IndexedDB.
 *
 * Pipeline stages:
 *   1. Noise floor estimation (first 500ms of silence)
 *   2. Auto-latency detection (click bleed cross-correlation) — STUB for Phase 6
 *   3. Coarse onset detection (spectral flux, 256-sample window, 128-sample hop)
 *   4. Fine onset refinement (32-sample window, quadratic peak interpolation)
 *   5. Flam analysis (merge double-peaks within tempo-scaled window)
 *   6. Spectral feature extraction (deferred to Phase 8)
 *
 * All processing at native sample rate (48kHz).
 */

import type {
  DetectedOnset,
  AnalysisConfig,
  AnalysisProgress,
  SpectralFeatures,
} from './types';

type ProgressCallback = (progress: AnalysisProgress) => void;

// ─── Radix-2 Cooley-Tukey FFT ───

/**
 * In-place radix-2 FFT. N must be a power of 2.
 * real[] and imag[] are modified in place.
 */
function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const N = real.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < N; i += len) {
      let curReal = 1;
      let curImag = 0;

      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;

        const tReal = curReal * real[b] - curImag * imag[b];
        const tImag = curReal * imag[b] + curImag * real[b];

        real[b] = real[a] - tReal;
        imag[b] = imag[a] - tImag;
        real[a] += tReal;
        imag[a] += tImag;

        const nextReal = curReal * wReal - curImag * wImag;
        const nextImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
        curImag = nextImag;
      }
    }
  }
}

/**
 * Compute magnitude spectrum of a real signal frame using radix-2 FFT.
 * Returns N/2+1 magnitudes (DC through Nyquist).
 */
function magnitudeSpectrum(frame: Float32Array, fftSize: number): Float32Array {
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  // Copy frame into real part (zero-pad if shorter)
  const copyLen = Math.min(frame.length, fftSize);
  for (let i = 0; i < copyLen; i++) {
    real[i] = frame[i];
  }

  fftInPlace(real, imag);

  const magnitudes = new Float32Array((fftSize >> 1) + 1);
  for (let k = 0; k <= fftSize >> 1; k++) {
    magnitudes[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
  }
  return magnitudes;
}

/**
 * Apply Hann window in-place to a frame.
 */
function hannWindow(frame: Float32Array): Float32Array {
  const N = frame.length;
  const windowed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = frame[i] * w;
  }
  return windowed;
}

/**
 * Compute RMS energy of a frame.
 */
function rmsEnergy(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / frame.length);
}

// ─── High-Pass Filter ───

/**
 * Simple first-order IIR high-pass filter applied in-place.
 * y[n] = α * (y[n-1] + x[n] - x[n-1])
 * where α = RC / (RC + dt), RC = 1 / (2π × cutoffHz)
 */
export function applyHighPass(pcm: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  if (cutoffHz <= 0) return pcm;

  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);

  const out = new Float32Array(pcm.length);
  out[0] = pcm[0];
  for (let i = 1; i < pcm.length; i++) {
    out[i] = alpha * (out[i - 1] + pcm[i] - pcm[i - 1]);
  }
  return out;
}

// ─── Stage 1: Noise Floor ───

export function estimateNoiseFloor(
  pcm: Float32Array,
  sampleRate: number,
): number {
  // Analyze first 500ms
  const samples = Math.min(Math.floor(sampleRate * 0.5), pcm.length);
  if (samples < 256) return 0.001;

  let sumSq = 0;
  for (let i = 0; i < samples; i++) {
    sumSq += pcm[i] * pcm[i];
  }

  const rms = Math.sqrt(sumSq / samples);
  // Set noise gate at 2× the noise floor RMS
  return Math.max(rms * 2, 0.003);
}

// ─── Stage 2: Auto-Latency Detection ───
// STUB — full implementation in Phase 6 (calibration)

export function detectAutoLatency(
  _pcm: Float32Array,
  _sampleRate: number,
): number {
  // Returns 0ms offset for now
  // Phase 6 will implement click bleed cross-correlation
  return 0;
}

// ─── Stage 3: Coarse Onset Detection (Spectral Flux) ───

/**
 * Spectral flux onset detection.
 *
 * Algorithm:
 * 1. STFT with hop through the recording (256-sample window, 128-sample hop)
 * 2. Compute log-compressed spectral flux between consecutive frames
 * 3. Half-wave rectify (keep only increases)
 * 4. Adaptive threshold (median + factor × MAD over a local window)
 * 5. Peak pick from above-threshold regions
 */
export function detectOnsetsCoarse(
  pcm: Float32Array,
  sampleRate: number,
  noiseFloor: number,
  onProgress?: ProgressCallback,
): DetectedOnset[] {
  const windowSize = 256;
  const hopSize = 128;
  const fftSize = 256;
  const totalHops = Math.floor((pcm.length - windowSize) / hopSize);

  if (totalHops < 2) return [];

  // Compute spectral flux for each hop
  const fluxValues = new Float32Array(totalHops);
  let prevMag: Float32Array | null = null;

  for (let hop = 0; hop < totalHops; hop++) {
    const start = hop * hopSize;
    const frame = pcm.subarray(start, start + windowSize);
    const windowed = hannWindow(frame);
    const mag = magnitudeSpectrum(windowed, fftSize);

    if (prevMag) {
      // Spectral flux: sum of positive differences (half-wave rectified)
      let flux = 0;
      for (let k = 0; k < mag.length; k++) {
        // Log compression: log(1 + mag) avoids log(0)
        const logCurr = Math.log(1 + mag[k]);
        const logPrev = Math.log(1 + prevMag[k]);
        const diff = logCurr - logPrev;
        if (diff > 0) flux += diff;
      }
      fluxValues[hop] = flux;
    }

    prevMag = mag;

    // Progress + yield every 2000 hops (~500ms of audio)
    if (onProgress && hop % 2000 === 0) {
      onProgress({
        stage: 'coarse-onset',
        progress: hop / totalHops,
      });
    }
  }

  // Adaptive threshold: median filter + deviation
  const medianWindowSize = 51; // ~51 hops ≈ 340ms at 48kHz/128hop
  const thresholdFactor = 1.5;
  const minFlux = noiseFloor * 2; // Absolute minimum flux to consider

  const onsetCandidates: { hopIndex: number; flux: number; time: number }[] = [];

  for (let hop = 1; hop < totalHops - 1; hop++) {
    const flux = fluxValues[hop];
    if (flux < minFlux) continue;

    // Local median
    const halfWin = Math.floor(medianWindowSize / 2);
    const lo = Math.max(0, hop - halfWin);
    const hi = Math.min(totalHops, hop + halfWin + 1);
    const localValues: number[] = [];
    for (let j = lo; j < hi; j++) {
      localValues.push(fluxValues[j]);
    }
    localValues.sort((a, b) => a - b);
    const median = localValues[Math.floor(localValues.length / 2)];

    // Median absolute deviation
    const deviations: number[] = localValues.map((v) => Math.abs(v - median));
    deviations.sort((a, b) => a - b);
    const mad = deviations[Math.floor(deviations.length / 2)] || 0.001;

    const threshold = median + thresholdFactor * mad;

    // Peak: above threshold AND local maximum
    if (
      flux > threshold &&
      flux >= fluxValues[hop - 1] &&
      flux >= fluxValues[hop + 1]
    ) {
      const time = (hop * hopSize) / sampleRate;
      onsetCandidates.push({ hopIndex: hop, flux, time });
    }
  }

  // Convert candidates to DetectedOnset with peak amplitude
  const onsets: DetectedOnset[] = [];
  for (const cand of onsetCandidates) {
    const samplePos = cand.hopIndex * hopSize;
    // Find peak amplitude in a small window around the onset
    let peak = 0;
    const peakStart = Math.max(0, samplePos - 64);
    const peakEnd = Math.min(pcm.length, samplePos + 192);
    for (let i = peakStart; i < peakEnd; i++) {
      const abs = Math.abs(pcm[i]);
      if (abs > peak) peak = abs;
    }

    if (peak >= noiseFloor) {
      onsets.push({
        time: cand.time,
        peak,
        flux: cand.flux,
        isFlam: false,
      });
    }
  }

  return onsets;
}

// ─── Stage 4: Fine Onset Refinement ───

/**
 * Refine onset times using higher-resolution analysis.
 *
 * For each coarse onset, re-analyze a ±10ms window with
 * 32-sample frames and 16-sample hops (0.33ms resolution at 48kHz).
 * Find the energy peak and interpolate using quadratic fit.
 */
export function refineOnsets(
  pcm: Float32Array,
  sampleRate: number,
  coarseOnsets: DetectedOnset[],
): DetectedOnset[] {
  const refined: DetectedOnset[] = [];
  const windowSamples = Math.floor(sampleRate * 0.010); // ±10ms
  const frameSize = 32;
  const hopSize = 16;

  for (const onset of coarseOnsets) {
    const centerSample = Math.floor(onset.time * sampleRate);
    const searchStart = Math.max(0, centerSample - windowSamples);
    const searchEnd = Math.min(pcm.length - frameSize, centerSample + windowSamples);

    // Compute energy at each hop in the search window
    let maxEnergy = 0;
    let maxHop = 0;
    const energies: number[] = [];
    const hopPositions: number[] = [];

    for (let pos = searchStart; pos < searchEnd; pos += hopSize) {
      const frame = pcm.subarray(pos, pos + frameSize);
      const energy = rmsEnergy(frame);
      energies.push(energy);
      hopPositions.push(pos);

      if (energy > maxEnergy) {
        maxEnergy = energy;
        maxHop = energies.length - 1;
      }
    }

    if (energies.length < 3 || maxHop === 0 || maxHop === energies.length - 1) {
      refined.push(onset);
      continue;
    }

    // Quadratic interpolation around peak
    const e_prev = energies[maxHop - 1];
    const e_peak = energies[maxHop];
    const e_next = energies[maxHop + 1];

    const denom = e_prev - 2 * e_peak + e_next;
    let fractionalOffset = 0;
    if (Math.abs(denom) > 1e-10) {
      fractionalOffset = 0.5 * (e_prev - e_next) / denom;
      fractionalOffset = Math.max(-0.5, Math.min(0.5, fractionalOffset));
    }

    const refinedSample = hopPositions[maxHop] + fractionalOffset * hopSize;
    const refinedTime = refinedSample / sampleRate;

    // Update peak amplitude
    let peak = 0;
    const peakStart = Math.max(0, Math.floor(refinedSample) - 32);
    const peakEnd = Math.min(pcm.length, Math.floor(refinedSample) + 96);
    for (let i = peakStart; i < peakEnd; i++) {
      const abs = Math.abs(pcm[i]);
      if (abs > peak) peak = abs;
    }

    refined.push({
      time: refinedTime,
      peak,
      flux: onset.flux,
      isFlam: false,
    });
  }

  return refined;
}

// ─── Stage 5: Flam Analysis ───

/**
 * Detect and merge flams (double-strikes).
 *
 * Examines pairs of onsets within the flam merge window.
 * If two onsets are close together, merge them:
 * - Keep the louder onset's time
 * - Mark as flam
 */
export function analyzeFlams(
  onsets: DetectedOnset[],
  flamMergeSeconds: number,
): DetectedOnset[] {
  if (onsets.length < 2) return [...onsets];

  const sorted = [...onsets].sort((a, b) => a.time - b.time);
  const merged: DetectedOnset[] = [];
  let i = 0;

  while (i < sorted.length) {
    const current = sorted[i];

    if (i + 1 < sorted.length) {
      const next = sorted[i + 1];
      const gap = next.time - current.time;

      if (gap < flamMergeSeconds) {
        const primary = current.peak >= next.peak ? current : next;
        merged.push({
          time: primary.time,
          peak: Math.max(current.peak, next.peak),
          flux: Math.max(current.flux, next.flux),
          isFlam: true,
        });
        i += 2;
        continue;
      }
    }

    merged.push(current);
    i++;
  }

  return merged;
}

// ─── Stage 6: Spectral Feature Extraction ───
// Deferred to Phase 8 — returns null features for now

export function extractSpectralFeatures(
  _pcm: Float32Array,
  _sampleRate: number,
  _onsetTime: number,
): SpectralFeatures | null {
  return null;
}

// ─── Full Pipeline ───

/**
 * Run the complete onset detection pipeline on raw PCM audio.
 */
export async function runOnsetDetection(
  pcm: Float32Array,
  config: AnalysisConfig,
  bpm: number,
  subdivision: number,
  onProgress?: ProgressCallback,
): Promise<{
  onsets: DetectedOnset[];
  noiseFloor: number;
  autoLatencyMs: number;
}> {
  const sampleRate = config.sampleRate;
  const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

  // Stage 1: Noise floor estimation
  onProgress?.({ stage: 'noise-floor', progress: 0 });
  const noiseFloor = estimateNoiseFloor(pcm, sampleRate);
  const effectiveNoiseGate = Math.max(noiseFloor, config.noiseGate);
  onProgress?.({ stage: 'noise-floor', progress: 1 });
  await yieldToMain();

  // Stage 2: Auto-latency
  onProgress?.({ stage: 'latency-detect', progress: 0 });
  const autoLatencyMs = detectAutoLatency(pcm, sampleRate);
  onProgress?.({ stage: 'latency-detect', progress: 1 });
  await yieldToMain();

  // Apply high-pass filter if configured
  let processedPcm = pcm;
  if (config.highPassHz > 0) {
    processedPcm = applyHighPass(pcm, sampleRate, config.highPassHz);
  }

  // Stage 3: Coarse onset detection
  onProgress?.({ stage: 'coarse-onset', progress: 0 });
  const coarseOnsets = detectOnsetsCoarse(
    processedPcm,
    sampleRate,
    effectiveNoiseGate,
    onProgress,
  );
  onProgress?.({ stage: 'coarse-onset', progress: 1 });
  await yieldToMain();

  // Stage 4: Fine onset refinement
  onProgress?.({ stage: 'fine-onset', progress: 0 });
  const refinedOnsets = refineOnsets(processedPcm, sampleRate, coarseOnsets);
  onProgress?.({ stage: 'fine-onset', progress: 1 });
  await yieldToMain();

  // Stage 5: Flam analysis
  onProgress?.({ stage: 'flam-analysis', progress: 0 });
  const flamMergeS =
    (60 / bpm / subdivision) * (config.flamMergePct / 100);
  const finalOnsets = analyzeFlams(refinedOnsets, flamMergeS);
  onProgress?.({ stage: 'flam-analysis', progress: 1 });
  await yieldToMain();

  // Stage 6: Spectral features (Phase 8 — no-op for now)
  onProgress?.({ stage: 'spectral-features', progress: 1 });

  return {
    onsets: finalOnsets,
    noiseFloor,
    autoLatencyMs,
  };
}
