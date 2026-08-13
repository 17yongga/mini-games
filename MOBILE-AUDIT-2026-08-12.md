# Mini Games Active-State Mobile Audit

**Date:** 2026-08-12
**Canonical production:** https://play.gary-yong.com/
**Scope:** Home, lobby, tutorials, countdown, active play, results/reconnect contracts, touch controls, text inputs, short viewport/virtual keyboard conditions, and portrait/landscape behavior for all 13 games.

## Executive finding

The shared shell is responsive, but the previous browser smoke test covered the home/lobby and generic container geometry rather than the largest interactive surface in every active game. That allowed multiple game-specific desktop assumptions to ship. Hangman is a confirmed release-level failure, not a device-specific anomaly.

## Tested viewport matrix

- 320 × 568 (compact portrait / iPhone SE-class width)
- 360 × 640 (compact Android portrait)
- 375 × 667 (iPhone 8-class portrait)
- 390 × 844 (modern iPhone portrait)
- 375 × 400 (short visual viewport / software keyboard simulation)
- 667 × 375 (phone landscape)

The audit used real Chromium rendering against production, direct active-state hydration for each game client, DOM geometry checks, full-page screenshots, overflow detection, focus checks, and touch-target measurements.

## Severity summary

### Critical

1. **Hangman clips its gameplay and keyboard at every tested portrait width.**
   - At 375 px, `.hg-main` rendered from x=-36 to x=412 inside a 347 px canvas.
   - The O/P/L side of the keyboard is clipped; the whole-word action is truncated.
   - Root cause: a fixed two-column `.hg-main` composition plus an overflow-hidden shared game canvas.
   - Letter keys are only 24–28 px wide, below the 44 px target requirement.

2. **Math Blitz pushes Submit outside the canvas at every tested portrait width.**
   - At 375 px, the input ends at x=339.5 and Submit spans x=347.5–403.5.
   - Root cause: global `input { width: 100% }` inside a non-wrapping flex action row.
   - With a short/keyboard-open viewport, the action row is also below the visible area unless the browser scrolls correctly.

### High

3. **Type Racer is not robust with the virtual keyboard open.**
   - At 375 × 400, the focused input starts around y=529, outside the visual viewport.
   - The sentence, progress bar, and input are vertically stacked beneath a costly game header.
   - Automatic focus can summon the keyboard before the field is in a stable visible position.

4. **Word Scramble clips long words and is fragile under software-keyboard conditions.**
   - Long, letter-spaced strings exceed the compact canvas.
   - The input row itself fits at 320 px, but landscape and keyboard-open layouts require unnecessary scrolling because the canvas retains desktop-oriented vertical spacing.

5. **Emoji Match cards are too small and not keyboard accessible.**
   - A 20/24-card compact board produces approximately 37 × 37 px cards at 320 px.
   - Cards are clickable `<div>` elements without button role, tabindex, or keyboard activation.
   - The visual layout fits, but it fails the 44 px touch target and keyboard-accessibility gates.

6. **The fixed ONLINE badge overlays game controls/content.**
   - Seen over Hangman keys, Trivia/Geography answers, Type Racer input, and other bottom-right surfaces.
   - This is a shared mobile shell defect; connection state must occupy reserved flow space or move into the header.

### Medium

7. **Color Picker sliders expose a 4 px-high range-control box.**
   - The thumb is visible, but the measured input track is not a reliable touch target.
   - Needs a 44 px interaction wrapper while preserving the compact visual track.

8. **Trivia Blitz has compact-width internal overflow and answer crowding.**
   - At 320 px, the game container measured 290 px client width / 298 px scroll width.
   - Long answer text is crowded; the ONLINE badge overlaps the bottom-right answer.

9. **Color Clash has slight compact-width overflow.**
   - At 320 px, the game container measured 290 px client width / 299 px scroll width.
   - Core controls remain usable, but the layout violates the no-hidden-overflow release gate.

10. **Landscape and short-height composition is inefficient across input games.**
    - Type Racer, Word Scramble, Math Blitz, and Number Guess retain large vertical blocks and force scrolling despite ample horizontal space.
    - Headers consume a disproportionate share of a 375 px-tall viewport.

### Low / polish

11. **Number Guess uses excessive empty canvas space.** Controls remain usable, but the important action is visually lost.
12. **Geography Quiz remains usable**, though long answer text becomes small/crowded and the connection badge can overlap an answer.
13. **Reaction Race remains usable** with a large touch target; connection badge placement is the main issue.
14. **Simon Says remains usable** with large pads; short-height spacing can be tightened.
15. **Tap Frenzy remains usable** with a large primary target; short-height spacing can be tightened.

## Per-game disposition

| Game | Portrait | Short/keyboard viewport | Landscape | Required action |
|---|---|---|---|---|
| Color Clash | Minor overflow | Usable | Usable | Remove overflow, reserve badge space |
| Color Picker | Fits; slider targets too thin | Usable | Usable | 44 px slider hit areas |
| Emoji Match | Cards under 44 px | Fits | Fits | Adaptive columns/size, semantic buttons |
| Geography Quiz | Fits; crowded long text | Fits | Fits | Text scaling/wrapping, badge fix |
| Hangman | **Clipped/unusable** | **Clipped/unusable** | Fits but keys remain narrow | Mobile stack/reflow and keyboard redesign |
| Math Blitz | **Submit clipped** | **Action below/aside viewport** | Fits after scroll | Flex sizing/wrap and focus visibility |
| Number Guess | Usable; too much whitespace | Usable | Scroll-heavy | Compact composition |
| Reaction Race | Usable | Usable | Usable | Badge/spacing only |
| Simon Says | Usable | Usable | Usable | Short-height spacing |
| Tap Frenzy | Usable | Usable | Usable | Short-height spacing |
| Trivia Blitz | Internal overflow/crowding | Fits | Fits | Answer sizing/wrapping, badge fix |
| Type Racer | Input below initial fold at 320 | **Focused input below visual viewport** | Scroll-heavy | Keyboard-aware compact layout |
| Word Scramble | Long words clip | Input visible, cramped | Scroll-heavy | Fluid typography/word wrapping, compact layout |

## Root causes

### Architecture

- The shared shell enforces `overflow: hidden` on `.game-container`, masking game-client overflow instead of exposing it.
- There is no explicit mobile layout contract for game clients: safe inline width, reserved connection-status space, short-height behavior, and input-focus behavior are not centralized.
- The connection badge is viewport-fixed and competes with gameplay.

### Code quality

- Generic global form rules leak into specialized flex rows.
- Several games encode fixed columns, minimum heights, font sizes, and letter spacing independently.
- Emoji Match duplicates button behavior with non-semantic divs.

### Tests

- Existing responsive smoke validated the home/lobby and generic target sizes only.
- It did not hydrate every active game state or inspect each game's lowest/largest control surface.
- It did not test compact 320 px width, short visual height, landscape, long strings, virtual keyboard focus, or internal scrollWidth.

### Performance

- CSS/media-query fixes are sufficient for most issues and should not add runtime cost.
- Resize/visualViewport listeners, if added for focused-input visibility, must be shared, passive, and cleaned up with the game lifecycle.
- Avoid per-frame layout polling.

## Recommended remediation plan

1. **Shared mobile contract**
   - Add safe inline sizing (`min-width: 0`, `max-width: 100%`, controlled wrapping).
   - Stop hiding actionable horizontal overflow during QA.
   - Move ONLINE status into reserved flow/header space on compact screens.
   - Add safe-area-aware bottom padding and short-height media queries.

2. **Critical game fixes**
   - Hangman: switch to a one-column compact composition, constrain scaffold, create a full-width adaptive keyboard with row-aware keys, and retain 44 px height.
   - Math Blitz: make the input flex item shrinkable, keep Submit in-canvas, and stack the action row at the narrowest breakpoint when necessary.
   - Type Racer / Word Scramble: fluid text, compact vertical spacing, focus-visible scrolling using `visualViewport`/`scrollIntoView`, and no forced keyboard before layout settles.

3. **Touch and semantic fixes**
   - Emoji Match: real button elements, 44 px minimum targets, adaptive board columns/spacing, keyboard activation and labels.
   - Color Picker: 44 px range-control interaction rows with the visual track centered inside.
   - Trivia/Geography/Color Clash: remove internal overflow and reserve answer text/badge space.

4. **Regression suite**
   - Hydrate all 13 active states at all six viewports.
   - Assert no element exceeds the game canvas horizontally.
   - Assert each interactive target is at least 44 × 44 px, with explicit justified exceptions only for native range internals inside a 44 px wrapper.
   - Assert focused text inputs intersect the visual viewport.
   - Add long-word, long-question, long-answer, long-player-name, reconnect, result, tutorial, and badge-overlap fixtures.
   - Preserve desktop screenshots and reduced-motion coverage.

5. **Release**
   - Run unit/integration/security/browser suites.
   - Perform real touch/click/scroll/orientation browser QA on the exact immutable candidate.
   - Deploy atomically to port 3004 with rollback, then verify production and all shared-host routes.

## Release acceptance criteria

- No horizontal clipping or hidden primary controls at any tested viewport.
- Hangman's full keyboard and both actions remain visible/reachable at 320 px.
- Math Blitz input and Submit stay inside the canvas.
- Focused input intersects the short visual viewport for Type Racer, Word Scramble, Math Blitz, and Number Guess.
- Every custom interactive surface has semantic keyboard behavior and a 44 px touch target.
- No fixed connection indicator overlaps gameplay.
- All 13 active states, tutorials, results, reconnect snapshots, and long-content fixtures pass.
- Desktop behavior, server-authoritative rules, reconnect security, and shared-host services remain unchanged.
