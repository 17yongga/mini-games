'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeIo, makeRoom, cleanup, json } = require('./helpers/game-fixtures');

const gamesDir = path.join(__dirname, '..', 'server', 'games');
const gameFiles = fs.readdirSync(gamesDir)
  .filter(file => file.endsWith('.js') && file !== 'index.js' && !file.startsWith('_'))
  .sort();
const games = gameFiles.map(file => require(path.join(gamesDir, file)));

const hiddenKeys = new Set(['secret', 'word', 'fullSequence', 'board', 'inkColor', 'answer', 'correctIndex']);
const liveHiddenExemptions = {
  'color-clash': new Set(['inkColor', 'word']),
  'emoji-match': new Set(['board']),
  'hangman': new Set(['word']),
  'math-blitz': new Set(['answer']),
  'number-guess': new Set(['secret']),
  'simon-says': new Set(['fullSequence']),
  'word-scramble': new Set(['word'])
};

function assertFinite(value, trail = 'state') {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${trail} must be finite`);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) assertFinite(child, `${trail}.${key}`);
}

for (const game of games) {
  test(`${game.id}: authoritative lifecycle and reconnect contract`, () => {
    const room = makeRoom();
    const io = makeIo();
    try {
      game.init(room, io);
      assert.ok(room.gameState, 'init must create gameState');
      assert.ok(typeof room.gameState.phase === 'string');
      assert.ok(Number.isInteger(room.gameState.round));
      assert.ok(Number.isInteger(room.gameState.totalRounds));
      assert.equal(typeof game.getReconnectState, 'function');
      assert.equal(typeof game.migratePlayerIdentity, 'function');

      const reconnect = game.getReconnectState(room, 'p1');
      assert.ok(reconnect && typeof reconnect === 'object', 'active game must reconnect to an object state');
      assertFinite(reconnect);
      const exemptions = liveHiddenExemptions[game.id] || new Set();
      for (const key of hiddenKeys) {
        if (!exemptions.has(key)) assert.equal(Object.hasOwn(reconnect, key), false, `live reconnect leaked ${key}`);
      }

      const before = json(reconnect);
      game.migratePlayerIdentity(room, 'p1', 'p1-new');
      assert.doesNotThrow(() => game.getReconnectState(room, 'p1-new'));
      assertFinite(before);

      if (typeof game._roundResult === 'function') {
        const eligible = ['solving', 'typing', 'tapping', 'go', 'playing'];
        if (eligible.includes(room.gameState.phase)) {
          game._roundResult(room, io);
          const live = io.last();
          const replay = game.getReconnectState(room, 'p2');
          assert.deepEqual(json(replay), json(live), 'result live/reconnect payloads must match exactly');
        }
      } else if (typeof game._resolveRound === 'function' && ['picking', 'showing', 'input'].includes(room.gameState.phase)) {
        game._resolveRound(room, io);
        const live = io.last();
        const replay = game.getReconnectState(room, 'p2');
        assert.deepEqual(json(replay), json(live), 'result live/reconnect payloads must match exactly');
      }
    } finally {
      cleanup(game, room);
    }
  });
}

test('registry discovers exactly the 13 public games and excludes helpers', () => {
  const registry = require('../server/games');
  assert.equal(games.length, 13);
  assert.equal(registry.list().length, 13);
  assert.equal(registry.get('_shared'), null);
});
