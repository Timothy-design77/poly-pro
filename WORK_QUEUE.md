# Poly Pro production upgrade

Started 2026-10-13. Baseline: `c90e2d8`. Branch: `upgrade/production-readiness`.

## Product intent

A mobile practice companion: an immediate, dependable metronome; safe recording; understandable playback and hit correction; honest timing feedback; and projects that make improvement visible. Primary target is Galaxy Z Fold 7 / Android Chrome. Keep the light theme, local-first storage, no accounts, and defer cloud processing. These assumptions were confirmed by the user.

## Working loop

For each queue item: plan the smallest complete behavior → reproduce/test the failure → implement → simplify the design → test again → record evidence → plan the next item. Protect existing data and working metronome behavior. Device acceptance remains distinct from automated verification.

## Queue and acceptance criteria

- [x] Q1 Session integrity: saved corrections and scores agree across every tab, reopen, and reload; analysis settings are durable; edits cannot silently overwrite stale data.
- [x] Q2 Project progression: advancement sets the next practice tempo and survives switching/reload; project creation preserves global acoustic settings; writes/deletes are reliable.
- [x] Q3 Recording lifecycle: visible preparing/saving/error states; keyboard/touch activation; microphone/storage interruption stops promptly and preserves recoverable data; recording timing survives interruption.
- [x] Q4 Analysis recovery: retry saved audio, cancel safely, re-detect with explicit consent to replace edits, apply scoring changes to a session, and communicate insufficient data honestly.
- [x] Q5 Playback: speed, click, seek, pause/resume, A/B loops and end-of-track stay synchronized; bounded scheduling; errors are visible; export works.
- [x] Q6 Mobile usability: consistent light-theme contrast, useful empty/error states, accessible dialogs and controls, no accidental gesture activation.
- [x] Q7 Analysis/instruments: shared onset extraction, bounded training, meaningful confidence, deterministic signal regressions, timing quality notes and practical calibration.
- [x] Q8 Data and performance: backup/restore validation, atomic destructive operations, settings restore, interrupted work protection, worker-based visualization and bounded audio preparation.
- [x] Q9 Progress: useful take comparison with consistent analysis settings and trustworthy progression.
- [x] Q10 Release: dependency audit passes, deploy depends on all checks, complete workflow browser tests, offline/recovery tests, documentation and final review.

- [ ] Device acceptance: execute the physical Fold 7 checklist in [production readiness](docs/PRODUCTION_READINESS.md). This requires the target phone, real percussion and audio routes; viewport/synthetic tests do not satisfy it.

## Completion standard

All implemented flows pass type-check, unit/regression tests, production build and browser tests, with no known unresolved high-priority software defects. Final review includes recording → analysis → review → playback → correction → save → reopen, projects/progression, backups, permissions/failures and offline launch. Do not label physical microphone, Bluetooth, acoustic accuracy or target-device thermal testing as passed without actual evidence.

## Iteration log

- Baseline audit: 72 unit tests and 3 smoke tests pass; recorded multiple integration/UX failures and 6 high-severity development dependency findings. Baseline findings and resulting fixes are summarized in [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).
- Q1 planned: make Session Detail subscribe to the selected session's current revision, retain analysis settings, and verify correction persistence across tabs and reload.

- Q1 verified: correction browser regression failed before the fix, passes after. Session revisions prevent stale writes; tab updates retain saved event counts; scoring config is durable.
- Q2 verified: two added regressions failed before the fix, pass after. Advancement updates the transport and saved project; selecting a fresh project preserves acoustic settings. Project updates now await storage.
- Q3/Q4 implemented: keyboard recording, preparing/saving states, chunk timing, microphone/storage interruption handling, saved-audio retry, explicit re-detection replacement and durable Tune apply. Browser tests cover recording metadata, retry and Tune persistence. Cancellation and failure injection remain in the final workflow pass.
- Q5 implemented: common media clock for speed, pause/resume and native loops; clicks scheduled in a bounded lookahead; export failures visible. Clock unit tests pass; browser transport verification is in progress.
- Q6/Q7 in progress: fixed calibration/editor/canvas light-theme contrast; training now shares the session detector in a worker, uses AudioWorklet, stops at 60 seconds and caps saved samples. Single-instrument training no longer claims validated recognition. Calibration cancels pending setup and scheduled chirps.

- Q5 verified: browser instrumentation confirms actual source-rate changes and native loop bounds; pause/resume and WAV download pass. Consolidated review into one saved-take player/editor/exporter instead of maintaining two playback implementations.
- Q6 verified: reviewed narrow Home, Playback, Tune and Calibration screenshots; both viewports pass focus/navigation/overflow checks. Dialogs use shared focus handling, recording supports keyboard activation, and settings/detail chunks load on demand.
- Q7 verified: training and detection bench use the shared worker detector; real feature extraction/persistence tested with synthetic percussion; successive diagnostic patterns and cancellation pass. Single-label confidence is unvalidated, all profile confidence refreshes when labels change. A three-minute regression detects all 359 known transients within 20 ms.
- Q8 verified: failure injection recovers audio after microphone loss and storage failure; pending calibration streams close after cancellation. Validated archives restore atomically, preserve corrections and optional settings; deletes remove recovery chunks. Review found and fixed metadata overwrites and orphan-project imports.
- Q9 verified: comparison applies common scoring without mutating saved takes; mismatched detection/tempo is disclosed. Project advancement updates both saved tempo and active transport; insufficient/estimated timing does not advance projects.
- Final-loop regression: 36/38 browser checks initially passed; the custom-sound reload check exposed a 500 ms persistence window. Removed the debounce for user settings and transport writes; both viewport regressions now pass.
- Q10 final pass: dependency updates remove audit findings; deployment waits for the reusable verification workflow and uses its tested artifact. Full workflow checks and release documentation are complete.

- Final review regression: re-scoring now retains an intentionally empty count-in grid. Apply waits for the current scoring preview; precision sliders have keyboard and accessible-value support. The Tune browser check changes calibration and verifies the resulting saved score/configuration.
- Final evidence: **92 unit/regression tests across 15 files; 40 browser checks across two viewports; type-check and production build pass; zero dependency audit findings; clean diff formatting.** Project deletion also has a database regression proving audio and corrected events survive in Quick Start.
- Handoff: Q1–Q10 software work is complete. [Readiness report](docs/PRODUCTION_READINESS.md) and [verification record](docs/release/verification.txt) contain the audit outcome, commands, limits and remaining physical acceptance. No production deployment was performed. Device acceptance is intentionally still open.

## Delivery preference

2026-10-15: The user clarified that “push” means commit/push the changes, merge into `main`, and deploy. Follow the release checks and verify the live build as part of that request. This release is authorized for deployment; physical-device acceptance remains tracked in the readiness report.
