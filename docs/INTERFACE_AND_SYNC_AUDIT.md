# Interface and playback sync — 2.4

2026-10-20. Baseline: deployed `44e5f0e` (2.3).

The user reported a busy interface, a delayed first click, inaccurate recorded-playback alignment hidden in Settings, and inconsistent navigation. These are product defects even though the previous regression suite passed.

| Finding | Change | Evidence |
| --- | --- | --- |
| Start waits for the entire sound catalog and every custom sample | Prepare selected sounds before interaction; resume Web Audio immediately in the gesture; request an interactive audio context; deduplicate loads | With an unused kick request delayed by 1.6 seconds, pointer-to-first-source time was 1,672 ms before and 9.3 ms after. Browser coverage exercises cold/warm starts and never requests the unused sound. |
| Project/preset changes can select a sound that is not loaded yet | Prepare sound selections on settings/track changes without resuming audio | Engine regressions cover changed overrides and count-in; existing custom-sound and project workflows remain covered. |
| A large ring, stacked oversized buttons, explanatory text and multiple recording rows bury Start | Smaller ring, adjacent Start/Record, one Recording setup disclosure, contextual help | Browser checks require Start and Record to fit above fixed navigation at the cover-screen viewport. |
| Remote fonts and many tiny/heavy/uppercase labels create a fragmented appearance | One bundled DM Sans variable font, tabular numerals, shared page headers, buttons and collapsible cards | Local font request and loaded-face checks; expanded controls and screen audits at 320/412/884px. See [STYLE_GUIDE.md](STYLE_GUIDE.md). |
| Home/Progress labels do not identify clear tasks; dashboards bury saved takes | Practice → Recordings → Projects → Settings; take list first; project filter; optional progress | Navigation checks match labels to headings; filtering includes all recordings and recovers after project deletion. |
| Deleting the active project is inexplicably unavailable | The same confirmation is available for every project; it switches safely to Quick Start before deletion and preserves takes | A real capture/filter/delete workflow verifies both recordings remain visible after removing the active project. |
| Sync is mixed with scoring settings and requires coarse manual estimation | Visible Sync beside Click; 0.1 ms exact adjustment, 1 ms earlier/later buttons, explicit reference-click/recorded-hit alignment | A known 137.5 ms reference is applied, undone and saved; native source scheduling agrees to five decimal places in seconds; saved configuration survives reload. |
| Waveform and playback controls compete for attention | Waveform display options expand on request; playback, click and Sync remain primary | Review screenshots and keyboard, touch, fold-resize, accessibility and export regressions. |

Sync shifts one reference grid and click track against unchanged source audio. It does not automatically fit every hit, alter tempo or independently measure acoustic latency. A musician must choose the intended beat/hit correspondence. All edits use the existing draft, undo/redo and atomic Save changes flow.

The timing probe measures application scheduling, not speaker output. First-time sample downloads, device audio startup and Bluetooth routing can add delay; physical Fold 7 acceptance remains open. No schema migration or cloud service is introduced.
