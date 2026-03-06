/**
 * Timing utilities — ported from v1 functions:
 * dGrp() → getBeatGrouping
 * mDur() → getMeasureDuration
 * gS()   → getSubdivisionCount
 * dAcc() → getDefaultAccents
 * gB()   → getGroupBoundaries
 */

/**
 * Get the default beat grouping for a time signature.
 * e.g., 6/8 → [3, 3], 7/8 → [2, 2, 3], 4/4 → [4]
 */
export function getBeatGrouping(numerator: number, denominator: number): number[] {
  // Compound meters (denominator 8, numerator divisible by 3 and > 3)
  if (denominator === 8 && numerator > 3 && numerator % 3 === 0) {
    return Array(numerator / 3).fill(3);
  }

  // Irregular meters
  if (denominator === 8) {
    switch (numerator) {
      case 5: return [3, 2];
      case 7: return [2, 2, 3];
      case 8: return [3, 3, 2];
      case 10: return [3, 3, 2, 2];
      case 11: return [3, 3, 3, 2];
      default: break;
    }
  }

  // Simple meters — one group
  return [numerator];
}

/**
 * Get total number of subdivisions per measure.
 */
export function getSubdivisionCount(numerator: number, subdivision: number): number {
  return numerator * subdivision;
}

/**
 * Get measure duration in seconds.
 */
export function getMeasureDuration(bpm: number, numerator: number, _denominator: number): number {
  // One beat = 60 / bpm seconds (where beat = denominator note value)
  const beatDuration = 60 / bpm;
  return beatDuration * numerator;
}

/**
 * Get the inter-onset interval (IOI) — time between consecutive subdivisions.
 */
export function getIOI(bpm: number, subdivision: number): number {
  return 60 / bpm / subdivision;
}

/**
 * Get default accent pattern for a meter.
 * Downbeats (group boundaries) get LOUD (3), others get GHOST (1).
 */
export function getDefaultAccents(
  numerator: number,
  subdivision: number,
  grouping?: number[]
): number[] {
  const total = numerator * subdivision;
  const accents = new Array(total).fill(2); // SOFT
  const groups = grouping || [numerator];

  // Mark downbeats as ACCENT (5)
  let pos = 0;
  for (const g of groups) {
    accents[pos * subdivision] = 5; // ACCENT
    pos += g;
  }

  return accents;
}

/**
 * Get group boundary indices (which beat indices are downbeats).
 */
export function getGroupBoundaries(grouping: number[]): number[] {
  const boundaries: number[] = [0];
  let pos = 0;
  for (let i = 0; i < grouping.length - 1; i++) {
    pos += grouping[i];
    boundaries.push(pos);
  }
  return boundaries;
}

/**
 * Clamp a BPM value to valid range with step precision.
 */
export function clampBpm(bpm: number, min = 20, max = 300, step = 0.5): number {
  const clamped = Math.max(min, Math.min(max, bpm));
  return Math.round(clamped / step) * step;
}
