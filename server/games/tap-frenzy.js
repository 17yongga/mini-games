// Tap Frenzy — tap as many times as possible in a time window

module.exports = {
  id: 'tap-frenzy',
  name: 'Tap Frenzy',
  description: 'Tap like your life depends on it! Most taps wins.',
  icon: '👆',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: 3,
  roundDuration: 8000,

  init(room, io) {
    room.gameState = {
      round: 0,
      totalRounds: this.rounds,
      phase: 'waiting',
      taps: new Map(),
      roundDuration: this.roundDuration
    };
    room._tfTimers = [];
    room._tfIntervals = [];
    this._nextRound(room, io);
  },

  _addTimer(room, timer) {
    if (!room._tfTimers) room._tfTimers = [];
    room._tfTimers.push(timer);
  },

  _addInterval(room, interval) {
    if (!room._tfIntervals) room._tfIntervals = [];
    room._tfIntervals.push(interval);
  },

  _clearRoundTimers(room) {
    // Clear only intervals (tick + bot taps) between rounds
    if (room._tfIntervals) {
      room._tfIntervals.forEach(i => clearInterval(i));
      room._tfIntervals = [];
    }
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.taps = new Map();

    // Clear intervals from previous round
    this._clearRoundTimers(room);

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    for (const [id] of room.players) gs.taps.set(id, 0);

    gs.phase = 'countdown';
    io.to(room.code).emit('game:state', {
      phase: 'countdown',
      round: gs.round,
      totalRounds: gs.totalRounds
    });

    const t1 = setTimeout(() => {
      gs.phase = 'tapping';
      gs.startTime = Date.now();
      io.to(room.code).emit('game:state', {
        phase: 'tapping',
        duration: gs.roundDuration
      });

      // Broadcast live counts every 500ms
      const tickInterval = setInterval(() => {
        const counts = [];
        for (const [id, count] of gs.taps) {
          const p = room.players.get(id);
          if (p) counts.push({ id, name: p.name, count });
        }
        counts.sort((a, b) => b.count - a.count);
        io.to(room.code).emit('game:tick', { counts });
      }, 500);
      this._addInterval(room, tickInterval);

      const t2 = setTimeout(() => {
        this._clearRoundTimers(room); // stop tick interval
        this._roundResult(room, io);
      }, gs.roundDuration);
      this._addTimer(room, t2);
    }, 3000);
    this._addTimer(room, t1);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'tap' || gs.phase !== 'tapping') return;
    const current = gs.taps.get(socket.id) || 0;
    gs.taps.set(socket.id, current + 1);
  },

  _roundResult(room, io) {
    const gs = room.gameState;
    if (gs.phase === 'result') return; // prevent double-fire
    gs.phase = 'result';

    const results = [];
    for (const [id, count] of gs.taps) {
      const p = room.players.get(id);
      if (p) results.push({ id, name: p.name, count });
    }
    results.sort((a, b) => b.count - a.count);

    const pointTable = [150, 100, 75];
    results.forEach((r, i) => {
      const points = pointTable[i] || 25;
      const player = room.players.get(r.id);
      if (player) player.score += points;
      r.points = points;
    });

    io.to(room.code).emit('game:state', { phase: 'result', results });
    const t = setTimeout(() => this._nextRound(room, io), 4000);
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
    if (room._tfTimers) {
      room._tfTimers.forEach(t => clearTimeout(t));
      room._tfTimers = [];
    }
    if (room._tfIntervals) {
      room._tfIntervals.forEach(i => clearInterval(i));
      room._tfIntervals = [];
    }
  }
};
