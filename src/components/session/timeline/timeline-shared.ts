import { VolumeState } from '../../../audio/types';
import type { SessionRecord, HitEventsRecord } from '../../../store/db';

export const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32];
export const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];
export const CANVAS_HEIGHT = 200;
export const MINIMAP_HEIGHT = 30;
export const SCROLL_FRICTION = 0.92;
export const MIN_SCROLL_VELOCITY = 0.5;

export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function meterNumerator(session: SessionRecord): number {
  return parseInt(session.meter?.split('/')[0] || '4') || 4;
}

export interface ClickBeat {
  beatTime: number;
  adjustedBeatTime: number;
  beatIdx: number;
  volState: VolumeState;
}

/**
 * Iterate click-overlay beats. Prefer the persisted engine grid because a
 * recording does not generally start exactly on beat zero; only old sessions
 * without a persisted grid fall back to a synthetic grid.
 */
export function forEachClickBeat(
  session: SessionRecord,
  latencyOffsetS: number,
  cb: (beat: ClickBeat) => void,
  gridBeats?: HitEventsRecord['gridBeats'],
): void {
  if (gridBeats && gridBeats.length > 0) {
    for (const beat of gridBeats) {
      if (beat.trackId !== 'track-0') continue;
      const volState = beat.isDownbeat
        ? VolumeState.ACCENT
        : beat.isMainBeat
          ? VolumeState.LOUD
          : VolumeState.MED;
      cb({
        beatTime: beat.time,
        adjustedBeatTime: beat.time + latencyOffsetS,
        beatIdx: beat.beatIndex,
        volState,
      });
    }
    return;
  }

  const bpm = session.bpm;
  const subdivision = session.subdivision || 1;
  const ioi = 60 / bpm / subdivision;
  const meterNum = meterNumerator(session);
  const durationS = session.durationMs / 1000;
  let beatTime = 0;
  let beatIdx = 0;
  while (beatTime < durationS) {
    const isDownbeat = beatIdx % (subdivision * meterNum) === 0;
    const isMainBeat = beatIdx % subdivision === 0;
    const volState = isDownbeat ? VolumeState.ACCENT : isMainBeat ? VolumeState.LOUD : VolumeState.MED;
    cb({ beatTime, adjustedBeatTime: beatTime + latencyOffsetS, beatIdx, volState });
    beatTime += ioi;
    beatIdx++;
  }
}
