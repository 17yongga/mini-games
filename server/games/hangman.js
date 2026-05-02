// Hangman — multiplayer word guessing, shared hangman, race to solve

const WORDS = [
  // Tech
  { word: 'ALGORITHM', hint: 'Computer Science' },
  { word: 'DATABASE', hint: 'Computer Science' },
  { word: 'KEYBOARD', hint: 'Technology' },
  { word: 'BROWSER', hint: 'Technology' },
  { word: 'JAVASCRIPT', hint: 'Programming' },
  { word: 'INTERFACE', hint: 'Technology' },
  { word: 'BANDWIDTH', hint: 'Technology' },
  { word: 'FIREWALL', hint: 'Technology' },
  { word: 'ENCRYPTION', hint: 'Technology' },
  { word: 'FRAMEWORK', hint: 'Programming' },
  // Nature
  { word: 'AVALANCHE', hint: 'Nature' },
  { word: 'VOLCANO', hint: 'Nature' },
  { word: 'HURRICANE', hint: 'Weather' },
  { word: 'WATERFALL', hint: 'Nature' },
  { word: 'LIGHTNING', hint: 'Weather' },
  { word: 'TROPICAL', hint: 'Nature' },
  { word: 'ECOSYSTEM', hint: 'Nature' },
  { word: 'BLIZZARD', hint: 'Weather' },
  // Food
  { word: 'CROISSANT', hint: 'Food' },
  { word: 'SPAGHETTI', hint: 'Food' },
  { word: 'AVOCADO', hint: 'Food' },
  { word: 'CINNAMON', hint: 'Food' },
  { word: 'MUSHROOM', hint: 'Food' },
  { word: 'PINEAPPLE', hint: 'Food' },
  { word: 'CHOCOLATE', hint: 'Food' },
  { word: 'BROCCOLI', hint: 'Food' },
  // Sports & Games
  { word: 'MARATHON', hint: 'Sports' },
  { word: 'CHAMPION', hint: 'Sports' },
  { word: 'STRATEGY', hint: 'Games' },
  { word: 'TOURNAMENT', hint: 'Sports' },
  { word: 'GOALKEEPER', hint: 'Sports' },
  { word: 'SKATEBOARD', hint: 'Sports' },
  // General
  { word: 'ADVENTURE', hint: 'General' },
  { word: 'ELEPHANT', hint: 'Animals' },
  { word: 'TREASURE', hint: 'General' },
  { word: 'DEMOCRACY', hint: 'Politics' },
  { word: 'SYMPHONY', hint: 'Music' },
  { word: 'DINOSAUR', hint: 'Animals' },
  { word: 'LABYRINTH', hint: 'General' },
  { word: 'CATAPULT', hint: 'History' },
  { word: 'GALAXY', hint: 'Space' },
  { word: 'ASTRONAUT', hint: 'Space' },
  { word: 'TELESCOPE', hint: 'Space' },
  { word: 'SUBMARINE', hint: 'Naval' },
  { word: 'CATHEDRAL', hint: 'Architecture' },
  { word: 'COMPASS', hint: 'Navigation' },
  { word: 'PLATINUM', hint: 'Metals' },
  { word: 'LABRADOR', hint: 'Animals' },
];

// Letter frequency in English (for bot AI)
const LETTER_FREQ = ['E','T','A','O','I','N','S','H','R','D','L','C','U','M','W','F','G','Y','P','B','V','K','J','X','Q','Z'];

const MAX_WRONG = 6;
const ROUNDS = 5;
const ROUND_TIME = 60; // seconds

module.exports = {
  id: 'hangman',
  name: 'Hangman',
  description: 'Guess the word letter by letter — wrong guesses build the hangman!',
  icon: '🪢',
  minPlayers: 2,
  maxPlayers: 16,

  init(room, io) {
    const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
    room.gameState = {
      words: shuffled.slice(0, ROUNDS),
      round: 0,
      totalRounds: ROUNDS,
      phase: 'waiting',
      // Per-round state
      word: '',
      hint: '',
      blanks: [],         // revealed array e.g. ['H','_','_','_']
      wrongLetters: [],   // letters guessed wrong
      correctLetters: [], // letters guessed right
      roundSolver: null,  // first player to guess the full word
      letterContributors: {}, // playerId → points earned this round
      roundStart: null,
    };
    room._hgTimers = [];
    this._nextRound(room, io);
  },

  _addTimer(room, t) {
    if (!room._hgTimers) room._hgTimers = [];
    room._hgTimers.push(t);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    const entry = gs.words[gs.round - 1];
    gs.word = entry.word;
    gs.hint = entry.hint;
    gs.blanks = gs.word.split('').map(() => '_');
    gs.wrongLetters = [];
    gs.correctLetters = [];
    gs.roundSolver = null;
    gs.letterContributors = {};
    gs.phase = 'playing';
    gs.roundStart = Date.now();
    gs.revealFired = false;

    io.to(room.code).emit('game:state', {
      phase: 'round_start',
      round: gs.round,
      totalRounds: gs.totalRounds,
      blanks: gs.blanks,
      hint: gs.hint,
      wrongLetters: gs.wrongLetters,
      wrongCount: 0,
      maxWrong: MAX_WRONG,
      timeLimit: ROUND_TIME,
    });

    // Round time limit
    gs.roundTimer = setTimeout(() => {
      if (!gs.revealFired) this._revealWord(room, io, 'timeout');
    }, ROUND_TIME * 1000);
    this._addTimer(room, gs.roundTimer);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (gs.phase !== 'playing') return;

    const player = room.players.get(socket.id);
    if (!player) return;

    if (event === 'guess_letter') {
      this._handleLetterGuess(room, socket, player, data, io);
    } else if (event === 'guess_word') {
      this._handleWordGuess(room, socket, player, data, io);
    }
  },

  _handleLetterGuess(room, socket, player, data, io) {
    const gs = room.gameState;
    const letter = (data.letter || '').toUpperCase().trim();

    if (!letter || letter.length !== 1 || !/[A-Z]/.test(letter)) return;
    if (gs.wrongLetters.includes(letter) || gs.correctLetters.includes(letter)) {
      socket.emit('game:state', { phase: 'already_guessed', letter });
      return;
    }

    if (gs.word.includes(letter)) {
      // Correct letter
      gs.correctLetters.push(letter);
      // Reveal in blanks
      gs.word.split('').forEach((ch, i) => {
        if (ch === letter) gs.blanks[i] = letter;
      });

      // Award points for this letter
      const letterCount = gs.word.split('').filter(c => c === letter).length;
      const pts = letterCount * 10;
      player.score += pts;
      gs.letterContributors[socket.id] = (gs.letterContributors[socket.id] || 0) + pts;

      // Check if word fully revealed
      const solved = gs.blanks.every(b => b !== '_');
      if (solved && !gs.roundSolver) {
        // Word completed by gradual guessing — bonus for last letter
        player.score += 50;
        gs.roundSolver = { id: socket.id, name: player.name, method: 'letters' };
        if (!gs.revealFired) this._revealWord(room, io, 'solved');
      } else {
        io.to(room.code).emit('game:state', {
          phase: 'letter_correct',
          letter,
          blanks: gs.blanks,
          wrongLetters: gs.wrongLetters,
          wrongCount: gs.wrongLetters.length,
          playerName: player.name,
        });
      }
    } else {
      // Wrong letter
      gs.wrongLetters.push(letter);
      io.to(room.code).emit('game:state', {
        phase: 'letter_wrong',
        letter,
        blanks: gs.blanks,
        wrongLetters: gs.wrongLetters,
        wrongCount: gs.wrongLetters.length,
        maxWrong: MAX_WRONG,
        playerName: player.name,
      });

      if (gs.wrongLetters.length >= MAX_WRONG && !gs.revealFired) {
        this._revealWord(room, io, 'hanged');
      }
    }
  },

  _handleWordGuess(room, socket, player, data, io) {
    const gs = room.gameState;
    const guess = (data.word || '').toUpperCase().trim();

    if (!guess) return;
    if (guess === gs.word) {
      // Correct full word guess!
      if (!gs.roundSolver) {
        const elapsed = Date.now() - gs.roundStart;
        const timeBonus = Math.max(0, Math.floor((ROUND_TIME - elapsed / 1000) * 2));
        const basePoints = 150 - (gs.wrongLetters.length * 15);
        const total = Math.max(50, basePoints) + timeBonus;
        player.score += total;
        gs.roundSolver = { id: socket.id, name: player.name, method: 'word', points: total };
        gs.blanks = gs.word.split(''); // reveal all
        if (!gs.revealFired) this._revealWord(room, io, 'solved');
      }
    } else {
      socket.emit('game:state', { phase: 'word_wrong' });
    }
  },

  _revealWord(room, io, reason) {
    const gs = room.gameState;
    if (gs.revealFired) return;
    gs.revealFired = true;
    gs.phase = 'reveal';

    if (gs.roundTimer) {
      clearTimeout(gs.roundTimer);
      gs.roundTimer = null;
    }

    io.to(room.code).emit('game:state', {
      phase: 'reveal',
      word: gs.word,
      hint: gs.hint,
      wrongLetters: gs.wrongLetters,
      wrongCount: gs.wrongLetters.length,
      reason,
      solver: gs.roundSolver,
    });

    const t = setTimeout(() => this._nextRound(room, io), 5000);
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

  // Bot AI
  getBotMove(room, bot) {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'playing') return null;

    const guessed = new Set([...gs.wrongLetters, ...gs.correctLetters]);
    const unguessedLetters = LETTER_FREQ.filter(l => !guessed.has(l));

    if (unguessedLetters.length === 0) return null;

    // Check if we can guess the full word (hard bots only)
    if (bot.difficulty === 'hard') {
      // If more than half the blanks are revealed, try to guess the word
      const revealed = gs.blanks.filter(b => b !== '_').length;
      if (revealed >= gs.word.length * 0.6) {
        // Smart: try to infer the word from pattern (simplified — just guess the word if few blanks left)
        if (gs.blanks.filter(b => b === '_').length <= 2) {
          // Build possible completions using most-likely remaining letters
          const remaining = unguessedLetters.slice(0, 3);
          let candidate = gs.blanks.join('');
          for (const l of remaining) {
            candidate = candidate.replace(/_/g, l);
            if (!candidate.includes('_')) break;
          }
          if (!candidate.includes('_')) {
            return { event: 'guess_word', data: { word: candidate } };
          }
        }
      }
    }

    let pick;
    if (bot.difficulty === 'easy') {
      // Random from unguessed
      pick = unguessedLetters[Math.floor(Math.random() * unguessedLetters.length)];
    } else if (bot.difficulty === 'medium') {
      // First 10 by frequency
      pick = unguessedLetters.slice(0, Math.min(10, unguessedLetters.length));
      pick = pick[Math.floor(Math.random() * pick.length)];
    } else {
      // Hard: strict frequency order, but skip rare letters early
      const revealed = gs.blanks.filter(b => b !== '_').length;
      if (revealed < 3) {
        // Early game: only guess top-5 most common
        pick = unguessedLetters.slice(0, 5)[Math.floor(Math.random() * 5)] || unguessedLetters[0];
      } else {
        pick = unguessedLetters[0];
      }
    }

    return { event: 'guess_letter', data: { letter: pick } };
  },

  getReconnectState(room) {
    const gs = room.gameState;
    if (!gs) return null;
    if (gs.phase === 'playing') {
      return {
        phase: 'playing',
        round: gs.round,
        totalRounds: gs.totalRounds,
        word: gs.word,
        blanks: gs.blanks,
        correctLetters: gs.correctLetters,
        wrongLetters: gs.wrongLetters,
        wrongCount: gs.wrongCount,
        maxWrong: gs.maxWrong
      };
    }
    if (gs.phase === 'reveal') {
      return {
        phase: 'reveal',
        round: gs.round,
        totalRounds: gs.totalRounds,
        word: gs.word,
        winner: gs.winner,
        reason: gs.reason
      };
    }
    return null;
  },

  cleanup(room) {
    if (room._hgTimers) {
      room._hgTimers.forEach(t => clearTimeout(t));
      room._hgTimers = [];
    }
  }
};
