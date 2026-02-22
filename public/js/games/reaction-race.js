// Reaction Race — client
window.GameClients['reaction-race'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    container.innerHTML = `
      <div class="game-status info">Get ready...</div>
      <div class="reaction-zone waiting" id="rr-zone">Wait for green...</div>
    `;
    this.zone = document.getElementById('rr-zone');
    this.zone.addEventListener('click', () => {
      socket.emit('game:event', { event: 'tap', data: {} });
    });
  },

  onState(data) {
    const zone = this.zone;
    const status = this.container.querySelector('.game-status');

    switch (data.phase) {
      case 'ready':
        zone.className = 'reaction-zone ready';
        zone.textContent = 'Wait...';
        status.className = 'game-status warning';
        status.textContent = `Round ${data.round} of ${data.totalRounds} — DON'T tap yet!`;
        break;

      case 'go':
        zone.className = 'reaction-zone go';
        zone.textContent = 'TAP NOW!';
        status.className = 'game-status success';
        status.textContent = 'GO GO GO!';
        break;

      case 'early':
        zone.className = 'reaction-zone early';
        zone.textContent = 'Too early! 😬';
        break;

      case 'result':
        zone.className = 'reaction-zone waiting';
        if (data.winner) {
          zone.textContent = `${data.winner.name} — ${data.winner.time}ms`;
          status.className = 'game-status info';
          status.textContent = `${data.winner.name} wins the round!`;
        } else {
          zone.textContent = 'Nobody tapped!';
          status.className = 'game-status info';
          status.textContent = 'No winner this round';
        }
        break;
    }
  }
};
