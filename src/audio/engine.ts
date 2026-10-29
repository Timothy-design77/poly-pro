/**
 * AudioEngine — the heart of Poly Pro.
 *
 * 25ms/100ms lookahead scheduler.
 *
 * Decoupled from app state: all configuration is read and all transport
 * events are reported through the EngineHost interface (dependency
 * inversion). The Zustand-backed host and the app singleton live in
 * ./index.ts. This class is constructible with a fake host for tests.
 *
 * Phase 2 additions:
 * - Trainer mode: auto-increment BPM after N bars
 * - Count-in: click-only bars before full pattern
 * - Gap click: randomly mute individual beats
 * - Random mute: randomly mute entire measures
 * - Multi-track polyrhythm support
 * - Per-track swing
 */

import { VolumeState, VOLUME_GAINS } from './types';
import type { ScheduledBeat, BeatEvent } from './types';
import { getBuffer, loadSound } from './sounds';
import type { EngineHost, EngineMetronomeConfig } from './engine-host';
import { computeTrackIOI, computeSwingOffsetS, perceptualGain as basePerceptualGain } from './scheduling';
import {
  SCHEDULE_INTERVAL_MS,
  SCHEDULE_AHEAD_S,
  COMPRESSOR_THRESHOLD,
  COMPRESSOR_KNEE,
  COMPRESSOR_RATIO,
  COMPRESSOR_ATTACK,
  COMPRESSOR_RELEASE,
  OUTPUT_GAIN,
  MASTER_GAIN_MULTIPLIER,
} from '../utils/constants';

/** Keep scheduledBeats for 35 min — recordings cap at 30 min. */
const SCHEDULED_BEATS_RETENTION_S = 35 * 60;

type BeatCallback = (event: BeatEvent) => void;

/** Convert linear slider (0–1) to perceptual gain.
 *  10%→0.08, 25%→0.5, 50%→2.0, 80%→5.12, 100%→8.0 masterGain.
 *  Low end actually gets quiet, high end stays loud. */
function perceptualGain(vol: number): number {
  return basePerceptualGain(vol, MASTER_GAIN_MULTIPLIER);
}

export class AudioEngine {
  private readonly host: EngineHost;

  constructor(host: EngineHost) {
    this.host = host;
  }

  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private scheduledSources = new Set<AudioBufferSourceNode>();
  private outputSuppressions = new Set<symbol>();
  private vibrationTimers = new Set<ReturnType<typeof setTimeout>>();
  private vibrationActive = false;
  private transportGeneration = 0;

  /** Keep the transport and captured grid running without audible or haptic clicks. */
  suppressOutput(): () => void {
    const token = Symbol();
    this.outputSuppressions.add(token);
    this.stopScheduledSources();
    this.stopVibration();
    this.refreshOutputGain();
    return () => { this.outputSuppressions.delete(token); this.refreshOutputGain(); };
  }

  private refreshOutputGain(): void {
    if (this.masterGain) this.masterGain.gain.value = this.outputSuppressions.size ? 0 : perceptualGain(this.host.getMetronome().volume);
  }

  private schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  private nextNoteTime: Record<string, number> = {};
  private currentBeat: Record<string, number> = {};
  public measureStart = 0;
  private measureCount = 0;

  // Trainer state (used by advanceBeat)
  private lastTrainerMeasure = -1;

  // Count-in state
  private countInActive = false;
  private countInRemaining = 0;

  // Random mute — per-measure decision cached
  private measureMuted = false;

  // Gap click — precomputed per-beat mute decisions for current measure
  private gapMuteMap: Record<string, Set<number>> = {};

  public scheduledBeats: ScheduledBeat[] = [];
  private beatCallbacks: Set<BeatCallback> = new Set();

  private preparedSoundKey = '';
  private isRunning = false;
  /** Unlock audio on the first real gesture; preparation never waits on this. */
  warmUp(): void {
    void this.initContext().catch((error) => console.warn('Audio warm-up failed:', error));
  }

  // ─── Initialization ───

  private requiredSounds(): string[] {
    const settings = this.host.getSettings();
    const state = this.host.getMetronome();
    const ids = new Set(['woodblock', settings.clickSound, settings.accentSound]);
    for (const track of state.tracks) {
      if (track.id !== 'track-0') { ids.add(track.normalSound); ids.add(track.accentSound); }
      for (const sound of Object.values(track.soundOverrides)) ids.add(sound);
    }
    if (state.countInBars > 0) for (let n = 1; n <= 4; n++) ids.add(`count-${n}`);
    return [...ids].sort();
  }

  private ensureContext(): AudioContext {
    if (this.audioCtx && this.audioCtx.state !== 'closed') return this.audioCtx;
    this.preparedSoundKey = '';
    this.audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = COMPRESSOR_THRESHOLD;
    this.compressor.knee.value = COMPRESSOR_KNEE;
    this.compressor.ratio.value = COMPRESSOR_RATIO;
    this.compressor.attack.value = COMPRESSOR_ATTACK;
    this.compressor.release.value = COMPRESSOR_RELEASE;

    this.outputGain = this.audioCtx.createGain();
    this.outputGain.gain.value = OUTPUT_GAIN;

    this.masterGain = this.audioCtx.createGain();
    this.refreshOutputGain();

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.outputGain);
    this.outputGain.connect(this.audioCtx.destination);

    return this.audioCtx;
  }

  private async prepareSounds(ctx: AudioContext): Promise<void> {
    const ids = this.requiredSounds();
    const key = ids.join('|');
    if (this.preparedSoundKey === key) return;
    await Promise.all(ids.map((id) => loadSound(ctx, id)));
    if (!getBuffer('woodblock')) throw new Error('Could not load the click sound. Try again.');
    if (ctx === this.audioCtx) this.preparedSoundKey = key;
  }

  /** Decode the current setup before interaction; never play or resume audio here. */
  async prepare(): Promise<void> {
    const ctx = this.ensureContext();
    await this.prepareSounds(ctx);
  }

  async initContext(): Promise<AudioContext> {
    const ctx = this.ensureContext();
    // Resume in the user-gesture stack, in parallel with only the needed samples.
    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    await Promise.all([resume, this.prepareSounds(ctx)]);
    return ctx;
  }

  // ─── Start / Stop ───

  startSync(): boolean {
    if (this.isRunning) return true;
    if (!this.audioCtx || this.audioCtx.state !== 'running' || this.preparedSoundKey !== this.requiredSounds().join('|')) {
      return false;
    }

    this.isRunning = true;
    const ctx = this.audioCtx;
    const state = this.host.getMetronome();

    this.nextNoteTime = {};
    this.currentBeat = {};
    this.scheduledBeats = [];
    this.measureStart = ctx.currentTime;
    this.measureCount = 0;
    this.lastTrainerMeasure = -1;
    this.measureMuted = false;
    this.gapMuteMap = {};

    // Session timer + bar counter
    this.host.onPlayStart(Date.now());

    // Trainer: set starting BPM
    if (state.trainerEnabled) {
      this.host.setBpm(state.trainerStartBpm);
    }

    // Count-in
    if (state.countInBars > 0) {
      this.countInActive = true;
      this.countInRemaining = state.countInBars;
    } else {
      this.countInActive = false;
      this.countInRemaining = 0;
    }

    for (const track of state.tracks) {
      this.nextNoteTime[track.id] = ctx.currentTime;
      this.currentBeat[track.id] = 0;
    }

    if (this.masterGain) {
      this.refreshOutputGain();
    }

    this.schedule();
    return true;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    if (this.startSync()) return;
    const generation = this.transportGeneration;

    try {
      const ctx = await this.initContext();
      if (generation !== this.transportGeneration) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (generation === this.transportGeneration && !this.isRunning) {
        // A sound selection may have changed while the first request was loading.
        if (!this.startSync()) {
          await this.initContext();
          if (generation === this.transportGeneration && !this.startSync()) throw new Error('Audio is not ready. Tap Start to retry.');
        }
      }
    } catch (error) {
      // An old interrupted request must not stop a newer practice session.
      if (generation === this.transportGeneration) throw error;
    }
  }

  stop(): void {
    // A Stop while initialization is pending must also cancel that future start.
    this.transportGeneration++;
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.stopScheduledSources();
    this.stopVibration();

    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    this.countInActive = false;
    this.countInRemaining = 0;
    if (!wasRunning) return;
    // Clear all per-track beat indicators
    const state = this.host.getMetronome();
    this.host.onStop(state.tracks.map((t) => t.id));
  }

  private stopScheduledSources(): void {
    for (const source of this.scheduledSources) { try { source.stop(); } catch {} }
    this.scheduledSources.clear();
  }

  get running(): boolean {
    return this.isRunning;
  }

  /** Get the current AudioContext (or null if not initialized) */
  getContext(): AudioContext | null {
    return this.audioCtx;
  }

  // ─── Core Scheduler ───

  private schedule = (): void => {
    if (!this.isRunning || !this.audioCtx) return;

    const ctx = this.audioCtx;
    const state = this.host.getMetronome();
    const settings = this.host.getSettings();

    if (this.masterGain) {
      this.refreshOutputGain();
    }

    const now = ctx.currentTime;

    // Trim beats that can no longer matter (recordings max out at 30 min,
    // so anything older than 35 min is unreachable). Prevents unbounded
    // memory growth during long practice sessions.
    if (
      this.scheduledBeats.length > 4096 &&
      this.scheduledBeats[0].time < now - SCHEDULED_BEATS_RETENTION_S
    ) {
      this.scheduledBeats = this.scheduledBeats.filter(
        (b) => b.time >= now - SCHEDULED_BEATS_RETENTION_S,
      );
    }

    for (const track of state.tracks) {
      // During count-in, only play track-0
      if (this.countInActive && track.id !== 'track-0') continue;

      if (this.nextNoteTime[track.id] === undefined) {
        this.nextNoteTime[track.id] = now;
        this.currentBeat[track.id] = 0;
      }

      while (this.nextNoteTime[track.id] < now + SCHEDULE_AHEAD_S) {
        const beatTime = this.nextNoteTime[track.id];
        const beatIndex = this.currentBeat[track.id];
        // Timers can be throttled in the background. Keep the elapsed grid and
        // transport state, but never replay a backlog of clicks all at once.
        const missed = beatTime < now - SCHEDULE_INTERVAL_MS / 1000;

        // During count-in: play count-1/2/3/4 voice samples on main beats
        let volumeState: VolumeState;
        let countInSound: string | null = null;

        if (this.countInActive) {
          const isMainBeat = (beatIndex % state.subdivision === 0);
          if (isMainBeat) {
            // Beat number 1-based (e.g. in 4/4: beat 0→"1", beat 1→"2", etc.)
            const beatNum = Math.floor(beatIndex / state.subdivision) + 1;
            // Use count-1 through count-4, wrap for meters > 4
            const countNum = ((beatNum - 1) % 4) + 1;
            countInSound = `count-${countNum}`;
            volumeState = VolumeState.LOUD;
          } else {
            // Subdivisions silent during count-in
            volumeState = VolumeState.OFF;
          }
        } else {
          volumeState = track.accents[beatIndex] ?? VolumeState.SOFT;
        }

        // Determine if this beat should be muted.
        // A muted track keeps its clock advancing (beats are scheduled
        // silently) so unmuting resumes in time instead of bursting
        // through every beat missed while muted.
        let muted = track.muted;

        // Play/Mute cycle or Random mute: entire measure silenced
        if (this.measureMuted && !this.countInActive) {
          muted = true;
        }

        // Gap click: individual beats randomly muted
        if (state.gapClickEnabled && !this.countInActive && !muted) {
          const trackGaps = this.gapMuteMap[track.id];
          if (trackGaps && trackGaps.has(beatIndex)) {
            muted = true;
          }
        }

        // Play the sound
        if (!missed && volumeState !== VolumeState.OFF && !muted && !this.outputSuppressions.size) {
          if (countInSound) {
            // Count-in: play the specific count-N voice sample
            this.playBuffer(countInSound, volumeState, beatTime);
          } else {
            this.triggerSound(track, beatIndex, volumeState, beatTime, settings.clickSound);
          }
        }

        // Haptic
        if (!missed && !this.outputSuppressions.size && settings.hapticEnabled && volumeState >= VolumeState.LOUD && !muted) {
          this.triggerVibration(beatTime - now, volumeState, settings.vibrationIntensity);
        }

        // Record scheduled beat
        this.scheduledBeats.push({ beatIndex, time: beatTime, trackId: track.id, volumeState, isCountIn: this.countInActive });

        // Notify UI for ALL tracks (each track gets its own dial ring)
        if (!missed) {
          const event: BeatEvent = { beatIndex, time: beatTime, trackId: track.id };
          this.beatCallbacks.forEach((cb) => cb(event));
        }

        // Advance
        this.advanceBeat(track.id, state);
      }
    }

    this.schedulerTimer = setTimeout(this.schedule, SCHEDULE_INTERVAL_MS);
  };

  // ─── Beat Advancement ───

  private advanceBeat(trackId: string, state: EngineMetronomeConfig): void {
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const beatIndex = this.currentBeat[trackId];
    const totalBeats = track.beats;

    const ioi = computeTrackIOI(trackId, state.bpm, state.subdivision, state.meterNumerator, totalBeats);

    // Per-track swing: delays offbeats (odd-indexed beats/subdivisions)
    // Swing 0% = straight (50/50), Swing 100% = full triplet feel (67/33)
    const swingVal = track.swing || (trackId === 'track-0' ? state.swing : 0);
    const swingOffset = computeSwingOffsetS(trackId, beatIndex, ioi, swingVal, state.subdivision);

    this.nextNoteTime[trackId] += ioi + swingOffset;
    this.currentBeat[trackId] = (beatIndex + 1) % totalBeats;

    // Measure boundary (track-0 is authoritative)
    if (trackId === 'track-0' && this.currentBeat[trackId] === 0) {
      this.measureCount++;
      this.measureStart = this.nextNoteTime[trackId];

      // Count-in check
      if (this.countInActive) {
        this.countInRemaining--;
        if (this.countInRemaining <= 0) {
          this.countInActive = false;
          // Sync all poly tracks to start at this measure boundary
          for (const t of state.tracks) {
            if (t.id !== 'track-0') {
              this.nextNoteTime[t.id] = this.nextNoteTime[trackId];
              this.currentBeat[t.id] = 0;
            }
          }
        }
      }

      // Update bar counter (only count non-count-in bars)
      if (!this.countInActive) {
        this.host.onBarAdvance(this.measureCount);
      }

      // Trainer mode: increment BPM after N bars
      if (state.trainerEnabled && !this.countInActive) {
        const barsSinceLast = this.measureCount - (this.lastTrainerMeasure < 0 ? 0 : this.lastTrainerMeasure);
        if (barsSinceLast >= state.trainerBarsPerStep) {
          this.lastTrainerMeasure = this.measureCount;
          const dir = state.trainerEndBpm >= state.trainerStartBpm ? 1 : -1;
          const newBpm = state.bpm + state.trainerBpmStep * dir;
          const clamped = dir > 0
            ? Math.min(newBpm, state.trainerEndBpm)
            : Math.max(newBpm, state.trainerEndBpm);
          if (clamped !== state.bpm) {
            this.host.setBpm(clamped);
          }
        }
      }

      // Play/Mute cycling: structured internalization
      // e.g. Play 4 bars, Mute 4 bars, repeat
      if (state.playMuteCycleEnabled && !this.countInActive) {
        const cycleLen = state.playMuteCyclePlayBars + state.playMuteCycleMuteBars;
        const posInCycle = (this.measureCount - 1) % cycleLen;
        this.measureMuted = posInCycle >= state.playMuteCyclePlayBars;
      }
      // Random mute (only if play/mute cycle isn't active)
      else if (state.randomMuteEnabled && !this.countInActive) {
        this.measureMuted = Math.random() < state.randomMuteProbability;
      } else if (!state.playMuteCycleEnabled) {
        this.measureMuted = false;
      }

      // Gap click: precompute which beats to mute in next measure
      if (state.gapClickEnabled && !this.countInActive) {
        this.gapMuteMap = {};
        for (const t of state.tracks) {
          const gaps = new Set<number>();
          for (let i = 0; i < t.beats; i++) {
            // Never mute beat 0 (downbeat)
            if (i > 0 && Math.random() < state.gapClickProbability) {
              gaps.add(i);
            }
          }
          this.gapMuteMap[t.id] = gaps;
        }
      }
    }
  }

  // ─── Sound Playback ───

  /** Play a sound by buffer ID at the given volume and time */
  private playBuffer(soundId: string, volumeState: VolumeState, beatTime: number): void {
    if (!this.audioCtx || !this.masterGain) return;
    const buffer = getBuffer(soundId);
    if (!buffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = this.audioCtx.createGain();
    gainNode.gain.value = VOLUME_GAINS[volumeState];
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    this.scheduledSources.add(source);
    source.onended = () => { this.scheduledSources.delete(source); source.disconnect(); gainNode.disconnect(); };
    source.start(beatTime);
  }

  private triggerSound(
    track: { id: string; normalSound: string; accentSound: string; soundOverrides: Record<number, string> },
    beatIndex: number,
    volumeState: VolumeState,
    beatTime: number,
    _defaultSound: string
  ): void {
    if (!this.audioCtx || !this.masterGain) return;

    const settings = this.host.getSettings();

    // Priority: per-beat override → track/settings sounds
    const override = track.soundOverrides[beatIndex];
    let soundId: string;
    if (override) {
      soundId = override;
    } else {
      const isAccent = volumeState >= settings.accentSoundThreshold;
      if (track.id === 'track-0') {
        // Main track: use global settings sounds
        soundId = isAccent ? settings.accentSound : settings.clickSound;
      } else {
        // Poly tracks: use their own per-track sounds
        soundId = isAccent ? track.accentSound : track.normalSound;
      }
    }
    const buffer = getBuffer(soundId) || getBuffer('woodblock');

    if (!buffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.audioCtx.createGain();
    gainNode.gain.value = VOLUME_GAINS[volumeState];

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    this.scheduledSources.add(source);
    source.onended = () => { this.scheduledSources.delete(source); source.disconnect(); gainNode.disconnect(); };
    source.start(beatTime);
  }

  // ─── Vibration ───

  private stopVibration(): void {
    for (const timer of this.vibrationTimers) clearTimeout(timer);
    this.vibrationTimers.clear();
    if (this.vibrationActive && navigator.vibrate) navigator.vibrate(0);
    this.vibrationActive = false;
  }

  private triggerVibration(delayS: number, volumeState: VolumeState, intensity: number): void {
    if (!navigator.vibrate) return;

    const duration = volumeState === VolumeState.ACCENT ? 20 : 12;
    const scaledDuration = Math.round(duration * intensity);
    if (scaledDuration <= 0) return;

    const vibrate = () => {
      if (!this.isRunning || this.outputSuppressions.size || !this.host.getSettings().hapticEnabled) return;
      navigator.vibrate(scaledDuration);
      this.vibrationActive = true;
    };
    const delay = Math.max(0, delayS * 1000);
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.vibrationTimers.delete(timer);
        vibrate();
      }, delay);
      this.vibrationTimers.add(timer);
    } else {
      vibrate();
    }
  }

  // ─── Preview Sound ───

  async previewSound(soundId: string): Promise<void> {
    const ctx = await this.initContext();
    const buffer = await loadSound(ctx, soundId);
    if (!buffer || !this.masterGain) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = VOLUME_GAINS[VolumeState.ACCENT];

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    this.scheduledSources.add(source);
    source.onended = () => { this.scheduledSources.delete(source); source.disconnect(); gainNode.disconnect(); };
    source.start();
  }

  // ─── Beat Callbacks ───

  onBeat(callback: BeatCallback): () => void {
    this.beatCallbacks.add(callback);
    return () => this.beatCallbacks.delete(callback);
  }

  // ─── Cleanup ───

  async dispose(): Promise<void> {
    this.stop();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      await this.audioCtx.close();
    }
    this.audioCtx = null;
    this.masterGain = null;
    this.compressor = null;
    this.outputGain = null;
    this.preparedSoundKey = '';
  }
}
