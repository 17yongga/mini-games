// Simon Says — memory sequence game
const { plainObject, activePlayerIds, migrateIdentity } = require('./_shared');
// A sequence of colors is shown. Players must reproduce it.
// Sequence grows each round. Miss one and you're eliminated.

const COLORS = ['red', 'blue', 'green', 'yellow'];
const MAX_ROUNDS = 12;
const FLASH_SPEED_MS = 600; // time each color shows
const INPUT_TIMEOUT_MS = 10000; // time to enter whole sequence

module.exports = {
  id: 'simon-says',
  name: 'Simon Says',
  description: 'Watch the pattern, repeat it — memory is everything!',
  icon: '🔴',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: MAX_ROUNDS,

  init(room, io) {
    // Build a full sequence up front
    const fullSequence = [];
    for (let i = 0; i < MAX_ROUNDS; i++) {
      fullSequence.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }

    room.gameState = {
      round: 0,
      totalRounds: MAX_ROUNDS,
      phase: 'waiting',
      fullSequence,
      inputs: new Map(),      // socketId → [colors entered so far]
      eliminated: new Set(),  // socketIds who are out
      survivors: new Set(),   // socketIds still in
      roundResults: []
    };

    // Everyone starts as a survivor
    for (const [id] of room.players) {
      room.gameState.survivors.add(id);
    }

    room._ssTimers = [];
    this._nextRound(room, io);
  },

  _addTimer(room, timer) {
    if (!room._ssTimers) room._ssTimers = [];
    room._ssTimers.push(timer);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.phase = 'showing';
    gs.inputs = new Map();

    if (gs.round > gs.totalRounds || gs.survivors.size <= 1) {
      this._endGame(room, io);
      return;
    }

    const sequence = gs.fullSequence.slice(0, gs.round);

    // Show sequence to all players
    io.to(room.code).emit('game:state', {
      phase: 'showing',
      round: gs.round,
      totalRounds: gs.totalRounds,
      sequenceLength: sequence.length,
      survivors: gs.survivors.size,
      totalPlayers: room.players.size
    });

    // Flash each color one by one
    sequence.forEach((color, i) => {
      const t = setTimeout(() => {
        io.to(room.code).emit('game:tick', {
          type: 'flash',
          color,
          index: i,
          total: sequence.length
        });
      }, (i + 1) * FLASH_SPEED_MS);
      this._addTimer(room, t);
    });

    // After sequence finishes, start input phase
    const inputStart = (sequence.length + 1) * FLASH_SPEED_MS + 500;
    const t = setTimeout(() => {
      gs.phase = 'input';
      gs.inputStartedAt = Date.now();
      gs.deadlineAt = gs.inputStartedAt + INPUT_TIMEOUT_MS;
      io.to(room.code).emit('game:state', {
        phase: 'input',
        round: gs.round,
        sequenceLength: sequence.length,
        timeLimit: INPUT_TIMEOUT_MS
      });

      // Timeout for input
      const timeout = setTimeout(() => {
        if (gs.phase === 'input') {
          this._resolveRound(room, io);
        }
      }, INPUT_TIMEOUT_MS);
      this._addTimer(room, timeout);
    }, inputStart);
    this._addTimer(room, t);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'input' || gs.phase !== 'input' || !plainObject(data)) return;
    if (gs.eliminated.has(socket.id) || Date.now() > gs.deadlineAt) return;
    const player = room.players.get(socket.id);
    if (!player || player.disconnected || !gs.survivors.has(socket.id)) return;

    const color = data.color;
    if (!COLORS.includes(color)) return;

    if (!gs.inputs.has(socket.id)) {
      gs.inputs.set(socket.id, []);
    }

    const playerInputs = gs.inputs.get(socket.id);
    const expectedLength = gs.round;

    // Already submitted full sequence
    if (playerInputs.length >= expectedLength) return;

    playerInputs.push(color);

    // Send feedback for each press
    const expected = gs.fullSequence[playerInputs.length - 1];
    const correct = color === expected;

    if (!correct) {
      // Eliminated immediately on wrong press
      gs.eliminated.add(socket.id);
      gs.survivors.delete(socket.id);
      socket.emit('game:state', {
        phase: 'eliminated',
        wrongAt: playerInputs.length,
        expected,
        entered: color
      });

      // Check if round should end
      this._checkRoundComplete(room, io);
      return;
    }

    // Correct press
    socket.emit('game:state', {
      phase: 'inputProgress',
      entered: playerInputs.length,
      needed: expectedLength
    });

    // Full sequence entered correctly
    if (playerInputs.length === expectedLength) {
      // Points: base per round, bonus for completing
      player.score += gs.round * 20;
      socket.emit('game:state', {
        phase: 'roundComplete',
        message: 'Perfect! ✅'
      });

      this._checkRoundComplete(room, io);
    }
  },

  _checkRoundComplete(room, io) {
    const gs = room.gameState;
    const expectedLength = gs.round;

    // Check if all survivors have finished or been eliminated
    let allDone = true;
    for (const id of gs.survivors) {
      if (room.players.get(id)?.disconnected) continue;
      const inputs = gs.inputs.get(id) || [];
      if (inputs.length < expectedLength) {
        allDone = false;
        break;
      }
    }

    if (allDone || gs.survivors.size <= 1) {
      // Small delay then resolve
      const t = setTimeout(() => this._resolveRound(room, io), 1000);
      this._addTimer(room, t);
    }
  },

  _resolveRound(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'result') return;
    gs.phase = 'result';

    const expectedLength = gs.round;

    // Anyone who didn't finish in time is eliminated
    for (const id of gs.survivors) {
      const inputs = gs.inputs.get(id) || [];
      if (inputs.length < expectedLength) {
        gs.eliminated.add(id);
      }
    }
    // Rebuild survivors
    gs.survivors = new Set(
      Array.from(room.players.keys()).filter(id => !gs.eliminated.has(id))
    );
    gs.resultState = null;

    const survivorNames = Array.from(gs.survivors)
      .map(id => room.players.get(id)?.name)
      .filter(Boolean);

    gs.resultState = {
      phase: 'result',
      round: gs.round,
      survivors: survivorNames,
      survivorCount: gs.survivors.size,
      eliminated: gs.eliminated.size
    };
    io.to(room.code).emit('game:state', gs.resultState);

    // Next round or end
    if (gs.survivors.size <= 1 || gs.round >= gs.totalRounds) {
      const t = setTimeout(() => this._endGame(room, io), 3000);
      this._addTimer(room, t);
    } else {
      const t = setTimeout(() => this._nextRound(room, io), 3000);
      this._addTimer(room, t);
    }
  },

  _endGame(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'finished') return;
    gs.phase = 'finished';

    // Bonus points for survivors
    for (const id of gs.survivors) {
      const player = room.players.get(id);
      if (player) player.score += 200;
    }

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
    if (gs.phase === 'showing') {
      return {
        phase: 'showing',
        round: gs.round,
        totalRounds: gs.totalRounds,
        sequenceLength: gs.round,
        survivors: gs.survivors.size,
        totalPlayers: room.players.size
      };
    }
    if (gs.phase === 'input') {
      const sequence = gs.fullSequence.slice(0, gs.round);
      return {
        phase: 'input',
        round: gs.round,
        sequenceLength: sequence.length,
        timeLimit: Math.max(0, gs.deadlineAt - Date.now())
      };
    }
    if (gs.phase === 'result') {
      return { ...gs.resultState };
    }
    return null;
  },

  migratePlayerIdentity(room, oldId, newId) { migrateIdentity(room.gameState, oldId, newId, { maps: ['inputs'], sets: ['eliminated', 'survivors'] }); },

  cleanup(room) {
    if (room._ssTimers) {
      room._ssTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
      room._ssTimers = [];
    }
  }
};
