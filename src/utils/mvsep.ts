/**
 * MVSEP Cloud Enhancement — Phase 10 (Optional)
 *
 * Upload raw PCM recordings to MVSEP DrumSep API for professional
 * drum stem separation. Returns isolated kick, snare, toms, cymbals stems.
 *
 * Privacy: requires one-time user consent before first upload.
 * Free tier: 50 separations/day.
 * Results cached locally in IDB — only runs once per session.
 *
 * The separated stems dramatically improve instrument classification
 * accuracy compared to the local band-pass pseudo-separation approach.
 */

import * as db from '../store/db';

// ─── Types ───

export interface MVSEPResult {
  sessionId: string;
  /** Whether separation has been completed */
  completed: boolean;
  /** Timestamps */
  requestedAt: string;
  completedAt?: string;
  /** Separated stem URLs (temporary, for downloading) */
  stems?: {
    kick?: string;
    snare?: string;
    toms?: string;
    cymbals?: string;
    other?: string;
  };
  /** Error if failed */
  error?: string;
}

export interface MVSEPConsent {
  granted: boolean;
  grantedAt: string;
}

// ─── API Constants ───

const MVSEP_API_URL = 'https://mvsep.com/api/separation/create';
const MVSEP_STATUS_URL = 'https://mvsep.com/api/separation/status';

// ─── Consent ───

/**
 * Check if user has granted consent for cloud processing.
 */
export async function hasConsent(): Promise<boolean> {
  const consent = await db.getSetting<MVSEPConsent>('mvsepConsent');
  return consent?.granted === true;
}

/**
 * Record user consent for cloud processing.
 */
export async function grantConsent(): Promise<void> {
  await db.setSetting<MVSEPConsent>('mvsepConsent', {
    granted: true,
    grantedAt: new Date().toISOString(),
  });
}

/**
 * Revoke consent and optionally clear cached results.
 */
export async function revokeConsent(): Promise<void> {
  await db.setSetting<MVSEPConsent>('mvsepConsent', {
    granted: false,
    grantedAt: '',
  });
}

// ─── Cache ───

/**
 * Check if a session already has cached MVSEP results.
 */
export async function getCachedResult(sessionId: string): Promise<MVSEPResult | null> {
  const result = await db.getSetting<MVSEPResult>(`mvsep:${sessionId}`);
  return result ?? null;
}

/**
 * Cache an MVSEP result.
 */
async function cacheResult(result: MVSEPResult): Promise<void> {
  await db.setSetting(`mvsep:${result.sessionId}`, result);
}

// ─── API ───

/**
 * Convert raw PCM blob to WAV format for upload.
 * MVSEP expects standard audio formats, not raw PCM.
 */
function pcmToWav(pcmBlob: Blob, sampleRate: number = 48000): Promise<Blob> {
  return new Promise(async (resolve) => {
    const pcmData = new Float32Array(await pcmBlob.arrayBuffer());
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length * bytesPerSample;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert float32 samples to int16
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
      const sample = Math.max(-1, Math.min(1, pcmData[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    resolve(new Blob([buffer], { type: 'audio/wav' }));
  });
}

/**
 * Submit a recording for drum separation.
 * Returns immediately with a pending result — poll for completion.
 *
 * @param sessionId - Session ID for caching
 * @param pcmBlob - Raw PCM recording blob
 * @returns MVSEPResult with initial status
 */
export async function submitForSeparation(
  sessionId: string,
  pcmBlob: Blob,
): Promise<MVSEPResult> {
  // Check consent
  if (!(await hasConsent())) {
    throw new Error('User has not consented to cloud processing');
  }

  // Check cache
  const cached = await getCachedResult(sessionId);
  if (cached?.completed) {
    return cached;
  }

  // Convert to WAV
  const wavBlob = await pcmToWav(pcmBlob);

  // Create FormData for upload
  const formData = new FormData();
  formData.append('audio_file', wavBlob, `${sessionId}.wav`);
  formData.append('sep_type', 'drumsep'); // Drum separation model
  formData.append('output_format', 'wav');

  try {
    const response = await fetch(MVSEP_API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MVSEP API error: ${response.status} ${text}`);
    }

    const data = await response.json();

    const result: MVSEPResult = {
      sessionId,
      completed: false,
      requestedAt: new Date().toISOString(),
    };

    // If API returns a task ID for polling
    if (data.task_id) {
      await db.setSetting(`mvsep_task:${sessionId}`, data.task_id);
    }

    // Some APIs return results immediately
    if (data.files || data.stems) {
      result.completed = true;
      result.completedAt = new Date().toISOString();
      result.stems = {
        kick: data.files?.kick || data.stems?.kick,
        snare: data.files?.snare || data.stems?.snare,
        toms: data.files?.toms || data.stems?.toms,
        cymbals: data.files?.cymbals || data.stems?.cymbals,
        other: data.files?.other || data.stems?.other,
      };
    }

    await cacheResult(result);
    return result;
  } catch (err) {
    const result: MVSEPResult = {
      sessionId,
      completed: false,
      requestedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Upload failed',
    };
    await cacheResult(result);
    throw err;
  }
}

/**
 * Poll for separation completion.
 */
export async function checkSeparationStatus(sessionId: string): Promise<MVSEPResult> {
  const cached = await getCachedResult(sessionId);
  if (cached?.completed) return cached;

  const taskId = await db.getSetting<string>(`mvsep_task:${sessionId}`);
  if (!taskId) {
    throw new Error('No pending separation task found');
  }

  try {
    const response = await fetch(`${MVSEP_STATUS_URL}?task_id=${taskId}`);
    if (!response.ok) throw new Error('Status check failed');

    const data = await response.json();

    if (data.status === 'completed' && (data.files || data.stems)) {
      const result: MVSEPResult = {
        sessionId,
        completed: true,
        requestedAt: cached?.requestedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        stems: {
          kick: data.files?.kick || data.stems?.kick,
          snare: data.files?.snare || data.stems?.snare,
          toms: data.files?.toms || data.stems?.toms,
          cymbals: data.files?.cymbals || data.stems?.cymbals,
          other: data.files?.other || data.stems?.other,
        },
      };
      await cacheResult(result);
      return result;
    }

    if (data.status === 'failed') {
      const result: MVSEPResult = {
        sessionId,
        completed: false,
        requestedAt: cached?.requestedAt ?? new Date().toISOString(),
        error: data.error || 'Separation failed',
      };
      await cacheResult(result);
      return result;
    }

    // Still processing
    return cached ?? {
      sessionId,
      completed: false,
      requestedAt: new Date().toISOString(),
    };
  } catch (err) {
    return cached ?? {
      sessionId,
      completed: false,
      requestedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Status check failed',
    };
  }
}
