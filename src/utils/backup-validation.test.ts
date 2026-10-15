import { describe, expect, it } from 'vitest';
import { validateSessions, validateSettings, validateEvents } from './backup-validation';

describe('backup validation', () => {
  it('rejects malformed sessions before any write', () => {
    expect(() => validateSessions([{ id: 'a', bpm: 'fast' }])).toThrow('Invalid backup');
    expect(() => validateSessions({})).toThrow('Invalid backup');
  });
  it('rejects hit data whose filename and session do not agree', () => {
    expect(() => validateEvents({ sessionId: 'other', rawOnsets: [], scoredOnsets: [] }, 'take')).toThrow('another take');
  });
  it('rejects corrupt transport values before they reach the audio scheduler', () => {
    expect(() => validateSettings({ 'metronome-state': { meterDenominator: 3 } })).toThrow('Invalid backup');
    expect(() => validateSettings({ 'metronome-state': { trainerBarsPerStep: 0 } })).toThrow('Invalid backup');
    expect(() => validateSettings({ 'settings-state': { noiseGate: -1 } })).toThrow('Invalid backup');
  });
  it('strips unknown state keys and rejects numeric settings represented as strings', () => {
    expect(validateSettings({ 'settings-state': { sensitivity: 0.3, setSensitivity: 'replace action' } })).toEqual({ 'settings-state': { sensitivity: 0.3 } });
    expect(() => validateSettings({ 'settings-state': { calibratedOffset: '100' } })).toThrow('Invalid backup');
  });
});
