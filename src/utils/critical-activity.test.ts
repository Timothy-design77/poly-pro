import { describe, expect, it } from 'vitest';
import { beginCriticalActivity, getCriticalActivities, isCriticalActivityActive } from './critical-activity';

describe('critical activity registry', () => {
  it('tracks nested activities until every lease is released', () => {
    const releaseRecordingA = beginCriticalActivity('recording');
    const releaseRecordingB = beginCriticalActivity('recording');
    const releaseBackup = beginCriticalActivity('backup');
    expect(isCriticalActivityActive()).toBe(true);
    expect([...getCriticalActivities()].sort()).toEqual(['backup', 'recording']);

    releaseRecordingA();
    expect(getCriticalActivities().has('recording')).toBe(true);
    releaseRecordingB();
    expect(getCriticalActivities().has('recording')).toBe(false);
    releaseBackup();
    expect(isCriticalActivityActive()).toBe(false);
  });
});
