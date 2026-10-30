/**
 * Mic selection utility.
 *
 * CRITICAL: On Android, getUserMedia activating a BT mic forces the OS
 * to switch BT from A2DP (high-quality output) to HFP (call mode).
 *
 * Fix: NEVER let getUserMedia pick the default device when BT is connected.
 * Try enumerateDevices first (labels available if permission was previously granted).
 * Only use dummy stream as last resort, and when we do, request with constraints
 * that hint away from BT.
 *
 * Raw audio: echoCancellation: {exact: false} is the MASTER SWITCH
 * on Chrome Android that disables ALL processing (AEC, AGC, NS).
 */

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Microphone setup cancelled.', 'AbortError');
}

async function requestStream(constraints: MediaStreamConstraints, signal?: AbortSignal): Promise<MediaStream> {
  checkCancelled(signal);
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires a supported browser and a secure connection.');
  const request = navigator.mediaDevices.getUserMedia(constraints);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Microphone setup timed out. Check permission and try again.')), 15000);
        onAbort = () => reject(new DOMException('Microphone setup cancelled.', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } catch (error) {
    request.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

function canRelaxConstraints(error: unknown): boolean {
  return error instanceof DOMException && ['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name);
}

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

/** Samsung-specific labels for built-in mics */
const BUILTIN_KEYWORDS = ['built-in', 'bottom', 'internal', 'phone', 'camcorder'];

function isBtDevice(label: string): boolean {
  const lower = label.toLowerCase();
  return BT_KEYWORDS.some((kw) => lower.includes(kw));
}

function isLikelyBuiltIn(label: string): boolean {
  const lower = label.toLowerCase();
  // If it matches a BT keyword, it's NOT built-in regardless
  if (isBtDevice(lower)) return false;
  // If it matches a built-in keyword, it IS built-in
  if (BUILTIN_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  // If it has a label but no BT keyword, assume built-in
  return label.length > 0;
}

export interface MicResult {
  stream: MediaStream;
  deviceLabel: string;
  isBuiltIn: boolean;
  isRaw: boolean;
}

/**
 * Find built-in mic deviceId from enumerated devices.
 * Returns null if labels are empty (permission not yet granted).
 */
function findBuiltInMicId(devices: MediaDeviceInfo[]): { deviceId: string; label: string } | null {
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  if (audioInputs.length === 0) return null;

  // If labels are empty, we can't distinguish — return null
  const hasLabels = audioInputs.some((d) => d.label.length > 0);
  if (!hasLabels) return null;

  console.log('[mic] Audio inputs:', audioInputs.map((d) => `"${d.label}" (${d.deviceId.slice(0, 8)})`));

  // Priority 1: device with built-in keyword
  const byKeyword = audioInputs.find((d) => {
    const lower = d.label.toLowerCase();
    return BUILTIN_KEYWORDS.some((kw) => lower.includes(kw)) && !isBtDevice(d.label);
  });
  if (byKeyword) return { deviceId: byKeyword.deviceId, label: byKeyword.label };

  // Priority 2: any device that is NOT bluetooth
  const nonBt = audioInputs.find((d) => d.label && !isBtDevice(d.label));
  if (nonBt) return { deviceId: nonBt.deviceId, label: nonBt.label };

  return null;
}

/**
 * Get a raw mic stream, forcing the built-in mic to avoid BT HFP switch.
 *
 * Strategy:
 * 1. Try enumerateDevices() — if permission previously granted, labels are available
 * 2. If labels available → pick built-in mic → getUserMedia with exact deviceId
 * 3. If no labels → must get permission first, but CAREFULLY:
 *    Request dummy stream targeting a NON-default device to avoid BT,
 *    or if we can't, use the dummy but immediately stop + re-request
 */
export async function getPreferredMicStream(signal?: AbortSignal): Promise<MicResult> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires a supported browser and a secure connection.');
  try {
    checkCancelled(signal);
    // Step 1: Try enumerating WITHOUT a dummy stream (works if permission was previously granted)
    const devices = await navigator.mediaDevices.enumerateDevices();
    checkCancelled(signal);
    const found = findBuiltInMicId(devices);

    if (found && found.deviceId !== 'default') {
      // We have labels — go straight to requesting built-in mic
      console.log(`[mic] Labels available, requesting: "${found.label}"`);
      return await requestMic(found.deviceId, found.label, signal);
    }

    // Step 2: No labels — permission not yet granted. Need dummy stream.
    // CRITICAL: Try to avoid BT mic in the dummy stream.
    // Use enumerateDevices to get device count — if >1 device, there's likely a BT.
    // Request with sampleRate hint that BT mics can't satisfy (48kHz).
    console.log('[mic] No labels — requesting permission via dummy stream');
    
    let dummyStream: MediaStream;
    try {
      // Try requesting with constraints that prefer built-in (48kHz, no processing)
      // BT HFP mics typically only support 8/16kHz
      dummyStream = await requestStream({
        audio: {
          sampleRate: { ideal: 48000 },
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      }, signal);
    } catch (error) {
      if (!canRelaxConstraints(error)) throw error;
      // Fallback to bare minimum
      dummyStream = await requestStream({ audio: true }, signal);
    }

    // Now enumerate with labels
    let devicesWithLabels: MediaDeviceInfo[];
    const stopProbe = () => dummyStream.getTracks().forEach((track) => track.stop());
    signal?.addEventListener('abort', stopProbe, { once: true });
    try {
      checkCancelled(signal);
      devicesWithLabels = await navigator.mediaDevices.enumerateDevices();
    } finally {
      signal?.removeEventListener('abort', stopProbe);
      stopProbe();
    }
    checkCancelled(signal);

    const foundNow = findBuiltInMicId(devicesWithLabels);
    if (foundNow && foundNow.deviceId !== 'default') {
      console.log(`[mic] After permission, requesting: "${foundNow.label}"`);
      return await requestMic(foundNow.deviceId, foundNow.label, signal);
    }

    // Step 3: Couldn't identify built-in even with labels — use raw constraints without deviceId
    console.warn('[mic] ⚠️ Could not identify built-in mic, using default');
    const stream = await requestStream({
      audio: { ...RAW_CONSTRAINTS, sampleRate: { ideal: 48000 }, channelCount: 1 },
    }, signal);
    const label = stream.getAudioTracks()[0]?.label || 'Default';
    const raw = verifyRawAudio(stream);
    return { stream, deviceLabel: label, isBuiltIn: !isBtDevice(label), isRaw: raw.isRaw };

  } catch (err) {
    if (!canRelaxConstraints(err)) throw err;
    const stream = await requestStream({ audio: true }, signal);
    const label = stream.getAudioTracks()[0]?.label || 'Fallback';
    return { stream, deviceLabel: label, isBuiltIn: false, isRaw: false };
  }
}

/**
 * Request mic with exact deviceId and raw constraints.
 */
async function requestMic(deviceId: string, label: string, signal?: AbortSignal): Promise<MicResult> {
  const stream = await requestStream({
    audio: {
      ...RAW_CONSTRAINTS,
      deviceId: { exact: deviceId },
      sampleRate: { ideal: 48000 },
      channelCount: 1,
    },
  }, signal);
  const actualLabel = stream.getAudioTracks()[0]?.label || label;
  const raw = verifyRawAudio(stream);
  console.log(`[mic] ✅ Stream opened: "${actualLabel}" (raw: ${raw.isRaw})`);
  return { stream, deviceLabel: actualLabel, isBuiltIn: isLikelyBuiltIn(actualLabel), isRaw: raw.isRaw };
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
  const ec = settings.echoCancellation !== false;
  const agc = settings.autoGainControl !== false;
  const ns = settings.noiseSuppression !== false;

  return {
    echoCancellation: ec,
    autoGainControl: agc,
    noiseSuppression: ns,
    isRaw: !ec && !agc && !ns,
  };
}
