/**
 * Mic selection utility.
 * 
 * CRITICAL: Must avoid opening a Bluetooth mic, which forces Android
 * to switch BT from A2DP (high quality stereo output) to HFP
 * (compressed mono bidirectional). This ruins click audio quality
 * through BT earbuds.
 * 
 * Strategy: explicitly request the built-in microphone by deviceId.
 * BT earbuds stay on A2DP for output, phone mic handles input.
 */

/**
 * Get a mic stream that explicitly uses the built-in microphone.
 * Prevents BT HFP switch that would degrade audio output quality.
 */
export async function getPreferredMicStream(): Promise<MediaStream> {
  // Step 1: Get initial permission (needed to see device labels)
  const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // Stop immediately — we just needed permission to enumerate
  tempStream.getTracks().forEach((t) => t.stop());

  // Step 2: Find the built-in mic
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');

  const btKeywords = ['bluetooth', 'bt ', 'hands-free', 'hfp', 'wireless', 'airpod', 'buds', 'galaxy buds'];
  const builtInMic = audioInputs.find((d) => {
    const label = d.label.toLowerCase();
    // Prefer devices that DON'T match BT keywords
    return !btKeywords.some((kw) => label.includes(kw));
  });

  // Step 3: Open mic with explicit deviceId + all processing disabled
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // Force built-in mic by deviceId if found
      ...(builtInMic?.deviceId ? { deviceId: { exact: builtInMic.deviceId } } : {}),
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.warn('Built-in mic request failed, trying default:', err);
    // Fallback: any mic, still with processing disabled
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
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
