import type { SoundEntry } from './types';

/** All available click/percussion sounds */
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
 * Load a single sound into an AudioBuffer.
 */
export async function loadSound(
  ctx: AudioContext,
  soundId: string
): Promise<AudioBuffer | null> {
  // Check cache first
  const cached = bufferCache.get(soundId);
  if (cached) return cached;

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
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCache.set(soundId, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.error(`Failed to load sound ${soundId}:`, err);
    return null;
  }
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
  await Promise.allSettled([...catalogPromises, ...countPromises]);
  console.log(`Loaded ${bufferCache.size}/${SOUND_CATALOG.length + COUNT_SOUNDS.length} sounds`);
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
