/**
 * Beat grid generator.
 *
 * Reconstructs the expected beat grid from session parameters.
 * Used by the scoring engine to align detected onsets.
 *
 * Two modes:
 * 1. From scheduledBeats (engine captured during recording) — most accurate
 * 2. From BPM/meter params (for re-analysis when scheduledBeats aren't available)
 */

import type { GridBeat } from './types';
import type { ScheduledBeat } from '../audio/types';

/**
 * Build grid from engine's scheduledBeats captured during recording.
 *
 * The engine records exact AudioContext times for each beat.
 * We convert them relative to recording start time.
 *
 * @param scheduledBeats - Beats captured from AudioEngine during recording
 * @param recordingStartTime - AudioContext time when recording started
 * @param recordingEndTime - AudioContext time when recording ended
 * @param subdivision - Subdivision factor (1=none, 2=8ths, etc.)
 */
export function gridFromScheduledBeats(
  scheduledBeats: ScheduledBeat[],
  recordingStartTime: number,
  recordingEndTime: number,
  subdivision: number,
): GridBeat[] {
  const grid: GridBeat[] = [];

  // Filter to beats within recording window, track-0 only for scoring
  const relevant = scheduledBeats.filter(
    (b) =>
      b.time >= recordingStartTime &&
      b.time <= recordingEndTime &&
      b.trackId === 'track-0',
  );

  // Sort by time
  relevant.sort((a, b) => a.time - b.time);

  // Infer measure boundaries: beat 0 restarts the measure
  let currentMeasure = 0;
  let lastBeatIndex = -1;

  for (const beat of relevant) {
    // Detect measure boundary (beat index wrapped back)
    if (beat.beatIndex <= lastBeatIndex && lastBeatIndex >= 0) {
      currentMeasure++;
    }
    lastBeatIndex = beat.beatIndex;

    const isMainBeat = beat.beatIndex % subdivision === 0;
    const isDownbeat = beat.beatIndex === 0;

    grid.push({
      time: beat.time - recordingStartTime,
      beatIndex: beat.beatIndex,
      measure: currentMeasure,
      isMainBeat,
      isDownbeat,
      trackId: beat.trackId,
    });
  }

  return grid;
}

/**
 * Build grid from BPM/meter parameters (for re-analysis fallback).
 *
 * Generates a perfectly spaced grid based on constant BPM.
 * Less accurate than engine-captured beats (doesn't account for
 * trainer BPM changes, swing, etc.) but works for re-analysis.
 *
 * @param bpm - Tempo
 * @param meterNumerator - Beats per measure
 * @param subdivision - Subdivision factor
 * @param durationSeconds - Total recording duration in seconds
 * @param swing - Swing amount (0–1), 0 = straight
 */
export function gridFromParams(
  bpm: number,
  meterNumerator: number,
  subdivision: number,
  durationSeconds: number,
  swing = 0,
): GridBeat[] {
  const grid: GridBeat[] = [];
  const totalBeatsPerMeasure = meterNumerator * subdivision;
  const baseIOI = 60 / bpm / subdivision; // seconds between subdivisions

  let time = 0;
  let measure = 0;

  while (time < durationSeconds) {
    for (let beatIdx = 0; beatIdx < totalBeatsPerMeasure; beatIdx++) {
      if (time >= durationSeconds) break;

      const isMainBeat = beatIdx % subdivision === 0;
      const isDownbeat = beatIdx === 0;

      grid.push({
        time,
        beatIndex: beatIdx,
        measure,
        isMainBeat,
        isDownbeat,
        trackId: 'track-0',
      });

      // Calculate next beat time with swing
      let ioi = baseIOI;
      if (swing > 0 && beatIdx % 2 === 0 && subdivision > 1) {
        // Even beats are longer when swung
        ioi = baseIOI * (1 + swing * 0.33);
      } else if (swing > 0 && beatIdx % 2 === 1 && subdivision > 1) {
        // Odd beats are shorter when swung
        ioi = baseIOI * (1 - swing * 0.33);
      }

      time += ioi;
    }
    measure++;
  }

  return grid;
}

/**
 * Compute IOI (inter-onset interval) in seconds for a given BPM and subdivision.
 */
export function computeIOI(bpm: number, subdivision: number): number {
  return 60 / bpm / subdivision;
}

/**
 * Compute tempo-scaled scoring window in seconds.
 * @param bpm - Tempo
 * @param subdivision - Subdivision factor
 * @param windowPct - Window as percentage of IOI (e.g. 5 for 5%)
 */
export function computeScoringWindowS(
  bpm: number,
  subdivision: number,
  windowPct: number,
): number {
  const ioi = computeIOI(bpm, subdivision);
  return ioi * (windowPct / 100);
}

/**
 * Compute tempo-scaled flam merge window in seconds.
 * @param bpm - Tempo
 * @param subdivision - Subdivision factor
 * @param flamPct - Flam merge as percentage of subdivision IOI (e.g. 45)
 */
export function computeFlamMergeS(
  bpm: number,
  subdivision: number,
  flamPct: number,
): number {
  const subIOI = 60 / bpm / subdivision;
  return subIOI * (flamPct / 100);
}
