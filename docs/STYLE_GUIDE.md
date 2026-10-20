# Poly Pro interface guide

Poly Pro is a quiet practice tool. The main task is always easiest to find.

## Typography and color

- DM Sans is the single interface and canvas font. Bundle its variable Latin font and OFL license locally; no remote font requests. Use tabular numbers for tempo, duration and metrics.
- Page titles: 20px/600. Section titles and buttons: 14px/600. Body: 14px/400. Interface supporting labels: at least 12px/400; canvas axes use 11px or larger. Tempo may be larger, at weight 600.
- Sentence case. No letter-spaced capitals, emoji decoration, duplicated instructions or technical implementation prose in everyday flows.
- Use the existing neutral light palette from `globals.css` and Tailwind. Dark ink identifies the primary action. Red is reserved for recording, errors and deletion. Color never carries meaning alone.

## Layout and controls

- Four-pixel spacing scale; 16px page gutters; 12px control radius; 16px card radius. One border level, no decorative shadows on ordinary cards.
- Touch targets are at least 44px. Primary transport actions are 56px. Use `ui-button`, `ui-button-primary`, `ui-button-secondary`, `PageHeader` and `CollapsibleCard`.
- Keep Start, Record and tempo together above the fold at 412×915. Recording setup and advanced practice controls expand on request. Do not repeat the same control in multiple Home panels.
- Explanations belong beside the action that needs them, inside expanded controls or Help. Keep failures, recording state and unsaved changes explicit.

## Navigation and editing

- Bottom navigation order: Practice, Recordings, Projects, Settings. All destinations use an icon, text label and the same selected treatment. No swipe gesture is required.
- Keep navigation fixed while content scrolls. Capture keeps Stop visible. Review uses one Back action, one draft and one Save changes action.
- Review opens with waveform and playback. Click and Sync stay visible together. Sound, hit editing, scoring, loops and export are secondary tools.
- Sync shifts the reference grid and click against unchanged source audio. Positive milliseconds mean later clicks. Precision adjustment and explicit reference-beat alignment are reversible and saved with the take; never silently fit all hits to the grid.

## Verification

Review screenshots at 320px, 412px and 884px. Check overflow, action visibility, keyboard focus, screen-reader names, contrast, reduced motion and offline font loading. Test complete tasks as well as individual controls. Screenshots and test counts alone do not prove the interface feels good on a physical phone.
