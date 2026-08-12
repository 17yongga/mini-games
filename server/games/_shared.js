'use strict';

const { performance } = require('perf_hooks');

function now(room) {
  return typeof room?._gameNow === 'function' ? room._gameNow() : performance.now();
}

function rng(room) {
  return typeof room?._gameRandom === 'function' ? room._gameRandom() : Math.random();
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteInteger(value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;
}

function boundedString(value, maxLength = 256) {
  return typeof value === 'string' && value.length <= maxLength;
}

function activePlayerIds(room) {
  return Array.from(room.players || []).filter(([, p]) => p && !p.disconnected).map(([id]) => id);
}

function allActiveHave(room, collection) {
  const ids = activePlayerIds(room);
  return ids.length === 0 || ids.every(id => collection.has(id));
}

function beginDeadline(room, gs, durationMs) {
  gs.phaseStartedAt = now(room);
  gs.deadlineAt = gs.phaseStartedAt + durationMs;
  gs.durationMs = durationMs;
}

function beforeDeadline(room, gs) {
  return Number.isFinite(gs.deadlineAt) && now(room) <= gs.deadlineAt;
}

function remainingMs(room, gs) {
  return Math.max(0, Math.ceil((Number.isFinite(gs.deadlineAt) ? gs.deadlineAt : now(room)) - now(room)));
}

function scores(room) {
  return Array.from(room.players || [], ([id, p]) => ({ id, name: p.name, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function moveMapKey(map, oldId, newId) {
  if (!(map instanceof Map) || !map.has(oldId) || oldId === newId) return;
  const value = map.get(oldId);
  map.delete(oldId);
  map.set(newId, value);
}

function moveSetKey(set, oldId, newId) {
  if (!(set instanceof Set) || !set.has(oldId) || oldId === newId) return;
  set.delete(oldId);
  set.add(newId);
}

function migrateIdentity(gs, oldId, newId, spec = {}) {
  if (!gs || oldId === newId) return;
  for (const key of spec.maps || []) moveMapKey(gs[key], oldId, newId);
  for (const key of spec.sets || []) moveSetKey(gs[key], oldId, newId);
  for (const key of spec.ids || []) if (gs[key] === oldId) gs[key] = newId;
  for (const key of spec.idArrays || []) {
    if (Array.isArray(gs[key])) gs[key] = gs[key].map(id => id === oldId ? newId : id);
  }
  for (const key of spec.objectArrays || []) {
    if (Array.isArray(gs[key])) gs[key].forEach(item => { if (item && item.id === oldId) item.id = newId; });
  }
}

function publicResult(gs, fallback = {}) {
  return gs.resultState ? { ...gs.resultState } : { ...fallback };
}

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined && !(typeof child === 'number' && !Number.isFinite(child))) out[key] = clean(child);
    }
    return out;
  }
  return value;
}

module.exports = {
  now, rng, plainObject, finiteInteger, boundedString, activePlayerIds, allActiveHave,
  beginDeadline, beforeDeadline, remainingMs, scores, migrateIdentity, publicResult, clean
};
