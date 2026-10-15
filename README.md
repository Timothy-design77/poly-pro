# Poly Pro

Poly Pro is the active production codebase for the mobile-first metronome PWA, including advanced rhythm controls, recording, timing analysis, instrument classification, projects, sessions, and local-first persistence.

> **Canonical repository:** This is the only active Poly Pro application repository. New development belongs here.

## Repository lineage

| Repository | Role | Status |
| --- | --- | --- |
| [`poly-pro`](https://github.com/Timothy-design77/poly-pro) | Current TypeScript/React production application | Active |
| [`polyrhythm-pro`](https://github.com/Timothy-design77/polyrhythm-pro) | Original single-file Poly Pro implementation | Archived legacy v1 |
| [`Metronome-app`](https://github.com/Timothy-design77/Metronome-app) | Intermediate React/PWA scaffold and metronome-engine prototype | Archived prototype |

The intended final repository names and maintenance rules are documented in [`docs/REPOSITORY-LINEAGE.md`](docs/REPOSITORY-LINEAGE.md).

## Technology

- React 18 and TypeScript
- Vite and `vite-plugin-pwa`
- Zustand state management
- IndexedDB via `idb`
- Web Audio API and AudioWorklet processing
- Vitest regression tests
- GitHub Pages deployment

## Local development

```bash
# Node.js 22.12+ (CI uses Node.js 24)
npm ci
npm run dev
```

## Verification

```bash
npm run typecheck
npm run test:run
npm run build
npm audit --audit-level=moderate
npx playwright install chromium
npm run test:e2e
```

The development app is served at `/poly-pro/`. Browser tests start a local production preview automatically. Pull requests and deployments are gated by type-checking, regression tests, a production build, the dependency audit and browser workflows at narrow and wide viewports. Deployments publish the artifact from that verified build.

## Current release

The 2.2 upgrade adds silent recording with a captured timing grid and one Review workspace for playback, hit editing and timing adjustments. One preview and one atomic save keep scores, charts, click playback and WAV exports synchronized. It also improves keyboard access, narrow/fold layouts, recovery and accessibility. Audio and practice data remain local; no account or cloud service is required.

See [WORK_QUEUE.md](WORK_QUEUE.md) for the plan/test/simplify iteration record, [production readiness](docs/PRODUCTION_READINESS.md) for the audit outcome and physical-device acceptance checklist, and [verification results](docs/release/verification.txt) for the final automated checks. Physical Galaxy Z Fold 7 microphone, Bluetooth and long-session acceptance remains a release gate.

For a first practice session: set tempo on Home, record a take, then choose Review take. Playback includes hit correction and WAV export. Tune applies scoring changes to that take; full re-detection asks before replacing corrections. Settings contains calibration, instrument training and backups. Export a Full Backup regularly to keep a portable copy of recordings and settings.

## Source of truth

The current release status is in the readiness report above. The historical implementation and architecture plan are maintained in [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md). Historical repositories are retained for reference only and must not receive new product development.

The latest user-flow audit and regression evidence are in [Practice and Review audit](docs/PRACTICE_REVIEW_AUDIT.md).
