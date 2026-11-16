# 09 — Definition of Done & Test Checklist

A feature is **done** only when all are true:
- [ ] Typecheck + lint + unit tests pass; CI green.
- [ ] Works on a 390 px phone and a 1440 px laptop, light and dark.
- [ ] Loading, empty, error and reconnecting states exist.
- [ ] Refreshing any page mid-flow returns to the same state.
- [ ] Merged to `main` and `main` still runs.

## Must-have automated tests
Unit (Vitest):
- [ ] `moderation.test.ts` (ported) passes.
- [ ] Join code: 5 chars, only allowed alphabet.
- [ ] `isCorrect` incl. numeric tolerance edges; `summarizeRound` (% correct, sure-wrong, distribution); `suggestion` thresholds (29 → reExplain, 30 & 70 → discuss, 71 → moveOn).
- [ ] `toStudentActivity` of LIVE/CLOSED Quick Check has **no** `correct`, `explanation`; REVEALED has them; Explain never has `modelAnswer`.

Server integration (Vitest + test DB):
- [ ] Launching a 2nd activity while one is LIVE fails.
- [ ] Same device answering twice in a round → one stored response, ack returns the first answer.
- [ ] Question 4 s after previous → ack ok, not stored. 41st question → ack ok, not stored.
- [ ] Blocked question → ack identical to success, nothing stored, flaggedCount + 1.
- [ ] Student socket with wrong code rejected; host socket with another instructor's token rejected.
- [ ] Session older than 6 h is ended on access.

E2E (Playwright): the whole `07-demo-script.md` flow with 1 host + 1 projector + 3 student contexts, including one student going offline for 30 s during a Quick Check and recovering without duplicate answers.

## Manual rehearsal checklist
- [ ] 10+ real phones in a room, one round of everything.
- [ ] Projector readable from the back row.
- [ ] Airplane-mode test on a phone during a live question.
- [ ] Arabic question displays right-to-left correctly.
