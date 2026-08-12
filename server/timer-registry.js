'use strict';

class TimerRegistry {
  constructor(isCurrent = () => true, onError = () => {}, context = {}) {
    this.isCurrent = isCurrent;
    this.onError = onError;
    this.context = context;
    this.handles = new Map();
  }

  timeout(callback, delayMs, group = 'default') {
    return this._schedule('timeout', callback, delayMs, group);
  }

  interval(callback, delayMs, group = 'default') {
    return this._schedule('interval', callback, delayMs, group);
  }

  _schedule(kind, callback, delayMs, group) {
    if (typeof callback !== 'function') throw new TypeError('Timer callback must be a function');
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError('Timer delay must be finite and non-negative');

    let handle;
    const wrapped = () => {
      if (kind === 'timeout') this.handles.delete(handle);
      if (!this.isCurrent()) {
        if (kind === 'interval') this.cancel(handle);
        return;
      }
      try {
        callback();
      } catch (error) {
        if (kind === 'interval') this.cancel(handle);
        try {
          this.onError(error, { ...this.context, kind, group });
        } catch {
          // Error reporting must never turn a contained timer failure into a crash.
        }
      }
    };
    handle = kind === 'timeout'
      ? setTimeout(wrapped, delayMs)
      : setInterval(wrapped, delayMs);
    this.handles.set(handle, { kind, group });
    return handle;
  }

  cancel(handle) {
    const entry = this.handles.get(handle);
    if (!entry) return false;
    if (entry.kind === 'interval') clearInterval(handle);
    else clearTimeout(handle);
    this.handles.delete(handle);
    return true;
  }

  cancelGroup(group) {
    for (const [handle, entry] of this.handles) {
      if (entry.group === group) this.cancel(handle);
    }
  }

  cancelAll() {
    for (const handle of [...this.handles.keys()]) this.cancel(handle);
  }

  get size() {
    return this.handles.size;
  }
}

module.exports = { TimerRegistry };
