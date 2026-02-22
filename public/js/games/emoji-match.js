// Emoji Match — client
window.GameClients['emoji-match'] = {
  init(container, socket, state) {
    this.container = container;
    this.socket = socket;
    this.state = state;
    this.board = [];
    this.revealed = [];
    this.matched = [];
    this.locked = false; // BUG FIX: prevent clicks during animation
    container.innerHTML = '<div class="game-status info">Find the matching pairs!</div>';
  },

  onState(data) {
    const c = this.container;

    switch (data.phase) {
      case 'playing':
        this._initBoard(data);
        break;
      case 'flip':
        this._flipCard(data.index, data.emoji);
        break;
      case 'match':
        this._markMatch(data.indices, data.playerName);
        break;
      case 'unflip':
        this._unflipCards(data.indices);
        break;
      case 'turn':
        this._updateTurn(data.currentTurn, data.currentTurnName);
        this.locked = false; // unlock on new turn
        break;
      case 'roundResult':
        this._showRoundResult(data.results);
        break;
    }
  },

  _initBoard(data) {
    const c = this.container;
    this.boardSize = data.boardSize;
    this.cols = data.cols;
    this.board = new Array(data.boardSize).fill('');
    this.revealed = new Array(data.boardSize).fill(false);
    this.matched = new Array(data.boardSize).fill(false);
    this.locked = false;
    this.flippedCount = 0; // track flips this turn

    const isMyTurn = data.currentTurn === this.state.myId;

    c.innerHTML = `
      <div class="emoji-turn-info" id="em-turn">
        ${isMyTurn ? '<span class="current">Your turn!</span>' : `${data.currentTurnName}'s turn`}
      </div>
      <div class="emoji-board" id="em-board" style="grid-template-columns:repeat(${this.cols}, 1fr)"></div>
    `;

    const boardEl = document.getElementById('em-board');
    for (let i = 0; i < data.boardSize; i++) {
      const cell = document.createElement('div');
      cell.className = 'emoji-cell hidden';
      cell.dataset.index = i;
      cell.addEventListener('click', () => {
        // BUG FIX: prevent triple-clicks and clicks during animation
        if (this.locked || this.matched[i] || this.revealed[i]) return;
        this.socket.emit('game:event', { event: 'flip', data: { index: i } });
      });
      boardEl.appendChild(cell);
    }
  },

  _flipCard(index, emoji) {
    this.board[index] = emoji;
    this.revealed[index] = true;
    this.flippedCount = (this.flippedCount || 0) + 1;
    const cell = document.querySelector(`[data-index="${index}"]`);
    if (cell) {
      cell.className = 'emoji-cell revealed';
      cell.textContent = emoji;
    }
    // BUG FIX: after second flip, lock to prevent third click
    if (this.flippedCount >= 2) {
      this.locked = true;
    }
  },

  _markMatch(indices, playerName) {
    indices.forEach(i => {
      this.matched[i] = true;
      this.revealed[i] = true;
      const cell = document.querySelector(`[data-index="${i}"]`);
      if (cell) cell.className = 'emoji-cell matched';
    });

    const turn = document.getElementById('em-turn');
    if (turn) turn.innerHTML = `<span class="current">${playerName} found a pair! 🎉</span>`;

    // Unlock after match for the next pick (same player's turn continues)
    this.flippedCount = 0;
    this.locked = false;
  },

  _unflipCards(indices) {
    setTimeout(() => {
      indices.forEach(i => {
        this.revealed[i] = false;
        const cell = document.querySelector(`[data-index="${i}"]`);
        if (cell) {
          cell.className = 'emoji-cell hidden';
          cell.textContent = '';
        }
      });
      this.flippedCount = 0;
      this.locked = false;
    }, 200);
  },

  _updateTurn(currentTurn, currentTurnName) {
    this.flippedCount = 0;
    this.locked = false;
    const isMyTurn = currentTurn === this.state.myId;
    const turn = document.getElementById('em-turn');
    if (turn) {
      turn.innerHTML = isMyTurn
        ? '<span class="current">Your turn!</span>'
        : `${currentTurnName}'s turn`;
    }
  },

  _showRoundResult(results) {
    this.locked = true;
    const c = this.container;
    c.innerHTML = '<div class="game-status info">Round complete!</div>';
    let html = '<div style="width:100%;margin-top:16px">';
    results.forEach((r, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
      html += `<div class="solver-item fade-in" style="animation-delay:${i * 0.1}s">
        <span>${medal} ${r.name}</span>
        <span>${r.pairs} pairs</span>
      </div>`;
    });
    html += '</div>';
    c.insertAdjacentHTML('beforeend', html);
  }
};
