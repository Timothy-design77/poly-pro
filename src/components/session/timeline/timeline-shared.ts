/**
 * Shared constants + pure helpers for the Timeline module.
 */

import { MASTER_GAIN_MULTIPLIER } from '../../../utils/constants';
import { VolumeState } from '../../../audio/types';
import type { SessionRecord } from '../../../store/db';

export const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32];
export const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];
export const CANVAS_HEIGHT = 200;
export const MINIMAP_HEIGHT = 30;
export const SCROLL_FRICTION = 0.92;
export const MIN_SCROLL_VELOCITY = 0.5;
export const MIC_BOOST = 4.0;

export function perceptualGain(vol: number): number {
  return vol * vol * MASTER_GAIN_MULTIPLIER;
}

export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** Parse "7/8" → 7 (numerator), defaulting to 4. */
export function meterNumerator(session: SessionRecord): number {
  return parseInt(session.meter?.split('/')[0] || '4') || 4;
}

export interface ClickBeat {
  /** Beat time in recording seconds, BEFORE latency adjustment. */
  beatTime: number;
  /** Beat time with latency offset applied. */
  adjustedBeatTime: number;
  beatIdx: number;
  volState: VolumeState;
}

/**
 * Iterate the click-track beats for a session (downbeat/main/subdivision
 * accent structure). Single source of truth used by both live playback
 * overlay and offline WAV export — these previously carried duplicated
 * copies of this loop.
 */
export function forEachClickBeat(
  session: SessionRecord,
  latencyOffsetS: number,
  cb: (beat: ClickBeat) => void,
): void {
  const bpm = session.bpm;
  const subdivision = session.subdivision || 1;
  const ioi = 60 / bpm / subdivision;
  const meterNum = meterNumerator(session);
  const durationS = session.durationMs / 1000;

  let beatTime = 0;
  let beatIdx = 0;
  while (beatTime < durationS) {
    const adjustedBeatTime = beatTime + latencyOffsetS;
    const isDownbeat = beatIdx % (subdivision * meterNum) === 0;
    const isMainBeat = beatIdx % subdivision === 0;
    const volState = isDownbeat
      ? VolumeState.ACCENT
      : isMainBeat
        ? VolumeState.LOUD
        : VolumeState.MED;

    cb({ beatTime, adjustedBeatTime, beatIdx, volState });

    beatTime += ioi;
    beatIdx++;
  }
}
