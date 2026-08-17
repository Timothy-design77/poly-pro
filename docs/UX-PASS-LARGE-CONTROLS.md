# Large Primary Controls UX Pass

Status: implementation complete; automated verification pending.

## Accepted Home direction

- Preserve the existing light/high-contrast color system and rounded bubble styling.
- The BPM ring is the only primary-screen control that opens the keypad; remove the separate Set BPM pill.
- Primary vertical stack is: BPM ring → RECORD → START → TAP TEMPO.
- RECORD and TAP TEMPO are large full-width controls.
- START is the dominant full-width control with a true 4:1 width-to-height ratio.
- Move +/- tempo adjustment out of the primary surface and retain it under Advanced controls as Fine Tempo.
- Keep meter, pattern, practice modes, trainer, and polyrhythm below the primary surface in collapsed advanced sections.
- Keep the persistent/swipeable bottom navigation and current color palette from the prior UX pass.

## Implementation commits

- `328cfc5` — oversized 4:1 START/STOP control.
- `d360665` — large full-width TAP TEMPO with pointer-down timing.
- `61cffb1` — large full-width RECORD control.
- `e2ffe14` — Home reorganized into ring → RECORD → START → TAP TEMPO with advanced controls below.

## Verification gate

Before merge: TypeScript type-check, Vitest regression suite, and production build must all pass in GitHub Actions. Device feel-testing follows deployment.
