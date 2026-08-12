'use strict';
// Reaction Race — receipt-authoritative timing with bounded trusted latency compensation.
const { now, rng, plainObject, beforeDeadline, beginDeadline, remainingMs, scores, migrateIdentity, activePlayerIds } = require('./_shared');
const READY_MIN_MS = 1500, READY_SPREAD_MS = 3500, GO_MS = 5000, COLLECT_MS = 120, RESULT_MS = 3000;
const COMPENSATION_CAP_MS = 75, TIE_FLOOR_MS = 20, FALSE_START_PENALTY = 25;

function trustedLatency(room, id) {
  const p = room.players.get(id) || {};
  const value = room.latencyByPlayer?.get?.(id) || room.latencyByPlayer?.[id] || p.latency || {};
  const rtt = Number.isFinite(value.minRttMs) ? value.minRttMs : Number.isFinite(value.rttMs) ? value.rttMs : 0;
  const jitter = Number.isFinite(value.jitterMs) ? value.jitterMs : 0;
  return { compensation: Math.min(COMPENSATION_CAP_MS, Math.max(0, rtt / 2)), uncertainty: Math.max(10, Math.min(100, jitter / 2)) };
}

module.exports = {
  id: 'reaction-race', name: 'Reaction Race', description: 'Tap as fast as you can when the screen turns green!', icon: '⚡', minPlayers: 2, maxPlayers: 20, rounds: 5,
  init(room, io) {
    room.gameState = { round: 0, roundId: 0, totalRounds: this.rounds, phase: 'waiting', taps: new Map(), falseStarts: new Set(), roundResults: [], resultState: null, resultFired: false };
    room._rrTimers = []; this._nextRound(room, io);
  },
  _timer(room, fn, ms) { const t = setTimeout(fn, ms); (room._rrTimers ||= []).push(t); return t; },
  _nextRound(room, io) {
    const gs = room.gameState; gs.round++; gs.roundId++; gs.taps = new Map(); gs.falseStarts = new Set(); gs.roundResults = []; gs.resultState = null; gs.resultFired = false;
    if (gs.round > gs.totalRounds) return this._endGame(room, io);
    gs.phase = 'ready'; const token = gs.roundId; beginDeadline(room, gs, READY_MIN_MS + rng(room) * READY_SPREAD_MS);
    io.to(room.code).emit('game:state', { phase: 'ready', round: gs.round, totalRounds: gs.totalRounds, roundId: token });
    this._timer(room, () => { if (gs.roundId !== token || gs.phase !== 'ready') return; gs.phase = 'go'; gs.goTime = now(room); gs.deadlineAt = gs.goTime + GO_MS; io.to(room.code).emit('game:state', { phase: 'go', roundId: token }); this._timer(room, () => { if (gs.roundId === token && gs.phase === 'go') this._roundResult(room, io); }, GO_MS); }, remainingMs(room, gs));
  },
  onEvent(room, socket, event, data, io) {
    const gs = room.gameState; if (!gs || event !== 'tap' || (data !== undefined && !plainObject(data))) return { ok: false, code: 'INVALID_ACTION' };
    if (plainObject(data) && data.roundId !== undefined && data.roundId !== gs.roundId) return { ok: false, code: 'STALE_ROUND' };
    const player = room.players.get(socket.id); if (!player || player.disconnected) return { ok: false, code: 'INELIGIBLE' };
    if (gs.phase === 'ready') { if (!gs.falseStarts.has(socket.id)) { gs.falseStarts.add(socket.id); player.score = Math.max(0, (player.score || 0) - FALSE_START_PENALTY); } socket.emit('game:state', { phase: 'early', disqualified: true, penalty: FALSE_START_PENALTY, roundId: gs.roundId }); return { ok: false, code: 'FALSE_START' }; }
    if (gs.phase !== 'go' || !beforeDeadline(room, gs)) return { ok: false, code: 'NOT_OPEN' };
    if (gs.falseStarts.has(socket.id)) return { ok: false, code: 'DISQUALIFIED' };
    if (gs.taps.has(socket.id)) return { ok: false, code: 'DUPLICATE' };
    const receivedAt = now(room), raw = Math.max(0, receivedAt - gs.goTime), latency = trustedLatency(room, socket.id), adjusted = Math.max(0, raw - latency.compensation);
    const entry = { id: socket.id, name: player.name, time: Math.round(adjusted), rawTime: Math.round(raw), compensation: Math.round(latency.compensation), uncertainty: Math.round(latency.uncertainty) };
    gs.taps.set(socket.id, entry); gs.roundResults.push(entry);
    if (gs.roundResults.length === 1) { const token = gs.roundId; this._timer(room, () => { if (gs.roundId === token && gs.phase === 'go') this._roundResult(room, io); }, COLLECT_MS); }
    return { ok: true };
  },
  _roundResult(room, io) {
    const gs = room.gameState; if (gs.resultFired || !['go', 'ready'].includes(gs.phase)) return; gs.resultFired = true; gs.phase = 'result';
    gs.roundResults.sort((a, b) => a.time - b.time || a.rawTime - b.rawTime || a.id.localeCompare(b.id));
    const best = gs.roundResults[0]; let winners = [];
    if (best) winners = gs.roundResults.filter(r => Math.abs(r.time - best.time) <= Math.max(TIE_FLOOR_MS, r.uncertainty + best.uncertainty));
    const shared = winners.length ? Math.round((100 + (best.time < 300 ? 50 : 0)) / winners.length) : 0;
    for (const winner of winners) { const p = room.players.get(winner.id); if (p) p.score = (p.score || 0) + shared; winner.points = shared; }
    gs.resultState = { phase: 'result', round: gs.round, totalRounds: gs.totalRounds, roundId: gs.roundId, winner: winners.length === 1 ? winners[0] : null, winners, tie: winners.length > 1, results: gs.roundResults.slice(0, 5) };
    io.to(room.code).emit('game:state', gs.resultState); const token = gs.roundId; this._timer(room, () => { if (gs.roundId === token && gs.phase === 'result') this._nextRound(room, io); }, RESULT_MS);
  },
  _endGame(room, io) { const gs = room.gameState; if (gs.phase === 'finished') return; gs.phase = 'finished'; io.to(room.code).emit('game:end', { scores: scores(room) }); room.state = 'results'; },
  getReconnectState(room, playerId) { const gs = room.gameState; if (!gs) return null; if (gs.phase === 'ready') return { phase: 'ready', round: gs.round, totalRounds: gs.totalRounds, roundId: gs.roundId, disqualified: gs.falseStarts.has(playerId) }; if (gs.phase === 'go') return { phase: 'go', round: gs.round, totalRounds: gs.totalRounds, roundId: gs.roundId, timeLimit: remainingMs(room, gs), tapped: gs.taps.has(playerId), disqualified: gs.falseStarts.has(playerId) }; if (gs.phase === 'result') return { ...gs.resultState }; return null; },
  migratePlayerIdentity(room, oldId, newId) { migrateIdentity(room.gameState, oldId, newId, { maps: ['taps'], sets: ['falseStarts'], objectArrays: ['roundResults'], ids: [], idArrays: [] }); if (room.gameState?.resultState) { const r = room.gameState.resultState; if (r.winner?.id === oldId) r.winner.id = newId; (r.winners || []).forEach(x => { if (x.id === oldId) x.id = newId; }); (r.results || []).forEach(x => { if (x.id === oldId) x.id = newId; }); } },
  getBotMove(room, bot) { const gs = room.gameState; if (!gs || gs.phase !== 'go' || gs.taps.has(bot.id) || gs.falseStarts.has(bot.id)) return null; return { event: 'tap', data: { roundId: gs.roundId } }; },
  onPresenceChanged(room, io) { if (room.gameState?.phase === 'go' && activePlayerIds(room).every(id => room.gameState.taps.has(id) || room.gameState.falseStarts.has(id))) this._roundResult(room, io); },
  cleanup(room) { (room._rrTimers || []).forEach(clearTimeout); room._rrTimers = []; }
};
