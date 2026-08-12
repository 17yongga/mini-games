'use strict';

const MAX_NAME_LENGTH = 20;
const MAX_EVENT_LENGTH = 40;
const MAX_GAME_DATA_BYTES = 4096;
const PLAYER_ID_RE = /^[a-f0-9]{32}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const GAME_ID_RE = /^[a-z0-9-]{1,40}$/;
const BOT_ID_RE = /^bot-[A-Za-z0-9-]{1,80}$/;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exactKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.includes(key));
}

function requiredString(value, maxLength, pattern) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= maxLength && (!pattern || pattern.test(value));
}

function validateCreate(value) {
  return isPlainObject(value) && exactKeys(value, ['name']) && requiredString(value.name, MAX_NAME_LENGTH);
}

function validateJoin(value) {
  return isPlainObject(value) && exactKeys(value, ['code', 'name']) &&
    requiredString(value.code, 8) && requiredString(value.name, MAX_NAME_LENGTH);
}

function validateRejoin(value) {
  return isPlainObject(value) && exactKeys(value, ['code', 'playerId', 'reconnectToken']) &&
    requiredString(value.code, 8) && requiredString(value.playerId, 32, PLAYER_ID_RE) &&
    requiredString(value.reconnectToken, 43, TOKEN_RE);
}

function validateRemoveBot(value) {
  return isPlainObject(value) && exactKeys(value, ['botId']) && requiredString(value.botId, 100, BOT_ID_RE);
}

function validateStartGame(value) {
  return isPlainObject(value) && exactKeys(value, ['gameId']) && requiredString(value.gameId, 40, GAME_ID_RE);
}

function validateGameEvent(value) {
  if (!isPlainObject(value) || !exactKeys(value, ['event', 'data']) ||
      !requiredString(value.event, MAX_EVENT_LENGTH, /^[a-z][a-z0-9:-]*$/)) return false;
  if (!isPlainObject(value.data)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value.data), 'utf8') <= MAX_GAME_DATA_BYTES;
  } catch {
    return false;
  }
}

function validateEmpty(value) {
  return value === undefined || value === null || (isPlainObject(value) && Object.keys(value).length === 0);
}

function validateNetworkProbe(value) {
  return isPlainObject(value) && exactKeys(value, ['nonce']) &&
    requiredString(value.nonce, 64, /^[A-Za-z0-9_-]{8,64}$/);
}

const contracts = {
  'room:create': validateCreate,
  'room:join': validateJoin,
  'room:rejoin': validateRejoin,
  'room:addBot': validateEmpty,
  'room:removeBot': validateRemoveBot,
  'room:startGame': validateStartGame,
  'game:event': validateGameEvent,
  'network:probe': validateNetworkProbe,
  'network:probeReturn': validateNetworkProbe,
  'room:backToLobby': validateEmpty,
};

function validate(event, value) {
  const validator = contracts[event];
  return !!validator && validator(value);
}

module.exports = { isPlainObject, validate, MAX_GAME_DATA_BYTES };
