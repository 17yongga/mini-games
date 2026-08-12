// Tap Frenzy — client
window.GameClients['tap-frenzy'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.myTaps = 0;
    this.roundId = null;
    this.countdownInterval = null;
    container.innerHTML = '<div class="game-status info">Get those fingers ready...</div>';
  },

  onState(data) {
    const c = this.container;
    if (Number.isSafeInteger(data.roundId)) this.roundId = data.roundId;

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
      <button type="button" class="tap-zone" id="tf-zone" aria-label="Tap target">${this.myTaps}</button>
      <div class="tap-leaderboard" id="tf-board"></div>
    `;

    const zone = this.container.querySelector('#tf-zone');

    // BUG FIX: use single handler that works for both touch and mouse
    // touchstart fires first on mobile; we use it and prevent the follow-up click
    let usingTouch = false;

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      usingTouch = true;
      this.myTaps++;
      zone.textContent = this.myTaps;
      this.socket.emit('game:event', { event: 'tap', data: { roundId: this.roundId } });
    }, { passive: false });

    zone.addEventListener('click', (e) => {
      // Skip if touch already handled this
      if (usingTouch) return;
      e.preventDefault();
      this.myTaps++;
      zone.textContent = this.myTaps;
      this.socket.emit('game:event', { event: 'tap', data: { roundId: this.roundId } });
    });

    // Timer countdown
    const timerEl = this.container.querySelector('#tf-timer');
    const start = Date.now();
    this.countdownInterval = setInterval(() => {
      const left = Math.max(0, duration - (Date.now() - start));
      timerEl.textContent = `${(left / 1000).toFixed(1)}s left`;
      if (left <= 0) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    }, 100);
  },

  onTick(data) {
    const board = this.container?.querySelector('#tf-board');
    if (!board || !data.counts) return;
    const max = Math.max(1, ...data.counts.map(c => c.count));
    board.replaceChildren(...data.counts.map(entry => {
      const row = document.createElement('div'); row.className = 'tap-row';
      const name = document.createElement('span'); name.className = 'tap-player-name'; name.textContent = entry.name;
      const bar = document.createElement('div'); bar.className = 'tap-bar';
      const fill = document.createElement('div'); fill.className = 'tap-bar-fill'; fill.style.width = `${Math.max(0, Math.min(100, (entry.count / max) * 100))}%`;
      const count = document.createElement('span'); count.className = 'tap-bar-count'; count.textContent = entry.count;
      bar.append(fill, count); row.append(name, bar); return row;
    }));
  },

  _showResults(results) {
    const c = this.container;
    c.innerHTML = '<div class="game-status success">Time\'s up!</div>';
    const list = document.createElement('div'); list.className = 'tap-results';
    results.forEach((r, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
      const item = document.createElement('div'); item.className = 'solver-item fade-in'; item.style.animationDelay = `${i * 0.1}s`;
      const label = document.createElement('span'); label.textContent = `${medal} ${r.name} — ${r.count} taps`;
      const points = document.createElement('span'); points.textContent = `+${r.points}`;
      item.append(label, points); list.append(item);
    });
    c.append(list);
  },
  destroy() { if (this.countdownInterval) clearInterval(this.countdownInterval); this.countdownInterval = null; this.container = null; this.socket = null; }
};
