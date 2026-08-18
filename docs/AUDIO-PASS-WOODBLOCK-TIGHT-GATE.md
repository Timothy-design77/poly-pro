# Audio Pass — Tight-Gated Woodblock

## Goal

Keep the real VCSL woodblock timbre while removing audible room/background noise and shortening the sample into a fast metronome-specific transient.

## Processing target

Source remains the exact CC0 VCSL recording used by the app:

- `Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav`
- Upstream Git blob SHA: `f625cb9b072b8a88ad588f8c125654f31e8c36cb`
- 44.1 kHz, 16-bit, stereo

The processed default should:

- remove pre-hit and post-hit room/noise floor;
- high-pass low-frequency rumble;
- preserve the natural wooden attack;
- use an aggressively short decay suitable for repeated metronome clicks;
- reach exact digital silence after the gated tail;
- remain local/offline and use the existing `woodblock.wav` path.

## DSP target

The processing pass will:

1. Download and verify the original VCSL source by Git blob SHA.
2. Detect the strike onset from the real waveform.
3. Apply a first-order 150 Hz high-pass filter to reduce room/handling rumble.
4. Keep a tiny pre-roll around the detected attack.
5. Limit the useful click window to approximately 80 ms.
6. Apply a short fade over the end of that window instead of preserving the original long room tail.
7. Trim the WAV at the end of the gated window so there is no residual room tail.
8. Peak-normalize conservatively so the new gate does not make the click unexpectedly louder.
9. Replace `public/sounds/woodblock.wav` without changing audio-engine code.

## Manual checks

Do not mark these PASS until actually heard on-device:

- no audible room hiss/noise before or after the click;
- attack still sounds like real wood rather than a synthesized tick;
- decay feels fast/on-off rather than roomy;
- no zipper/click artifact from the gate itself;
- no overlap/smear at high BPM or dense subdivisions;
- repeated practice remains pleasant and non-fatiguing;
- perceived loudness remains balanced with the other built-in sounds.
