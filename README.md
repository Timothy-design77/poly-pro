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

The 2.4 upgrade simplifies Practice and Review, establishes a local DM Sans visual system, removes unrelated sound loading from metronome startup, and puts precise click sync directly beside playback. Navigation is Practice, Recordings, Projects and Settings. Recording countdown/automatic stop, undo/redo, cancellable exports and local data recovery remain available. One Review preview and one atomic save keep scores, charts, click playback and WAV exports synchronized. Audio and practice data remain local; no account or cloud service is required.

See [WORK_QUEUE.md](WORK_QUEUE.md) for the plan/test/simplify iteration record, [production readiness](docs/PRODUCTION_READINESS.md) for the audit outcome and physical-device acceptance checklist, and [verification results](docs/release/verification.txt) for the final automated checks. Physical Galaxy Z Fold 7 microphone, Bluetooth and long-session acceptance remains a release gate.

For a first practice session: set tempo on Practice and tap Start or Record. Recording setup contains With click/Silent, preparation delay and take length. Review opens after recording analysis. Use Sync beside the playback click toggle to move clicks earlier/later or align an intended reference click to a recorded hit; listen, then Save changes. Scoring, hit editing, loops, sound and export are secondary tools. Recordings shows all takes with an optional project filter. Settings contains calibration, instrument training and backups. Export a Full Backup regularly to keep a portable copy of recordings and settings.

## Source of truth

The current release status is in the readiness report above. The historical implementation and architecture plan are maintained in [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md). Historical repositories are retained for reference only and must not receive new product development.

See the [2.4 interface and sync audit](docs/INTERFACE_AND_SYNC_AUDIT.md) and [style guide](docs/STYLE_GUIDE.md). Earlier findings remain in the [2.3 practice flow audit](docs/PRACTICE_FLOW_AUDIT.md) and [2.2 Practice and Review audit](docs/PRACTICE_REVIEW_AUDIT.md).
