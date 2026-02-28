// Bot manager — simulates AI players with varying difficulty
// Architecture: uses polling loops that survive across rounds.
// Each bot has ONE persistent interval per game that monitors phase changes.

const BOT_NAMES = [
  'RoboChamp', 'PixelPal', 'ByteBot', 'NeonNinja', 'TurboTap',
  'GlitchKing', 'LazerFox', 'CyberPunk', 'BotBoss', 'MegaByte',
  'ZapMaster', 'DataDog', 'WiFiWiz', 'ClickBot', 'SpeedyAI',
  'RoboRex', 'BitBlitz', 'CodeCat', 'QuantumQ', 'SteelSam'
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DIFF_EMOJI = { easy: '🟢', medium: '🟡', hard: '🔴' };

let botCounter = 0;

function createBot(room) {
  botCounter++;
  const id = `bot-${botCounter}-${Date.now()}`;
  const usedNames = new Set();
  for (const [, p] of room.players) usedNames.add(p.name);
  const available = BOT_NAMES.filter(n => !usedNames.has(n));
  const name = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : `Bot${botCounter}`;
  const difficulty = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];

  const bot = {
    name, score: 0, isHost: false, isBot: true,
    difficulty, diffEmoji: DIFF_EMOJI[difficulty]
  };
  room.players.set(id, bot);
  return { id, bot };
}

function removeBot(room, botId) {
  const player = room.players.get(botId);
  if (!player || !player.isBot) return false;
  room.players.delete(botId);
  return true;
}

function removeBots(room) {
  for (const [id, p] of room.players) {
    if (p.isBot) room.players.delete(id);
  }
}

function getBotIds(room) {
  const ids = [];
  for (const [id, p] of room.players) {
    if (p.isBot) ids.push(id);
  }
  return ids;
}

function fakeSocket(botId) {
  return { id: botId, emit: () => {}, join: () => {}, to: () => ({ emit: () => {} }) };
}

function diffRange(diff, easy, med, hard) {
  const r = diff === 'easy' ? easy : diff === 'medium' ? med : hard;
  return r[0] + Math.random() * (r[1] - r[0]);
}

function diffChance(diff, easy, med, hard) {
  const p = diff === 'easy' ? easy : diff === 'medium' ? med : hard;
  return Math.random() < p;
}

// ─── Main entry point ───
function scheduleBotActions(room, io) {
  const game = room.currentGame;
  if (!game) return;

  clearBotTimers(room);
  room._botTimers = [];

  const botIds = getBotIds(room);
  if (botIds.length === 0) return;

  botIds.forEach(botId => {
    const bot = room.players.get(botId);
    if (!bot) return;
    const sock = fakeSocket(botId);

    switch (game.id) {
      case 'reaction-race': startReactionBot(room, io, botId, bot, sock); break;
      case 'trivia-blitz':  startTriviaBot(room, io, botId, bot, sock); break;
      case 'tap-frenzy':    startTapBot(room, io, botId, bot, sock); break;
      case 'word-scramble': startWordBot(room, io, botId, bot, sock); break;
      case 'emoji-match':   startEmojiBot(room, io, botId, bot, sock); break;
      case 'math-blitz':    startMathBot(room, io, botId, bot, sock); break;
      case 'simon-says':    startSimonBot(room, io, botId, bot, sock); break;
      case 'color-clash':   startColorClashBot(room, io, botId, bot, sock); break;
    }
  });
}

function addTimer(room, t) {
  if (!room._botTimers) room._botTimers = [];
  room._botTimers.push(t);
}

// ─── Reaction Race Bot ───
// Single persistent interval per bot that watches for 'go' phase each round
function startReactionBot(room, io, botId, bot, sock) {
  let acted = false;
  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') { clearInterval(poll); return; }

    // Reset flag on new round (phase === 'ready')
    if (gs.phase === 'ready') { acted = false; return; }

    if (gs.phase === 'go' && !acted && !gs.tapped.has(botId)) {
      acted = true;
      const delay = diffRange(bot.difficulty, [400, 900], [220, 500], [130, 300]);
      const t = setTimeout(() => {
        if (room.gameState?.phase === 'go' && !room.gameState.tapped.has(botId)) {
          room.currentGame.onEvent(room, sock, 'tap', {}, io);
        }
      }, delay);
      addTimer(room, t);
    }
  }, 100);
  addTimer(room, poll);
}

// ─── Trivia Bot ───
function startTriviaBot(room, io, botId, bot, sock) {
  let lastRound = 0;
  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') { clearInterval(poll); return; }

    if (gs.phase === 'question' && gs.round !== lastRound && !gs.answers.has(botId)) {
      lastRound = gs.round;
      const q = gs.questions[gs.round - 1];
      const correct = diffChance(bot.difficulty, 0.4, 0.7, 0.92);
      const choice = correct ? q.answer : randomWrong(q.answer, q.options.length);
      const delay = diffRange(bot.difficulty, [4000, 8000], [2000, 5000], [800, 2500]);

      const t = setTimeout(() => {
        if (room.gameState?.phase === 'question' && !room.gameState.answers.has(botId)) {
          room.currentGame.onEvent(room, sock, 'answer', { choice }, io);
        }
      }, delay);
      addTimer(room, t);
    }
  }, 200);
  addTimer(room, poll);
}

function randomWrong(correctIdx, total) {
  let idx;
  do { idx = Math.floor(Math.random() * total); } while (idx === correctIdx);
  return idx;
}

// ─── Tap Frenzy Bot ───
// Watches for 'tapping' phase, starts a tap loop, stops on phase change, restarts next round
function startTapBot(room, io, botId, bot, sock) {
  let tapLoop = null;
  let lastRound = 0;

  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') {
      if (tapLoop) clearInterval(tapLoop);
      clearInterval(poll);
      return;
    }

    if (gs.phase === 'tapping' && gs.round !== lastRound) {
      lastRound = gs.round;
      // Start tapping
      const tps = diffRange(bot.difficulty, [3, 5], [6, 9], [10, 15]);
      const interval = Math.max(50, 1000 / tps);
      tapLoop = setInterval(() => {
        if (room.gameState?.phase !== 'tapping') {
          clearInterval(tapLoop);
          tapLoop = null;
          return;
        }
        room.currentGame.onEvent(room, sock, 'tap', {}, io);
      }, interval);
      addTimer(room, tapLoop);
    }
  }, 100);
  addTimer(room, poll);
}

// ─── Word Scramble Bot ───
function startWordBot(room, io, botId, bot, sock) {
  let lastRound = 0;
  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') { clearInterval(poll); return; }

    if (gs.phase === 'scrambled' && gs.round !== lastRound) {
      lastRound = gs.round;
      const word = gs.words[gs.round - 1];
      const willSolve = diffChance(bot.difficulty, 0.45, 0.75, 0.95);

      if (willSolve) {
        const delay = diffRange(bot.difficulty, [7000, 13000], [3500, 7000], [1500, 4000]);
        const t = setTimeout(() => {
          if (room.gameState?.phase === 'scrambled') {
            const already = room.gameState.solvers.find(s => s.id === botId);
            if (!already) {
              room.currentGame.onEvent(room, sock, 'guess', { guess: word }, io);
            }
          }
        }, delay);
        addTimer(room, t);
      }
    }
  }, 200);
  addTimer(room, poll);
}

// ─── Emoji Match Bot ───
// Persistent memory + turn watcher. Memory survives across the same round.
function startEmojiBot(room, io, botId, bot, sock) {
  const memory = new Map(); // index -> emoji (bot's memory of seen cards)
  let actedThisTurn = false;
  let lastRound = 0;

  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') { clearInterval(poll); return; }

    // New round: reset memory and acted flag
    if (gs.round !== lastRound && (gs.phase === 'playing' || gs.phase === 'roundResult')) {
      lastRound = gs.round;
      memory.clear();
      actedThisTurn = false;
    }

    // Passively observe revealed cards (learn from other players' flips)
    if (gs.board) {
      for (let i = 0; i < gs.board.length; i++) {
        // If a card was flipped (firstPick or secondPick) we can see its emoji
        if (gs.board[i] && !gs.revealed[i]) {
          // We learn about cards during flips by checking the board
          // The board always has values; gs.revealed tracks permanently matched
        }
      }
    }

    // Only act when it's our turn and game is in playing phase
    if (gs.phase !== 'playing' || gs.currentTurn !== botId || gs.locked) {
      if (gs.currentTurn !== botId) actedThisTurn = false;
      return;
    }

    if (actedThisTurn) return;
    actedThisTurn = true;

    // Build list of unrevealed indices
    const unrevealed = [];
    for (let i = 0; i < gs.boardSize; i++) {
      if (!gs.revealed[i]) unrevealed.push(i);
    }
    if (unrevealed.length < 2) return;

    // Memory check: try to find a known matching pair
    const memChance = bot.difficulty === 'easy' ? 0.2 : bot.difficulty === 'medium' ? 0.55 : 0.85;
    let pick1 = null, pick2 = null;

    if (Math.random() < memChance) {
      const byEmoji = new Map();
      for (const [idx, emoji] of memory) {
        if (!gs.revealed[idx]) {
          if (!byEmoji.has(emoji)) byEmoji.set(emoji, []);
          byEmoji.get(emoji).push(idx);
        }
      }
      for (const [, indices] of byEmoji) {
        if (indices.length >= 2) {
          pick1 = indices[0];
          pick2 = indices[1];
          break;
        }
      }
    }

    if (pick1 === null) {
      const shuffled = unrevealed.sort(() => Math.random() - 0.5);
      pick1 = shuffled[0];
      pick2 = shuffled[1];
    }

    // First flip after delay
    const delay1 = diffRange(bot.difficulty, [1200, 2000], [700, 1200], [400, 700]);
    const t1 = setTimeout(() => {
      const gs2 = room.gameState;
      if (!gs2 || gs2.currentTurn !== botId || gs2.phase !== 'playing' || gs2.locked) return;

      room.currentGame.onEvent(room, sock, 'flip', { index: pick1 }, io);
      // Remember what we saw
      if (gs2.board[pick1]) memory.set(pick1, gs2.board[pick1]);

      // Second flip after delay
      const delay2 = diffRange(bot.difficulty, [800, 1500], [500, 900], [300, 600]);
      const t2 = setTimeout(() => {
        const gs3 = room.gameState;
        if (!gs3 || gs3.currentTurn !== botId || gs3.phase !== 'playing') return;
        if (gs3.firstPick === null) return; // already resolved somehow

        room.currentGame.onEvent(room, sock, 'flip', { index: pick2 }, io);
        if (gs3.board[pick2]) memory.set(pick2, gs3.board[pick2]);

        // After the flip resolves (match or unflip), reset actedThisTurn
        // so the poll loop can fire again if we get another turn (match = same player)
        setTimeout(() => { actedThisTurn = false; }, 1500);
      }, delay2);
      addTimer(room, t2);
    }, delay1);
    addTimer(room, t1);
  }, 300);
  addTimer(room, poll);
}

// ─── Math Blitz Bot ───
function startMathBot(room, io, botId, bot, sock) {
  let lastRound = 0;
  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') { clearInterval(poll); return; }

    if (gs.phase === 'solving' && gs.round !== lastRound && !gs.answers.has(botId)) {
      lastRound = gs.round;
      const problem = gs.problems[gs.round - 1];
      const willSolve = diffChance(bot.difficulty, 0.5, 0.8, 0.95);

      if (willSolve) {
        const delay = diffRange(bot.difficulty, [4000, 9000], [2000, 5000], [800, 2500]);
        const t = setTimeout(() => {
          if (room.gameState?.phase === 'solving' && !room.gameState.answers.has(botId)) {
            room.currentGame.onEvent(room, sock, 'answer', { answer: String(problem.answer) }, io);
          }
        }, delay);
        addTimer(room, t);
      } else {
        // Wrong answer attempt (then maybe give up)
        const delay = diffRange(bot.difficulty, [3000, 7000], [2000, 5000], [1500, 3000]);
        const t = setTimeout(() => {
          if (room.gameState?.phase === 'solving' && !room.gameState.answers.has(botId)) {
            const wrongAnswer = problem.answer + (Math.random() < 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 10));
            room.currentGame.onEvent(room, sock, 'answer', { answer: String(wrongAnswer) }, io);
            // Try again with correct answer sometimes
            if (diffChance(bot.difficulty, 0.2, 0.4, 0.6)) {
              const retry = setTimeout(() => {
                if (room.gameState?.phase === 'solving' && !room.gameState.answers.has(botId)) {
                  room.currentGame.onEvent(room, sock, 'answer', { answer: String(problem.answer) }, io);
                }
              }, diffRange(bot.difficulty, [2000, 4000], [1000, 2500], [500, 1500]));
              addTimer(room, retry);
            }
          }
        }, delay);
        addTimer(room, t);
      }
    }
  }, 200);
  addTimer(room, poll);
}

// ─── Simon Says Bot ───
function startSimonBot(room, io, botId, bot, sock) {
  let lastRound = 0;
  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') { clearInterval(poll); return; }
    if (gs.eliminated.has(botId)) { clearInterval(poll); return; }

    if (gs.phase === 'input' && gs.round !== lastRound) {
      lastRound = gs.round;
      const sequence = gs.fullSequence.slice(0, gs.round);

      // Chance of making a mistake increases with sequence length
      const baseAccuracy = bot.difficulty === 'easy' ? 0.7 : bot.difficulty === 'medium' ? 0.85 : 0.95;
      const roundPenalty = gs.round * 0.03;
      const accuracy = Math.max(0.3, baseAccuracy - roundPenalty);

      const willBeCorrect = Math.random() < accuracy;
      const speed = diffRange(bot.difficulty, [800, 1200], [500, 800], [300, 500]);

      // Enter sequence one color at a time
      sequence.forEach((color, i) => {
        const delay = speed * (i + 1) + Math.random() * 200;
        const t = setTimeout(() => {
          if (gs.eliminated.has(botId) || gs.phase !== 'input') return;

          let inputColor = color;
          // On the last color, maybe mess up
          if (!willBeCorrect && i === sequence.length - 1) {
            const COLORS = ['red', 'blue', 'green', 'yellow'];
            const wrong = COLORS.filter(c => c !== color);
            inputColor = wrong[Math.floor(Math.random() * wrong.length)];
          }

          room.currentGame.onEvent(room, sock, 'input', { color: inputColor }, io);
        }, delay);
        addTimer(room, t);
      });
    }
  }, 200);
  addTimer(room, poll);
}

// ─── Color Clash Bot ───
function startColorClashBot(room, io, botId, bot, sock) {
  let lastRound = 0;
  const poll = setInterval(() => {
    const gs = room.gameState;
    if (!gs || gs.phase === 'finished') { clearInterval(poll); return; }

    if (gs.phase === 'showing' && gs.round !== lastRound && !gs.answers.has(botId)) {
      lastRound = gs.round;
      const correct = diffChance(bot.difficulty, 0.5, 0.75, 0.93);
      const choice = correct ? gs.inkColor : gs.word; // wrong = picks the word (classic Stroop error)
      const delay = diffRange(bot.difficulty, [2000, 4000], [1000, 2500], [400, 1200]);

      const t = setTimeout(() => {
        if (room.gameState?.phase === 'showing' && !room.gameState.answers.has(botId)) {
          room.currentGame.onEvent(room, sock, 'answer', { choice }, io);
        }
      }, delay);
      addTimer(room, t);
    }
  }, 150);
  addTimer(room, poll);
}

function clearBotTimers(room) {
  if (room._botTimers) {
    room._botTimers.forEach(t => {
      clearTimeout(t);
      clearInterval(t);
    });
    room._botTimers = [];
  }
}

module.exports = { createBot, removeBot, removeBots, getBotIds, scheduleBotActions, clearBotTimers, fakeSocket, DIFF_EMOJI };
