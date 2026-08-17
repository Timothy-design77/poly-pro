# Audio Pass — Real Default Woodblock

## Goal

Replace the current synthetic/fake-sounding default `woodblock.wav` with a real recorded woodblock click that is pleasant enough for long metronome practice sessions, while keeping the app local-first and offline-capable.

## Selected source

- Library: **Versilian Community Sample Library (VCSL)**
- Upstream repository: `sgossner/VCSL`
- License: **Creative Commons Zero (CC0 / public-domain-equivalent)**
- Upstream path: `Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav`
- Upstream Git blob SHA: `f625cb9b072b8a88ad588f8c125654f31e8c36cb`
- Upstream file size: 134,674 bytes
- Dynamic marking implied by filename: `mp` (mezzo-piano / medium-soft)

VCSL is specifically a general-purpose sample library of real instrument recordings intended to be suitable for software/media. The medium-soft woodblock hit was chosen instead of the loud/fortissimo variants because the default metronome click should remain distinct without becoming fatiguing during repetitive practice.

## Integration approach

The production app already loads `public/sounds/woodblock.wav` into an `AudioBuffer` and caches it. No audio-engine or sound-selection logic needs to change.

The replacement is imported **bit-for-bit from the upstream VCSL WAV** into the existing path. A one-shot branch-only GitHub Actions importer verifies the downloaded file with `git hash-object` against the known upstream blob SHA before committing it. The importer deletes itself in the same generated commit, leaving no runtime network dependency and no permanent import workflow.

## Import verification — PASS

- Branch `public/sounds/woodblock.wav` Git blob SHA is `f625cb9b072b8a88ad588f8c125654f31e8c36cb`, exactly matching the upstream VCSL file.
- Temporary `.github/workflows/import-vcsl-woodblock.yml` is absent after the generated import commit; importer self-cleanup succeeded.
- Compared with `main`, the only net runtime change is the bundled `public/sounds/woodblock.wav`; `src/audio/sounds.ts` and the audio engine are unchanged.

## Automated verification

Before merge:

- TypeScript type-check must pass.
- Vitest regression suite must pass.
- Production build must pass.
- Imported `public/sounds/woodblock.wav` Git blob SHA must remain upstream `f625cb9b072b8a88ad588f8c125654f31e8c36cb`.

## Manual verification

The cumulative device/user checks live in `docs/MANUAL-TEST-LEDGER.md`, section **D. Default Woodblock / Sound Quality**. Those checks remain TODO until actually exercised on the Fold 7.
