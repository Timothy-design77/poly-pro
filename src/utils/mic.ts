/**
 * Mic selection utility.
 * 
 * Uses simple { audio: true } to avoid triggering Android BT mode
 * switches. Explicit constraints like echoCancellation:false cause
 * Chrome to signal a "raw capture" intent which makes Samsung buds
 * switch to transparency mode.
 * 
 * v1 works fine with BT because it uses the default constraints.
 * Audio processing (AGC/NS/EC) can be disabled via audio track
 * settings after the stream is opened if needed.
 */

/**
 * Get a mic stream that doesn't disturb BT earbuds.
 */
export async function getPreferredMicStream(): Promise<MediaStream> {
  try {
    // Enumerate to find built-in mic (if labels available)
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
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: builtIn.deviceId } },
        });
        disableProcessing(stream);
        return stream;
      }
    }

    // Default — simple request, no explicit constraint booleans
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    disableProcessing(stream);
    return stream;

  } catch (err) {
    console.warn('Mic selection failed:', err);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    disableProcessing(stream);
    return stream;
  }
}

/**
 * Disable audio processing AFTER stream is opened via track settings.
 * This avoids the getUserMedia constraint path that triggers BT changes.
 */
function disableProcessing(stream: MediaStream): void {
  const track = stream.getAudioTracks()[0];
  if (!track) return;

  try {
    track.applyConstraints({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }).catch(() => {
      // Some devices don't support applyConstraints — that's fine
    });
  } catch {
    // Ignore
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
