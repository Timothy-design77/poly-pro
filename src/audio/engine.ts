/**
 * AudioEngine — the heart of Poly Pro.
 *
 * Singleton. 25ms/100ms lookahead scheduler.
 * Reads config from Zustand stores via getState().
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
import { getBuffer, loadAllSounds } from './sounds';
import { useMetronomeStore } from '../store/metronome-store';
import { useSettingsStore } from '../store/settings-store';
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
  RECORDING_GAIN_BOOST,
} from '../utils/constants';

type BeatCallback = (event: BeatEvent) => void;

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;

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

  private soundsLoaded = false;
  private isRunning = false;
  private recordingBoost = 1.0; // multiplied with outputGain during recording (v1 pattern)
  private _warmedUp = false;
  private _warmUpPromise: Promise<void> | null = null;

  // ─── Warm-up ───

  warmUp(): void {
    if (this._warmedUp || this._warmUpPromise) return;
    this._warmUpPromise = this._doWarmUp();
  }

  private async _doWarmUp(): Promise<void> {
    try {
      await this.initContext();
      this._warmedUp = true;
    } catch (err) {
      console.warn('Audio warm-up failed:', err);
    }
    this._warmUpPromise = null;
  }

  get isWarmedUp(): boolean {
    return this._warmedUp;
  }

  // ─── Initialization ───

  async initContext(): Promise<AudioContext> {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      if (!this.soundsLoaded) {
        await loadAllSounds(this.audioCtx);
        this.soundsLoaded = true;
      }
      return this.audioCtx;
    }

    this.audioCtx = new AudioContext({ sampleRate: 48000 });

    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = COMPRESSOR_THRESHOLD;
    this.compressor.knee.value = COMPRESSOR_KNEE;
    this.compressor.ratio.value = COMPRESSOR_RATIO;
    this.compressor.attack.value = COMPRESSOR_ATTACK;
    this.compressor.release.value = COMPRESSOR_RELEASE;

    this.outputGain = this.audioCtx.createGain();
    this.outputGain.gain.value = OUTPUT_GAIN;

    this.masterGain = this.audioCtx.createGain();
    const vol = useMetronomeStore.getState().volume;
    this.masterGain.gain.value = vol * MASTER_GAIN_MULTIPLIER;

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.outputGain);
    this.outputGain.connect(this.audioCtx.destination);

    if (!this.soundsLoaded) {
      await loadAllSounds(this.audioCtx);
      this.soundsLoaded = true;
    }

    return this.audioCtx;
  }

  // ─── Start / Stop ───

  startSync(): boolean {
    if (this.isRunning) return true;
    if (!this.audioCtx || this.audioCtx.state !== 'running' || !this.soundsLoaded) {
      return false;
    }

    this.isRunning = true;
    const ctx = this.audioCtx;
    const state = useMetronomeStore.getState();

    this.nextNoteTime = {};
    this.currentBeat = {};
    this.scheduledBeats = [];
    this.measureStart = ctx.currentTime;
    this.measureCount = 0;
    this.lastTrainerMeasure = -1;
    this.measureMuted = false;
    this.gapMuteMap = {};

    // Session timer + bar counter
    useMetronomeStore.setState({ playStartTime: Date.now(), currentBar: 0 });

    // Trainer: set starting BPM
    if (state.trainerEnabled) {
      useMetronomeStore.getState().setBpm(state.trainerStartBpm);
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
      this.masterGain.gain.value = useMetronomeStore.getState().volume * MASTER_GAIN_MULTIPLIER;
    }

    this.schedule();
    return true;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    if (this.startSync()) return;

    if (this._warmUpPromise) {
      await this._warmUpPromise;
    }

    const ctx = await this.initContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!this.isRunning) {
      this.startSync();
    }
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    this.countInActive = false;
    this.countInRemaining = 0;
    // Clear all per-track beat indicators
    const state = useMetronomeStore.getState();
    const cleared: Record<string, number> = {};
    for (const t of state.tracks) cleared[t.id] = -1;
    useMetronomeStore.setState({ currentBeats: cleared, playStartTime: 0 });
  }

  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Boost metronome volume to compensate for Android's getUserMedia ducking.
   * Call with true when recording starts, false when it stops.
   */
  /**
   * V1-proven: boost outputGain (AFTER compressor, speakers only).
   * Recording taps upstream from masterGain, so boost doesn't affect recorded levels.
   * Default: oG = 4.0. During recording: oG = 4.0 * lBst (default 2x = 8.0).
   */
  setRecordingBoost(active: boolean): void {
    this.recordingBoost = active ? RECORDING_GAIN_BOOST : 1.0;
    if (this.outputGain && this.audioCtx) {
      // Use setTargetAtTime for smooth transition (v1 uses .02 time constant)
      this.outputGain.gain.setTargetAtTime(
        OUTPUT_GAIN * this.recordingBoost,
        this.audioCtx.currentTime,
        0.02
      );
    }
  }

  // ─── Core Scheduler ───

  private schedule = (): void => {
    if (!this.isRunning || !this.audioCtx) return;

    const ctx = this.audioCtx;
    const state = useMetronomeStore.getState();
    const settings = useSettingsStore.getState();

    if (this.masterGain) {
      this.masterGain.gain.value = useMetronomeStore.getState().volume * MASTER_GAIN_MULTIPLIER;
    }

    const now = ctx.currentTime;

    for (const track of state.tracks) {
      // During count-in, only play track-0
      if (this.countInActive && track.id !== 'track-0') continue;
      if (track.muted) continue;

      if (this.nextNoteTime[track.id] === undefined) {
        this.nextNoteTime[track.id] = now;
        this.currentBeat[track.id] = 0;
      }

      while (this.nextNoteTime[track.id] < now + SCHEDULE_AHEAD_S) {
        const beatTime = this.nextNoteTime[track.id];
        const beatIndex = this.currentBeat[track.id];

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

        // Determine if this beat should be muted
        let muted = false;

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
        if (volumeState !== VolumeState.OFF && !muted) {
          if (countInSound) {
            // Count-in: play the specific count-N voice sample
            this.playBuffer(countInSound, volumeState, beatTime);
          } else {
            this.triggerSound(track, beatIndex, volumeState, beatTime, settings.clickSound);
          }
        }

        // Haptic
        if (settings.hapticEnabled && volumeState >= VolumeState.LOUD && !muted) {
          this.triggerVibration(beatTime - now, volumeState, settings.vibrationIntensity);
        }

        // Record scheduled beat
        this.scheduledBeats.push({ beatIndex, time: beatTime, trackId: track.id, volumeState });

        // Notify UI for ALL tracks (each track gets its own dial ring)
        const event: BeatEvent = { beatIndex, time: beatTime, trackId: track.id };
        this.beatCallbacks.forEach((cb) => cb(event));

        // Advance
        this.advanceBeat(track.id, state);
      }
    }

    this.schedulerTimer = setTimeout(this.schedule, SCHEDULE_INTERVAL_MS);
  };

  // ─── Beat Advancement ───

  private advanceBeat(trackId: string, state: ReturnType<typeof useMetronomeStore.getState>): void {
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const beatIndex = this.currentBeat[trackId];
    const totalBeats = track.beats;
    const bpm = state.bpm;
    const subdivision = state.subdivision;

    let ioi: number;
    if (trackId === 'track-0') {
      // Main track: IOI based on BPM and subdivision
      ioi = 60 / bpm / subdivision;
    } else {
      // Poly track: fit track.beats into one measure
      // Measure duration = (60/bpm) * meterNumerator (from track-0)
      const measureDuration = (60 / bpm) * state.meterNumerator;
      ioi = measureDuration / totalBeats;
    }

    // Per-track swing: delays offbeats (odd-indexed beats/subdivisions)
    // Swing 0% = straight (50/50), Swing 100% = full triplet feel (67/33)
    let swingOffset = 0;
    const swingVal = track.swing || (trackId === 'track-0' ? state.swing : 0);
    if (swingVal > 0 && beatIndex % 2 === 1) {
      // For main track: only swing if subdivision > 1
      // For poly tracks: always swingable (beats are their own grid)
      if (trackId !== 'track-0' || subdivision > 1) {
        swingOffset = ioi * swingVal * 0.33;
      }
    }

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
        useMetronomeStore.setState({ currentBar: this.measureCount });
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
            useMetronomeStore.getState().setBpm(clamped);
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

    const settings = useSettingsStore.getState();

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
    source.start(beatTime);
  }

  // ─── Vibration ───

  private triggerVibration(delayMs: number, volumeState: VolumeState, intensity: number): void {
    if (!navigator.vibrate) return;

    const duration = volumeState === VolumeState.ACCENT ? 20 : 12;
    const scaledDuration = Math.round(duration * intensity);
    if (scaledDuration <= 0) return;

    const delay = Math.max(0, delayMs * 1000);
    if (delay > 0) {
      setTimeout(() => navigator.vibrate(scaledDuration), delay);
    } else {
      navigator.vibrate(scaledDuration);
    }
  }

  // ─── Preview Sound ───

  async previewSound(soundId: string): Promise<void> {
    const ctx = await this.initContext();
    const buffer = getBuffer(soundId);
    if (!buffer || !this.masterGain) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = VOLUME_GAINS[VolumeState.ACCENT];

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start();
  }

  // ─── Beat Callbacks ───

  onBeat(callback: BeatCallback): () => void {
    this.beatCallbacks.add(callback);
    return () => this.beatCallbacks.delete(callback);
  }

  // ─── Accessors for recording hook ───

  getAudioCtx(): AudioContext | null { return this.audioCtx; }
  getMasterGain(): GainNode | null { return this.masterGain; }

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
    this.soundsLoaded = false;
    this._warmedUp = false;
  }
}

export const audioEngine = new AudioEngine();
