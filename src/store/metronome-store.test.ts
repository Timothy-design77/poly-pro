import { describe, it, expect, beforeEach } from 'vitest';
import { useMetronomeStore } from './metronome-store';
import { createDefaultTrack } from './types';
import {
  DEFAULT_METER_NUMERATOR,
  DEFAULT_SUBDIVISION,
} from '../utils/constants';

describe('addTrack / removeTrack', () => {
  beforeEach(() => {
    useMetronomeStore.setState({
      tracks: [createDefaultTrack(DEFAULT_METER_NUMERATOR, DEFAULT_SUBDIVISION)],
    });
  });

  const ids = () => useMetronomeStore.getState().tracks.map((t) => t.id);

  it('assigns unique IDs after a mid-list removal', () => {
    const store = useMetronomeStore.getState();
    store.addTrack(3); // track-1
    store.addTrack(5); // track-2
    useMetronomeStore.getState().removeTrack('track-1');
    useMetronomeStore.getState().addTrack(7);

    const allIds = ids();
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toContain('track-2');
  });

  it('caps at 4 tracks', () => {
    const store = useMetronomeStore.getState();
    store.addTrack(3);
    useMetronomeStore.getState().addTrack(5);
    useMetronomeStore.getState().addTrack(7);
    useMetronomeStore.getState().addTrack(9); // should be ignored
    expect(ids()).toHaveLength(4);
  });
});
