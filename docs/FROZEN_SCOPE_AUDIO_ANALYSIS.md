# Frozen Scope — Audio, Recording, Analysis, Practice

Status: frozen for implementation on `frozen-scope-audio-analysis`.

## Product outcome

Poly Pro should provide a responsive practice and recording workflow centered on accurate metronome timing, reliable high-quality capture, useful nondestructive playback cleanup, detailed recording analysis, and fast repetition of problem sections.

## Frozen scope

1. **Responsive, low-latency metronome audio**
   - Near-immediate start from the user gesture.
   - Stable Web Audio scheduling and click playback.
   - Preserve the existing high-quality click/sample path.

2. **High-quality recording and playback**
   - Preserve raw PCM as the source of truth.
   - Prefer the built-in microphone when Bluetooth routing would degrade capture/output quality.
   - Keep capture nondestructive.
   - Add playback-only filtering/cleanup rather than modifying source PCM.

3. **Full recording-analysis workspace**
   - Waveform/spectrogram timeline.
   - Beat/onset overlays and timing accuracy.
   - Seek, zoom, playback speed, click overlay, scoring controls, charts, and export.
   - Filters must be understandable and reversible.

4. **Editable timing detections**
   - The user must be able to correct false-positive, missed, or misplaced detected hits without altering the original recording.
   - Re-scoring must use the corrected detection set.

5. **Loop-and-improve workflow**
   - Select A/B bounds inside a recording.
   - Repeat that region without editing the source recording.
   - Allow slower playback and click overlay while looping.

6. **Practice modes**
   - Preserve and improve existing count-in, gap-click, random-mute, play/mute cycle, swing, trainer, grouping, subdivision, and polyrhythm controls.

7. **Take comparison and progress tracking**
   - Preserve session/project history.
   - Make repeated takes comparable using timing/consistency metrics and project progress.

8. **Recording reliability**
   - Preserve raw AudioWorklet capture.
   - Handle microphone permission/device failures clearly.
   - Avoid silent data loss and keep stored recordings associated with their session.

## Existing implementation to reuse

The current repository already contains substantial portions of the scope and they are explicitly reused rather than rebuilt:

- Web Audio metronome engine and scheduler.
- Raw PCM AudioWorklet recording.
- Built-in microphone preference / Bluetooth-routing protections.
- Session persistence and recording storage.
- Offline onset analysis and live scoring controls.
- DAW-style timeline with spectrogram, seek, zoom, playback speed, click overlay, and WAV export.
- Practice modes and trainer controls.
- Project/session progress views.

## Implementation rule

Do not replace existing working systems merely to satisfy this scope. Make the smallest complete change for each missing behavior. No schema, dependency, or broad architecture change without explicit approval.

## Current branch delta

- Added nondestructive A/B looping to the recording timeline. Loop bounds are stored only in component state and never modify the raw PCM recording.

## Remaining frozen-scope gaps

- Playback-only audio cleanup/filter chain for recorded audio.
- Direct manual editing of detected hit/onset positions and inclusion state, followed by re-scoring from corrected events.
- Any take-comparison UI improvements needed beyond the existing progress/session views.

These are implementation gaps inside the frozen scope, not permission to expand the scope.
