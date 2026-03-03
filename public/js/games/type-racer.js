// Type Racer — client
window.GameClients['type-racer'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.sentence = '';
    this.startTime = null;
    this.finished = false;
    this._throttleTimer = null;
    this._rafId = null;
    this._timerStart = null;
    this._timerDuration = null;

    container.innerHTML = `
      <div class="game-status info" id="tr-status">Get ready to type...</div>
      <div class="tr-sentence" id="tr-sentence"></div>
      <div class="math-timer-bar" id="tr-timer-bar">
        <div class="math-timer-fill" id="tr-timer-fill"></div>
      </div>
      <div class="tr-input-area" id="tr-input-area" style="display:none">
        <input type="text" id="tr-input" class="tr-typing-input"
          placeholder="Start typing here..." autocomplete="off" autocorrect="off"
          autocapitalize="off" spellcheck="false">
      </div>
      <div class="tr-feedback" id="tr-feedback"></div>
      <div class="tr-progress-list" id="tr-progress-list"></div>
    `;

    this.statusEl   = document.getElementById('tr-status');
    this.sentenceEl = document.getElementById('tr-sentence');
    this.timerFill  = document.getElementById('tr-timer-fill');
    this.inputArea  = document.getElementById('tr-input-area');
    this.inputEl    = document.getElementById('tr-input');
    this.feedbackEl = document.getElementById('tr-feedback');
    this.progressEl = document.getElementById('tr-progress-list');

    // Typing handler — highlights typed chars and throttles socket emits
    this.inputEl.addEventListener('input', () => {
      if (this.finished || !this.sentence) return;
      const val = this.inputEl.value;
      this._highlightSentence(val);

      // Throttle progress events to 100ms max
      if (!this._throttleTimer) {
        this._throttleTimer = setTimeout(() => {
          this._throttleTimer = null;
          if (!this.finished) {
            socket.emit('game:event', { event: 'progress', data: { typed: this.inputEl.value } });
          }
        }, 100);
      }

      // Check for completion
      if (val === this.sentence) {
        this._onFinish(val);
      }
    });
  },

  _highlightSentence(typed) {
    if (!this.sentence) return;
    let html = '';
    for (let i = 0; i < this.sentence.length; i++) {
      const ch = this.sentence[i] === ' ' ? '&nbsp;' : this.sentence[i];
      if (i < typed.length) {
        const cls = typed[i] === this.sentence[i] ? 'tr-char-correct' : 'tr-char-wrong';
        html += `<span class="${cls}">${ch}</span>`;
      } else if (i === typed.length) {
        html += `<span class="tr-char-cursor">${ch}</span>`;
      } else {
        html += `<span class="tr-char-pending">${ch}</span>`;
      }
    }
    this.sentenceEl.innerHTML = html;
  },

  _onFinish(typed) {
    if (this.finished) return;
    this.finished = true;
    const elapsed = Date.now() - this.startTime;
    if (this._throttleTimer) { clearTimeout(this._throttleTimer); this._throttleTimer = null; }
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

    this.inputEl.disabled = true;
    this.statusEl.className = 'game-status success';
    this.statusEl.textContent = '✅ Finished! Waiting for results...';

    this.socket.emit('game:event', { event: 'finish', data: { typed, elapsed } });
  },

  _startTimer(duration) {
    this._timerStart = Date.now();
    this._timerDuration = duration;
    this.timerFill.style.width = '100%';
    this.timerFill.style.background = '';
    if (this._rafId) cancelAnimationFrame(this._rafId);

    const tick = () => {
      const elapsed = Date.now() - this._timerStart;
      const pct = Math.max(0, 1 - elapsed / this._timerDuration);
      this.timerFill.style.width = (pct * 100) + '%';
      if (pct < 0.25) this.timerFill.style.background = 'var(--red)';
      else if (pct < 0.5) this.timerFill.style.background = 'var(--yellow)';
      if (pct > 0) this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  },

  _renderProgress(players) {
    if (!players || players.length === 0) return;
    this.progressEl.innerHTML = players.map(p => `
      <div class="tr-player-row">
        <span class="tr-player-name">${p.name}${p.finished ? ' ✅' : ''}</span>
        <div class="tr-player-bar-track">
          <div class="tr-player-bar-fill" style="width:${Math.round(p.pct * 100)}%"></div>
        </div>
        <span class="tr-player-pct">${Math.round(p.pct * 100)}%</span>
      </div>
    `).join('');
  },

  onState(data) {
    switch (data.phase) {
      case 'typing':
        this.sentence = data.sentence;
        this.finished = false;
        this.startTime = Date.now();
        if (this._throttleTimer) { clearTimeout(this._throttleTimer); this._throttleTimer = null; }

        this.sentenceEl.textContent = data.sentence;
        this.inputArea.style.display = 'block';
        this.inputEl.value = '';
        this.inputEl.disabled = false;
        this.feedbackEl.textContent = '';
        this.feedbackEl.className = 'tr-feedback';
        this.progressEl.innerHTML = '';

        this.statusEl.className = 'game-status info';
        this.statusEl.textContent = `Round ${data.round}/${data.totalRounds} — Type it!`;

        this._startTimer(data.timeLimit);
        setTimeout(() => this.inputEl.focus(), 50);
        break;

      case 'finished-round':
        this.finished = true;
        this.inputEl.disabled = true;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

        const pos = ['🥇', '🥈', '🥉'][data.position - 1] || `#${data.position}`;
        this.feedbackEl.className = 'tr-feedback correct fade-in';
        this.feedbackEl.textContent = data.correct
          ? `${pos} ${data.wpm} WPM · ${Math.round(data.accuracy * 100)}% accuracy · +${data.score} pts`
          : `❌ Didn't match — 0 pts`;
        break;

      case 'result':
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this.inputArea.style.display = 'none';
        this.timerFill.style.width = '0%';

        this.statusEl.className = 'game-status info';
        this.statusEl.textContent = `Round ${data.round} results`;

        if (data.finishers && data.finishers.length > 0) {
          this.progressEl.innerHTML = data.finishers.map((f, i) => {
            const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
            return `<div class="tr-result-row">${medal} <strong>${f.name}</strong> — ${f.wpm} WPM · ${Math.round(f.accuracy * 100)}% acc · +${f.score} pts</div>`;
          }).join('');
        } else {
          this.progressEl.innerHTML = '<div class="tr-result-row">Nobody finished in time!</div>';
        }
        break;
    }
  },

  onProgress(data) {
    if (data && data.players) this._renderProgress(data.players);
  },

  onTick(data) {
    // Timer driven by RAF — tick just updates if RAF isn't running
  },
};
