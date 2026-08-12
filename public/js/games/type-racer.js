// Type Racer — client (v8 — no stored refs, fresh queries every call)
window.GameClients['type-racer'] = {

  // ─── helpers ──────────────────────────────────────────────────────────────
  _el(id) {
    // Always query fresh — safe across reconnects and container replacements
    return this.container ? this.container.querySelector('#' + id) : null;
  },

  _setup(container, socket) {
    this.container = container;
    this.socket    = socket;
    this.sentence  = '';
    this.startTime = null;
    this.finished  = false;
    this.roundId   = null;
    if (this._throttleTimer) clearTimeout(this._throttleTimer);
    if (this._rafId)         cancelAnimationFrame(this._rafId);
    this._throttleTimer = null;
    this._rafId         = null;
    this._timerStart    = null;
    this._timerDuration = null;
  },

  // ─── init ─────────────────────────────────────────────────────────────────
  init(container, socket) {
    try {
      this._setup(container, socket);

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

      const input = this._el('tr-input');
      if (!input) {
        container.innerHTML = '<div class="game-status warning">⚠️ Type Racer: DOM setup failed</div>';
        return;
      }

      input.addEventListener('input', () => {
        if (this.finished || !this.sentence) return;
        const val = input.value;
        this._highlightSentence(val);

        if (!this._throttleTimer) {
          this._throttleTimer = setTimeout(() => {
            this._throttleTimer = null;
            if (!this.finished) {
              socket.emit('game:event', { event: 'progress', data: { typed: input.value, roundId: this.roundId } });
            }
          }, 100);
        }

        if (val === this.sentence) this._onFinish(val);
      });

    } catch (err) {
      container.innerHTML = `<div class="game-status warning">⚠️ Type Racer init error: ${err.message}</div>`;
    }
  },

  // ─── highlight ────────────────────────────────────────────────────────────
  _highlightSentence(typed) {
    const el = this._el('tr-sentence');
    if (!el || !this.sentence) return;
    let html = '';
    for (let i = 0; i < this.sentence.length; i++) {
      const ch = this.sentence[i] === ' ' ? '&nbsp;' : this.sentence[i];
      if (i < typed.length) {
        html += `<span class="${typed[i] === this.sentence[i] ? 'tr-char-correct' : 'tr-char-wrong'}">${ch}</span>`;
      } else if (i === typed.length) {
        html += `<span class="tr-char-cursor">${ch}</span>`;
      } else {
        html += `<span class="tr-char-pending">${ch}</span>`;
      }
    }
    el.innerHTML = html;
  },

  // ─── finish ───────────────────────────────────────────────────────────────
  _onFinish(typed) {
    if (this.finished) return;
    this.finished = true;
    const elapsed = Date.now() - this.startTime;
    if (this._throttleTimer) { clearTimeout(this._throttleTimer); this._throttleTimer = null; }
    if (this._rafId)         { cancelAnimationFrame(this._rafId); this._rafId = null; }

    const input  = this._el('tr-input');
    const status = this._el('tr-status');
    if (input)  input.disabled = true;
    if (status) { status.className = 'game-status success'; status.textContent = '✅ Finished! Waiting for results...'; }

    this.socket.emit('game:event', { event: 'finish', data: { typed, roundId: this.roundId } });
  },

  // ─── timer bar ────────────────────────────────────────────────────────────
  _startTimer(duration) {
    this._timerStart    = Date.now();
    this._timerDuration = duration;
    const fill = this._el('tr-timer-fill');
    if (!fill) return;
    fill.style.width      = '100%';
    fill.style.background = '';
    if (this._rafId) cancelAnimationFrame(this._rafId);
    const tick = () => {
      const f = this._el('tr-timer-fill');
      if (!f) return;
      const pct = Math.max(0, 1 - (Date.now() - this._timerStart) / this._timerDuration);
      f.style.width      = (pct * 100) + '%';
      f.style.background = pct < 0.25 ? 'var(--red)' : pct < 0.5 ? 'var(--yellow)' : '';
      if (pct > 0) this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  },

  // ─── progress bars ────────────────────────────────────────────────────────
  _renderProgress(players) {
    const el = this._el('tr-progress-list');
    if (!el || !players || players.length === 0) return;
    el.replaceChildren(...players.map(p => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(p.pct) * 100) || 0));
      const row = document.createElement('div'); row.className = 'tr-player-row';
      const name = document.createElement('span'); name.className = 'tr-player-name'; name.textContent = `${p.name}${p.finished ? ' ✅' : ''}`;
      const track = document.createElement('div'); track.className = 'tr-player-bar-track';
      const fill = document.createElement('div'); fill.className = 'tr-player-bar-fill'; fill.style.width = `${pct}%`;
      const percent = document.createElement('span'); percent.className = 'tr-player-pct'; percent.textContent = `${pct}%`;
      track.append(fill); row.append(name, track, percent); return row;
    }));
  },

  // ─── state handler ────────────────────────────────────────────────────────
  onState(data) {
    try {
      if (!this.container) return;

      // If container has been wiped and re-used, re-init silently
      if (!this._el('tr-status')) {
        this.init(this.container, this.socket);
      }

      const status   = this._el('tr-status');
      const sentence = this._el('tr-sentence');
      const inputArea = this._el('tr-input-area');
      const input    = this._el('tr-input');
      const feedback = this._el('tr-feedback');
      const progress = this._el('tr-progress-list');
      const timerFill = this._el('tr-timer-fill');

      if (!status) {
        this.container.innerHTML = `<div class="game-status warning">⚠️ Missing DOM (phase: ${data.phase})</div>`;
        return;
      }

      if (data.phase === 'typing') {
        this.roundId = data.roundId;
        this.sentence  = data.sentence;
        this.finished  = false;
        this.startTime = Date.now();
        if (this._throttleTimer) { clearTimeout(this._throttleTimer); this._throttleTimer = null; }

        if (sentence)  sentence.textContent = data.sentence;
        if (inputArea) inputArea.style.display = 'block';
        if (input)     { input.value = ''; input.disabled = false; }
        if (feedback)  { feedback.textContent = ''; feedback.className = 'tr-feedback'; }
        if (progress)  progress.innerHTML = '';

        status.className  = 'game-status info';
        status.textContent = `Round ${data.round}/${data.totalRounds} — Type it!`;

        this._startTimer(data.timeLimit);
        setTimeout(() => { const i = this._el('tr-input'); if (i) i.focus(); }, 100);

      } else if (data.phase === 'finished-round') {
        this.finished = true;
        if (input)    input.disabled = true;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

        const pos = ['🥇', '🥈', '🥉'][data.position - 1] || `#${data.position}`;
        if (feedback) {
          feedback.className  = 'tr-feedback correct fade-in';
          feedback.textContent = data.correct
            ? `${pos} ${data.wpm} WPM · ${Math.round(data.accuracy * 100)}% accuracy · +${data.score} pts`
            : `❌ Didn't match — 0 pts`;
        }

      } else if (data.phase === 'result') {
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        if (inputArea) inputArea.style.display = 'none';
        if (timerFill) timerFill.style.width = '0%';

        status.className  = 'game-status info';
        status.textContent = `Round ${data.round} results`;

        if (progress) {
          progress.replaceChildren(...((data.finishers && data.finishers.length > 0)
            ? data.finishers.map((f, i) => {
                const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
                const row = document.createElement('div'); row.className = 'tr-result-row';
                row.append(document.createTextNode(`${medal} `));
                const name = document.createElement('strong'); name.textContent = f.name;
                row.append(name, document.createTextNode(` — ${f.wpm} WPM · ${Math.round(f.accuracy * 100)}% acc · +${f.score} pts`));
                return row;
              })
            : [Object.assign(document.createElement('div'), { className: 'tr-result-row', textContent: 'Nobody finished in time!' })]));
        }
      }

    } catch (err) {
      if (this.container) {
        this.container.innerHTML = `<div class="game-status warning">⚠️ State error [${data && data.phase}]: ${err.message}</div>`;
      }
    }
  },

  onProgress(data) {
    if (data && data.players) this._renderProgress(data.players);
  },

  onTick() {
    // Timer driven by RAF
  },
};
