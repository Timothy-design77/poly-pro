# Poly Pro 2.4 release readiness

Updated 2026-10-20. Current iteration: `improve/clear-practice-and-sync`, based on deployed `44e5f0e`. The original 2.1 audit below started at `c90e2d8`.

## Release decision

The 2.4 release passes 127 unit/regression tests and 112 browser checks, type-checking, production build and a clean dependency audit. Release verification is recorded in [release/verification.txt](release/verification.txt). Target-device acceptance remains open below. Physical Galaxy Z Fold 7 acceptance is required before calling the release fully production-validated.

The 2.4 [interface and sync audit](INTERFACE_AND_SYNC_AUDIT.md) addresses the reported clutter, startup delay, hidden playback sync and inconsistent navigation. [The style guide](STYLE_GUIDE.md) defines the bundled DM Sans typography, shared controls and simpler navigation. Start prepares only selected sounds; Review exposes precise sync and explicit beat/hit alignment. Recordings lists all takes first with a project filter.

The 2.3 [Practice flow audit](PRACTICE_FLOW_AUDIT.md) adds timed capture, cancellation, undo/redo, bounded WAV export, audio lifecycle fixes, correct groove analysis and deeper accessibility checks. The [2.2 audit](PRACTICE_REVIEW_AUDIT.md) covers silent capture, one review draft/save, captured-grid rendering, reversible flam tuning, and synchronous storage-failure rollback. Review has two views: Review for listening/editing/timing and Charts for detailed metrics.

The product is a percussion practice companion: start a dependable metronome, record a take, understand and correct its timing, then practice toward a project tempo goal. Android Chrome is the primary browser. The light interface, existing metronome engine, local storage and account-free operation are preserved. Cloud enhancement is deferred; this build does not upload recordings.

## Baseline audit and resulting behavior

| Baseline finding | Upgrade |
| --- | --- |
| Saved hit corrections left Score and Playback showing contradictory data | Atomic analysis/event writes, durable revisions/configuration, stale-write rejection and live session subscriptions |
| Auto-advance changed the project number but lost it when switching | Transport and saved snapshot advance together; project operations await storage; project creation preserves acoustic settings |
| Failed/cancelled analysis had no recovery UI or durable original timing | Chunk-level capture timing, saved-audio retry, cancellable workers and explicit re-detection confirmation |
| Recording silently continued after storage/device failure | Visible lifecycle states, prompt stop on microphone/worklet/storage failure, recoverable saved chunks |
| Playback speed changed its label without changing active audio | Shared media clock, actual source-rate changes, native A/B loops, bounded click scheduling and visible export errors |
| Tune only previewed scores and changed global defaults | One Review draft and Save changes action; separate scoring defaults; original analysis configuration retained |
| Calibration, editing and charts retained unreadable dark-theme styles | Consistent light surfaces, readable canvas annotations, accessible recording activation and dialog focus handling |
| Training used a separate capture/detection path and misleading confidence | Shared AudioWorklet/worker detector, useful-hit minimums, 60-second bound, 200-sample cap and validation across multiple instruments |
| No dedicated take comparison | Side-by-side metrics recalculated with one scoring window, while preserving each take's calibration and saved results |
| Backup validation and multi-record mutations were incomplete | Validate archives before atomic import; preserve existing corrections; restore settings/presets/audio MIME; atomic deletion and orphan-project recovery |
| Reopening immediately could lose a new setting | Settings and transport writes begin immediately instead of waiting for debounce |
| Development dependencies failed the release audit | Supported dependency updates, Tailwind 4 integration and a shared verification/deployment gate |

The baseline had 72 passing unit tests and three browser smoke tests despite these defects. The regression suite now exercises complete workflows and failure recovery, rather than relying on those smoke results.

## Verification evidence

Final command results are recorded in [release/verification.txt](release/verification.txt). Tests run against the built production PWA, with Chromium at 412×915 (touch/mobile emulation) and 884×1104. These viewport configurations approximate the intended folded/unfolded layouts; they are not physical Fold 7 tests.

Coverage includes:

- Keyboard recording → chunk storage → analysis with matching sample timing/configuration.
- Correct hits and adjust timing → preview across Review/Charts → Save changes → reopen/reload; unsaved-edit protection, re-detection confirmation and saved-audio retry.
- Actual audio-source playback rate, native loop bounds, pause/resume and WAV download.
- Explicit reference-hit alignment at 137.5 ms, matching native click scheduling, undo, atomic save and reload.
- Cold/warm click startup with an unavailable unused sound, local font loading, above-fold practice actions and consistent navigation.
- Recording filters and active-project deletion preserve takes and recover the selected filter.
- Project creation/editing/switching/deletion, plus progression/transport regression tests.
- Backup including a project snapshot, audio, settings and hit data; delete → import → playback; invalid archive rejection and transaction rollback.
- Denied permission, disconnected microphone, failed chunk writes, late microphone setup cancellation and interrupted-recording recovery.
- Custom sample capture/save/selection/reload; instrument capture/detection/profile persistence; multi-label confidence refresh; successive detection-bench patterns and cancellation.
- Take comparison without changing saved scores, dialog focus, narrow layout and offline service-worker reload.
- Deterministic synthetic transients, including all 359 hits in a three-minute recording within 20 ms of their known locations. This is a synthetic-signal regression, not an acoustic accuracy claim.

Screenshots of [Practice](release/home.png), [Settings](release/settings.png), [Recordings](release/recordings.png), [Projects](release/projects.png), [Review](release/review.png), [Sync](release/sync.png), [Charts](release/charts.png), [320px Review](release/review-320.png) and [wide Review](release/review-wide.png) were reviewed. Automated WCAG A/AA checks cover primary screens, Review, expanded Home/Settings controls and training/project dialogs at both main viewports; canvas bounds are also tested at 3× pixel density. The initial application JavaScript chunk is approximately 340 kB (105 kB gzip); settings and Session Detail load separately. Waveform/spectrogram preparation runs in a worker, spectral display work is bounded and playback schedules only the next 150 ms of clicks.

## Device acceptance still required

Use a full backup of any existing practice data before upgrading a device used for real practice. Record the installed build ID shown in Settings, Android/Chrome versions, input/output devices and results in this table.

| Physical check | Procedure and pass condition | Status |
| --- | --- | --- |
| Folded/unfolded navigation | Install the PWA, change posture/orientation, use keypad, advanced controls, editing and dialogs without clipping or lost state | Pending device |
| Real percussion detection | Quiet and noisy rooms; soft/strong singles, flams, doubles and rolls; compare detected hits to the recording and correct mistakes | Pending device |
| Calibration | Built-in speaker/microphone, repeated runs, cancellation, known offset and manual adjustment; inspect consistency | Pending device |
| Audio routing | Built-in microphone with speaker, wired/USB output and Bluetooth output; verify the selected input and audible click quality | Pending device |
| Sustained session | Record and analyze 5, 15 and 30 minutes; check storage, responsiveness, heat, waveform opening and export memory | Pending device |
| Background/interruption | Lock/unlock, switch apps, incoming call, microphone revocation, close/reopen during capture; verify any saved partial take | Pending device |
| Offline/update | Install online, relaunch offline, use metronome/record/review; install a new build and verify Update now is unavailable during practice | Pending device |
| Real data restore | Export a full backup, restore in an isolated browser profile/device, verify representative projects, custom sounds and recordings | Pending device |

Mobile browsers can suspend microphone/audio work in the background. Keeping the app foregrounded is the supported practice workflow until device acceptance establishes additional behavior. Instrument confidence is local training-set validation, not a guarantee of recognizing overlapping acoustic drums. Calibration and detection depend on placement, room sound and routing; scores with missing original timing are explicitly approximate.

## Data and operational limits

- Recording is capped at 30 minutes with a warning after 25 minutes; chunks are stored during capture. Optional preparation delays are 3/5/10 seconds and timed takes are 15/30/60/120/300 seconds, including musical count-in. Preparation choices are device-local preferences. Memory still scales with recording length during analysis/playback and the exported WAV blob; additional float rendering during click export is bounded to ten seconds.
- Scoring and flam windows are fixed milliseconds derived from the take's starting tempo and subdivision. The captured grid follows trainer tempo changes, while these tolerance windows stay fixed throughout the take; Timing and Charts state this convention explicitly.
- Training stops at 60 seconds. Custom sounds record at most four seconds; imports are limited to 20 MB and the first four seconds.
- Full backups are bounded at approximately 512 MiB of source data. Import limits are 768 MiB compressed and 1 GiB expanded. A data-only backup omits recording audio but retains analysis, profiles and custom samples.
- IndexedDB is device/browser-profile local. Clearing site storage deletes it; the app requests persistent storage but the browser controls eviction. Export backups regularly.
- Existing session IDs and corrections are preserved on import. Settings restoration is explicit and optional; missing project references are moved to Quick Start.
- No automatic database deletion on startup failure. Retry storage after closing an older conflicting app tab.

## Release and rollback

Run the commands in the README. Pull requests must pass type-checks, unit tests, production build, dependency audit and browser workflows. A main-branch deployment invokes the same reusable workflow and publishes only its verified build artifact. Configure GitHub Pages to deploy through Actions.

The database schema remains version 5; new analysis/timing fields are optional for existing data. Prefer rolling forward after a defect. Reverting to old application code may ignore new fields or reproduce the old stale-write bugs. A full backup plus a validated build is the recovery path. Deployment uses the existing GitHub Pages workflow; verify the live build ID and recording/review/offline flow after merge. Physical-device acceptance remains separate from browser and CI evidence.
