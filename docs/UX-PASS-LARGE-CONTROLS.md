# Large Primary Controls UX Pass

Status: primary-control layout deployed; full-width BPM ring follow-up in verification.

## Accepted Home direction

- Preserve the existing light/high-contrast color system and rounded bubble styling.
- The BPM ring is the only primary-screen control that opens the keypad; no separate Set BPM pill.
- Primary vertical stack is: BPM ring → RECORD → START → TAP TEMPO.
- RECORD and TAP TEMPO are large full-width controls.
- START is the dominant full-width control with a true 4:1 width-to-height ratio.
- Move +/- tempo adjustment out of the primary surface and retain it under Advanced controls as Fine Tempo.
- Keep meter, pattern, practice modes, trainer, and polyrhythm below the primary surface in collapsed advanced sections.
- Keep the persistent/swipeable bottom navigation and current color palette from the prior UX pass.
- The BPM ring should occupy nearly the full usable screen width so the primary action stack naturally sits lower on the phone.

## Implementation commits

- `328cfc5` — oversized 4:1 START/STOP control.
- `d360665` — large full-width TAP TEMPO with pointer-down timing.
- `61cffb1` — large full-width RECORD control.
- `e2ffe14` — Home reorganized into ring → RECORD → START → TAP TEMPO with advanced controls below.
- PR #6 merged the large-primary-controls pass to `main` as `0b70c9d` after type-check, Vitest, and production-build gates passed.
- `db51055` — ring moved to a full-bleed container, scaled to 96% of available width, with its maximum size raised from 340px to 520px.

## Current verification gate

The full-width ring follow-up must pass TypeScript type-check, the Vitest regression suite, and the production build before merge. Device feel-testing follows deployment.
