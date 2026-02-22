// Trivia Blitz — client
window.GameClients['trivia-blitz'] = {
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
    const results = data.results.slice(0, 5);
    let html = '<div style="margin-top:16px">';
    results.forEach(r => {
      html += `<div class="solver-item fade-in">
        <span>${r.correct ? '✅' : '❌'} ${r.name}</span>
        <span>${r.correct ? '+' + r.points : '0'} pts</span>
      </div>`;
    });
    html += '</div>';
    this.container.insertAdjacentHTML('beforeend', html);
  }
};
