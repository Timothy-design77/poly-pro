# Practice flow audit — Poly Pro 2.3

Audit date: 2026-10-18. Baseline: `8d36c1a` (2.2). Primary target: Android Chrome on Galaxy Z Fold 7, local-first and account-free.

## Changes driven by real practice flows

| Finding | Result |
| --- | --- |
| The player must reach for the phone at both ends of a take | Optional preparation countdown and timed takes; microphone preparation/countdown can be cancelled; audio worklet stops at the exact sample limit |
| Navigation can hide a running recording and its Stop control | Capture stays visible until saving completes; leaving during preparation cancels it |
| One mistaken correction requires discarding all edits | Bounded undo/redo across hit and timing edits, including grouped slider drags; saving establishes a new durable base |
| Discard after a save can restore a stale loaded snapshot | Discard restores the confirmed saved version; same-revision metadata updates preserve the draft |
| Stop and silent capture leave scheduled haptics or pending starts alive | Cancel pending starts, queued sounds and haptics; release late screen-lock grants; skip missed click playback after scheduler stalls |
| Long WAV export renders an entire second float recording and cannot be cancelled | Raw export reads PCM directly; mixed export renders at most ten seconds at once, with progress/cancel and no late downloads after close |
| A folded display can leave the zoomed waveform outside its scrollable range | Preserve relative waveform position and clamp bounds on resize; cancel interrupted touch gestures |
| Cancelled slider touches change values; mobile help closes as soon as focus scrolls | Separate cancellation from tap, retain exact-entry keyboard focus, and keep help positioned during scroll |
| Expanded vibration controls lack accessible names | Labelled toggle and strength control, plus checks of expanded settings and dialogs |
| Advanced tempo/pattern controls ignore keyboard activation or retain held timers | Labelled controls, keyboard volume/sound selection, larger subdivision targets, and cleanup on close/navigation |
| Successful analysis can be reported as failed by optional follow-up writes | Preserve durable success and a persistent notice when project advancement cannot be confirmed |
| Groove consistency groups every measure into measure zero | Preserve matched measure identity and verify repeated, incomplete and irregular timing patterns |
| Progress and backup reminders can be stale or misleading | Keep yesterday's active streak, refresh backup reminders after backup/analysis, remove unsupported first-session claims |

Trainer takes now save their actual starting tempo and setup is locked during capture. Scoring and flam tolerances remain fixed milliseconds derived from that starting tempo; the captured beat grid follows tempo changes. Timing and Charts now explain this convention rather than implying that the tolerance changes at every beat.

## Verification approach

Reproduce each defect where practical, implement the smallest complete behavior, simplify shared state, then rerun focused workflows. Independent source review supplements browser checks. The production build is tested with isolated synthetic recordings and failure injection; no existing user recordings are modified.

Evidence and final counts are in [release/verification.txt](release/verification.txt). The work queue is in [../WORK_QUEUE.md](../WORK_QUEUE.md).

## Limits

Automated Chromium viewports and synthetic signals do not establish acoustic detection accuracy, Bluetooth routing, real Android vibration or sustained thermal behavior. The physical acceptance checklist in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) remains open. Analysis and playback still require the recording in memory; export adds bounded float processing and a duration-proportional output blob.
