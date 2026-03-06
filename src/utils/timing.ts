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
      case 13: return [3, 3, 3, 2, 2];
      case 15: return [3, 3, 3, 3, 3];
      case 17: return [3, 3, 3, 3, 3, 2];
      default: break;
    }
  }

  // Simple meters — one group
  return [numerator];
}

/**
 * Get all valid beat groupings for a time signature.
 * Returns an array of grouping arrays. The first is the default.
 * Used for the grouping picker UI.
 */
export function getAvailableGroupings(numerator: number, denominator: number): number[][] {
  const defaultGrouping = getBeatGrouping(numerator, denominator);
  const results: number[][] = [defaultGrouping];

  // For simple meters (numerator <= 4 in /4 or /2 or /16), only one option
  if (numerator <= 4 && (denominator === 4 || denominator === 2 || denominator === 16)) {
    return results;
  }

  // Generate permutations of valid groupings using 2s and 3s
  // A grouping is valid if the numbers sum to the numerator
  const groupings = new Set<string>();
  groupings.add(JSON.stringify(defaultGrouping));

  function findGroupings(remaining: number, current: number[]) {
    if (remaining === 0) {
      groupings.add(JSON.stringify(current));
      return;
    }
    if (remaining < 2) return;
    if (current.length > 8) return; // safety

    if (remaining >= 2) findGroupings(remaining - 2, [...current, 2]);
    if (remaining >= 3) findGroupings(remaining - 3, [...current, 3]);
    // Allow groups of 4 for /4 meters
    if ((denominator === 4 || denominator === 2) && remaining >= 4) {
      findGroupings(remaining - 4, [...current, 4]);
    }
  }

  findGroupings(numerator, []);

  // Convert set back to arrays, sort by pattern
  for (const g of groupings) {
    const parsed = JSON.parse(g) as number[];
    if (!results.some(r => JSON.stringify(r) === g)) {
      results.push(parsed);
    }
  }

  // Sort: default first, then by number of groups (fewer = simpler)
  return results.sort((a, b) => {
    if (JSON.stringify(a) === JSON.stringify(defaultGrouping)) return -1;
    if (JSON.stringify(b) === JSON.stringify(defaultGrouping)) return 1;
    return a.length - b.length;
  });
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
