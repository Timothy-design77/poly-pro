# Poly Pro — Execution Status

**Repository:** `Timothy-design77/poly-pro`  
**Production branch:** `main`  
**Production URL:** `https://timothy-design77.github.io/poly-pro/`  
**Manual-test source of truth:** `docs/MANUAL-TEST-LEDGER.md`

This file is the short-form implementation/progress ledger. The manual ledger is authoritative for anything that still requires real Fold 7 verification. Automated CI success must never be recorded as a manual PASS.

## Governing product goals

- Mobile-first PWA optimized for Samsung Galaxy Z Fold 7.
- Local-first v1 with no account requirement.
- Quick Start works without a project; project access stays within three actions.
- Main content is vertical-scroll-first. Horizontal navigation gestures are allowed only on the persistent bottom navigation bar.
- Clean modern light-gray UI with high-contrast text; preserve the current accepted color system.
- Large rounded touch targets, centered layout, no accidental text selection.
- BPM ring is the dominant Home control and opens the keypad directly.
- Primary Home stack is **BPM ring → RECORD → START → TAP TEMPO**.
- Advanced metronome/practice controls live lower in the vertical scroll and remain collapsed until needed.
- Recording/analysis remains the central advanced workflow; preserve raw audio, detection, calibration, session review, analytics, instrument classification, groove/dynamics, projects, backup/export, custom samples, and optional cloud enhancement.
- Interaction latency and perceived responsiveness are first-class UX requirements.
- Git is the implementation/progress source of truth; `docs/MANUAL-TEST-LEDGER.md` is the device-test source of truth.

## Current implementation snapshot

### Navigation / responsiveness — COMPLETE

- Main page swipe navigation was removed; normal content does not horizontally switch pages.
- Persistent bottom navigation provides Projects / Home / Progress / Settings.
- Bottom navigation itself supports deliberate left/right swiping.
- Settings is a first-class bottom-nav destination; no top-corner Done button is required.
- App pages remain mounted while navigating so entering Settings does not tear down active playback/recording hooks.
- Heavy Settings content mounts only when visible.
- Advanced Home cards no longer animate layout height for 250 ms.
- Heavy advanced children are unmounted while cards are closed and mount after immediate header feedback.
- Overlay/keypad/modal motion was shortened to approximately 120–180 ms.

### Home primary-control redesign — COMPLETE

- Accepted light/high-contrast palette retained.
- Ring is the only primary-screen BPM keypad entry control.
- Separate Set BPM control removed from the primary surface.
- Fine ±0.5 BPM controls moved to **Advanced > Fine Tempo**.
- RECORD is a large full-width rounded control.
- START is the dominant full-width rounded control with an approximately 4:1 width-to-height ratio.
- TAP TEMPO is a large full-width rounded control and registers on pointer-down.
- Primary order is **ring → RECORD → START → TAP TEMPO**.
- Meter, Pattern, Practice Modes, Trainer, Polyrhythm, and Fine Tempo live below the primary surface.

### Full-width BPM ring — COMPLETE

- Ring container breaks out of the normal 16 px content inset while primary buttons keep their readable inset.
- Ring target increased from 74% of inset content width / 340 px max to 96% of the full-bleed ring area / 520 px max.
- Larger ring intentionally pushes the primary action stack farther toward the lower-thumb reach zone.

### Quick Start / projects / sessions — COMPLETE

- Quick Start is a real no-project mode; the app does not auto-create or force a project.
- Quick Start recordings use `projectId: null` and remain visible in Progress.
- Project selection uses normal taps plus explicit Edit rather than long-press-only editing.
- Project switching preserves/restores per-project metronome snapshots.
- Recording → analysis → Review → Session Detail remains connected.
- Session Detail Score / Timeline / Charts / Tune are explicit tap tabs rather than horizontal swipe pages.

### Settings / advanced feature reachability — COMPLETE

- Detection presets and Detection Test Bench remain reachable.
- Calibration flow remains reachable with fine-tune reset and explicit Clear Calibration.
- Instrument training/management remains reachable.
- Built-in/custom sound management remains reachable.
- Data backup/export/import and cleanup flows remain reachable.
- Optional Cloud Enhancement remains consent-gated.
- Meter/subdivision, pattern, polyrhythm, trainer, and practice modes retain meaningful local reset paths.

### Default Woodblock audio-quality pass — IMPLEMENTATION COMPLETE

- PR #8 replaced the synthetic/fake default `public/sounds/woodblock.wav` with a real recorded woodblock hit from the **Versilian Community Sample Library (VCSL)**.
- Selected upstream sample: `Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav`.
- VCSL license: Creative Commons Zero (CC0 / public-domain-equivalent).
- Upstream/bundled Git blob SHA: `f625cb9b072b8a88ad588f8c125654f31e8c36cb`.
- Main-branch `public/sounds/woodblock.wav` was re-read after merge and reports that exact blob SHA.
- Existing `src/audio/sounds.ts` and the audio engine were intentionally unchanged; the same local filename continues to be loaded/cached.
- The import used a temporary branch-only workflow that verified the upstream blob and deleted itself; there is no permanent importer and no runtime network dependency.
- Detailed provenance: `docs/AUDIO-PASS-WOODBLOCK.md`.
- **Listening/feel acceptance is NOT yet marked PASS.** All required sound checks remain TODO in section D of `docs/MANUAL-TEST-LEDGER.md`.

## Automated verification history

- PR #4 — production mobile UX alignment: type-check PASS, Vitest PASS, production build PASS; merged with full implementation history.
- PR #5 — fluid mobile UX: final CI run 64, type-check PASS, Vitest PASS, production build PASS; merge commit `4dc162e`.
- PR #6 — large primary controls: CI run 67, type-check PASS, Vitest PASS, production build PASS; merge commit `0b70c9d`.
- PR #7 — full-width BPM ring: CI run 69, type-check PASS, Vitest PASS, production build PASS; merge commit `12a4d09`.
- PR #8 — real default woodblock: CI run 74, type-check PASS, Vitest PASS, production build PASS, upstream audio blob integrity PASS; merge commit `bcc0ae6`.

## Manual testing policy / current status

The user is currently doing lightweight feel/nitpick testing while implementation continues. Do **not** repeatedly interrupt that process with the full acceptance suite.

All known required device checks have been consolidated into `docs/MANUAL-TEST-LEDGER.md`, including:

- Home/ring/button ergonomics and scroll behavior.
- Bottom-nav tap/swipe behavior and Settings persistence during playback/recording.
- BPM keypad, Fine Tempo, Tap Tempo, timing, and playback behavior.
- Real default woodblock timbre, fatigue, clipping, fast-tempo overlap, loudness balance, first-load behavior, offline behavior, and sound switching.
- Recording → analysis → Review → Session Detail.
- Quick Start / projects / Progress and project snapshot restore.
- Advanced controls, resets, detection, calibration, instruments, backup/data, and cloud-consent behavior.
- PWA persistence/update/offline behavior.

Items remain TODO until the user actually verifies them on-device. New nitpicks must add their relevant acceptance checks to that ledger before or during implementation.

## Progress log

- 2026-08-17 — Repository lineage confirmed; `poly-pro` is canonical.
- 2026-08-17 — Light/high-contrast UI, safe vertical content navigation, Quick Start, project/session workflow, resets, and advanced-feature reachability aligned and deployed through PR #4.
- 2026-08-17 — PR #5 made Settings a persistent bottom-nav destination, added bottom-bar swipe navigation, removed residual expensive panel animations, lazy-mounted advanced controls, and simplified Home hierarchy.
- 2026-08-17 — PR #6 established the accepted large primary stack: ring → RECORD → START → TAP TEMPO, with Fine Tempo and other controls below.
- 2026-08-17 — PR #7 enlarged the BPM ring to a near-full-width/full-bleed presentation to move primary actions lower for easier reach.
- 2026-08-17 — `docs/MANUAL-TEST-LEDGER.md` created as the cumulative source of truth for everything still requiring real-device verification.
- 2026-08-17 — PR #8 replaced the default fake woodblock with the verified CC0 VCSL `wood_click_mp.wav` recording; CI run 74 passed all automated gates; merge commit `bcc0ae6`.
