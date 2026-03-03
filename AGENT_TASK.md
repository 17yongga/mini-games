# Agent Task: Add Type Racer Game

## Context
This is a pre-approved implementation task. Plan review was completed. Implement exactly what is specified — no re-review, no gold-plating, no scope creep.

## DEV PROTOCOL (mandatory)
- Explicit over clever. DRY. No silent failures. Commit after each logical unit.

---

## APPROVED CHANGES — implement all 5 in order:

### 1. `server/rooms.js` — add gs.progress to rejoinRoom migration
In the `rejoinRoom` function, find the block that migrates `gs.pairsFound`. After it, add:
```js
if (gs.progress instanceof Map && gs.progress.has(oldId)) {
  gs.progress.set(socket.id, gs.progress.get(oldId));
  gs.progress.delete(oldId);
}
```

### 2. `server/games/type-racer.js` — new server game module
Game rules:
- 5 rounds, each with a unique sentence drawn from a pool of ~15 varied sentences
- ROUND_TIME = 30000ms
- Scoring: base = Math.round(wpm * accuracyMultiplier), where:
  - wpm = (sentence.length / 5) / (elapsed_ms / 60000)
  - accuracyMultiplier = correctChars / Math.max(1, totalTyped) clamped 0–1
  - Top 3 finishers in a round get +50/+30/+10 bonus points
- Phases per round: 'typing' → 'result' (3500ms) → next round
- Socket events IN:
  - 'progress': { typed: string } — current typed string (100ms throttled by client)
  - 'finish': { typed: string, elapsed: number } — player completed sentence
- Socket events OUT:
  - game:state — phase, sentence, round, totalRounds, timeLimit, finishers[]
  - game:progress — { players: [{ id, name, pct }] } broadcast on each progress update
  - game:tick — { timeLeft }
- Timer pattern: use room._trTimers = [] and a _addTimer(room, t) helper (same as math-blitz)
- Export: { id:'type-racer', name:'Type Racer', description:'...', icon:'⌨️', minPlayers:2, maxPlayers:20, rounds:5, init, onEvent, cleanup }
- Guard every onEvent: check room, gameState, phase before acting. No silent failures.

### 3. `public/js/games/type-racer.js` — new client game module
- window.GameClients['type-racer'] = { init(container, socket), onState(data), onTick(data) }
- init(): build UI via innerHTML:
  - .game-status bar (round info)
  - .tr-sentence (large, prominent display of the sentence)
  - .tr-input (textarea or input for typing)
  - .tr-timer-bar / .tr-timer-fill (countdown bar, same pattern as math-blitz)
  - .tr-progress-list (one row per player showing name + progress bar %)
  - .tr-feedback (WPM, accuracy, position on finish)
- Keystroke handling:
  - On each input event: throttle — use a flag + setTimeout(100ms) to emit at most 1 progress event per 100ms
  - emit: socket.emit('game:event', { event: 'progress', data: { typed: val } })
  - When input value === sentence exactly: emit finish event with elapsed time, disable input
- onState(data):
  - phase 'typing': show sentence, clear input, enable input, focus it, start timer RAF
  - phase 'result': disable input, show finishers list with WPM + accuracy
- onTick(data): update timer fill width (use RAF approach like math-blitz client)
- Use cancelAnimationFrame to clean up between rounds

### 4. `server/bots.js` — add type-racer case
In scheduleBotActions switch, add: `case 'type-racer': startTypeRacerBot(room, io, botId, bot, sock); break;`

Implement startTypeRacerBot:
- Poll interval watching for phase === 'typing' and new round (use lastRound pattern)
- On new round: schedule a 'finish' event with difficulty-scaled timing:
  - easy: delay 18000–25000ms, wpm 35–50, accuracy 0.80–0.92
  - medium: delay 10000–17000ms, wpm 55–75, accuracy 0.92–0.97
  - hard: delay 3000–9000ms, wpm 80–110, accuracy 0.97–1.0
- Bot calls room.currentGame.onEvent(room, fakeSocket, 'finish', { typed: sentence, elapsed }, io)
- Guard: check phase still 'typing' before firing

### 5. `test/type-racer.test.js` — node assert tests (NO Jest, just require('assert'))
Create test/ directory. Test:
- Sentence pool: generateSentences(5) returns 5 unique non-empty strings
- WPM formula: given known chars, elapsed → expected wpm value (test the math)
- Accuracy: full match = 1.0, 8/10 chars correct = 0.8
- onEvent 'progress': valid string updates gs.progress map; null/undefined data handled without crash
- onEvent 'finish': correct sentence → player scores points; wrong sentence → 0 points added
- Duplicate finish: second finish event for same player is ignored
- Empty typed string: handled gracefully (no crash, no score)

Run: `node test/type-racer.test.js` — should print "All tests passed ✅"

---

## After all 5 changes:
1. Run `node test/type-racer.test.js` — confirm all pass
2. Run `node server/server.js` briefly (Ctrl+C after "Loaded game: Type Racer" appears)
3. Commit: `git add -A && git commit -m "feat(mini-games): add Type Racer game with bot support and tests"`
4. Notify: `openclaw system event --text "Done: Type Racer added to mini-games — all 5 changes complete, tests passing" --mode now`
5. Delete this file: `rm AGENT_TASK.md`
