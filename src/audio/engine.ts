/**
 * AudioEngine — the heart of Poly Pro.
 *
 * Singleton class that runs independently of React.
 * Uses the "A Tale of Two Clocks" pattern:
 *   - setTimeout(25ms) triggers the scheduling check
 *   - Looks 100ms ahead into the future
 *   - Schedules Web Audio notes at exact AudioContext times
 *   - UI NEVER drives timing — it only REFLECTS beat state
 *
 * Reads config from Zustand stores via getState() — never from React props.
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
} from '../utils/constants';

/** Callback for beat events — used by UI to sync visuals */
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

  // Scheduled beats for onset matching (used in recording/analysis phases)
  public scheduledBeats: ScheduledBeat[] = [];

  // Beat callbacks for UI sync
  private beatCallbacks: Set<BeatCallback> = new Set();

  private soundsLoaded = false;
  private isRunning = false;
  private _warmedUp = false;
  private _warmUpPromise: Promise<void> | null = null;

  // ─── Warm-up: call on first user touch to pre-init everything ───

  /**
   * Pre-initialize AudioContext and load all sounds on any user gesture.
   * After this resolves, start() is near-instant.
   */
  warmUp(): void {
    if (this._warmedUp || this._warmUpPromise) return;
    this._warmUpPromise = this._doWarmUp();
  }

  private async _doWarmUp(): Promise<void> {
    try {
      await this.initContext();
      this._warmedUp = true;
    } catch (err) {
      console.warn('Audio warm-up failed (will retry on start):', err);
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
      // Load sounds if not yet loaded
      if (!this.soundsLoaded) {
        await loadAllSounds(this.audioCtx);
        this.soundsLoaded = true;
      }
      return this.audioCtx;
    }

    this.audioCtx = new AudioContext({ sampleRate: 48000 });

    // Compressor — threshold lowered to -20 dB to preserve dynamic range
    // Only catches loud peaks, lets quiet GHOST beats pass uncompressed
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

    // Chain: masterGain → compressor → outputGain → destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.outputGain);
    this.outputGain.connect(this.audioCtx.destination);

    // Load all sounds
    if (!this.soundsLoaded) {
      await loadAllSounds(this.audioCtx);
      this.soundsLoaded = true;
    }

    return this.audioCtx;
  }

  // ─── Start / Stop ───

  async start(): Promise<void> {
    if (this.isRunning) return;

    // Wait for warm-up if it's in progress
    if (this._warmUpPromise) {
      await this._warmUpPromise;
    }

    const ctx = await this.initContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.isRunning = true;

    // Read current config
    const state = useMetronomeStore.getState();

    // Initialize beat counters for all tracks
    this.nextNoteTime = {};
    this.currentBeat = {};
    this.scheduledBeats = [];
    this.measureStart = ctx.currentTime;
    this.measureCount = 0;

    for (const track of state.tracks) {
      this.nextNoteTime[track.id] = ctx.currentTime;
      this.currentBeat[track.id] = 0;
    }

    // Update master gain
    if (this.masterGain) {
      this.masterGain.gain.value = state.volume * MASTER_GAIN_MULTIPLIER;
    }

    // Start scheduler
    this.schedule();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.schedulerTimer !== null) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    // Reset beat display
    useMetronomeStore.getState().setCurrentBeat(-1, 0);
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ─── Core Scheduler ───

  private schedule = (): void => {
    if (!this.isRunning || !this.audioCtx) return;

    const ctx = this.audioCtx;
    const state = useMetronomeStore.getState();
    const settings = useSettingsStore.getState();

    // Update master gain dynamically
    if (this.masterGain) {
      this.masterGain.gain.value = state.volume * MASTER_GAIN_MULTIPLIER;
    }

    const now = ctx.currentTime;

    for (const track of state.tracks) {
      if (track.muted) continue;

      // Ensure this track has been initialized
      if (this.nextNoteTime[track.id] === undefined) {
        this.nextNoteTime[track.id] = now;
        this.currentBeat[track.id] = 0;
      }

      // Schedule all beats within the lookahead window
      while (this.nextNoteTime[track.id] < now + SCHEDULE_AHEAD_S) {
        const beatTime = this.nextNoteTime[track.id];
        const beatIndex = this.currentBeat[track.id];
        const volumeState = track.accents[beatIndex] ?? VolumeState.GHOST;

        // Play the sound
        if (volumeState !== VolumeState.OFF) {
          this.triggerSound(track, volumeState, beatTime, settings.clickSound);
        }

        // Haptic vibration — trigger on LOUD and ACCENT
        if (settings.hapticEnabled && volumeState >= VolumeState.LOUD) {
          this.triggerVibration(beatTime - now, volumeState, settings.vibrationIntensity);
        }

        // Record scheduled beat
        this.scheduledBeats.push({ beatIndex, time: beatTime, trackId: track.id, volumeState });

        // Notify UI
        const event: BeatEvent = { beatIndex, time: beatTime, trackId: track.id };
        this.beatCallbacks.forEach((cb) => cb(event));

        // Advance to next beat
        this.advanceBeat(track.id, state);
      }
    }

    // Re-schedule
    this.schedulerTimer = setTimeout(this.schedule, SCHEDULE_INTERVAL_MS);
  };

  // ─── Beat Advancement ───

  private advanceBeat(trackId: string, state: typeof useMetronomeStore extends { getState: () => infer S } ? S : never): void {
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const beatIndex = this.currentBeat[trackId];
    const totalBeats = track.beats;
    const bpm = state.bpm;
    const subdivision = state.subdivision;

    // IOI = time between subdivisions
    const ioi = 60 / bpm / subdivision;

    // Apply swing to even-numbered subdivisions (if subdivision > 1)
    let swingOffset = 0;
    if (track.swing > 0 && subdivision > 1 && beatIndex % 2 === 1) {
      swingOffset = ioi * track.swing * 0.5;
    }

    // Advance
    this.nextNoteTime[trackId] += ioi + swingOffset;
    this.currentBeat[trackId] = (beatIndex + 1) % totalBeats;

    // Check for measure boundary
    if (this.currentBeat[trackId] === 0) {
      this.measureCount++;
      this.measureStart = this.nextNoteTime[trackId];
    }
  }

  // ─── Sound Playback ───

  private triggerSound(
    track: { normalSound: string; accentSound: string },
    volumeState: VolumeState,
    beatTime: number,
    defaultSound: string
  ): void {
    if (!this.audioCtx || !this.masterGain) return;

    const isAccent = volumeState === VolumeState.ACCENT;
    const soundId = isAccent ? (track.accentSound || defaultSound) : (track.normalSound || defaultSound);
    const buffer = getBuffer(soundId) || getBuffer(defaultSound);

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

// ─── Singleton Export ───
export const audioEngine = new AudioEngine();
