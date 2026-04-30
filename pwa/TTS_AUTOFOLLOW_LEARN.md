# PWA TTS Auto-Follow Stabilization Notes

Date: 2026-04-30

## Problem

PWA TTS auto-follow page turning went through several unstable states:

- Fixed character buffers turned too early or too late depending on layout.
- Geometry-based triggers using `Range.getClientRects()` were unreliable with epub.js column pagination.
- Auto-follow and manual navigation state could overlap.
- `end.cfi` sometimes mapped later than the visual page boundary.
- A global learned ratio over-corrected and caused early page turns.

## Final PWA Approach

- TTS `absoluteOffset` is the single progress source.
- Highlight display and page-turn decisions are separated.
- Current page boundaries are derived from epub.js `currentLocation()` CFIs.
- Page turn uses the current page's measured end boundary with a tiny fixed lead:
  - `pageTurnOffset = pageEndOffset - 8`
- Auto page turns are routed through a sequence-tracked request path:
  - `requestTTSAutoNextPage(...)`
  - `ttsAutoFollowPendingRef`
  - `ttsAutoFollowSequenceRef`
- Relocated unlock only applies to the matching auto-follow sequence.
- Guards prevent repeated page turns:
  - Do not auto-turn if `absoluteOffset < pageStartOffset`.
  - Do not auto-turn immediately after entering a new page.
  - Manual page turns still apply a temporary auto-follow cooldown.

## Lessons

- Do not use CSS Highlight geometry as the source of truth for page turning in this epub.js setup.
- Do not apply cross-page learned ratios globally; a correction learned on one page can be wrong for another.
- Keep auto-follow state explicit and separate from manual navigation state.
- Use geometry logs only as debugging context for highlight placement.

## Renderer Follow-Up

Do not port intermediate experiments. Port only the final state-machine approach after PWA local/formal/iOS testing is confirmed.
