'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const clientsDir = path.join(__dirname, '..', 'public', 'js', 'games');
const clientFiles = fs.readdirSync(clientsDir).filter(file => file.endsWith('.js')).sort();
const payload = '<img id="xss-img" src=x onerror="globalThis.__xss=1"><svg id="xss-svg" onload="globalThis.__xss=1"></svg><script id="xss-script">globalThis.__xss=1</script>';

function loadClients() {
  const dom = new JSDOM('<!doctype html><main id="game"></main>', {
    runScripts: 'outside-only',
    url: 'http://localhost/play/'
  });
  const { window } = dom;
  window.GameClients = {};
  window.__xss = 0;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.setTimeout = () => 1;
  window.clearTimeout = () => {};
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  for (const file of clientFiles) {
    vm.runInContext(fs.readFileSync(path.join(clientsDir, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  }
  return dom;
}

function assertNoExecution(dom, gameId, step) {
  const { document } = dom.window;
  assert.equal(dom.window.__xss, 0, `${gameId} executed the malicious name during ${step}`);
  assert.equal(document.querySelector('#xss-img, #xss-svg, #xss-script'), null, `${gameId} parsed malicious name markup during ${step}`);
  assert.equal(document.querySelector('[onerror], [onload]'), null, `${gameId} created an event-handler attribute during ${step}`);
}

function runStep(dom, gameId, label, fn) {
  fn();
  assertNoExecution(dom, gameId, label);
  assert.match(dom.window.document.getElementById('game').textContent, /xss-img/, `${gameId} did not render the malicious name as literal text during ${label}`);
}

test('all 13 browser clients render malicious player names only as text in every name-bearing path', () => {
  const dom = loadClients();
  const { document, GameClients } = dom.window;
  const container = document.getElementById('game');
  const socket = { emit() {} };
  assert.equal(clientFiles.length, 13);
  assert.deepEqual(Object.keys(GameClients).sort(), clientFiles.map(file => file.replace(/\.js$/, '')).sort());

  const reset = (id, state) => {
    container.replaceChildren();
    const client = GameClients[id];
    client.init(container, socket, state);
    assertNoExecution(dom, id, 'init');
    return client;
  };

  let c = reset('color-clash');
  runStep(dom, 'color-clash', 'result', () => c.onState({ phase: 'result', round: 1, correctAnswer: 'red', results: [{ name: payload, correct: true, time: 10 }] }));

  c = reset('color-picker');
  runStep(dom, 'color-picker', 'result', () => c.onState({ phase: 'result', round: 1, target: { r: 1, g: 2, b: 3 }, results: [{ name: payload, guess: { r: 1, g: 2, b: 3 }, dist: 0, points: 10 }] }));

  c = reset('emoji-match', { myId: 'me' });
  runStep(dom, 'emoji-match', 'playing turn', () => c.onState({ phase: 'playing', boardSize: 2, cols: 2, currentTurn: 'other', currentTurnName: payload }));
  runStep(dom, 'emoji-match', 'match', () => c.onState({ phase: 'match', indices: [0, 1], playerName: payload }));
  runStep(dom, 'emoji-match', 'turn update', () => c.onState({ phase: 'turn', currentTurn: 'other', currentTurnName: payload }));
  runStep(dom, 'emoji-match', 'round result', () => c.onState({ phase: 'roundResult', results: [{ name: payload, pairs: 1 }] }));

  c = reset('geography-quiz');
  c.onState({ phase: 'question', round: 1, totalRounds: 1, question: 'Capital of France?', options: ['Paris', 'Rome', 'Lima', 'Oslo'], timeLimit: 15 });
  runStep(dom, 'geography-quiz', 'answered indicator', () => c.onState({ phase: 'player-answered', playerName: payload }));
  runStep(dom, 'geography-quiz', 'answer and scores', () => c.onState({ phase: 'answer', correctIndex: 0, results: [{ name: payload, correct: true, points: 10 }], scores: [{ name: payload, score: 10 }] }));

  c = reset('hangman');
  c.onState({ phase: 'round_start', round: 1, totalRounds: 1, hint: 'Fruit', timeLimit: 60, maxWrong: 6, blanks: ['_'] });
  runStep(dom, 'hangman', 'letter result', () => c.onState({ phase: 'letter_correct', playerName: payload, letter: 'A', wrongCount: 0, maxWrong: 6, wrongLetters: [], blanks: ['A'] }));
  runStep(dom, 'hangman', 'solver reveal', () => c.onState({ phase: 'reveal', reason: 'solved', solver: { name: payload }, word: 'APPLE', hint: 'Fruit', wrongCount: 0 }));

  c = reset('math-blitz');
  runStep(dom, 'math-blitz', 'result', () => c.onState({ phase: 'result', problem: '1 + 1', answer: 2, solvers: [{ name: payload, time: 100, points: 10 }], totalPlayers: 1 }));

  c = reset('number-guess');
  c.onState({ phase: 'guessing', round: 1, totalRounds: 1, range: { min: 1, max: 10 }, timeLimit: 1000 });
  runStep(dom, 'number-guess', 'guess log', () => c.onState({ phase: 'guess-result', playerName: payload, hint: 'higher', guess: 4, points: 0 }));
  runStep(dom, 'number-guess', 'result', () => c.onState({ phase: 'result', reason: 'solved', secret: 5, solvers: [{ name: payload, guesses: 1 }], guessLog: [{ playerName: payload, hint: 'correct', guess: 5, points: 10 }] }));

  c = reset('reaction-race');
  runStep(dom, 'reaction-race', 'winner', () => c.onState({ phase: 'result', winner: { name: payload, time: 100 } }));

  c = reset('simon-says');
  runStep(dom, 'simon-says', 'survivors', () => c.onState({ phase: 'result', round: 1, survivorCount: 1, survivors: [payload] }));

  c = reset('tap-frenzy');
  c.onState({ phase: 'tapping', roundId: 1, duration: 1000 });
  runStep(dom, 'tap-frenzy', 'live leaderboard', () => c.onTick({ counts: [{ name: payload, count: 1 }] }));
  runStep(dom, 'tap-frenzy', 'results', () => c.onState({ phase: 'result', results: [{ name: payload, count: 1, points: 1 }] }));

  c = reset('trivia-blitz');
  c.onState({ phase: 'question', question: '2 + 2?', options: ['4', '3'], timeLimit: 15 });
  runStep(dom, 'trivia-blitz', 'answer results', () => c.onState({ phase: 'answer', correctIndex: 0, results: [{ name: payload, correct: true, points: 10 }] }));

  c = reset('type-racer');
  runStep(dom, 'type-racer', 'progress', () => c.onProgress({ players: [{ name: payload, pct: 0.5, finished: false }] }));
  runStep(dom, 'type-racer', 'finishers', () => c.onState({ phase: 'result', round: 1, finishers: [{ name: payload, wpm: 50, accuracy: 1, score: 10 }] }));

  c = reset('word-scramble');
  runStep(dom, 'word-scramble', 'reveal solvers', () => c.onState({ phase: 'reveal', word: 'APPLE', solvers: [{ name: payload, rank: 1, time: 100, points: 10 }] }));

  dom.window.close();
});

test('static scan rejects player-name interpolation into HTML sinks across every client', () => {
  assert.equal(clientFiles.length, 13);
  for (const file of clientFiles) {
    const source = fs.readFileSync(path.join(clientsDir, file), 'utf8');
    assert.doesNotMatch(source, /insertAdjacentHTML\s*\(/, `${file} must not use insertAdjacentHTML`);
    const htmlAssignments = source.match(/(?:innerHTML|outerHTML)\s*(?:\+?=)[\s\S]{0,700}?(?=;\s*(?:\n|$))/g) || [];
    for (const sink of htmlAssignments) {
      assert.doesNotMatch(sink, /\$\{[^}]*\b(?:playerName|currentTurnName|\w+\.name)\b[^}]*\}/, `${file} interpolates a player name into an HTML sink: ${sink}`);
    }
    assert.doesNotMatch(source, /(?:html|markup)\s*\+=\s*`[^`]*\$\{[^}]*\b(?:playerName|currentTurnName|\w+\.name)\b[^}]*\}/s, `${file} accumulates player-name HTML`);
  }
});
