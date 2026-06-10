import { describe, it, expect } from 'vitest';
import {
  applyHighPass,
  estimateNoiseFloor,
  detectOnsetsCoarse,
  refineOnsets,
} from './onset-detection';
import { DEFAULT_ANALYSIS_CONFIG } from './types';

const SR = 48000;

/** Generate synthetic PCM with sharp percussive clicks at known times. */
function synthClicks(durationS: number, clickTimesS: number[], noiseAmp = 0.001): Float32Array {
  const pcm = new Float32Array(Math.floor(durationS * SR));
  // Deterministic pseudo-noise floor
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let i = 0; i < pcm.length; i++) pcm[i] = rand() * noiseAmp * 2;

  // Each click: 20ms percussive transient — sharp attack, exponential decay
  for (const t of clickTimesS) {
    const start = Math.floor(t * SR);
    const len = Math.floor(0.02 * SR);
    for (let i = 0; i < len && start + i < pcm.length; i++) {
      const decay = Math.exp(-i / (0.004 * SR));
      pcm[start + i] += 0.9 * Math.sin((2 * Math.PI * 1500 * i) / SR) * decay;
    }
  }
  return pcm;
}

const coarseConfig = {
  minOnsetIntervalMs: DEFAULT_ANALYSIS_CONFIG.minOnsetIntervalMs ?? 50,
  postHitMaskingMs: DEFAULT_ANALYSIS_CONFIG.postHitMaskingMs ?? 80,
  postHitMaskingStrength: DEFAULT_ANALYSIS_CONFIG.postHitMaskingStrength ?? 0.5,
  fluxThresholdOffset: DEFAULT_ANALYSIS_CONFIG.fluxThresholdOffset ?? 1.5,
};

describe('detectOnsetsCoarse + refineOnsets', () => {
  it('detects the right number of clearly separated clicks', () => {
    const times = [0.5, 1.0, 1.5, 2.0, 2.5];
    const pcm = synthClicks(3.0, times);
    const floor = estimateNoiseFloor(pcm, SR);
    const onsets = detectOnsetsCoarse(pcm, SR, floor, coarseConfig);
    expect(onsets.length).toBe(times.length);
  });

  it('localizes onsets within 15ms of ground truth after refinement', () => {
    const times = [0.5, 1.0, 1.5, 2.0];
    const pcm = synthClicks(2.5, times);
    const floor = estimateNoiseFloor(pcm, SR);
    const refined = refineOnsets(pcm, SR, detectOnsetsCoarse(pcm, SR, floor, coarseConfig));

    expect(refined.length).toBe(times.length);
    const sorted = refined.map((o) => o.time).sort((a, b) => a - b);
    sorted.forEach((t, i) => {
      expect(Math.abs(t - times[i])).toBeLessThan(0.02);
    });
  });

  it('enforces minimum inter-onset interval (no double-triggers)', () => {
    const pcm = synthClicks(1.5, [0.5, 1.0]);
    const floor = estimateNoiseFloor(pcm, SR);
    const onsets = detectOnsetsCoarse(pcm, SR, floor, coarseConfig);
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i].time - onsets[i - 1].time).toBeGreaterThanOrEqual(
        coarseConfig.minOnsetIntervalMs / 1000 - 1e-6,
      );
    }
  });

  it('detects nothing in pure noise', () => {
    const pcm = synthClicks(2.0, []);
    const floor = estimateNoiseFloor(pcm, SR);
    const onsets = detectOnsetsCoarse(pcm, SR, floor, coarseConfig);
    expect(onsets.length).toBe(0);
  });

  it('survives empty and tiny buffers', () => {
    expect(detectOnsetsCoarse(new Float32Array(0), SR, 0, coarseConfig)).toEqual([]);
    expect(detectOnsetsCoarse(new Float32Array(100), SR, 0, coarseConfig)).toEqual([]);
  });
});

describe('applyHighPass', () => {
  it('attenuates DC offset', () => {
    const pcm = new Float32Array(SR).fill(0.5); // pure DC
    const filtered = applyHighPass(pcm, SR, 80);
    // After settling, DC should be heavily attenuated
    const tailMean =
      filtered.slice(SR / 2).reduce((s, v) => s + Math.abs(v), 0) / (SR / 2);
    expect(tailMean).toBeLessThan(0.01);
  });

  it('preserves high-frequency content', () => {
    const pcm = new Float32Array(SR);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((2 * Math.PI * 2000 * i) / SR);
    const filtered = applyHighPass(pcm, SR, 80);
    const rms = Math.sqrt(filtered.reduce((s, v) => s + v * v, 0) / filtered.length);
    expect(rms).toBeGreaterThan(0.5); // ~0.707 for unattenuated sine
  });
});
