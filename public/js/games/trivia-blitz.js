// Trivia Blitz — client
window.GameClients['trivia-blitz'] = {
  tutorial: {
    duration: 5000,
    steps: [
      { at: 0,    type: 'html',    content: '<div style="font-size:0.9rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">Question</div><div style="font-size:1.1rem;font-weight:700;margin-top:10px">What is the capital of France?</div>' },
      { at: 700,  type: 'html',    content: '<div style="font-size:0.9rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">Question</div><div style="font-size:1.1rem;font-weight:700;margin-top:10px">What is the capital of France?</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;max-width:280px"><div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center;font-size:0.88rem">London</div><div style="background:rgba(63,185,80,0.25);border:2px solid #3fb950;border-radius:10px;padding:10px;text-align:center;font-size:0.88rem;font-weight:700">Paris ✓</div><div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center;font-size:0.88rem">Berlin</div><div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center;font-size:0.88rem">Madrid</div></div>' },
      { at: 2000, type: 'score',   player: 'Ghost Gary', points: 10 },
      { at: 2800, type: 'score',   player: 'Ghost Maya', points: 10 },
      { at: 3900, type: 'caption', content: 'First correct answer scores the point — speed matters!' }
    ]
  },
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.answered = false;
    this.timerInterval = null;
    container.innerHTML = '<div class="game-status info">Get ready for trivia!</div>';
  },

  onState(data) {
    const c = this.container;

    switch (data.phase) {
      case 'question':
        this.answered = false;
        this._renderQuestion(data);
        this._startTimer(data.timeLimit);
        break;

      case 'answer':
        this._stopTimer();
        this._showAnswer(data);
        break;
    }
  },

  _renderQuestion(data) {
    const c = this.container;
    c.innerHTML = `
      <div class="trivia-timer"><div class="trivia-timer-bar" id="tb-timer" style="width:100%"></div></div>
      <div class="trivia-question">${data.question}</div>
      <div class="trivia-options" id="tb-options"></div>
    `;
    const grid = document.getElementById('tb-options');
    data.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'trivia-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        if (this.answered) return;
        this.answered = true;
        document.querySelectorAll('.trivia-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.socket.emit('game:event', { event: 'answer', data: { choice: i } });
      });
      grid.appendChild(btn);
    });
  },

  _startTimer(seconds) {
    this._stopTimer();
    const bar = document.getElementById('tb-timer');
    if (!bar) return;
    const start = Date.now();
    const duration = seconds * 1000;
    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 1 - elapsed / duration) * 100;
      bar.style.width = pct + '%';
      if (pct <= 0) this._stopTimer();
    }, 50);
  },

  _stopTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
  },

  _showAnswer(data) {
    const options = document.querySelectorAll('.trivia-option');
    options.forEach((btn, i) => {
      btn.style.pointerEvents = 'none';
      if (i === data.correctIndex) btn.classList.add('correct');
      else if (btn.classList.contains('selected')) btn.classList.add('wrong');
    });

    // Show result summary below
    const summary = document.createElement('div');
    summary.style.marginTop = '16px';
    data.results.slice(0, 5).forEach(r => {
      const row = document.createElement('div');
      row.className = 'solver-item fade-in';
      const name = document.createElement('span');
      name.textContent = `${r.correct ? '✅' : '❌'} ${r.name}`;
      const points = document.createElement('span');
      points.textContent = `${r.correct ? '+' + r.points : '0'} pts`;
      row.append(name, points);
      summary.append(row);
    });
    this.container.append(summary);
  }
};
