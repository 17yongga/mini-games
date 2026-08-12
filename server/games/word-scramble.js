// Word Scramble — unscramble the word, first correct answer scores most
const { plainObject, boundedString, migrateIdentity } = require('./_shared');

const WORDS = [
  'PYTHON', 'ROCKET', 'PLANET', 'GUITAR', 'CASTLE', 'BRIDGE', 'FROZEN',
  'JUNGLE', 'PIRATE', 'DRAGON', 'COOKIE', 'SUNSET', 'WIZARD', 'COFFEE',
  'LAPTOP', 'TEMPLE', 'CANDLE', 'FOREST', 'SILVER', 'ISLAND', 'DANGER',
  'MONKEY', 'ORANGE', 'TROPHY', 'PUZZLE', 'MAGNET', 'ROBOTS', 'ANCHOR',
  'BUBBLE', 'CIRCUS', 'DONKEY', 'FALCON', 'GOBLIN', 'HAMMER', 'JACKET',
  'KITTEN', 'LEMON', 'MANGO', 'PEPPER', 'RABBIT', 'SALMON', 'TUNNEL',
  'VIOLET', 'WALNUT', 'ZOMBIE', 'BREEZE', 'GLITCH', 'SKETCH', 'THRONE'
];

function scramble(word) {
  if (new Set(word).size < 2) return word;
  for (let attempt = 0; attempt < 12; attempt++) {
    const arr = word.split('');
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    const result = arr.join(''); if (result !== word) return result;
  }
  return word.slice(1) + word[0];
}

module.exports = {
  id: 'word-scramble',
  name: 'Word Scramble',
  description: 'Unscramble the word before everyone else!',
  icon: '🔤',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: 6,

  init(room, io) {
    const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
    room.gameState = {
      words: shuffled.slice(0, this.rounds),
      round: 0,
      totalRounds: this.rounds,
      phase: 'waiting',
      solvers: [],
      roundStart: null,
      revealFired: false // BUG FIX: prevent double reveal
    };
    room._wsTimers = [];
    this._nextRound(room, io);
  },

  _addTimer(room, timer) {
    if (!room._wsTimers) room._wsTimers = [];
    room._wsTimers.push(timer);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.solvers = [];
    gs.revealFired = false;

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    const word = gs.words[gs.round - 1];
    gs.phase = 'scrambled';
    gs.roundStart = Date.now();
    gs.deadlineAt = gs.roundStart + 15000;
    gs.scrambled = scramble(word);

    const thisRound = gs.round;

    io.to(room.code).emit('game:state', {
      phase: 'scrambled',
      round: gs.round,
      totalRounds: gs.totalRounds,
      scrambled: gs.scrambled,
      wordLength: word.length,
      timeLimit: 15
    });

    // Store timer ref so we can cancel it on early solve
    gs.currentRoundTimer = setTimeout(() => {
      if (gs.round === thisRound && !gs.revealFired) this._revealAnswer(room, io);
    }, 15000);
    this._addTimer(room, gs.currentRoundTimer);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'guess' || gs.phase !== 'scrambled' || !plainObject(data) || !boundedString(data.guess, 64) || Date.now() > gs.deadlineAt) return;
    const player = room.players.get(socket.id);
    if (!player || player.disconnected) return;

    const word = gs.words[gs.round - 1];
    const guess = data.guess.toUpperCase().trim();

    if (guess === word) {
      if (gs.solvers.find(s => s.id === socket.id)) return;

      const elapsed = Date.now() - gs.roundStart;
      const rank = gs.solvers.length + 1;

      const pointTable = [150, 100, 75, 50];
      const points = pointTable[rank - 1] || 25;
      player.score += points;

      gs.solvers.push({ id: socket.id, name: player.name, time: elapsed, rank, points });
      socket.emit('game:state', { phase: 'solved', rank, points });

      // If everyone solved it, advance early (count only active players)
      let activePlayers = 0;
      for (const [, p] of room.players) { if (!p.disconnected) activePlayers++; }
      if (gs.solvers.length >= activePlayers && !gs.revealFired) {
        this._revealAnswer(room, io);
      }
    } else {
      socket.emit('game:state', { phase: 'wrong' });
    }
  },

  _revealAnswer(room, io) {
    const gs = room.gameState;
    if (gs.revealFired) return;
    gs.revealFired = true;
    gs.phase = 'reveal';

    // Cancel the round timer
    if (gs.currentRoundTimer) {
      clearTimeout(gs.currentRoundTimer);
      gs.currentRoundTimer = null;
    }

    const word = gs.words[gs.round - 1];
    gs.resultState = {
      phase: 'reveal',
      round: gs.round,
      totalRounds: gs.totalRounds,
      word,
      scrambled: gs.scrambled,
      wordLength: word.length,
      solvers: gs.solvers
    };
    io.to(room.code).emit('game:state', gs.resultState);

    const t = setTimeout(() => this._nextRound(room, io), 4000);
    this._addTimer(room, t);
  },

  _endGame(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'finished') return;
    gs.phase = 'finished';
    const scores = [];
    for (const [id, p] of room.players) {
      scores.push({ id, name: p.name, score: p.score });
    }
    scores.sort((a, b) => b.score - a.score);
    io.to(room.code).emit('game:end', { scores });
    room.state = 'results';
  },

  getReconnectState(room) {
    const gs = room.gameState;
    if (!gs) return null;
    if (gs.phase === 'scrambled') {
      const elapsed = Date.now() - gs.roundStart;
      const remaining = Math.max(0, 15000 - elapsed);
      return {
        phase: 'scrambled',
        round: gs.round,
        totalRounds: gs.totalRounds,
        scrambled: gs.scrambled,
        wordLength: gs.words[gs.round - 1].length,
        timeLimit: remaining / 1000,
        solvers: gs.solvers
      };
    }
    if (gs.phase === 'reveal') {
      return { ...gs.resultState };
    }
    return null;
  },

  migratePlayerIdentity(room, oldId, newId) { migrateIdentity(room.gameState, oldId, newId, { objectArrays: ['solvers'] }); },

  cleanup(room) {
    if (room._wsTimers) {
      room._wsTimers.forEach(t => clearTimeout(t));
      room._wsTimers = [];
    }
  }
};
