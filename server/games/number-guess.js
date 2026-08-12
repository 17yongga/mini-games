// Number Guess — multiplayer hot/cold number guessing
const { now, plainObject, finiteInteger, migrateIdentity } = require('./_shared');
// A secret number is picked each round. Players guess — server says higher/lower.
// Hints are broadcast to all. First correct guess wins the round.
// Scoring: 100 pts correct + 50 bonus for first + fewer guesses = more bonus pts.

const ROUNDS = 5;
const ROUND_TIME = 45000; // 45 seconds per round
const RESULT_DELAY = 4000;

function getRange(round) {
  if (round <= 2) return { min: 1, max: 100 };
  if (round <= 4) return { min: 1, max: 200 };
  return { min: 1, max: 500 };
}

function pickNumber(round) {
  const { min, max } = getRange(round);
  return min + Math.floor(Math.random() * (max - min + 1));
}

module.exports = {
  id: 'number-guess',
  name: 'Number Guess',
  description: 'Guess the secret number — higher/lower hints shared with all!',
  icon: '🔢',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: ROUNDS,

  init(room, io) {
    room.gameState = {
      round: 0,
      totalRounds: ROUNDS,
      phase: 'waiting',
      secret: null,
      range: null,
      guessLog: [],         // [{ playerName, guess, hint }]
      guessCounts: new Map(), // socketId → number of guesses
      solved: false,
      solvers: [],          // ordered list of who guessed correctly
      roundTimer: null
    };
    room._ngTimers = [];
    this._nextRound(room, io);
  },

  _addTimer(room, t) {
    if (!room._ngTimers) room._ngTimers = [];
    room._ngTimers.push(t);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    gs.phase = 'guessing';
    gs.secret = pickNumber(gs.round);
    gs.range = getRange(gs.round);
    gs.guessLog = [];
    gs.guessCounts = new Map();
    gs.solved = false;
    gs.solvers = [];
    gs.roundStart = Date.now();
    gs.deadlineAt = gs.roundStart + ROUND_TIME;
    gs.rate = new Map();

    io.to(room.code).emit('game:state', {
      phase: 'guessing',
      round: gs.round,
      totalRounds: gs.totalRounds,
      range: gs.range,
      guessLog: [],
      timeLimit: ROUND_TIME
    });

    // Round timer
    const t = setTimeout(() => {
      if (gs.phase === 'guessing') this._roundResult(room, io, 'timeout');
    }, ROUND_TIME);
    this._addTimer(room, t);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'guess' || gs.phase !== 'guessing' || gs.solved || !plainObject(data) || Date.now() > gs.deadlineAt) return;

    const guess = data.guess;
    if (!finiteInteger(guess)) return;
    if (guess < gs.range.min || guess > gs.range.max) {
      socket.emit('game:state', {
        phase: 'invalid',
        message: `Guess must be between ${gs.range.min} and ${gs.range.max}`
      });
      return;
    }

    const player = room.players.get(socket.id);
    if (!player || player.disconnected) return;
    const at = now(room), recent = (gs.rate.get(socket.id) || []).filter(t => at - t < 1000);
    if (recent.length >= 6) return; recent.push(at); gs.rate.set(socket.id, recent);

    // Track guess count
    const prev = gs.guessCounts.get(socket.id) || 0;
    gs.guessCounts.set(socket.id, prev + 1);

    let hint;
    if (guess === gs.secret) {
      gs.solved = true;
      hint = 'correct';
      const guessCount = gs.guessCounts.get(socket.id);
      gs.solvers.push({ id: socket.id, name: player.name, guesses: guessCount });

      // Fewer guesses = more bonus (max 100 bonus for 1 guess, -10 per extra)
      const firstBonus = gs.solvers.length === 1 ? 50 : 0;
      const guessBonus = Math.max(0, 100 - (guessCount - 1) * 10);
      const points = 100 + firstBonus + guessBonus;
      player.score += points;

      gs.guessLog.push({ playerName: player.name, guess, hint, points });

      io.to(room.code).emit('game:state', {
        phase: 'guess-result',
        guess,
        hint,
        playerName: player.name,
        guessLog: gs.guessLog,
        points
      });

      socket.emit('game:state', {
        phase: 'you-solved',
        guess,
        points,
        guesses: guessCount
      });

      // End round once first solver is found (with small delay for drama)
      if (gs.solvers.length === 1) {
        const t = setTimeout(() => this._roundResult(room, io, 'solved'), 2000);
        this._addTimer(room, t);
      }
    } else {
      hint = guess < gs.secret ? 'higher' : 'lower';
      gs.guessLog.push({ playerName: player.name, guess, hint });
      if (gs.guessLog.length > 50) gs.guessLog.shift();

      io.to(room.code).emit('game:state', {
        phase: 'guess-result',
        guess,
        hint,
        playerName: player.name,
        guessLog: gs.guessLog
      });
    }
  },

  getBotMove(room, bot) {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'guessing') return null;

    // Bot tracks range based on ALL hints in the log (learns from other players)
    let lo = gs.range.min;
    let hi = gs.range.max;

    for (const entry of gs.guessLog) {
      // Read ALL hints, not just bot's own - humans would do this too
      if (entry.hint === 'higher') lo = Math.max(lo, entry.guess + 1);
      if (entry.hint === 'lower') hi = Math.min(hi, entry.guess - 1);
    }

    if (lo > hi) return null;

    let guess;
    const difficulty = bot.difficulty || 'medium';

    if (difficulty === 'hard') {
      // Pure binary search
      guess = Math.floor((lo + hi) / 2);
    } else if (difficulty === 'medium') {
      // Binary search + small noise
      const mid = Math.floor((lo + hi) / 2);
      const noise = Math.floor((hi - lo) * 0.1);
      guess = mid + (Math.floor(Math.random() * (noise * 2 + 1)) - noise);
      guess = Math.max(lo, Math.min(hi, guess));
    } else {
      // Easy: random within range
      guess = lo + Math.floor(Math.random() * (hi - lo + 1));
    }

    return { event: 'guess', data: { guess } };
  },

  getReconnectState(room) {
    const gs = room.gameState;
    if (!gs) return null;
    if (gs.phase === 'guessing') {
      const elapsed = Date.now() - gs.roundStart;
      const remaining = Math.max(0, ROUND_TIME - elapsed);
      return {
        phase: 'guessing',
        round: gs.round,
        totalRounds: gs.totalRounds,
        range: gs.range,
        guessLog: gs.guessLog,
        timeLimit: remaining
      };
    }
    if (gs.phase === 'result') {
      return {
        phase: 'result',
        round: gs.round,
        totalRounds: gs.totalRounds,
        secret: gs.secret,
        solvers: gs.solvers.map(s => ({ name: s.name, guesses: s.guesses })),
        reason: gs.resultReason,
        guessLog: gs.guessLog
      };
    }
    return null;
  },

  _roundResult(room, io, reason) {
    const gs = room.gameState;
    if (gs.phase === 'result') return;
    gs.phase = 'result';
    gs.resultReason = reason;

    gs.resultState = {
      phase: 'result',
      round: gs.round,
      totalRounds: gs.totalRounds,
      secret: gs.secret,
      reason,
      solvers: gs.solvers.map(s => ({ name: s.name, guesses: s.guesses })),
      guessLog: gs.guessLog
    };
    io.to(room.code).emit('game:state', gs.resultState);

    const t = setTimeout(() => this._nextRound(room, io), RESULT_DELAY);
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

  migratePlayerIdentity(room, oldId, newId) { migrateIdentity(room.gameState, oldId, newId, { maps: ['guessCounts', 'rate'], objectArrays: ['solvers'] }); },

  cleanup(room) {
    if (room._ngTimers) {
      room._ngTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
      room._ngTimers = [];
    }
  }
};
