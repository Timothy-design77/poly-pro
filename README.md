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
npm ci
npm run dev
```

## Verification

```bash
npm run lint
npm run test:run
npm run build
```

Pull requests and production deployments are gated by automated type-checking, regression tests, and a production build.

## Source of truth

The consolidated implementation history and architecture plan are maintained in [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md). Historical repositories are retained for reference only and must not receive new product development.
