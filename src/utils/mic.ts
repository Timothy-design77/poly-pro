/**
 * Mic selection utility.
 * 
 * CRITICAL: Must avoid opening a Bluetooth mic, which forces Android
 * to switch BT from A2DP (high quality stereo output) to HFP
 * (compressed mono bidirectional).
 * 
 * Strategy: enumerate devices WITHOUT a temp stream (avoids audio
 * ducking). If labels are available (permission already granted),
 * pick built-in by deviceId. If not, request with processing
 * disabled and let the OS pick (usually built-in).
 */

/**
 * Get a mic stream that avoids BT mics.
 * No temp streams, no audio ducking, no BT profile flicker.
 */
export async function getPreferredMicStream(): Promise<MediaStream> {
  const baseConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  try {
    // Try to enumerate WITHOUT opening a stream first
    // (labels are available if permission was previously granted)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');

    // Check if we have labels (permission was granted before)
    const hasLabels = audioInputs.some((d) => d.label.length > 0);

    if (hasLabels && audioInputs.length > 1) {
      const btKeywords = ['bluetooth', 'bt ', 'hands-free', 'hfp', 'wireless', 'airpod', 'buds', 'galaxy buds'];
      const builtIn = audioInputs.find((d) => {
        const label = d.label.toLowerCase();
        return !btKeywords.some((kw) => label.includes(kw));
      });

      if (builtIn?.deviceId) {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...baseConstraints, deviceId: { exact: builtIn.deviceId } },
        });
      }
    }

    // No labels (first time) or only one mic — just request directly.
    // Android defaults to built-in mic for getUserMedia which is what we want.
    // The key is NOT specifying a BT device, so BT stays on A2DP.
    return await navigator.mediaDevices.getUserMedia({ audio: baseConstraints });

  } catch (err) {
    console.warn('Mic selection failed:', err);
    return await navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
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
    return 'prompt';
  }
}
