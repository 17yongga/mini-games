# CLAUDE.md — Mini Games Platform

## Project Overview
Real-time multiplayer mini game platform. Players join rooms via code or shareable links, play with each other or AI bots.

## Live Environment
- **URL:** https://api.gary-yong.com/play/
- **Server:** EC2 ubuntu@52.86.178.139
- **Port:** 3004 (nginx → localhost:3004)
- **PM2 process:** `mini-games`
- **SSH:** `ssh ubuntu@52.86.178.139 -i ~/.ssh/id_ed25519`

## Local Repo
- **Path:** `~/clawd/mini-games/`
- **Run locally:** `node server/server.js` (port 3004)

## Architecture
Plugin system — every game is TWO files:
1. `server/games/<game-name>.js` — server module (game logic, bot AI)
2. `public/js/<game-name>.js` — client module (UI, socket events)

Games are **auto-discovered** at startup from `server/games/` — no registration needed.

Core server files:
- `server/server.js` — main Express + Socket.IO server
- `server/rooms.js` — room management
- `server/bots.js` — bot player framework

> **Current game list:** See `STATUS.md` (source of truth)

## Stack
- Node.js + Express + Socket.IO
- Vanilla JS frontend (no framework)
- No database (in-memory rooms)

## Adding a New Game (checklist)
1. Create `server/games/<name>.js` — implement: `init(room)`, `handleAction(room, player, data)`, `getBotMove(room, bot)` (optional), `getState(room)`
2. Create `public/js/<name>.js` — implement: `init(socket, roomState)`, `handleEvent(event, data)`, `render(state)`
3. Add game metadata to `server/games/index.js` (name, description, minPlayers, maxPlayers)
4. Test locally at localhost:3004
5. Deploy: rsync to EC2 + `pm2 restart mini-games`

## Deploy Command
```bash
rsync -avz --exclude node_modules ~/clawd/mini-games/ ubuntu@52.86.178.139:/home/ubuntu/mini-games/ -i ~/.ssh/id_ed25519
ssh ubuntu@52.86.178.139 -i ~/.ssh/id_ed25519 "pm2 restart mini-games"
```

## Key Rules
- **No login required** — players use display names only
- **Bot difficulty:** easy / medium / hard — implement all three in getBotMove
- **Reconnection:** grace period is handled by `rooms.js`, games must be stateless enough to resume
- Always update `~/clawd/changes/mini-games.md` after any change

## Related
- Listed on gary-yong.com/projects.html
- Changelog: `~/clawd/changes/mini-games.md`
