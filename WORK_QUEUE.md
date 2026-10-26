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

## Practice and Review iteration — 2026-10-15

Baseline: `e7676a2` (deployed 2.1). Branch: `improve/practice-review-sync`.

- [x] R1 Silent recording: visible on Home, silences an already-running click, retains captured beat timing, restores normal metronome output after stop/failure.
- [x] R2 One Review workspace: open immediately after capture; score, playback, corrections and tuning share one draft and one atomic save. Preserve unsaved work when switching views; confirm before discarding.
- [x] R3 Synchronization: preview markers, score, playback clicks and exports use the same offset/grid. Slider keys do not seek. Playback stops on close/view change and excludes competing metronome audio.
- [x] R4 User and frontend audit: focused regressions, accessibility, narrow/fold layouts, touch/keyboard controls, permissions/recovery, full release verification and evidence.

Audit findings: post-analysis summary duplicates saved-take review; separate Tune tab and playback drawer maintain competing settings; hit edits do not immediately update visible markers; playback sync can differ from saved scoring; timeline playback is not registered as critical activity; metronome button ignores keyboard activation; recording setting only controls auto-start and does not silence a running metronome.

- R1/R2 loop: two focused checks failed on the baseline (slider arrows sought audio; no silent control). Both pass after consolidation. Silent recording now suppresses output even when the metronome was already running, captures its actual grid, and restores sound afterward.
- R3 loop: waveform rendering was regenerating a different grid than playback. Waveform, click scheduling, score preview and WAV export now use the same captured grid and offset. Browser instrumentation verifies a 125 ms captured phase plus 600 ms adjustment produces a 725 ms click in playback and exported WAV.
- R3 storage audit: injected a synchronous failure in the second analysis write; the old code committed the changed score alone. Added explicit transaction abort and a regression that proves the original score and events survive. The browser also verifies the draft remains available for retry.
- R4 frontend audit: fixed nested Help buttons, nested take-card controls, keyboard metronome activation, background focus isolation (including nested confirmation cleanup), missing volume labels, low-contrast text and narrow-screen overflow. Waveform measurement now follows mounting/resizing, mouse seeking works, and high-zoom canvas allocation is bounded.

- R4 complete: 95 unit/regression tests in 16 files, 58 browser checks across both main viewports, build/type-check, and dependency audit pass. Final legacy-metric display adjustment passes the six accessibility/layout checks again. No browser tests were disabled. Physical acceptance stays open.
- Visual review also corrected legacy takes showing an invented 0 ms scoring window or a default Beginner badge; missing windows are disclosed and available timing/hit data drives fallback metrics.

## Practice flow polish — 2026-10-18

Baseline: `8d36c1a` (deployed 2.2). Branch: `improve/practice-flow-polish`.

- [x] P1 Capture preparation: optional visible countdown and automatic take duration; cancellation never starts a late recording; silent/click choices and captured timing stay correct.
- [x] P2 Recoverable editing: undo/redo hit and timing changes, one consistent preview, safe save/discard/close, no stale writes.
- [x] P3 Audio lifecycle: stop cancels pending starts and haptics; silent capture suppresses queued output; screen locks are released after cancellation and unmount.
- [x] P4 Deep audit: exercise advanced settings, projects/progression, analysis, import/export, keyboard/touch and narrow layouts; fix concrete defects and add focused regressions.
- [x] P5 Release readiness: full unit/browser/build/dependency checks, independent review, and a verified live-check procedure for the authorized merge/deployment.

Physical Fold 7, acoustic accuracy and long-session thermal acceptance remain open; automated phone-sized browsers are not physical-device evidence.

- P1 verified: optional delay/manual defaults, exact 15-second auto-stop, no saved countdown audio, cancellation before/after microphone permission, and Trainer starting-tempo agreement. Setup and navigation cannot hide or alter an active take.
- P2 verified: mixed edit/timing undo/redo, one step per slider drag, branch reset, failed-save retry and stale post-save reads all preserve the correct draft/base.
- P3 verified: pending starts, haptic timers, suspended scheduler catch-up and overlapping wake-lock requests have focused regressions.
- P4 verified: real measure IDs fix groove consistency; 16,000-hit analysis coverage; durable analysis success and progression notices; truthful backup outcomes/streaks; all advanced controls audited at 320px. WAV exports are cancellable, bounded during mixing and match a whole-buffer reference.
- P5 evidence: **125 unit/regression tests, 104 browser checks, type-check, production build, clean dependency audit and diff checks pass**. Final screenshots and [verification record](docs/release/verification.txt) are updated. [Practice flow audit](docs/PRACTICE_FLOW_AUDIT.md) records findings and the fixed starting-tempo scoring convention.
- Delivery follows the standing merge/deploy authorization and existing verified-artifact workflow; final live build evidence is reported with the release. Physical acceptance remains open.
- CI feedback loop: an intermittent contrast failure exposed low-contrast intermediate navigation colors. Removed the color fade; production build and ten repeated primary-screen accessibility checks pass. Full CI runs again before merge and deployment.
- Deployment test follow-up: synchronize the reminder reload check with its save-completion signal. Ten repeated checks pass; this changes the test only. Live 2.3 build `1d6e0ac` passes countdown cancellation, silent capture, direct Review, playback and offline reload without page errors.

## User feedback: clarity, response and sync — 2026-10-20

The user reports excessive text/visual clutter, delayed first click, inaccurate and hard-to-find recorded-playback sync, and inconsistent navigation. Passing regression checks did not establish a good everyday experience. This iteration is driven by those reports.

- [x] U1 Define and apply one offline font, spacing/type/control system and navigation pattern. Keep the practice actions visible and move explanations into contextual help.
- [x] U2 Remove unrelated sound loads from the Start path. Measure first-source timing on cold/warm starts and with a slow unused sound; preserve cancellation and selected sounds.
- [x] U3 Put Sync directly beside playback. Provide precise earlier/later controls and explicit reference-beat alignment to a recorded hit; retain one preview/save across waveform, click, score and export.
- [x] U4 Verify the actual tasks on narrow/wide layouts with screenshots, keyboard/touch and focused audio/data regressions. Run the local release gates.

U4 evidence: 127 unit/regression tests, 112 browser checks, type-check/production build, zero dependency vulnerabilities and diff checks pass. The startup probe fell from 1,672 ms to 9.3 ms; this is software scheduling only. A 137.5 ms reference alignment matches native click scheduling and survives save/reload. Full capture/filter/delete testing found and fixed the hidden active-project Delete action. See [interface and sync audit](docs/INTERFACE_AND_SYNC_AUDIT.md), [style guide](docs/STYLE_GUIDE.md) and [verification](docs/release/verification.txt).

Delivery follows the standing merge/deploy authorization. CI repeats the release gates; the final report records the deployed build and fresh-profile/existing-data update checks. Physical acceptance remains open.

## Collaborative circular-interface refinement — 2026-10-21

**Superseded release checkpoint, 2026-10-26:** The user now explicitly delegates design decisions and asks for a finished product without further design reviews. Preserve the circular concept and earlier product constraints; implement, verify, merge and deploy under the standing release authorization. The historical review steps below describe the earlier plan, not a current approval requirement.

The user wants the existing circular metronome refined, with restrained color, strong typography and spacious controls. They rejected the A/B/C studies because those removed the circle. They explicitly want heavy involvement in design and requested research before further design work. The existing release authorization now depends on design sign-off for this redesign.

- [x] D1 Research interface hierarchy, typography, grouping, accessibility, adaptive layout and music-tool examples. Assess the existing circular screen and document findings in [Circular UI research](docs/design/CIRCULAR_UI_RESEARCH.md).
- [ ] D2 Show the current circular Practice screen beside one careful refinement, including idle/playing/recording states and folded/unfolded layouts. Review ring treatment, readable beat markers and labels, typography, spacing and control grouping with the user. Obtain design sign-off before implementation.
- [ ] D3 Show Recordings, Review, Projects and Settings in the agreed direction. Resolve user feedback and record approved choices in the style guide.
- [ ] D4 Implement approved screens, inspect real screenshots and exercise complete user workflows. Review the result with the user before merging/deploying.

The rejected static studies remain in `docs/design/interface-review.html` as historical artifacts; [the design README](docs/design/README.md) records their superseded status. Research found small canvas labels below 4.5:1 contrast and ordinary beat dots around 2.51:1 against the current background; these need targeted review and correction in the refinement. No application code changed during this research. No design decision is approved by elapsed time or a default question selection.

Acceptance: preserve the circular tempo/rhythm display; Start and Record visible without scrolling at 412×915; one shared local font with agreed type roles; readable canvas labels and meaningful beat markers; no instructional paragraphs on idle Home; primary destinations consistently labelled; playback sync adjustable without visiting Settings; no hidden automatic timing correction or changed source audio. Automated checks and visual design acceptance are separate requirements.

## Autonomous refinement and release — 2026-10-26

- [x] A1 Research actual music-app feedback and apply the existing hierarchy/accessibility research to a concrete implementation plan.
- [x] A2 Refine the circular dial, readable typography and rhythm states; expose precise tempo adjustment; simplify Practice grouping and folded/unfolded layout.
- [x] A3 Standardize navigation, settings, recording lists, project surfaces and Review controls. Exercise complete workflows and repair concrete usability failures.
- [x] A4 Run focused interaction/accessibility checks, inspect screenshots, simplify, retest; then pass full unit/browser/build/dependency gates.
- [x] A5 Update documentation, commit/push, merge through CI, deploy and verify live fresh/existing-data workflows. Verify offline/service-worker behavior against the production build; distinguish hosted-browser and physical-device limitations.

Completion is a verified usable release, not a claim of mathematical perfection. Physical Fold 7, microphone/Bluetooth latency and acoustic accuracy require real hardware and remain explicitly distinguished from automated evidence.

- A1–A3: implementation applies the research without removing the circle. A focused failing keypad regression led to draft-only entry with true cancellation. Capture now shows measured levels. Manual four-track inspection exposed crowded labels; the corrected geometry passes at 320 px.

- A4 final evidence: 127 unit/regression tests, 124 browser checks across both main viewports (including the recording-engine recovery follow-up), type-check/build, zero dependency vulnerabilities and diff checks pass. Screenshots include idle/playing/recording, unfolded Practice and four-ring geometry at 320 px.

- A5 delivery: [PR #21](https://github.com/Timothy-design77/poly-pro/pull/21) merged as `93bfb17`; [deployment](https://github.com/Timothy-design77/poly-pro/actions/runs/40403072678) passed after restarting a runner stalled during browser installation. Hosted checks preserve a take created on 2.4, including its audio and saved 1 ms offset; playback works. A fresh profile completes a synthetic 15-second silent take, analysis, sync/save and reload. All 35 referenced deployed resources return 200. Hosted worklet loading uses TLS-verified bytes in the harness; offline activation is verified locally. See the verification record for exact scope.
- Final feedback loop: hosted testing exposed a misleading microphone error for recording-engine download failures. The focused regression failed before the fix and now repeatedly verifies the correct message, released microphone tracks and a successful retry with measured audio. This follow-up retains the same release gates.
