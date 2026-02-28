// Color Clash — client
window.GameClients['color-clash'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this.timerInterval = null;
    container.innerHTML = `
      <div class="game-status info">Get ready for Color Clash!</div>
      <div class="color-clash-area" id="cc-area">
        <div class="cc-word" id="cc-word"></div>
        <div class="cc-timer" id="cc-timer"></div>
        <div class="cc-options" id="cc-options"></div>
        <div class="cc-feedback" id="cc-feedback"></div>
      </div>
      <style>
        .color-clash-area {
          text-align: center;
          padding: 20px;
        }
        .cc-word {
          font-size: 3.5em;
          font-weight: 900;
          text-transform: uppercase;
          margin: 20px 0;
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
          letter-spacing: 4px;
        }
        .cc-timer {
          height: 6px;
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
          margin: 10px auto;
          max-width: 300px;
          overflow: hidden;
        }
        .cc-timer-bar {
          height: 100%;
          background: linear-gradient(90deg, #ff4444, #ffaa00, #44ff44);
          border-radius: 3px;
          transition: width 0.1s linear;
        }
        .cc-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          max-width: 350px;
          margin: 20px auto;
        }
        .cc-btn {
          padding: 16px;
          border: 3px solid rgba(255,255,255,0.3);
          border-radius: 12px;
          font-size: 1.1em;
          font-weight: 700;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
          color: #fff;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        .cc-btn:active { transform: scale(0.95); }
        .cc-btn.correct { border-color: #44ff44; box-shadow: 0 0 15px rgba(68,255,68,0.5); }
        .cc-btn.wrong { border-color: #ff4444; opacity: 0.5; }
        .cc-btn.disabled { pointer-events: none; opacity: 0.7; }
        .cc-feedback {
          font-size: 1.3em;
          margin-top: 15px;
          min-height: 30px;
          font-weight: 600;
        }
        .cc-result-item { margin: 4px 0; }
        .cc-streak { color: #ffaa00; font-size: 0.9em; }
      </style>
    `;
  },

  _colorHex(name) {
    const map = {
      red: '#ff3333',
      blue: '#3399ff',
      green: '#33cc33',
      yellow: '#ffdd00',
      purple: '#bb44ff',
      orange: '#ff8800'
    };
    return map[name] || '#ffffff';
  },

  onState(data) {
    const area = document.getElementById('cc-area');
    const word = document.getElementById('cc-word');
    const timer = document.getElementById('cc-timer');
    const options = document.getElementById('cc-options');
    const feedback = document.getElementById('cc-feedback');
    const status = this.container.querySelector('.game-status');

    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }

    switch (data.phase) {
      case 'question': {
        status.className = 'game-status warning';
        status.textContent = `Round ${data.round} of ${data.totalRounds} — Tap the INK COLOR!`;
        word.textContent = data.word.toUpperCase();
        word.style.color = this._colorHex(data.inkColor);
        feedback.textContent = '';

        // Timer bar
        timer.innerHTML = '<div class="cc-timer-bar" id="cc-bar" style="width:100%"></div>';
        const bar = document.getElementById('cc-bar');
        const start = Date.now();
        const limit = data.timeLimit;
        this.timerInterval = setInterval(() => {
          const elapsed = Date.now() - start;
          const pct = Math.max(0, 100 - (elapsed / limit * 100));
          bar.style.width = pct + '%';
          if (pct <= 0) clearInterval(this.timerInterval);
        }, 50);

        // Option buttons
        options.innerHTML = data.options.map(c =>
          `<button class="cc-btn" style="background:${this._colorHex(c)}" data-color="${c}">${c}</button>`
        ).join('');

        options.querySelectorAll('.cc-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this.socket.emit('game:event', { event: 'answer', data: { choice: btn.dataset.color } });
            options.querySelectorAll('.cc-btn').forEach(b => b.classList.add('disabled'));
          });
        });
        break;
      }

      case 'answered':
        feedback.textContent = data.correct
          ? (data.streak > 1 ? `✅ Correct! ${data.streak}🔥 streak!` : '✅ Correct!')
          : '❌ Wrong! Remember: tap the INK color!';
        feedback.style.color = data.correct ? '#44ff44' : '#ff4444';
        break;

      case 'result': {
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
        word.textContent = '';
        timer.innerHTML = '';
        options.innerHTML = '';
        status.className = 'game-status info';
        status.textContent = `Round ${data.round} — Answer was ${data.correctAnswer.toUpperCase()}`;

        if (data.results && data.results.length > 0) {
          feedback.innerHTML = data.results.map(r =>
            `<div class="cc-result-item">${r.correct ? '✅' : '❌'} ${r.name} ${r.correct ? `(${r.time}ms)` : ''}</div>`
          ).join('');
        } else {
          feedback.textContent = 'No answers this round!';
        }
        feedback.style.color = '#ffffff';
        break;
      }
    }
  },

  cleanup() {
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
  }
};
