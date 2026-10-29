# Full-Width BPM Ring Follow-up

Status: merged to `main` after automated verification.

Goal: make the BPM ring dominate the upper Home viewport and push the large RECORD / START / TAP TEMPO stack lower for easier thumb reach, without changing the accepted color system, transport order, audio behavior, or advanced-control structure.

Implementation:
- Ring container breaks out of the normal 16px horizontal content inset while the buttons keep their existing inset.
- Ring target size changed from 74% of inner content width to 96% of the full-bleed ring container.
- Ring maximum increased from 340px to 520px; minimum increased to 280px.
- Primary stack remains BPM ring → RECORD → START → TAP TEMPO.

Verification:
- PR #7 final head `8cc6f2a` passed GitHub Actions CI run 69.
- TypeScript type-check: PASS.
- Vitest regression suite: PASS.
- Production build: PASS.
- PR #7 merged to `main` as `12a4d09` with the ring-only runtime change preserved separately in commit `db51055`.

Next device check: confirm the larger ring occupies the intended upper-screen area and places RECORD / START / TAP TEMPO at a more comfortable lower thumb position on the Fold 7.
