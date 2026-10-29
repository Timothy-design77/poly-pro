# Practice and Review audit — Poly Pro 2.2

2026-10-15 · baseline `e7676a2` · local-first Android Chrome / Galaxy Z Fold 7 target.

## User workflow and outcome

Select **With click** or **Silent** beside Record, record a take, and stop. Analysis opens **Review** directly. Playback is immediately visible. Edit hits or adjust Timing while the score, waveform markers and click alignment preview together. **Save changes** commits the corrected events, scoring configuration and score in one transaction. **Charts** uses that same preview. Closing an unsaved take offers Save and close, Discard and close, or Keep reviewing.

Silent capture suppresses audible and haptic clicks even when the metronome was already running, without changing the saved volume. The timing transport continues, so the take has an actual captured grid. Normal metronome sound returns afterward. Recording still starts with the Record control; this release interprets “without clicking” as without the audible metronome.

## Findings and fixes

| Finding | Result and verification |
| --- | --- |
| Auto-start setting did not silence a running metronome | Explicit Home sound choice; output suppression while retaining beat scheduling. Browser verifies no new sound sources during silent capture, stored timing and restored sound. |
| Separate post-analysis summary, four tabs and duplicate tuning controls | Direct Review workspace, Review/Charts views, one draft and one save. Playback stays available while editing. |
| Editing hits left waveform markers unchanged until save | Immediate re-score updates markers, summary and charts; drafts survive switching views. |
| Waveform generated a different grid from playback | Canvas, click track, preview and export use the captured grid and one latency offset. A 125 ms recorded phase plus 600 ms offset produces a 725 ms click in both playback and WAV export. |
| Saving a larger flam window discarded source hits | Preserve editable source hits so narrowing the window can separate them again. Unit regression verifies both directions. |
| Slider arrow keys also sought the audio | Keyboard transport ignores sliders and other controls. Regression failed before and passes after. |
| Playback could overlap a running metronome and was missing critical-activity tracking | Playback stops the metronome, participates in update/operation protection, and pauses when leaving Review or opening confirmations. |
| Synchronous failure of the second analysis write committed only the new score | Explicit transaction abort; the baseline rollback test failed with a changed score and now passes. Real-browser failure injection keeps the draft and original saved data available for retry. |
| Metronome button ignored keyboard activation | Enter/Space activate the same transport as touch. |
| Nested buttons and controls, weak labels and contrast | Separate help and action buttons; native take-card review buttons; labeled volume/calibration controls; background focus isolation and nested-modal cleanup. Automated accessibility checks cover the resulting screens. |
| Narrow overflow and unreliable waveform measurement | Shrinking range controls/fieldsets, measurement after audio preparation and resize, mouse seeking, bounded canvas width at high zoom. Checks include 320px and 3× pixel density. |

No account, backend, cloud processing, database version change or destructive data migration was introduced. Existing recordings retain their saved analysis settings. Global scoring defaults are separate from per-take latency adjustments.

## Evidence

- 95 unit/regression tests in 16 files, type-check and production build.
- 58 browser checks: 29 workflows on 412×915 touch/mobile and 884×1104 Chromium viewports.
- Automated WCAG 2 A/AA and 2.1 AA checks on Home, Projects, Progress, Settings, Review, editing, timing and Charts. These are automated checks, not a claim of complete accessibility certification.
- Backup/restore, offline service worker reload, project progression, instrument training, custom sounds, permission denial, microphone disconnection, storage failure and analysis recovery remain in the complete browser suite.
- Dependency audit: zero reported vulnerabilities.
- Screenshots and command results: [release evidence](release/verification.txt).

The working loop found additional defects after the first passing focused checks: narrow overflow, nested-modal focus restoration, a storage rollback failure and contrast issues visible only in the wider layout. Each was corrected and checked again. No tests were disabled to obtain a pass.

## Remaining physical acceptance

The [device checklist](PRODUCTION_READINESS.md#device-acceptance-still-required) remains open. Actual Fold 7 microphone routing, acoustic detection, Bluetooth latency, thermal behavior, long recordings and interruption recovery require that hardware. Simulated microphone and viewport tests do not establish those results.
