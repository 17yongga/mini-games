// Color Picker — Match the target color by mixing RGB sliders!
// Players adjust R, G, B sliders to get as close as possible to a shown target color.
// Score = accuracy (closeness) * speed bonus. 8 rounds.

const TOTAL_ROUNDS = 8;
const ROUND_TIME_MS = 30000; // 30 seconds per round
const RESULT_SHOW_MS = 4000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function colorDistance(c1, c2) {
  // Perceptually weighted Euclidean distance
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

const MAX_DIST = Math.sqrt(2 * 255 * 255 + 4 * 255 * 255 + 3 * 255 * 255); // ~765

function calcScore(dist, responseTime, timeLimit) {
  const accuracy = Math.max(0, 1 - dist / MAX_DIST);
  const speedFactor = Math.max(0.5, 1 - (responseTime / timeLimit) * 0.5);
  return Math.round(accuracy * accuracy * 1000 * speedFactor);
}

function generateTarget() {
  return {
    r: randomInt(20, 235),
    g: randomInt(20, 235),
    b: randomInt(20, 235)
  };
}

module.exports = {
  id: 'color-picker',
  name: 'Color Picker',
  description: 'Mix RGB sliders to match the target color as closely as you can!',
  icon: '🌈',
  minPlayers: 1,
  maxPlayers: 20,
  rounds: TOTAL_ROUNDS,

  init(room, io) {
    room.gameState = {
      round: 0,
      totalRounds: TOTAL_ROUNDS,
      phase: 'waiting',
      target: null,
      submissions: new Map(),
      roundStart: null
    };
    room._cpTimers = [];
    this._nextRound(room, io);
  },

  _addTimer(room, timer) {
    if (!room._cpTimers) room._cpTimers = [];
    room._cpTimers.push(timer);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    gs.phase = 'picking';
    gs.submissions = new Map();
    gs.target = generateTarget();
    gs.roundStart = Date.now();

    io.to(room.code).emit('game:state', {
      phase: 'picking',
      round: gs.round,
      totalRounds: gs.totalRounds,
      target: gs.target,
      timeLimit: ROUND_TIME_MS
    });

    const t = setTimeout(() => {
      if (gs.phase === 'picking') {
        this._resolveRound(room, io);
      }
    }, ROUND_TIME_MS);
    this._addTimer(room, t);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'submit' || gs.phase !== 'picking') return;
    if (gs.submissions.has(socket.id)) return;

    const r = Math.max(0, Math.min(255, parseInt(data.r) || 0));
    const g = Math.max(0, Math.min(255, parseInt(data.g) || 0));
    const b = Math.max(0, Math.min(255, parseInt(data.b) || 0));

    const responseTime = Date.now() - gs.roundStart;
    const dist = colorDistance({ r, g, b }, gs.target);
    const points = calcScore(dist, responseTime, ROUND_TIME_MS);

    gs.submissions.set(socket.id, { r, g, b, dist, points, responseTime });

    const player = room.players.get(socket.id);
    if (player) player.score += points;

    socket.emit('game:state', {
      phase: 'submitted',
      guess: { r, g, b },
      dist: Math.round(dist),
      points
    });

    // Resolve early if everyone submitted
    let allSubmitted = true;
    for (const [id] of room.players) {
      if (!gs.submissions.has(id)) { allSubmitted = false; break; }
    }
    if (allSubmitted) this._resolveRound(room, io);
  },

  _resolveRound(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'result') return;
    gs.phase = 'result';

    const results = [];
    for (const [id, sub] of gs.submissions) {
      const p = room.players.get(id);
      if (p) {
        results.push({
          name: p.name,
          guess: { r: sub.r, g: sub.g, b: sub.b },
          dist: Math.round(sub.dist),
          points: sub.points
        });
      }
    }
    // Players who didn't submit
    for (const [id, p] of room.players) {
      if (!gs.submissions.has(id)) {
        results.push({ name: p.name, guess: null, dist: 9999, points: 0 });
      }
    }
    results.sort((a, b) => a.dist - b.dist);

    const scores = [];
    for (const [, p] of room.players) {
      scores.push({ name: p.name, score: p.score });
    }
    scores.sort((a, b) => b.score - a.score);

    io.to(room.code).emit('game:state', {
      phase: 'result',
      round: gs.round,
      target: gs.target,
      results: results.slice(0, 10),
      scores
    });

    const t = setTimeout(() => this._nextRound(room, io), RESULT_SHOW_MS);
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

  getBotMove(room, bot) {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'picking' || !gs.target) return null;
    if (gs.submissions.has(bot.id)) return null;

    const spread = bot.difficulty === 'easy' ? 90 : bot.difficulty === 'medium' ? 35 : 12;
    return {
      event: 'submit',
      data: {
        r: Math.max(0, Math.min(255, gs.target.r + randomInt(-spread, spread))),
        g: Math.max(0, Math.min(255, gs.target.g + randomInt(-spread, spread))),
        b: Math.max(0, Math.min(255, gs.target.b + randomInt(-spread, spread)))
      },
      delayMs: randomInt(4000, 22000)
    };
  },

  getReconnectState(room) {
    const gs = room.gameState;
    if (!gs) return null;
    if (gs.phase === 'picking') {
      const elapsed = Date.now() - gs.roundStart;
      const remaining = Math.max(0, 30000 - elapsed);
      return {
        phase: 'picking',
        round: gs.round,
        totalRounds: gs.totalRounds,
        target: gs.target,
        timeLimit: remaining
      };
    }
    if (gs.phase === 'result') {
      return {
        phase: 'result',
        round: gs.round,
        totalRounds: gs.totalRounds,
        target: gs.target,
        results: gs.results
      };
    }
    return null;
  },

  cleanup(room) {
    if (room._cpTimers) {
      room._cpTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
      room._cpTimers = [];
    }
  }
};
