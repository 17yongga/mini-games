'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bots = require('../server/bots');
const typeRacer = require('../server/games/type-racer');

test('generic scheduler allows only one delayed action per bot and phase', async () => {
  let moveCalls = 0;
  let actions = 0;
  const game = {
    id: 'generic-test',
    getBotMove() {
      moveCalls++;
      return { event: 'move', data: {}, delayMs: 5000 };
    },
    onEvent() { actions++; },
  };
  const room = {
    currentGame: game,
    gameInstanceId: 'game-1',
    roomEpoch: 1,
    gameState: { phase: 'playing', round: 1 },
    _botTimers: [],
    players: new Map([['bot-1', { difficulty: 'easy', isBot: true }]]),
  };
  bots._startGenericBot(room, {}, 'bot-1', { difficulty: 'easy' }, bots.fakeSocket('bot-1'));
  await new Promise(resolve => setTimeout(resolve, 4250));
  assert.equal(moveCalls, 1);
  assert.equal(actions, 0);
  bots.clearBotTimers(room);
});

test('generic delayed action cannot cross a round boundary', async () => {
  let actions = 0;
  const game = {
    id: 'generic-test',
    getBotMove() { return { event: 'move', data: {}, delayMs: 250 }; },
    onEvent() { actions++; },
  };
  const room = {
    currentGame: game,
    gameInstanceId: 'game-1',
    roomEpoch: 1,
    gameState: { phase: 'playing', round: 1 },
    _botTimers: [],
    players: new Map([['bot-1', { difficulty: 'easy', isBot: true }]]),
  };
  bots._startGenericBot(room, {}, 'bot-1', { difficulty: 'easy' }, bots.fakeSocket('bot-1'));
  await new Promise(resolve => setTimeout(resolve, 2050));
  room.gameState.round = 2;
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(actions, 0);
  bots.clearBotTimers(room);
});

test('Type Racer ignores every client elapsed value at the shared server boundary', () => {
  const sentence = 'The quick brown fox';
  const values = [1, -1, NaN, Infinity, 600000, '1'];
  const scores = [];
  const originalNow = Date.now;
  try {
    Date.now = () => 105000;
    for (const elapsed of values) {
      const room = {
        code: 'TEST',
        players: new Map([
          ['p1', { name: 'Alice', score: 0, isBot: false }],
          ['p2', { name: 'Bob', score: 0, isBot: false, disconnected: true }],
        ]),
        gameState: {
          round: 1, totalRounds: 1, phase: 'typing', sentences: [sentence],
          progress: new Map(), finishers: [], roundStart: 100000,
        },
        _trTimers: [],
      };
      const events = [];
      const socket = { id: 'p1', emit: (event, data) => events.push({ event, data }) };
      const io = { to: () => ({ emit() {} }) };
      typeRacer.onEvent(room, socket, 'finish', { typed: sentence, elapsed }, io);
      const result = events.find(item => item.data.phase === 'finished-round').data;
      scores.push({ score: room.players.get('p1').score, wpm: result.wpm });
      typeRacer.cleanup(room);
    }
  } finally {
    Date.now = originalNow;
  }
  assert.deepEqual(new Set(scores.map(item => item.score)).size, 1);
  assert.deepEqual(new Set(scores.map(item => item.wpm)).size, 1);
  assert.ok(scores[0].wpm <= 240);
});
