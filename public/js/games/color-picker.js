// Color Picker — client
window.GameClients['color-picker'] = {
  init(container, socket) {
    this.container = container;
    this.socket = socket;
    this._rafId = null;
    this._timerStart = null;
    this._timerDuration = null;
    this._submitted = false;

    container.innerHTML = `
      <div class="game-status info">Get ready to mix colors! 🌈</div>
      <div id="cp-main"></div>
      <style>
        .cp-wrap { padding: 10px 4px; max-width: 420px; margin: 0 auto; }
        .cp-round-label { text-align: center; font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .cp-swatches { display: flex; gap: 12px; margin-bottom: 12px; }
        .cp-swatch-box { flex: 1; text-align: center; }
        .cp-swatch {
          width: 100%; height: 88px; border-radius: 14px;
          border: 2px solid rgba(255,255,255,0.15);
          transition: background 0.08s;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        .cp-swatch-label { font-size: 0.72rem; color: var(--text-muted); margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }
        .cp-swatch-hex { font-size: 0.68rem; color: var(--text-muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
        .cp-timer-bar { height: 5px; background: rgba(255,255,255,0.12); border-radius: 3px; margin-bottom: 14px; overflow: hidden; }
        .cp-timer-fill { height: 100%; width: 100%; background: linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #44cc44 100%); border-radius: 3px; }
        .cp-sliders { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .cp-slider-row { display: flex; align-items: center; gap: 10px; }
        .cp-slider-lbl { font-weight: 800; font-size: 0.88rem; width: 16px; text-align: center; flex-shrink: 0; }
        .cp-slider-lbl.r { color: #ff5555; }
        .cp-slider-lbl.g { color: #44dd44; }
        .cp-slider-lbl.b { color: #5599ff; }
        .cp-slider { flex: 1; cursor: pointer; accent-color: var(--accent); height: 4px; }
        .cp-slider:disabled { opacity: 0.45; cursor: not-allowed; }
        .cp-slider-val { width: 28px; text-align: right; font-size: 0.8rem; color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .cp-submit-btn { width: 100%; padding: 13px; font-size: 1rem; font-weight: 700; border-radius: 10px; margin-top: 2px; }
        .cp-submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .cp-submitted-msg { text-align: center; padding: 10px 0 4px; font-size: 0.95rem; font-weight: 600; color: var(--accent); }
        .cp-result-wrap { padding: 6px 0; }
        .cp-result-target { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .cp-result-target-swatch { width: 52px; height: 52px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0; }
        .cp-result-target-info { }
        .cp-result-target-title { font-weight: 700; font-size: 1rem; }
        .cp-result-target-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
        .cp-result-row { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .cp-result-rank { width: 18px; text-align: center; font-size: 0.78rem; color: var(--text-muted); flex-shrink: 0; }
        .cp-result-swatch { width: 30px; height: 30px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.18); flex-shrink: 0; }
        .cp-result-name { flex: 1; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cp-result-dist { font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0; }
        .cp-result-pts { font-weight: 700; color: var(--accent); font-size: 0.88rem; min-width: 44px; text-align: right; flex-shrink: 0; }
        .cp-next-msg { text-align: center; margin-top: 12px; font-size: 0.78rem; color: var(--text-muted); }
        .cp-medal { font-size: 1rem; }
      </style>
    `;
  },

  onState(data) {
    switch (data.phase) {
      case 'picking':   this._showPicking(data);   break;
      case 'submitted': this._showSubmitted(data); break;
      case 'result':    this._showResult(data);    break;
    }
  },

  _rgb(r, g, b) { return `rgb(${r},${g},${b})`; },
  _hex(r, g, b) { return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''); },
  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  },

  _showPicking(data) {
    this._submitted = false;
    const t = data.target;
    const status = this.container.querySelector('.game-status');
    if (status) {
      status.className = 'game-status info';
      status.textContent = `Round ${data.round}/${data.totalRounds} — Match that color!`;
    }

    const main = document.getElementById('cp-main');
    if (!main) return;

    main.innerHTML = `
      <div class="cp-wrap">
        <div class="cp-round-label">Round ${data.round} of ${data.totalRounds}</div>
        <div class="cp-swatches">
          <div class="cp-swatch-box">
            <div class="cp-swatch" id="cp-target-swatch" style="background:${this._rgb(t.r, t.g, t.b)}"></div>
            <div class="cp-swatch-label">Target</div>
            <div class="cp-swatch-hex" id="cp-target-hex">${this._hex(t.r, t.g, t.b)}</div>
          </div>
          <div class="cp-swatch-box">
            <div class="cp-swatch" id="cp-preview-swatch" style="background:rgb(128,128,128)"></div>
            <div class="cp-swatch-label">Your Mix</div>
            <div class="cp-swatch-hex" id="cp-preview-hex">#808080</div>
          </div>
        </div>
        <div class="cp-timer-bar">
          <div class="cp-timer-fill" id="cp-timer-fill" style="width:100%"></div>
        </div>
        <div class="cp-sliders">
          <div class="cp-slider-row">
            <span class="cp-slider-lbl r">R</span>
            <input type="range" class="cp-slider" id="cp-r" min="0" max="255" value="128">
            <span class="cp-slider-val" id="cp-rv">128</span>
          </div>
          <div class="cp-slider-row">
            <span class="cp-slider-lbl g">G</span>
            <input type="range" class="cp-slider" id="cp-g" min="0" max="255" value="128">
            <span class="cp-slider-val" id="cp-gv">128</span>
          </div>
          <div class="cp-slider-row">
            <span class="cp-slider-lbl b">B</span>
            <input type="range" class="cp-slider" id="cp-b" min="0" max="255" value="128">
            <span class="cp-slider-val" id="cp-bv">128</span>
          </div>
        </div>
        <button class="btn btn-primary cp-submit-btn" id="cp-submit">Submit Mix 🎯</button>
      </div>
    `;

    this._bindSliders();
    this._startTimer(data.timeLimit);
  },

  _bindSliders() {
    const rEl = document.getElementById('cp-r');
    const gEl = document.getElementById('cp-g');
    const bEl = document.getElementById('cp-b');
    const preview = document.getElementById('cp-preview-swatch');
    const previewHex = document.getElementById('cp-preview-hex');
    const rvEl = document.getElementById('cp-rv');
    const gvEl = document.getElementById('cp-gv');
    const bvEl = document.getElementById('cp-bv');
    const submitBtn = document.getElementById('cp-submit');
    if (!rEl || !gEl || !bEl || !submitBtn) return;

    const update = () => {
      const r = parseInt(rEl.value);
      const g = parseInt(gEl.value);
      const b = parseInt(bEl.value);
      if (preview) preview.style.background = this._rgb(r, g, b);
      if (previewHex) previewHex.textContent = this._hex(r, g, b);
      if (rvEl) rvEl.textContent = r;
      if (gvEl) gvEl.textContent = g;
      if (bvEl) bvEl.textContent = b;
    };

    rEl.addEventListener('input', update);
    gEl.addEventListener('input', update);
    bEl.addEventListener('input', update);

    submitBtn.addEventListener('click', () => {
      if (this._submitted) return;
      this._submitted = true;
      submitBtn.disabled = true;
      this.socket.emit('game:event', {
        event: 'submit',
        data: {
          r: parseInt(rEl.value),
          g: parseInt(gEl.value),
          b: parseInt(bEl.value)
        }
      });
    });
  },

  _startTimer(duration) {
    this._timerStart = Date.now();
    this._timerDuration = duration;
    if (this._rafId) cancelAnimationFrame(this._rafId);

    const tick = () => {
      const fill = document.getElementById('cp-timer-fill');
      if (!fill) return;
      const elapsed = Date.now() - this._timerStart;
      const pct = Math.max(0, 1 - elapsed / this._timerDuration);
      fill.style.width = (pct * 100) + '%';
      if (pct > 0) this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  },

  _showSubmitted(data) {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

    // Disable sliders + button
    ['cp-r', 'cp-g', 'cp-b'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });
    const btn = document.getElementById('cp-submit');
    if (btn) btn.disabled = true;

    // Update preview to actual submitted color
    const g = data.guess;
    const preview = document.getElementById('cp-preview-swatch');
    const previewHex = document.getElementById('cp-preview-hex');
    if (preview) preview.style.background = this._rgb(g.r, g.g, g.b);
    if (previewHex) previewHex.textContent = this._hex(g.r, g.g, g.b);

    // Show accuracy feedback
    const accuracy = Math.round(Math.max(0, (1 - data.dist / 765) * 100));
    const wrap = document.querySelector('.cp-wrap');
    if (wrap) {
      const msg = document.createElement('div');
      msg.className = 'cp-submitted-msg fade-in';
      msg.innerHTML = `✅ Submitted! ~${accuracy}% accurate · <strong>+${data.points} pts</strong>`;
      wrap.appendChild(msg);
    }
  },

  _showResult(data) {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

    const status = this.container.querySelector('.game-status');
    if (status) {
      status.className = 'game-status success';
      status.textContent = `Round ${data.round} — Results`;
    }

    const main = document.getElementById('cp-main');
    if (!main) return;

    const t = data.target;
    const medals = ['🥇', '🥈', '🥉'];

    main.innerHTML = `
      <div class="cp-wrap cp-result-wrap fade-in">
        <div class="cp-result-target">
          <div class="cp-result-target-swatch" style="background:${this._rgb(t.r, t.g, t.b)}"></div>
          <div class="cp-result-target-info">
            <div class="cp-result-target-title">Target Color</div>
            <div class="cp-result-target-sub">${this._hex(t.r, t.g, t.b)} · rgb(${t.r}, ${t.g}, ${t.b})</div>
          </div>
        </div>
        <div id="cp-result-rows"></div>
        <div class="cp-next-msg">Next round starting…</div>
      </div>
    `;
    const rows = main.querySelector('#cp-result-rows');
    data.results.forEach((r, i) => {
      const row = document.createElement('div'); row.className = 'cp-result-row';
      const rank = document.createElement('div'); rank.className = 'cp-result-rank'; rank.textContent = medals[i] || (i + 1);
      const swatch = document.createElement('div'); swatch.className = 'cp-result-swatch';
      const swatchHex = r.guess ? this._hex(r.guess.r, r.guess.g, r.guess.b) : '—';
      swatch.style.background = r.guess ? this._rgb(r.guess.r, r.guess.g, r.guess.b) : '#2a2a2a'; swatch.title = swatchHex;
      const name = document.createElement('div'); name.className = 'cp-result-name'; name.textContent = r.name;
      const accuracy = r.guess ? Math.round(Math.max(0, (1 - r.dist / 765) * 100)) : 0;
      const distance = document.createElement('div'); distance.className = 'cp-result-dist'; distance.textContent = r.guess ? `~${accuracy}%` : 'no sub';
      const points = document.createElement('div'); points.className = 'cp-result-pts'; points.textContent = `+${r.points}`;
      row.append(rank, swatch, name, distance, points); rows.append(row);
    });
  },

  cleanup() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }
};
