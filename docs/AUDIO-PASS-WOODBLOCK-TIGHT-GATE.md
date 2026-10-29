# Audio Pass — Tight-Gated Woodblock

## Goal

Keep the real VCSL woodblock timbre while removing audible room/background noise and shortening the sample into a fast metronome-specific transient.

## Source

The bundled source remains the exact CC0 VCSL recording already in the app:

- `Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav`
- Upstream Git blob SHA: `f625cb9b072b8a88ad588f8c125654f31e8c36cb`
- 44.1 kHz, 16-bit, stereo

The original WAV remains intact in `public/sounds/woodblock.wav`. The cleanup is applied once when that WAV is decoded, and only the cleaned `AudioBuffer` is cached for playback.

## Runtime DSP

`src/audio/sounds.ts` now preprocesses only the built-in `woodblock` buffer:

1. Scan all channels and measure the source peak.
2. Apply a first-order **150 Hz high-pass** to remove low room/handling rumble.
3. Build a cross-channel transient envelope from the filtered signal.
4. Open the gate only when the signal reaches the higher of:
   - 8% of the filtered peak, or
   - -40 dBFS.
5. Keep only **0.5 ms of pre-roll** before the detected strike.
6. Preserve the natural attack/body at full gain.
7. Begin a cosine fade **45 ms after onset**.
8. Reach the hard end **70 ms after onset** and force the final sample to exact zero.
9. Keep peak level close to the original recording, with no more than 1.25x boost and no target above -1 dBFS.
10. Cache the processed buffer, so the timing-critical per-beat path performs no filtering or gating work.

If onset detection cannot find a meaningful strike, the loader safely falls back to the unprocessed source buffer rather than returning broken audio.

## Expected effect

- practically no pre-hit room tone;
- no long ambient/room tail;
- reduced low-frequency rumble;
- retained real wooden transient;
- much faster on/off behavior at dense subdivisions and high BPM;
- no new runtime network dependency;
- no change to sound IDs, settings, scheduling, or the other built-in/custom samples.

## Manual checks

Do not mark these PASS until actually heard on-device. The authoritative list is also mirrored in `docs/MANUAL-TEST-LEDGER.md`:

- no audible room hiss/noise before or after the click;
- attack still sounds like real wood rather than a synthesized tick;
- decay feels fast/on-off rather than roomy;
- no zipper/click artifact from the gate itself;
- no overlap/smear at high BPM or dense subdivisions;
- repeated practice remains pleasant and non-fatiguing;
- perceived loudness remains balanced with the other built-in sounds.
