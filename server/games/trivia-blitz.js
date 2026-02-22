// Trivia Blitz — fast multiple-choice questions, points for speed + correctness

const QUESTIONS = [
  { q: 'What planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], answer: 1 },
  { q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
  { q: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2 },
  { q: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
  { q: 'What year did the Titanic sink?', options: ['1905', '1912', '1918', '1923'], answer: 1 },
  { q: 'How many bones in the adult human body?', options: ['186', '206', '226', '256'], answer: 1 },
  { q: 'What is the smallest country in the world?', options: ['Monaco', 'Vatican City', 'Malta', 'Liechtenstein'], answer: 1 },
  { q: 'Which element has the atomic number 1?', options: ['Helium', 'Oxygen', 'Hydrogen', 'Carbon'], answer: 2 },
  { q: 'What is the speed of light in km/s (approx)?', options: ['150,000', '200,000', '300,000', '400,000'], answer: 2 },
  { q: 'Which country invented pizza?', options: ['Greece', 'France', 'Italy', 'Spain'], answer: 2 },
  { q: 'What is the longest river in the world?', options: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], answer: 1 },
  { q: 'How many strings does a standard guitar have?', options: ['4', '5', '6', '7'], answer: 2 },
  { q: 'What gas do plants absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Helium'], answer: 2 },
  { q: 'In what year did World War II end?', options: ['1943', '1944', '1945', '1946'], answer: 2 },
  { q: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'], answer: 2 },
  { q: 'Which animal is the tallest?', options: ['Elephant', 'Giraffe', 'Horse', 'Camel'], answer: 1 },
  { q: 'What does "HTTP" stand for?', options: ['HyperText Transfer Protocol', 'High Tech Transfer Program', 'HyperText Transmission Port', 'Home Tool Transfer Protocol'], answer: 0 },
  { q: 'How many continents are there?', options: ['5', '6', '7', '8'], answer: 2 },
  { q: 'Which planet has the most moons?', options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], answer: 1 },
  { q: 'What is the hardest natural substance?', options: ['Gold', 'Iron', 'Diamond', 'Platinum'], answer: 2 }
];

module.exports = {
  id: 'trivia-blitz',
  name: 'Trivia Blitz',
  description: 'Answer fast! Points for speed and accuracy.',
  icon: '🧠',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: 7,

  init(room, io) {
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
    room.gameState = {
      questions: shuffled.slice(0, this.rounds),
      round: 0,
      totalRounds: this.rounds,
      phase: 'waiting',
      answers: new Map(),
      questionStart: null,
      answerShown: false,
      currentRoundTimer: null // BUG FIX: track the specific round timer
    };
    room._tvTimers = [];
    this._nextQuestion(room, io);
  },

  _addTimer(room, timer) {
    if (!room._tvTimers) room._tvTimers = [];
    room._tvTimers.push(timer);
  },

  _nextQuestion(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.answers = new Map();
    gs.answerShown = false;

    // BUG FIX: cancel any leftover round timer from previous round
    if (gs.currentRoundTimer) {
      clearTimeout(gs.currentRoundTimer);
      gs.currentRoundTimer = null;
    }

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    const q = gs.questions[gs.round - 1];
    gs.phase = 'question';
    gs.questionStart = Date.now();

    // Tag the round number so timer can verify it's still the right round
    const thisRound = gs.round;

    io.to(room.code).emit('game:state', {
      phase: 'question',
      round: gs.round,
      totalRounds: gs.totalRounds,
      question: q.q,
      options: q.options,
      timeLimit: 10
    });

    // BUG FIX: store timer ref and verify round hasn't changed when it fires
    gs.currentRoundTimer = setTimeout(() => {
      if (gs.round === thisRound && !gs.answerShown) {
        this._showAnswer(room, io);
      }
    }, 10000);
    this._addTimer(room, gs.currentRoundTimer);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'answer' || gs.phase !== 'question') return;
    if (gs.answers.has(socket.id)) return;
    if (typeof data.choice !== 'number') return; // validate input

    const elapsed = Date.now() - gs.questionStart;
    gs.answers.set(socket.id, { choice: data.choice, time: elapsed });

    // Count only non-disconnected players for the "all answered" check
    let activePlayers = 0;
    for (const [, p] of room.players) {
      if (!p.disconnected) activePlayers++;
    }

    if (gs.answers.size >= activePlayers && !gs.answerShown) {
      this._showAnswer(room, io);
    }
  },

  _showAnswer(room, io) {
    const gs = room.gameState;
    if (gs.answerShown) return;
    if (gs.phase === 'finished') return;

    const q = gs.questions[gs.round - 1];
    if (!q) return; // Guard: round beyond question list

    gs.answerShown = true;
    gs.phase = 'answer';

    // BUG FIX: cancel the round timer since we're showing the answer now
    if (gs.currentRoundTimer) {
      clearTimeout(gs.currentRoundTimer);
      gs.currentRoundTimer = null;
    }
    const results = [];

    for (const [id, ans] of gs.answers) {
      const player = room.players.get(id);
      if (!player) continue;
      const correct = ans.choice === q.answer;
      let points = 0;
      if (correct) {
        points = 100 + Math.max(0, Math.floor((10000 - ans.time) / 80));
        player.score += points;
      }
      results.push({ id, name: player.name, correct, points, time: ans.time });
    }
    results.sort((a, b) => b.points - a.points);

    io.to(room.code).emit('game:state', {
      phase: 'answer',
      correctIndex: q.answer,
      correctText: q.options[q.answer],
      results
    });

    const t = setTimeout(() => this._nextQuestion(room, io), 4000);
    this._addTimer(room, t);
  },

  _endGame(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'finished') return;
    gs.phase = 'finished';
    if (gs.currentRoundTimer) {
      clearTimeout(gs.currentRoundTimer);
      gs.currentRoundTimer = null;
    }
    const scores = [];
    for (const [id, p] of room.players) {
      scores.push({ id, name: p.name, score: p.score });
    }
    scores.sort((a, b) => b.score - a.score);
    io.to(room.code).emit('game:end', { scores });
    room.state = 'results';
  },

  cleanup(room) {
    if (room.gameState?.currentRoundTimer) {
      clearTimeout(room.gameState.currentRoundTimer);
    }
    if (room._tvTimers) {
      room._tvTimers.forEach(t => clearTimeout(t));
      room._tvTimers = [];
    }
  }
};
