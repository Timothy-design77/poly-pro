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
 */
export function computeInstrumentMetrics(
  classifications: ClassificationResult[],
  deltas: number[],
): InstrumentMetrics[] {
  // Group hits by instrument
  const groups = new Map<string, { deltas: number[] }>();

  for (let i = 0; i < classifications.length; i++) {
    const c = classifications[i];
    const delta = deltas[i];
    if (delta === undefined) continue;

    // Only count high-confidence hits for per-instrument stats
    const key = c.confidence >= 0.75 ? c.label : 'Unknown';
    if (!groups.has(key)) {
      groups.set(key, { deltas: [] });
    }
    groups.get(key)!.deltas.push(delta);
  }

  const metrics: InstrumentMetrics[] = [];

  for (const [name, data] of groups) {
    // Only give own row to instruments with ≥10 high-confidence hits
    if (name !== 'Unknown' && data.deltas.length < 10) {
      // Merge into Unknown
      const unknownGroup = groups.get('Unknown') || { deltas: [] };
      unknownGroup.deltas.push(...data.deltas);
      groups.set('Unknown', unknownGroup);
      continue;
    }

    const meanOffset =
      data.deltas.reduce((s, d) => s + d, 0) / data.deltas.length;
    const variance =
      data.deltas.reduce((s, d) => s + (d - meanOffset) ** 2, 0) /
      data.deltas.length;
    const sigma = Math.sqrt(variance);

    metrics.push({
      name: name as InstrumentName | 'Unknown',
      hitCount: data.deltas.length,
      meanOffset,
      sigma,
      deltas: data.deltas,
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
