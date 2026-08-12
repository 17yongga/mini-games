'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../server/games/type-racer');
const { makeIo, makeSocket, makeRoom, cleanup } = require('./helpers/game-fixtures');

function setup() {
  const room = makeRoom();
  const io = makeIo();
  game.init(room, io);
  return { room, io, sentence: room.gameState.sentences[0], roundId: room.gameState.roundId };
}

test('type-racer initializes five unique non-empty sentences', () => {
  const { room } = setup();
  try {
    assert.equal(room.gameState.sentences.length, 5);
    assert.equal(new Set(room.gameState.sentences).size, 5);
    assert.ok(room.gameState.sentences.every(sentence => typeof sentence === 'string' && sentence.length > 0));
  } finally { cleanup(game, room); }
});

test('type-racer uses server monotonic receipt time and rejects client elapsed', () => {
  const { room, io, sentence, roundId } = setup();
  try {
    room.setNow(room.gameState.phaseStartedAt + 6000);
    const socket = makeSocket('p1');
    assert.equal(game.onEvent(room, socket, 'finish', { typed: sentence, elapsed: 1, roundId }, io).code, 'INVALID_PAYLOAD');
    const result = game.onEvent(room, socket, 'finish', { typed: sentence, roundId }, io);
    assert.deepEqual(result, { ok: true });
    assert.equal(room.gameState.finishers[0].elapsed, 6000);
    assert.ok(room.gameState.finishers[0].wpm < 240);
    assert.ok(room.players.get('p1').score > 0);
  } finally { cleanup(game, room); }
});

test('type-racer rejects wrong text, stale round and duplicate finish', () => {
  const { room, io, sentence, roundId } = setup();
  try {
    const socket = makeSocket('p1');
    assert.equal(game.onEvent(room, socket, 'finish', { typed: `${sentence}!`, roundId }, io).code, 'INCORRECT');
    assert.equal(game.onEvent(room, socket, 'finish', { typed: sentence, roundId: roundId - 1 }, io).code, 'STALE_ROUND');
    room.setNow(room.gameState.phaseStartedAt + 8000);
    assert.equal(game.onEvent(room, socket, 'finish', { typed: sentence, roundId }, io).ok, true);
    const score = room.players.get('p1').score;
    assert.equal(game.onEvent(room, socket, 'finish', { typed: sentence, roundId }, io).code, 'DUPLICATE');
    assert.equal(room.players.get('p1').score, score);
    assert.equal(room.gameState.finishers.length, 1);
  } finally { cleanup(game, room); }
});

test('type-racer progress exposes only correct monotonic prefix and is rate limited', () => {
  const { room, io, sentence, roundId } = setup();
  try {
    const socket = makeSocket('p1');
    const first = sentence.slice(0, 5);
    assert.equal(game.onEvent(room, socket, 'progress', { typed: `${first}WRONG`, roundId }, io).ok, true);
    assert.equal(room.gameState.progress.get('p1').typed, first);
    assert.equal(game.onEvent(room, socket, 'progress', { typed: sentence.slice(0, 8), roundId }, io).code, 'RATE_LIMITED');
    room.setNow(room.gameState.phaseStartedAt + 200);
    assert.equal(game.onEvent(room, socket, 'progress', { typed: sentence.slice(0, 3), roundId }, io).code, 'REGRESSION');
  } finally { cleanup(game, room); }
});

test('type-racer reconnect result is exact live payload', () => {
  const { room, io, sentence, roundId } = setup();
  try {
    room.setNow(room.gameState.phaseStartedAt + 5000);
    game.onEvent(room, makeSocket('p1'), 'finish', { typed: sentence, roundId }, io);
    game._roundResult(room, io);
    assert.deepEqual(game.getReconnectState(room, 'p2'), io.last());
  } finally { cleanup(game, room); }
});
