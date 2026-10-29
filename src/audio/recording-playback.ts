/** Gain staging shared by recording playback surfaces. */
export function recordingPlaybackGain(volume: number): number {
  const value = Math.max(0, Math.min(1, volume));
  if (value === 0) return 0;
  // Raw phone-mic capture often needs some makeup gain, but the old curve
  // could exceed 30x and hard-clip. Keep a useful, bounded 0.25–4x range.
  return 0.25 + 3.75 * value * value;
}

export function createPlaybackLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  return limiter;
}
