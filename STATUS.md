# Mini Games — STATUS.md
> Updated: 2026-08-13

## What's Live
- **Canonical URL:** https://play.gary-yong.com/
- **Legacy URL:** https://api.gary-yong.com/play/ → `301` redirect to the canonical host
- **Server:** EC2, PM2 process `mini-games`, port 3004, nginx proxied
- **13 games:** Emoji Match, Math Blitz, Reaction Race, Simon Says, Tap Frenzy, Trivia Blitz, Word Scramble, Type Racer, Color Clash, Hangman, Number Guess, Geography Quiz, Color Picker
- **Features:** Room codes, shareable links, AI bots (3 difficulty levels), secure token-based reconnect with state restore, server-authoritative timing, complete guides, responsive Arcade Field Guide UI, no login required
- **Also listed on:** gary-yong.com/projects.html (Previous Projects section)

## Architecture
- Plugin system — each game is a server module + client module, auto-loaded from `server/games/`
- Main server: `server/server.js`
- Bot framework: `server/bots.js` — supports both inline polling (legacy 9 games) and getBotMove() return pattern (newer 4 games) via unified dispatcher

## Current State (2026-08-13)
- All 13 games audited, remediated, independently reviewed, and deployed; current release `3c8a4d1`
- Hangman interaction regression fixed: strict Socket.IO envelope validation had rejected `guess_letter` and `guess_word` because underscores were excluded, making buttons animate locally without registering server-side. The contract now accepts underscores, all public client event names are checked against it, and a real Socket.IO Hangman mutation test covers letter and whole-word guesses.
- Canonical subdomain, dedicated TLS certificate, root asset routing, health endpoint, and Socket.IO transport verified
- Final release gate: 56/56 tests, live Hangman action acknowledgement/mutation smoke, 13 guides/13 clients, desktop/mobile browser smoke, all 13 active game states across 6 mobile viewports (312 assertions), 13 tutorials across 3 mobile viewports, short-landscape tutorial containment, Color Picker results, bounded 20-player Tap Frenzy leaderboard, long-name results, focused-input visibility, `npm audit --omit=dev` = 0 vulnerabilities
- Production rollback: `/home/ubuntu/mini-games-previous-20260813-024053` → prior release `05aa0e8`; original pre-mobile release `3613149` also retained
- **New game development PAUSED** — 13 games is enough. Focus is bot quality + UX polish.
- **Comprehensive audit complete** — see `AUDIT-2026-08-12.md`
- **Active-state mobile audit complete** — see `MOBILE-AUDIT-2026-08-12.md`; Hangman keyboard/canvas clipping, Math Blitz action overflow, Emoji Match semantics/targets, Color Picker slider targets, short-height layouts, and fixed connection badge overlap remediated.

## Completed This Sprint (2026-08-12)
- ✅ **Server authority/security:** Secure rotating reconnect tokens, strict Socket.IO contracts, generic identity migration, rate/room limits, timer containment, active-room TTL, health metrics, and zero known production dependency vulnerabilities.
- ✅ **All-game remediation:** Corrected scoring, input validation, stale/duplicate actions, timers, bot contracts, reconnect serializers, hidden state, and disconnect behavior across all 13 games.
- ✅ **Reaction fairness:** Server-monotonic timing, trusted RTT calibration, bounded compensation, uncertainty-aware ties, and a 300ms fairness collection window.
- ✅ **Rendering security:** Removed player-name HTML injection across all game clients and added exhaustive malicious-name DOM/static tests.
- ✅ **Arcade Field Guide:** Distinctive non-purple/non-blue editorial system, desktop/mobile layouts, keyboard/touch controls, reduced-motion support, accessible semantics, and complete game guides.
- ✅ **Domain migration:** `play.gary-yong.com` is live with dedicated TLS; the old `/play/` path redirects while the old Socket.IO route remains temporarily compatible.
- ✅ **All-game mobile remediation:** Exercised every active game at 320×568, 360×640, 375×667, 390×844, 375×400, and 667×375; added permanent Playwright geometry, overflow, semantics, and 44px touch-target gates.

## Completed This Sprint (2026-03-17)
- ✅ **Tutorial overlays:** Added how-to-play tutorial to all 13 games. Shows animated overlay at round start with game-specific instructions. reaction-race has 4.5s ghost round demo; trivia-blitz and others use overlay with rule descriptions. Overlay positions correctly across all screen sizes.

## Completed Previous Sprint (2026-03-15)
- ✅ **Bot fix:** Wired up getBotMove() for 4 dead-bot games (color-picker, geography-quiz, hangman, number-guess). Added generic bot dispatcher in bots.js. Fixed number-guess bot to read all players' hints.
- ✅ **Reconnect fix:** Added getReconnectState() to all 12 games that were missing it. Disconnect → reconnect now restores game state instead of blank screen.
- ✅ **Question pools:** trivia-blitz 20→85+ questions, geography-quiz 45→100+ questions. Deduplicated overlaps. geography-quiz maxPlayers 8→20.

## Backlog (ON HOLD — resume when Gary says go)
- [ ] Type Racer: add typo simulation for bots (currently 100% accurate) — Effort: S
- [ ] Emoji Match: fix bot passive card learning (empty code block) — Effort: S
- [ ] Simon Says: spectator mode for eliminated players — Effort: S
- [ ] End-game celebration animation/confetti (all games, client-only) — Effort: S
- [ ] Persistent leaderboard (scores survive sessions) — Effort: M

## Known Tech Debt
- See `TECH_DEBT.md` for full list
- New items from audit: unified bot pattern migration, per-game timer fragility, input validation gaps

## Decisions
- 2026-02-21: Plugin system for easy extensibility
- 2026-02-21: No login required — friction-free multiplayer
- 2026-03-11: Number Guess added — shared hints, hot/cold, 5 rounds
- 2026-03-13: Geography Quiz added — capitals, countries, flags
- 2026-03-14: Color Picker added — RGB slider color matching, perceptual scoring
- 2026-03-15: New game dev paused. Audit + 3 quality fixes shipped.

## Deploy
```bash
# Production is released from an immutable git archive into
# /home/ubuntu/mini-games-releases/<commit>, then promoted at
# /home/ubuntu/mini-games and restarted with PM2 process mini-games.
```
