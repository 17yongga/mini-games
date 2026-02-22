// Reaction Race — screen turns green at random time, first to tap wins the round

module.exports = {
  id: 'reaction-race',
  name: 'Reaction Race',
  description: 'Tap as fast as you can when the screen turns green!',
  icon: '⚡',
  minPlayers: 2,
  maxPlayers: 20,
  rounds: 5,

  init(room, io) {
    room.gameState = {
      round: 0,
      totalRounds: this.rounds,
      phase: 'waiting',
      goTime: null,
      roundResults: [],
      tapped: new Set(),
      earlyTappers: new Set() // BUG FIX: separate set for early tappers
    };
    room._rrTimers = [];
    this._nextRound(room, io);
  },

  _addTimer(room, timer) {
    if (!room._rrTimers) room._rrTimers = [];
    room._rrTimers.push(timer);
  },

  _nextRound(room, io) {
    const gs = room.gameState;
    gs.round++;
    gs.phase = 'ready';
    gs.goTime = null;
    gs.tapped = new Set();
    gs.earlyTappers = new Set();
    gs.roundResults = [];
    gs.resultFired = false; // BUG FIX: prevent double result

    if (gs.round > gs.totalRounds) {
      this._endGame(room, io);
      return;
    }

    io.to(room.code).emit('game:state', { phase: 'ready', round: gs.round, totalRounds: gs.totalRounds });

    const thisRound = gs.round;
    const delay = 1500 + Math.random() * 3500;
    const t1 = setTimeout(() => {
      if (gs.round !== thisRound) return; // round changed, skip
      gs.phase = 'go';
      gs.goTime = Date.now();
      io.to(room.code).emit('game:state', { phase: 'go' });

      const t2 = setTimeout(() => {
        if (gs.round === thisRound && gs.phase === 'go' && !gs.resultFired) {
          this._roundResult(room, io, null);
        }
      }, 5000);
      this._addTimer(room, t2);
    }, delay);
    this._addTimer(room, t1);
  },

  onEvent(room, socket, event, data, io) {
    const gs = room.gameState;
    if (event !== 'tap') return;

    if (gs.phase === 'ready') {
      // Tapped too early — mark as early but DON'T add to tapped
      socket.emit('game:state', { phase: 'early' });
      gs.earlyTappers.add(socket.id);
      return;
    }

    if (gs.phase !== 'go') return;
    // BUG FIX: early tappers can still tap when GO happens (they get a second chance)
    if (gs.tapped.has(socket.id)) return;
    gs.tapped.add(socket.id);

    const reactionTime = Date.now() - gs.goTime;
    const player = room.players.get(socket.id);
    if (!player) return;

    gs.roundResults.push({ id: socket.id, name: player.name, time: reactionTime });

    // First valid tap wins
    if (gs.roundResults.length === 1 && !gs.resultFired) {
      player.score += 100;
      if (reactionTime < 300) player.score += 50;
      const t = setTimeout(() => {
        if (!gs.resultFired) this._roundResult(room, io, socket.id);
      }, 1500);
      this._addTimer(room, t);
    }
  },

  _roundResult(room, io, winnerId) {
    const gs = room.gameState;
    if (gs.resultFired) return; // BUG FIX: prevent double-fire
    gs.resultFired = true;
    gs.phase = 'result';

    const winner = winnerId ? room.players.get(winnerId) : null;
    io.to(room.code).emit('game:state', {
      phase: 'result',
      round: gs.round,
      winner: winner ? { id: winnerId, name: winner.name, time: gs.roundResults[0]?.time } : null,
      results: gs.roundResults.slice(0, 5)
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
    if (room._rrTimers) {
      room._rrTimers.forEach(t => clearTimeout(t));
      room._rrTimers = [];
    }
  }
};
