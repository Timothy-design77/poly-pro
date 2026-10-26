# Poly Pro 2.5: circular interface refinement

2026-10-26. Based on deployed 2.4 (`8de05e8`). The user delegated design, implementation and release decisions, superseding the previous request for design approval checkpoints. The circular metronome, light theme, local storage and account-free operation remain product requirements.

## Research used

The [circular UI research](design/CIRCULAR_UI_RESEARCH.md) remains the source for hierarchy, typography, touch targets, disclosure and adaptive layout. This iteration also searched music-app reviews and reread relevant passages through Tavily after Firecrawl reported exhausted credits.

- [Soundbrenner App Store reviews](https://apps.apple.com/us/app/the-metronome-by-soundbrenner/id1048954353?see-all=reviews): a retrieved drummer review valued customizable meter, subdivision and sounds, while reporting inconsistent clicks at higher tempos for some sounds. This is one anecdotal review excerpt, not representative user research or an independently verified defect. It reinforces keeping rhythm controls accessible and verifying timing under realistic settings.
- [NN/G visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/): grouping by proximity and restrained relative contrast informed the instrument/transport group and the quieter settings list.
- [NN/G progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): frequent actions remain visible; detailed setup and take comparison remain available on request.
- The previously inspected [Tempo Advance](https://www.frozenape.com/tempoadvance-metronome.html) concentric rhythms and [Soundbrenner](https://www.soundbrenner.com/pages/the-metronome-app) control grouping informed alternatives. The chosen implementation refines Poly Pro's circle instead of substituting an unrelated layout.

These sources informed product judgments; they do not prove that a particular font, palette or layout is universally best. No user research participants were recruited and no competitor was tested hands-on.

## Changes and reasons

| Finding | Result |
| --- | --- |
| The earlier layout studies removed the user's preferred circle | Preserve the central tempo and concentric rhythm rings. Refine strokes, readable markers, type placement and active-beat distinction. |
| Small canvas labels fell below normal-text contrast requirements | Render labels as DOM text using shared text tokens. The rhythm graphic uses SVG and updates from the existing scheduled beat state, without a continuous redraw loop. |
| Fine tempo was hidden behind an advanced section | Put decrease, Tap tempo and increase immediately below the dial. Preserve 0.5 BPM steps, accelerated hold, keyboard access and scroll cancellation. |
| Repeated boxed rows competed with the instrument | Group setup into a divided list, open controls onto a surface, use consistent headers and keep transport visually primary. Wider windows place setup beside the circle. |
| Four tracks with a long decimal tempo crowded the inner ring at 320 px | Scale central type to the innermost ring and remove the redundant bar label in dense configurations. Check text bounds against that ring. |
| Tempo keypad appended digits to the old value; live edits could survive Cancel and disrupt decimals | A draft replaces the previous value on first numeric entry, supports keyboard/decimal entry and commits only with Set. Cancel/Escape/backdrop dismissal preserve tempo. Shared dialog focus handling isolates background controls and restores focus. |
| A cancelled pointer could swallow the next keyboard transport action; right-click could start playback | Restrict pointer activation to the primary button and clear the suppression state after cancellation. Keyboard activation remains functional. |
| Recording displayed fabricated animated level bars despite having real peak data | Display the existing capture worklet's measured peak, with quiet/receiving/clipping states. No second microphone stream or monitoring route is introduced. |
| Recordings led with comparison controls and an irrelevant empty-state prerequisite | List takes first. Put comparisons with Practice progress. The empty library offers a direct route to Practice. |
| Inconsistent secondary screens | Share header sizing, spacing, disclosure styling and navigation treatment; move New Project into the header; simplify Review tabs and score grouping; enlarge shared switches and recording-play targets. |
| Updated dependency advisories blocked the release gate | Compatible lockfile updates to Vitest 4.1.12, fast-uri 3.1.9 and serialize-javascript 7.1.4 restore a clean audit. |

The recorded-audio sync model is unchanged: an explicit offset moves the reference click/grid against unchanged source audio. One draft/save continues to synchronize waveform, score, playback and export.

## Verification record

The keypad regression failed before the fix. It now verifies replacement entry, decimals, cancellation, keyboard entry, focus restoration and persistence. Additional browser regressions exercise folding during playback, usable transport bounds, cancelled pointers, the empty-library route, real captured input levels, and four-track label bounds at 320 px.

Focused workflow checks include preparation cancellation, a timed silent take, saved review, correction persistence, click alignment, native playback rate/loops and WAV export. Full gate results and final screenshots are recorded in [release verification](release/verification.txt).

The React review checked effect cleanup, modal focus, stable dial callbacks, subscriptions, immutable state and bounded rendering. No new runtime dependency or storage migration was added. The initial application bundle remains about 338 kB (104 kB gzip).

Physical Fold 7 operation, real percussion detection, acoustic latency, Bluetooth routing and thermal behavior still require device evidence. Browser viewport emulation and synthetic audio do not establish those results. See [physical acceptance](PRODUCTION_READINESS.md#device-acceptance-still-required).
