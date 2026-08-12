'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rooms = require('../server/rooms');
const contracts = require('../server/contracts');
const { TimerRegistry } = require('../server/timer-registry');

function socket(id) {
  return { id, joined: [], join(code) { this.joined.push(code); } };
}

test.afterEach(() => rooms._resetForTests());

test('contracts reject malformed and oversized Socket.IO envelopes', () => {
  assert.equal(contracts.validate('room:create', null), false);
  assert.equal(contracts.validate('room:create', { name: 'Alice', extra: true }), false);
  assert.equal(contracts.validate('room:rejoin', { code: 'ABCD', playerId: 'x', reconnectToken: 'x' }), false);
  assert.equal(contracts.validate('game:event', { event: 'tap', data: [] }), false);
  assert.equal(contracts.validate('game:event', { event: 'tap', data: { text: 'x'.repeat(5000) } }), false);
  assert.equal(contracts.validate('game:event', { event: 'tap', data: {} }), true);
});

test('secure reconnect requires the token, rotates it, and preserves host identity', () => {
  const firstSocket = socket('socket-old');
  const created = rooms.createRoom(firstSocket, 'Alice');
  assert.ok(created.playerId);
  assert.equal(created.reconnectToken.length, 43);
  assert.equal(Object.prototype.hasOwnProperty.call(rooms.serializePlayers(created.room)[0], 'reconnectToken'), false);

  rooms.disconnectPlayer(firstSocket.id);
  const attacker = rooms.rejoinRoom(socket('attacker'), created.room.code, created.playerId, 'A'.repeat(43));
  assert.equal(attacker.code, 'REJOIN_TOKEN_INVALID');
  assert.equal(created.room.host, firstSocket.id);

  const rejoined = rooms.rejoinRoom(socket('socket-new'), created.room.code, created.playerId, created.reconnectToken);
  assert.equal(rejoined.rejoined, true);
  assert.notEqual(rejoined.reconnectToken, created.reconnectToken);
  assert.equal(created.room.host, 'socket-new');
  assert.equal(created.room.players.get('socket-new').isHost, true);

  rooms.disconnectPlayer('socket-new');
  const replay = rooms.rejoinRoom(socket('replay'), created.room.code, created.playerId, created.reconnectToken);
  assert.equal(replay.code, 'REJOIN_TOKEN_INVALID');
  const rotated = rooms.rejoinRoom(socket('socket-latest'), created.room.code, created.playerId, rejoined.reconnectToken);
  assert.equal(rotated.rejoined, true);
});

test('generic identity migration handles nested Map, Set, arrays and object values', () => {
  const state = {
    currentTurn: 'old',
    map: new Map([['old', { owner: 'old', nested: ['old'] }], ['other', 'old']]),
    set: new Set(['old', { id: 'old' }]),
    list: [{ id: 'old' }, ['old']],
  };
  state.self = state;
  rooms.migrateIdentity(state, 'old', 'new');
  assert.equal(state.currentTurn, 'new');
  assert.deepEqual(state.map.get('new'), { owner: 'new', nested: ['new'] });
  assert.equal(state.map.get('other'), 'new');
  assert.equal(state.set.has('new'), true);
  assert.equal([...state.set].find(v => typeof v === 'object').id, 'new');
  assert.equal(state.list[0].id, 'new');
  assert.equal(state.list[1][0], 'new');
  assert.equal(state.self, state);
});

test('fresh joins are blocked during games and socket membership is unique', () => {
  const first = rooms.createRoom(socket('one'), 'Alice');
  assert.equal(rooms.joinRoom(socket('one'), first.room.code, 'Elsewhere').error, 'Already in a room');
  first.room.state = 'playing';
  assert.equal(rooms.joinRoom(socket('two'), first.room.code, 'Bob').error, 'Game in progress');
  assert.equal(first.room.players.size, 1);
});

test('room destruction cancels centralized timers and removes membership', async () => {
  const created = rooms.createRoom(socket('one'), 'Alice');
  let fired = false;
  created.room.timerRegistry.timeout(() => { fired = true; }, 10);
  assert.equal(created.room.timerRegistry.size, 1);
  assert.equal(rooms.destroyRoom(created.room, 'test'), true);
  assert.equal(created.room.timerRegistry.size, 0);
  assert.equal(rooms.getRoom(created.room.code), null);
  assert.equal(rooms.getRoomBySocket('one'), null);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fired, false);
});

test('TimerRegistry invalidates callbacks and tracks fired handles accurately', async () => {
  let current = true;
  let calls = 0;
  const registry = new TimerRegistry(() => current);
  registry.timeout(() => calls++, 5, 'round');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 1);
  assert.equal(registry.size, 0);
  registry.interval(() => calls++, 5, 'round');
  current = false;
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(registry.size, 0);
  assert.equal(calls, 1);
});
