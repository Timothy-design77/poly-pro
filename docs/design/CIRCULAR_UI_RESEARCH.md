# Refining Poly Pro's circular interface

Research date: 2026-10-21. Baseline: deployed 2.4.0, commit `8de05e8`.

**2026-10-26 update:** This report preserves the research and earlier review plan. The user subsequently delegated design and release decisions, superseding the approval checkpoints below. See the [2.5 refinement audit](../CIRCULAR_REFINEMENT_AUDIT.md) for implementation and verification.

## Direction from the user

Keep the circular metronome. Refine its presentation and the surrounding interface. The user wants a minimal music tool with restrained color, strong typography and spacious controls, and wants to be heavily involved in design.

The previous A/B/C studies removed the circle and therefore missed the brief. They are rejected, not candidates awaiting selection. The circle, centered tempo and concentric rhythm tracks are the starting point for future work. No new palette, font, navigation structure or screen composition is approved by this report.

This is research and an assessment of the existing screen, not an implemented redesign. Application source and deployment are unchanged.

## What I read and what it changes

The recommendations below are applications of published guidance to Poly Pro. They are design judgments to review with the user, not findings that research has proved a particular Poly Pro layout is best.

| Published guidance | Observation in Poly Pro | Proposed refinement |
| --- | --- | --- |
| [NN/G: Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) explains relative scale, contrast, proximity and grouping. Enclosure is useful when spacing alone cannot communicate a group. | The circular tempo display is already a clear focal point. Below it, Tap tempo, recording setup and advanced options become a stack of similarly outlined rectangles. | Preserve the focal point. Group tempo, transport and rhythm deliberately; distinguish frequent controls from setup through spacing and weight. Remove unnecessary containers, not meaningful controls. |
| [Wathan and Schoger: 7 Practical Tips for Cheating at Design](https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886) recommends weight and color for hierarchy, fewer borders and distinct primary/secondary/tertiary action treatments. | One local font has been introduced, but repeated borders and control treatments still make different tasks look equally important. | Keep Start/Stop visually decisive and Record easy to find. Make Tap tempo and setup quieter without shrinking their hit areas. Establish consistent text roles, icon proportions, border treatment and control states. |
| [NN/G: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) keeps frequently needed features visible and moves specialized options behind clear entry points. Too many advanced entry points can themselves become clutter. | Six collapsed advanced rows still consume attention. The user has specifically identified playback synchronization as a frequent, hard-to-find task. | Review which controls are used during practice before reorganizing them. Keep Start, Record and status visible. Keep Sync beside playback. Do not hide frequently needed actions merely to produce a cleaner screenshot. |
| [W3C: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) requires 4.5:1 for normal text; [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) requires 3:1 for meaningful graphical information and identifying control/state cues. | Several small labels drawn inside the dial are too faint. Ordinary beat dots are also faint and small. | Keep decorative tracks restrained, but improve functional text and beat visibility. Distinguish downbeat, subdivision and active beat through size or shape as well as color. Do not make every outline darker. |
| [Android: Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps) recommends at least 48×48 dp touch areas; [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) specifies 44×44 CSS px at Level AAA, with exceptions. | Minimal styling can tempt us to make small, difficult controls. A music tool is often used with divided attention. | Preserve generous hit areas even when the visible icon is small. For this web app, consider 48 CSS px for frequent controls as a product comfort target, keeping the existing 56 px transport. Android dp and CSS px are different units; 44 px is not the WCAG AA minimum. |
| [Android: Adaptive Apps](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps) adapts layout to the available window, with continuity across changes. | Folded and unfolded use have different available space. Simply enlarging the circle or leaving large empty margins does not use that space well. | Bound the circle's size and consider placing setup beside it on wider windows. Preserve the task, recording state and recognizable navigation through resizing. Native Android layout examples inform the idea; they do not prescribe this PWA's implementation. |
| [NN/G: Testing Visual Design](https://www.nngroup.com/articles/testing-visual-design/) separates preference from task performance and recommends limiting changed variables when comparing designs. | Passing browser tests did not establish that the user liked the interface. The rejected studies changed layout and visual identity together. | Review the current circular screen against one careful refinement. Explain the changes, obtain specific feedback, then validate actual tasks. A passing automated suite cannot substitute for design acceptance. |

## Music-tool references inspected

I read the official product pages and viewed their promotional interface images. These are visual references, not hands-on usability or audio-performance tests.

- **[Tempo Advance, Frozen Ape](https://www.frozenape.com/tempoadvance-metronome.html):** the official phone image shows concentric beat rings around a centered tempo. This is a useful example of a circular layout communicating rhythm structure. It supports retaining Poly Pro's existing concept, without copying its older skin, colors or density.
- **[The Metronome, Soundbrenner](https://www.soundbrenner.com/pages/the-metronome-app):** its light interface groups the rotary control, tempo, transport and tap action, and uses an accent for active state. The useful lesson is the relationship between controls. Its setlist density and pronounced shadows are not recommendations for Poly Pro.

## Concrete findings in the existing dial

Evidence: [current Practice screenshot](../release/home.png), [Dial.tsx](../../src/components/metronome/Dial.tsx), and the `#F2F3F5` background in [globals.css](../../src/styles/globals.css).

The circular structure is intact and recognizable. Its execution needs attention: two very faint concentric outlines, small low-contrast beat dots, and small supporting labels that are substantially fainter than the central tempo. Below the dial, repeated bordered rows give setup a large share of the screen.

The following estimates alpha-composite the dial's `rgb(21,23,26)` foreground onto `rgb(242,243,245)`, then apply the standard sRGB relative-luminance contrast formula. Channels are rounded to their nearest 8-bit value; ratios are displayed to two decimals. These are code-derived checks of the solid colors, not measurements of a physical phone or antialiased edge pixels.

| Element | Alpha | Composited RGB | Approximate contrast | Interpretation |
| --- | ---: | --- | ---: | --- |
| Meter/subdivision label | 0.48 | 136,137,140 | 3.15:1 | Below 4.5:1 for this small text. |
| Playing bar label | 0.52 | 127,129,131 | 3.52:1 | Below 4.5:1 for this small text. |
| Polyrhythm ratio label | 0.58 | 114,115,118 | 4.27:1 | Below 4.5:1 for this small text. |
| Ordinary main-track beat | 0.40 | 154,155,157 | 2.51:1 | Too faint if needed to understand beat structure; assess against the 3:1 graphical-information criterion. |
| Decorative outer frame | 0.08 | 224,225,227 | 1.18:1 | Not inherently a failure: purely decorative framing need not meet the functional-graphics threshold. |

At a 340 px dial, the meter and bar text are about 13 px, and the ratio about 12 px. These are normal-size text, not large text eligible for the lower threshold. The canvas draws these labels as pixels; ordinary DOM text-contrast checks do not validate them. A beat that is not currently sounding is also not automatically a disabled UI component exempt from contrast requirements.

Reproduction: compute each channel as `round(alpha * foreground + (1 - alpha) * background)`. Normalize each channel to 0–1; linearize using `c / 12.92` when `c <= 0.04045`, otherwise `((c + 0.055) / 1.055) ** 2.4`. Luminance is `0.2126 * R + 0.7152 * G + 0.0722 * B`; contrast is `(lighter + 0.05) / (darker + 0.05)`.

## Refinement priorities for review

1. **Craft the existing circle.** Review ring weight and spacing, marker size and distinction, and the optical placement of the central tempo and labels. Preserve concentric rhythm tracks and the current editing behavior. Do not add a rotary gesture merely because the visual is circular. Check dense subdivisions and multiple tracks as well as default 4/4.
2. **Build a coherent type hierarchy.** DM Sans is already locally bundled; changing the family is not the first fix. Review its numeral shapes, weight, line height and spacing in context. Use stable numeric alignment and readable secondary labels. The user should see the proposed typography on the actual dial before it becomes the standard.
3. **Reduce competing chrome.** Rework the surrounding spacing, repeated boxes and section labels. Keep transport close to the instrument. Group settings by the task they serve, with useful current values and concise labels. Avoid replacing visible controls with unexplained icons.
4. **Make states as deliberate as the idle screen.** Define consistent selected, pressed, focused, disabled, playing and recording treatments. Keep recording status and Stop unmistakable. Use restrained beat feedback with a reduced-motion treatment; maintain the real audio timing instead of using decorative animation as a timing reference.
5. **Standardize the rest of the app after Practice is agreed.** Apply the same typography, icon treatment, spacing, buttons and navigation to Recordings, Review, Projects and Settings. Preserve direct playback Sync and one coherent editing flow. Review those screens before implementation and release.

After approval, record the actual choices in the style guide and share the relevant tokens between CSS and the canvas renderer so they cannot drift. Consider rendering text in the DOM over the dial if it improves accessibility and typography; this does not require replacing the circular visualization or changing frameworks.

## Next design checkpoint

Prepare a side-by-side of the current circular Practice screen and one refinement, with annotations identifying the specific changes. Start at 412×915, then show an unfolded layout around 884 px wide. Include idle, playing and recording states. Keep unrelated palette, font and navigation experiments out of the comparison so feedback can address the actual changes.

The user reviews circle treatment, typography, density and control grouping before application implementation. After revision, review the other screens in the agreed system. Design acceptance comes before merging or deploying this redesign, as requested by the user; elapsed time or a default answer does not count as acceptance.

Verification then includes changing tempo, starting/stopping, recording, finding playback Sync, and switching destinations; keyboard focus, large text, narrow screens and folding; screenshots in meaningful states; and code-derived contrast checks for canvas content. Physical device and audio checks remain separate from visual approval.

## Research scope

Read the linked public articles and relevant official documentation, plus the two product pages and images. The Refactoring UI source is the public seven-tip article, not the paid book. Product examples illustrate patterns and do not prove usability. No competitor was tested hands-on, and no physical Fold 7 evaluation was performed for this report. This research does not establish a universally best font, palette or layout; those choices require review in Poly Pro's actual context.
