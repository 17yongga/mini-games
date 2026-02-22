// Mini Games Platform — main server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const rooms = require('./rooms');
const games = require('./games');
const bots = require('./bots');

const PORT = process.env.PORT || 3004;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  path: '/minigames-ws/',
  // Mobile-friendly: longer timeouts to survive app-switching
  pingInterval: 10000,   // ping every 10s
  pingTimeout: 30000,    // wait 30s before considering disconnected
  connectTimeout: 20000
});

// Serve static files
app.use('/play', express.static(path.join(__dirname, '..', 'public')));
app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.get('/play/health', (req, res) => res.json({ status: 'ok', games: games.list().length }));

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);
  socket.emit('games:list', games.list());

  // ─── Create Room ───
  socket.on('room:create', ({ name }, cb) => {
    if (!name || name.length > 20) return cb?.({ error: 'Invalid name' });
    const room = rooms.createRoom(socket, name.trim());
    console.log(`Room ${room.code} created by ${name}`);
    cb?.({ code: room.code, players: rooms.serializePlayers(room) });
  });

  // ─── Join Room ───
  socket.on('room:join', ({ code, name }, cb) => {
    if (!name || name.length > 20) return cb?.({ error: 'Invalid name' });
    if (!code) return cb?.({ error: 'Invalid code' });
    code = code.toUpperCase().trim();

    const result = rooms.joinRoom(socket, code, name.trim());
    if (result.error) return cb?.({ error: result.error });

    const room = result.room;
    console.log(`${name} joined room ${code}`);
    cb?.({ code: room.code, players: rooms.serializePlayers(room) });
    socket.to(code).emit('room:playerJoined', {
      players: rooms.serializePlayers(room),
      newPlayer: name.trim()
    });
  });

  // ─── Rejoin Room (auto-reconnect after disconnect) ───
  socket.on('room:rejoin', ({ code, name }, cb) => {
    if (!name || !code) return cb?.({ error: 'Invalid rejoin data' });
    code = code.toUpperCase().trim();

    const result = rooms.rejoinRoom(socket, code, name.trim());
    if (result.error) return cb?.({ error: result.error });

    const room = result.room;
    const isHost = room.host === socket.id;

    if (result.rejoined) {
      console.log(`${name} rejoined room ${code}`);
    } else {
      console.log(`${name} joined room ${code} (fresh)`);
    }

    // Send full room state back to the reconnected player
    const response = {
      code: room.code,
      players: rooms.serializePlayers(room),
      rejoined: !!result.rejoined,
      isHost,
      roomState: room.state // lobby | playing | results
    };

    // If game is in progress, send current game info
    if (room.state === 'playing' && room.currentGame) {
      response.gameId = room.currentGame.id;
      response.gameName = room.currentGame.name;
    }

    cb?.(response);

    // Notify others
    socket.to(code).emit('room:playerRejoined', {
      players: rooms.serializePlayers(room),
      playerName: name.trim()
    });
  });

  // ─── Add Bot ───
  socket.on('room:addBot', (_, cb) => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (room.host !== socket.id) return cb?.({ error: 'Only host can add bots' });
    if (room.players.size >= 20) return cb?.({ error: 'Room is full' });
    if (room.state !== 'lobby') return cb?.({ error: 'Can only add bots in lobby' });

    const { id, bot } = bots.createBot(room);
    console.log(`Bot ${bot.name} (${bot.difficulty}) added to room ${room.code}`);
    io.to(room.code).emit('room:playerJoined', {
      players: rooms.serializePlayers(room),
      newPlayer: `${bot.diffEmoji} ${bot.name}`
    });
    cb?.({ ok: true });
  });

  // ─── Remove Bot ───
  socket.on('room:removeBot', ({ botId }, cb) => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (room.host !== socket.id) return cb?.({ error: 'Only host can remove bots' });

    if (bots.removeBot(room, botId)) {
      io.to(room.code).emit('room:playerLeft', { players: rooms.serializePlayers(room) });
      cb?.({ ok: true });
    } else {
      cb?.({ error: 'Bot not found' });
    }
  });

  // ─── Start Game ───
  socket.on('room:startGame', ({ gameId }, cb) => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    if (room.host !== socket.id) return cb?.({ error: 'Only host can start' });
    if (room.players.size < 2) return cb?.({ error: 'Need at least 2 players' });

    const game = games.get(gameId);
    if (!game) return cb?.({ error: 'Unknown game' });

    rooms.resetScores(room);
    room.state = 'playing';
    room.currentGame = game;

    console.log(`Room ${room.code}: starting ${game.name}`);
    io.to(room.code).emit('game:start', {
      gameId: game.id,
      gameName: game.name,
      players: rooms.serializePlayers(room)
    });

    setTimeout(() => {
      game.init(room, io);
      bots.scheduleBotActions(room, io);
    }, 500);
    cb?.({ ok: true });
  });

  // ─── Game Events ───
  socket.on('game:event', ({ event, data }) => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room || room.state !== 'playing' || !room.currentGame) return;
    room.currentGame.onEvent(room, socket, event, data, io);
  });

  // ─── Back to Lobby ───
  socket.on('room:backToLobby', () => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return;
    if (room.host !== socket.id) return;

    bots.clearBotTimers(room);
    if (room.currentGame?.cleanup) room.currentGame.cleanup(room);
    room.state = 'lobby';
    room.currentGame = null;
    room.gameState = null;
    rooms.resetScores(room);

    io.to(room.code).emit('room:lobby', { players: rooms.serializePlayers(room) });
  });

  // ─── Disconnect (with grace period) ───
  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const result = rooms.disconnectPlayer(socket.id);

    if (result && result.gracePeriod) {
      // Player is in grace period — notify others they're "away"
      io.to(result.code).emit('room:playerAway', {
        players: rooms.serializePlayers(result.room),
        playerName: result.room.players.get(socket.id)?.name
      });

      // Set up the finalize callback after grace period
      // (rooms.js handles the timer, but we need to emit events when it fires)
      const checkFinalize = setInterval(() => {
        const room = rooms.getRoom(result.code);
        // If player was removed (grace expired) or rejoined, stop checking
        if (!room || !room.players.has(socket.id)) {
          clearInterval(checkFinalize);
          if (room) {
            io.to(result.code).emit('room:playerLeft', {
              players: rooms.serializePlayers(room)
            });
            // Check if game should end
            const humanCount = Array.from(room.players.values()).filter(p => !p.isBot && !p.disconnected).length;
            if (room.state === 'playing' && humanCount < 1) {
              bots.clearBotTimers(room);
              if (room.currentGame?.cleanup) room.currentGame.cleanup(room);
              room.state = 'lobby';
              room.currentGame = null;
              io.to(result.code).emit('room:lobby', {
                players: rooms.serializePlayers(room),
                message: 'Game ended — not enough players'
              });
            }
          }
          return;
        }
        // If player reconnected (no longer disconnected), stop
        if (!room.players.get(socket.id)?.disconnected) {
          clearInterval(checkFinalize);
        }
      }, 5000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 Mini Games Platform running on port ${PORT}`);
  console.log(`  Games loaded: ${games.list().map(g => g.name).join(', ')}\n`);
});
