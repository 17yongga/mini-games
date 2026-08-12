// Number Guess — client
window.GameClients['number-guess'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this._rafId = null;
    this._timerStart = null;
    this._timerDuration = null;
    this._solved = false;

    container.innerHTML = `
      <div class="game-status info">Get ready to guess! 🔢</div>
    `;
  },

  onState(data) {
    switch (data.phase) {
      case 'guessing':     this._showGuessing(data); break;
      case 'guess-result': this._updateLog(data); break;
      case 'you-solved':   this._showSolved(data); break;
      case 'invalid':      this._showInvalid(data.message); break;
      case 'result':       this._showResult(data); break;
    }
  },

  _showGuessing(data) {
    this._solved = false;
    const c = this.container;
    c.innerHTML = `
      <div class="ng-header">
        <span class="ng-round">Round ${data.round}/${data.totalRounds}</span>
        <span class="ng-range">Range: <strong>${data.range.min} – ${data.range.max}</strong></span>
        <span class="ng-timer" id="ng-timer"></span>
      </div>
      <div class="ng-timer-bar">
        <div class="ng-timer-fill" id="ng-timer-fill"></div>
      </div>
      <div class="ng-input-row">
        <input type="number" id="ng-input" class="ng-input" min="${data.range.min}" max="${data.range.max}"
          placeholder="Guess a number…" inputmode="numeric" autocomplete="off">
        <button class="btn btn-primary ng-submit" id="ng-submit">Guess →</button>
      </div>
      <div class="ng-feedback" id="ng-feedback"></div>
      <div class="ng-log" id="ng-log"><div class="ng-log-empty">No guesses yet…</div></div>
    `;

    this._bindInput();
    this._startTimer(data.timeLimit);
  },

  _bindInput() {
    const btn = document.getElementById('ng-submit');
    const input = document.getElementById('ng-input');
    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      this.socket.emit('game:event', { event: 'guess', data: { guess: parseInt(val, 10) } });
      input.value = '';
      input.focus();
    };
    if (btn) btn.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  },

  _startTimer(duration) {
    this._timerStart = Date.now();
    this._timerDuration = duration;

    if (this._rafId) cancelAnimationFrame(this._rafId);
    const fill = document.getElementById('ng-timer-fill');
    const label = document.getElementById('ng-timer');

    const tick = () => {
      const elapsed = Date.now() - this._timerStart;
      const pct = Math.max(0, 1 - elapsed / this._timerDuration);
      const secsLeft = Math.ceil((this._timerDuration - elapsed) / 1000);

      if (fill) {
        fill.style.width = (pct * 100) + '%';
        fill.style.background = pct < 0.25 ? 'var(--red)' : pct < 0.5 ? 'var(--yellow)' : '';
      }
      if (label) label.textContent = `${secsLeft}s`;

      if (pct > 0) this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  },

  _stopTimer() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  },

  _updateLog(data) {
    const logEl = document.getElementById('ng-log');
    if (!logEl) return;

    const isEmpty = logEl.querySelector('.ng-log-empty');
    if (isEmpty) isEmpty.remove();

    const entry = document.createElement('div');
    const hintClass = data.hint === 'correct' ? 'ng-log-correct' :
                      data.hint === 'higher'  ? 'ng-log-higher'  : 'ng-log-lower';
    const hintIcon  = data.hint === 'correct' ? '✅' :
                      data.hint === 'higher'  ? '⬆️' : '⬇️';
    const hintText  = data.hint === 'correct' ? 'Correct!' :
                      data.hint === 'higher'  ? 'Go Higher' : 'Go Lower';

    entry.className = `ng-log-entry ${hintClass} fade-in`;
    const player = document.createElement('span'); player.className = 'ng-log-player'; player.textContent = data.playerName;
    const guess = document.createElement('strong'); guess.textContent = data.guess;
    const hint = document.createElement('span'); hint.className = 'ng-log-hint'; hint.textContent = `${hintIcon} ${hintText}`;
    entry.append(player, document.createTextNode(' guessed '), guess, hint);
    if (data.points) {
      const points = document.createElement('span'); points.className = 'ng-log-points'; points.textContent = `+${data.points}`;
      entry.append(points);
    }
    logEl.prepend(entry);
  },

  _showSolved(data) {
    this._solved = true;
    this._stopTimer();

    const input = document.getElementById('ng-input');
    const btn = document.getElementById('ng-submit');
    const fb = document.getElementById('ng-feedback');
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    if (fb) {
      fb.className = 'ng-feedback success fade-in';
      fb.innerHTML = `🎉 You got it! <strong>${data.guess}</strong> was the number!<br>+${data.points} pts in ${data.guesses} guess${data.guesses > 1 ? 'es' : ''}`;
    }
  },

  _showInvalid(msg) {
    const fb = document.getElementById('ng-feedback');
    if (fb) {
      fb.textContent = `⚠️ ${msg}`;
      fb.className = 'ng-feedback warning shake';
      setTimeout(() => { if (fb) { fb.className = 'ng-feedback'; fb.textContent = ''; } }, 2000);
    }
  },

  _showResult(data) {
    this._stopTimer();
    const c = this.container;

    c.innerHTML = `
      <div class="ng-result fade-in">
        <div class="ng-result-number">${data.secret}</div>
        <div class="ng-result-label">was the secret number</div>
        <div class="ng-result-msg"></div>
        <div class="ng-result-log"></div>
        <div style="margin-top:10px;color:var(--text-muted);font-size:0.85rem">Next round starting…</div>
      </div>
    `;
    const message = c.querySelector('.ng-result-msg');
    if (data.solvers.length > 0) {
      const solver = data.solvers[0];
      message.append(document.createTextNode('🎉 '));
      const name = document.createElement('strong'); name.textContent = solver.name;
      message.append(name, document.createTextNode(` cracked it in ${solver.guesses} guess${solver.guesses > 1 ? 'es' : ''}!`));
    } else {
      message.textContent = data.reason === 'timeout' ? `⏰ Time's up! Nobody guessed it.` : 'Nobody guessed the number.';
    }
    const log = c.querySelector('.ng-result-log');
    if (!data.guessLog.length) {
      const empty = document.createElement('div'); empty.className = 'ng-log-empty'; empty.textContent = 'No guesses were made.'; log.append(empty);
    } else {
      data.guessLog.forEach(e => {
        const row = document.createElement('div');
        row.className = `ng-log-entry ${e.hint === 'correct' ? 'ng-log-correct' : e.hint === 'higher' ? 'ng-log-higher' : 'ng-log-lower'}`;
        const name = document.createElement('span'); name.className = 'ng-log-player'; name.textContent = e.playerName;
        row.append(name, document.createTextNode(` → ${e.guess} ${e.hint === 'correct' ? '✅' : e.hint === 'higher' ? '⬆️' : '⬇️'}`));
        if (e.points) { const points = document.createElement('span'); points.className = 'ng-log-points'; points.textContent = `+${e.points}`; row.append(points); }
        log.append(row);
      });
    }
  }
};
