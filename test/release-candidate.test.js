'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { io: createClient } = require('socket.io-client');
const rooms = require('../server/rooms');
const runtime = require('../server/server');
const emoji = require('../server/games/emoji-match');
const geography = require('../server/games/geography-quiz');
const hangman = require('../server/games/hangman');
const scramble = require('../server/games/word-scramble');
const { makeIo, makeRoom, cleanup } = require('./helpers/game-fixtures');

const emitAck = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));
async function connect(url) {
  const socket = createClient(url, { path: '/minigames-ws/', transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}

test('actual Socket.IO mid-game reconnect migrates state, reports per-player snapshot, presence, and server RTT', async t => {
  await new Promise(resolve => runtime.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { rooms._resetForTests(); await new Promise(resolve => runtime.io.close(resolve)); });
  const url = `http://127.0.0.1:${runtime.server.address().port}`;
  const host = await connect(url), guest = await connect(url);
  t.after(() => { host.disconnect(); guest.disconnect(); });
  const created = await emitAck(host, 'room:create', { name: 'Alice' });
  const joined = await emitAck(guest, 'room:join', { code: created.code, name: 'Bob' });
  assert.equal((await emitAck(host, 'room:startGame', { gameId: 'tap-frenzy' })).ok, true);
  await new Promise(resolve => setTimeout(resolve, 550));
  const room = rooms.getRoom(created.code);
  room.gameState.phase = 'tapping';
  room.gameState.deadlineAt = room._gameNow?.() + 8000 || 1e15;
  room.gameState.taps.set(guest.id, 4);
  room.gameState.limits.set(guest.id, { tokens: 2, last: 1 });
  const oldId = guest.id;
  const presence = [];
  room.currentGame.onPresenceChanged = (_room, _io, playerId, present) => presence.push({ playerId, present });

  const nonce = '0123456789abcdef';
  const ackSeen = new Promise(resolve => guest.once('network:probeAck', resolve));
  assert.equal((await emitAck(guest, 'network:probe', { nonce })).ok, true);
  assert.equal((await ackSeen).nonce, nonce);
  assert.equal((await emitAck(guest, 'network:probeReturn', { nonce })).ok, true);
  assert.ok(room.latencyByPlayer.get(oldId).minRttMs >= 0 && room.latencyByPlayer.get(oldId).minRttMs <= 150);

  guest.disconnect();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(presence.at(-1), { playerId: joined.playerId, present: false });
  const replacement = await connect(url);
  t.after(() => replacement.disconnect());
  const rejoined = await emitAck(replacement, 'room:rejoin', { code: created.code, playerId: joined.playerId, reconnectToken: joined.reconnectToken });
  assert.equal(rejoined.ok, true);
  assert.equal(rejoined.gameState.count, 4);
  assert.equal(rejoined.gameState.roundId, room.gameState.roundId);
  assert.equal(room.gameState.taps.has(oldId), false);
  assert.equal(room.gameState.limits.has(oldId), false);
  assert.equal(room.latencyByPlayer.has(oldId), false);
  assert.equal(room.gameState.taps.get(replacement.id), 4);
  assert.deepEqual(presence.at(-1), { playerId: joined.playerId, present: true });
});

test('critical browser clients emit numeric math answers and mandatory current round IDs', () => {
  const root = `${__dirname}/../public/js/games`;
  const math = fs.readFileSync(`${root}/math-blitz.js`, 'utf8');
  const reaction = fs.readFileSync(`${root}/reaction-race.js`, 'utf8');
  const taps = fs.readFileSync(`${root}/tap-frenzy.js`, 'utf8');
  const racer = fs.readFileSync(`${root}/type-racer.js`, 'utf8');
  assert.match(math, /answer: Number\(val\)/);
  assert.match(reaction, /roundId:this\.roundId/);
  assert.match(taps, /roundId: this\.roundId/);
  assert.match(racer, /typed: input\.value, roundId: this\.roundId/);
  assert.match(racer, /typed, roundId: this\.roundId/);
  assert.doesNotMatch(racer, /data: \{ typed, elapsed/);
});

test('Emoji Match cancels old deadline and stale turn epoch cannot advance a re-armed same-player turn', () => {
  const room = makeRoom(), io = makeIo();
  const originalSetTimeout = global.setTimeout, originalClearTimeout = global.clearTimeout;
  const callbacks = new Map(); let id = 0;
  global.setTimeout = fn => { callbacks.set(++id, fn); return id; };
  global.clearTimeout = handle => callbacks.delete(handle);
  try {
    emoji.init(room, io);
    const gs = room.gameState;
    const firstTimer = gs.turnTimer;
    const player = gs.currentTurn;
    emoji._armTurn(room, io);
    const secondTimer = gs.turnTimer;
    assert.notEqual(firstTimer, secondTimer);
    assert.equal(callbacks.has(firstTimer), false);
    // Simulate a stale callback retained by an adversarial timer queue.
    const epoch = gs.turnEpoch;
    gs.turnEpoch = epoch + 1;
    const currentIndex = gs.turnIndex;
    callbacks.get(secondTimer)();
    assert.equal(gs.currentTurn, player);
    assert.equal(gs.turnIndex, currentIndex);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    cleanup(emoji, room);
  }
});

test('Geography, Hangman, and Word Scramble reconnect timeLimit uses live seconds', () => {
  const now = Date.now;
  try {
    Date.now = () => 105000;
    const room = makeRoom();
    room.gameState = { phase: 'question', round: 1, totalRounds: 1, questions: [{ q: 'Q', options: [] }], questionStart: 100000 };
    assert.ok(geography.getReconnectState(room, 'p1').timeLimit <= 15);
    room.gameState = { phase: 'playing', round: 1, totalRounds: 1, blanks: [], correctLetters: [], wrongLetters: [], hint: '', roundStart: 100000 };
    assert.ok(hangman.getReconnectState(room, 'p1').timeLimit <= 60);
    room.gameState = { phase: 'scrambled', round: 1, totalRounds: 1, words: ['test'], scrambled: 'tset', solvers: [], roundStart: 100000 };
    assert.ok(scramble.getReconnectState(room, 'p1').timeLimit <= 15);
  } finally { Date.now = now; }
});
