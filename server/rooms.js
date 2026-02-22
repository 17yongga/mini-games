// Room management — create, join, leave, query
// Supports disconnect grace periods for mobile reconnection

const rooms = new Map();
const GRACE_PERIOD = 30000; // 30s to reconnect before removal
const graceTimers = new Map(); // socketId -> { timer, code, playerData }

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

function createRoom(hostSocket, hostName) {
  const code = generateCode();
  const room = {
    code,
    host: hostSocket.id,
    players: new Map(),
    state: 'lobby',
    currentGame: null,
    gameState: null,
    createdAt: Date.now()
  };
  room.players.set(hostSocket.id, { name: hostName, score: 0, isHost: true });
  rooms.set(code, room);
  hostSocket.join(code);
  return room;
}

function joinRoom(socket, code, name) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.players.size >= 20) return { error: 'Room is full' };

  // Check for duplicate names (skip if it's the same person reconnecting)
  for (const [id, p] of room.players) {
    if (p.name.toLowerCase() === name.toLowerCase() && !p.disconnected) {
      return { error: 'Name already taken' };
    }
  }

  room.players.set(socket.id, { name, score: 0, isHost: false });
  socket.join(code);
  return { room };
}

// Rejoin: player reconnects with same name to same room
function rejoinRoom(socket, code, name) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };

  // Find disconnected player with same name
  let oldId = null;
  let oldPlayer = null;
  for (const [id, p] of room.players) {
    if (p.name.toLowerCase() === name.toLowerCase() && p.disconnected) {
      oldId = id;
      oldPlayer = p;
      break;
    }
  }

  if (oldPlayer) {
    // Cancel the grace timer
    const grace = graceTimers.get(oldId);
    if (grace) {
      clearTimeout(grace.timer);
      graceTimers.delete(oldId);
    }

    // Transfer player data to new socket id
    room.players.delete(oldId);
    oldPlayer.disconnected = false;
    room.players.set(socket.id, oldPlayer);

    // If they were host, update host reference
    if (room.host === oldId) {
      room.host = socket.id;
    }

    // Update turn references in game state if mid-game
    if (room.gameState) {
      const gs = room.gameState;
      if (gs.currentTurn === oldId) gs.currentTurn = socket.id;
      if (gs.turnOrder) {
        const idx = gs.turnOrder.indexOf(oldId);
        if (idx !== -1) gs.turnOrder[idx] = socket.id;
      }
      // Fix tapped/answers sets/maps that reference old id
      if (gs.tapped instanceof Set && gs.tapped.has(oldId)) {
        gs.tapped.delete(oldId);
        gs.tapped.add(socket.id);
      }
      if (gs.earlyTappers instanceof Set && gs.earlyTappers.has(oldId)) {
        gs.earlyTappers.delete(oldId);
        gs.earlyTappers.add(socket.id);
      }
      if (gs.answers instanceof Map && gs.answers.has(oldId)) {
        gs.answers.set(socket.id, gs.answers.get(oldId));
        gs.answers.delete(oldId);
      }
      if (gs.taps instanceof Map && gs.taps.has(oldId)) {
        gs.taps.set(socket.id, gs.taps.get(oldId));
        gs.taps.delete(oldId);
      }
      if (gs.pairsFound instanceof Map && gs.pairsFound.has(oldId)) {
        gs.pairsFound.set(socket.id, gs.pairsFound.get(oldId));
        gs.pairsFound.delete(oldId);
      }
    }

    socket.join(code);
    return { room, rejoined: true };
  }

  // No disconnected player with that name — try normal join
  if (room.state === 'playing') return { error: 'Game in progress' };
  return joinRoom(socket, code, name);
}

// Mark player as disconnected instead of removing immediately
function disconnectPlayer(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.has(socketId)) {
      const player = room.players.get(socketId);

      // Bots don't disconnect
      if (player.isBot) continue;

      // Mark as disconnected, start grace timer
      player.disconnected = true;

      const timer = setTimeout(() => {
        graceTimers.delete(socketId);
        finalizeLeave(socketId, code);
      }, GRACE_PERIOD);

      graceTimers.set(socketId, { timer, code, playerData: player });

      return { code, room, gracePeriod: true };
    }
  }
  return null;
}

// Actually remove player after grace period expires
function finalizeLeave(socketId, code) {
  const room = rooms.get(code);
  if (!room || !room.players.has(socketId)) return null;

  const player = room.players.get(socketId);
  // Only remove if still disconnected (didn't rejoin)
  if (!player.disconnected) return null;

  room.players.delete(socketId);

  if (room.host === socketId) {
    // Find next non-bot human player to promote
    let promoted = false;
    for (const [id, p] of room.players) {
      if (!p.isBot) {
        room.host = id;
        p.isHost = true;
        promoted = true;
        break;
      }
    }
    if (!promoted) {
      // No humans left, close room
      rooms.delete(code);
      return { code, closed: true };
    }
  }

  if (room.players.size === 0) {
    rooms.delete(code);
    return { code, closed: true };
  }

  return { code, room };
}

// Legacy immediate leave (for explicit leave, not disconnect)
function leaveRoom(socketId) {
  // Cancel any grace timer
  const grace = graceTimers.get(socketId);
  if (grace) {
    clearTimeout(grace.timer);
    graceTimers.delete(socketId);
  }

  for (const [code, room] of rooms) {
    if (room.players.has(socketId)) {
      room.players.delete(socketId);
      if (room.host === socketId) {
        let promoted = false;
        for (const [id, p] of room.players) {
          if (!p.isBot) {
            room.host = id;
            p.isHost = true;
            promoted = true;
            break;
          }
        }
        if (!promoted) {
          rooms.delete(code);
          return { code, closed: true };
        }
      }
      if (room.players.size === 0) {
        rooms.delete(code);
        return { code, closed: true };
      }
      return { code, room };
    }
  }
  return null;
}

function getRoom(code) {
  return rooms.get(code) || null;
}

function getRoomBySocket(socketId) {
  for (const [, room] of rooms) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

function serializePlayers(room) {
  const list = [];
  for (const [id, p] of room.players) {
    list.push({
      id, name: p.name, score: p.score, isHost: p.isHost,
      isBot: !!p.isBot, difficulty: p.difficulty || null,
      diffEmoji: p.diffEmoji || null,
      disconnected: !!p.disconnected
    });
  }
  return list;
}

function resetScores(room) {
  for (const [, p] of room.players) p.score = 0;
}

// Clean up stale rooms (>2 hours)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) rooms.delete(code);
  }
}, 60 * 1000);

module.exports = {
  createRoom, joinRoom, rejoinRoom, leaveRoom, disconnectPlayer, finalizeLeave,
  getRoom, getRoomBySocket, serializePlayers, resetScores
};
