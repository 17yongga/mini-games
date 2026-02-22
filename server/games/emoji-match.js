// Emoji Match — competitive memory card game, find pairs fastest

const EMOJI_POOL = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐙', '🦄',
  '🐝', '🦋', '🐢', '🐬', '🦈', '🦅', '🔥', '⭐',
  '🌈', '🎸', '🎯', '🚀', '💎', '🍕', '🎮', '🏆'
];

module.exports = {
  id: 'emoji-match',
  name: 'Emoji Match',
  description: 'Find matching pairs! Best memory wins.',
  icon: '🃏',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: 3,

  init(room, io) {
    room.gameState = {
      round: 0,
      totalRounds: this.rounds,
      phase: 'waiting',
      board: [],
      revealed: [],     // permanently revealed (matched)
      currentTurn: null,
      firstPick: null,
      secondPick: null,  // NEW: track second pick to prevent triple-flip
      locked: false,     // NEW: lock input during flip animation
      pairsFound: new Map(),
      turnOrder: [],
      turnIndex: 0,
      boardSize: 16
    };
    room._emTimers = []; // track all emoji-match timers
    this._nextRound(room, io);
  },

  _generateBoard(size) {
    const pairCount = size / 2;
    const shuffledEmoji = [...EMOJI_POOL].sort(() => Math.random() - 0.5);
    const selected = shuffledEmoji.slice(0, pairCount);
    const board = [...selected, ...selected].sort(() => Math.random() - 0.5);
    return board;
  },

  _addTimer(room, timer) {
    if (!room._emTimers) room._emTimers = [];
    room._emTimers.push(timer);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.pairsFound = new Map();

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    const sizes = [12, 16, 20];
    gs.boardSize = sizes[gs.round - 1] || 16;
    gs.board = this._generateBoard(gs.boardSize);
    gs.revealed = new Array(gs.boardSize).fill(false);
    gs.firstPick = null;
    gs.secondPick = null;
    gs.locked = false;

    // Build turn order, filtering out disconnected players
    gs.turnOrder = Array.from(room.players.keys()).sort(() => Math.random() - 0.5);
    gs.turnIndex = 0;

    for (const [id] of room.players) gs.pairsFound.set(id, 0);

    gs.phase = 'playing';
    gs.currentTurn = gs.turnOrder[0];

    io.to(room.code).emit('game:state', {
      phase: 'playing',
      round: gs.round,
      totalRounds: gs.totalRounds,
      boardSize: gs.boardSize,
      cols: gs.boardSize <= 12 ? 4 : gs.boardSize <= 16 ? 4 : 5,
      currentTurn: gs.currentTurn,
      currentTurnName: room.players.get(gs.currentTurn)?.name
    });
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'flip' || gs.phase !== 'playing') return;
    if (socket.id !== gs.currentTurn) return;
    if (gs.locked) return; // BUG FIX: reject clicks during animation

    const idx = data.index;
    if (idx < 0 || idx >= gs.boardSize || gs.revealed[idx]) return;

    // BUG FIX: can't click same card as first pick
    if (gs.firstPick === idx) return;

    if (gs.firstPick === null) {
      // First card
      gs.firstPick = idx;
      io.to(room.code).emit('game:state', {
        phase: 'flip',
        index: idx,
        emoji: gs.board[idx]
      });
    } else if (gs.secondPick === null) {
      // Second card — lock immediately to prevent third flip
      gs.secondPick = idx;
      gs.locked = true;

      const first = gs.firstPick;
      const second = idx;

      io.to(room.code).emit('game:state', {
        phase: 'flip',
        index: second,
        emoji: gs.board[second]
      });

      if (gs.board[first] === gs.board[second]) {
        // Match found!
        gs.revealed[first] = true;
        gs.revealed[second] = true;
        const count = (gs.pairsFound.get(socket.id) || 0) + 1;
        gs.pairsFound.set(socket.id, count);
        const player = room.players.get(socket.id);
        if (player) player.score += 50;

        const t = setTimeout(() => {
          // Reset pick state, unlock for same player's next turn
          gs.firstPick = null;
          gs.secondPick = null;
          gs.locked = false;

          io.to(room.code).emit('game:state', {
            phase: 'match',
            indices: [first, second],
            playerId: socket.id,
            playerName: player?.name || 'Unknown'
          });

          // Check if all pairs found
          const totalPairs = gs.boardSize / 2;
          let foundTotal = 0;
          for (const [, c] of gs.pairsFound) foundTotal += c;

          if (foundTotal >= totalPairs) {
            const t2 = setTimeout(() => this._roundResult(room, io), 1500);
            this._addTimer(room, t2);
          }
          // Match = same player goes again, no need to advance turn
        }, 800);
        this._addTimer(room, t);
      } else {
        // No match — flip back and advance turn
        const t = setTimeout(() => {
          gs.firstPick = null;
          gs.secondPick = null;
          gs.locked = false;

          io.to(room.code).emit('game:state', {
            phase: 'unflip',
            indices: [first, second]
          });
          this._advanceTurn(room, io);
        }, 1200);
        this._addTimer(room, t);
      }
    }
    // If secondPick is already set, ignore (triple-click protection)
  },

  _advanceTurn(room, io) {
    const gs = room.gameState;
    if (gs.turnOrder.length === 0) return;

    // Advance to next player, skip any who've disconnected
    let attempts = 0;
    do {
      gs.turnIndex = (gs.turnIndex + 1) % gs.turnOrder.length;
      gs.currentTurn = gs.turnOrder[gs.turnIndex];
      attempts++;
    } while (!room.players.has(gs.currentTurn) && attempts < gs.turnOrder.length);

    // If nobody valid found, end round
    if (!room.players.has(gs.currentTurn)) {
      this._roundResult(room, io);
      return;
    }

    const player = room.players.get(gs.currentTurn);
    io.to(room.code).emit('game:state', {
      phase: 'turn',
      currentTurn: gs.currentTurn,
      currentTurnName: player?.name
    });
  },

  _roundResult(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'roundResult' || gs.phase === 'finished') return; // prevent double-fire
    gs.phase = 'roundResult';

    const results = [];
    for (const [id, count] of gs.pairsFound) {
      const p = room.players.get(id);
      if (p) results.push({ id, name: p.name, pairs: count });
    }
    results.sort((a, b) => b.pairs - a.pairs);

    io.to(room.code).emit('game:state', { phase: 'roundResult', results });
    const t = setTimeout(() => this._nextRound(room, io), 4000);
    this._addTimer(room, t);
  },

  _endGame(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'finished') return; // prevent double-fire
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
    if (room._emTimers) {
      room._emTimers.forEach(t => clearTimeout(t));
      room._emTimers = [];
    }
  }
};
