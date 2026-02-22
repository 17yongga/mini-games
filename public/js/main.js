// Mini Games Platform — client core
(function() {
  'use strict';

  // WebSocket connects to the API server
  const wsUrl = 'https://api.gary-yong.com';
  const socket = io(wsUrl, {
    path: '/minigames-ws/',
    // Mobile-friendly reconnection
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });

  // State
  const state = {
    name: '',
    roomCode: '',
    isHost: false,
    selectedGame: null,
    myId: null,
    games: [],
    currentGame: null
  };

  // Game client registry
  window.GameClients = {};

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Screen management ───
  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#screen-${id}`).classList.add('active');
  }

  function showError(msg) {
    const el = $('#home-error');
    el.textContent = msg;
    setTimeout(() => el.textContent = '', 4000);
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  // ─── Session persistence for reconnection ───
  function saveSession() {
    if (state.roomCode && state.name) {
      sessionStorage.setItem('mg-session', JSON.stringify({
        roomCode: state.roomCode,
        name: state.name,
        isHost: state.isHost
      }));
    }
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem('mg-session');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function clearSession() {
    sessionStorage.removeItem('mg-session');
  }

  function checkUrlCode() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      $('#join-code').value = code.toUpperCase();
    }
  }

  function restoreName() {
    const saved = localStorage.getItem('mg-name');
    if (saved) $('#player-name').value = saved;
  }

  // ─── HOME screen ───
  $('#btn-create').addEventListener('click', () => {
    const name = $('#player-name').value.trim();
    if (!name) return showError('Enter your name first');
    localStorage.setItem('mg-name', name);
    state.name = name;

    socket.emit('room:create', { name }, (res) => {
      if (res.error) return showError(res.error);
      state.roomCode = res.code;
      state.isHost = true;
      state.myId = socket.id;
      saveSession();
      enterLobby(res.players);
    });
  });

  $('#btn-join').addEventListener('click', () => {
    const name = $('#player-name').value.trim();
    const code = $('#join-code').value.trim().toUpperCase();
    if (!name) return showError('Enter your name first');
    if (!code || code.length !== 4) return showError('Enter a 4-letter room code');
    localStorage.setItem('mg-name', name);
    state.name = name;

    socket.emit('room:join', { code, name }, (res) => {
      if (res.error) return showError(res.error);
      state.roomCode = res.code;
      state.isHost = false;
      state.myId = socket.id;
      saveSession();
      enterLobby(res.players);
    });
  });

  $('#join-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-join').click();
  });
  $('#player-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const code = $('#join-code').value.trim();
      code ? $('#btn-join').click() : $('#btn-create').click();
    }
  });

  // ─── LOBBY ───
  function enterLobby(players) {
    showScreen('lobby');
    $('#room-code').textContent = state.roomCode;
    updatePlayerList(players);
    updateLobbyControls();

    const url = new URL(window.location);
    url.searchParams.set('room', state.roomCode);
    history.replaceState(null, '', url);
  }

  function updatePlayerList(players) {
    const list = $('#player-list');
    list.innerHTML = '';
    players.forEach(p => {
      const li = document.createElement('li');
      const botTag = p.isBot ? `<span class="bot-badge">${p.diffEmoji} BOT</span>` : '';
      const hostTag = p.isHost ? '<span class="host-badge">👑</span>' : '';
      const awayTag = p.disconnected ? '<span class="away-badge">💤</span>' : '';
      const removeBtn = (p.isBot && state.isHost) ? `<span class="remove-bot" data-bot-id="${p.id}">✕</span>` : '';
      li.innerHTML = `${hostTag}${p.name} ${botTag}${awayTag}${removeBtn}`;
      if (p.id === state.myId) li.style.borderLeft = '3px solid var(--primary)';
      if (p.disconnected) li.style.opacity = '0.5';
      list.appendChild(li);
    });
    list.querySelectorAll('.remove-bot').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('room:removeBot', { botId: btn.dataset.botId }, (res) => {
          if (res?.error) toast(res.error);
        });
      });
    });
  }

  function updateLobbyControls() {
    const isHost = state.isHost;
    $('#game-picker').style.display = isHost ? 'block' : 'none';
    $('#btn-start').style.display = isHost ? 'block' : 'none';
    $('#btn-add-bot').style.display = isHost ? 'inline-block' : 'none';
    $('#lobby-waiting').style.display = isHost ? 'none' : 'block';
    if (isHost) renderGameGrid();
  }

  function renderGameGrid() {
    const grid = $('#game-grid');
    grid.innerHTML = '';
    state.games.forEach(g => {
      const card = document.createElement('div');
      card.className = 'game-card' + (state.selectedGame === g.id ? ' selected' : '');
      card.innerHTML = `
        <div class="game-icon">${g.icon}</div>
        <div class="game-name">${g.name}</div>
        <div class="game-desc">${g.description}</div>
      `;
      card.addEventListener('click', () => {
        state.selectedGame = g.id;
        $$('.game-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        $('#btn-start').disabled = false;
      });
      grid.appendChild(card);
    });
    $('#btn-start').disabled = !state.selectedGame;
  }

  $('#btn-share').addEventListener('click', () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${state.roomCode}`;
    navigator.clipboard.writeText(url).then(() => toast('Link copied!')).catch(() => toast(url));
  });

  $('#btn-add-bot').addEventListener('click', () => {
    socket.emit('room:addBot', {}, (res) => {
      if (res?.error) toast(res.error);
    });
  });

  $('#btn-start').addEventListener('click', () => {
    if (!state.selectedGame) return;
    socket.emit('room:startGame', { gameId: state.selectedGame }, (res) => {
      if (res.error) return toast(res.error);
    });
  });

  // ─── ROOM EVENTS ───
  socket.on('room:playerJoined', ({ players, newPlayer }) => {
    updatePlayerList(players);
    toast(`${newPlayer} joined!`);
  });

  socket.on('room:playerLeft', ({ players }) => {
    updatePlayerList(players);
    const me = players.find(p => p.id === state.myId);
    if (me?.isHost && !state.isHost) {
      state.isHost = true;
      updateLobbyControls();
      saveSession();
      toast("You're now the host!");
    }
  });

  socket.on('room:playerAway', ({ players, playerName }) => {
    updatePlayerList(players);
    if (playerName) toast(`${playerName} disconnected — waiting for reconnect...`);
  });

  socket.on('room:playerRejoined', ({ players, playerName }) => {
    updatePlayerList(players);
    if (playerName) toast(`${playerName} reconnected!`);
  });

  socket.on('room:lobby', ({ players, message }) => {
    state.selectedGame = null;
    state.currentGame = null;
    const me = players.find(p => p.id === state.myId);
    state.isHost = me?.isHost || false;
    saveSession();
    enterLobby(players);
    if (message) toast(message);
  });

  // ─── GAME EVENTS ───
  socket.on('game:start', ({ gameId, gameName, players }) => {
    showScreen('game');
    state.currentGame = gameId;
    $('#game-title').textContent = gameName;
    $('#game-container').innerHTML = '';

    const client = window.GameClients[gameId];
    if (client?.init) {
      client.init($('#game-container'), socket, state, players);
    }
  });

  socket.on('game:state', (data) => {
    const client = window.GameClients[state.currentGame];
    if (client?.onState) client.onState(data, socket, state);
    if (data.round && data.totalRounds) {
      $('#game-round').textContent = `Round ${data.round}/${data.totalRounds}`;
    }
  });

  socket.on('game:tick', (data) => {
    const client = window.GameClients[state.currentGame];
    if (client?.onTick) client.onTick(data, socket, state);
  });

  socket.on('game:end', ({ scores }) => {
    showScreen('results');
    renderResults(scores);
  });

  function renderResults(scores) {
    const podium = $('#results-podium');
    const list = $('#results-list');
    podium.innerHTML = '';
    list.innerHTML = '';

    const medals = ['🥇', '🥈', '🥉'];
    // Display order: 2nd, 1st, 3rd (standard podium layout)
    const podiumOrder = [1, 0, 2];
    podiumOrder.forEach(displayIdx => {
      if (!scores[displayIdx]) return;
      const s = scores[displayIdx];
      const rank = displayIdx + 1; // 1st, 2nd, 3rd
      const div = document.createElement('div');
      div.className = `podium-item rank-${rank} fade-in`;
      div.innerHTML = `
        <div class="podium-name">${s.name}</div>
        <div class="podium-bar">${medals[displayIdx]}</div>
        <div class="podium-score">${s.score} pts</div>
      `;
      podium.appendChild(div);
    });

    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'fade-in';
      li.style.animationDelay = `${i * 0.05}s`;
      li.innerHTML = `
        <span><span class="rank">#${i + 1}</span> ${s.name}</span>
        <span class="score">${s.score}</span>
      `;
      if (s.id === state.myId) li.style.background = 'var(--surface2)';
      list.appendChild(li);
    });

    $('#btn-lobby').style.display = state.isHost ? 'block' : 'none';
    $('#results-waiting').style.display = state.isHost ? 'none' : 'block';
  }

  $('#btn-lobby').addEventListener('click', () => {
    socket.emit('room:backToLobby');
  });

  // ─── SOCKET STATE ───
  socket.on('games:list', (list) => {
    state.games = list;
  });

  socket.on('connect', () => {
    state.myId = socket.id;
    hideReconnectOverlay();

    // Auto-rejoin on reconnect if we have a session
    const session = getSession();
    if (session && session.roomCode) {
      console.log(`Attempting rejoin to room ${session.roomCode} as ${session.name}`);
      socket.emit('room:rejoin', { code: session.roomCode, name: session.name }, (res) => {
        if (res.error) {
          console.log('Rejoin failed:', res.error);
          clearSession();
          showScreen('home');
          showError('Could not rejoin room');
          return;
        }

        state.roomCode = res.code;
        state.name = session.name;
        state.isHost = res.isHost;
        saveSession();

        if (res.roomState === 'playing' && res.gameId) {
          // Rejoin mid-game — go to game screen
          // The game state will come via game:state events
          showScreen('game');
          state.currentGame = res.gameId;
          $('#game-title').textContent = res.gameName;
          $('#game-container').innerHTML = '<div class="game-status info">Reconnected! Waiting for next round...</div>';

          const client = window.GameClients[res.gameId];
          if (client?.init) {
            client.init($('#game-container'), socket, state, res.players);
          }
          toast('Reconnected!');
        } else {
          // Back to lobby
          enterLobby(res.players);
          toast(res.rejoined ? 'Reconnected!' : 'Joined room');
        }
      });
    }
  });

  socket.on('disconnect', () => {
    showReconnectOverlay();
  });

  socket.on('reconnect_attempt', (attempt) => {
    updateReconnectOverlay(attempt);
  });

  // ─── Reconnect overlay ───
  function showReconnectOverlay() {
    let overlay = document.getElementById('reconnect-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'reconnect-overlay';
      overlay.innerHTML = `
        <div class="reconnect-content">
          <div class="reconnect-spinner"></div>
          <div class="reconnect-text">Reconnecting...</div>
          <div class="reconnect-sub" id="reconnect-sub">Hang tight</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  }

  function hideReconnectOverlay() {
    const overlay = document.getElementById('reconnect-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function updateReconnectOverlay(attempt) {
    const sub = document.getElementById('reconnect-sub');
    if (sub) sub.textContent = `Attempt ${attempt}...`;
  }

  // ─── Visibility change handler ───
  // When tab becomes visible again, check connection
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!socket.connected) {
        showReconnectOverlay();
        socket.connect();
      }
    }
  });

  // Init
  restoreName();
  checkUrlCode();
})();
