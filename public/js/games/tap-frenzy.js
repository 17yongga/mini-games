// Tap Frenzy — client
window.GameClients['tap-frenzy'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.myTaps = 0;
    this.countdownInterval = null;
    container.innerHTML = '<div class="game-status info">Get those fingers ready...</div>';
  },

  onState(data) {
    const c = this.container;

    switch (data.phase) {
      case 'countdown':
        this.myTaps = 0;
        this._showCountdown(c);
        break;
      case 'tapping':
        this._startTapping(data.duration);
        break;
      case 'result':
        this._showResults(data.results);
        break;
    }
  },

  _showCountdown(c) {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    let count = 3;
    c.innerHTML = `<div class="countdown-overlay"><div class="countdown-number">${count}</div></div>`;
    this.countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        c.innerHTML = `<div class="countdown-overlay"><div class="countdown-number">${count}</div></div>`;
      } else {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }, 1000);
  },

  _startTapping(duration) {
    const c = this.container;
    c.innerHTML = `
      <div class="game-status info" id="tf-timer">${(duration / 1000).toFixed(0)}s left</div>
      <div class="tap-zone" id="tf-zone">${this.myTaps}</div>
      <div class="tap-leaderboard" id="tf-board"></div>
    `;

    const zone = document.getElementById('tf-zone');

    // BUG FIX: use single handler that works for both touch and mouse
    // touchstart fires first on mobile; we use it and prevent the follow-up click
    let usingTouch = false;

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      usingTouch = true;
      this.myTaps++;
      zone.textContent = this.myTaps;
      this.socket.emit('game:event', { event: 'tap', data: {} });
    }, { passive: false });

    zone.addEventListener('click', (e) => {
      // Skip if touch already handled this
      if (usingTouch) return;
      e.preventDefault();
      this.myTaps++;
      zone.textContent = this.myTaps;
      this.socket.emit('game:event', { event: 'tap', data: {} });
    });

    // Timer countdown
    const timerEl = document.getElementById('tf-timer');
    const start = Date.now();
    const interval = setInterval(() => {
      const left = Math.max(0, duration - (Date.now() - start));
      timerEl.textContent = `${(left / 1000).toFixed(1)}s left`;
      if (left <= 0) clearInterval(interval);
    }, 100);
  },

  onTick(data) {
    const board = document.getElementById('tf-board');
    if (!board || !data.counts) return;
    const max = Math.max(1, ...data.counts.map(c => c.count));
    board.innerHTML = data.counts.map(c => `
      <div class="tap-row">
        <span style="width:70px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</span>
        <div class="tap-bar">
          <div class="tap-bar-fill" style="width:${(c.count / max) * 100}%"></div>
          <span class="tap-bar-count">${c.count}</span>
        </div>
      </div>
    `).join('');
  },

  _showResults(results) {
    const c = this.container;
    c.innerHTML = '<div class="game-status success">Time\'s up!</div>';
    let html = '<div style="width:100%;margin-top:16px">';
    results.forEach((r, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
      html += `<div class="solver-item fade-in" style="animation-delay:${i * 0.1}s">
        <span>${medal} ${r.name} — ${r.count} taps</span>
        <span>+${r.points}</span>
      </div>`;
    });
    html += '</div>';
    c.insertAdjacentHTML('beforeend', html);
  }
};
