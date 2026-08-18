import type { SoundEntry } from './types';
import * as db from '../store/db';

/** All available built-in click/percussion sounds */
export const SOUND_CATALOG: SoundEntry[] = [
  // Clicks
  { id: 'woodblock', name: 'Woodblock', category: 'clicks', file: 'woodblock.wav' },
  { id: 'clave', name: 'Clave', category: 'clicks', file: 'clave.wav' },
  { id: 'tick', name: 'Metronome Tick', category: 'clicks', file: 'tick.wav' },
  { id: 'sticks', name: 'Sticks', category: 'clicks', file: 'sticks.wav' },
  // Drums
  { id: 'kick', name: 'Kick', category: 'drums', file: 'kick.wav' },
  { id: 'snare', name: 'Snare', category: 'drums', file: 'snare.wav' },
  { id: 'rimshot', name: 'Rimshot', category: 'drums', file: 'rimshot.wav' },
  // Percussion
  { id: 'cowbell', name: 'Cowbell', category: 'percussion', file: 'cowbell.wav' },
  { id: 'hihat', name: 'Hi-Hat Closed', category: 'percussion', file: 'hihat.wav' },
  { id: 'shaker', name: 'Shaker', category: 'percussion', file: 'shaker.wav' },
  // Tonal
  { id: 'bell', name: 'Bell', category: 'tonal', file: 'bell.wav' },
  { id: 'marimba', name: 'Marimba', category: 'tonal', file: 'marimba.wav' },
];

/** Map of sound ID → loaded AudioBuffer */
const bufferCache = new Map<string, AudioBuffer>();

/** Count-in sound files (not shown in user picker) */
const COUNT_SOUNDS = [
  { id: 'count-1', file: 'count-1.wav' },
  { id: 'count-2', file: 'count-2.wav' },
  { id: 'count-3', file: 'count-3.wav' },
  { id: 'count-4', file: 'count-4.wav' },
];

/** Base path for sound files */
function getSoundBasePath(): string {
  // Vite base path
  const base = import.meta.env.BASE_URL || '/poly-pro/';
  return `${base}sounds/`;
}

/**
 * Convert the real recorded woodblock into a dry metronome click once at load time.
 *
 * The source WAV remains untouched in public/sounds. We detect the real strike,
 * remove nearly all pre-hit room tone, high-pass low rumble, retain the wooden
 * attack/body, then fade to exact silence after a very short window. The result
 * is cached, so there is no DSP work in the timing-critical per-beat path.
 */
function tightGateWoodblock(ctx: AudioContext, source: AudioBuffer): AudioBuffer {
  const channels = source.numberOfChannels;
  const sampleRate = source.sampleRate;
  const frameCount = source.length;
  if (channels < 1 || frameCount < 2 || sampleRate <= 0) return source;

  const sourceChannels: Float32Array[] = [];
  let sourcePeak = 0;
  for (let ch = 0; ch < channels; ch += 1) {
    const data = source.getChannelData(ch);
    sourceChannels.push(data);
    for (let i = 0; i < data.length; i += 1) {
      sourcePeak = Math.max(sourcePeak, Math.abs(data[i]));
    }
  }

  // First-order high-pass: enough to remove room/handling rumble without
  // materially changing the characteristic woodblock attack.
  const cutoffHz = 150;
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);
  const filtered = Array.from({ length: channels }, () => new Float32Array(frameCount));
  const envelope = new Float32Array(frameCount);

  for (let ch = 0; ch < channels; ch += 1) {
    const input = sourceChannels[ch];
    const output = filtered[ch];
    let prevX = 0;
    let prevY = 0;
    for (let i = 0; i < frameCount; i += 1) {
      const x = input[i];
      const y = alpha * (prevY + x - prevX);
      output[i] = y;
      envelope[i] = Math.max(envelope[i], Math.abs(y));
      prevX = x;
      prevY = y;
    }
  }

  let filteredPeak = 0;
  for (let i = 0; i < envelope.length; i += 1) {
    filteredPeak = Math.max(filteredPeak, envelope[i]);
  }
  if (filteredPeak <= 0) return source;

  // Require a meaningful transient: 8% of the recording peak or -40 dBFS,
  // whichever is higher, so room noise cannot open the gate early.
  const onsetThreshold = Math.max(filteredPeak * 0.08, 0.01);
  let onset = -1;
  for (let i = 0; i < envelope.length; i += 1) {
    if (envelope[i] >= onsetThreshold) {
      onset = i;
      break;
    }
  }
  if (onset < 0) return source;

  const preRollFrames = Math.max(1, Math.round(sampleRate * 0.0005));
  const fadeStartFrames = Math.round(sampleRate * 0.045);
  const hardEndFrames = Math.round(sampleRate * 0.070);
  const start = Math.max(0, onset - preRollFrames);
  const fadeStart = Math.min(frameCount, onset + fadeStartFrames);
  const hardEnd = Math.min(frameCount, onset + hardEndFrames);
  const outputLength = Math.max(1, hardEnd - start);
  const output = ctx.createBuffer(channels, outputLength, sampleRate);

  const localOnset = onset - start;
  const localFadeStart = Math.max(0, fadeStart - start);
  const fadeLength = Math.max(1, outputLength - localFadeStart);

  // First pass: apply the tight gate/fade and measure its peak.
  let processedPeak = 0;
  for (let ch = 0; ch < channels; ch += 1) {
    const src = filtered[ch];
    const dst = output.getChannelData(ch);
    for (let i = 0; i < outputLength; i += 1) {
      const sourceIndex = start + i;
      let gain = 1;

      // Tiny fade-in only covers the pre-roll; the actual strike remains intact.
      if (i < localOnset) {
        gain *= i / Math.max(1, localOnset);
      }

      if (i >= localFadeStart) {
        const t = Math.min(1, (i - localFadeStart) / fadeLength);
        gain *= 0.5 * (1 + Math.cos(Math.PI * t));
      }

      const value = src[sourceIndex] * gain;
      dst[i] = value;
      processedPeak = Math.max(processedPeak, Math.abs(value));
    }
    dst[outputLength - 1] = 0;
  }

  // Keep the processed click close to the original recording's peak level.
  // Never boost more than 1.25x and never target above -1 dBFS.
  const maxTargetPeak = Math.pow(10, -1 / 20);
  const targetPeak = Math.min(sourcePeak, maxTargetPeak);
  const peakGain = processedPeak > 0
    ? Math.min(1.25, targetPeak / processedPeak)
    : 1;

  if (Math.abs(peakGain - 1) > 0.0001) {
    for (let ch = 0; ch < channels; ch += 1) {
      const dst = output.getChannelData(ch);
      for (let i = 0; i < dst.length; i += 1) {
        dst[i] = Math.max(-1, Math.min(1, dst[i] * peakGain));
      }
      dst[outputLength - 1] = 0;
    }
  }

  return output;
}

/**
 * Load a single sound into an AudioBuffer.
 */
export async function loadSound(
  ctx: AudioContext,
  soundId: string
): Promise<AudioBuffer | null> {
  // Check cache first
  const cached = bufferCache.get(soundId);
  if (cached) return cached;

  // Custom samples stored in IDB
  if (soundId.startsWith('custom:')) {
    return loadCustomSample(ctx, soundId);
  }

  const entry = SOUND_CATALOG.find((s) => s.id === soundId);
  if (!entry) {
    console.warn(`Sound not found: ${soundId}`);
    return null;
  }

  try {
    const url = `${getSoundBasePath()}${entry.file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
    const audioBuffer = soundId === 'woodblock'
      ? tightGateWoodblock(ctx, decodedBuffer)
      : decodedBuffer;
    bufferCache.set(soundId, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.error(`Failed to load sound ${soundId}:`, err);
    return null;
  }
}

/**
 * Load a custom sample from IDB into an AudioBuffer.
 */
async function loadCustomSample(
  ctx: AudioContext,
  soundId: string,
): Promise<AudioBuffer | null> {
  try {
    const record = await db.getCustomSample(soundId);
    if (!record) {
      console.warn(`Custom sample not found in IDB: ${soundId}`);
      return null;
    }
    const arrayBuffer = await record.blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCache.set(soundId, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.error(`Failed to load custom sample ${soundId}:`, err);
    return null;
  }
}

/**
 * Register a custom sample buffer (e.g., right after recording it).
 * Avoids needing to round-trip through IDB to use it immediately.
 */
export function registerCustomBuffer(soundId: string, buffer: AudioBuffer): void {
  bufferCache.set(soundId, buffer);
}

/**
 * Load a sound by filename (for non-catalog sounds like count-in).
 */
async function loadSoundFile(
  ctx: AudioContext,
  id: string,
  filename: string
): Promise<AudioBuffer | null> {
  if (bufferCache.has(id)) return bufferCache.get(id)!;

  try {
    const url = `${getSoundBasePath()}${filename}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCache.set(id, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.error(`Failed to load sound ${id}:`, err);
    return null;
  }
}

/**
 * Preload all sounds in the catalog + count-in sounds.
 */
export async function loadAllSounds(ctx: AudioContext): Promise<void> {
  const catalogPromises = SOUND_CATALOG.map((entry) => loadSound(ctx, entry.id));
  const countPromises = COUNT_SOUNDS.map((entry) =>
    loadSoundFile(ctx, entry.id, entry.file)
  );

  // Also load any custom samples from IDB
  let customPromises: Promise<AudioBuffer | null>[] = [];
  try {
    const customSamples = await db.getAllCustomSamples();
    customPromises = customSamples.map((s) => loadCustomSample(ctx, s.id));
  } catch { /* IDB may not be ready yet */ }

  await Promise.allSettled([...catalogPromises, ...countPromises, ...customPromises]);
  console.log(`Loaded ${bufferCache.size} sounds (${SOUND_CATALOG.length} built-in + custom)`);
}

/**
 * Get a cached AudioBuffer by sound ID.
 */
export function getBuffer(soundId: string): AudioBuffer | null {
  return bufferCache.get(soundId) ?? null;
}

/**
 * Get sounds by category.
 */
export function getSoundsByCategory(category: SoundEntry['category']): SoundEntry[] {
  return SOUND_CATALOG.filter((s) => s.category === category);
}

/**
 * Clear buffer cache (for cleanup).
 */
export function clearBufferCache(): void {
  bufferCache.clear();
}
