/**
 * Pure scheduling math used by the AudioEngine.
 *
 * Extracted so the timing-critical arithmetic can be unit tested without
 * an AudioContext. Behavior is identical to the previous inline code.
 */

/**
 * Inter-onset interval (seconds) for a track.
 *
 * - Main track ('track-0'): IOI derives from BPM and subdivision.
 * - Poly tracks: `trackBeats` evenly fill one measure of the main meter.
 */
export function computeTrackIOI(
  trackId: string,
  bpm: number,
  subdivision: number,
  meterNumerator: number,
  trackBeats: number,
): number {
  if (trackId === 'track-0') {
    return 60 / bpm / subdivision;
  }
  const measureDuration = (60 / bpm) * meterNumerator;
  return measureDuration / trackBeats;
}

/**
 * Additional delay (seconds) applied AFTER an odd-indexed beat when swing
 * is active. Swing 0 = straight; swing 1 = full triplet feel (offbeats
 * pushed by 33% of the IOI).
 *
 * Main track only swings when subdivided; poly tracks always may swing
 * (their beats form their own grid).
 */
export function computeSwingOffsetS(
  trackId: string,
  beatIndex: number,
  ioi: number,
  swing: number,
  subdivision: number,
): number {
  if (swing <= 0) return 0;
  if (beatIndex % 2 !== 1) return 0;
  if (trackId === 'track-0' && subdivision <= 1) return 0;
  return ioi * swing * 0.33;
}

/**
 * Perceptual master gain from a linear 0–1 volume slider.
 * vol² gives wide dynamic range through the compressor.
 */
export function perceptualGain(vol: number, masterGainMultiplier: number): number {
  return vol * vol * masterGainMultiplier;
}
