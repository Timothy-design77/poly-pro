/**
 * Microphone selection and raw-capture helpers.
 *
 * On Android, opening a Bluetooth microphone can force the output profile from
 * high-quality A2DP into HFP call mode. The selection strategy therefore
 * prefers an explicitly identified built-in microphone and bounds every media
 * operation so recording preparation can never hang indefinitely.
 */

import { OperationCancelledError, OperationTimeoutError, withTimeout } from './async';

const BT_KEYWORDS = [
  'bluetooth', 'bt ', 'hands-free', 'hfp', 'wireless',
  'airpod', 'buds', 'galaxy buds', 'headset', 'earbuds',
];

const BUILTIN_KEYWORDS = ['built-in', 'bottom', 'internal', 'phone', 'camcorder'];

const ENUMERATE_TIMEOUT_MS = 5_000;
const PERMISSION_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 15_000;

const RAW_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { exact: false },
  autoGainControl: { exact: false },
  noiseSuppression: { exact: false },
};

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

function ensureMediaDevices() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(
      'Microphone capture is unavailable in this browser or insecure context.',
      'NotSupportedError',
    );
  }
}

async function enumerateDevices(signal?: AbortSignal): Promise<MediaDeviceInfo[]> {
  ensureMediaDevices();
  return withTimeout(
    navigator.mediaDevices.enumerateDevices(),
    ENUMERATE_TIMEOUT_MS,
    'microphone device enumeration',
    { signal },
  );
}

async function requestUserMedia(
  constraints: MediaStreamConstraints,
  operation: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<MediaStream> {
  ensureMediaDevices();
  return withTimeout(
    navigator.mediaDevices.getUserMedia(constraints),
    timeoutMs,
    operation,
    {
      signal,
      onLateResolve: stopStream,
    },
  );
}

function isBtDevice(label: string): boolean {
  const lower = label.toLowerCase();
  return BT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isLikelyBuiltIn(label: string): boolean {
  const lower = label.toLowerCase();
  if (isBtDevice(lower)) return false;
  if (BUILTIN_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;
  return label.length > 0;
}

export interface MicResult {
  stream: MediaStream;
  deviceLabel: string;
  isBuiltIn: boolean;
  isRaw: boolean;
}

function findBuiltInMicId(
  devices: MediaDeviceInfo[],
): { deviceId: string; label: string } | null {
  const audioInputs = devices.filter((device) => device.kind === 'audioinput');
  if (audioInputs.length === 0) return null;
  if (!audioInputs.some((device) => device.label.length > 0)) return null;

  console.log('[mic] Audio inputs:', audioInputs.map(
    (device) => `"${device.label}" (${device.deviceId.slice(0, 8)})`,
  ));

  const byKeyword = audioInputs.find((device) => {
    const lower = device.label.toLowerCase();
    return BUILTIN_KEYWORDS.some((keyword) => lower.includes(keyword))
      && !isBtDevice(device.label);
  });
  if (byKeyword) return { deviceId: byKeyword.deviceId, label: byKeyword.label };

  const nonBluetooth = audioInputs.find(
    (device) => device.label.length > 0 && !isBtDevice(device.label),
  );
  return nonBluetooth
    ? { deviceId: nonBluetooth.deviceId, label: nonBluetooth.label }
    : null;
}

function shouldRetryWithBasicConstraints(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'OverconstrainedError'
    || error.name === 'ConstraintNotSatisfiedError'
    || error.name === 'NotSupportedError';
}

/**
 * Get a raw stream while preferring the built-in microphone.
 * All asynchronous stages are bounded and support logical cancellation.
 */
export async function getPreferredMicStream(signal?: AbortSignal): Promise<MicResult> {
  ensureMediaDevices();

  let initialDevices: MediaDeviceInfo[] = [];
  try {
    initialDevices = await enumerateDevices(signal);
  } catch (error) {
    if (error instanceof OperationCancelledError) throw error;
    console.warn('[mic] Initial enumeration failed; continuing to permission request:', error);
  }

  const knownBuiltIn = findBuiltInMicId(initialDevices);
  if (knownBuiltIn && knownBuiltIn.deviceId !== 'default') {
    console.log(`[mic] Labels available, requesting: "${knownBuiltIn.label}"`);
    return requestMic(knownBuiltIn.deviceId, knownBuiltIn.label, signal);
  }

  console.log('[mic] Device labels unavailable; requesting microphone permission');

  let dummyStream: MediaStream | null = null;
  try {
    try {
      dummyStream = await requestUserMedia(
        {
          audio: {
            sampleRate: { ideal: 48_000 },
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
          },
        },
        'microphone permission request',
        PERMISSION_TIMEOUT_MS,
        signal,
      );
    } catch (error) {
      if (!shouldRetryWithBasicConstraints(error)) throw error;
      dummyStream = await requestUserMedia(
        { audio: true },
        'basic microphone permission request',
        PERMISSION_TIMEOUT_MS,
        signal,
      );
    }

    let labeledDevices: MediaDeviceInfo[] = [];
    try {
      labeledDevices = await enumerateDevices(signal);
    } finally {
      stopStream(dummyStream);
      dummyStream = null;
    }

    const discoveredBuiltIn = findBuiltInMicId(labeledDevices);
    if (discoveredBuiltIn && discoveredBuiltIn.deviceId !== 'default') {
      console.log(`[mic] After permission, requesting: "${discoveredBuiltIn.label}"`);
      return requestMic(discoveredBuiltIn.deviceId, discoveredBuiltIn.label, signal);
    }

    console.warn('[mic] Built-in microphone could not be identified; using raw default input');
    const stream = await requestUserMedia(
      {
        audio: {
          ...RAW_CONSTRAINTS,
          sampleRate: { ideal: 48_000 },
          channelCount: 1,
        },
      },
      'raw default microphone request',
      STREAM_TIMEOUT_MS,
      signal,
    );
    const label = stream.getAudioTracks()[0]?.label || 'Default microphone';
    const raw = verifyRawAudio(stream);
    return {
      stream,
      deviceLabel: label,
      isBuiltIn: !isBtDevice(label),
      isRaw: raw.isRaw,
    };
  } finally {
    if (dummyStream) stopStream(dummyStream);
  }
}

async function requestMic(
  deviceId: string,
  label: string,
  signal?: AbortSignal,
): Promise<MicResult> {
  const stream = await requestUserMedia(
    {
      audio: {
        ...RAW_CONSTRAINTS,
        deviceId: { exact: deviceId },
        sampleRate: { ideal: 48_000 },
        channelCount: 1,
      },
    },
    `microphone request for ${label || 'built-in input'}`,
    STREAM_TIMEOUT_MS,
    signal,
  );

  const actualLabel = stream.getAudioTracks()[0]?.label || label;
  const raw = verifyRawAudio(stream);
  console.log(`[mic] Stream opened: "${actualLabel}" (raw: ${raw.isRaw})`);
  return {
    stream,
    deviceLabel: actualLabel,
    isBuiltIn: isLikelyBuiltIn(actualLabel),
    isRaw: raw.isRaw,
  };
}

export async function hasBtAudioOutput(signal?: AbortSignal): Promise<boolean> {
  try {
    const devices = await enumerateDevices(signal);
    return devices.some((device) => (
      device.kind === 'audiooutput'
      && device.label.length > 0
      && isBtDevice(device.label)
    ));
  } catch (error) {
    if (error instanceof OperationCancelledError) throw error;
    if (error instanceof OperationTimeoutError) {
      console.warn('[mic] Bluetooth output detection timed out');
    }
    return false;
  }
}

export function verifyRawAudio(stream: MediaStream): {
  echoCancellation: boolean;
  autoGainControl: boolean;
  noiseSuppression: boolean;
  isRaw: boolean;
} {
  const track = stream.getAudioTracks()[0];
  if (!track) {
    return {
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true,
      isRaw: false,
    };
  }

  const settings = track.getSettings();
  // Newer DOM typings allow browser-specific string values. Treat processing
  // as disabled only when the browser reports the explicit boolean `false`;
  // unknown/omitted values remain conservative and therefore non-raw.
  const echoCancellation = settings.echoCancellation !== false;
  const autoGainControl = settings.autoGainControl !== false;
  const noiseSuppression = settings.noiseSuppression !== false;

  return {
    echoCancellation,
    autoGainControl,
    noiseSuppression,
    isRaw: !echoCancellation && !autoGainControl && !noiseSuppression,
  };
}
