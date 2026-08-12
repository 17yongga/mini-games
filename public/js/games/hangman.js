// Hangman — client
window.GameClients['hangman'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this._timer = null;
    container.innerHTML = '<div class="game-status info">Get ready for Hangman! 🪢</div>';
  },

  onState(data) {
    switch (data.phase) {
      case 'round_start':    this._showGame(data); break;
      case 'letter_correct': this._updateGame(data); break;
      case 'letter_wrong':   this._updateGame(data); break;
      case 'already_guessed': this._flashAlreadyGuessed(data.letter); break;
      case 'word_wrong':     this._flashWordWrong(); break;
      case 'reveal':         this._showReveal(data); break;
    }
  },

  _showGame(data) {
    clearInterval(this._timer);
    const c = this.container;

    c.innerHTML = `
      <div class="hg-header">
        <span class="hg-round">Round ${data.round}/${data.totalRounds}</span>
        <span class="hg-hint">📂 ${data.hint}</span>
        <span class="hg-timer" id="hg-timer">${data.timeLimit}s</span>
      </div>
      <div class="hg-main">
        <div class="hg-scaffold-wrap">
          ${this._svgGallows(0)}
          <div class="hg-wrong-count" id="hg-wrong-label">0 / ${data.maxWrong} wrong</div>
        </div>
        <div class="hg-right">
          <div class="hg-blanks" id="hg-blanks">${this._renderBlanks(data.blanks)}</div>
          <div class="hg-wrong-letters" id="hg-wrong-letters"></div>
          <div class="hg-keyboard" id="hg-keyboard">${this._renderKeyboard([], [])}</div>
          <div class="hg-word-guess">
            <input type="text" id="hg-word-input" placeholder="Guess the whole word..." autocomplete="off" autocapitalize="characters" maxlength="20">
            <button class="btn btn-primary" id="hg-word-btn">Guess Word</button>
          </div>
          <div id="hg-feedback" class="hg-feedback"></div>
        </div>
      </div>
    `;

    this._bindEvents();

    const start = Date.now();
    const timerEl = document.getElementById('hg-timer');
    this._timer = setInterval(() => {
      const left = Math.max(0, data.timeLimit - Math.floor((Date.now() - start) / 1000));
      if (timerEl) timerEl.textContent = `${left}s`;
      if (left <= 0) clearInterval(this._timer);
    }, 500);
  },

  _updateGame(data) {
    // Update scaffold
    const scaffoldWrap = this.container.querySelector('.hg-scaffold-wrap');
    if (scaffoldWrap) {
      scaffoldWrap.innerHTML = this._svgGallows(data.wrongCount) +
        `<div class="hg-wrong-count" id="hg-wrong-label">${data.wrongCount} / ${data.maxWrong || 6} wrong</div>`;
    }

    // Update blanks
    const blanksEl = document.getElementById('hg-blanks');
    if (blanksEl) blanksEl.innerHTML = this._renderBlanks(data.blanks);

    // Update wrong letters display
    const wrongEl = document.getElementById('hg-wrong-letters');
    if (wrongEl && data.wrongLetters) {
      wrongEl.innerHTML = data.wrongLetters.length
        ? data.wrongLetters.map(l => `<span class="hg-wrong-badge">${l}</span>`).join('')
        : '';
    }

    // Update keyboard
    const kbEl = document.getElementById('hg-keyboard');
    if (kbEl) kbEl.innerHTML = this._renderKeyboard(data.wrongLetters || [], data.blanks || []);

    // Flash feedback
    const fb = document.getElementById('hg-feedback');
    if (fb) {
      if (data.phase === 'letter_correct') {
        fb.textContent = `✅ ${data.playerName} found "${data.letter}"!`;
        fb.className = 'hg-feedback success';
      } else if (data.phase === 'letter_wrong') {
        fb.textContent = `❌ ${data.playerName} tried "${data.letter}"`;
        fb.className = 'hg-feedback danger';
      }
      setTimeout(() => { if (fb) fb.textContent = ''; }, 1800);
    }
  },

  _flashAlreadyGuessed(letter) {
    const fb = document.getElementById('hg-feedback');
    if (fb) {
      fb.textContent = `"${letter}" was already guessed!`;
      fb.className = 'hg-feedback warning';
      setTimeout(() => { if (fb) fb.textContent = ''; }, 1500);
    }
    this._shakeKeyLetter(letter);
  },

  _flashWordWrong() {
    const input = document.getElementById('hg-word-input');
    if (input) {
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
    }
    const fb = document.getElementById('hg-feedback');
    if (fb) {
      fb.textContent = '❌ Wrong word, keep guessing!';
      fb.className = 'hg-feedback danger';
      setTimeout(() => { if (fb) fb.textContent = ''; }, 1500);
    }
  },

  _showReveal(data) {
    clearInterval(this._timer);
    const c = this.container;

    const reasonMsg = data.reason === 'solved'
      ? (data.solver ? `🎉 ${data.solver.name} solved it!` : '🎉 Word completed!')
      : data.reason === 'hanged'
        ? '💀 Nobody saved him... The word was:'
        : data.reason === 'timeout'
          ? `⏰ Time's up! The word was:`
          : 'Round over!';

    const bodyClass = data.reason === 'hanged' || data.reason === 'timeout' ? 'danger' : 'success';

    c.innerHTML = `
      <div class="hg-reveal fade-in">
        <div class="hg-scaffold-wrap" style="justify-content:center">
          ${this._svgGallows(data.wrongCount)}
        </div>
        <div class="hg-reveal-word" style="color:var(--${bodyClass === 'success' ? 'green' : 'red'})">${data.word}</div>
        <div class="game-status ${bodyClass}" id="hg-reveal-status"></div>
        <div class="hg-reveal-hint">📂 ${data.hint}</div>
        <div style="margin-top:8px;color:var(--text-muted);font-size:0.85rem">Next round in a moment…</div>
      </div>
    `;
    const status = c.querySelector('#hg-reveal-status');
    if (status) status.textContent = reasonMsg;
  },

  _bindEvents() {
    const kb = document.getElementById('hg-keyboard');
    if (kb) {
      kb.addEventListener('click', (e) => {
        const btn = e.target.closest('.hg-key');
        if (!btn || btn.disabled) return;
        this.socket.emit('game:event', { event: 'guess_letter', data: { letter: btn.dataset.letter } });
        btn.disabled = true;
        btn.classList.add('used');
      });
    }

    const wordBtn = document.getElementById('hg-word-btn');
    const wordInput = document.getElementById('hg-word-input');
    const doWordGuess = () => {
      const val = (wordInput.value || '').trim();
      if (!val) return;
      this.socket.emit('game:event', { event: 'guess_word', data: { word: val } });
      wordInput.value = '';
    };
    if (wordBtn) wordBtn.addEventListener('click', doWordGuess);
    if (wordInput) wordInput.addEventListener('keydown', e => { if (e.key === 'Enter') doWordGuess(); });
  },

  _renderBlanks(blanks) {
    return blanks.map(b =>
      `<span class="hg-blank ${b !== '_' ? 'revealed' : ''}">${b === '_' ? '&nbsp;' : b}</span>`
    ).join('');
  },

  _renderKeyboard(wrongLetters, blanks) {
    const correctLetters = blanks.filter(b => b !== '_');
    const rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Z','X','C','V','B','N','M']
    ];
    return rows.map(row =>
      `<div class="hg-kb-row">${row.map(l => {
        const isWrong = wrongLetters.includes(l);
        const isRight = correctLetters.includes(l);
        const cls = isWrong ? 'hg-key wrong' : isRight ? 'hg-key right' : 'hg-key';
        const dis = (isWrong || isRight) ? 'disabled' : '';
        return `<button class="${cls}" data-letter="${l}" ${dis}>${l}</button>`;
      }).join('')}</div>`
    ).join('');
  },

  _shakeKeyLetter(letter) {
    const btn = document.querySelector(`.hg-key[data-letter="${letter}"]`);
    if (btn) {
      btn.classList.add('shake');
      setTimeout(() => btn.classList.remove('shake'), 400);
    }
  },

  // SVG gallows + hangman parts (0-6 wrong guesses)
  _svgGallows(wrongCount) {
    const parts = [
      // 1: head
      `<circle cx="130" cy="55" r="16" stroke="var(--text)" stroke-width="3" fill="none"/>`,
      // 2: body
      `<line x1="130" y1="71" x2="130" y2="120" stroke="var(--text)" stroke-width="3"/>`,
      // 3: left arm
      `<line x1="130" y1="80" x2="105" y2="100" stroke="var(--text)" stroke-width="3"/>`,
      // 4: right arm
      `<line x1="130" y1="80" x2="155" y2="100" stroke="var(--text)" stroke-width="3"/>`,
      // 5: left leg
      `<line x1="130" y1="120" x2="105" y2="148" stroke="var(--text)" stroke-width="3"/>`,
      // 6: right leg
      `<line x1="130" y1="120" x2="155" y2="148" stroke="var(--text)" stroke-width="3"/>`,
    ];

    // When fully hanged, draw X eyes
    const face = wrongCount >= 6
      ? `<line x1="124" y1="49" x2="128" y2="53" stroke="var(--red)" stroke-width="2"/>
         <line x1="128" y1="49" x2="124" y2="53" stroke="var(--red)" stroke-width="2"/>
         <line x1="132" y1="49" x2="136" y2="53" stroke="var(--red)" stroke-width="2"/>
         <line x1="136" y1="49" x2="132" y2="53" stroke="var(--red)" stroke-width="2"/>
         <path d="M124 60 Q130 57 136 60" stroke="var(--red)" stroke-width="2" fill="none"/>`
      : '';

    const activeParts = parts.slice(0, wrongCount).join('');

    return `
      <svg class="hg-svg" viewBox="0 0 200 170" xmlns="http://www.w3.org/2000/svg">
        <!-- Scaffold -->
        <line x1="20" y1="160" x2="180" y2="160" stroke="var(--text)" stroke-width="3"/>
        <line x1="60" y1="160" x2="60" y2="10" stroke="var(--text)" stroke-width="3"/>
        <line x1="60" y1="10" x2="130" y2="10" stroke="var(--text)" stroke-width="3"/>
        <line x1="130" y1="10" x2="130" y2="39" stroke="var(--text)" stroke-width="3"/>
        ${activeParts}
        ${face}
      </svg>
    `;
  }
};
