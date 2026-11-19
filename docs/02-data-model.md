# 02 — Data Model

The full Prisma schema is in `docs/schema.prisma` (validated with Prisma 6.19). The live copy is `server/prisma/schema.prisma` — keep both identical.

**Phase 0 refinements (approved):**
- `Session.presentActivityId` + `Session.projected` — the projector returns to the same screen after a refresh.
- `Activity.closesAt` — the question timer is server-side and auto-closes the activity; survives a projector refresh.
- `Session.presentSettings` (Phase 5) — projector timer + auto-reveal; the server needs them for the auto-close, and a refreshed projector keeps them.
- A stealth-blocked Explain answer is stored as a `Response` with `text = null` (one per device still holds; hidden from host, counted as flagged).
- Join codes are reused after a session ends → students' local history is keyed by **session id** (sent in `StudentState`); `/public/sessions/:code` resolves the LIVE session, else the newest ENDED one within 24 h.
- Topics belong to one Part: a topic only groups questions from its own part; new topics go into the current part.

## Entities
```
Instructor 1─* Course 1─* Session
Session 1─* Participant      (one row per joined device, no identity)
Session 1─* Part 1─* Question *─1 Topic 1─* MeToo
Session 1─* Activity 1─* Response
Session 1─1 Takeaway
Session.liveActivityId → the one LIVE activity (or null)
```

## Extra rules that Prisma can't express — add as raw SQL in the first migration
```sql
-- Join code must be unique among open (LIVE or SCHEDULED) sessions; ENDED codes can be reused later.
-- (Originally `session_live_code_unique … WHERE status = 'LIVE'`; widened by the scheduled_sessions migration
-- so a planned lecture's code stays reserved until it ends.)
CREATE UNIQUE INDEX session_open_code_unique ON "Session"(code) WHERE status <> 'ENDED';
-- Only one LIVE activity per session (backup for Session.liveActivityId)
CREATE UNIQUE INDEX activity_one_live_per_session ON "Activity"("sessionId") WHERE status = 'LIVE';
```
(Create with `prisma migrate dev --create-only`, append the SQL, then `prisma migrate dev`.)

## Transactions (must be atomic)
| Operation | Inside one transaction |
|---|---|
| Submit question | lock participant row → check 5 s gap and 40 limit → moderate → insert question (or bump flaggedCount) → bump session.version |
| Launch activity | check no other LIVE → set activity LIVE → set session.liveActivityId → bump version |
| Answer Quick Check | check activity LIVE and round → insert Response (unique constraint catches doubles → return the existing answer, not an error) |
| Close / Reveal / New round | update status/round → clear liveActivityId on close → bump version |
| Me too | insert/delete MeToo row → recompute topic.meTooCount |
| Start a planned lecture | `updateMany where status = SCHEDULED` → LIVE, `startedAt = now`, bump version (Start now and the auto-start sweep can't both win) |
| End session | status ENDED, endedAt, close any LIVE activity, create Takeaway draft with top topics |

## Device hash
- Client: `deviceId = crypto.randomUUID()` stored in localStorage key `getit.device`.
- Server: `deviceHash = sha256(deviceId + DEVICE_SALT)` (hex). Store only the hash.
- The hash is used to: count joined devices, enforce limits/one-answer, return "my questions" and "my answer" to the same device. It is **never** included in any payload.

## Expiry
- On every access to a session (REST or socket) call `ensureNotExpired(session)`: if LIVE and `startedAt + 6h < now` → end it (same as End session).
- **Planned lectures:** a SCHEDULED session keeps `scheduledFor`, `durationMin`, `autoStart`. The server sweep (every 30 s) starts due lectures with `autoStart` (SCHEDULED → LIVE, `startedAt = now`); with `autoStart = false` it waits for Start now. The 6 h limit counts from the real start.
- Take-away readable by students until `endedAt + 24h`. Instructor keeps full history in the dashboard (they have an account).

## Seed (`npm run db:seed`)
- Instructor `demo@getit.app` / `getit-demo-2026` (name "Dr. Demo").
- Course "ITCS 444 — Mobile Development".
- One ENDED session with realistic questions, topics, Quick Check results and a published Take-away (so the dashboard summary looks real in the demo).
- Activity templates ready to copy into a new live session: 3 Quick Checks (one MCQ, one True/False, one Numeric) + 1 Explain about the demo lecture topic. *(Implemented as the 4 activities of the seeded ended session — no extra table; Phase 4 adds "copy activities from an earlier session".)*
- The seed is idempotent: it upserts the demo instructor and recreates only its own records (fixed ids, code `DEMO2`), never sessions created during rehearsals.
