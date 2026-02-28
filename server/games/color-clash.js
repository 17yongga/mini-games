// Color Clash — Stroop Effect game
// A color WORD is shown in a DIFFERENT ink color. Players must tap the button
// matching the INK COLOR (not the word). Gets faster each round.

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const TOTAL_ROUNDS = 10;
const BASE_TIME_MS = 5000; // time to answer in round 1
const MIN_TIME_MS = 1500;  // fastest possible time limit
const TIME_DECAY = 300;    // ms less per round

module.exports = {
  id: 'color-clash',
  name: 'Color Clash',
  description: 'The word says RED but it\'s blue — tap the INK color, not the word!',
  icon: '🎨',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: TOTAL_ROUNDS,

  init(room, io) {
    room.gameState = {
      round: 0,
      totalRounds: TOTAL_ROUNDS,
      phase: 'waiting',
      word: null,
      inkColor: null,
      options: [],
      answers: new Map(),
      streaks: new Map()  // track consecutive correct answers per player
    };
    room._ccTimers = [];

    // Init streaks for all players
    for (const [id] of room.players) {
      room.gameState.streaks.set(id, 0);
    }

    this._nextRound(room, io);
  },

  _addTimer(room, timer) {
    if (!room._ccTimers) room._ccTimers = [];
    room._ccTimers.push(timer);
  },

  _generateQuestion() {
    // Pick a word color and a different ink color
    const wordIdx = Math.floor(Math.random() * COLORS.length);
    let inkIdx = wordIdx;
    while (inkIdx === wordIdx) {
      inkIdx = Math.floor(Math.random() * COLORS.length);
    }
    const word = COLORS[wordIdx];
    const inkColor = COLORS[inkIdx];

    // Generate 4 options that always include the correct answer (inkColor)
    // and the distractor (word), plus 2 random others
    const optionSet = new Set([inkColor, word]);
    while (optionSet.size < 4) {
      optionSet.add(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
    // Shuffle
    const options = Array.from(optionSet).sort(() => Math.random() - 0.5);

    return { word, inkColor, options };
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.phase = 'showing';
    gs.answers = new Map();

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    const q = this._generateQuestion();
    gs.word = q.word;
    gs.inkColor = q.inkColor;
    gs.options = q.options;

    const timeLimit = Math.max(MIN_TIME_MS, BASE_TIME_MS - (gs.round - 1) * TIME_DECAY);
    gs.timeLimit = timeLimit;
    gs.questionStart = Date.now();

    io.to(room.code).emit('game:state', {
      phase: 'question',
      round: gs.round,
      totalRounds: gs.totalRounds,
      word: gs.word,
      inkColor: gs.inkColor,
      options: gs.options,
      timeLimit
    });

    // Timeout
    const t = setTimeout(() => {
      if (gs.phase === 'showing') {
        this._resolveRound(room, io);
      }
    }, timeLimit);
    this._addTimer(room, t);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'answer' || gs.phase !== 'showing') return;
    if (gs.answers.has(socket.id)) return;

    const choice = data.choice;
    if (!gs.options.includes(choice)) return;

    const responseTime = Date.now() - gs.questionStart;
    gs.answers.set(socket.id, { choice, responseTime });

    const player = room.players.get(socket.id);
    if (!player) return;

    const correct = choice === gs.inkColor;
    if (correct) {
      const streak = (gs.streaks.get(socket.id) || 0) + 1;
      gs.streaks.set(socket.id, streak);
      // Base points + speed bonus + streak bonus
      const speedBonus = Math.max(0, Math.floor((gs.timeLimit - responseTime) / 50));
      const streakBonus = Math.min(streak - 1, 5) * 10;
      player.score += 100 + speedBonus + streakBonus;
    } else {
      gs.streaks.set(socket.id, 0);
    }

    // Acknowledge
    socket.emit('game:state', {
      phase: 'answered',
      correct,
      streak: gs.streaks.get(socket.id) || 0
    });

    // Check if all players answered
    let allAnswered = true;
    for (const [id] of room.players) {
      if (!gs.answers.has(id)) { allAnswered = false; break; }
    }
    if (allAnswered) {
      this._resolveRound(room, io);
    }
  },

  _resolveRound(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'result') return;
    gs.phase = 'result';

    const results = [];
    for (const [id, ans] of gs.answers) {
      const p = room.players.get(id);
      if (p) {
        results.push({
          name: p.name,
          correct: ans.choice === gs.inkColor,
          time: ans.responseTime
        });
      }
    }
    results.sort((a, b) => (b.correct - a.correct) || (a.time - b.time));

    io.to(room.code).emit('game:state', {
      phase: 'result',
      round: gs.round,
      correctAnswer: gs.inkColor,
      word: gs.word,
      results: results.slice(0, 5)
    });

    const t = setTimeout(() => this._nextRound(room, io), 3000);
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
    if (room._ccTimers) {
      room._ccTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
      room._ccTimers = [];
    }
  }
};
