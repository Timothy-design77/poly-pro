# Poly Pro — Manual Device Acceptance Ledger

This is the source of truth for **what still requires real-device/user verification**. Automated type-checks, unit/regression tests, and production builds are tracked in CI and are not substitutes for the checks below.

**Target device:** Samsung Galaxy Z Fold 7  
**Policy:** Keep accumulating items here while implementation/nitpick work continues. Do not mark an item PASS unless it has actually been exercised on-device by the user.

## Status legend

- `TODO` — still needs device/user verification.
- `PASS` — user/device verification completed successfully.
- `FAIL` — user/device verification exposed an issue; link/follow with the corrective pass.

## A. Primary Home UX

- TODO — Large BPM ring is visually centered, nearly full-width, and does not clip in the intended Fold orientations/layouts.
- TODO — Ring tap reliably opens the BPM keypad; no separate keypad control is required.
- TODO — Primary order feels correct in normal use: **BPM ring → RECORD → START → TAP TEMPO**.
- TODO — Larger ring places RECORD/START/TAP TEMPO in a comfortable lower-thumb reach zone without making the screen awkward.
- TODO — RECORD, START, and TAP TEMPO large rounded controls respond immediately and do not double-fire.
- TODO — Vertical scrolling over/around primary controls does not accidentally activate controls.
- TODO — Advanced controls remain clearly below the primary practice surface and vertical scrolling stays fluid.
- TODO — Pattern and other advanced cards open/close without perceptible lag or jank.

## B. Navigation / Settings

- TODO — Bottom navigation remains visible on Home, Projects, Progress, and Settings.
- TODO — Tapping each bottom destination changes sections immediately and reliably.
- TODO — Horizontal swipe **on the bottom navigation bar** moves one destination at a time and does not cause accidental button taps.
- TODO — Main page content does not change destinations when swiped horizontally; content navigation remains vertical-scroll-first.
- TODO — Settings can be entered/exited entirely from the bottom navigation without reaching for a top Done button.
- TODO — Entering Settings while the metronome is playing does not stop or reset playback.
- TODO — Entering Settings during an active recording does not tear down or corrupt the recording session.

## C. Tempo / Metronome

- TODO — BPM keypad accepts decimal values such as 120.5 and enforces the 10–400 BPM range.
- TODO — Advanced > Fine Tempo tap changes BPM by exactly 0.5.
- TODO — Fine Tempo intentional hold accelerates as designed.
- TODO — Starting a vertical scroll on Fine Tempo cancels/reverts any hold adjustment rather than changing BPM accidentally.
- TODO — TAP TEMPO responds on finger-down and converges to a sensible BPM from repeated taps.
- TODO — START/STOP has immediate tactile/visual response and stable audio start/stop behavior.
- TODO — Metronome timing remains subjectively stable during ordinary practice and while scrolling/navigating UI.

## D. Default Woodblock / Sound Quality

- TODO — Default `Woodblock` sounds like a real struck wood block rather than a synthetic/compressed waveform.
- TODO — Default woodblock is pleasant/non-fatiguing during sustained practice at approximately 60, 120, 180, and 240+ BPM.
- TODO — Default woodblock has no audible clipping, crackle, decode artifact, or obvious bad edit at the start/end.
- TODO — Tight-gated woodblock has no audible pre-hit room noise, hiss, or lingering room tail after the strike.
- TODO — Tight gate feels fast/on-off without producing an artificial click, zipper artifact, or obviously chopped wooden attack.
- TODO — Woodblock decay does not create distracting overlap at fast tempos, including 300–400 BPM.
- TODO — Woodblock perceived loudness is reasonably balanced against the other built-in click sounds and does not require extreme volume compensation.
- TODO — Accent/non-accent behavior remains musically distinguishable when Woodblock is selected.
- TODO — Woodblock loads on the first playback after a fresh app/PWA launch without a noticeable stall.
- TODO — Woodblock remains available after going offline/reloading the installed PWA; no network dependency is introduced.
- TODO — Switching between Woodblock and other built-in/custom sounds still works normally.

## E. Recording → Analysis → Review

- TODO — RECORD begins the intended recording workflow and starts/coordinates the metronome as designed.
- TODO — Recording stop completes cleanly and transitions to analysis without losing the session.
- TODO — Analysis overlay completes and Review renders the result.
- TODO — Saving a recording then opening View Details reaches Session Detail successfully.
- TODO — Session Detail Score / Timeline / Charts / Tune change only by explicit tab taps, not horizontal page swipes.
- TODO — Session analytics/charts render meaningful data without layout/readability issues on the Fold.
- TODO — Recording while navigating permitted app sections does not corrupt audio/session state.

## F. Quick Start / Projects / Progress

- TODO — App can be used in Quick Start without creating or forcing a project.
- TODO — A Quick Start recording is saved with no project and appears in Quick Start Progress history.
- TODO — Creating/selecting a project and returning Home stays within the three-action target.
- TODO — Project card tap selects; explicit Edit works; vertical scrolling does not accidentally select projects.
- TODO — Project-specific metronome settings are restored after switching away and back.
- TODO — Switching from a project back to Quick Start preserves the outgoing project snapshot.

## G. Advanced Controls / Resets

- TODO — Meter & Subdivision controls work and Reset returns to the intended defaults.
- TODO — Pattern editing works, including accent cells, and Pattern Reset restores its intended baseline without unwanted sound-setting loss.
- TODO — Polyrhythm controls work and Reset removes extra tracks/restores the main track appropriately.
- TODO — Trainer works and Reset disables/restores trainer defaults.
- TODO — Practice Modes (count-in, swing, gap click, random mute, play/mute cycle) work and Reset restores defaults.
- TODO — Settings > Sounds restores defaults correctly and custom-sample management remains functional.
- TODO — Settings > Recording reset restores only recording settings.
- TODO — Detection presets work; Standard reset restores the baseline preset; Detection Test Bench is reachable.
- TODO — Vibration defaults restore correctly.
- TODO — Calibration fine-tune reset and explicit Clear Calibration work as distinct operations.
- TODO — Instrument training/management remains reachable and functional.
- TODO — Data backup export/import flows open and function without unintended data loss.
- TODO — Optional Cloud Enhancement remains consent-gated and can be left disabled.

## H. Persistence / PWA

- TODO — Settings persist after closing/reopening the PWA.
- TODO — Projects and sessions persist after closing/reopening the PWA.
- TODO — Installed PWA updates to the latest production build correctly.
- TODO — Core metronome and bundled sounds work offline after the relevant assets have been installed/cached.

## Change log

- 2026-08-17 — Ledger created during the real-woodblock sound-quality pass. Existing outstanding device checks from the navigation, fluidity, large-control, full-width-ring, recording, project, and advanced-feature passes were consolidated here.
- 2026-08-17 — Added explicit tight-gate woodblock checks for room-noise removal and gate-artifact quality.
