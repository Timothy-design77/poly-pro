import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine';
import type { EngineHost, EngineMetronomeConfig } from './engine-host';
import { VolumeState } from './types';

const { loadAllSounds } = vi.hoisted(() => ({ loadAllSounds: vi.fn() }));
vi.mock('./sounds', () => ({ loadAllSounds, getBuffer: () => ({ duration: 0.1 }) }));

function createSource() {
  return { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
}

class FakeAudioContext {
  state = 'running';
  private startedAt = Date.now();
  get currentTime() { return (Date.now() - this.startedAt) / 1000; }
  destination = {};
  sources: ReturnType<typeof createSource>[] = [];
  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createDynamicsCompressor() {
    return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: vi.fn() };
  }
  createBufferSource() {
    const source = createSource();
    this.sources.push(source);
    return source;
  }
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}

function createHost(): EngineHost {
  const config: EngineMetronomeConfig = {
    bpm: 300, meterNumerator: 4, subdivision: 4, swing: 0, volume: 0.8,
    tracks: [{ id: 'track-0', beats: 16, accents: Array(16).fill(VolumeState.ACCENT), normalSound: 'woodblock', accentSound: 'woodblock', normalVolume: 1, accentVolume: 1, muted: false, swing: 0, soundOverrides: {} }],
    trainerEnabled: false, trainerStartBpm: 80, trainerEndBpm: 140, trainerBpmStep: 5, trainerBarsPerStep: 4,
    countInBars: 0, gapClickEnabled: false, gapClickProbability: 0.3,
    randomMuteEnabled: false, randomMuteProbability: 0.25,
    playMuteCycleEnabled: false, playMuteCyclePlayBars: 4, playMuteCycleMuteBars: 4,
  };
  return {
    getMetronome: () => config,
    getSettings: () => ({ clickSound: 'woodblock', accentSound: 'woodblock', accentSoundThreshold: 4, hapticEnabled: true, vibrationIntensity: 1 }),
    setBpm: vi.fn(), onPlayStart: vi.fn(), onBarAdvance: vi.fn(), onStop: vi.fn(),
  };
}

describe('audio engine lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
    loadAllSounds.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('cancels queued and active haptics when playback stops', async () => {
    const engine = new AudioEngine(createHost());
    await engine.start();
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
    vi.mocked(navigator.vibrate).mockClear();
    engine.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(navigator.vibrate).toHaveBeenCalledWith(0);
    expect(navigator.vibrate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('suppresses already queued clicks and haptics while preserving the captured beat grid', async () => {
    const engine = new AudioEngine(createHost());
    await engine.start();
    const context = engine.getContext() as unknown as FakeAudioContext;
    const queuedSources = [...context.sources];
    const release = engine.suppressOutput();
    vi.mocked(navigator.vibrate).mockClear();
    await vi.advanceTimersByTimeAsync(200);
    expect(queuedSources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(engine.scheduledBeats.length).toBeGreaterThan(4);
    expect(context.sources).toHaveLength(queuedSources.length);
    release();
    await vi.advanceTimersByTimeAsync(150);
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
    expect(context.sources.length).toBeGreaterThan(queuedSources.length);
    engine.stop();
  });

  it('does not restart after Stop while sounds are still loading', async () => {
    let finishLoading!: () => void;
    loadAllSounds.mockImplementation(() => new Promise<void>((resolve) => { finishLoading = resolve; }));
    const host = createHost();
    const engine = new AudioEngine(host);
    const starting = engine.start();
    engine.stop();
    finishLoading();
    await starting;
    expect(engine.running).toBe(false);
    expect(host.onPlayStart).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await engine.start();
    expect(engine.running).toBe(true);
    engine.stop();
  });

  it('disconnects completed sound previews', async () => {
    const engine = new AudioEngine(createHost());
    await engine.previewSound('woodblock');
    const context = engine.getContext() as unknown as FakeAudioContext;
    const source = context.sources[0];
    source.onended?.();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });

  it('does not replay a burst of missed clicks after a scheduler stall', async () => {
    const engine = new AudioEngine(createHost());
    await engine.start();
    const context = engine.getContext() as unknown as FakeAudioContext;
    const sourceCount = context.sources.length;
    vi.mocked(navigator.vibrate).mockClear();
    vi.setSystemTime(Date.now() + 2000);
    await vi.advanceTimersByTimeAsync(25);
    const resumedSources = context.sources.slice(sourceCount);
    expect(resumedSources.length).toBeLessThanOrEqual(3);
    expect(resumedSources.every((source) => source.start.mock.calls[0][0] >= context.currentTime - 0.025)).toBe(true);
    // The recording grid still contains the elapsed beats even when sound could not run.
    expect(engine.scheduledBeats.length).toBeGreaterThan(40);
    engine.stop();
  });

  it('ignores initialization failures for a start that was already cancelled', async () => {
    let failLoading!: (error: Error) => void;
    loadAllSounds.mockImplementation(() => new Promise<void>((_, reject) => { failLoading = reject; }));
    const engine = new AudioEngine(createHost());
    const starting = engine.start();
    engine.stop();
    failLoading(new Error('Context was interrupted'));
    await expect(starting).resolves.toBeUndefined();
    expect(engine.running).toBe(false);
  });

  it('reports initialization failures for the current start request', async () => {
    loadAllSounds.mockRejectedValue(new Error('Audio unavailable'));
    const engine = new AudioEngine(createHost());
    await expect(engine.start()).rejects.toThrow('Audio unavailable');
    expect(engine.running).toBe(false);
  });
});
