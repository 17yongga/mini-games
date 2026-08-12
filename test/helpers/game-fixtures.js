'use strict';

function makeIo() {
  const emitted = [];
  return {
    emitted,
    to() { return { emit(event, data) { emitted.push({ event, data }); } }; },
    last(event = 'game:state') { return emitted.filter(entry => entry.event === event).at(-1)?.data; }
  };
}

function makeSocket(id = 'p1') {
  const emitted = [];
  return {
    id,
    emitted,
    emit(event, data) { emitted.push({ event, data }); }
  };
}

function makeRoom() {
  let clock = 10000;
  return {
    code: 'TEST',
    state: 'playing',
    players: new Map([
      ['p1', { name: 'Alice', score: 0, isBot: false, disconnected: false }],
      ['p2', { name: 'Bob', score: 0, isBot: false, disconnected: false }]
    ]),
    _gameNow: () => clock,
    setNow(value) { clock = value; }
  };
}

function cleanup(game, room) {
  if (typeof game.cleanup === 'function') game.cleanup(room);
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { makeIo, makeSocket, makeRoom, cleanup, json };
