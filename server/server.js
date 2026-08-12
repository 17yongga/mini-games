'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { monitorEventLoopDelay, performance } = require('perf_hooks');
const { Server } = require('socket.io');
const rooms = require('./rooms');
const games = require('./games');
const bots = require('./bots');
const contracts = require('./contracts');

const PORT = process.env.PORT || 3004;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  path: '/minigames-ws/',
  pingInterval: 10000,
  pingTimeout: 30000,
  connectTimeout: 20000,
  maxHttpBufferSize: 16 * 1024,
});
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();
const counters = { accepted: 0, rejected: 0, internalErrors: 0, reconnectSuccess: 0, reconnectFailure: 0 };
const EVENT_WINDOW_MS = 10_000;
const MAX_EVENTS_PER_WINDOW = 120;

const htmlNoCache = (res, filePath) => {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};
app.use('/play', express.static(path.join(__dirname, '..', 'public'), { setHeaders: htmlNoCache }));
app.get('/play', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.get('/play/health', (req, res) => {
  const roomMetrics = rooms.getMetrics();
  const eventLoop = sampleEventLoopDelay();
  res.json({
    status: 'ok',
    games: games.list().length,
    sockets: io.engine.clientsCount,
    ...roomMetrics,
    events: { ...counters },
    eventLoop,
  });
});

function responseError(code, message) {
  return { ok: false, code, error: message, message };
}

function responseOk(data = {}) {
  return { ok: true, ...data };
}

function safeCallback(cb, payload) {
  if (typeof cb !== 'function') return;
  try {
    cb(payload);
  } catch (error) {
    counters.internalErrors++;
    console.error(JSON.stringify({ level: 'error', event: 'socket.callback', error: error.message }));
  }
}

function sampleEventLoopDelay(histogram = eventLoopDelay) {
  const sample = {
    delayMeanMs: Number((histogram.mean / 1e6).toFixed(2)) || 0,
    delayMaxMs: Number((histogram.max / 1e6).toFixed(2)) || 0,
  };
  histogram.reset();
  return sample;
}

function consumeEventBudget(socket, now = Date.now()) {
  const budget = socket.data.eventBudget || (socket.data.eventBudget = { startedAt: now, count: 0 });
  if (now - budget.startedAt >= EVENT_WINDOW_MS) {
    budget.startedAt = now;
    budget.count = 0;
  }
  budget.count++;
  return budget.count <= MAX_EVENTS_PER_WINDOW;
}

function register(socket, event, handler, { acknowledge = true } = {}) {
  socket.on(event, (payload, cb) => {
    if (typeof payload === 'function' && cb === undefined) {
      cb = payload;
      payload = undefined;
    }
    if (!consumeEventBudget(socket)) {
      counters.rejected++;
      return safeCallback(cb, responseError('RATE_LIMITED', 'Too many events; retry shortly'));
    }
    if (!contracts.validate(event, payload)) {
      counters.rejected++;
      return safeCallback(cb, responseError('INVALID_PAYLOAD', `Invalid ${event} payload`));
    }
    try {
      const result = handler(payload, cb);
      counters.accepted++;
      if (acknowledge && result !== undefined) safeCallback(cb, result);
    } catch (error) {
      counters.internalErrors++;
      const correlationId = crypto.randomBytes(6).toString('hex');
      console.error(JSON.stringify({ level: 'error', event, correlationId, error: error.message }));
      safeCallback(cb, responseError('INTERNAL_ERROR', `Request failed (${correlationId})`));
    }
  });
}

function identityResponse(result) {
  return responseOk({
    code: result.room.code,
    players: rooms.serializePlayers(result.room),
    playerId: result.playerId,
    reconnectToken: result.reconnectToken,
  });
}

io.on('connection', (socket) => {
  socket.data.networkProbes = new Map();
  socket.emit('games:list', games.list());

  register(socket, 'network:probe', ({ nonce }) => {
    socket.data.networkProbes.set(nonce, performance.now());
    if (socket.data.networkProbes.size > 8) socket.data.networkProbes.delete(socket.data.networkProbes.keys().next().value);
    socket.emit('network:probeAck', { nonce });
    return responseOk();
  });

  register(socket, 'network:probeReturn', ({ nonce }) => {
    const startedAt = socket.data.networkProbes.get(nonce);
    socket.data.networkProbes.delete(nonce);
    if (!Number.isFinite(startedAt)) return responseError('UNKNOWN_PROBE', 'Unknown or expired probe');
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return responseError('NOT_IN_ROOM', 'Not in a room');
    const measured = Math.max(0, Math.min(150, performance.now() - startedAt));
    const previous = room.latencyByPlayer.get(socket.id);
    room.latencyByPlayer.set(socket.id, {
      minRttMs: previous ? Math.min(previous.minRttMs, measured) : measured,
      jitterMs: previous ? Math.min(150, Math.abs(measured - previous.lastRttMs)) : 0,
      lastRttMs: measured,
    });
    return responseOk({ rttMs: measured });
  });

  register(socket, 'room:create', ({ name }) => {
    const result = rooms.createRoom(socket, name.trim());
    if (result.error) return responseError(result.code || 'ALREADY_IN_ROOM', result.error);
    return identityResponse(result);
  });

  register(socket, 'room:join', ({ code, name }) => {
    const normalizedCode = code.toUpperCase().trim();
    const result = rooms.joinRoom(socket, normalizedCode, name.trim());
    if (result.error) return responseError('JOIN_REJECTED', result.error);
    socket.to(normalizedCode).emit('room:playerJoined', {
      players: rooms.serializePlayers(result.room), newPlayer: name.trim(),
    });
    return identityResponse(result);
  });

  register(socket, 'room:rejoin', ({ code, playerId, reconnectToken }) => {
    const normalizedCode = code.toUpperCase().trim();
    const result = rooms.rejoinRoom(socket, normalizedCode, playerId, reconnectToken);
    if (result.error) {
      counters.reconnectFailure++;
      return responseError(result.code || 'REJOIN_REJECTED', result.error);
    }
    counters.reconnectSuccess++;
    const room = result.room;
    const response = responseOk({
      code: room.code,
      players: rooms.serializePlayers(room),
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      rejoined: true,
      isHost: room.host === socket.id,
      roomState: room.state,
      roomEpoch: room.roomEpoch,
      gameInstanceId: room.gameInstanceId,
    });
    if (room.state === 'playing' && room.currentGame) {
      response.gameId = room.currentGame.id;
      response.gameName = room.currentGame.name;
      if (room.currentGame.getReconnectState) {
        response.gameState = room.currentGame.getReconnectState(room, socket.id);
      }
    }
    socket.to(normalizedCode).emit('room:playerRejoined', {
      players: rooms.serializePlayers(room), playerName: room.players.get(socket.id)?.name,
    });
    safelyNotifyPresence(room, result.playerId, true);
    return response;
  });

  register(socket, 'room:addBot', () => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return responseError('NOT_IN_ROOM', 'Not in a room');
    if (room.host !== socket.id) return responseError('FORBIDDEN', 'Only host can add bots');
    if (room.players.size >= 20) return responseError('ROOM_FULL', 'Room is full');
    if (room.state !== 'lobby') return responseError('INVALID_STATE', 'Can only add bots in lobby');
    const { bot } = bots.createBot(room);
    rooms.touch(room);
    io.to(room.code).emit('room:playerJoined', {
      players: rooms.serializePlayers(room), newPlayer: `${bot.diffEmoji} ${bot.name}`,
    });
    return responseOk();
  });

  register(socket, 'room:removeBot', ({ botId }) => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return responseError('NOT_IN_ROOM', 'Not in a room');
    if (room.host !== socket.id) return responseError('FORBIDDEN', 'Only host can remove bots');
    if (!bots.removeBot(room, botId)) return responseError('BOT_NOT_FOUND', 'Bot not found');
    rooms.touch(room);
    io.to(room.code).emit('room:playerLeft', { players: rooms.serializePlayers(room) });
    return responseOk();
  });

  register(socket, 'room:startGame', ({ gameId }) => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return responseError('NOT_IN_ROOM', 'Not in a room');
    if (room.host !== socket.id) return responseError('FORBIDDEN', 'Only host can start');
    if (room.state !== 'lobby') return responseError('INVALID_STATE', 'Game already started');
    const game = games.get(gameId);
    if (!game) return responseError('UNKNOWN_GAME', 'Unknown game');
    if (room.players.size < game.minPlayers) return responseError('TOO_FEW_PLAYERS', `Need at least ${game.minPlayers} players`);
    if (room.players.size > game.maxPlayers) return responseError('TOO_MANY_PLAYERS', `Maximum ${game.maxPlayers} players`);

    rooms.resetScores(room);
    room.roomEpoch++;
    room.gameInstanceId = crypto.randomUUID();
    room.state = 'playing';
    room.currentGame = game;
    const epoch = room.roomEpoch;
    const instanceId = room.gameInstanceId;
    io.to(room.code).emit('game:start', {
      gameId: game.id, gameName: game.name, players: rooms.serializePlayers(room),
      roomEpoch: epoch, gameInstanceId: instanceId,
    });
    room.timerRegistry.timeout(() => {
      if (room.roomEpoch !== epoch || room.gameInstanceId !== instanceId || room.state !== 'playing') return;
      game.init(room, io);
      bots.scheduleBotActions(room, io);
    }, 500, 'game-start');
    return responseOk({ roomEpoch: epoch, gameInstanceId: instanceId });
  });

  register(socket, 'game:event', ({ event, data }) => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room || room.state !== 'playing' || !room.currentGame) return responseError('INVALID_STATE', 'No active game');
    rooms.touch(room);
    const action = room.currentGame.onEvent(room, socket, event, data, io);
    if (action?.ok === false) return responseError(action.code || 'ACTION_REJECTED', action.code || 'Action rejected');
    return responseOk({ roomEpoch: room.roomEpoch, gameInstanceId: room.gameInstanceId });
  });

  register(socket, 'room:backToLobby', () => {
    const room = rooms.getRoomBySocket(socket.id);
    if (!room) return responseError('NOT_IN_ROOM', 'Not in a room');
    if (room.host !== socket.id) return responseError('FORBIDDEN', 'Only host can return to lobby');
    disposeGame(room);
    room.roomEpoch++;
    room.state = 'lobby';
    room.currentGame = null;
    room.gameState = null;
    room.gameInstanceId = null;
    rooms.resetScores(room);
    io.to(room.code).emit('room:lobby', { players: rooms.serializePlayers(room), roomEpoch: room.roomEpoch });
    return responseOk({ roomEpoch: room.roomEpoch });
  });

  socket.on('disconnect', () => {
    const result = rooms.disconnectPlayer(socket.id, finalized => {
      if (!finalized.room) return;
      safelyNotifyPresence(finalized.room, finalized.playerId, false);
      io.to(finalized.code).emit('room:playerLeft', { players: rooms.serializePlayers(finalized.room) });
      const humans = [...finalized.room.players.values()].filter(p => !p.isBot && !p.disconnected);
      if (finalized.room.state === 'playing' && humans.length < 1) {
        disposeGame(finalized.room);
        finalized.room.roomEpoch++;
        finalized.room.state = 'lobby';
        finalized.room.currentGame = null;
        finalized.room.gameState = null;
        finalized.room.gameInstanceId = null;
        io.to(finalized.code).emit('room:lobby', {
          players: rooms.serializePlayers(finalized.room), message: 'Game ended — not enough players',
        });
      }
    });
    if (result?.gracePeriod) {
      safelyNotifyPresence(result.room, result.room.players.get(socket.id)?.playerId, false);
      io.to(result.code).emit('room:playerAway', {
        players: rooms.serializePlayers(result.room), playerName: result.playerName,
      });
    }
  });
});

function disposeGame(room) {
  room.timerRegistry?.cancelGroup('game-start');
  bots.clearBotTimers(room);
  room.currentGame?.cleanup?.(room);
}

function safelyNotifyPresence(room, playerId, present) {
  if (room?.state !== 'playing' || !room.currentGame?.onPresenceChanged) return;
  try { room.currentGame.onPresenceChanged(room, io, playerId, present); }
  catch (error) {
    counters.internalErrors++;
    console.error(JSON.stringify({ level: 'error', event: 'game.presence', error: error.message }));
  }
}
rooms.configure({
  disposeRoom: room => disposeGame(room),
  timerError(error, context) {
    counters.internalErrors++;
    console.error(JSON.stringify({ level: 'error', event: 'timer.callback', ...context, error: error.message }));
  },
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Mini Games Platform running on port ${PORT}`));
}

module.exports = {
  app, server, io, counters, responseError, responseOk,
  sampleEventLoopDelay, consumeEventBudget, EVENT_WINDOW_MS, MAX_EVENTS_PER_WINDOW,
};
