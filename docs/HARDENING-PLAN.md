# Poly Pro Hardening Plan

This document records the corrective implementation sequence derived from the full static, browser, PWA, accessibility, and architectural audit.

## Governing rules

- Preserve the working React, TypeScript, Zustand, Vite, Web Audio, AudioWorklet, IndexedDB, and PWA foundations.
- Fix observable correctness and data-safety defects before performance refactors.
- Keep production changes separate from audit-only tooling until validation passes.
- Every confirmed regression receives an automated test where the browser/runtime permits one.
- Never destroy local user data automatically as an error-recovery strategy.

## Delivery sequence

1. **Tempo correctness**
   - Prevent the BPM keypad from publishing stale local state when opened.
   - Preserve Tap Tempo and external tempo changes when the keypad is opened or cancelled.
   - Add a regression test.

2. **Recording lifecycle hardening**
   - Model preparation stages explicitly.
   - Add timeouts and cancellation around microphone acquisition, device enumeration, AudioContext resume, and AudioWorklet loading.
   - Guarantee cleanup of tracks, nodes, timers, and auto-started transport after every failure.
   - Produce actionable error codes and user-facing messages.

3. **Accessibility primitives**
   - Add accessible names to icon-only buttons, canvas controls, and switches.
   - Remove nested interactive elements from collapsible headers.
   - Raise muted-text contrast to WCAG AA.
   - Add browser accessibility checks.

4. **Data safety and persistence**
   - Remove automatic IndexedDB deletion on open failure.
   - Expose recoverable storage errors and require explicit user authorization before reset.
   - Separate repository access from UI workflows where practical.

5. **Analysis responsiveness**
   - Move post-session DSP into a Web Worker behind a typed client.
   - Keep a main-thread fallback for unsupported or failed worker startup.
   - Preserve existing typed analysis outputs and progress events.

6. **PWA and navigation simplification**
   - Centralize update activation and defer reload while recording, analysis, backup, or import is active.
   - Retain explicit navigation as the primary path and reduce gesture coupling.

7. **Toolchain and verification**
   - Upgrade vulnerable build/test dependencies with controlled compatibility checks.
   - Run type-checking, all unit tests, production build, PWA checks, browser functional tests, and accessibility checks.
   - Merge only after all automated checks pass.

## Release acceptance

The hardening effort is complete only when:

- The confirmed BPM regression is fixed and covered.
- Recording startup cannot hang indefinitely and always cleans up on failure.
- Critical and serious automated accessibility violations are resolved.
- Storage initialization never deletes user data automatically.
- Analysis remains responsive during long computations.
- Production dependencies have no known vulnerabilities and build tooling is upgraded to a supported secure line.
- Existing and new test suites pass on the production bundle.
