// Type Racer — multiplayer typing speed competition
// Players race to type a displayed sentence. Scored on WPM × accuracy.
// Faster finishers get bonus points. 5 rounds per game.

const ROUND_TIME = 30000; // 30 seconds per round
const ROUNDS = 5;
const RESULT_DELAY = 3500;

const SENTENCE_POOL = [
  'The quick brown fox jumps over the lazy dog',
  'Pack my box with five dozen liquor jugs',
  'How vexingly quick daft zebras jump',
  'The five boxing wizards jump quickly',
  'Sphinx of black quartz judge my vow',
  'Bright vixens jump dozy fowl quack',
  'Jackdaws love my big sphinx of quartz',
  'The job requires extra pluck and zeal from every young wage earner',
  'A wizard quickly jinxed the gnomes before they vaporized',
  'Two driven jocks help fax my big quiz',
  'Fix problem quickly with galvanized jets',
  'Heavy boxes perform quick waltzes and jigs',
  'We promptly judged antique ivory buckles for the next prize',
  'Crazy Fredrick bought many very exquisite opal jewels',
  'Sixty zippers were quickly picked from the woven jute bag',
];

function pickSentences(count) {
  const pool = [...SENTENCE_POOL];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function calcScore(sentence, typed, elapsedMs) {
  if (!typed || typed.length === 0) return { wpm: 0, accuracy: 0, score: 0 };

  // WPM: standard word = 5 chars
  const wpm = Math.round((sentence.length / 5) / (elapsedMs / 60000));

  // Accuracy: compare char by char up to typed length
  const compareLen = Math.min(typed.length, sentence.length);
  let correctChars = 0;
  for (let i = 0; i < compareLen; i++) {
    if (typed[i] === sentence[i]) correctChars++;
  }
  const accuracy = correctChars / Math.max(1, typed.length);
  const score = Math.round(wpm * accuracy);

  return { wpm, accuracy: Math.round(accuracy * 100) / 100, score };
}

function _addTimer(room, t) {
  if (!room._trTimers) room._trTimers = [];
  room._trTimers.push(t);
}

module.exports = {
  id: 'type-racer',
  name: 'Type Racer',
  description: 'Race to type the sentence — speed and accuracy both matter!',
  icon: '⌨️',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: ROUNDS,

  init(room, io) {
    room.gameState = {
      round: 0,
      totalRounds: ROUNDS,
      phase: 'waiting',
      sentences: pickSentences(ROUNDS),
      progress: new Map(),   // socketId → { typed, pct }
      finishers: [],         // [{ id, name, wpm, accuracy, score, elapsed }] ordered by finish time
      roundStart: null,
      roundTimer: null,
    };
    room._trTimers = [];
    this._nextRound(room, io);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    gs.phase = 'typing';
    gs.progress = new Map();
    gs.finishers = [];
    gs.roundStart = Date.now();

    const sentence = gs.sentences[gs.round - 1];

    io.to(room.code).emit('game:state', {
      phase: 'typing',
      round: gs.round,
      totalRounds: gs.totalRounds,
      sentence,
      timeLimit: ROUND_TIME,
    });

    // Round timeout
    const t = setTimeout(() => {
      if (gs.phase === 'typing') this._roundResult(room, io);
    }, ROUND_TIME);
    _addTimer(room, t);

    // Countdown tick every second
    let remaining = ROUND_TIME;
    const tick = setInterval(() => {
      remaining -= 1000;
      if (remaining <= 0 || gs.phase !== 'typing') {
        clearInterval(tick);
        return;
      }
      io.to(room.code).emit('game:tick', { timeLeft: remaining });
    }, 1000);
    _addTimer(room, tick);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'typing') return;

    const sentence = gs.sentences[gs.round - 1];
    if (!sentence) return;

    if (event === 'progress') {
      if (!data || typeof data.typed !== 'string') return;
      const typed = data.typed.slice(0, sentence.length + 10); // clamp to prevent abuse
      const pct = Math.min(1, typed.length / sentence.length);
      gs.progress.set(socket.id, { typed, pct });

      // Broadcast progress to all players
      const progressList = [];
      for (const [id, p] of room.players) {
        const prog = gs.progress.get(id);
        progressList.push({
          id,
          name: p.name,
          pct: prog ? prog.pct : 0,
          finished: gs.finishers.some(f => f.id === id),
        });
      }
      io.to(room.code).emit('game:progress', { players: progressList });
      return;
    }

    if (event === 'finish') {
      // Ignore duplicate finishes
      if (gs.finishers.some(f => f.id === socket.id)) return;

      if (!data || typeof data.typed !== 'string') return;
      const elapsed = typeof data.elapsed === 'number' && data.elapsed > 0
        ? data.elapsed
        : Date.now() - gs.roundStart;

      const player = room.players.get(socket.id);
      if (!player) return;

      const { wpm, accuracy, score } = calcScore(sentence, data.typed, elapsed);

      // Only award score if they actually typed the sentence correctly
      const correct = data.typed === sentence;
      const finalScore = correct ? score : 0;
      const position = gs.finishers.length; // 0-indexed
      const bonus = [50, 30, 10][position] || 0;
      const totalPoints = finalScore + (correct ? bonus : 0);

      player.score += totalPoints;

      gs.finishers.push({
        id: socket.id,
        name: player.name,
        wpm,
        accuracy,
        score: totalPoints,
        elapsed,
        correct,
      });

      // Tell the finisher their result
      socket.emit('game:state', {
        phase: 'finished-round',
        wpm,
        accuracy,
        score: totalPoints,
        position: position + 1,
        correct,
      });

      // If all human players finished, end round early
      const humanPlayers = Array.from(room.players.values()).filter(p => !p.isBot);
      const allDone = humanPlayers.every(p => {
        const pid = [...room.players.entries()].find(([, v]) => v === p)?.[0];
        return pid && gs.finishers.some(f => f.id === pid);
      });

      if (allDone) {
        const t = setTimeout(() => this._roundResult(room, io), 1500);
        _addTimer(room, t);
      }
    }
  },

  _roundResult(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'result') return;
    gs.phase = 'result';

    io.to(room.code).emit('game:state', {
      phase: 'result',
      round: gs.round,
      finishers: gs.finishers,
      sentence: gs.sentences[gs.round - 1],
    });

    const t = setTimeout(() => this._nextRound(room, io), RESULT_DELAY);
    _addTimer(room, t);
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

  // Called by server on player rejoin — sends current round state so they're not stuck on blank screen
  getReconnectState(room) {
    const gs = room.gameState;
    if (!gs) return null;
    if (gs.phase === 'typing') {
      const sentence = gs.sentences[gs.round - 1];
      const elapsed = Date.now() - gs.roundStart;
      const remaining = Math.max(5000, ROUND_TIME - elapsed);
      return {
        phase: 'typing',
        round: gs.round,
        totalRounds: gs.totalRounds,
        sentence,
        timeLimit: remaining,
      };
    }
    if (gs.phase === 'result') {
      return {
        phase: 'result',
        round: gs.round,
        finishers: gs.finishers,
      };
    }
    return null;
  },

  cleanup(room) {
    if (room._trTimers) {
      room._trTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
      room._trTimers = [];
    }
  },
};
