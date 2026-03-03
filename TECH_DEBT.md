# Technical Debt — Mini Games Platform

Items flagged during plan reviews. Revisit before scaling.

---

## TD-001 — Generic reconnect state migration
**Filed:** 2026-03-03 | **Priority:** Medium

**Problem:** `rooms.js` `rejoinRoom()` manually lists specific game state fields to migrate on reconnect (`gs.answers`, `gs.tapped`, `gs.taps`, `gs.pairsFound`, etc.). Every new game that adds a new Map/Set to `gameState` requires a manual addition here. Currently 5 hardcoded field names — will keep growing.

**Proposed fix (Option B):** Refactor `rejoinRoom` to generically iterate over all Map and Set instances in `gameState` and swap old socket ID → new socket ID, rather than naming fields explicitly. Eliminates the DRY violation entirely.

**Effort:** 1-2hr | **Risk:** Medium (touches every game's reconnect path — needs testing) | **Future maintenance:** Zero

**Workaround in place:** Manual field additions per new game (Option A).

---

## TD-002 — No test infrastructure across any project
**Filed:** 2026-03-03 | **Priority:** High

**Problem:** Zero automated tests exist across mini-games, casino, budget-app, ask-gary, or personal-website. Every deploy is "it seemed fine when I clicked around." Scoring bugs, regressions, and edge cases go undetected until prod.

**Proposed fix:** Establish a proper testing pipeline across all active projects:
- **mini-games / casino / ask-gary (Node):** Jest + Supertest for server logic, Socket.IO event handlers, scoring functions
- **budget-app / ask-gary (React):** React Testing Library for component tests
- **All web projects:** Playwright e2e smoke tests (critical user journeys) — see `~/clawd/skills/e2e-testing-patterns/`
- **CI gate:** GitHub Actions — run tests on every push, block merges on failure

**Effort:** 1-2 days across all projects | **Risk:** Low | **Maintenance:** Medium

**Workaround in place:** Lightweight `node assert` test scripts per new game as stopgaps.

---
