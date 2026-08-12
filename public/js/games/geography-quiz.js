// Geography Quiz — client
window.GameClients['geography-quiz'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.answered = false;
    this.selectedChoice = -1;
    this.timerInterval = null;
    this.answeredPlayers = new Set();
    container.innerHTML = '<div class="game-status info">🌍 Get ready for Geography Quiz!</div>';
  },

  onState(data) {
    switch (data.phase) {
      case 'question':
        this.answered = false;
        this.selectedChoice = -1;
        this.answeredPlayers = new Set();
        this._renderQuestion(data);
        this._startTimer(data.timeLimit);
        break;

      case 'player-answered':
        this.answeredPlayers.add(data.playerName);
        this._updateAnsweredIndicator(data.playerName);
        break;

      case 'answer':
        this._stopTimer();
        this._showAnswer(data);
        break;
    }
  },

  _renderQuestion(data) {
    const c = this.container;
    const labels = ['A', 'B', 'C', 'D'];
    c.innerHTML = `
      <div style="text-align:center;margin-bottom:8px;color:#aaa;font-size:14px">
        Round ${data.round} / ${data.totalRounds}
      </div>
      <div class="trivia-timer"><div class="trivia-timer-bar" id="gq-timer" style="width:100%"></div></div>
      <div class="trivia-question">${data.question}</div>
      <div class="trivia-options" id="gq-options"></div>
      <div id="gq-answered" style="margin-top:12px;font-size:13px;color:#888"></div>
    `;
    const grid = document.getElementById('gq-options');
    data.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'trivia-option';
      btn.dataset.idx = i;
      btn.innerHTML = `<strong>${labels[i]}.</strong> ${opt}`;
      btn.addEventListener('click', () => {
        if (this.answered) return;
        this.answered = true;
        this.selectedChoice = i;
        document.querySelectorAll('#gq-options .trivia-option').forEach(b => {
          b.classList.remove('selected');
          b.style.pointerEvents = 'none';
        });
        btn.classList.add('selected');
        this.socket.emit('game:event', { event: 'answer', data: { choice: i } });
      });
      grid.appendChild(btn);
    });
  },

  _updateAnsweredIndicator(name) {
    const el = document.getElementById('gq-answered');
    if (!el) return;
    const names = Array.from(this.answeredPlayers);
    el.textContent = names.map(n => '✓ ' + n).join('  ');
  },

  _startTimer(seconds) {
    this._stopTimer();
    const bar = document.getElementById('gq-timer');
    if (!bar) return;
    const start = Date.now();
    const duration = seconds * 1000;
    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 1 - elapsed / duration) * 100;
      bar.style.width = pct + '%';
      if (pct <= 25) bar.style.background = '#e74c3c';
      else if (pct <= 50) bar.style.background = '#f39c12';
      if (pct <= 0) this._stopTimer();
    }, 50);
  },

  _stopTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
  },

  _showAnswer(data) {
    const options = document.querySelectorAll('#gq-options .trivia-option');
    options.forEach((btn, i) => {
      btn.style.pointerEvents = 'none';
      if (i === data.correctIndex) btn.classList.add('correct');
      else if (i === this.selectedChoice) btn.classList.add('wrong');
    });

    // Round results
    const results = data.results || [];
    const summary = document.createElement('div');
    summary.style.marginTop = '16px';
    if (results.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = '#888';
      empty.style.textAlign = 'center';
      empty.textContent = 'No one answered!';
      summary.append(empty);
    }
    results.forEach(r => {
      summary.append(this._resultRow(`${r.correct ? '✅' : '❌'} ${r.name}`, `${r.correct ? '+' + r.points : '0'} pts`));
    });

    // Scoreboard
    if (data.scores && data.scores.length) {
      const scoreboard = document.createElement('div');
      scoreboard.style.cssText = 'margin-top:12px;border-top:1px solid #333;padding-top:8px';
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:12px;color:#888;margin-bottom:6px;text-align:center';
      heading.textContent = 'SCOREBOARD';
      scoreboard.append(heading);
      data.scores.forEach((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        scoreboard.append(this._resultRow(`${medal} ${s.name}`, `${s.score} pts`));
      });
      summary.append(scoreboard);
    }

    this.container.append(summary);
  },

  _resultRow(label, score) {
    const row = document.createElement('div');
    row.className = 'solver-item fade-in';
    const name = document.createElement('span');
    name.textContent = label;
    const points = document.createElement('span');
    points.textContent = score;
    row.append(name, points);
    return row;
  }
};
