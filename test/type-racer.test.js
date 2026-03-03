// Type Racer — server logic tests
// Run with: node test/type-racer.test.js
'use strict';

const assert = require('assert');
const game = require('../server/games/type-racer');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeRoom(sentence) {
  const players = new Map();
  players.set('p1', { name: 'Alice', score: 0, isHost: true, isBot: false });
  players.set('p2', { name: 'Bob',   score: 0, isHost: false, isBot: false });

  return {
    code: 'TEST',
    players,
    state: 'playing',
    _trTimers: [],
    gameState: {
      round: 1,
      totalRounds: 5,
      phase: 'typing',
      sentences: [sentence || 'The quick brown fox'],
      progress: new Map(),
      finishers: [],
      roundStart: Date.now() - 5000, // pretend 5s elapsed
    },
  };
}

// io mock — captures emitted events
function makeIo() {
  const emitted = [];
  const io = {
    to: () => ({ emit: (ev, data) => emitted.push({ ev, data }) }),
    emitted,
  };
  return io;
}

// socket mock
function makeSocket(id) {
  const events = [];
  return {
    id,
    emit: (ev, data) => events.push({ ev, data }),
    events,
  };
}

// ─── Sentence generation ────────────────────────────────────────────────────

console.log('\n📋 Sentence Generation');

test('pickSentences returns correct count', () => {
  // Access private via init on a mock room
  const sentences = [];
  const fakeRoom = { code: 'X', players: new Map([['p1', { name: 'A', score: 0, isHost: true }]]), _trTimers: [] };
  const fakeIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  game.init(fakeRoom, fakeIo);
  assert.strictEqual(fakeRoom.gameState.sentences.length, 5, 'Should have 5 sentences');
  game.cleanup(fakeRoom);
});

test('pickSentences returns unique sentences', () => {
  const fakeRoom = { code: 'X', players: new Map([['p1', { name: 'A', score: 0, isHost: true }]]), _trTimers: [] };
  const fakeIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  game.init(fakeRoom, fakeIo);
  const sentences = fakeRoom.gameState.sentences;
  const unique = new Set(sentences);
  assert.strictEqual(unique.size, sentences.length, 'All sentences should be unique');
  game.cleanup(fakeRoom);
});

test('all sentences are non-empty strings', () => {
  const fakeRoom = { code: 'X', players: new Map([['p1', { name: 'A', score: 0, isHost: true }]]), _trTimers: [] };
  const fakeIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  game.init(fakeRoom, fakeIo);
  for (const s of fakeRoom.gameState.sentences) {
    assert.strictEqual(typeof s, 'string', 'Sentence must be a string');
    assert.ok(s.length > 0, 'Sentence must not be empty');
  }
  game.cleanup(fakeRoom);
});

// ─── Scoring / WPM ──────────────────────────────────────────────────────────

console.log('\n📊 Scoring & WPM');

test('correct finish awards positive score', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  const socket = makeSocket('p1');
  const io = makeIo();

  game.onEvent(room, socket, 'finish', { typed: sentence, elapsed: 8000 }, io);

  const player = room.players.get('p1');
  assert.ok(player.score > 0, `Score should be > 0, got ${player.score}`);
});

test('incorrect finish awards zero score', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  const socket = makeSocket('p1');
  const io = makeIo();

  game.onEvent(room, socket, 'finish', { typed: 'The quick brown cat', elapsed: 8000 }, io);

  const player = room.players.get('p1');
  assert.strictEqual(player.score, 0, 'Wrong sentence should score 0');
});

test('first finisher gets +50 bonus', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  const socket = makeSocket('p1');
  const io = makeIo();

  game.onEvent(room, socket, 'finish', { typed: sentence, elapsed: 8000 }, io);

  // The finisher event emitted to socket should contain bonus
  const finishEvent = socket.events.find(e => e.ev === 'game:state' && e.data.phase === 'finished-round');
  assert.ok(finishEvent, 'Should emit finished-round state to finisher');
  assert.ok(finishEvent.data.score > 0, 'First finisher should have a score > 0 (includes +50 bonus)');
});

test('WPM increases with shorter elapsed time for same sentence', () => {
  const sentence = 'The quick brown fox';

  const roomFast = makeRoom(sentence);
  roomFast.gameState.roundStart = Date.now() - 3000;
  const socketFast = makeSocket('p1');
  const ioFast = makeIo();
  game.onEvent(roomFast, socketFast, 'finish', { typed: sentence, elapsed: 3000 }, ioFast);
  const fastScore = roomFast.players.get('p1').score;

  const roomSlow = makeRoom(sentence);
  roomSlow.gameState.roundStart = Date.now() - 20000;
  const socketSlow = makeSocket('p1');
  const ioSlow = makeIo();
  game.onEvent(roomSlow, socketSlow, 'finish', { typed: sentence, elapsed: 20000 }, ioSlow);
  const slowScore = roomSlow.players.get('p1').score;

  // Fast typist (3s) should score higher than slow typist (20s)
  // Fast gets +50 bonus, slow gets +50 bonus (both first finishers in their rooms)
  // The WPM component should make fast > slow
  assert.ok(fastScore > slowScore, `Fast (${fastScore}) should beat slow (${slowScore})`);
});

// ─── Progress events ─────────────────────────────────────────────────────────

console.log('\n📡 Progress Events');

test('progress event updates gs.progress map', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  const socket = makeSocket('p1');
  const io = makeIo();

  game.onEvent(room, socket, 'progress', { typed: 'The quick' }, io);

  assert.ok(room.gameState.progress.has('p1'), 'Progress map should have p1');
  assert.strictEqual(room.gameState.progress.get('p1').typed, 'The quick');
});

test('progress event broadcasts game:progress to room', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  const socket = makeSocket('p1');
  const io = makeIo();

  game.onEvent(room, socket, 'progress', { typed: 'The' }, io);

  const progressEmit = io.emitted.find(e => e.ev === 'game:progress');
  assert.ok(progressEmit, 'Should broadcast game:progress');
  assert.ok(Array.isArray(progressEmit.data.players), 'Should include players array');
});

test('progress event with null data does not crash', () => {
  const room = makeRoom('The quick brown fox');
  const socket = makeSocket('p1');
  const io = makeIo();

  assert.doesNotThrow(() => {
    game.onEvent(room, socket, 'progress', null, io);
  }, 'Null data should not crash');
});

test('progress event with undefined typed does not crash', () => {
  const room = makeRoom('The quick brown fox');
  const socket = makeSocket('p1');
  const io = makeIo();

  assert.doesNotThrow(() => {
    game.onEvent(room, socket, 'progress', { typed: undefined }, io);
  }, 'Undefined typed should not crash');
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

console.log('\n⚠️  Edge Cases');

test('empty typed string does not crash and scores 0', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  const socket = makeSocket('p1');
  const io = makeIo();

  assert.doesNotThrow(() => {
    game.onEvent(room, socket, 'finish', { typed: '', elapsed: 5000 }, io);
  });
  assert.strictEqual(room.players.get('p1').score, 0, 'Empty typed should score 0');
});

test('duplicate finish event is ignored', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  const socket = makeSocket('p1');
  const io = makeIo();

  game.onEvent(room, socket, 'finish', { typed: sentence, elapsed: 5000 }, io);
  const scoreAfterFirst = room.players.get('p1').score;

  game.onEvent(room, socket, 'finish', { typed: sentence, elapsed: 5000 }, io);
  const scoreAfterSecond = room.players.get('p1').score;

  assert.strictEqual(scoreAfterFirst, scoreAfterSecond, 'Duplicate finish should not add more score');
  assert.strictEqual(room.gameState.finishers.length, 1, 'Should only have 1 finisher entry');
});

test('finish event ignored when phase is not typing', () => {
  const sentence = 'The quick brown fox';
  const room = makeRoom(sentence);
  room.gameState.phase = 'result'; // wrong phase
  const socket = makeSocket('p1');
  const io = makeIo();

  game.onEvent(room, socket, 'finish', { typed: sentence, elapsed: 5000 }, io);

  assert.strictEqual(room.players.get('p1').score, 0, 'Should not score when phase is not typing');
});

test('cleanup clears all timers without crash', () => {
  const room = makeRoom('test sentence');
  room._trTimers = [
    setTimeout(() => {}, 10000),
    setInterval(() => {}, 10000),
  ];

  assert.doesNotThrow(() => {
    game.cleanup(room);
  });
  assert.strictEqual(room._trTimers.length, 0, 'Timers array should be empty after cleanup');
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
  console.log(`✅ All ${passed} tests passed!\n`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} test(s) failed, ${passed} passed.\n`);
  process.exit(1);
}
