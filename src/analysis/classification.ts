/**
 * KNN Instrument Classifier — Phase 8
 *
 * Local k-nearest-neighbors classifier trained on user's own instrument profiles.
 * k=5, Euclidean distance on normalized feature vectors.
 *
 * Confidence tiers:
 *   ≥ 0.75  → Full label, normal opacity
 *   0.40–0.74 → Dimmed label, tap for breakdown
 *   < 0.40  → "Unknown", neutral gray
 */

import type { SpectralFeatures } from './types';

// ─── Types ───

/** Supported instrument categories */
export type InstrumentName =
  | 'Kick'
  | 'Snare'
  | 'Hi-Hat'
  | 'Tom Hi'
  | 'Tom Lo'
  | 'Ride'
  | 'Crash'
  | 'Other';

/** A single training sample: features + label */
export interface TrainingSample {
  features: SpectralFeatures;
  label: InstrumentName;
}

/** Per-instrument profile stored in IDB */
export interface InstrumentProfile {
  name: InstrumentName;
  samples: TrainingSample[];
  /** Accuracy from leave-one-out cross-validation */
  accuracy: number;
  /** When this profile was last trained */
  lastTrained: string;
}

/** Classification result for a single onset */
export interface ClassificationResult {
  /** Predicted instrument */
  label: InstrumentName | 'Unknown';
  /** Confidence score (0–1) */
  confidence: number;
  /** Top 3 candidates with their scores */
  topCandidates: Array<{ label: InstrumentName; score: number }>;
}

/** Per-instrument aggregated metrics for display */
export interface InstrumentMetrics {
  name: InstrumentName | 'Unknown';
  hitCount: number;
  meanOffset: number;
  sigma: number;
  /** Distribution of deltas for mini-bar visualization */
  deltas: number[];
  /** Fatigue: last-quarter σ / first-quarter σ (>1 = degrading) */
  fatigueRatio: number;
  /** Relative velocity: mean peak amplitude (0–1 scale) */
  meanPeak: number;
  /** Instrument balance: this instrument's mean peak / global mean peak */
  balanceRatio: number;
}

/** Inter-limb correlation result */
export interface InterLimbCorrelation {
  instrumentA: InstrumentName | 'Unknown';
  instrumentB: InstrumentName | 'Unknown';
  /** Pearson r of simultaneous deviations (-1 to 1) */
  correlation: number;
  /** Number of simultaneous pairs used */
  pairCount: number;
}

// ─── Feature Normalization ───

/** Convert SpectralFeatures to a flat number array for distance computation */
function featuresToVector(f: SpectralFeatures): number[] {
  return [
    f.centroid,
    f.bandwidth,
    f.rolloff,
    f.zeroCrossingRate,
    ...f.bandEnergy,
    f.attackTime,
  ];
}

/** Feature-wise min/max for normalization */
interface NormParams {
  mins: number[];
  maxs: number[];
}

function computeNormParams(samples: TrainingSample[]): NormParams {
  if (samples.length === 0) {
    return { mins: new Array(10).fill(0), maxs: new Array(10).fill(1) };
  }

  const dim = 10; // Total feature dimensions
  const mins = new Array(dim).fill(Infinity);
  const maxs = new Array(dim).fill(-Infinity);

  for (const s of samples) {
    const v = featuresToVector(s.features);
    for (let i = 0; i < dim; i++) {
      if (v[i] < mins[i]) mins[i] = v[i];
      if (v[i] > maxs[i]) maxs[i] = v[i];
    }
  }

  // Prevent division by zero
  for (let i = 0; i < dim; i++) {
    if (maxs[i] === mins[i]) maxs[i] = mins[i] + 1;
  }

  return { mins, maxs };
}

function normalizeVector(v: number[], norm: NormParams): number[] {
  return v.map((val, i) => (val - norm.mins[i]) / (norm.maxs[i] - norm.mins[i]));
}

/** Euclidean distance between two vectors */
function euclideanDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// ─── KNN Classifier ───

const K = 5;

/**
 * KNN classifier instance. Maintains training data and normalization params.
 */
export class KNNClassifier {
  private samples: TrainingSample[] = [];
  private norm: NormParams = { mins: [], maxs: [] };

  /** Load training data (from all instrument profiles) */
  loadProfiles(profiles: InstrumentProfile[]): void {
    this.samples = [];
    for (const p of profiles) {
      this.samples.push(...p.samples);
    }
    this.norm = computeNormParams(this.samples);
  }

  /** Check if classifier has enough data to classify */
  isReady(): boolean {
    return this.samples.length >= K;
  }

  /** Get unique instrument labels in training data */
  getLabels(): InstrumentName[] {
    const labels = new Set<InstrumentName>();
    for (const s of this.samples) labels.add(s.label);
    return Array.from(labels);
  }

  /**
   * Classify a single onset's spectral features.
   */
  classify(features: SpectralFeatures): ClassificationResult {
    if (!this.isReady()) {
      return { label: 'Unknown', confidence: 0, topCandidates: [] };
    }

    const query = normalizeVector(featuresToVector(features), this.norm);

    // Compute distances to all training samples
    const distances: Array<{ label: InstrumentName; dist: number }> = [];
    for (const s of this.samples) {
      const sv = normalizeVector(featuresToVector(s.features), this.norm);
      distances.push({ label: s.label, dist: euclideanDist(query, sv) });
    }

    // Sort by distance, take top K
    distances.sort((a, b) => a.dist - b.dist);
    const neighbors = distances.slice(0, K);

    // Weighted vote (inverse distance)
    const votes = new Map<InstrumentName, number>();
    for (const n of neighbors) {
      const weight = 1 / (n.dist + 1e-6); // Avoid division by zero
      votes.set(n.label, (votes.get(n.label) || 0) + weight);
    }

    // Sort by vote weight
    const sorted = Array.from(votes.entries()).sort((a, b) => b[1] - a[1]);
    const totalWeight = sorted.reduce((sum, [, w]) => sum + w, 0);

    // Top candidate
    const topLabel = sorted[0][0];
    const confidence = totalWeight > 0 ? sorted[0][1] / totalWeight : 0;

    // Top 3 candidates
    const topCandidates = sorted.slice(0, 3).map(([label, w]) => ({
      label,
      score: totalWeight > 0 ? w / totalWeight : 0,
    }));

    return {
      label: confidence >= 0.40 ? topLabel : 'Unknown',
      confidence,
      topCandidates,
    };
  }

  /**
   * Classify all onsets in batch.
   */
  classifyAll(featuresList: SpectralFeatures[]): ClassificationResult[] {
    return featuresList.map((f) => this.classify(f));
  }

  /**
   * Classify with band-pass pseudo-separation for simultaneous hit detection.
   * If the full-spectrum classification is ambiguous (<0.60 confidence),
   * check band-isolated features to see if multiple instruments are present.
   *
   * Returns primary classification + optional secondary instrument.
   */
  classifyWithBands(features: SpectralFeatures): ClassificationResult & { secondary?: ClassificationResult } {
    const primary = this.classify(features);

    if (!features.bandIsolated || primary.confidence >= 0.60) {
      return primary;
    }

    // Check if different bands suggest different instruments
    const bands = features.bandIsolated;
    const bandResults: Array<{ band: string; result: ClassificationResult; energyRatio: number }> = [];

    for (const [bandName, bandData] of Object.entries(bands)) {
      if (!bandData.active) continue;

      // Create synthetic features emphasizing this band
      const synth: SpectralFeatures = {
        ...features,
        centroid: bandData.centroid,
        attackTime: bandData.attackTime,
        // Boost this band's energy proportion
        bandEnergy: [...features.bandEnergy] as [number, number, number, number, number],
      };

      // Adjust band energy to emphasize the isolated band
      if (bandName === 'low') {
        synth.bandEnergy[0] = 0.7;
        synth.bandEnergy[1] = 0.2;
        synth.bandEnergy[2] = 0.05;
        synth.bandEnergy[3] = 0.03;
        synth.bandEnergy[4] = 0.02;
      } else if (bandName === 'mid') {
        synth.bandEnergy[0] = 0.05;
        synth.bandEnergy[1] = 0.15;
        synth.bandEnergy[2] = 0.5;
        synth.bandEnergy[3] = 0.2;
        synth.bandEnergy[4] = 0.1;
      } else {
        synth.bandEnergy[0] = 0.02;
        synth.bandEnergy[1] = 0.03;
        synth.bandEnergy[2] = 0.1;
        synth.bandEnergy[3] = 0.35;
        synth.bandEnergy[4] = 0.5;
      }

      const result = this.classify(synth);
      bandResults.push({ band: bandName, result, energyRatio: bandData.energyRatio });
    }

    // Check if bands suggest different instruments
    const confidentBands = bandResults.filter((b) => b.result.confidence >= 0.50 && b.energyRatio >= 0.15);
    const uniqueLabels = new Set(confidentBands.map((b) => b.result.label));

    if (uniqueLabels.size >= 2) {
      // Multiple instruments detected — pick the two most confident
      confidentBands.sort((a, b) => b.result.confidence - a.result.confidence);
      return {
        ...confidentBands[0].result,
        secondary: confidentBands[1]?.result,
      };
    }

    return primary;
  }

  /**
   * Leave-one-out cross-validation for a single instrument.
   * Returns accuracy (0–1).
   */
  crossValidate(instrumentSamples: TrainingSample[]): number {
    if (instrumentSamples.length < K + 1) return 0;

    let correct = 0;

    for (let i = 0; i < instrumentSamples.length; i++) {
      // Build training set without sample i
      const trainSet = [
        ...instrumentSamples.slice(0, i),
        ...instrumentSamples.slice(i + 1),
        // Include samples from other instruments
        ...this.samples.filter((s) => s.label !== instrumentSamples[i].label),
      ];

      const tempNorm = computeNormParams(trainSet);
      const query = normalizeVector(featuresToVector(instrumentSamples[i].features), tempNorm);

      // KNN on trainSet
      const distances = trainSet.map((s) => ({
        label: s.label,
        dist: euclideanDist(query, normalizeVector(featuresToVector(s.features), tempNorm)),
      }));
      distances.sort((a, b) => a.dist - b.dist);
      const neighbors = distances.slice(0, K);

      // Majority vote
      const votes = new Map<InstrumentName, number>();
      for (const n of neighbors) {
        votes.set(n.label, (votes.get(n.label) || 0) + 1);
      }
      const predicted = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0][0];

      if (predicted === instrumentSamples[i].label) correct++;
    }

    return correct / instrumentSamples.length;
  }
}

/**
 * Compute per-instrument metrics from classified scored onsets.
 *
 * Only instruments with ≥10 high-confidence hits (≥0.75) get their own row.
 * Others grouped into "Unknown".
 *
 * Enhanced: also computes per-instrument fatigue and balance ratios.
 */
export function computeInstrumentMetrics(
  classifications: ClassificationResult[],
  deltas: number[],
  peaks?: number[],
): InstrumentMetrics[] {
  // Group hits by instrument
  const groups = new Map<string, { deltas: number[]; peaks: number[] }>();

  for (let i = 0; i < classifications.length; i++) {
    const c = classifications[i];
    const delta = deltas[i];
    if (delta === undefined) continue;

    // Only count high-confidence hits for per-instrument stats
    const key = c.confidence >= 0.75 ? c.label : 'Unknown';
    if (!groups.has(key)) {
      groups.set(key, { deltas: [], peaks: [] });
    }
    const g = groups.get(key)!;
    g.deltas.push(delta);
    g.peaks.push(peaks?.[i] ?? 0);
  }

  // Global mean peak for balance computation
  const allPeaks = peaks ?? [];
  const globalMeanPeak = allPeaks.length > 0
    ? allPeaks.reduce((s, p) => s + p, 0) / allPeaks.length
    : 1;

  const metrics: InstrumentMetrics[] = [];

  for (const [name, data] of groups) {
    // Only give own row to instruments with ≥10 high-confidence hits
    if (name !== 'Unknown' && data.deltas.length < 10) {
      // Merge into Unknown
      const unknownGroup = groups.get('Unknown') || { deltas: [], peaks: [] };
      unknownGroup.deltas.push(...data.deltas);
      unknownGroup.peaks.push(...data.peaks);
      groups.set('Unknown', unknownGroup);
      continue;
    }

    const meanOffset =
      data.deltas.reduce((s, d) => s + d, 0) / data.deltas.length;
    const variance =
      data.deltas.reduce((s, d) => s + (d - meanOffset) ** 2, 0) /
      data.deltas.length;
    const sigma = Math.sqrt(variance);

    // Per-instrument fatigue: compare first-quarter σ vs last-quarter σ
    let fatigueRatio = 1.0;
    if (data.deltas.length >= 8) {
      const quarter = Math.floor(data.deltas.length / 4);
      const firstQ = data.deltas.slice(0, quarter);
      const lastQ = data.deltas.slice(-quarter);
      const firstMean = firstQ.reduce((s, d) => s + d, 0) / firstQ.length;
      const lastMean = lastQ.reduce((s, d) => s + d, 0) / lastQ.length;
      const firstSigma = Math.sqrt(firstQ.reduce((s, d) => s + (d - firstMean) ** 2, 0) / firstQ.length);
      const lastSigma = Math.sqrt(lastQ.reduce((s, d) => s + (d - lastMean) ** 2, 0) / lastQ.length);
      fatigueRatio = firstSigma > 0.5 ? lastSigma / firstSigma : 1.0;
    }

    // Mean peak amplitude
    const meanPeak = data.peaks.length > 0
      ? data.peaks.reduce((s, p) => s + p, 0) / data.peaks.length
      : 0;

    // Balance: relative to global mean
    const balanceRatio = globalMeanPeak > 0.001 ? meanPeak / globalMeanPeak : 1.0;

    metrics.push({
      name: name as InstrumentName | 'Unknown',
      hitCount: data.deltas.length,
      meanOffset,
      sigma,
      deltas: data.deltas,
      fatigueRatio: Math.round(fatigueRatio * 100) / 100,
      meanPeak: Math.round(meanPeak * 1000) / 1000,
      balanceRatio: Math.round(balanceRatio * 100) / 100,
    });
  }

  // Sort: named instruments first (alphabetically), Unknown last
  metrics.sort((a, b) => {
    if (a.name === 'Unknown') return 1;
    if (b.name === 'Unknown') return -1;
    return a.name.localeCompare(b.name);
  });

  return metrics;
}

/**
 * Compute inter-limb correlation: Pearson r of timing deviations
 * between instruments that hit simultaneously (within 50ms window).
 *
 * High positive r = limbs speed up/slow down together.
 * High negative r = when one limb rushes, the other drags.
 * Near zero = independent timing.
 */
export function computeInterLimbCorrelation(
  classifications: ClassificationResult[],
  deltas: number[],
  times: number[],
): InterLimbCorrelation[] {
  // Group onset indices by instrument
  const instrumentOnsets = new Map<string, Array<{ time: number; delta: number }>>();

  for (let i = 0; i < classifications.length; i++) {
    const c = classifications[i];
    if (c.confidence < 0.75 || c.label === 'Unknown') continue;
    if (!instrumentOnsets.has(c.label)) instrumentOnsets.set(c.label, []);
    instrumentOnsets.get(c.label)!.push({ time: times[i], delta: deltas[i] });
  }

  const instruments = Array.from(instrumentOnsets.keys()).filter(
    (k) => (instrumentOnsets.get(k)?.length ?? 0) >= 10,
  );

  const results: InterLimbCorrelation[] = [];
  const SIMUL_WINDOW_S = 0.050; // 50ms window for "simultaneous"

  for (let a = 0; a < instruments.length; a++) {
    for (let b = a + 1; b < instruments.length; b++) {
      const onsetsA = instrumentOnsets.get(instruments[a])!;
      const onsetsB = instrumentOnsets.get(instruments[b])!;

      // Find simultaneous pairs
      const pairs: Array<{ deltaA: number; deltaB: number }> = [];
      let bIdx = 0;

      for (const hitA of onsetsA) {
        while (bIdx < onsetsB.length && onsetsB[bIdx].time < hitA.time - SIMUL_WINDOW_S) {
          bIdx++;
        }
        // Check all B hits within the window
        for (let j = bIdx; j < onsetsB.length && onsetsB[j].time <= hitA.time + SIMUL_WINDOW_S; j++) {
          pairs.push({ deltaA: hitA.delta, deltaB: onsetsB[j].delta });
        }
      }

      if (pairs.length < 5) continue;

      // Pearson r
      const n = pairs.length;
      const meanA = pairs.reduce((s, p) => s + p.deltaA, 0) / n;
      const meanB = pairs.reduce((s, p) => s + p.deltaB, 0) / n;
      let num = 0, denA = 0, denB = 0;
      for (const p of pairs) {
        const da = p.deltaA - meanA;
        const db = p.deltaB - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
      }
      const denom = Math.sqrt(denA * denB);
      const r = denom > 0 ? num / denom : 0;

      results.push({
        instrumentA: instruments[a] as InstrumentName,
        instrumentB: instruments[b] as InstrumentName,
        correlation: Math.round(r * 100) / 100,
        pairCount: pairs.length,
      });
    }
  }

  return results;
}

// ─── Instrument display info ───

export const INSTRUMENT_INFO: Record<InstrumentName, { icon: string; color: string }> = {
  'Kick':   { icon: '🥁', color: '#F87171' },  // red
  'Snare':  { icon: '🪘', color: '#60A5FA' },  // blue
  'Hi-Hat': { icon: '🔔', color: '#FBBF24' },  // amber
  'Tom Hi': { icon: '🥁', color: '#34D399' },  // green
  'Tom Lo': { icon: '🥁', color: '#A78BFA' },  // violet (not accent purple)
  'Ride':   { icon: '🔔', color: '#F472B6' },  // pink
  'Crash':  { icon: '💥', color: '#FB923C' },  // orange
  'Other':  { icon: '🎵', color: '#8B8B94' },  // muted
};
