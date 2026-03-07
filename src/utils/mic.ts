/**
 * Mic selection utility.
 * 
 * Raw audio: echoCancellation: {exact: false} is the MASTER SWITCH
 * on Chrome Android that disables ALL processing (AEC, AGC, NS).
 * Confirmed by Chrome/WebRTC team. Simple `false` may not be honored
 * but `{exact: false}` forces it.
 * 
 * BT earbuds: Samsung Galaxy Buds "Voice Detect" auto-switches to
 * ambient mode when any mic opens. This is an Android system-level
 * notification — no web API can prevent it. User must disable
 * "Voice Detect" in Galaxy Wearable app.
 */

/**
 * Get a raw mic stream with all processing disabled.
 * Uses echoCancellation: {exact: false} as the master switch
 * to disable the entire Android audio processing pipeline.
 */
export async function getPreferredMicStream(): Promise<MediaStream> {
  // Raw audio constraints — echoCancellation: {exact: false} is the
  // master switch on Chrome Android that disables ALL processing
  const rawConstraints: MediaTrackConstraints = {
    echoCancellation: { exact: false as any },
    autoGainControl: { exact: false as any },
    noiseSuppression: { exact: false as any },
  };

  try {
    // Try to find built-in mic to avoid BT HFP switch
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    const hasLabels = audioInputs.some((d) => d.label.length > 0);

    if (hasLabels && audioInputs.length > 1) {
      const btKeywords = ['bluetooth', 'bt ', 'hands-free', 'hfp', 'wireless', 'airpod', 'buds', 'galaxy buds'];
      const builtIn = audioInputs.find((d) => {
        const label = d.label.toLowerCase();
        return !btKeywords.some((kw) => label.includes(kw));
      });

      if (builtIn?.deviceId) {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...rawConstraints, deviceId: { exact: builtIn.deviceId } },
        });
      }
    }

    // Default — request with raw constraints
    return await navigator.mediaDevices.getUserMedia({ audio: rawConstraints });

  } catch (err) {
    console.warn('Raw mic request failed, trying simple request:', err);
    // Fallback: simple request (will have processing enabled)
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/**
 * Detect if BT audio output devices are connected.
 */
export async function hasBtAudioOutput(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const btKeywords = ['bluetooth', 'bt ', 'wireless', 'airpod', 'buds', 'galaxy buds'];
    return devices.some((d) => {
      if (d.kind !== 'audiooutput') return false;
      const label = d.label.toLowerCase();
      return btKeywords.some((kw) => label.includes(kw));
    });
  } catch {
    return false;
  }
}

/**
 * Verify actual track settings after stream is opened.
 * Returns true if processing is confirmed disabled.
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
