import { describe, expect, it } from 'vitest';
import { getPracticeStreak } from './practice-streak';

const now = new Date(2026, 9, 18, 9);
const day = (date: number) => new Date(2026, 9, date, 12).toISOString();

describe('practice streak', () => {
  it('keeps the streak through yesterday before today’s practice', () => {
    expect(getPracticeStreak([day(17), day(16), day(15)], now)).toBe(3);
  });
  it('adds today once regardless of the number of takes', () => {
    expect(getPracticeStreak([day(18), day(18), day(17), day(16)], now)).toBe(3);
  });
  it('ends at a missed day and ignores future dates', () => {
    expect(getPracticeStreak([day(18), day(16), day(19)], now)).toBe(1);
    expect(getPracticeStreak([day(16), day(15), day(19)], now)).toBe(0);
  });
});
