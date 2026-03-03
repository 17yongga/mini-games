// Type Racer — client
window.GameClients['type-racer'] = {
  init(container, socket) {
    try {
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

      // Use container-scoped queries — safer on reconnect than document.getElementById
      this.statusEl   = container.querySelector('#tr-status');
      this.sentenceEl = container.querySelector('#tr-sentence');
      this.timerFill  = container.querySelector('#tr-timer-fill');
      this.inputArea  = container.querySelector('#tr-input-area');
      this.inputEl    = container.querySelector('#tr-input');
      this.feedbackEl = container.querySelector('#tr-feedback');
      this.progressEl = container.querySelector('#tr-progress-list');

      // Validate all refs exist
      const missing = ['statusEl','sentenceEl','timerFill','inputArea','inputEl','feedbackEl','progressEl']
        .filter(k => !this[k]);
      if (missing.length) {
        container.innerHTML = `<div class="game-status warning">⚠️ Init error: missing ${missing.join(',')}</div>`;
        return;
      }

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
    } catch (err) {
      container.innerHTML = `<div class="game-status warning">⚠️ Type Racer init failed: ${err.message}</div>`;
    }
  },

  _highlightSentence(typed) {
    if (!this.sentence || !this.sentenceEl) return;
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

    if (this.inputEl) this.inputEl.disabled = true;
    if (this.statusEl) {
      this.statusEl.className = 'game-status success';
      this.statusEl.textContent = '✅ Finished! Waiting for results...';
    }

    this.socket.emit('game:event', { event: 'finish', data: { typed, elapsed } });
  },

  _startTimer(duration) {
    if (!this.timerFill) return;
    this._timerStart = Date.now();
    this._timerDuration = duration;
    this.timerFill.style.width = '100%';
    this.timerFill.style.background = '';
    if (this._rafId) cancelAnimationFrame(this._rafId);

    const tick = () => {
      if (!this.timerFill) return;
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
    if (!players || players.length === 0 || !this.progressEl) return;
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
    try {
      // If refs are missing (e.g. init failed or container was replaced), re-init
      if (!this.statusEl || !this.container) return;

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
          setTimeout(() => { if (this.inputEl) this.inputEl.focus(); }, 50);
          break;

        case 'finished-round': {
          this.finished = true;
          if (this.inputEl) this.inputEl.disabled = true;
          if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

          const pos = ['🥇', '🥈', '🥉'][data.position - 1] || `#${data.position}`;
          if (this.feedbackEl) {
            this.feedbackEl.className = 'tr-feedback correct fade-in';
            this.feedbackEl.textContent = data.correct
              ? `${pos} ${data.wpm} WPM · ${Math.round(data.accuracy * 100)}% accuracy · +${data.score} pts`
              : `❌ Didn't match — 0 pts`;
          }
          break;
        }

        case 'result':
          if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
          if (this.inputArea) this.inputArea.style.display = 'none';
          if (this.timerFill) this.timerFill.style.width = '0%';

          if (this.statusEl) {
            this.statusEl.className = 'game-status info';
            this.statusEl.textContent = `Round ${data.round} results`;
          }

          if (this.progressEl) {
            if (data.finishers && data.finishers.length > 0) {
              this.progressEl.innerHTML = data.finishers.map((f, i) => {
                const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
                return `<div class="tr-result-row">${medal} <strong>${f.name}</strong> — ${f.wpm} WPM · ${Math.round(f.accuracy * 100)}% acc · +${f.score} pts</div>`;
              }).join('');
            } else {
              this.progressEl.innerHTML = '<div class="tr-result-row">Nobody finished in time!</div>';
            }
          }
          break;
      }
    } catch (err) {
      if (this.container) {
        this.container.innerHTML = `<div class="game-status warning">⚠️ State error (${data.phase}): ${err.message}</div>`;
      }
    }
  },

  onProgress(data) {
    if (data && data.players) this._renderProgress(data.players);
  },

  onTick(data) {
    // Timer driven by RAF — tick just updates if RAF isn't running
  },
};
