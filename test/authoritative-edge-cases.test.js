'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reaction = require('../server/games/reaction-race');
const taps = require('../server/games/tap-frenzy');
const numbers = require('../server/games/number-guess');
const { makeIo, makeSocket, makeRoom, cleanup } = require('./helpers/game-fixtures');

test('tap-frenzy enforces burst and sustained token-bucket limits plus stale rounds', () => {
  const room = makeRoom();
  const io = makeIo();
  taps.init(room, io);
  try {
    const gs = room.gameState;
    gs.phase = 'tapping';
    gs.phaseStartedAt = 10000;
    gs.deadlineAt = 18000;
    const socket = makeSocket('p1');
    for (let i = 0; i < 8; i++) assert.equal(taps.onEvent(room, socket, 'tap', { roundId: gs.roundId }).ok, true);
    assert.equal(taps.onEvent(room, socket, 'tap', { roundId: gs.roundId }).code, 'RATE_LIMITED');
    room.setNow(10063);
    assert.equal(taps.onEvent(room, socket, 'tap', { roundId: gs.roundId }).ok, true);
    assert.equal(taps.onEvent(room, socket, 'tap', { roundId: gs.roundId - 1 }).code, 'STALE_ROUND');
    assert.equal(gs.taps.get('p1'), 9);
  } finally { cleanup(taps, room); }
});

test('number-guess makes first solve atomic and duplicate correct packets cannot rescore', () => {
  const room = makeRoom();
  const io = makeIo();
  numbers.init(room, io);
  try {
    const gs = room.gameState;
    const payload = { guess: gs.secret };
    numbers.onEvent(room, makeSocket('p1'), 'guess', payload, io);
    const firstScore = room.players.get('p1').score;
    numbers.onEvent(room, makeSocket('p2'), 'guess', payload, io);
    numbers.onEvent(room, makeSocket('p1'), 'guess', payload, io);
    assert.equal(gs.solved, true);
    assert.equal(gs.solvers.length, 1);
    assert.equal(gs.solvers[0].id, 'p1');
    assert.equal(room.players.get('p1').score, firstScore);
    assert.equal(room.players.get('p2').score, 0);
  } finally { cleanup(numbers, room); }
});

test('reaction-race round tokens reject stale taps and false start penalty is idempotent', () => {
  const room = makeRoom();
  const io = makeIo();
  reaction.init(room, io);
  try {
    const gs = room.gameState;
    const socket = makeSocket('p1');
    room.players.get('p1').score = 100;
    assert.equal(reaction.onEvent(room, socket, 'tap', { roundId: gs.roundId - 1 }, io).code, 'STALE_ROUND');
    assert.equal(reaction.onEvent(room, socket, 'tap', { roundId: gs.roundId }, io).code, 'FALSE_START');
    assert.equal(room.players.get('p1').score, 75);
    assert.equal(reaction.onEvent(room, socket, 'tap', { roundId: gs.roundId }, io).code, 'FALSE_START');
    assert.equal(room.players.get('p1').score, 75);
  } finally { cleanup(reaction, room); }
});

test('reaction-race uses monotonic receipt time with bounded compensation', () => {
  const room = makeRoom();
  const io = makeIo();
  reaction.init(room, io);
  try {
    const gs = room.gameState;
    gs.phase = 'go';
    gs.goTime = 10000;
    gs.deadlineAt = 15000;
    room.latencyByPlayer = new Map([['p1', { minRttMs: 1000, jitterMs: 20 }]]);
    room.setNow(10200);
    assert.equal(reaction.onEvent(room, makeSocket('p1'), 'tap', { roundId: gs.roundId }, io).ok, true);
    assert.equal(reaction.onEvent(room, makeSocket('p2'), 'tap', { roundId: gs.roundId, elapsed: 1 }, io).code, 'INVALID_ACTION');
    const entry = gs.taps.get('p1');
    assert.equal(entry.rawTime, 200);
    assert.equal(entry.compensation, 75);
    assert.equal(entry.time, 125);
  } finally { cleanup(reaction, room); }
});

test('reaction-race uncertainty overlap produces a tie with exact reconnect parity', () => {
  const room = makeRoom();
  const io = makeIo();
  reaction.init(room, io);
  try {
    const gs = room.gameState;
    gs.phase = 'go';
    gs.goTime = 10000;
    gs.deadlineAt = 15000;
    room.setNow(10200);
    reaction.onEvent(room, makeSocket('p1'), 'tap', { roundId: gs.roundId }, io);
    room.setNow(10215);
    reaction.onEvent(room, makeSocket('p2'), 'tap', { roundId: gs.roundId }, io);
    reaction._roundResult(room, io);
    assert.equal(gs.resultState.tie, true);
    assert.equal(gs.resultState.winners.length, 2);
    assert.deepEqual(reaction.getReconnectState(room, 'p1'), io.last());
  } finally { cleanup(reaction, room); }
});
