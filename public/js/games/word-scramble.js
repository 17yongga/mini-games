// Word Scramble — client
window.GameClients['word-scramble'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    container.innerHTML = '<div class="game-status info">Unscramble the words!</div>';
  },

  onState(data) {
    const c = this.container;

    switch (data.phase) {
      case 'scrambled':
        this._showScramble(data);
        break;
      case 'solved':
        this._showSolved(data);
        break;
      case 'wrong':
        this._shakeInput();
        break;
      case 'reveal':
        this._showReveal(data);
        break;
    }
  },

  _showScramble(data) {
    const c = this.container;
    c.innerHTML = `
      <div class="scramble-word fade-in">${data.scrambled}</div>
      <div class="scramble-input">
        <input type="text" id="ws-input" placeholder="Type your answer..." maxlength="${data.wordLength}" autocomplete="off" autocapitalize="characters">
        <button class="btn btn-primary" id="ws-submit">Go</button>
      </div>
      <div class="scramble-hint">${data.wordLength} letters • ${data.timeLimit}s</div>
      <div class="scramble-solvers" id="ws-solvers"></div>
    `;

    const input = document.getElementById('ws-input');
    const submit = document.getElementById('ws-submit');

    const doGuess = () => {
      const guess = input.value.trim();
      if (!guess) return;
      this.socket.emit('game:event', { event: 'guess', data: { guess } });
    };

    submit.addEventListener('click', doGuess);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doGuess();
    });
    input.focus();

    // Countdown timer
    const start = Date.now();
    const hint = c.querySelector('.scramble-hint');
    this._timerInterval = setInterval(() => {
      const left = Math.max(0, data.timeLimit - (Date.now() - start) / 1000);
      hint.textContent = `${data.wordLength} letters • ${left.toFixed(0)}s`;
      if (left <= 0) clearInterval(this._timerInterval);
    }, 200);
  },

  _showSolved(data) {
    clearInterval(this._timerInterval);
    const c = this.container;
    // Replace input with success message
    const inputArea = c.querySelector('.scramble-input');
    if (inputArea) {
      inputArea.innerHTML = `<div class="game-status success">✅ #${data.rank} — +${data.points} pts!</div>`;
    }
  },

  _shakeInput() {
    const input = document.getElementById('ws-input');
    if (input) {
      input.classList.add('shake');
      input.value = '';
      input.focus();
      setTimeout(() => input.classList.remove('shake'), 400);
    }
  },

  _showReveal(data) {
    clearInterval(this._timerInterval);
    const c = this.container;
    c.innerHTML = `
      <div class="scramble-word fade-in" style="color:var(--green)">${data.word}</div>
      <div class="scramble-solvers"></div>
    `;
    const solvers = c.querySelector('.scramble-solvers');
    if (data.solvers.length === 0) {
      solvers.innerHTML = '<div class="game-status warning">Nobody got it! 😅</div>';
    } else {
      data.solvers.forEach(s => {
        solvers.innerHTML += `<div class="solver-item fade-in">
          <span><span class="solver-rank">#${s.rank}</span> ${s.name} — ${(s.time / 1000).toFixed(1)}s</span>
          <span>+${s.points}</span>
        </div>`;
      });
    }
  }
};
