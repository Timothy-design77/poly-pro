# Full-Width BPM Ring Follow-up

Goal: make the BPM ring dominate the upper Home viewport and push the large RECORD / START / TAP TEMPO stack lower for easier thumb reach, without changing the accepted color system, transport order, audio behavior, or advanced-control structure.

Implementation:
- Ring container breaks out of the normal 16px horizontal content inset while the buttons keep their existing inset.
- Ring target size changed from 74% of inner content width to 96% of the full-bleed ring container.
- Ring maximum increased from 340px to 520px; minimum increased to 280px.
- Primary stack remains BPM ring → RECORD → START → TAP TEMPO.

Verification required before merge: TypeScript type-check, Vitest regression suite, production build.
