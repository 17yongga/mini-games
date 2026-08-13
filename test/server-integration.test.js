'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const rooms = require('../server/rooms');
const runtime = require('../server/server');

function emitAck(socket, event, payload) {
  return new Promise(resolve => socket.emit(event, payload, resolve));
}

async function connect(url) {
  const client = createClient(url, { path: '/minigames-ws/', transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

test('Socket.IO contracts return typed errors, secure identities, and safe health metrics', async t => {
  await new Promise(resolve => runtime.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    rooms._resetForTests();
    await new Promise(resolve => runtime.io.close(resolve));
  });
  const address = runtime.server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const host = await connect(url);
  const attacker = await connect(url);
  t.after(() => { host.disconnect(); attacker.disconnect(); });

  const invalid = await emitAck(host, 'room:create', null);
  assert.deepEqual(invalid.ok, false);
  assert.equal(invalid.code, 'INVALID_PAYLOAD');

  const created = await emitAck(host, 'room:create', { name: 'Alice' });
  assert.equal(created.ok, true);
  assert.match(created.playerId, /^[a-f0-9]{32}$/);
  assert.match(created.reconnectToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(created.players).includes(created.reconnectToken), false);

  host.disconnect();
  await new Promise(resolve => setTimeout(resolve, 20));
  const rejected = await emitAck(attacker, 'room:rejoin', {
    code: created.code, playerId: created.playerId, reconnectToken: 'A'.repeat(43),
  });
  assert.equal(rejected.code, 'REJOIN_TOKEN_INVALID');

  const legitimate = await connect(url);
  t.after(() => legitimate.disconnect());
  const rejoined = await emitAck(legitimate, 'room:rejoin', {
    code: created.code, playerId: created.playerId, reconnectToken: created.reconnectToken,
  });
  assert.equal(rejoined.ok, true);
  assert.notEqual(rejoined.reconnectToken, created.reconnectToken);

  const health = await fetch(`${url}/play/health`).then(response => response.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.sockets >= 2, true);
  assert.equal(health.rooms, 1);
  assert.equal(typeof health.events.rejected, 'number');
  assert.equal(typeof health.eventLoop.delayMeanMs, 'number');
  assert.equal(Object.prototype.hasOwnProperty.call(health, 'reconnectToken'), false);
});

test('Hangman letter and whole-word clicks pass the public Socket.IO contract and mutate state', async t => {
  await new Promise(resolve => runtime.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    rooms._resetForTests();
    await new Promise(resolve => runtime.io.close(resolve));
  });
  const url = `http://127.0.0.1:${runtime.server.address().port}`;
  const host = await connect(url);
  t.after(() => host.disconnect());

  const created = await emitAck(host, 'room:create', { name: 'Alice' });
  assert.equal((await emitAck(host, 'room:addBot', {})).ok, true);
  assert.equal((await emitAck(host, 'room:startGame', { gameId: 'hangman' })).ok, true);
  await new Promise(resolve => setTimeout(resolve, 550));

  const room = rooms.getRoom(created.code);
  const word = room.gameState.word;
  const correctLetter = word[0];
  const wrongLetter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(letter => !word.includes(letter));

  const correctAck = await emitAck(host, 'game:event', {
    event: 'guess_letter', data: { letter: correctLetter },
  });
  assert.equal(correctAck.ok, true);
  assert.ok(room.gameState.correctLetters.includes(correctLetter));

  const wrongAck = await emitAck(host, 'game:event', {
    event: 'guess_letter', data: { letter: wrongLetter },
  });
  assert.equal(wrongAck.ok, true);
  assert.ok(room.gameState.wrongLetters.includes(wrongLetter));

  const wordAck = await emitAck(host, 'game:event', {
    event: 'guess_word', data: { word: 'WRONGWORD' },
  });
  assert.equal(wordAck.ok, true);
  assert.equal(room.gameState.wordAttempts.get(host.id), 1);
});
