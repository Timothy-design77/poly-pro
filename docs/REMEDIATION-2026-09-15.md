# Poly Pro — Full-stack remediation (2026-09-15)

This pass addresses the end-to-end audit performed against production `main` after the frozen audio/analysis scope shipped.

## Corrected

- IndexedDB recovery no longer deletes user data automatically.
- Recording audio is persisted incrementally in durable chunks instead of retaining a full 30-minute Float32 session in React memory.
- Interrupted recordings with completed durable chunks are recoverable on the next launch.
- Real recording sample rate is preserved through playback and analysis.
- Microphone/worklet capture is prepared before an auto-started metronome begins.
- Recording startup/flush/save use explicit lifecycle phases and actionable failures.
- PWA updates download normally but cannot activate/reload during recording, analysis, calibration, backup/import, or destructive data operations.
- Timeline and Review load raw PCM correctly and use limiter-protected bounded gain.
- Click overlays and WAV-with-click export prefer the persisted beat grid instead of reconstructing beat zero at recording start.
- Manual hit corrections are re-scored and persisted coherently with session metrics.
- Full analysis runs in a Web Worker and supports hard cancellation.
- Detection-only controls are no longer presented as instant re-score controls.
- Noise-floor estimation no longer assumes the first 500 ms is silence and uses the same filtered/gained signal as onset detection.
- Project deletion preserves its sessions by moving them to Quick Start.
- Backup/import operations are bounded; data-only backup is available; Delete All clears every Poly Pro store without deleting the database schema.
- Unsupported browser-direct cloud separation is disabled until a secure server-side integration exists.
- Dialog, keypad, session-tab, focus, and progress semantics were hardened for keyboard/accessibility use.
- Build tooling was refreshed and the dependency audit is clean.
- CI now includes Chromium smoke tests for navigation/keypad, fake-microphone recording durability, and offline PWA reload.

## Verification policy

Automated verification does not replace the real-device acceptance ledger. Audio feel, physical microphone routing, Bluetooth behavior, subjective click quality, real Fold layout/ergonomics, and long-session thermal/performance behavior remain manual device checks until explicitly exercised on the target phone.
