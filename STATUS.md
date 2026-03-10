# Mini Games — STATUS.md
> Updated: 2026-03-09

## What's Live
- **URL:** https://api.gary-yong.com/play/
- **Server:** EC2, PM2 process `mini-games`, port 3004, nginx proxied, 4 days uptime
- **9 games:** Emoji Match, Math Blitz, Reaction Race, Simon Says, Tap Frenzy, Trivia Blitz, Word Scramble, Type Racer, Color Clash
- **Features:** Room codes, shareable links, AI bots (3 difficulty levels), player reconnection with grace periods, no login required
- **Also listed on:** gary-yong.com/projects.html (Previous Projects section)

## Architecture
- Plugin system — each game is a server module + client module, auto-loaded from `server/games/`
- Game files on EC2: color-clash, emoji-match, math-blitz, reaction-race, simon-says, tap-frenzy, trivia-blitz, type-racer, word-scramble
- Client modules in `public/`
- Main server: `server/index.js`

## Current State (2026-03-09)
- All 9 games functional and deployed
- Phase 1 complete — no known bugs
- No pending local changes

## Known Issues / Tech Debt
- No persistent leaderboard (scores reset per session)
- Trivia round overflow crash — fixed
- See `TECH_DEBT.md` for full list

## Next Actions
- [ ] Add next game

## Game Backlog (pick from these)
- [ ] Hangman
- [ ] Number Guessing
- [ ] Geography Quiz
- [ ] Color Picker
- [ ] Typing Speed (enhanced)
- [ ] Persistent leaderboard

## Decisions
- 2026-02-21: Plugin system for easy extensibility
- 2026-02-21: No login required — friction-free multiplayer
- 2026-03-05: Type Racer added and deployed

## Deploy
```bash
ssh ubuntu@52.86.178.139 -i ~/.ssh/id_ed25519
cd ~/mini-games && git pull && pm2 restart mini-games
```
