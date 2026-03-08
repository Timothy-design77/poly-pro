/**
 * Calibration — Automated Loopback Chirp Test
 *
 * Measures system latency (speaker → mic round-trip) using frequency sweep chirps.
 *
 * Flow:
 * 1. Start mic recording (AudioWorklet already running)
 * 2. Wait 500ms for noise floor
 * 3. Play 5 chirps (200Hz→4kHz, 5ms each) 1 second apart
 * 4. Cross-correlate known chirp waveform with recorded audio
 * 5. Each correlation peak = latency measurement
 * 6. Trim outliers, compute median → system latency offset
 *
 * Why chirps: sharp autocorrelation peaks, resistant to room reflections,
 * frequency sweep covers drum onset detection range.
 */

const CHIRP_DURATION_S = 0.020; // 20ms — longer = sharper correlation peak
const CHIRP_FREQ_START = 200;   // Hz
const CHIRP_FREQ_END = 4000;    // Hz
const CHIRP_COUNT = 10;
const CHIRP_INTERVAL_S = 1.0;   // 1 second between chirps
const NOISE_FLOOR_WAIT_S = 0.5;

/**
 * Generate a linear frequency sweep (chirp) as a Float32Array.
 */
export function generateChirp(sampleRate: number): Float32Array {
  const numSamples = Math.floor(CHIRP_DURATION_S * sampleRate);
  const chirp = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Phase integral of linear sweep: 2π ∫ f(t) dt = 2π (f_start*t + 0.5*(f_end-f_start)*t²/dur)
    const phase =
      2 * Math.PI * (CHIRP_FREQ_START * t + 0.5 * (CHIRP_FREQ_END - CHIRP_FREQ_START) * t * t / CHIRP_DURATION_S);
    // Hann envelope to avoid clicks
    const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
    chirp[i] = envelope * Math.sin(phase);
  }

  return chirp;
}

/**
 * Create an AudioBuffer from the chirp waveform.
 */
export function createChirpBuffer(ctx: AudioContext): AudioBuffer {
  const chirpData = generateChirp(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, chirpData.length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  channel.set(chirpData);
  return buffer;
}

/**
 * Play the chirp through the speakers at a given AudioContext time.
 */
export function playChirp(ctx: AudioContext, buffer: AudioBuffer, time: number): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  // Play loud — needs to be clearly picked up by the mic
  const gain = ctx.createGain();
  gain.gain.value = 1.0;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(time);
}

/**
 * Normalized cross-correlation between a template and a signal segment.
 * Returns the lag (in samples) of the best match and the correlation value.
 *
 * Searches within [searchStart, searchEnd) of the signal.
 */
export function crossCorrelate(
  signal: Float32Array,
  template: Float32Array,
  searchStart: number,
  searchEnd: number,
): { lag: number; correlation: number } {
  const tLen = template.length;
  let bestLag = 0;
  let bestCorr = -Infinity;

  // Precompute template energy
  let tEnergy = 0;
  for (let i = 0; i < tLen; i++) {
    tEnergy += template[i] * template[i];
  }
  const tNorm = Math.sqrt(tEnergy) || 1;

  const end = Math.min(searchEnd, signal.length - tLen);

  for (let lag = searchStart; lag < end; lag++) {
    let dotProduct = 0;
    let sEnergy = 0;

    for (let i = 0; i < tLen; i++) {
      const s = signal[lag + i];
      dotProduct += s * template[i];
      sEnergy += s * s;
    }

    const sNorm = Math.sqrt(sEnergy) || 1;
    const corr = dotProduct / (tNorm * sNorm);

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  return { lag: bestLag, correlation: bestCorr };
}

/**
 * Run the full loopback calibration.
 *
 * @param ctx - The AudioContext (shared with metronome)
 * @param pcmChunks - Float32Array chunks accumulated during calibration recording
 * @param chirpPlayTimes - AudioContext times when each chirp was scheduled
 * @param recordingStartTime - AudioContext time when recording started
 * @param sampleRate - Recording sample rate
 *
 * @returns Array of latency measurements in ms, one per chirp
 */
export function measureLatencies(
  pcmChunks: Float32Array[],
  chirpPlayTimes: number[],
  recordingStartTime: number,
  sampleRate: number,
): { latencies: number[]; correlations: number[] } {
  // Combine chunks into single buffer
  const totalLength = pcmChunks.reduce((sum, c) => sum + c.length, 0);
  const recording = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of pcmChunks) {
    recording.set(chunk, offset);
    offset += chunk.length;
  }

  const chirpTemplate = generateChirp(sampleRate);
  const latencies: number[] = [];
  const correlations: number[] = [];

  for (let i = 0; i < chirpPlayTimes.length; i++) {
    const playTime = chirpPlayTimes[i];
    // Expected position in the recording (in samples)
    const expectedSample = Math.floor((playTime - recordingStartTime) * sampleRate);

    // Search window: from expected position to expected + 200ms (max reasonable latency)
    const searchStart = Math.max(0, expectedSample);
    const searchEnd = expectedSample + Math.floor(0.2 * sampleRate); // 200ms max

    if (searchEnd > recording.length) continue;

    const result = crossCorrelate(recording, chirpTemplate, searchStart, searchEnd);

    // Latency = detected position - expected position (in samples → ms)
    const latencySamples = result.lag - expectedSample;
    const latencyMs = (latencySamples / sampleRate) * 1000;

    latencies.push(latencyMs);
    correlations.push(result.correlation);
  }

  return { latencies, correlations };
}

/**
 * Compute the final calibration result from raw measurements.
 *
 * - Discard measurements with correlation < 0.3 (no confident match)
 * - Trim top/bottom outliers
 * - Return median
 */
export function computeCalibrationResult(
  latencies: number[],
  correlations: number[],
): {
  offsetMs: number;
  consistencyMs: number;
  accepted: number;
  total: number;
  quality: 'excellent' | 'good' | 'poor' | 'failed';
} {
  // Filter by correlation confidence — 0.5 minimum (stricter to reject false matches)
  const valid: number[] = [];
  for (let i = 0; i < latencies.length; i++) {
    if (correlations[i] >= 0.5 && latencies[i] >= 0 && latencies[i] < 200) {
      valid.push(latencies[i]);
    }
  }

  if (valid.length < 4) {
    return {
      offsetMs: 0,
      consistencyMs: Infinity,
      accepted: valid.length,
      total: latencies.length,
      quality: 'failed',
    };
  }

  // Sort and trim top/bottom — with 10 points, trim 2 from each end
  valid.sort((a, b) => a - b);
  let trimmed = valid;
  if (valid.length >= 6) {
    const trimCount = Math.floor(valid.length * 0.2); // trim 20% from each end
    trimmed = valid.slice(trimCount, valid.length - trimCount);
  }

  // Median
  const mid = Math.floor(trimmed.length / 2);
  const median = trimmed.length % 2 === 0
    ? (trimmed[mid - 1] + trimmed[mid]) / 2
    : trimmed[mid];

  // Check if values are tightly clustered — if range > 20ms, something is wrong
  const range = trimmed[trimmed.length - 1] - trimmed[0];
  if (range > 20) {
    // Measurements too spread out — likely false matches mixed in
    // Fall back to the tightest cluster
    const clusters = findTightestCluster(valid, 10); // 10ms window
    if (clusters.length >= 2) {
      const clusterMedian = clusters[Math.floor(clusters.length / 2)];
      const clusterStd = stdDev(clusters);
      return {
        offsetMs: Math.round(clusterMedian * 10) / 10,
        consistencyMs: Math.round(clusterStd * 10) / 10,
        accepted: clusters.length,
        total: latencies.length,
        quality: clusterStd <= 3 ? 'excellent' : clusterStd <= 8 ? 'good' : 'poor',
      };
    }
  }

  const std = stdDev(trimmed);

  let quality: 'excellent' | 'good' | 'poor' | 'failed';
  if (std <= 3) quality = 'excellent';
  else if (std <= 8) quality = 'good';
  else quality = 'poor';

  return {
    offsetMs: Math.round(median * 10) / 10,
    consistencyMs: Math.round(std * 10) / 10,
    accepted: valid.length,
    total: latencies.length,
    quality,
  };
}

/** Standard deviation of an array of numbers */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Find the largest cluster of values within a given window size */
function findTightestCluster(sorted: number[], windowMs: number): number[] {
  let bestCluster: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cluster: number[] = [];
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j] - sorted[i] <= windowMs) {
        cluster.push(sorted[j]);
      } else break;
    }
    if (cluster.length > bestCluster.length) {
      bestCluster = cluster;
    }
  }
  return bestCluster;
}

export { CHIRP_COUNT, CHIRP_INTERVAL_S, NOISE_FLOOR_WAIT_S };
