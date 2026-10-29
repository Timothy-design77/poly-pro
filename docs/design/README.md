# Poly Pro design research and review

**2026-10-26 update:** The user delegated design decisions and authorized completing the product without further review checkpoints. The [2.5 refinement audit](../CIRCULAR_REFINEMENT_AUDIT.md) records the implemented result and verification. The approval language below is historical, superseded by that instruction.

User direction, 2026-10-21: **keep and refine the current circular metronome**. Use restrained color, strong typography and spacious controls. The user wants heavy involvement in design.

Start with [Circular UI research](CIRCULAR_UI_RESEARCH.md): published guidance, music-tool references, findings in the existing dial and the proposed collaborative review process. The next checkpoint is the existing circular Practice screen beside one careful refinement, including playing and recording states. No replacement layout is approved.

## Superseded studies

**The A/B/C proposals below were rejected because they removed the circle.** They are retained as historical artifacts, not candidates awaiting selection. Their screenshots and HTML predate that correction.

Open `interface-review.html` through a local static server for the three proposals. Add `?concept=a`, `?concept=b` or `?concept=c` for a 412px mobile study. All typography is loaded from the repository's existing local DM Sans font. No remote assets are required.

- **A — Open:** prominent centered tempo, inline adjustments, transport in the middle and simple setup rows.
- **B — Contained:** one instrument panel, transport beneath it, a separate setup list and floating navigation.
- **C — Anchored:** left-aligned tempo, a compact beat ruler, setup rows and transport fixed above navigation.

These are static composition studies, not implemented app behavior. The beat displays show example states, and the proposed buttons do not operate the metronome. Their proposed quick actions, font and palette do not establish approval for future work.

The board and individual PNGs were rendered in Chromium with the local font loaded. The individual 412×915 studies had no horizontal overflow. That check did not establish visual quality or satisfaction of the user's brief.

Future work must preserve the circle, obtain feedback on the actual refinement, then show Recordings, Review, Projects and Settings in the agreed direction. Obtain design sign-off before merging or deploying the redesign.
