# Poly Pro interface guide

Poly Pro is a quiet practice tool. The main task is always easiest to find.

## Typography and color

- DM Sans is the single interface and canvas font. Bundle its variable Latin font and OFL license locally; no remote font requests. Use tabular numbers for tempo, duration and metrics.
- Page titles: 24px/600. Section titles and buttons: 14px/600. Body: 14px/400. Interface supporting labels: at least 12px/400; short units and canvas axes use 11px or larger. Central tempo uses weight 550 with tight spacing; scale it to fit inside the innermost rhythm ring.
- Sentence case. No letter-spaced capitals, emoji decoration, duplicated instructions or technical implementation prose in everyday flows.
- Use the existing neutral light palette from `globals.css` and Tailwind. Dark ink identifies the primary action. Red is reserved for recording, errors and deletion. Color never carries meaning alone.

## Layout and controls

- Four-pixel spacing scale; 20px page gutters (16px on very narrow screens); 12px control radius; 16px card radius. One border level, no decorative shadows on ordinary cards. Setup uses divided rows, with a surface only when expanded.
- Touch targets are at least 44px. Primary transport actions are 56px. Small visual affordances (the 24px Help circle) extend their hit area to 44px.
- Colors live once, as CSS custom properties in `globals.css`; Tailwind color names resolve to those variables.
- Keep the circular tempo/rhythm display, decrease/Tap tempo/increase, Start and Record together above the fold at 412×915. Recording setup and practice controls expand on request. At wider windows, put setup beside the bounded circle. Do not repeat the same control in multiple Home panels.
- Render the dial's labels as accessible DOM text with shared color tokens. Beat markers distinguish downbeat and active state by size/outline as well as color. Keep decorative tracks quiet and meaningful markers readable. No decorative continuous animation or fabricated microphone levels.
- Explanations belong beside the action that needs them, inside expanded controls or Help. Keep failures, recording state and unsaved changes explicit.

## Components

Use the shared pieces in `src/components/ui` instead of restyling raw elements. Each role has one treatment:

| Need | Use | Notes |
| --- | --- | --- |
| Action | `Button` (`primary`, `secondary`, `quiet`, `danger`, `danger-quiet`; `size="lg"`, `block`) | One primary (dark ink) action per view. `danger` only inside a confirmation; `danger-quiet` for the entry point to a destructive action. |
| Icon-only action | `IconButton` | 44px square, `aria-label` required. |
| Few exclusive choices | `SegmentedControl` | Pressed buttons; selection shows an ink outline, not color alone. |
| Labelled input/select | `Field` with `ui-input` / `ui-select` | Visible label names the control; hints sit below. |
| Label + value/control | `SettingRow` inside `ui-rows` | Rows are divided by one hairline. |
| On/off | `Toggle` (role switch) | |
| Status, warning, error | `Notice` | Errors announce as alerts; others politely. |
| Full-screen tool | `ScreenDialog` | Back (chevron + "Back"), centered title, optional trailing action, safe-area aware. |
| Short decision | `Dialog` (`alert` for destructive) / `Modal` | Recommended action first, Cancel/keep last. |
| Picker or form | `Sheet` | Bottom panel with a title and Done. |
| Collapsible group | `CollapsibleCard` | Help and Reset share one row. |

Copy on controls is sentence case and names the outcome ("Save changes", "Delete take"). Use icons, not arrow or emoji characters, in controls.

## Navigation and editing

- Bottom navigation order: Practice, Recordings, Projects, Settings. All destinations use an icon, text label and the same selected treatment. No swipe gesture is required.
- Keep navigation fixed while content scrolls. Capture keeps Stop visible. Review uses one Back action, one draft and one Save changes action.
- Numeric entry is a draft: first typing replaces the old value; Set commits, Cancel/Escape dismiss without changing it. Switching destinations stops a held tempo adjustment.
- Recordings leads with takes. Comparisons and charts belong under Practice progress. Empty states offer a useful next action.
- Review opens with waveform and playback. Click and Sync stay visible together. Sound, hit editing, scoring, loops and export are secondary tools.
- Sync shifts the reference grid and click against unchanged source audio. Positive milliseconds mean later clicks. Precision adjustment and explicit reference-beat alignment are reversible and saved with the take; never silently fit all hits to the grid.

## Verification

Review screenshots at 320px, 412px and 884px. Check overflow, action visibility, keyboard focus, screen-reader names, contrast, reduced motion and offline font loading. Test complete tasks as well as individual controls. Screenshots and test counts alone do not prove the interface feels good on a physical phone.
