/**
 * Mic selection utility.
 * Prefers built-in microphone over Bluetooth to avoid HFP codec switch
 * (BT mic forces 8kHz/16kHz sample rate, destroying audio quality).
 * Ported from v1 stR() mic selection logic.
 */

export async function getPreferredMicStream(): Promise<MediaStream> {
  // First, get device list (requires initial permission)
  try {
    // Request with desired constraints
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    // Try to enumerate devices to find built-in mic
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');

    if (audioInputs.length > 1) {
      // Multiple mics — try to pick non-BT
      // BT mics often have "Bluetooth", "BT", "Hands-Free", "HFP" in label
      const btKeywords = ['bluetooth', 'bt ', 'hands-free', 'hfp', 'wireless'];
      const builtIn = audioInputs.find((d) => {
        const label = d.label.toLowerCase();
        return !btKeywords.some((kw) => label.includes(kw));
      });

      if (builtIn && builtIn.deviceId) {
        (constraints.audio as MediaTrackConstraints).deviceId = { exact: builtIn.deviceId };
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (err) {
    // Fallback: just get any mic
    console.warn('Preferred mic selection failed, using default:', err);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    return stream;
  }
}

/**
 * Check if mic permission has been granted.
 */
export async function checkMicPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'prompt'; // Can't query — assume needs prompt
  }
}
