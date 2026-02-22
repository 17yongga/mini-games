// Game registry — auto-loads all game modules from this directory

const fs = require('fs');
const path = require('path');

const games = new Map();

fs.readdirSync(__dirname)
  .filter(f => f !== 'index.js' && f.endsWith('.js'))
  .forEach(f => {
    const game = require(path.join(__dirname, f));
    games.set(game.id, game);
    console.log(`  Loaded game: ${game.name}`);
  });

function list() {
  return Array.from(games.values()).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    icon: g.icon
  }));
}

function get(id) {
  return games.get(id) || null;
}

module.exports = { list, get };
