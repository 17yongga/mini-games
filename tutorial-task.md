# Task: Build the Ghost Round Tutorial Overlay System

Implement a pre-game animated tutorial overlay for the Mini Games platform. Before Round 1 of any game, players see a ~4 second ghost animation showing how the game works. Skippable after 1 second.

---

## ARCHITECTURE

Pure client-side — zero server changes.

The flow:
1. `game:start` fires from server
2. `main.js` intercepts it, starts buffering `game:state` / `game:tick` / `game:progress` events
3. `TutorialEngine.run()` plays the tutorial overlay over `#game-container`
4. On complete or skip → drain buffered events → call `client.init()`
5. After init, real game events flow normally

---

## FILES TO CREATE

### 1. `public/css/tutorial.css`

Full CSS for the tutorial overlay system:

```css
/* Tutorial Overlay */
.tutorial-overlay {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 20, 0.93);
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  overflow: hidden;
}

.tutorial-progress-bar-wrap {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: rgba(255,255,255,0.1);
}
.tutorial-progress-bar {
  height: 100%;
  background: var(--accent, #3fb950);
  width: 100%;
  transition: none;
}

.tutorial-game-label {
  position: absolute;
  top: 14px;
  left: 0; right: 0;
  text-align: center;
  font-size: clamp(0.6rem, 2vw, 0.72rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.35);
}

.tutorial-step-content {
  text-align: center;
  max-width: 360px;
  padding: 0 24px;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tutorial-caption {
  position: absolute;
  bottom: 44px;
  left: 0; right: 0;
  text-align: center;
  font-size: clamp(0.72rem, 2.5vw, 0.82rem);
  color: rgba(255,255,255,0.45);
  padding: 0 24px;
  animation: tutFadeIn 0.5s ease forwards;
}

.tutorial-skip-btn {
  position: absolute;
  bottom: 14px;
  right: 18px;
  font-size: clamp(0.65rem, 2vw, 0.72rem);
  color: rgba(255,255,255,0.25);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.4s ease, color 0.2s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  padding: 8px 4px;
}
.tutorial-skip-btn.tutorial-skip-visible {
  opacity: 1;
}
.tutorial-skip-btn:hover {
  color: rgba(255,255,255,0.6);
}

.tutorial-flash-text {
  font-size: clamp(1.8rem, 6vw, 2.6rem);
  font-weight: 900;
  animation: tutFlash 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.tutorial-score-pop {
  position: absolute;
  font-size: clamp(0.85rem, 3vw, 1rem);
  font-weight: 700;
  color: var(--accent, #3fb950);
  animation: tutPop 1.2s ease forwards;
  pointer-events: none;
  white-space: nowrap;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.tutorial-countdown {
  font-size: clamp(3rem, 12vw, 5rem);
  font-weight: 900;
  animation: tutFlash 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.tutorial-exiting {
  animation: tutFadeOut 0.3s ease forwards;
}

/* Keyframes */
@keyframes tutFlash {
  0%   { opacity: 0; transform: scale(0.7); }
  60%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes tutPop {
  0%   { opacity: 0; transform: translate(-50%, -30%); }
  20%  { opacity: 1; transform: translate(-50%, -60%); }
  70%  { opacity: 1; transform: translate(-50%, -80%); }
  100% { opacity: 0; transform: translate(-50%, -100%); }
}

@keyframes tutFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes tutFadeOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.96); }
}
```

---

### 2. `public/js/tutorial.js`

```js
// Tutorial Engine — ghost round overlay before game starts
(function() {
  'use strict';

  window.TutorialEngine = {
    _timers: [],
    _rafId: null,
    _completed: false,
    _onComplete: null,
    _overlay: null,

    run(container, gameClient, gameName, socket, state, players, onComplete) {
      this._timers = [];
      this._rafId = null;
      this._completed = false;
      this._onComplete = onComplete;
      this._overlay = null;

      // Ensure container is relatively positioned
      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }

      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'tutorial-overlay';
      this._overlay = overlay;

      // Progress bar
      const pbWrap = document.createElement('div');
      pbWrap.className = 'tutorial-progress-bar-wrap';
      const pb = document.createElement('div');
      pb.className = 'tutorial-progress-bar';
      pb.id = 'tutorial-pb';
      pbWrap.appendChild(pb);
      overlay.appendChild(pbWrap);

      // Game label
      const label = document.createElement('div');
      label.className = 'tutorial-game-label';
      label.textContent = gameName + ' · HOW TO PLAY';
      overlay.appendChild(label);

      // Step content area
      const content = document.createElement('div');
      content.className = 'tutorial-step-content';
      overlay.appendChild(content);

      // Caption
      const caption = document.createElement('div');
      caption.className = 'tutorial-caption';
      overlay.appendChild(caption);

      // Skip button
      const skipBtn = document.createElement('div');
      skipBtn.className = 'tutorial-skip-btn';
      skipBtn.textContent = 'Tap to skip →';
      overlay.appendChild(skipBtn);

      container.appendChild(overlay);

      const self = this;

      skipBtn.addEventListener('click', () => self.skip());
      skipBtn.addEventListener('touchstart', (e) => { e.preventDefault(); self.skip(); }, { passive: false });

      // Show skip after 1s
      this._timers.push(setTimeout(() => {
        skipBtn.classList.add('tutorial-skip-visible');
      }, 1000));

      if (!gameClient.tutorial) {
        // Fallback: 3-2-1 countdown
        this._runCountdown(content, onComplete);
        return;
      }

      const { duration, steps } = gameClient.tutorial;

      // Progress bar animation
      const startTime = performance.now();
      const animPb = (now) => {
        const elapsed = now - startTime;
        const pct = Math.max(0, 1 - elapsed / duration);
        pb.style.width = (pct * 100) + '%';
        if (pct > 0 && !this._completed) {
          this._rafId = requestAnimationFrame(animPb);
        }
      };
      this._rafId = requestAnimationFrame(animPb);

      // Schedule steps
      steps.forEach(step => {
        const tid = setTimeout(() => {
          this._runStep(step, content, caption);
        }, step.at);
        this._timers.push(tid);
      });

      // Auto-complete
      this._timers.push(setTimeout(() => {
        this._complete();
      }, duration));
    },

    _runStep(step, content, caption) {
      switch (step.type) {
        case 'html':
          content.innerHTML = step.content;
          break;

        case 'flash': {
          const el = document.createElement('div');
          el.className = 'tutorial-flash-text';
          el.textContent = step.content;
          content.innerHTML = '';
          content.appendChild(el);
          break;
        }

        case 'score': {
          const pop = document.createElement('div');
          pop.className = 'tutorial-score-pop';
          let txt = '+' + step.points + ' pts  👻 ' + step.player;
          if (step.time) txt += '  · ' + step.time;
          pop.textContent = txt;
          content.style.position = 'relative';
          content.appendChild(pop);
          setTimeout(() => { if (pop.parentNode) pop.remove(); }, 1300);
          break;
        }

        case 'caption':
          caption.textContent = step.content;
          caption.style.animation = 'none';
          void caption.offsetWidth; // reflow
          caption.style.animation = '';
          break;

        case 'player-tag': {
          const tag = document.createElement('div');
          tag.style.cssText = 'display:inline-block;background:rgba(255,255,255,0.1);border-radius:999px;padding:4px 12px;font-size:0.78rem;margin-top:8px;';
          tag.textContent = '👻 ' + step.player;
          content.appendChild(tag);
          break;
        }

        case 'clear':
          content.innerHTML = '';
          break;
      }
    },

    _runCountdown(content, onComplete) {
      const steps = [
        { at: 0,   text: '3' },
        { at: 500, text: '2' },
        { at: 1000, text: '1' },
        { at: 1500, text: 'GO! 🚀' }
      ];
      steps.forEach(s => {
        const tid = setTimeout(() => {
          content.innerHTML = '';
          const el = document.createElement('div');
          el.className = 'tutorial-countdown';
          el.textContent = s.text;
          content.appendChild(el);
        }, s.at);
        this._timers.push(tid);
      });
      this._timers.push(setTimeout(() => this._complete(), 1900));
    },

    _complete() {
      if (this._completed) return;
      this._completed = true;

      // Cancel pending timers + RAF
      this._timers.forEach(id => clearTimeout(id));
      this._timers = [];
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

      // Animate out
      if (this._overlay) {
        this._overlay.classList.add('tutorial-exiting');
        const cb = this._onComplete;
        setTimeout(() => {
          if (this._overlay && this._overlay.parentNode) {
            this._overlay.remove();
          }
          this._overlay = null;
          if (cb) cb();
        }, 320);
      } else {
        if (this._onComplete) this._onComplete();
      }
    },

    skip() {
      this._complete();
    }
  };
})();
```

---

## FILES TO MODIFY

### 3. `public/js/main.js`

Find the existing `socket.on('game:start', ...)` handler and replace its entire body. Also find and REMOVE the standalone `socket.on('game:state', ...)`, `socket.on('game:tick', ...)`, and `socket.on('game:progress', ...)` handlers — they will now be registered inside `launchGame`. The `game:end` handler stays unchanged.

Replace the game:start handler with:

```js
socket.on('game:start', ({ gameId, gameName, players }) => {
  showScreen('game');
  state.currentGame = gameId;
  $('#game-title').textContent = gameName;
  $('#game-container').innerHTML = '';

  // Buffer incoming game events during tutorial
  const eventBuffer = [];
  socket.off('game:state');
  socket.off('game:tick');
  socket.off('game:progress');
  socket.on('game:state', (d) => eventBuffer.push({ type: 'game:state', data: d }));
  socket.on('game:tick',  (d) => eventBuffer.push({ type: 'game:tick',  data: d }));
  socket.on('game:progress', (d) => eventBuffer.push({ type: 'game:progress', data: d }));

  const launchGame = (client) => {
    // Restore real listeners
    socket.off('game:state');
    socket.off('game:tick');
    socket.off('game:progress');

    socket.on('game:state', (data) => {
      const c = window.GameClients[state.currentGame];
      if (c && c.onState) c.onState(data, socket, state);
      if (data.round && data.totalRounds) {
        $('#game-round').textContent = 'Round ' + data.round + '/' + data.totalRounds;
      }
    });
    socket.on('game:tick', (data) => {
      const c = window.GameClients[state.currentGame];
      if (c && c.onTick) c.onTick(data, socket, state);
    });
    socket.on('game:progress', (data) => {
      const c = window.GameClients[state.currentGame];
      if (c && c.onProgress) c.onProgress(data, socket, state);
    });

    // Init the real game
    client.init($('#game-container'), socket, state, players);

    // Drain buffered events
    eventBuffer.forEach(function(ev) {
      const c = window.GameClients[state.currentGame];
      if (ev.type === 'game:state') {
        if (c && c.onState) c.onState(ev.data, socket, state);
        if (ev.data.round && ev.data.totalRounds) {
          $('#game-round').textContent = 'Round ' + ev.data.round + '/' + ev.data.totalRounds;
        }
      } else if (ev.type === 'game:tick' && c && c.onTick) {
        c.onTick(ev.data, socket, state);
      } else if (ev.type === 'game:progress' && c && c.onProgress) {
        c.onProgress(ev.data, socket, state);
      }
    });
  };

  const runWithClient = (client) => {
    window.TutorialEngine.run(
      $('#game-container'),
      client,
      gameName,
      socket, state, players,
      function() { launchGame(client); }
    );
  };

  const client = window.GameClients[gameId];
  if (client && client.init) {
    runWithClient(client);
  } else {
    $('#game-container').innerHTML = '<div class="game-status info">Loading game...</div>';
    const script = document.createElement('script');
    script.src = '/play/js/games/' + gameId + '.js?cb=' + Date.now();
    script.onload = function() {
      const c = window.GameClients[gameId];
      if (c && c.init) {
        $('#game-container').innerHTML = '';
        runWithClient(c);
      } else {
        $('#game-container').innerHTML = '<div class="game-status warning">⚠️ ' + gameName + ' failed to load. Please hard-refresh.</div>';
      }
    };
    script.onerror = function() {
      $('#game-container').innerHTML = '<div class="game-status warning">⚠️ Could not fetch ' + gameName + ' script. Please hard-refresh.</div>';
    };
    document.head.appendChild(script);
  }
});
```

---

### 4. `public/index.html`

Add BEFORE the `<script src="/play/js/main.js?v=9">` line:
```html
  <link rel="stylesheet" href="/play/css/tutorial.css?v=1">
  <script src="/play/js/tutorial.js?v=1"></script>
```

---

### 5. `public/js/games/reaction-race.js`

Add a `tutorial` property to the `window.GameClients['reaction-race']` object (add it as the first property):

```js
tutorial: {
  duration: 4500,
  steps: [
    { at: 0,    type: 'html',    content: '<div style="font-size:2.5rem">⏳</div><div style="font-size:1.1rem;font-weight:700;margin-top:8px">Wait for the signal...</div>' },
    { at: 900,  type: 'flash',   content: '🟢 TAP NOW!' },
    { at: 1100, type: 'score',   player: 'Ghost Gary', points: 10, time: '0.31s' },
    { at: 1800, type: 'html',    content: '<div style="font-size:2.5rem">⏳</div><div style="font-size:1.1rem;font-weight:700;margin-top:8px">Wait again...</div>' },
    { at: 2600, type: 'flash',   content: '🟢 TAP NOW!' },
    { at: 2900, type: 'score',   player: 'Ghost Maya', points: 10, time: '0.28s' },
    { at: 3600, type: 'caption', content: 'Tap the instant the zone turns green — fastest finger wins!' }
  ]
},
```

---

### 6. `public/js/games/trivia-blitz.js`

Add a `tutorial` property as the first property of `window.GameClients['trivia-blitz']`:

```js
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
```

---

### 7. `public/js/games/math-blitz.js`

Add a `tutorial` property as the first property of `window.GameClients['math-blitz']`:

```js
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
```

---

## IMPORTANT NOTES

1. Remove the existing standalone `socket.on('game:state', ...)`, `socket.on('game:tick', ...)`, `socket.on('game:progress', ...)` handlers from `main.js` — they are now inside `launchGame`. Do NOT remove `game:end`.

2. Check `public/css/style.css` — if `.game-container` does not have `position: relative`, add it.

3. The `_complete` guard (`this._completed`) prevents double-fire if skip races with timeout.

4. When done, run: `openclaw system event --text "Done: Ghost round tutorial overlay built" --mode now`
