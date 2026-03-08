/**
 * Mic selection utility.
 *
 * CRITICAL: On Android, getUserMedia activating a BT mic forces the OS
 * to switch BT from A2DP (high-quality output) to HFP (call mode).
 * This ducks all audio output and degrades BT quality.
 *
 * Fix: Always force the built-in phone mic via explicit deviceId.
 * Use a "dummy stream" to unlock device labels (privacy restriction),
 * then enumerate, filter out BT, and re-request with the exact built-in ID.
 *
 * Raw audio: echoCancellation: {exact: false} is the MASTER SWITCH
 * on Chrome Android that disables ALL processing (AEC, AGC, NS).
 */

const BT_KEYWORDS = [
  'bluetooth', 'bt ', 'hands-free', 'hfp', 'wireless',
  'airpod', 'buds', 'galaxy buds', 'headset', 'earbuds',
];

/** Raw audio constraints — disables entire Android processing pipeline */
const RAW_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { exact: false as any },
  autoGainControl: { exact: false as any },
  noiseSuppression: { exact: false as any },
};

function isBtDevice(label: string): boolean {
  const lower = label.toLowerCase();
  return BT_KEYWORDS.some((kw) => lower.includes(kw));
}

export interface MicResult {
  stream: MediaStream;
  deviceLabel: string;
  isBuiltIn: boolean;
  isRaw: boolean;
}

/**
 * Get a raw mic stream, forcing the built-in mic to avoid BT HFP switch.
 *
 * Flow:
 * 1. Get dummy stream to unlock device labels (labels are empty until permission granted)
 * 2. Enumerate devices with full labels
 * 3. Find built-in mic (exclude BT keywords)
 * 4. Release dummy stream
 * 5. Re-request with exact built-in deviceId + raw constraints
 */
export async function getPreferredMicStream(): Promise<MicResult> {
  try {
    // Step 1: Dummy stream to unlock labels
    const dummyStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Step 2: Enumerate with labels now visible
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    console.log('[mic] Audio inputs:', audioInputs.map((d) => `"${d.label}" (${d.deviceId.slice(0, 8)})`));

    // Step 3: Find built-in mic — any mic that is NOT bluetooth
    const builtIn = audioInputs.find((d) => d.label && !isBtDevice(d.label));

    // Step 4: Release dummy stream BEFORE requesting final stream
    dummyStream.getTracks().forEach((t) => t.stop());

    // Step 5: Re-request with exact deviceId + raw constraints
    if (builtIn?.deviceId && builtIn.deviceId !== 'default') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { ...RAW_CONSTRAINTS, deviceId: { exact: builtIn.deviceId } },
        });
        const label = stream.getAudioTracks()[0]?.label || builtIn.label || 'Unknown';
        const raw = verifyRawAudio(stream);
        console.log(`[mic] ✅ Using built-in mic: "${label}" (raw: ${raw.isRaw})`);
        return { stream, deviceLabel: label, isBuiltIn: true, isRaw: raw.isRaw };
      } catch (err) {
        console.warn('[mic] Built-in mic exact request failed:', err);
      }
    }

    // If only one device or no labels, try raw request without deviceId
    console.warn('[mic] ⚠️ Could not isolate built-in mic, using default');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_CONSTRAINTS });
    const label = stream.getAudioTracks()[0]?.label || 'Default';
    const raw = verifyRawAudio(stream);
    return { stream, deviceLabel: label, isBuiltIn: !isBtDevice(label), isRaw: raw.isRaw };

  } catch (err) {
    console.error('[mic] All mic requests failed:', err);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const label = stream.getAudioTracks()[0]?.label || 'Fallback';
    return { stream, deviceLabel: label, isBuiltIn: false, isRaw: false };
  }
}

/**
 * Detect if BT audio output devices are connected.
 */
export async function hasBtAudioOutput(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => {
      if (d.kind !== 'audiooutput') return false;
      return d.label ? isBtDevice(d.label) : false;
    });
  } catch {
    return false;
  }
}

/**
 * Verify actual track settings after stream is opened.
 */
export function verifyRawAudio(stream: MediaStream): {
  echoCancellation: boolean;
  autoGainControl: boolean;
  noiseSuppression: boolean;
  isRaw: boolean;
} {
  const track = stream.getAudioTracks()[0];
  if (!track) return { echoCancellation: true, autoGainControl: true, noiseSuppression: true, isRaw: false };

  const settings = track.getSettings();
  const ec = settings.echoCancellation ?? true;
  const agc = settings.autoGainControl ?? true;
  const ns = settings.noiseSuppression ?? true;

  return {
    echoCancellation: ec,
    autoGainControl: agc,
    noiseSuppression: ns,
    isRaw: !ec && !agc && !ns,
  };
}
