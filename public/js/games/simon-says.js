// Simon Says — client
window.GameClients['simon-says'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.isEliminated = false;
    container.innerHTML = `
      <div class="game-status info" id="ss-status">Watch the pattern...</div>
      <div class="simon-board" id="ss-board">
        <div class="simon-pad red" data-color="red"></div>
        <div class="simon-pad blue" data-color="blue"></div>
        <div class="simon-pad green" data-color="green"></div>
        <div class="simon-pad yellow" data-color="yellow"></div>
      </div>
      <div class="simon-progress" id="ss-progress"></div>
      <div class="simon-info" id="ss-info"></div>
    `;

    this.board = document.getElementById('ss-board');
    this.status = document.getElementById('ss-status');
    this.progress = document.getElementById('ss-progress');
    this.info = document.getElementById('ss-info');
    this.pads = container.querySelectorAll('.simon-pad');
    this.inputEnabled = false;

    this.pads.forEach(pad => {
      pad.addEventListener('click', () => {
        if (!this.inputEnabled || this.isEliminated) return;
        const color = pad.dataset.color;
        socket.emit('game:event', { event: 'input', data: { color } });
        // Visual feedback
        pad.classList.add('pressed');
        setTimeout(() => pad.classList.remove('pressed'), 200);
      });
    });
  },

  _flashPad(color) {
    const pad = this.board.querySelector(`.simon-pad.${color}`);
    if (!pad) return;
    pad.classList.add('lit');
    setTimeout(() => pad.classList.remove('lit'), 400);
  },

  onState(data) {
    switch (data.phase) {
      case 'showing':
        this.inputEnabled = false;
        this.status.className = 'game-status warning';
        this.status.textContent = `Round ${data.round} — Watch carefully! (${data.sequenceLength} colors)`;
        this.progress.textContent = '';
        this.info.textContent = `${data.survivors}/${data.totalPlayers} still in`;
        this.board.classList.remove('input-mode');
        this.board.classList.add('showing-mode');
        break;

      case 'input':
        this.inputEnabled = true;
        this.board.classList.remove('showing-mode');
        this.board.classList.add('input-mode');
        if (!this.isEliminated) {
          this.status.className = 'game-status success';
          this.status.textContent = 'Your turn — repeat the pattern!';
          this.progress.textContent = `0/${data.sequenceLength}`;
        }
        break;

      case 'inputProgress':
        this.progress.textContent = `${data.entered}/${data.needed}`;
        break;

      case 'roundComplete':
        this.inputEnabled = false;
        this.status.className = 'game-status success';
        this.status.textContent = data.message;
        break;

      case 'eliminated':
        this.isEliminated = true;
        this.inputEnabled = false;
        this.status.className = 'game-status warning';
        this.status.textContent = `❌ Wrong! Expected ${data.expected}, you pressed ${data.entered}`;
        this.board.classList.add('eliminated');
        this.info.textContent = 'You\'re out! Watch the others...';
        break;

      case 'result':
        this.inputEnabled = false;
        this.board.classList.remove('input-mode', 'showing-mode');
        if (this.isEliminated) {
          this.status.className = 'game-status info';
          this.status.textContent = `Round ${data.round} done — ${data.survivorCount} remaining`;
        } else {
          this.status.className = 'game-status success';
          this.status.textContent = `Round ${data.round} survived! ${data.survivorCount} remaining`;
        }
        this.info.textContent = data.survivors.length > 0
          ? `Still in: ${data.survivors.join(', ')}`
          : 'Nobody made it!';
        break;
    }
  },

  onTick(data) {
    if (data.type === 'flash') {
      this._flashPad(data.color);
    }
  }
};
