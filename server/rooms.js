'use strict';

const crypto = require('crypto');
const { TimerRegistry } = require('./timer-registry');

const roomStore = new Map();
const socketMembership = new Map();
const GRACE_PERIOD = 30000;
const INACTIVE_ROOM_TTL = 2 * 60 * 60 * 1000;
const graceTimers = new Map();
let lifecycleHooks = {};

function configure(hooks = {}) {
  lifecycleHooks = { ...hooks };
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
  } while (roomStore.has(code));
  return code;
}

function issueIdentity() {
  const playerId = crypto.randomBytes(16).toString('hex');
  const reconnectToken = crypto.randomBytes(32).toString('base64url');
  return { playerId, reconnectToken, reconnectTokenHash: hashToken(reconnectToken) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest();
}

function tokenMatches(token, hash) {
  if (typeof token !== 'string' || !Buffer.isBuffer(hash)) return false;
  const candidate = hashToken(token);
  return candidate.length === hash.length && crypto.timingSafeEqual(candidate, hash);
}

function makePlayer(name, isHost) {
  const identity = issueIdentity();
  return {
    player: {
      name,
      score: 0,
      isHost,
      playerId: identity.playerId,
      reconnectTokenHash: identity.reconnectTokenHash,
    },
    reconnectToken: identity.reconnectToken,
  };
}

function touch(room) {
  room.lastActivityAt = Date.now();
}

function attachSocket(socket, room, playerKey) {
  if (socketMembership.has(socket.id)) return false;
  socketMembership.set(socket.id, { code: room.code, playerKey });
  socket.join(room.code);
  touch(room);
  return true;
}

function createRoom(hostSocket, hostName) {
  if (socketMembership.has(hostSocket.id)) return { error: 'Already in a room' };
  const code = generateCode();
  const identity = makePlayer(hostName, true);
  const room = {
    code,
    host: hostSocket.id,
    players: new Map([[hostSocket.id, identity.player]]),
    state: 'lobby',
    currentGame: null,
    gameState: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    roomEpoch: 1,
    gameInstanceId: null,
  };
  room.timerRegistry = new TimerRegistry(() => roomStore.get(code) === room);
  roomStore.set(code, room);
  attachSocket(hostSocket, room, hostSocket.id);
  return { room, playerId: identity.player.playerId, reconnectToken: identity.reconnectToken };
}

function joinRoom(socket, code, name) {
  if (socketMembership.has(socket.id)) return { error: 'Already in a room' };
  const room = roomStore.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'lobby') return { error: 'Game in progress' };
  if (room.players.size >= 20) return { error: 'Room is full' };
  for (const p of room.players.values()) {
    if (p.name.toLowerCase() === name.toLowerCase()) return { error: 'Name already taken' };
  }

  const identity = makePlayer(name, false);
  room.players.set(socket.id, identity.player);
  attachSocket(socket, room, socket.id);
  return { room, playerId: identity.player.playerId, reconnectToken: identity.reconnectToken };
}

function migrateIdentity(value, oldId, newId, seen = new WeakSet()) {
  if (value === oldId) return newId;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (value instanceof Map) {
    const entries = [];
    for (const [key, item] of value) {
      entries.push([migrateIdentity(key, oldId, newId, seen), migrateIdentity(item, oldId, newId, seen)]);
    }
    value.clear();
    for (const entry of entries) value.set(entry[0], entry[1]);
    return value;
  }
  if (value instanceof Set) {
    const entries = [...value].map(item => migrateIdentity(item, oldId, newId, seen));
    value.clear();
    for (const item of entries) value.add(item);
    return value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = migrateIdentity(value[i], oldId, newId, seen);
    return value;
  }
  if (Buffer.isBuffer(value) || value instanceof Date) return value;
  for (const key of Object.keys(value)) value[key] = migrateIdentity(value[key], oldId, newId, seen);
  return value;
}

function rejoinRoom(socket, code, playerId, reconnectToken) {
  if (socketMembership.has(socket.id)) return { error: 'Already in a room', code: 'ALREADY_IN_ROOM' };
  const room = roomStore.get(code);
  if (!room) return { error: 'Room not found', code: 'ROOM_NOT_FOUND' };

  let oldId;
  let player;
  for (const [id, candidate] of room.players) {
    if (candidate.playerId === playerId) {
      oldId = id;
      player = candidate;
      break;
    }
  }
  if (!player || !player.disconnected || !tokenMatches(reconnectToken, player.reconnectTokenHash)) {
    return { error: 'Invalid reconnect token', code: 'REJOIN_TOKEN_INVALID' };
  }

  const grace = graceTimers.get(oldId);
  if (grace) {
    room.timerRegistry.cancel(grace.timer);
    graceTimers.delete(oldId);
  }

  const nextToken = crypto.randomBytes(32).toString('base64url');
  player.reconnectTokenHash = hashToken(nextToken);
  player.disconnected = false;
  room.players.delete(oldId);
  room.players.set(socket.id, player);
  if (room.host === oldId) room.host = socket.id;
  if (room.gameState) migrateIdentity(room.gameState, oldId, socket.id);
  attachSocket(socket, room, socket.id);
  touch(room);
  return { room, rejoined: true, playerId, reconnectToken: nextToken };
}

function disconnectPlayer(socketId, onFinalize) {
  const membership = socketMembership.get(socketId);
  socketMembership.delete(socketId);
  if (!membership) return null;
  const room = roomStore.get(membership.code);
  const player = room?.players.get(membership.playerKey);
  if (!room || !player || player.isBot) return null;

  player.disconnected = true;
  touch(room);
  const timer = room.timerRegistry.timeout(() => {
    graceTimers.delete(socketId);
    const result = finalizeLeave(socketId, room.code);
    if (result) onFinalize?.(result);
  }, GRACE_PERIOD, 'grace');
  graceTimers.set(socketId, { timer, code: room.code });
  return { code: room.code, room, gracePeriod: true, playerName: player.name };
}

function promoteHost(room, departedId) {
  if (room.host !== departedId) return;
  for (const [id, player] of room.players) {
    if (!player.isBot) {
      room.host = id;
      player.isHost = true;
      return;
    }
  }
  room.host = null;
}

function finalizeLeave(socketId, code) {
  const room = roomStore.get(code);
  const player = room?.players.get(socketId);
  if (!room || !player || !player.disconnected) return null;
  room.players.delete(socketId);
  promoteHost(room, socketId);
  touch(room);
  const humans = [...room.players.values()].filter(p => !p.isBot);
  if (humans.length === 0) {
    destroyRoom(room, 'no-humans');
    return { code, closed: true, reason: 'no-humans' };
  }
  return { code, room, playerName: player.name };
}

function leaveRoom(socketId) {
  const membership = socketMembership.get(socketId);
  socketMembership.delete(socketId);
  if (!membership) return null;
  const room = roomStore.get(membership.code);
  if (!room) return null;
  const player = room.players.get(membership.playerKey);
  room.players.delete(membership.playerKey);
  promoteHost(room, membership.playerKey);
  if (![...room.players.values()].some(p => !p.isBot)) {
    destroyRoom(room, 'no-humans');
    return { code: room.code, closed: true };
  }
  touch(room);
  return { code: room.code, room, playerName: player?.name };
}

function destroyRoom(roomOrCode, reason = 'destroyed') {
  const room = typeof roomOrCode === 'string' ? roomStore.get(roomOrCode) : roomOrCode;
  if (!room || roomStore.get(room.code) !== room) return false;
  room.roomEpoch++;
  room.timerRegistry?.cancelAll();
  for (const [socketId, membership] of socketMembership) {
    if (membership.code === room.code) socketMembership.delete(socketId);
  }
  for (const [socketId, grace] of graceTimers) {
    if (grace.code === room.code) graceTimers.delete(socketId);
  }
  lifecycleHooks.disposeRoom?.(room, reason);
  roomStore.delete(room.code);
  return true;
}

function getRoom(code) {
  return roomStore.get(code) || null;
}

function getRoomBySocket(socketId) {
  const membership = socketMembership.get(socketId);
  return membership ? getRoom(membership.code) : null;
}

function serializePlayers(room) {
  return [...room.players].map(([id, player]) => ({
    id,
    playerId: player.playerId || id,
    name: player.name,
    score: player.score,
    isHost: player.isHost,
    isBot: !!player.isBot,
    difficulty: player.difficulty || null,
    diffEmoji: player.diffEmoji || null,
    disconnected: !!player.disconnected,
  }));
}

function resetScores(room) {
  for (const player of room.players.values()) player.score = 0;
  touch(room);
}

function getMetrics() {
  const states = { lobby: 0, playing: 0, results: 0 };
  let players = 0;
  let timers = 0;
  for (const room of roomStore.values()) {
    states[room.state] = (states[room.state] || 0) + 1;
    players += room.players.size;
    timers += room.timerRegistry?.size || 0;
  }
  return { rooms: roomStore.size, players, roomStates: states, timers, graceSessions: graceTimers.size };
}

const sweepTimer = setInterval(() => {
  const cutoff = Date.now() - INACTIVE_ROOM_TTL;
  for (const room of roomStore.values()) {
    if (room.lastActivityAt < cutoff) destroyRoom(room, 'inactive');
  }
}, 60 * 1000);
sweepTimer.unref?.();

module.exports = {
  configure, createRoom, joinRoom, rejoinRoom, leaveRoom, disconnectPlayer, finalizeLeave,
  destroyRoom, getRoom, getRoomBySocket, serializePlayers, resetScores, migrateIdentity,
  touch, getMetrics, _resetForTests() {
    for (const room of [...roomStore.values()]) destroyRoom(room, 'test-reset');
  },
};
