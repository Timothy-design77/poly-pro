import { describe, expect, it } from 'vitest';
import { eventsInWindow, mediaPosition } from './playback-clock';

describe('playback clock', () => {
  it('keeps native loop position continuous over several cycles', () => {
    expect(mediaPosition(8.2, 10, { start: 2, end: 4 })).toBeCloseTo(2.2);
    expect(mediaPosition(10.2, 10)).toBe(10);
  });
  it('schedules boundary clicks exactly once across repeated short loops', () => {
    const events = [0, 1, 2, 2.1, 2.2, 3].map((time) => ({ time }));
    const loop = { start: 2, end: 2.2 };
    const first = eventsInWindow(events, 2, 2.2, loop);
    const second = eventsInWindow(events, 2.2, 2.4, loop);
    expect(first.map((item) => item.time)).toEqual([2, 2.1]);
    expect(second.map((item) => item.time)).toEqual([2.2, 2.3000000000000003]);
    expect(second.map((item) => item.event.time)).toEqual([2, 2.1]);
  });
  it('returns only due events from a long recording', () => {
    const events = Array.from({ length: 100000 }, (_, i) => ({ time: i / 10 }));
    expect(eventsInWindow(events, 9000, 9000.2)).toHaveLength(2);
  });
});
