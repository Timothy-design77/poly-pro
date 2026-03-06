# Poly Pro v2 — Consolidated Implementation Plan

**Single source of truth. No other document needs to be referenced.**

**Project:** Poly Pro (new codebase, successor to `polyrhythm-pro`)
**Repo:** `Timothy-design77/poly-pro`
**Original codebase:** `Timothy-design77/polyrhythm-pro` (single-file PWA, ~1620 lines — remains untouched)
**Approach:** Port proven logic from v1, rebuild weak areas, new architecture
**Git token:** Temporary; request fresh token at start of each session

---

## CURRENT STATUS

**Phase 0: COMPLETE** — deployed to GitHub Pages, PWA installable.
**Phase 1: COMPLETE** — metronome engine functional, sample-based sounds, BPM controls wired.
**Phase 2: COMPLETE** — advanced metronome features, trainer, practice modes, polyrhythm.
**Phase 3: COMPLETE** — projects, presets, sessions, IndexedDB persistence.

### What's Built (as of commit 085f00a)

**Scaffold & Config:**
- Vite + React + TypeScript + Tailwind + PWA (vite-plugin-pwa)
- GitHub Pages deployment via GitHub Actions
- DM Sans + JetBrains Mono loaded from Google Fonts
- Full dark color palette (soft white accent, NO purple/indigo)
- Safe area handling, overscroll prevention, touch optimization

**SwipeNavigation (src/components/ui/SwipeNavigation.tsx):**
- 3-page horizontal swipe with velocity detection + page indicator pills
- Settings swipe-up triggered ONLY from bottom handle (not full-page vertical swipe)
- Settings panel: full-screen overlay, swipe down anywhere to close (scroll-at-top detection)
- No jitter — handle stays in layout during drag, panel overlays on top
- Escape key dismisses settings

**HomePage (src/pages/HomePage.tsx):**
- Canvas-rendered dial: 80% container width, max 360px, pushed toward top
- Dial features: accuracy arc (outer green ring), beat dots (3 sizes: downbeat 5px > beat 3.5px > subdivision 2px), BPM number, "BPM" label, meter info — all canvas-drawn
- ± hold-to-accelerate buttons BELOW dial (not flanking) with breathing room (pt-6)
- START button: soft white bg, dark text, play icon
- RECORD + TAP TEMPO: side by side, neutral gray, RECORD has small red dot icon
- Compact 4-cell pattern row (beat accent visualization)
- Scrollable area below buttons with 300px dead space for future click visuals
- All placeholder — no audio engine wired yet

**ProjectsPage (src/pages/ProjectsPage.tsx):**
- Lean card: emoji | name + last practiced + goal | SVG sparkline with green trend line
- Active project: raised bg + 3px white left border accent
- Dashed "+ New Project" button
- Single default project (placeholder data)

**ProgressPage (src/pages/ProgressPage.tsx):**
- Project identity header (emoji + name + BPM goal)
- Hero chart placeholder with zero-data message
- Stats strip: consistency heatmap (4 weeks × 7 days grid) + 4 stat rows
- BPM progress bar
- Milestones section (zero-data state)
- Sessions list (zero-data state)

**ErrorBoundary (src/components/ui/ErrorBoundary.tsx):**
- Catches render errors, displays fallback

**Phase 1 — Audio Engine (src/audio/):**
- AudioEngine class: 25ms/100ms lookahead scheduler, Web Audio API
- 12 CC0 WAV samples generated (woodblock, clave, tick, sticks, kick, snare, rimshot, cowbell, hihat, shaker, bell, marimba)
- Sound catalog with category-based organization
- AudioBuffer loader with cache
- Per-beat gain modulation (OFF=0.0, GHOST=0.2, MED=0.55, LOUD=1.0)
- Compressor → OutputGain → Destination audio chain
- Haptic vibration on beat (downbeats/accents)

**Phase 1 — Zustand Stores (src/store/):**
- metronome-store: bpm, meter, tracks, playing, subdivision, volume, currentBeat
- settings-store: clickSound, accentSound, haptic, vibration, detection params (stubs)
- Full TypeScript interfaces for all store types

**Phase 1 — Components (src/components/metronome/):**
- Dial: canvas-rendered with beat dot animation, accuracy arc, BPM display, meter info
- BpmControl: hold-to-accelerate ± buttons (×1/×5/×10 phases)
- PlayButton: START/STOP with icon states
- TapTempo: 3-8 taps, 3s timeout, average interval, tap counter badge

**Phase 1 — UI Components (src/components/ui/):**
- NumberInput: BPM keypad modal with slide-up animation
- Button: base button with variant/size props

**Phase 1 — Settings (src/components/settings/):**
- SettingsOverlay with 6 collapsible sections
- SoundSettings: sound picker (4 categories), volume slider, preview button
- VibrationSettings: haptic toggle, intensity slider, test button

**Phase 1 — Hooks:**
- useMetronome: connects engine lifecycle to React
- useWakeLock: screen wake lock during playback

**Phase 1 — Utils:**
- timing.ts: getBeatGrouping, getMeasureDuration, getIOI, getDefaultAccents, clampBpm
- constants.ts: all named constants (scheduler, BPM, hold phases, audio chain)

**Phase 2 — Audio Engine Updates:**
- Trainer mode: auto-increment BPM after N bars, configurable start/end/step
- Count-in: click-only bars before full pattern, only track-0 plays
- Gap click: randomly mute individual beats (configurable probability, never downbeat)
- Random mute: randomly mute entire measures
- Multi-track polyrhythm: correct IOI per track (fits N beats into measure)
- Per-track swing (timing offset for even subdivisions)

**Phase 2 — Store Updates:**
- metronome-store: trainerEnabled/config, countInBars, gapClick, randomMute, swing
- Track management: addTrack, removeTrack, setTrackMuted, setTrackSwing, setTrackSound

**Phase 2 — Components:**
- MeterControl: time signature with left/right arrows and tap-to-toggle denominator
- SubdivisionPicker: horizontal pill selector (None/8ths/Triplets/16ths/Sextuplets)
- BeatGrid: full pattern editor with grayscale fill bars, beat + subdivision rows, multi-track
- TrainerConfig: tempo ramp settings with toggle, start/end BPM, step, bars per step
- PracticeModes: count-in, swing slider, gap click toggle+slider, random mute toggle+slider
- PolyrhythmControl: add/remove tracks, mute/unmute, beat count selector
- RecordButton: present in UI, wired in Phase 4
- Toggle: reusable toggle switch component

**Phase 3 — Database (src/store/db.ts):**
- IndexedDB schema with idb library: settings, presets, projects, sessions, recordings stores
- Full CRUD operations for all stores with typed records
- Session index on projectId and date

**Phase 3 — Stores:**
- project-store: CRUD, active project, auto-created default project, debounced IDB writes
- session-store: sessions CRUD, per-project filtering, sorted by date

**Phase 3 — ProjectsPage:**
- Real project cards from store (emoji, name, BPM range, sparkline)
- Tap to switch active project, long-press to edit
- Swipe left to reveal delete button (active project protected)
- ProjectCreateSheet: bottom sheet with emoji grid, name input, BPM range, live preview
- Edit mode pre-fills from existing project
- Delete confirmation modal

**Phase 3 — ProgressPage:**
- Active project identity header (emoji, name, BPM range)
- Bar chart of session accuracy (color-coded green/amber/red)
- Consistency heatmap (28 days, green intensity by session count)
- Stats: total time, session count, best accuracy, streak
- BPM progress bar (current / goal)
- Session list with date, BPM, hits, duration, accuracy badge
- Zero-data states for all sections

**Phase 3 — Components:**
- Modal: portal-based confirmation dialog
- HomePage header: reads active project from store

**Phase 3 — App Initialization:**
- IDB hydration on startup (projects + sessions loaded before render)
- Default project auto-created on first launch

### What's Next: Phase 4

Begin recording system. See Phase 4 section below. Key deliverables:
- Raw PCM capture at 48kHz from AudioWorklet (NOT MediaRecorder)
- Mic permission handling + device selection (avoid Bluetooth HFP)
- 30-second chunk-based storage to IndexedDB
- Live waveform display during recording
- Recording click mixing (optional click in recording at low volume)
- RecordButton wired up with start/stop recording

---

## TABLE OF CONTENTS

1. [Vision & Context](#1-vision--context)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Design System](#3-design-system)
4. [Port vs Rebuild Matrix](#4-port-vs-rebuild-matrix)
5. [Complete V1 Variable Map](#5-complete-v1-variable-map)
6. [V1 Data Structures](#6-v1-data-structures)
7. [Project Structure](#7-project-structure)
8. [Phase 0: Scaffold + PWA + Deploy](#8-phase-0-scaffold--pwa--deploy)
9. [Phase 1: Metronome Engine + Core UI](#9-phase-1-metronome-engine--core-ui)
10. [Phase 2: Advanced Metronome Features](#10-phase-2-advanced-metronome-features)
11. [Phase 3: Projects + Presets + Sessions](#11-phase-3-projects--presets--sessions)
12. [Phase 4: Recording System](#12-phase-4-recording-system)
13. [Phase 5: Onset Detection + Dual-Mode Analysis](#13-phase-5-onset-detection--dual-mode-analysis)
14. [Phase 6: Latency Calibration](#14-phase-6-latency-calibration)
15. [Phase 7: Analytics + Session Detail](#15-phase-7-analytics--session-detail)
16. [Phase 8: Instrument Profiling + Classification](#16-phase-8-instrument-profiling--classification)
17. [Phase 9: Per-Instrument + Groove + Dynamics](#17-phase-9-per-instrument--groove--dynamics)
18. [Phase 10: Export/Import + Polish + Hardening](#18-phase-10-exportimport--polish--hardening)
19. [Metric Shipping Decisions](#19-metric-shipping-decisions)
20. [Validation Prototype Plan](#20-validation-prototype-plan)
21. [V1 Data Migration](#21-v1-data-migration)
22. [Session Protocol](#22-session-protocol)
23. [Items That May Change](#23-items-that-may-change)

---

## 1. Vision & Context

### What is Poly Pro?

A mobile-first PWA metronome and drumming practice tool. It plays click sounds via Web Audio API (sample-based AudioBuffer playback), records the user's drumming via microphone, detects onsets (hit events), and provides detailed timing analytics. It also has a project system for structured practice with auto-BPM-advancement and progress tracking over weeks/months.

### What makes it different from other metronomes

- Deep timing analysis with research-backed metrics (not just "you were 85% accurate")
- A DAW-style timeline view where you can literally SEE each hit relative to the grid
- Tempo-scaled scoring (scoring windows adjust with BPM — harder at fast tempos, easier at slow)
- Consistency (σ) as the primary metric, not mean offset (because being consistently 10ms early is a style choice, not an error)
- Per-instrument breakdown (kick vs snare vs hi-hat timing, gated by confidence thresholds)
- Automated loopback calibration (phone plays chirps, measures its own latency in 6 seconds)
- Practice projects with BPM goals and progress tracking over weeks/months

### Who is the user?

A drummer who practices with acoustic drums or e-drums (no MIDI). Primary device is Samsung Galaxy Z Fold 7 running Chrome PWA. The user is a "vibe coder" — they direct AI agents to do all implementation. They care about stability, accuracy, and analytics quality.

### Why rebuild?

The v1 codebase is a single `index.html` file with ~1620 lines of minified-style JavaScript. One React component (`App`) contains 80+ state variables with 1-3 character names. No build system, no types, no tests. Adding features has become fragile. The user wants a clean, modular foundation that can grow.

### Key decisions (all locked)

| Decision | Choice |
|----------|--------|
| Repo name | `poly-pro` |
| Source repo | `polyrhythm-pro` (Timothy-design77) — remains untouched |
| Port strategy | Port proven audio/detection logic, rebuild state/UI/persistence |
| Routines | **DEFERRED to post-v2** |
| Sounds | Sample-based AudioBuffer playback (10-12 CC0 samples), NOT synthesis |
| Theme | Dark (musician-optimized), soft white accent |
| Navigation | 3-page horizontal swipe (Projects ← Home → Progress) + swipe-up settings |
| Build system | Vite + React + TypeScript |
| State management | Zustand |
| Persistence | IndexedDB (via `idb` library) |
| Styling | Tailwind CSS |
| Deploy | GitHub Pages via GitHub Actions |
| Font | DM Sans (UI text) + JetBrains Mono (all numbers) |
| Recording | Raw PCM capture at 48kHz from AudioWorklet (NOT MediaRecorder) |
| Analysis | Dual-mode: real-time energy threshold for feedback + spectral flux post-processing for scoring |
| Calibration | Automated loopback chirp test (5 chirps, cross-correlation, ~6 seconds) |

---

## 2. Architecture Decisions

### Stack

```
TypeScript + React 18 + Vite
Zustand (state management — 1KB, no boilerplate, works outside React)
IndexedDB via `idb` (replaces localStorage — no 5MB cap)
Tailwind CSS (utility-first styling)
vite-plugin-pwa (service worker + manifest generation)
Web Audio API + AudioWorklet (audio engine + analysis)
Canvas API (charts — custom, no library, no SVG charts)
```

### Why these choices

**Zustand over Context/Redux:** The audio engine runs on a timer outside React. Zustand allows the engine to read state directly (`useMetronomeStore.getState()`) without being inside a React component. This is critical — the scheduler must never depend on React's render cycle.

**IndexedDB over localStorage:** v1 stores sessions in localStorage (5MB cap). Sessions include up to 800 raw onsets each. IDB has no practical size limit and handles audio blob storage natively. The `idb` library provides a promise-based wrapper.

**Tailwind over CSS-in-JS:** No runtime cost, works with Vite out of the box, dark theme via utility classes. Eliminates the v1 problem of creating new style objects on every render.

**Custom Canvas over chart library:** v1 already has 6 custom chart types with zoom/pan/tooltips. Porting these is less work than adapting to a library, and gives full control over the visualization. All analytics charts use Canvas. No SVG charts.

### Audio Architecture (Critical)

The metronome timing model is the most important thing in the app. It MUST use the lookahead scheduler pattern:

```
┌──────────────────────────────────────────┐
│ AudioEngine (runs independently of React) │
│                                          │
│ schedule() runs every 25ms via setTimeout │
│ Looks ahead 100ms into the future        │
│ Schedules Web Audio notes at exact times  │
│ UI NEVER drives timing                    │
│ UI only REFLECTS current beat state       │
└──────────────────────────────────────────┘
```

This is how v1 works and it's correct. The `25ms` interval and `100ms` lookahead are proven values from v1. Do not change them.

### State Architecture

```
┌──────────────────────────────────────────────┐
│ Zustand Stores (source of truth)              │
├──────────────────────────────────────────────┤
│ metronomeStore: bpm, meter, sub, tracks,      │
│   playing, recording state                    │
│ projectStore: projects, presets, activeProject │
│ sessionStore: sessions, currentSession        │
│ settingsStore: detection params, vibration,    │
│   recording config, calibration               │
└──────────────────────────────────────────────┘
         │                        ▲
         │ getState()             │ setState()
         ▼                        │
┌──────────────────┐    ┌──────────────────┐
│ AudioEngine      │    │ React Components │
│ (reads config    │    │ (subscribe to    │
│  when scheduling │    │  stores, dispatch │
│  notes)          │    │  actions)        │
└──────────────────┘    └──────────────────┘
         │
         │ persists via
         ▼
┌──────────────────┐
│ IndexedDB        │
│ (debounced       │
│  writes, 500ms)  │
└──────────────────┘
```

**NOTE:** No `routineStore` — routines are deferred to post-v2.

---

## 3. Design System

### Color Palette

```css
--bg-primary:      #0C0C0E;   /* near-black, app background */
--bg-surface:      #141416;   /* cards, panels */
--bg-raised:       #1C1C1F;   /* elevated elements, hover states */
--bg-input:        #0A0A0C;   /* input fields */
--border-subtle:   #2A2A2E;   /* card borders, dividers */
--border-emphasis: #3A3A40;   /* active borders, focus rings */
--text-primary:    #E8E8EC;   /* headings, primary text */
--text-secondary:  #8B8B94;   /* body text, labels */
--text-muted:      #4A4A52;   /* disabled, hints */
--text-faint:      #2E2E34;   /* decorative text */
--accent:          rgba(255,255,255,0.85);  /* SOFT WHITE — primary accent */
--accent-hover:    rgba(255,255,255,0.95);  /* slightly brighter for hover */
--success:         #4ADE80;   /* green — good timing, pass */
--success-dim:     rgba(74, 222, 128, 0.15); /* green backgrounds */
--warning:         #FBBF24;   /* amber — marginal timing */
--warning-dim:     rgba(251, 191, 36, 0.15);
--danger:          #F87171;   /* red — off timing, errors */
--danger-dim:      rgba(248, 113, 113, 0.15);
--recording:       #EF4444;   /* red — recording indicator */
```

**⚠️ CRITICAL: No purple or indigo anywhere in the UI. The accent color is soft white, not `#6366F1`.**

### Typography

```
Display/UI: DM Sans (Google Fonts) with system fallback
Headings: DM Sans 700/800
Body: DM Sans 400/500
Numbers/Data: JetBrains Mono (for BPM display, timing values, percentages, all numeric data)
```

**⚠️ The font is DM Sans, NOT Inter.**

### Sizing & Spacing

```
Touch targets: minimum 44x44px (Apple HIG)
Border radius: 8px (small), 12px (medium), 16px (large), 9999px (pill)
Spacing scale: Tailwind default (4px base)
No max content width cap — app scales to full available width
Safe areas: respect env(safe-area-inset-*) for notch/gesture bar
```

### Responsive Design (Galaxy Z Fold 7)

```
Front display: ~374px wide (narrow mode)
Unfolded display: ~717px wide (wide mode)
isNarrow = width < 400

Dial: 70% of (width - padding), min 150px, max 300px
Padding: 16px narrow, 24px wide
Button heights: narrow -4px from wide
Border radius: narrow -2px from wide
Font sizes: narrow -1 to -2px from wide
Touch targets: ≥44x44px always
No horizontal overflow, no clipping
```

### Navigation Architecture

**3-page horizontal swipe + swipe-up settings:**

```
┌────────────┬────────────┬────────────┐
│  Projects  │    Home    │  Progress  │
│  (left)    │  (center)  │  (right)   │
└────────────┴────────────┴────────────┘
                  │
            swipe up from handle
                  │
           ┌──────┴──────┐
           │  Settings   │
           │  (overlay)  │
           └─────────────┘
```

- Page indicator dots at top are tappable (swipe OR tap to navigate)
- Dots show: "Projects" | "Home" | "Progress"
- Edge rubber-banding on first/last page
- Swipe animation: `cubic-bezier(0.32, 0.72, 0, 1)` for spring feel
- Settings triggered by bottom handle bar (tap or drag up), slides up as full-screen overlay
- "Done" button in top-right to dismiss settings

**⚠️ There is NO bottom tab bar. Navigation is horizontal swipe between 3 pages.**

### Design Patterns (Consistent Across App)

- **Collapsible sections** — used in Settings, Sound Picker, and any list-heavy UI
- **Bottom sheets** — used for New Project, Sound Picker
- **Full-screen overlays** — used for Settings, Session Detail
- **Color-coded accuracy** — green ≥85%, amber ≥70%, red <70% (everywhere)
- **Sparklines** — color based on trend direction, not absolute value
- **Active states** — lighter background + border accent, no text badges

### Accent/Volume State Naming

4 states: **OFF / GHOST / MED / LOUD** with gain values:
- OFF = 0.0
- GHOST = 0.2
- MED = 0.55
- LOUD = 1.0

**⚠️ Use v2 naming everywhere. The v1 naming (muted/normal/accent/strong) is legacy.**

### Approved Preview Files (Visual Reference)

| Screen | File |
|--------|------|
| Home screen (both displays) | `poly-pro-fold-preview.jsx` |
| All 3 pages + swipe nav | `poly-pro-complete-preview.jsx` |
| Projects page | `poly-pro-final-projects.jsx` |
| New project flow | `poly-pro-new-project.jsx` |
| Progress page | `poly-pro-progress-page.jsx` |
| Pattern grid (poly) | `poly-pro-polyrhythm-patterns.jsx` |
| Pattern interaction | `poly-pro-pattern-interaction.jsx` |
| Sound picker | `poly-pro-sound-picker.jsx` |
| Settings panel | `poly-pro-v2-refined.jsx` |
| Session detail (score+charts) | `poly-pro-session-detail.jsx` |
| DAW timeline analysis | `poly-pro-timeline-analysis.jsx` |
| Recording state + analyzing | `poly-pro-recording-state.jsx` |
| Calibration flow (3 steps) | `poly-pro-calibration.jsx` |

**Do NOT create alternative designs or explore new layouts without explicit user approval. Build exactly what these files show.**

---

## 4. Port vs Rebuild Matrix

### PORT — Proven V1 Logic (extract, type, rename, keep algorithm)

| Feature | V1 Source | V2 Destination | Notes |
|---------|-----------|---------------|-------|
| Audio scheduler | `sch()` (line 567) | `src/audio/engine.ts` | 25ms interval, 100ms lookahead. Core timing loop. |
| Beat advancement | `nxN()` (line 562) | `AudioEngine.advanceBeat()` | Computes next note time including swing |
| Sound triggering | `scN()` (line 563) | `AudioEngine.triggerSound()` | Calls AudioBuffer playback, handles accents, vibration |
| Noise buffer | `gNB()` (line 56) | `src/audio/sounds.ts` | Cached white noise AudioBuffer, shared across sounds |
| Sound ID resolver | `rSid()`, `SND_MAP` (lines 94–95) | `src/audio/sounds.ts` | Maps legacy IDs to current IDs |
| Meter calculations | `dGrp()`, `mDur()`, `gS()`, `dAcc()`, `gB()` (lines 105–109) | `src/utils/timing.ts` | Beat grouping, measure duration, accent defaults, group boundaries |
| Onset detection | `dO()` (lines 573–594) | `src/analysis/onset-detection.ts` | Energy threshold for real-time Mode 1 only |
| Re-analysis | `reanalyze()` (lines 277–309) | `src/analysis/reanalysis.ts` | Post-recording analysis with adjustable params |
| Spectral capture | `cSpec()`, `cSim()`, `aSpec()` (lines 111–113) | `src/analysis/classification.ts` | Feature extraction and cosine similarity for instrument profiles |
| BT mic avoidance | `stR()` mic selection (lines 654–668) | `src/utils/mic.ts` | Enumerate devices, prefer built-in over BT to avoid HFP switch |
| Chart drawing | `drawChart()` (lines 790–908) | `src/components/analytics/*.tsx` | 6 chart types: distribution, drift, per-beat, dynamics, tempo stability, fatigue |
| Chart interaction | `chTouchS/M/E`, `chTap` (lines 918–956) | `src/components/analytics/ChartCanvas.tsx` | Pinch zoom, pan, tap tooltips |
| Dial visualization | `dV()` (lines 597–618) | `src/components/metronome/Dial.tsx` | Circular beat visualization with orbiting dot |
| Waveform display | `dW()` (lines 621–642) | `src/components/metronome/WaveformDisplay.tsx` | Live waveform during recording with beat markers |
| Tap tempo | `tapTempo()` (lines 313–317) | `src/components/metronome/TapTempo.tsx` | 3-8 taps, 3s timeout, average interval |
| Track management | `mkT()`, `aT()`, `rT()`, `uT()`, `tA()` (lines 116, 768–771) | `src/store/metronome-store.ts` | Create/remove/update tracks, toggle accents |
| Preset save/load | `svP()`, `ldP()` (lines 772–774) | `src/store/project-store.ts` | Serialize/deserialize metronome config |
| Project CRUD | `mkPj()`, `updPj()`, `delPj()`, `openPj()` (lines 386–399) | `src/store/project-store.ts` | With auto-advance, progress history, detection overrides |
| IDB audio storage | `IDB` object (lines 213–217) | `src/store/db.ts` | Save/load/delete recording blobs |
| Export/import | `exportData()`, `importData()` (lines 368–376) | `src/utils/export.ts` | JSON export with validation on import |
| Factory reset | `factoryReset()` (lines 422–424) | `src/store/settings-store.ts` | Clear all stores |

**NOTE:** v1 sound synthesis (`SE` object, lines 57–93, 22 synth functions) is NOT ported. v2 uses sample-based AudioBuffer playback with 10-12 CC0 pre-recorded samples.

**NOTE:** v1 calibration (`startCal()`, `calCollect()`, lines 322–360, 50-hit user-playing method) is NOT ported as primary flow. v2 uses automated loopback chirp test. The user-playing method is kept as a fallback only.

### REBUILD — Weak Areas

| Area | V1 Problem | V2 Solution |
|------|-----------|-------------|
| Component structure | Single 1400-line App() | ~30 focused components, each < 200 lines |
| State management | 80+ useState in one component | 4 Zustand stores with typed interfaces |
| Variable naming | `sCS`, `sPSt`, `cf`, `mg`, `ol` | Descriptive: `setCurrentSession`, `configRef`, `masterGain`, `detectedOnsets` |
| Persistence | localStorage (5MB cap, sync writes) | IndexedDB with debounced writes (500ms) |
| Navigation | Swipe-based, no URLs, no back button | 3-page swipe, deep-linkable session detail |
| Error handling | No error boundaries, native confirm() | Error boundaries per page, custom Modal component |
| Recording | MediaRecorder compressed blobs | Raw PCM from AudioWorklet (float32, 48kHz) |
| Styling | Inline style objects, new on every render | Tailwind utility classes |
| Analysis | Main thread only, real-time | Dual-mode: real-time visual + offline post-processing |
| Sound engine | Synth functions (22 sounds) | Sample-based AudioBuffer (10-12 CC0 samples) |

---

## 5. Complete V1 Variable Map

This is essential for porting. Every v1 variable, its meaning, and its v2 equivalent.

### State Variables (useState)

| V1 Variable | V1 Setter | Meaning | V2 Name | V2 Store |
|-------------|-----------|---------|---------|----------|
| `pl` | `sPl` | Is playing | `playing` | metronomeStore |
| `bpm` | `sB` | Tempo (BPM) | `bpm` | metronomeStore |
| `tsN` | `sTN` | Time sig numerator | `meterNumerator` | metronomeStore |
| `tsD` | `sTD` | Time sig denominator | `meterDenominator` | metronomeStore |
| `tsG` | `sTG` | Beat grouping array | `beatGrouping` | metronomeStore |
| `sub` | `sSu` | Subdivision multiplier (1/2/3/4/6) | `subdivision` | metronomeStore |
| `vol` | `sV` | Master volume (0–1) | `volume` | metronomeStore |
| `trks` | `sTr` | Tracks array | `tracks` | metronomeStore |
| `aB` | `sAB` | Active beats (tid→beatIndex) | `activeBeats` | metronomeStore |
| `poO` | `sPO` | Polyrhythm mode on | `polyrhythmMode` | metronomeStore |
| `eT` | `sET` | Editing track index | `editingTrackIndex` | metronomeStore |
| `isR` | `sR` | Is recording | `isRecording` | metronomeStore |
| `sns` | `sSn` | Detection sensitivity (0–1) | `sensitivity` | settingsStore |
| `lO` | `sLO` | Latency offset (ms) | `latencyOffset` | settingsStore |
| `mE` | `sME` | Mic error message | `micError` | (local state) |
| `rU` | `sRU` | Recording blob URL | `recordingUrl` | (local state) |
| `prfs` | `sPf` | Instrument profiles array | `profiles` | settingsStore |
| `aPf` | `sAP` | Active profile | `activeProfile` | settingsStore |
| `cM` | `sCM` | Calibrating instrument | `isCapturing` | (local state) |
| `cN` | `sCN` | Capture name | `captureName` | (local state) |
| `cH` | `sCH` | Captured spectral hits | `capturedSpectra` | (local state) |
| `pS` | `sPS` | Preview sound ID | `previewSound` | (local state) |
| `tO` | `sTO` | Trainer mode on | `trainerEnabled` | metronomeStore |
| `tS` | `sTS` | Trainer start BPM | `trainerStartBpm` | metronomeStore |
| `tE` | `sTE` | Trainer end BPM | `trainerEndBpm` | metronomeStore |
| `tP` | `sTP` | Trainer BPM step | `trainerBpmStep` | metronomeStore |
| `tB2` | `sTB2` | Trainer bars between steps | `trainerBarsPerStep` | metronomeStore |
| `ciB` | `sCi` | Count-in bars | `countInBars` | metronomeStore |
| `sP` | `sSP` | Saved presets array | `presets` | projectStore |
| `pN` | `sPN` | Preset name input | `presetName` | (local state) |
| `ses` | `sSs` | Sessions array | `sessions` | sessionStore |
| `cS` | `sCS` | Current viewed session | `currentSession` | sessionStore |
| `ld` | `sLd` | Data loaded flag | `dataLoaded` | (init state) |
| `pB` | `sPB` | Playback active | `isPlayingBack` | (local state) |
| `scr` | `setScr` | Current screen (0/1/2) | Swipe page index | — |
| `shO` | `setSh` | Sheet open | `sheetOpen` | (local state) |
| `projs` | `sProjs` | Projects array | `projects` | projectStore |
| `actPj` | `sActPj` | Active project ID | `activeProjectId` | projectStore |
| `detPj` | `sDPj` | Detail project view | `detailProject` | (local state) |
| `crPj` | `sCrPj` | Create project form open | — | (local state) |
| `cpN` | `sCpN` | Create project name | — | (local state) |
| `cpC` | `sCpC` | Create project color idx | — | (local state) |
| `cpNo` | `sCpNo` | Create project notes | — | (local state) |
| `edPj` | `sEdPj` | Editing project ID | — | (local state) |
| `tTaps` | `sTTaps` | Tap tempo timestamps | `tapTimestamps` | (local state) |
| `obD` | `sObD` | Onboarding dismissed | `onboardingDismissed` | settingsStore |
| `rDl` | `sRDl` | Recording sync delay (ms) | `recordingSyncDelay` | settingsStore |
| `pbVol` | `sPbVol` | Playback volume | `playbackVolume` | settingsStore |
| `vbI` | `sVbI` | Vibration intensity (0–1) | `vibrationIntensity` | settingsStore |
| `vbD` | `sVbD` | Vibration delay offset (ms) | `vibrationDelay` | settingsStore |
| `rcV` | `sRcV` | Recording click volume | `recordingClickVolume` | settingsStore |
| `rmV` | `sRmV` | Recording mic volume | `recordingMicVolume` | settingsStore |
| `lBst` | `sLBst` | Live boost during recording (1–4x) | `liveBoost` | settingsStore |
| `fmW` | `sFmW` | Flam merge window (ms) | `flamMergeWindow` | settingsStore |
| `scW` | `sScW` | Scoring window ±ms | `scoringWindow` | settingsStore |
| `acT` | `sAcT` | Accent threshold multiplier | `accentThreshold` | settingsStore |
| `calSt` | `sCalSt` | Calibration state | `calibrationState` | (local state) |
| `calCnt` | `sCalCnt` | Calibration hit count | `calibrationHitCount` | (local state) |
| `chTab` | `sChTab` | Chart tab index (0–5) | `chartTab` | (local state) |
| `chTT` | `sChTT` | Chart tooltip | `chartTooltip` | (local state) |
| `flDr` | `sFlDr` | Filter drawer open | `filterDrawerOpen` | (local state) |
| `stSec` | `sStSec` | Settings sections open | `settingsSections` | (local state) |
| `prScW` | `sPrScW` | Post-rec scoring window | `postRecScoringWindow` | (local state) |
| `prAcT` | `sPrAcT` | Post-rec accent threshold | `postRecAccentThreshold` | (local state) |
| `prFmW` | `sPrFmW` | Post-rec flam merge | `postRecFlamMerge` | (local state) |
| `prSub` | `sPrSub` | Post-rec subdivision override | `postRecSubdivision` | (local state) |
| `prNF` | `sPrNF` | Post-rec noise floor | `postRecNoiseFloor` | (local state) |

**NOTE:** v1 routine-related state variables (`setlists`, `edSl`, `runSl`, `runSi`, `runSt`, `runSes`, `runRep`, `runRestT`, `expBlk`, `pSt`) are kept here as reference only. They are NOT implemented in v2.

### Refs (useRef)

| V1 Ref | Meaning | V2 Name |
|--------|---------|---------|
| `ac` | AudioContext | `audioCtxRef` |
| `mg` | Master gain node | `masterGainRef` |
| `co` | Compressor node | `compressorRef` |
| `oG` | Output gain node | `outputGainRef` |
| `rCG` | Recording click gain | `recordingClickGainRef` |
| `tm` | Scheduler timeout | `schedulerTimerRef` |
| `nn` | Next note times {trackId: time} | `nextNoteTimeRef` |
| `cb2` | Current beat index {trackId: index} | `currentBeatRef` |
| `vq` | Visual queue (pending beat events) | `visualQueueRef` |
| `af` | Animation frame ID | `animationFrameRef` |
| `tp` | Tap tempo timestamps | `tapTimesRef` |
| `cv` | Dial canvas ref | `dialCanvasRef` |
| `wc` | Waveform canvas ref | `waveformCanvasRef` |
| `cf` | Live config snapshot | `configRef` |
| `ms` | Measure start time | `measureStartRef` |
| `mc` | Measure count | `measureCountRef` |
| `wl` | Wake lock | `wakeLockRef` |
| `an` | Analyser node | `analyserRef` |
| `mi` | Mic stream | `micStreamRef` |
| `mS` | Mic source node | `micSourceRef` |
| `ol` | Onset list (detected hits) | `onsetsRef` |
| `sb` | Scheduled beats (for hit matching) | `scheduledBeatsRef` |
| `lt` | Last detection time (cooldown) | `lastDetectionTimeRef` |
| `tb` | Trainer current BPM | `trainerCurrentBpmRef` |
| `ci2` | Count-in active flag | `countInActiveRef` |
| `cr` | Count-in remaining bars | `countInRemainingRef` |
| `lt2` | Last trainer measure count | `lastTrainerMeasureRef` |
| `wd` | Waveform raw data (Uint8Array) | `waveformDataRef` |
| `pA` | Playback Audio element | `playbackAudioRef` |
| `mx` | MediaStream destination (mix node) | `mixDestinationRef` |
| `isRRef` | Recording flag (ref mirror) | `isRecordingRef` |
| `wBn` | Waveform buffer min (Uint8Array[2000]) | `waveformMinRef` |
| `wBx` | Waveform buffer max (Uint8Array[2000]) | `waveformMaxRef` |
| `wP` | Waveform write position | `waveformPosRef` |
| `cA` | Calibration analyser | `calAnalyserRef` |
| `cDN` | Click delay node for recording mix | `clickDelayNodeRef` |
| `chCv` | Chart canvas ref | `chartCanvasRef` |
| `chZm` | Chart zoom level | `chartZoomRef` |
| `chPanX` | Chart pan X offset | `chartPanRef` |
| `chPinch` | Pinch gesture state | `chartPinchRef` |

---

## 6. V1 Data Structures

### Track

```typescript
interface Track {
  id: string;
  beats: number;          // total beats (meter.num * subdivision)
  accents: number[];      // per-beat volume level: 0=OFF, 1=GHOST, 2=MED, 3=LOUD
  normalSound: string;    // sound ID for normal beats
  normalVolume: number;   // 0–2
  accentSound: string;    // sound ID for accented beats
  accentVolume: number;   // 0–2
  muted: boolean;
  swing: number;          // 0–1
}
```

### Session

```typescript
interface Session {
  id: string;              // base36 timestamp
  date: string;            // ISO string
  bpm: number;
  meter: string;           // "4/4" display string
  sub: number;             // subdivision
  nBeats: number;          // beats in track 0
  instrument: string | null;
  projectId: string | null;
  hasRecording: boolean;
  totalHits: number;       // scored hits
  allHits: number;         // all detected onsets
  avgDelta: number;        // mean timing error (ms, signed)
  avgAbsDelta: number;     // mean absolute error
  stdDev: number;          // standard deviation of deltas (σ — primary metric)
  perfectPct: number;      // % within scoring window
  goodPct: number;         // % within scoring window × 1.5
  onsets: Onset[];         // scored onsets (max 300)
  rawOnsets: RawOnset[];   // all onsets for re-analysis (max 800)
  detFmW: number;          // detection flam window used
  detScW: number;          // detection scoring window used
  detAcT: number;          // detection accent threshold used
  detSns: number;          // detection sensitivity used
}
```

### Onset

```typescript
interface Onset {
  time: number;           // AudioContext time
  delta: number;          // ms from nearest beat (signed: + = late)
  peak: number;           // amplitude 0–1
  scored: boolean;        // passed scoring window + accent threshold
  mpos: number;           // position within measure (0–1 fraction)
  instrument: string | null;
  spectral: number[] | null;
  similarity?: number;
}
```

### Project (Practice Plan)

```typescript
interface Project {
  id: string;
  name: string;
  icon: string;             // emoji
  created: string;          // ISO
  lastOpened: string;
  startBpm: number;
  goalBpm: number;
  currentBpm: number;
  accuracyTarget: number;   // % to pass
  // Detection overrides (null = inherit global)
  scoringWindow: number | null;
  accentThreshold: number | null;
  flamWindow: number | null;
  noiseFloor: number | null;
  subdivision: number | null;
  sensitivity: number | null;
  // Auto-advance
  autoAdvance: boolean;
  advanceAfterN: number;    // consecutive passes needed
  bpmStep: number;          // BPM increment on advance
  consecutiveCount: number; // current streak
  maxBpm: number | null;
  // References
  presetIds: string[];
  sessionIds: string[];
  progressHistory: ProgressEntry[];
  preset: PresetConfig | null;  // saved metronome config
}
```

**NOTE:** v1 Routine data structures are kept here as reference only for future implementation. They are NOT built in v2.

### V1 localStorage Keys

```
pp10           — settings (bpm, meter, vol, tracks, detection params)
pp10p          — presets array
pp10s          — sessions array (last 50)
pp10prof       — instrument profiles
pp2_projects   — projects array
pp2_actpj      — active project ID
pp2_setlists   — routines array (reference only, not migrated in v2)
pp2_onboard    — onboarding dismissed boolean
pp_v12_migrated — migration flag
```

### V1 IndexedDB

```
Database: pp2_recordings (version 1)
Store: recs
Keys: session ID strings
Values: audio Blobs
```

---

## 7. Project Structure

```
poly-pro/
├── .github/workflows/deploy.yml
├── public/
│   ├── icons/icon-192.png, icon-512.png
│   ├── sounds/              (P1: 10-12 CC0 WAV samples)
│   └── _redirects
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
│
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles/globals.css
    │
    ├── audio/
    │   ├── engine.ts
    │   ├── sounds.ts          (AudioBuffer loader + catalog)
    │   ├── types.ts
    │   └── worklets/
    │       ├── analyzer.worklet.ts    (P5: real-time onset detection)
    │       └── pcm-capture.worklet.ts (P4: raw PCM capture)
    │
    ├── analysis/
    │   ├── onset-detection.ts    (P5: spectral flux post-processing)
    │   ├── reanalysis.ts
    │   ├── grid.ts
    │   ├── scoring.ts
    │   ├── groove.ts            (P9)
    │   ├── dynamics.ts          (P9)
    │   ├── classification.ts    (P8)
    │   ├── calibration.ts       (P6: chirp generation + cross-correlation)
    │   └── types.ts
    │
    ├── store/
    │   ├── db.ts
    │   ├── metronome-store.ts
    │   ├── project-store.ts
    │   ├── session-store.ts
    │   ├── settings-store.ts
    │   └── types.ts
    │
    ├── pages/
    │   ├── HomePage.tsx
    │   ├── ProjectsPage.tsx
    │   ├── ProgressPage.tsx
    │   ├── SessionDetailPage.tsx   (P7: full-screen overlay)
    │   └── CalibrationPage.tsx     (P6)
    │
    ├── components/
    │   ├── ui/
    │   │   ├── Button.tsx
    │   │   ├── Card.tsx
    │   │   ├── Slider.tsx
    │   │   ├── Toggle.tsx
    │   │   ├── Modal.tsx
    │   │   ├── BottomSheet.tsx
    │   │   ├── NumberInput.tsx
    │   │   ├── ErrorBoundary.tsx
    │   │   └── SwipeNavigation.tsx
    │   │
    │   ├── metronome/
    │   │   ├── PlayButton.tsx
    │   │   ├── RecordButton.tsx
    │   │   ├── BpmControl.tsx
    │   │   ├── TapTempo.tsx
    │   │   ├── BeatGrid.tsx
    │   │   ├── MeterControl.tsx
    │   │   ├── SubdivisionPicker.tsx
    │   │   ├── WaveformDisplay.tsx
    │   │   ├── Dial.tsx
    │   │   └── TrainerConfig.tsx
    │   │
    │   ├── projects/
    │   │   ├── ProjectCard.tsx
    │   │   ├── ProjectCreateSheet.tsx
    │   │   └── ProjectList.tsx
    │   │
    │   ├── progress/
    │   │   ├── HeroChart.tsx
    │   │   ├── HeatmapCalendar.tsx
    │   │   ├── BpmProgressBar.tsx
    │   │   ├── MilestoneList.tsx
    │   │   ├── SessionList.tsx
    │   │   └── SessionCard.tsx
    │   │
    │   ├── session/
    │   │   ├── ScoreTab.tsx        (P7)
    │   │   ├── TimelineTab.tsx     (P7)
    │   │   ├── ChartsTab.tsx       (P7)
    │   │   ├── TuneTab.tsx         (P7)
    │   │   └── AnalyzingOverlay.tsx (P5)
    │   │
    │   ├── analytics/
    │   │   ├── ChartCanvas.tsx
    │   │   ├── DistributionChart.tsx
    │   │   ├── DriftChart.tsx
    │   │   ├── PerBeatChart.tsx
    │   │   ├── DynamicsChart.tsx
    │   │   ├── TempoStabilityChart.tsx
    │   │   ├── FatigueChart.tsx
    │   │   └── TimelineView.tsx      (P7: DAW-style waveform)
    │   │
    │   └── settings/
    │       ├── SettingsOverlay.tsx
    │       ├── SoundSettings.tsx
    │       ├── RecordingSettings.tsx
    │       ├── DetectionSettings.tsx
    │       ├── VibrationSettings.tsx
    │       ├── CalibrationSettings.tsx
    │       └── DataSettings.tsx
    │
    ├── hooks/
    │   ├── useMetronome.ts
    │   ├── useRecording.ts
    │   ├── useOnsetDetection.ts
    │   ├── useWakeLock.ts
    │   ├── useCalibration.ts
    │   └── useCanvas.ts
    │
    └── utils/
        ├── mic.ts
        ├── timing.ts
        ├── export.ts
        ├── migration.ts
        └── constants.ts
```

**NOTE:** No routine-related files. No `routine-store.ts`, no `RoutineRunner.tsx`, no `RoutineEditor.tsx`, no `useRoutineRunner.ts`. Routines are deferred to post-v2.

---

## 8. Phase 0: Scaffold + PWA + Deploy ✅ COMPLETE

### Goal
Working PWA shell deployed to GitHub Pages. Installs on Android. Loads offline.

### Status: DONE
All files below are created and deployed. See CURRENT STATUS section for details on what's built.
The pages are not placeholders — they contain the approved UX layouts with correct styling.

### Files to Create
1. `package.json` — dependencies + scripts
2. `vite.config.ts` — Vite + PWA plugin config
3. `tsconfig.json` — strict TypeScript
4. `tailwind.config.ts` — dark theme colors (soft white accent, NO indigo)
5. `postcss.config.js` — Tailwind + autoprefixer
6. `src/styles/globals.css` — Tailwind directives + CSS custom properties
7. `src/main.tsx` — React root + ErrorBoundary wrapper
8. `src/App.tsx` — 3-page swipe navigation + settings overlay
9. `src/pages/HomePage.tsx` — placeholder with "Home" text
10. `src/pages/ProjectsPage.tsx` — placeholder
11. `src/pages/ProgressPage.tsx` — placeholder
12. `src/components/ui/SwipeNavigation.tsx` — 3-page horizontal swipe with dots
13. `src/components/ui/ErrorBoundary.tsx` — catches render errors
14. `index.html` — Vite entry point (load DM Sans + JetBrains Mono from Google Fonts)
15. `.github/workflows/deploy.yml` — build + deploy to gh-pages
16. `public/icons/` — copy from v1
17. `public/_redirects` — SPA fallback

### Onboarding (implemented in P0-P1)
1. Splash: app icon + "Poly Pro" for 1 second (AudioContext initializes in background)
2. Mic permission: full-screen card with "Allow" and "Skip for now"
   - Skip = app works as metronome-only, record button disabled with tooltip
   - If denied, same as skip — can re-enable from Settings
3. Auto-created default project: "My First Project" 🥁, 80 → 120 BPM
4. Land on Home screen, metronome ready to play immediately
5. No tutorial, no walkthrough, no multi-step wizard
6. Calibration nudge: banner after first recorded session, not before

### Key Config Details

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/poly-pro/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Poly Pro',
        short_name: 'PolyPro',
        description: 'Pro-grade metronome with recording and analytics',
        theme_color: '#0C0C0E',
        background_color: '#0C0C0E',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wav}'] }
    })
  ]
});
```

### 🧪 USER TEST GATE — Phase 0: ✅ PASSED
- [x] Visit deployed URL on Galaxy Z Fold 7
- [x] Install as PWA (Add to Home Screen)
- [x] Open PWA — 3-page swipe with Home (center), Projects (left), Progress (right)
- [x] Swipe between pages — smooth animation with page dots
- [x] Settings swipe-up from bottom handle only (no conflict with page scroll)
- [x] Settings panel swipe-down to close
- [x] Home: canvas dial, ± buttons below, START/RECORD/TAP, pattern row, scrollable area
- [x] Projects: lean card with sparkline, active border, "+ New Project"
- [x] Progress: hero chart placeholder, heatmap, stats, zero-data states
- [ ] Kill app, airplane mode, reopen — should load offline (needs verification)
- [ ] Reload should not white-screen (needs verification)

---

## 9. Phase 1: Metronome Engine + Core UI

### Goal
Stable, accurate metronome with v2 tempo controls and sample-based sounds. The core value proposition works.

### Files to Create/Modify

**Audio Engine:**
- `src/audio/types.ts` — `MetronomeConfig`, `TrackConfig`, `SchedulerState`
- `src/audio/sounds.ts` — AudioBuffer loader + sound catalog (10-12 CC0 samples)
- `src/audio/engine.ts` — `AudioEngine` class (singleton) with `start()`, `stop()`, `getConfig()`

**Store:**
- `src/store/types.ts` — all TypeScript interfaces
- `src/store/metronome-store.ts` — bpm, meter, tracks, playing, subdivision, volume
- `src/store/settings-store.ts` — detection params, vibration, recording config (stub for now)

**Hooks:**
- `src/hooks/useMetronome.ts` — connects AudioEngine lifecycle to React (start on play, stop on unmount)
- `src/hooks/useWakeLock.ts` — acquire/release screen wake lock

**Utils:**
- `src/utils/timing.ts` — port `dGrp()`, `mDur()`, `gS()`, `dAcc()`, `gB()`
- `src/utils/constants.ts` — named constants (scheduler interval, lookahead, defaults)

**Components:**
- `src/components/metronome/PlayButton.tsx` — full width START button, soft white bg, dark text
- `src/components/metronome/BpmControl.tsx` — two large ± hold-to-accelerate buttons below dial
- `src/components/metronome/TapTempo.tsx` — tap button with BPM display
- `src/components/metronome/Dial.tsx` — port circular beat visualization (70% of width - padding)
- `src/components/ui/Button.tsx` — base button component
- `src/components/ui/NumberInput.tsx` — numeric keypad modal

**Page:**
- `src/pages/HomePage.tsx` — metronome layout: Dial (center), BPM ± buttons, START button, RECORD + TAP TEMPO buttons

### Click Engine Technical Details

**Sound generation:**
- Pre-recorded audio samples (WAV, 48kHz, mono, ~20-50ms each)
- Sourced from CC0/royalty-free percussion libraries (Freesound.org, Philharmonia, etc.)
- Loaded into AudioBuffers on app init via `fetch → decodeAudioData`
- 10-12 sounds for v2 launch:
  - Clicks: Woodblock, Clave, Metronome tick, Sticks
  - Drums: Kick, Snare, Rimshot
  - Percussion: Cowbell, Hi-hat closed, Shaker
  - Tonal: Bell, Marimba
- Total bundle size: ~200-500KB for all sounds
- Volume states use same sample at different gain: LOUD=1.0, MED=0.55, GHOST=0.2, OFF=0.0

**Scheduler:**
- `setTimeout(25ms)` on main thread as scheduling trigger
- Looks ahead 100ms into future
- Schedules beats using `AudioBufferSourceNode.start(exactBeatTime)`
- Web Audio clock (`context.currentTime`) is authoritative — JS timers only trigger the check
- Pattern: Chris Wilson "A Tale of Two Clocks"

**Per-beat gain modulation:**
```
For each beat in lookahead window:
  gain = volumeStateMap[pattern[beatIndex]]  // OFF=0, GHOST=0.2, MED=0.55, LOUD=1.0
  source = context.createBufferSource()
  source.buffer = currentClickBuffer
  gainNode = context.createGain()
  gainNode.gain.value = gain * masterVolume
  source.connect(gainNode).connect(masterGain).connect(destination)
  source.start(beatTime)
```

**BPM changes during playback:**
- Scheduler reads current BPM from Zustand store via `getState()` on each tick
- `nextBeatTime = lastBeatTime + (60 / currentBPM / subdivisionFactor)`
- No restart needed — seamless BPM changes

**Dial sync:**
- Scheduler fires callback: `{ beatIndex, beatTime, layerIndex }`
- UI uses `requestAnimationFrame` to interpolate dial position between beats
- Audio is always authoritative — visual follows audio, never drives it

### Audio Engine Architecture Detail

```typescript
class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  private nextNoteTime: Record<string, number> = {};
  private currentBeat: Record<string, number> = {};
  private measureStart: number = 0;
  private measureCount: number = 0;
  private scheduledBeats: ScheduledBeat[] = [];

  private readonly SCHEDULE_AHEAD = 0.1;  // seconds (100ms lookahead)
  private readonly SCHEDULE_INTERVAL = 25; // ms (timer frequency)

  // Sound buffers loaded on init
  private soundBuffers: Map<string, AudioBuffer> = new Map();

  initContext(): void {
    // Create AudioContext, compressor (threshold:0, knee:3, ratio:2, attack:0.002, release:0.05),
    // output gain (4.0), master gain (vol * 8.0)
    // Chain: sounds → masterGain → compressor → outputGain → destination
    // Load all sound samples via fetch + decodeAudioData
  }
}
```

### BPM Controls Spec

Two large ± hold-to-accelerate buttons in a row BELOW the dial:

```
Hold behavior:
- First 500ms: 1 BPM steps every 200ms
- After 500ms: 5 BPM steps every 100ms
- After 2000ms: 10 BPM steps every 80ms
- Release: stop

Speed indicator (×1, ×5, ×10) appears while holding.
Button gets accent glow while held.
All changes clamp to [20, 300] at 0.5 BPM precision.
Tap BPM number → numeric keypad modal for exact entry.
```

**⚠️ There are NO [-10] [-5] [-1] [+1] [+5] [+10] jump buttons. Only the 2 hold-to-accelerate buttons.**
**⚠️ Buttons are BELOW the dial, NOT flanking/beside it.**

### Home Screen Layout

```
┌──────────────────────────────────┐
│ 🥁 My First Project · 87% · 🔥3 │  ← header: emoji + name + accuracy + streak
├──────────────────────────────────┤
│                                  │
│           ◯ DIAL ◯               │  ← canvas dial (80% width, max 360px)
│            120.0                 │  ← BPM (tap for keypad)
│             BPM                  │
│           4/4 · 8ths             │
│                                  │
│     ┌──────────┐ ┌──────────┐   │
│     │    −     │ │    +     │   │  ← ± hold buttons BELOW dial (pt-6 gap)
│     └──────────┘ └──────────┘   │
│     ┌──────────────────────┐     │
│     │       START          │     │  ← full width, soft white bg
│     └──────────────────────┘     │
│     ┌──────────┐ ┌──────────┐   │
│     │  RECORD  │ │ TAP TEMPO│   │  ← side by side below START
│     └──────────┘ └──────────┘   │
│                                  │
│  ── scrollable area below ──    │
│  [Accent pattern grid]          │
│  [Quick settings tiles]         │
│  [300px dead space]             │
└──────────────────────────────────┘
```

**⚠️ ± buttons are BELOW the dial, NOT flanking it. This matches the approved preview and the built code.**

**Visual reference:** `poly-pro-fold-preview.jsx`

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Run at 120 BPM for 1 minute — listen for any drift or doubled clicks
- [ ] Run for 5 minutes — still stable
- [ ] Run for 15 minutes — still stable
- [ ] Change BPM while playing (hold + buttons) — no stutter or gap
- [ ] Hold acceleration feels right (starts slow, gets faster)
- [ ] Tap BPM display → keypad opens → enter exact value → works
- [ ] Lock screen while playing → unlock → still playing correctly
- [ ] Scroll page while near BPM controls — does NOT accidentally change BPM
- [ ] 0.5 BPM increments work (e.g., 120.0 → 120.5 → 121.0)
- [ ] Sound quality is clean, no clicks/pops

---

## 10. Phase 2: Advanced Metronome Features

### Goal
Full feature parity with v1's metronome, plus new training modes.

### Files to Create/Modify

**Components:**
- `src/components/metronome/MeterControl.tsx` — time signature (num/den with up/down, beat grouping for compound meters)
- `src/components/metronome/SubdivisionPicker.tsx` — None/8ths/Triplets/16ths/Sextuplets
- `src/components/metronome/BeatGrid.tsx` — accent pattern editor (tap to cycle: OFF → GHOST → MED → LOUD)
- `src/components/metronome/TrainerConfig.tsx` — tempo ramp (start/end BPM, step, bars per step)
- `src/components/metronome/RecordButton.tsx` — button present but wired up in P4
- `src/components/ui/Slider.tsx` — slider component
- `src/components/ui/Toggle.tsx` — on/off toggle switch

**Store updates:**
- `metronome-store.ts` — add: `trainerEnabled`, `trainerStartBpm`, `trainerEndBpm`, `trainerBpmStep`, `trainerBarsPerStep`, `countInBars`, `polyrhythmMode`

**Audio engine updates:**
- Handle trainer mode (BPM increment after N bars)
- Handle count-in (mute non-primary tracks, play clicks only, then start full pattern)
- Handle multiple tracks (polyrhythm A:B)
- Handle swing per track (timing offset for even beats)

**New features:**
- Gap click mode: randomly mute individual beats at configurable probability
- Random mute mode: randomly mute entire measures
- Per-layer volume control
- Per-layer delay offsets (ms) — for e-drum latency per pad

**Pattern Grid spec:**
- Stacked two-tier with timeline ruler at top
- Per-layer: label row → beat cells → subdivision cells
- Beat cells: height 30-34px, shows beat number
- Subdivision cells: height 8-10px, small indicators
- 4 volume states per cell: tap to cycle OFF → GHOST → MED → LOUD
- Visual: fill bar rises from bottom + number opacity changes (OFF=0.08, GHOST=0.2, MED=0.45, LOUD=0.85)
- Long-press any cell → bottom sheet sound picker
- Layered inheritance: layer default → beat override → cell override
- Override indicator: small dot in cell corner

**Sound Picker (bottom sheet):**
- Current sound + inheritance info at top
- Recents strip: horizontal scroll, 4-5 most-used sounds
- Categories (collapsible): Clicks, Drums, Percussion, Tonal
- 2-column grid inside each category
- 10-12 sample-based sounds

**Visual references:** `poly-pro-polyrhythm-patterns.jsx`, `poly-pro-pattern-interaction.jsx`, `poly-pro-sound-picker.jsx`

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Change time signature to 7/8 — grouping shows correctly
- [ ] Change to 5/4 — correct number of beats
- [ ] Add subdivision (16ths) — grid expands, accents on downbeats
- [ ] Set swing to 60% — even beats noticeably delayed
- [ ] Enable trainer: 80→140, +5 BPM every 4 bars — hear tempo gradually increase
- [ ] Enable count-in (2 bars) — hear click-only bars before full pattern
- [ ] Add second track (3 beats) → polyrhythm 4:3 — both tracks play
- [ ] Stack: 7/8 + triplets + swing + trainer — should remain stable
- [ ] Gap click at 30% — random beats muted
- [ ] Pattern grid: tap to cycle volume states, visual feedback correct
- [ ] Long-press cell → sound picker opens with correct inheritance display

---

## 11. Phase 3: Projects + Presets + Sessions

### Goal
Local persistence. Projects for practice contexts. Presets for fast setup. No routines.

**⚠️ Routines are DEFERRED to post-v2. This phase builds projects + presets + sessions ONLY.**

### Files to Create/Modify

**Database:**
- `src/store/db.ts` — IndexedDB schema with `idb` library

```typescript
const DB_NAME = 'polypro';
const DB_VERSION = 1;

// Object stores:
// 'settings'   — key-value config
// 'presets'     — preset configs
// 'projects'    — practice plans
// 'sessions'    — session records (metadata)
// 'recordings'  — audio blobs (keyed by session ID)
// 'hitEvents'   — onset data per session (separate from metadata for size)
```

**Stores:**
- `src/store/project-store.ts` — projects CRUD, presets CRUD, active project
- `src/store/session-store.ts` — sessions CRUD, current session for viewing

**Pages:**
- `src/pages/ProjectsPage.tsx` — project list + create form
- `src/pages/ProgressPage.tsx` — progress page with chart, heatmap, sessions

**Components:**
- `src/components/projects/ProjectCard.tsx` — lean card in list
- `src/components/projects/ProjectCreateSheet.tsx` — bottom sheet creation
- `src/components/projects/ProjectList.tsx` — list container
- `src/components/progress/HeroChart.tsx` — Accuracy/BPM trend (Canvas)
- `src/components/progress/HeatmapCalendar.tsx` — 4 weeks × 7 days
- `src/components/progress/BpmProgressBar.tsx` — current / goal
- `src/components/progress/MilestoneList.tsx` — auto-generated milestones
- `src/components/progress/SessionList.tsx` — session list
- `src/components/progress/SessionCard.tsx` — session in list
- `src/components/ui/Modal.tsx` — replaces native confirm/alert
- `src/components/ui/BottomSheet.tsx` — reusable bottom sheet

### Projects Page Spec

**Project Card:** Single row layout — emoji (20-24px) | name + last practiced + goal | sparkline (44-56px)
- Active state: lighter background + 3px left border accent (white)
- Gap between cards: 6-8px
- 5-6 projects visible without scrolling on front display

**New Project:** "+ New Project" button at bottom → bottom sheet with:
1. Emoji — large tappable button, expands to 16-icon grid
2. Name — text input, auto-focused
3. Starting BPM — numeric input, monospace
4. Goal BPM — numeric input, side-by-side with start, arrow between
- Live preview card shown as you type
- Create button disabled until valid (name not empty, goal > start)
- Default project auto-created on first launch: "My First Project" 🥁, 80 → 120 BPM

**Edit:** Long-press project card → same bottom sheet as creation, pre-filled. Save overwrites.

**Delete:** Swipe left on card → red "Delete" button → confirmation: "Delete [name]? All [X] sessions will be permanently removed." Active project can't be deleted — switch first.

**Visual references:** `poly-pro-final-projects.jsx`, `poly-pro-new-project.jsx`

### Progress Page Spec

1. **Project identity** — emoji + name + BPM goal
2. **Hero chart** — toggleable Accuracy/BPM trend (Canvas, area fill + line + end dot glow)
3. **Stats strip** — left: consistency heatmap (4 weeks × 7 days), right: stat rows (Total Time, Sessions, Best Tempo Range, Streak)
4. **BPM progress bar** — current / goal with fill bar
5. **Milestones** — auto-generated: "Hit 89% — new best!", "3-day streak!", "Reached 120 BPM"
6. **Sessions list** — date, BPM, hits, duration, accuracy badge; tap → session detail (P7)

**Session list:** Reverse chronological only. Swipe left → red Delete → confirmation.

**Zero-data states:**
- Projects page: default project + "+ New Project"
- Progress page: "Complete a recorded session to see your stats"
- Session list: empty with "No sessions yet"

**Visual reference:** `poly-pro-progress-page.jsx`

### Persistence Strategy
- Zustand stores subscribe to IDB writes with 500ms debounce
- On app load, hydrate stores from IDB
- Migration utility checks for v1 localStorage data

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Create a project with emoji, name, start BPM, goal BPM
- [ ] Project card shows correctly with all fields
- [ ] Long-press card → edit sheet opens pre-filled
- [ ] Swipe left → delete with confirmation
- [ ] Active project can't be deleted
- [ ] Save a preset from current metronome settings
- [ ] Load a preset — metronome updates correctly
- [ ] Close app, reopen — all data persists
- [ ] Progress page shows chart, heatmap (empty initially)
- [ ] Default project exists on first launch

---

## 12. Phase 4: Recording System

### Goal
Raw PCM mic recording with 48kHz fidelity. No memory growth. Reliable capture for the analysis pipeline.

**⚠️ CRITICAL: Recording captures raw PCM from AudioWorklet, NOT compressed audio from MediaRecorder. MediaRecorder produces Opus/WebM which destroys sample-level precision needed for spectral analysis.**

### Recording Architecture

```
Mic → MediaStreamSource → AudioWorklet (pcm-capture.worklet.ts)
  ├── Real-time onset detection (Mode 1: energy threshold, visual feedback)
  ├── Raw PCM capture (float32 → 30s chunks → IndexedDB)
  └── (optional) Parallel MediaRecorder for playable audio export
```

### getUserMedia constraints (CRITICAL)

```javascript
{
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    latency: 0
  }
}
```

⚠️ If `autoGainControl` cannot be reliably disabled on Galaxy Z Fold 7, ALL energy-based metrics are at risk. This must be validated in Phase A prototype.

### Files to Create/Modify
- `src/audio/worklets/pcm-capture.worklet.ts` — AudioWorklet that captures float32 samples
- `src/hooks/useRecording.ts` — full recording lifecycle
- `src/utils/mic.ts` — mic selection utility (port BT avoidance from v1)
- `src/components/metronome/RecordButton.tsx` — now fully wired
- `src/components/metronome/WaveformDisplay.tsx` — live waveform during recording
- Update `HomePage.tsx` — show recording state

### PCM Capture from AudioWorklet

⚠️ Ideally uses SharedArrayBuffer ring buffer, which requires CORS headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

If hosting doesn't support these headers: fall back to `MessagePort.postMessage()` (works but more GC pressure).

### Recording Flow

**Before recording:**
- START runs metronome only. RECORD is separate button.
- Can run metronome without recording. Cannot record without metronome running.

**Starting:**
- Tap RECORD while metronome running (or tap RECORD to auto-start metronome)
- RECORD button turns red with pulsing glow
- Red header bar: pulsing dot + elapsed time counting up
- AudioWorklet begins capturing raw PCM (float32 at 48kHz)
- Samples accumulated into 30-second Float32Array chunks, stored to IDB

**During recording:**
- All controls remain usable (BPM, accent pattern, subdivision)
- Changes logged in session metadata with timestamp
- RECORD button becomes STOP RECORDING
- Thin waveform bar below pattern grid showing live mic level
- Beat dots flash brighter on detected hits (real-time Mode 1)
- PCM chunks stream to IndexedDB every 30 seconds (no memory growth)

**Stopping:**
1. Tap STOP RECORDING → mic stream closes, final PCM chunk saved
2. "Analyzing..." overlay (spinner + progress stages for long sessions)
3. Auto-navigate to session detail Score tab

**Rules:**
- No pause/resume. One session = one continuous take.
- Maximum 30 minutes. Warning at 25:00: "Recording will auto-stop at 30:00."
- Failure mid-recording: save completed segments, show "Recording interrupted — [X] min saved."
- Always record at full 48kHz. Never compromise analysis quality.

**Visual reference:** `poly-pro-recording-state.jsx`

### Post-Analysis Audio Handling

After post-processing completes, the user's retention policy determines what happens:

**Options (set in Settings > Recording):**
1. **Compress to Opus** (default) — raw PCM → Opus/WebM (~2-3MB per 5 min). Keeps playback. Loses re-analysis.
2. **Keep raw PCM** — full 48kHz retained for N days (7/14/30/60/90). After retention expires, auto-compresses.
3. **Delete audio** — discard all audio immediately after analysis. Metrics saved. No playback.

**Per-session override:** After analysis, banner: "Audio: Compressed | [Keep Raw] [Delete]"

**What persists forever regardless of audio retention:** Session metadata, onset array, deviation array, all computed metrics, spectral features, classification labels, headlines, analysis parameters. (~50-300KB per session)

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Record 30 seconds — stop → analyzing overlay → session detail appears
- [ ] Record 5 minutes — no memory warning, no crash
- [ ] BT earbuds connected — click plays through BT, mic uses built-in (no HFP switch)
- [ ] Close app mid-recording → reopen → completed segments preserved
- [ ] Recording header bar shows elapsed time and hit count

---

## 13. Phase 5: Onset Detection + Dual-Mode Analysis

### Goal
Dual-mode onset detection: real-time for visual feedback, post-processing for all scoring.

**⚠️ This phase describes BOTH modes. Real-time is preview only. Post-processing is truth.**

### Mode 1: Real-Time (during recording)

**Purpose:** Live feedback only (beat dots light up, basic hit indication)
**Runs in:** AudioWorklet (`analyzer.worklet.ts`), must complete within 2.67ms per block
**Algorithm:** Simple energy threshold (port from v1 `dO()`)
**Precision:** ±2-3ms
**Output:** Approximate onset times for visual feedback only

### Mode 2: Post-Processing (after recording stops)

**Purpose:** ALL scoring, ALL metrics, ALL charts, ALL classification
**Runs in:** Main thread or dedicated Web Worker (no time constraint)
**Input:** Full PCM recording from IndexedDB
**Time budget:** Up to 5-10 seconds for a 5-minute session, 30-60 seconds for 30-minute
**Precision:** ±0.1-0.5ms (10-20× better than real-time)

### Post-Processing Pipeline (8 Stages)

```
Stage 1: Noise Floor Estimation
  → Analyze first 500ms of silence before playing
  → Compute room noise profile (spectral + energy)
  → Set adaptive noise gate threshold

Stage 2: Auto-Latency Detection
  → Cross-correlate known click waveform with recording
  → Detect click bleed in mic signal
  → Compute per-session latency offset automatically
  → Falls back to calibration value if click bleed not detected
  ⚠️ Only works if user plays click through speaker (not headphones)

Stage 3: Coarse Onset Detection (first pass)
  → Spectral flux detection with 256-sample window, 128-sample hop
  → Log-compressed, half-wave rectified spectral flux
  → Peak picking with adaptive threshold
  → Identifies approximate onset regions (~±3ms)
  → Produces candidate list

Stage 4: Fine Onset Detection (second pass)
  → Zoom into each candidate ±10ms region
  → Re-analyze with 32-sample window, 16-sample hop (0.33ms resolution)
  → Fit quadratic curve to energy peak
  → Interpolate onset to sub-sample precision
  → Final precision: ±0.1-0.5ms

Stage 5: Flam Analysis
  → Examine envelope shape in ±20ms window per onset
  → Detect double-peak signatures (characteristic flam shape)
  → Merge or separate based on envelope, not just time gap

Stage 6: Spectral Feature Extraction (per onset)
  → 1024-point FFT centered on each onset
  → Extract: spectral centroid, bandwidth, rolloff, zero-crossing rate
  → Extract: attack time, decay profile
  → Energy by band: sub-bass (<100Hz), low (100-500Hz),
    mid (500-2kHz), hi-mid (2-6kHz), high (6kHz+)
  → Features feed instrument classification (P8)

Stage 7: Grid Alignment & Scoring
  → Align onsets to expected beat grid
  → Apply latency offset (auto-detected or calibration)
  → Compute all metrics (σ, mean offset, hit rate, etc.)
  → Apply scoring formula

Stage 8: Instrument Classification (P8+, not in this phase)
  → KNN classifier on spectral features from Stage 6
  → Confidence score per onset
  → Per-instrument metric computation
```

### "Analyzing..." UX
After recording stops:
- Full-screen overlay: spinner + "Analyzing your session..."
- For sessions > 5 min, show stage labels: "Detecting onsets... Computing metrics..."
- Fades to reveal Score tab when complete

### Scoring Formula

```
Base score derived from consistency (σ):

  If σ <= 10ms:  score = 95 + (10 - σ) * 0.5     → 95-100%
  If σ <= 20ms:  score = 80 + (20 - σ) * 1.5      → 80-95%
  If σ <= 35ms:  score = 60 + (35 - σ) * 1.33     → 60-80%
  If σ <= 50ms:  score = 40 + (50 - σ) * 1.33     → 40-60%
  If σ > 50ms:   score = max(10, 40 - (σ - 50))   → 10-40%

Modifiers:
  - Hit rate penalty: score × (hitRate / 100)
  - NMA bonus: if |meanOffset| < 5ms after calibration, +2 points
  - Accent bonus: if accentAdherence > 80%, +3 points

Final: clamp(0, 100)
```

### Tempo-Scaled Scoring

Scoring window expressed as **percentage of inter-onset interval (IOI)**:
```
Default: ±5% of IOI
At 60 BPM:  IOI = 1000ms → window = ±50ms
At 120 BPM: IOI = 500ms  → window = ±25ms
At 200 BPM: IOI = 300ms  → window = ±15ms
```

Flam merge expressed as **percentage of subdivision IOI**:
```
Default: 45% of subdivision IOI
At 120 BPM, 8ths:  sub IOI = 250ms → flam merge = ~112ms
At 120 BPM, 16ths: sub IOI = 125ms → flam merge = ~56ms
At 200 BPM, 16ths: sub IOI = 75ms  → flam merge = ~34ms
```

### Slider Resolutions (Post-Processing Precision)

| Parameter | Step Size |
|-----------|-----------|
| Scoring window | 0.5% IOI |
| Flam merge | 0.5ms or 1% sub IOI |
| Latency offset | 0.5ms |
| Noise gate | 0.005 energy |
| High-pass cutoff | 5Hz |
| Accent threshold | 0.05× |

### Detection Presets

| Preset | Window | Flam | Gate | Notes |
|--------|--------|------|------|-------|
| Standard | 5% IOI | 45% sub | 0.05 | Default |
| Strict | 2% IOI | 25% sub | 0.10 | Advanced players, quiet rooms |
| Forgiving | 8% IOI | 60% sub | 0.03 | Beginners |
| Noisy Room | 6% IOI | 45% sub | 0.15 | High gate, 150Hz high-pass |

### Files
- `src/audio/worklets/analyzer.worklet.ts` — real-time energy threshold
- `src/analysis/onset-detection.ts` — spectral flux post-processing (Stages 3-5)
- `src/analysis/scoring.ts` — scoring formula + grid alignment (Stage 7)
- `src/analysis/grid.ts` — beat grid generator
- `src/analysis/types.ts` — onset/scoring type definitions
- `src/components/session/AnalyzingOverlay.tsx` — analyzing state UI
- Settings UI for noise controls (noise gate, high-pass, accent threshold)

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Play drums in quiet room — hits detected reliably (beat dots flash)
- [ ] Stop recording → analyzing overlay → score appears
- [ ] Sloppy playing vs tight playing → different scores
- [ ] Detection does not lag behind clicks (main thread not blocked)
- [ ] Noise controls in settings visually show their effect

---

## 14. Phase 6: Latency Calibration

### Goal
Automated loopback calibration. Zero user effort. 6 seconds total.

### Primary Method: Loopback Chirp Test

1. Start mic recording
2. Wait 500ms for noise floor estimation
3. Play 5 chirps (200Hz→4kHz frequency sweep, 5ms each) through phone speaker, 1 second apart
4. Cross-correlate known chirp waveform with mic recording for each chirp
5. Get 5 latency measurements
6. Trim outliers, compute median → system latency offset
7. Total time: ~6 seconds. Zero user effort.

### Why chirps (not clicks)
- Chirps have sharp autocorrelation peaks (resistant to room reflections)
- Better than impulse clicks which can be confused with ambient transients
- Frequency sweep covers the range relevant to drum onset detection

### Fallback: User-Playing Calibration
If loopback fails (speaker too quiet, very noisy room):
1. "Auto-calibration couldn't get a clear reading. Let's try manual."
2. User plays 20 hits along with click at 75 BPM
3. Median offset with outlier trimming (discard top/bottom 10%)
4. Median = latency estimate

### Calibration Flow UX

**Step 1: Setup** (1 screen)
- "Tap Calibrate. Your phone will play a short sound and measure system latency."
- "Place your phone where you normally practice."
- "Calibrate" button

**Step 2: Automated measurement** (~6 seconds)
- Progress: "Measuring... 3/5"
- No user action required

**Step 3: Results**
- "System latency: 28ms"
- "Consistency: ±2ms (excellent)" — std dev of the 5 measurements
- If consistency > 8ms: "Your environment may be noisy. Try a quieter room."
- "Accept & Save" / "Run Again"

### Calibration note for UI
"Place phone close to your drum for best accuracy." — Chirp loopback measures speaker→mic round-trip but NOT air travel from drum to phone (~1-2ms). This is acceptable and within detection noise floor.

### Manual override
Available in Settings > Calibration. Slider: -100 to +100ms, 0.5ms step.

### When to suggest recalibration
- After changing practice room
- After OS or browser updates
- If mean offset suddenly shifts: "Your offset has shifted 8ms from calibration. Recalibrate?"

**Visual reference:** `poly-pro-calibration.jsx`

### Files
- `src/analysis/calibration.ts` — chirp generation + cross-correlation
- `src/pages/CalibrationPage.tsx` — 3-step full-screen flow
- `src/hooks/useCalibration.ts` — calibration logic + fallback

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Run calibration → chirps play → offset result appears
- [ ] Run again — result is consistent (±3ms)
- [ ] Apply offset — timing analytics center closer to 0
- [ ] Manual override slider works
- [ ] Fallback method works if loopback fails

---

## 15. Phase 7: Analytics + Session Detail

### Goal
Full session review with 4-tab session detail, all charts, re-analysis (Tune tab).

### Session Detail Architecture

Full-screen overlay that slides in from right. ← back button to exit.
**4 TAP-ONLY tabs at top** (no horizontal swiping inside session detail — avoids gesture conflicts with main 3-page swipe and timeline horizontal scrolling).

```
Session Detail (full-screen overlay)
┌──────────────────────────────────┐
│ ← Back        Today 2:34 PM     │
│ [Score] [Timeline] [Charts] [Tune] │  ← TAP only, no swiping
│                                  │
│          (tab content)           │
│                                  │
└──────────────────────────────────┘
```

### Score Tab (default)

- **Score hero:** large percentage, color-coded (green ≥85, amber ≥70, red <70)
- **σ badge:** consistency in ms with level label (Professional/Advanced/Intermediate/etc.)
- **Session metadata:** BPM, meter, hits, duration
- **Auto-generated headlines:** 3-4 plain English insights (tappable → expand to relevant chart)
- **Stats grid:** mean offset, hit rate, fatigue ratio, drift, accent accuracy, swing ratio
- **Per-instrument rows** (P8+): kick/snare/hi-hat σ, offset, confidence
- **"How was this computed?"** expandable panel showing score breakdown

### Headline Generation Logic

After computing all metrics, first 3-4 checks that trigger become headlines:
```
IF σ is personal best for this tempo range → "Tightest session at X BPM"
IF σ is > 1.5× recent average → "Looser than usual"
IF fatigue_ratio > 1.4 → "Timing degraded X% after minute Y"
IF |mean_offset| > 15ms after calibration → "Systematic early/late bias"
IF accent_adherence > 85% → "Strong dynamic control"
IF max_drift > 30ms → "Tempo drifted Xms during bars Y-Z"
IF rush_drag detected → "Rushed during bars X-Y"
IF hit_rate < 90% → "Missed X beats — Y% hit rate"
IF session is first at this tempo → "First session at X BPM — baseline established"
```

### Timeline Tab

DAW-style waveform display (all Canvas-rendered):
- Grey audio waveform
- White metronome grid lines (varying weight: downbeat > beat > subdivision)
- Green-shaded scoring window zones around grid lines
- Color-coded onset markers: green=kick, white=snare, amber=hi-hat
- Triangle markers at top of each onset
- Deviation values visible at high zoom (±Xms per hit)
- Instrument lanes below waveform (per-instrument onset blocks, height=energy)
- Dashed deviation connectors (onset → grid, green=close, red=far)
- Playback bar with transport controls
- Zoom buttons (1×, 2×, 4×, 8×)
- Horizontal scroll (drag) within timeline — independent of page scroll
- Lanes toggle on/off

**Visual reference:** `poly-pro-timeline-analysis.jsx`

### Charts Tab

Expandable sections for each chart type (all Canvas, pinch-zoom, pan, tap for tooltip):
- **Distribution histogram** — timing spread shape (early/on-beat/late)
- **Fatigue curve** — σ over time with breakdown point marker
- **Per-beat chart** — σ and offset per beat position
- **Drift curve** — cumulative deviation over session
- **Push/pull profile** — systematic timing pattern per beat position

### Tune Tab

Tiered analysis controls. Live chart updating (debounced 150ms).

**Basic tier (3 sliders):**
- Scoring Window: slider + value showing both % and computed ms
- Flam Merge: slider + value showing both % and computed ms
- Noise Gate: slider + value
- Per-slider ↺ revert icon (only visible when value ≠ default)
- "Reset Basic" section revert button

**Advanced tier (tap "Advanced Controls" to expand):**

Three collapsible sub-groups:

| Group | Controls |
|-------|----------|
| Latency & Offset | Latency Offset (-100 to +100ms, 0.5ms step), Manual Bias Correction (-50 to +50ms, 0.5ms step) |
| Detection Sensitivity | Input Gain (0.5× to 3.0×, 0.1× step), Accent Threshold (1.0× to 3.0×, 0.05× step) |
| Frequency Filtering | High-Pass Cutoff (0 to 500Hz, 5Hz step), Band-Pass Center (off / 200-8000Hz, 50Hz step) |

Per-group revert buttons. Global "Reset All to Defaults" at bottom (requires confirmation).

**Save as Default / Save as Preset / Reset All**

**When raw audio expired:** "Raw audio expired — showing original analysis." Sliders disabled.

### Re-Analysis Speed

| Adjustment | Stages Re-Run | Speed |
|------------|---------------|-------|
| Scoring window only | Stage 7 | < 100ms (instant) |
| Flam merge | Stages 5-7 | < 500ms |
| Noise gate / filtering | Stages 3-7 | ~1-3 seconds |
| Full re-detection | Stages 1-7 | ~3-10 seconds |

### Decibel Display Convention
All energy/volume values displayed as RELATIVE dB (offset from session mean). Example: "+6 dB" for accented hits, "-12 dB" for ghost notes. Never display absolute dB SPL. Label clearly: "relative to session average."

**Visual references:** `poly-pro-session-detail.jsx`, `poly-pro-timeline-analysis.jsx`

### Files
- `src/pages/SessionDetailPage.tsx` — full-screen overlay with 4 tabs
- `src/components/session/ScoreTab.tsx`
- `src/components/session/TimelineTab.tsx`
- `src/components/session/ChartsTab.tsx`
- `src/components/session/TuneTab.tsx`
- `src/components/analytics/ChartCanvas.tsx` — shared canvas with pinch zoom + pan
- `src/components/analytics/DistributionChart.tsx`
- `src/components/analytics/DriftChart.tsx`
- `src/components/analytics/PerBeatChart.tsx`
- `src/components/analytics/FatigueChart.tsx`
- `src/components/analytics/TempoStabilityChart.tsx`
- `src/components/analytics/TimelineView.tsx` — DAW-style waveform
- `src/analysis/reanalysis.ts` — port `reanalyze()` function
- `src/analysis/grid.ts` — beat grid generator

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Record a session → session detail opens with score
- [ ] Score tab: headlines, stats grid, score hero all display
- [ ] "How was this computed?" expandable works
- [ ] Timeline tab: waveform + grid lines + onset markers visible
- [ ] Timeline: zoom buttons work, horizontal scroll works
- [ ] Charts tab: all chart types render, pinch-zoom works
- [ ] Tune tab: adjust scoring window → score updates live
- [ ] Tune tab: revert buttons work at all 3 levels
- [ ] Sloppy vs tight playing → visibly different results
- [ ] Tap a headline → jumps to relevant chart/detail

---

## 16. Phase 8: Instrument Profiling + Classification

### Goal
Local KNN instrument classification from user's own training data.

⚠️ **Depends on Phase F validation prototype.** If KNN accuracy < 70% on phone mic, per-instrument metrics won't ship. Fall back to frequency-band-only analysis (sub-200Hz=kick, 6kHz+=cymbal).

### How it works
1. Post-processing Stage 6 extracts spectral features per onset
2. Features: spectral centroid, bandwidth, rolloff, energy per band (5 bands), attack time, decay profile
3. KNN classifier (k=5, Euclidean distance) trained on user's own instrument profiles
4. Confidence score per onset (0.0 to 1.0)
5. Band-pass pseudo-separation enhances classification for simultaneous hits

### Confidence Tiers

| Confidence | Label Display | Visual Treatment |
|-----------|---------------|------------------|
| ≥ 0.75 | Full label (e.g., "Kick") | Normal opacity, full color |
| 0.40 – 0.74 | Label shown but dimmed | 50% opacity, tap to see breakdown |
| < 0.40 | "Unknown" | Neutral gray, no instrument icon |

### Training Flow
1. User opens instrument training UI
2. Selects instrument (Kick, Snare, Hi-Hat, Tom Hi, Tom Lo, Ride, Crash, etc.)
3. Plays 20+ hits of that instrument
4. App records onset features
5. KNN model updated
6. Confidence shown: "Your kick model: 85% accuracy on test set"
7. "Quick retrain" option: 5 hits per instrument to update

### Per-Instrument Metrics Display
Only instruments with ≥10 high-confidence hits (≥0.75) get their own stats row. Others grouped into "Other/Unknown."

Per instrument shown: icon + name + hit count, mean offset, σ, mini distribution bar.

### Files
- `src/analysis/classification.ts` — KNN classifier
- Training UI component within Settings or dedicated page
- Per-instrument rows in Score tab

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Train kick (20 hits), snare (20 hits), hi-hat (20 hits)
- [ ] Record mixed playing → hits labeled by category
- [ ] Ambiguous hits → labeled "Unknown" (not misclassified)
- [ ] Tap dimmed label → shows top 3 candidates with percentages
- [ ] Per-instrument timing in session detail makes sense

---

## 17. Phase 9: Per-Instrument + Groove + Dynamics

### Goal
Advanced analysis: swing ratio, push/pull profile, accent adherence, per-instrument breakdown.

⚠️ **Dynamic metrics depend on Phase D validation (AGC test).** If AGC can't be disabled: accent adherence, dynamic range, and velocity decay won't ship.

### Metrics added in this phase

**Groove (GREEN — ships):**
- Swing ratio (long/short ratio, target ~1.67 for jazz)
- Push/pull profile (systematic early/late per beat position)
- Groove consistency (measure-to-measure correlation, ≥16 measures required)

**Dynamic (YELLOW — depends on AGC test):**
- ⚠️ Accent adherence (% of accent beats played louder)
- ⚠️ Dynamic range (95th/5th percentile energy ratio)
- ⚠️ Velocity decay (energy slope over session — informational, not metric)

**Per-Instrument (YELLOW — depends on classification):**
- Per-instrument σ, mean offset, hit rate, fatigue
- Inter-limb correlation (Pearson r between simultaneous instrument deviations)
- Instrument balance (relative velocity)

**DEFERRED:**
- Microtiming signature → needs 10+ sessions
- Ghost note consistency → CUT from v2 (phone mic can't reliably detect)

### Files
- `src/analysis/groove.ts` — swing ratio, microtiming
- `src/analysis/dynamics.ts` — velocity consistency, accent adherence
- Additional chart types for per-instrument breakdown

### 🧪 USER TEST GATE — Ask user to test:
- [ ] Swing deviation metric: swung playing shows ratio ≠ 1.0
- [ ] Push/pull profile: intentionally rushing beats shows expected pattern
- [ ] Per-instrument timing chart (if classification available)
- [ ] Accent adherence (if AGC disabled): accented beats show higher score
- [ ] Metrics feel accurate to the user's perception of their playing

---

## 18. Phase 10: Export/Import + Polish + Hardening

### Goal
Data portability, stress testing, final UX polish, optional cloud enhancement.

### Export/Import

**Export:**
- Settings > Data > Export Backup
- Progress bar: "Packaging [X] sessions... (245 MB)"
- Creates `.polypro` file (zip: all session folders + projects + settings + profiles + calibration)
- Android share sheet or save to Downloads

**Import:**
- Settings > Data > Import Backup → file picker → select `.polypro`
- Preview: "This will add [X] sessions and [Y] projects. Existing data NOT overwritten."
- Duplicate detection by session ID — skipped with count
- Progress bar → done

**Auto-backup prompt:**
- Every 10 recorded sessions: dismissible banner on home screen
- "You have [X] sessions since last backup. Back up now?"
- "Remind me later" = +5 sessions. "Don't remind me" = permanent dismiss

### Storage Management
- Settings > Data shows: storage bar + total size + breakdown by project
- Tap project → sessions sorted by size → swipe to delete
- Per-session: "Delete audio only" (keeps analysis, saves space)
- `navigator.storage.persist()` on PWA install
- Storage quota monitoring via `navigator.storage.estimate()`
- Warning at 80% quota, critical at 90%

### Optional: Cloud Enhancement (MVSEP)
- User enables "Enhanced Analysis" toggle per session
- Upload to MVSEP DrumSep API
- Returns separated stems (kick, snare, toms, cymbals)
- Privacy: one-time consent dialog before first upload
- Free tier: 50 separations/day
- Cached locally — only runs once per session

### Polish Checklist
- Error handling for all edge cases
- Performance optimization (React.memo, virtualized lists for 50+ sessions)
- PWA update detection + apply
- All pages load correctly from deep link URL

### 🧪 USER TEST GATE — Final acceptance:
- [ ] Export full backup → wipe all data → import → everything restored
- [ ] 50+ sessions stored — UI remains responsive
- [ ] Long recordings (30+ min) — analysis works, storage managed
- [ ] Deny mic permission → friendly error, not crash
- [ ] Storage full → warning, not crash
- [ ] PWA update works (new version detected and applied)

---

## 19. Metric Shipping Decisions

### GREEN — Ships in v2 (high confidence)

| Metric | Priority | Notes |
|--------|----------|-------|
| Consistency σ | P1 | Primary metric. Battle-tested. |
| Mean offset | P1 | Gate display on calibration status |
| Hit rate | P1 | Ship it |
| Per-beat timing | P1 | Min 10 hits per position, 2-min min session |
| Timing distribution histogram | P1 | Trivial once deviations computed |
| Drift curve | P1 | Smooth with moving average for long sessions |
| Fatigue curve + ratio | P2 | Adaptive window sizing (min 20 onsets/window) |
| Swing ratio | P4 | Only with 8th note subdivision, flag >180 BPM |
| Push/pull profile | P4 | Same as per-beat timing, different visualization |
| σ trend (cross-session) | P6 | Sparkline on project cards |
| BPM ceiling | P6 | Highest controlled tempo bucket |
| Practice streak | P6 | Calendar count |
| Manual calibration | — | Reliable fallback |

### YELLOW — Ships if prototype succeeds (needs validation)

| Metric | Depends On | Decision Gate |
|--------|-----------|---------------|
| Accent adherence | Phase D: AGC test | If accent energy ratio > 1.3× with AGC off → ship |
| Dynamic range | Phase D: AGC test | Same as accent adherence |
| Velocity decay | Phase D: AGC test | If too noisy → downgrade to "informational" |
| Breakdown point | Threshold tuning | Start in advanced view, promote after validation |
| KNN instrument classification | Phase F | If isolated accuracy > 85% → ship with confidence thresholds |
| Inter-limb correlation | Classification | Only as good as classification |
| Auto-latency cross-correlation | Phase H | Nice to have, manual calibration is reliable fallback |
| Groove consistency | Sufficient data | Min 16 measures to display |

### RED — Cut or deferred

| Metric | Decision |
|--------|----------|
| Ghost note consistency | **CUT from v2.** Phone mic can't reliably detect ghost notes. |
| 4-state volume separation | **DOWNGRADED to 2-state** (accent/not) unless Phase D proves otherwise |
| Microtiming signature | **DEFERRED to P9+.** Needs 10+ sessions. |
| Cloud separation (MVSEP) | **DEFERRED to P10** as planned |

---

## 20. Validation Prototype Plan

Prototypes run BEFORE committing to final metric set. 13-19 days total.

### Phase A: Audio Pipeline Foundation (1-2 days) — BLOCKING

Build minimal recording app that:
1. Opens getUserMedia with AGC/noise suppression/echo cancellation OFF
2. Records 30 seconds of drum playing to PCM buffer
3. Displays raw waveform
4. Exports for offline analysis

**Validate:**
- Can we reliably disable AGC on Galaxy Z Fold 7?
- What is the actual frequency response? (confirm signal below 200Hz for kick)
- What does room noise look like?
- Does the mic clip on loud drum hits?

**⚠️ If AGC can't be disabled → redesign ALL dynamic metrics (Priority 3 at risk).**

### Phase B: Onset Detection Validation (2-3 days) — BLOCKING

Implement spectral flux onset detection in JavaScript (offline):
1. Load recorded PCM buffer
2. Compute STFT (1024-point FFT, 512-hop)
3. Spectral flux (half-wave rectified, log-compressed)
4. Peak picking with adaptive threshold

**Validate against ground truth (10 sessions at 80/120/160 BPM):**
- Target: F1 > 0.90 single instrument, F1 > 0.85 multi-instrument
- Target: detection σ < 3ms
- If F1 < 0.85 → adjust parameters
- If detection σ > 5ms → precision claims too aggressive, adjust spec

### Phase C: Timing Metrics (1-2 days)
Compute σ, mean offset, hit rate, per-beat from Phase B onset arrays. Low risk.

### Phase D: Energy/Dynamic Metrics (2-3 days) — HIGHEST RISK
Record patterns with deliberate accents and ghost notes.
- With AGC OFF, measure accent energy ratio (target > 1.3×)
- How many volume levels reliably separable? (target ≥2, hope for 3)
- Ghost note detection at close (6") and far (3') distance
- Velocity decay measurement over 5 minutes

**Decision gate:** If accent detection works → ship accent adherence + dynamic range. If only 2 levels → binary accent/not. If ghost notes undetectable → metric cut. If velocity decay too noisy → informational only.

### Phase E: Fatigue (1 day)
Low risk. Verify windowed σ produces plausible shapes.

### Phase F: Instrument Classification (3-5 days)
Record training data (20 hits each: kick, snare, hi-hat). Run KNN cross-validation.
- Target: isolated > 85%
- If 70-85% → increase confidence threshold, limit to 3 instruments
- If < 70% → fall back to frequency-band analysis only

### Phase G: Groove (2 days)
Record swing patterns. Verify ratio clearly differs from straight. Low risk.

### Phase H: Auto-Latency (1 day)
Test click bleed cross-correlation at various volumes. Nice to have.

---

## 21. V1 Data Migration

### Strategy
Run once on first launch of v2 if v1 data detected.

```typescript
// src/utils/migration.ts
export async function migrateFromV1(): Promise<boolean> {
  // 1. Check if already migrated
  // 2. Read all v1 localStorage keys
  // 3. Transform to v2 schema:
  //    - pp10 → settings store
  //    - pp10p → presets (add missing IDs, projectIds)
  //    - pp10s → sessions (add missing fields)
  //    - pp10prof → profiles
  //    - pp2_projects → projects (add plan fields if missing)
  //    - pp2_actpj → activeProjectId
  //    NOTE: pp2_setlists (routines) NOT migrated in v2
  // 4. Copy audio blobs from v1 IDB (pp2_recordings) to v2 IDB
  // 5. Write to v2 IDB stores
  // 6. Set migration flag
  // 7. Leave v1 data intact (user can roll back to v1)
  // Returns true if migration was performed
}
```

---

## 22. Session Protocol

### For Each New Session with an Agent

1. **Agent reads this document first** — it is the single source of truth
2. **Agent checks which phase is current** — look at the repo state to determine progress
3. **Agent requests fresh git token** if needed for push access
4. **Agent implements the current phase** following the spec above
5. **Agent commits working code** at the end of each phase
6. **Agent updates this document** with any decisions or changes made
7. **At each 🧪 USER TEST GATE** — agent tells the user what to test and waits for feedback before proceeding

### How to Start a New Session

User says something like:
> "Continue building poly-pro. Here's the git token: ghp_xxxxx. We're on Phase [N]."

Agent should:
1. Clone the repo
2. Read this plan document (in the repo root as `IMPLEMENTATION-PLAN.md`)
3. Check the current state of the code
4. Continue from the current phase
5. Push completed work

### Critical Rules for All Agents

- **NEVER change the audio scheduler timing model** (25ms interval, 100ms lookahead) without explicit user approval
- **ALWAYS port v1 logic by extracting it faithfully first**, THEN clean it up — don't rewrite from memory
- **ALWAYS type everything** — no `any` types except for truly dynamic data
- **Components should be < 200 lines** — if larger, decompose
- **Zustand stores should be readable** — actions are named functions, not inline lambdas
- **IndexedDB writes are debounced** — never write on every state change
- **The audio engine reads from Zustand via getState()** — never from React props or state
- **Dark theme only** — use the color palette from Section 3
- **Soft white accent, NO PURPLE anywhere** — rgba(255,255,255,0.85), never #6366F1
- **DM Sans for UI text, JetBrains Mono for all numbers** — never Inter
- **3-page horizontal swipe navigation** — never bottom tab bar
- **No 480px max content width** — scale to full available width
- **All touch targets ≥ 44x44px**
- **All charts are Canvas-based** — no SVG charts
- **No routine code in v2** — routines deferred to post-v2
- **Recording captures raw PCM** — never rely on MediaRecorder for analysis input
- **Scoring window scales with tempo** — expressed as % of IOI, not fixed ms
- **Consistency (σ) is the primary metric** — not mean offset, not accuracy %
- **Build exactly what the preview files show** — no alternative designs without user approval

---

## 23. Items That May Change

These decisions are locked but depend on prototype validation results. Mark clearly so the implementation agent validates before fully committing.

### ⚠️ Depends on AGC Test (Phase A prototype)
If Android's `autoGainControl` cannot be reliably disabled on the Z Fold 7:
- Accent adherence — may not work (energy comparison unreliable)
- Dynamic range — may not work
- Velocity decay — may not work
- Volume separation — currently 2-state (accent/not), could become 0-state
- All Priority 3 (Dynamic Control) metrics are at risk

### ⚠️ Depends on Onset Detection Validation (Phase B prototype)
If spectral flux F1 < 0.85 on phone mic recordings:
- Detection parameters need tuning
- Precision claims (±0.5ms) may need adjustment
- All timing metrics degrade proportionally

### ⚠️ Depends on Classification Validation (Phase F prototype)
If KNN classification accuracy < 70% on phone mic:
- Per-instrument metrics won't ship
- Inter-limb correlation won't ship
- Fall back to frequency-band-only analysis (sub-200Hz=kick, 6kHz+=cymbal)

### ⚠️ Depends on Analysis Timing (measured during implementation)
- 5-minute session: estimated 5-10 seconds (may be longer)
- 30-minute session: estimated 30-60 seconds (may need progress bar with stages)
- If too slow: consider Web Worker with WASM-compiled FFT, or downsample to 24kHz

### ⚠️ Depends on SharedArrayBuffer Support
- PCM capture from AudioWorklet ideally uses SharedArrayBuffer ring buffer
- Requires CORS headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`)
- If hosting doesn't support these headers: fall back to `MessagePort.postMessage()`

### May Evolve Post-v2
- Routine/setlist system (deferred, designed later)
- Cloud instrument separation via MVSEP (P10, optional)
- In-browser ONNX/WebGPU ML classification (when platform matures)
- Custom sample import by users
- Session comparison side-by-side
- Session notes/annotations

---

## Settings Spec (Reference — implemented across P1-P2)

6 collapsible sections within the swipe-up overlay:

### Section 1: Sounds
- Click Sound: picker (10-12 sample-based sounds), default Woodblock
- Accent Sound: picker (same list), default same as click
- Click Volume: slider 0-100%, default 80%
- Preview: button, plays current sound once

### Section 2: Recording
- Include Click in Recording: toggle, default on
- Click Volume in Recording: slider 0-50%, default 15%
- Mic Input Gain: slider 0.5×-3.0×, default 1.0×
- Live Waveform: toggle, default on
- Audio After Analysis: picker (Compress to Opus / Keep Raw PCM / Delete Audio), default Compress
- Raw PCM Retention: picker (7/14/30/60/90 days), default 30 days (only shown if Keep Raw)

### Section 3: Detection
- Scoring Window: slider 2%-10% IOI, default 5%
- Flam Merge: slider 20%-60% sub IOI, default 45%
- Noise Gate: slider 0.01-0.30, default 0.05
- Accent Threshold: slider 1.0×-3.0×, default 1.5×
- Detection Preset: picker (Standard/Strict/Forgiving/Noisy Room), default Standard
- Selecting a preset fills the sliders; modifying a slider switches to "Custom"

### Section 4: Vibration
- Haptic Feedback: toggle, default on
- Vibration Intensity: slider 0-100%, default 50%

### Section 5: Calibration
- Current Offset: display (read-only), "-23ms" or "Not calibrated"
- Run Calibration: button → launches calibration flow
- Manual Offset Override: slider -100 to +100ms, default 0ms
- Last Calibrated: display, date/time

### Section 6: Data
- Storage Used: display + bar ("245 MB / 2 GB")
- Export Backup: button → creates .polypro zip → share sheet
- Import Backup: button → file picker
- Clear All Sessions: button, confirmation required
- Clear All Data: button, double confirmation required

**Visual reference:** `poly-pro-v2-refined.jsx`

---

*End of Consolidated Implementation Plan. This document is the single source of truth. No other document needs to be referenced.*
