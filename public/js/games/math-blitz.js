// Math Blitz — client
window.GameClients['math-blitz'] = {
  tutorial: {
    duration: 4500,
    steps: [
      { at: 0,    type: 'html',    content: '<div style="font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">Solve it fast</div><div style="font-size:2.8rem;font-weight:900;margin-top:8px">14 × 3 = ?</div>' },
      { at: 800,  type: 'html',    content: '<div style="font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">Solve it fast</div><div style="font-size:2.8rem;font-weight:900;margin-top:8px">14 × 3 = ?</div><div style="margin-top:14px;background:rgba(255,255,255,0.08);border-radius:10px;padding:10px 20px;display:inline-block;font-size:1.5rem;font-weight:700">42</div>' },
      { at: 1400, type: 'score',   player: 'Ghost Gary', points: 15 },
      { at: 2200, type: 'html',    content: '<div style="font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">Next question</div><div style="font-size:2.8rem;font-weight:900;margin-top:8px">√64 = ?</div>' },
      { at: 3000, type: 'score',   player: 'Ghost Maya', points: 15 },
      { at: 3800, type: 'caption', content: 'Type the answer and hit Enter — harder problems = more points!' }
    ]
  },
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.answered = false;
    container.innerHTML = `
      <div class="game-status info">Get ready for some math...</div>
      <div class="math-problem" id="mb-problem"></div>
      <div class="math-timer-bar" id="mb-timer-bar">
        <div class="math-timer-fill" id="mb-timer-fill"></div>
      </div>
      <div class="math-input-area" id="mb-input-area" style="display:none">
        <input type="number" id="mb-answer" class="math-answer-input" placeholder="?" inputmode="numeric" autocomplete="off">
        <button class="btn btn-primary math-submit" id="mb-submit">→</button>
      </div>
      <div class="math-feedback" id="mb-feedback"></div>
      <div class="math-level" id="mb-level"></div>
    `;

    this.problemEl = document.getElementById('mb-problem');
    this.inputArea = document.getElementById('mb-input-area');
    this.answerEl = document.getElementById('mb-answer');
    this.submitBtn = document.getElementById('mb-submit');
    this.feedbackEl = document.getElementById('mb-feedback');
    this.timerFill = document.getElementById('mb-timer-fill');
    this.levelEl = document.getElementById('mb-level');
    this.statusEl = container.querySelector('.game-status');

    this.timerStart = null;
    this.timerDuration = null;
    this.rafId = null;

    const submit = () => {
      const val = this.answerEl.value.trim();
      if (val === '') return;
      if (!/^-?\d+$/.test(val)) return;
      socket.emit('game:event', { event: 'answer', data: { answer: Number(val) } });
      this.submitBtn.disabled = true;
    };

    this.submitBtn.addEventListener('click', submit);
    this.answerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  },

  _startTimer(duration) {
    this.timerStart = Date.now();
    this.timerDuration = duration;
    this.timerFill.style.width = '100%';
    this.timerFill.style.background = '';

    if (this.rafId) cancelAnimationFrame(this.rafId);

    const tick = () => {
      const elapsed = Date.now() - this.timerStart;
      const pct = Math.max(0, 1 - elapsed / this.timerDuration);
      this.timerFill.style.width = (pct * 100) + '%';

      if (pct < 0.25) {
        this.timerFill.style.background = 'var(--red)';
      } else if (pct < 0.5) {
        this.timerFill.style.background = 'var(--yellow)';
      }

      if (pct > 0) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  },

  onState(data) {
    switch (data.phase) {
      case 'solving':
        this.answered = false;
        this.problemEl.textContent = data.problem;
        this.problemEl.className = 'math-problem fade-in';
        this.inputArea.style.display = 'flex';
        this.answerEl.value = '';
        this.answerEl.disabled = false;
        this.submitBtn.disabled = false;
        this.feedbackEl.textContent = '';
        this.feedbackEl.className = 'math-feedback';
        this.answerEl.focus();
        this._startTimer(data.timeLimit);

        const levels = ['Easy', 'Medium', 'Hard', 'Expert'];
        const levelColors = ['var(--green)', 'var(--yellow)', 'var(--accent)', 'var(--red)'];
        this.levelEl.textContent = levels[data.level] || '';
        this.levelEl.style.color = levelColors[data.level] || '';

        this.statusEl.className = 'game-status info';
        this.statusEl.textContent = `Round ${data.round}/${data.totalRounds} — Solve it!`;
        break;

      case 'answered':
        this.answered = true;
        this.answerEl.disabled = true;
        this.submitBtn.disabled = true;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.feedbackEl.textContent = `✅ Correct! +${data.points} pts (${(data.solveTime / 1000).toFixed(1)}s)`;
        this.feedbackEl.className = 'math-feedback correct fade-in';
        this.statusEl.className = 'game-status success';
        this.statusEl.textContent = 'Nailed it! Waiting for others...';
        break;

      case 'wrong':
        this.feedbackEl.textContent = `❌ ${data.yourAnswer} is wrong — try again!`;
        this.feedbackEl.className = 'math-feedback wrong shake';
        this.answerEl.value = '';
        this.answerEl.focus();
        this.submitBtn.disabled = false;
        // Clear shake after animation
        setTimeout(() => { this.feedbackEl.classList.remove('shake'); }, 300);
        break;

      case 'result':
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.inputArea.style.display = 'none';
        this.problemEl.textContent = `${data.problem} = ${data.answer}`;

        if (data.solvers.length > 0) {
          const list = data.solvers
            .map((s, i) => `${['🥇','🥈','🥉'][i] || `#${i+1}`} ${s.name} (${(s.time/1000).toFixed(1)}s)`)
            .join('\n');
          this.feedbackEl.textContent = list;
          this.feedbackEl.className = 'math-feedback result';
        } else {
          this.feedbackEl.textContent = 'Nobody got it!';
          this.feedbackEl.className = 'math-feedback result';
        }

        this.statusEl.className = 'game-status info';
        this.statusEl.textContent = `${data.solvers.length}/${data.totalPlayers} solved it`;
        break;
    }
  },

  onTick(data) {
    // We use RAF-based timer instead
  }
};
