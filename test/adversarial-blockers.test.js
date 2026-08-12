'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rooms = require('../server/rooms');
const bots = require('../server/bots');
const { TimerRegistry } = require('../server/timer-registry');
const runtime = require('../server/server');

function socket(id) {
  return { id, join() {} };
}

test.afterEach(() => rooms._resetForTests());

test('identity migration safely moves Hangman contributor keys and rejects collisions', () => {
  const state = { letterContributors: Object.create(null) };
  state.letterContributors.old = 10;
  rooms.migrateIdentity(state, 'old', 'new');
  assert.equal(state.letterContributors.old, undefined);
  assert.equal(state.letterContributors.new, 10);
  assert.equal(Object.getPrototypeOf(state.letterContributors), null);
  assert.throws(() => rooms.migrateIdentity({ old: 1, new: 2 }, 'old', 'new'), /collision/);
  const pollutionProbe = { ['__proto__']: 'safe' };
  rooms.migrateIdentity(pollutionProbe, '__proto__', 'renamed');
  assert.equal(Object.getPrototypeOf(pollutionProbe), Object.prototype);
  assert.equal(pollutionProbe.renamed, 'safe');
});

test('shared player serialization recursively exposes no stable identity or reconnect secrets', () => {
  const created = rooms.createRoom(socket('one'), 'Alice');
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert.doesNotMatch(key, /reconnectToken|reconnectTokenHash|playerId/i);
      if (typeof item === 'string') {
        assert.notEqual(item, created.playerId);
        assert.notEqual(item, created.reconnectToken);
      }
      inspect(item);
    }
  };
  inspect(rooms.serializePlayers(created.room));
});

test('TimerRegistry contains callback/reporter exceptions and cancels failing intervals', async () => {
  const errors = [];
  const registry = new TimerRegistry(() => true, (error, context) => {
    errors.push({ error, context });
    throw new Error('reporter boom');
  }, { code: 'TEST' });
  registry.timeout(() => { throw new Error('timeout boom'); }, 1, 'timeout-test');
  registry.interval(() => { throw new Error('interval boom'); }, 1, 'interval-test');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(item => item.context.kind).sort(), ['interval', 'timeout']);
  assert.equal(errors[0].context.code, 'TEST');
  assert.equal(registry.size, 0);
});

test('inactive sweep uses a controllable clock and preserves recently touched rooms', () => {
  const stale = rooms.createRoom(socket('stale'), 'Stale').room;
  const active = rooms.createRoom(socket('active'), 'Active').room;
  stale.lastActivityAt = 100;
  active.lastActivityAt = 900;
  rooms._sweepInactive(1000, 500);
  assert.equal(rooms.getRoom(stale.code), null);
  assert.equal(rooms.getRoom(active.code), active);
});

test('global room cap fails typed without disturbing existing rooms', () => {
  rooms.configure({ maxRooms: 1 });
  const first = rooms.createRoom(socket('one'), 'Alice');
  const rejected = rooms.createRoom(socket('two'), 'Bob');
  assert.equal(rejected.code, 'ROOM_CAPACITY_REACHED');
  assert.equal(rooms.getRoom(first.room.code), first.room);
});

test('socket event budget is bounded and resets by window', () => {
  const socketState = { data: {} };
  for (let i = 0; i < runtime.MAX_EVENTS_PER_WINDOW; i++) {
    assert.equal(runtime.consumeEventBudget(socketState, 100), true);
  }
  assert.equal(runtime.consumeEventBudget(socketState, 100), false);
  assert.equal(runtime.consumeEventBudget(socketState, 100 + runtime.EVENT_WINDOW_MS), true);
});

test('event-loop sampler resets after each sample', () => {
  let resets = 0;
  const histogram = { mean: 2e6, max: 5e6, reset() { resets++; } };
  assert.deepEqual(runtime.sampleEventLoopDelay(histogram), { delayMeanMs: 2, delayMaxMs: 5 });
  assert.equal(resets, 1);
});

for (const scenario of [
  ['Trivia', '_startTriviaBot', { phase: 'question', round: 1, answers: new Map(), questions: [{ answer: 0, options: [0, 1] }] }],
  ['Word Scramble', '_startWordBot', { phase: 'scrambled', round: 1, solvers: [], words: ['word'] }],
  ['Math Blitz', '_startMathBot', { phase: 'solving', round: 1, answers: new Map(), problems: [{ answer: 2 }] }],
  ['Color Clash', '_startColorClashBot', { phase: 'showing', round: 1, answers: new Map(), inkColor: 'red', word: 'blue' }],
]) {
  test(`${scenario[0]} delayed action cannot cross a round boundary`, async () => {
    let actions = 0;
    const bot = { difficulty: 'hard', isBot: true };
    const game = { id: scenario[0], onEvent() { actions++; } };
    const room = {
      currentGame: game, gameInstanceId: 'game-1', roomEpoch: 1,
      gameState: scenario[2], players: new Map([['bot-1', bot]]),
      _botTimers: [], _botDelayScale: 0.05,
    };
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      bots[scenario[1]](room, {}, 'bot-1', bot, bots.fakeSocket('bot-1'));
      await new Promise(resolve => setTimeout(resolve, 15));
      room.timerRegistry.cancel(room._botTimers[0]); // isolate the already-scheduled delayed action
      room.gameState.round = 2;
      await new Promise(resolve => setTimeout(resolve, 800));
      assert.equal(actions, 0);
    } finally {
      Math.random = originalRandom;
      bots.clearBotTimers(room);
    }
  });
}
