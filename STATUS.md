# Mini Games — STATUS.md
> Updated: 2026-03-15

## What's Live
- **URL:** https://api.gary-yong.com/play/
- **Server:** EC2, PM2 process `mini-games`, port 3004, nginx proxied
- **13 games:** Emoji Match, Math Blitz, Reaction Race, Simon Says, Tap Frenzy, Trivia Blitz, Word Scramble, Type Racer, Color Clash, Hangman, Number Guess, Geography Quiz, Color Picker
- **Features:** Room codes, shareable links, AI bots (3 difficulty levels, all working), player reconnection with state restore, no login required
- **Also listed on:** gary-yong.com/projects.html (Previous Projects section)

## Architecture
- Plugin system — each game is a server module + client module, auto-loaded from `server/games/`
- Main server: `server/server.js`
- Bot framework: `server/bots.js` — supports both inline polling (legacy 9 games) and getBotMove() return pattern (newer 4 games) via unified dispatcher

## Current State (2026-03-15)
- All 13 games functional and deployed
- **New game development PAUSED** — 13 games is enough. Focus is bot quality + UX polish.
- **Comprehensive audit complete** — see `AUDIT-2026-03-15.md`
- Sprint on hold as of 2026-03-15 — 3 high-impact fixes completed today

## Completed This Sprint (2026-03-15)
- ✅ **Bot fix:** Wired up getBotMove() for 4 dead-bot games (color-picker, geography-quiz, hangman, number-guess). Added generic bot dispatcher in bots.js. Fixed number-guess bot to read all players' hints.
- ✅ **Reconnect fix:** Added getReconnectState() to all 12 games that were missing it. Disconnect → reconnect now restores game state instead of blank screen.
- ✅ **Question pools:** trivia-blitz 20→85+ questions, geography-quiz 45→100+ questions. Deduplicated overlaps. geography-quiz maxPlayers 8→20.

## Backlog (ON HOLD — resume when Gary says go)
- [ ] Add game rules/instructions at round start (all 13 games) — Effort: S
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
rsync -avz --exclude node_modules -e "ssh -i ~/.ssh/id_ed25519" ~/clawd/mini-games/ ubuntu@52.86.178.139:/home/ubuntu/mini-games/
ssh ubuntu@52.86.178.139 -i ~/.ssh/id_ed25519 "pm2 restart mini-games"
```
