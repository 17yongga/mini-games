// Reaction Race — client
window.GameClients['reaction-race'] = {
  tutorial: {
    duration: 4500,
    steps: [
      { at: 0,    type: 'html',    content: '<div style="font-size:2.5rem">⏳</div><div style="font-size:1.1rem;font-weight:700;margin-top:8px">Wait for the signal...</div>' },
      { at: 900,  type: 'flash',   content: '🟢 TAP NOW!' },
      { at: 1100, type: 'score',   player: 'Ghost Gary', points: 10, time: '0.31s' },
      { at: 1800, type: 'html',    content: '<div style="font-size:2.5rem">⏳</div><div style="font-size:1.1rem;font-weight:700;margin-top:8px">Wait again...</div>' },
      { at: 2600, type: 'flash',   content: '🟢 TAP NOW!' },
      { at: 2900, type: 'score',   player: 'Ghost Maya', points: 10, time: '0.28s' },
      { at: 3600, type: 'caption', content: 'Tap the instant the zone turns green — fastest finger wins!' }
    ]
  },
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
