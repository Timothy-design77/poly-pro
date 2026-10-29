/** Position and click scheduling on one media clock, including native A/B loops. */
export interface PlaybackLoop { start: number; end: number }
export function mediaPosition(unwrapped: number, duration: number, loop?: PlaybackLoop): number {
  if (loop && unwrapped >= loop.end) return loop.start + (unwrapped - loop.start) % (loop.end - loop.start);
  return Math.max(0, Math.min(duration, unwrapped));
}

function lowerBound<T extends { time: number }>(events: T[], time: number): number {
  let low = 0, high = events.length;
  while (low < high) { const mid = (low + high) >>> 1; if (events[mid].time < time) low = mid + 1; else high = mid; }
  return low;
}

/** Half-open windows avoid duplicate clicks between scheduler ticks. O(log n + due events). */
export function eventsInWindow<T extends { time: number }>(events: T[], from: number, to: number, loop?: PlaybackLoop): Array<{ event: T; time: number }> {
  const result: Array<{ event: T; time: number }> = [];
  const collect = (start: number, end: number, shift: number) => {
    for (let i = lowerBound(events, start); i < events.length && events[i].time < end; i++) result.push({ event: events[i], time: events[i].time + shift });
  };
  if (!loop) { collect(from, to, 0); return result; }
  const length = loop.end - loop.start;
  if (!(length > 0)) return result;
  const firstCycle = Math.max(0, Math.floor((from - loop.start) / length));
  const lastCycle = Math.max(firstCycle, Math.ceil((to - loop.start) / length) - 1);
  for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
    const shift = cycle * length;
    collect(Math.max(loop.start, from - shift), Math.min(loop.end, to - shift), shift);
  }
  return result;
}
