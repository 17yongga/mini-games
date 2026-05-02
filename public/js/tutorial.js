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
      label.textContent = gameName + ' \u00b7 HOW TO PLAY';
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
      skipBtn.textContent = 'Tap to skip \u2192';
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
          let txt = '+' + step.points + ' pts  \ud83d\udc7b ' + step.player;
          if (step.time) txt += '  \u00b7 ' + step.time;
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
          tag.textContent = '\ud83d\udc7b ' + step.player;
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
        { at: 1500, text: 'GO! \ud83d\ude80' }
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
