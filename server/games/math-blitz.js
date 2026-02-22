// Math Blitz — speed math competition
// Players race to solve arithmetic problems. Faster = more points.
// Difficulty increases each round.

const ROUND_TIME = 12000; // 12 seconds per problem
const ROUNDS = 8;

function generateProblem(round) {
  // Difficulty scales with round
  const level = Math.min(Math.floor((round - 1) / 2), 3); // 0-3

  let a, b, op, answer;

  switch (level) {
    case 0: // Easy: simple add/subtract
      a = 5 + Math.floor(Math.random() * 20);
      b = 2 + Math.floor(Math.random() * 15);
      if (Math.random() < 0.5) {
        op = '+'; answer = a + b;
      } else {
        if (a < b) [a, b] = [b, a];
        op = '−'; answer = a - b;
      }
      break;

    case 1: // Medium: multiply small, add/subtract bigger
      if (Math.random() < 0.4) {
        a = 2 + Math.floor(Math.random() * 10);
        b = 2 + Math.floor(Math.random() * 10);
        op = '×'; answer = a * b;
      } else {
        a = 20 + Math.floor(Math.random() * 80);
        b = 10 + Math.floor(Math.random() * 50);
        op = Math.random() < 0.5 ? '+' : '−';
        if (op === '−' && a < b) [a, b] = [b, a];
        answer = op === '+' ? a + b : a - b;
      }
      break;

    case 2: // Hard: larger multiply, multi-digit
      if (Math.random() < 0.5) {
        a = 5 + Math.floor(Math.random() * 15);
        b = 3 + Math.floor(Math.random() * 12);
        op = '×'; answer = a * b;
      } else {
        a = 50 + Math.floor(Math.random() * 200);
        b = 20 + Math.floor(Math.random() * 100);
        op = Math.random() < 0.5 ? '+' : '−';
        if (op === '−' && a < b) [a, b] = [b, a];
        answer = op === '+' ? a + b : a - b;
      }
      break;

    case 3: // Expert: squares, division, bigger multiply
      const type = Math.random();
      if (type < 0.3) {
        // Perfect square
        a = 4 + Math.floor(Math.random() * 16);
        b = 2;
        op = '²'; answer = a * a;
      } else if (type < 0.6) {
        // Division (clean)
        b = 2 + Math.floor(Math.random() * 12);
        answer = 2 + Math.floor(Math.random() * 20);
        a = b * answer;
        op = '÷';
      } else {
        a = 10 + Math.floor(Math.random() * 25);
        b = 10 + Math.floor(Math.random() * 25);
        op = '×'; answer = a * b;
      }
      break;
  }

  const display = op === '²' ? `${a}²` : `${a} ${op} ${b}`;
  return { display, answer, level };
}

module.exports = {
  id: 'math-blitz',
  name: 'Math Blitz',
  description: 'Race to solve math problems — speed matters!',
  icon: '🧮',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: ROUNDS,

  init(room, io) {
    const problems = [];
    for (let i = 0; i < ROUNDS; i++) {
      problems.push(generateProblem(i + 1));
    }

    room.gameState = {
      round: 0,
      totalRounds: ROUNDS,
      phase: 'waiting',
      problems,
      answers: new Map(),    // socketId → { answer, time }
      solvers: [],           // ordered list of correct solvers
      roundTimer: null,
      roundStart: null
    };
    room._mbTimers = [];
    this._nextRound(room, io);
  },

  _addTimer(room, timer) {
    if (!room._mbTimers) room._mbTimers = [];
    room._mbTimers.push(timer);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.phase = 'solving';
    gs.answers = new Map();
    gs.solvers = [];

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    const problem = gs.problems[gs.round - 1];
    gs.roundStart = Date.now();

    io.to(room.code).emit('game:state', {
      phase: 'solving',
      round: gs.round,
      totalRounds: gs.totalRounds,
      problem: problem.display,
      level: problem.level,
      timeLimit: ROUND_TIME
    });

    // Timer for round end
    const t = setTimeout(() => {
      if (gs.phase === 'solving' && gs.round <= gs.totalRounds) {
        this._roundResult(room, io);
      }
    }, ROUND_TIME);
    this._addTimer(room, t);

    // Tick countdown every second
    let remaining = ROUND_TIME;
    const tick = setInterval(() => {
      remaining -= 1000;
      if (remaining <= 0 || gs.phase !== 'solving') {
        clearInterval(tick);
        return;
      }
      io.to(room.code).emit('game:tick', { timeLeft: remaining });
    }, 1000);
    this._addTimer(room, tick);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'answer' || gs.phase !== 'solving') return;
    if (gs.answers.has(socket.id)) return; // already answered

    const answer = parseInt(data.answer, 10);
    if (isNaN(answer)) return;

    const elapsed = Date.now() - gs.roundStart;
    const problem = gs.problems[gs.round - 1];
    const correct = answer === problem.answer;

    gs.answers.set(socket.id, { answer, time: elapsed, correct });

    const player = room.players.get(socket.id);
    if (!player) return;

    if (correct) {
      gs.solvers.push({ id: socket.id, name: player.name, time: elapsed });

      // Points: base 100, speed bonus (max 150 for <2s), first-solver bonus 50
      const speedBonus = Math.max(0, Math.round(150 * (1 - elapsed / ROUND_TIME)));
      const firstBonus = gs.solvers.length === 1 ? 50 : 0;
      const points = 100 + speedBonus + firstBonus;
      player.score += points;

      // Tell solver they got it right
      socket.emit('game:state', {
        phase: 'answered',
        correct: true,
        points,
        solveTime: elapsed
      });
    } else {
      // Wrong answer — small penalty, can try again
      // Actually, let them try again by removing their answer
      gs.answers.delete(socket.id);
      socket.emit('game:state', {
        phase: 'wrong',
        yourAnswer: answer
      });
      return;
    }

    // If all players answered, end round early
    const humanPlayers = Array.from(room.players.entries())
      .filter(([, p]) => !p.isBot);
    const allHumansAnswered = humanPlayers.every(([id]) => gs.answers.has(id));
    const allBots = Array.from(room.players.entries())
      .filter(([, p]) => p.isBot)
      .every(([id]) => gs.answers.has(id));

    if (allHumansAnswered && allBots) {
      // Small delay so last solver sees their result
      const t = setTimeout(() => this._roundResult(room, io), 1500);
      this._addTimer(room, t);
    }
  },

  _roundResult(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'result') return;
    gs.phase = 'result';

    const problem = gs.problems[gs.round - 1];

    io.to(room.code).emit('game:state', {
      phase: 'result',
      round: gs.round,
      answer: problem.answer,
      problem: problem.display,
      solvers: gs.solvers.map(s => ({ name: s.name, time: s.time })),
      totalAnswered: gs.answers.size,
      totalPlayers: room.players.size
    });

    const t = setTimeout(() => this._nextRound(room, io), 3500);
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

  cleanup(room) {
    if (room._mbTimers) {
      room._mbTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
      room._mbTimers = [];
    }
  }
};
