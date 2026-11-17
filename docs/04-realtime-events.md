# 04 — Real-time (Socket.io) contract

Put all event names and payload types in `shared/src/events.ts` and use typed Socket.io (`Server<ClientToServer, ServerToClient>`).

## Connection & rooms
| Who | Handshake `auth` | Joins rooms |
|---|---|---|
| Student | `{ role: "student", code, deviceId }` | `s:{sessionId}:students` |
| Instructor host view | `{ role: "host", code, token }` (token from `/auth/socket-token`, must own the session) | `s:{sessionId}:host` |
| Projector | `{ role: "present", code, token }` | `s:{sessionId}:present` |

- Reject the connection if the session doesn't exist, has expired, or the token doesn't own it. The refusal reason is `connect_error.message`: `INVALID_AUTH` (malformed handshake), `SESSION_NOT_FOUND` (student: no such code / past the 24 h window), `FORBIDDEN` (host/projector: bad or expired token, or not the owner). Clients show an error screen for these and do not retry; any other error retries.
- A student socket on a LIVE session also registers the device as a Participant (idempotent), so a phone that opens `/s/:code` directly is counted once.
- On **every connect / reconnect**, the server immediately emits a full snapshot (`state:student` / `state:host` / `state:present`). Clients **replace** their state with it.
- Also: client re-requests the snapshot (`state:request`) when the tab becomes visible again or the browser goes back online.
- Every snapshot and every **host** event includes `version` (session.version, bumped by every write). If the host receives an event with `version > local + 1`, it requests a fresh snapshot; `version <= local` is ignored. Students don't see every write, so they rely on snapshots (connect / focus / online) instead of gap detection.
- Use Socket.io's default reconnection; show a small "Reconnecting…" banner while disconnected. The client also reacts to the browser's `offline`/`online` events immediately, and the server heartbeat is 15 s + 10 s, so a dropped phone is noticed in seconds, not ~45 s.
- **Stage activity** (`Session.presentActivityId`, exposed as `stageActivityId`): the activity phones and the projector show — set on launch, kept after close/reveal (so phones can show "Answer sent" → result), replaced by the next launch. `StudentState.liveActivity` is the stage activity (not DRAFT, session LIVE).
- Lifecycle rules: launch only DRAFT; close only LIVE (`reveal: true` → straight to REVEALED); reveal from LIVE or CLOSED; new round only from CLOSED (before the answer is shown); undo REVEALED→CLOSED→LIVE. Launch / new round / undo-to-LIVE claim the single live slot atomically (`UPDATE Session SET liveActivityId … WHERE liveActivityId IS NULL`) + the partial unique index.

## Three different views of the same data (DTO builders in `server/src/realtime/broadcast.ts`)
- `toStudentActivity(a)` — `{ id, type, kind, prompt, options, status, round }` + `{ correct, explanation, tolerance }` **only if REVEALED**. Never `modelAnswer`. Never others' answers or counts.
- `toHostActivity(a)` — everything + per-round stats + responses count (Explain: answer texts + tags **only after closing**, no device hashes).
- `toPresentActivity(a)` — like host but **no modelAnswer, no Explain texts** except a misconception explicitly chosen for the projector.

## Snapshots
```ts
StudentState = { version, session: { id, topic, status },   // id = session uuid, used to key local history
  liveActivity: StudentActivity | null,
  myResponse: { round, answer, confident } | null,     // so a refreshed phone shows "Answer sent"
  // no myQuestions: a stealth-blocked question is never stored, so a server list would reveal the block.
  // "My questions" lives in the phone's localStorage (spec E).
  topics: { id, title, status, reply, meTooCount, iMeToo }[],
  takeawayPublished: boolean }
HostState = { version, session: { id, code, topic, status, academicMode, joinedCount, flaggedCount },
  parts: Part[], questions: HostQuestion[], topics: HostTopic[], activities: HostActivity[], liveActivityId }
PresentState = { version, session: { code, topic, joinedCount }, activities: PresentActivity[], liveActivityId, projected: ProjectedItem | null }
```

## Client → Server (all with ack `{ ok: true, data } | { ok: false, error }`)
| Event | From | Payload | Server does |
|---|---|---|---|
| `state:request` | any | – | emit snapshot to this socket |
| `question:ask` | student | `{ text }` | rate-limit + moderate + store; ack `{ ok: true }` **always the same** (stealth) |
| `topic:metoo` | student | `{ topicId, on: boolean }` | insert/delete MeToo |
| `activity:answer` | student | `{ activityId, round, answer }` | must be LIVE + current round; duplicate → ack with the existing answer |
| `activity:confidence` | student | `{ activityId, round, confident: boolean \| null }` | update own response |
| `explain:submit` | student | `{ activityId, text }` | ≤ 200, one per device; moderated (stealth): a blocked answer is stored **without text** (so the device can't resend) and counted as flagged; stored / blocked / duplicate get the same ack `MyResponse` |
| `activity:launch` | host/present | `{ activityId, timerSec? }` | one-live rule; `timerSec` sets `closesAt`; clears any projected item |
| `activity:close` | host/present | `{ activityId, reveal?: boolean }` | |
| `activity:reveal` | host/present | `{ activityId }` | |
| `activity:newRound` | host/present | `{ activityId, timerSec? }` | round++ and LIVE again |
| `activity:undo` | present | `{ activityId }` | step back one step: REVEALED→CLOSED→LIVE; a LIVE question **nobody answered yet** → DRAFT (round 1, stage returns to the previous activity) or CLOSED round n−1 (mis-pressed clicker) |
| `activity:addTime` | host/present | `{ activityId }` | +15 s on a running timer |
| `present:settings` | host/present | `{ timerSec: 0\|30\|60\|90, autoReveal }` | stored in `Session.presentSettings` (survives a projector refresh; used by the auto-close) |
| `present:project` | host/present | `{ item: { kind: "welcome" \| "blank" \| "wrap" } \| { kind: "topic", id } \| null }` | stored in `Session.projected`; `null` = back to the activity. `{ kind: "misconception", id }` shows one Explain answer tagged MISCONCEPTION, anonymously (prompt + text only). |

## Server → Client
| Event | To rooms | Payload |
|---|---|---|
| `state:student` / `state:host` / `state:present` | the socket | snapshot |
| `session:joined` | host, present | `{ joinedCount }` |
| `question:new` | host | `HostQuestion` (no hash) |
| `question:updated` / `question:removed` | host | `{ version, question }` / `{ version, questionId, flaggedCount, part }` |
| `state:host` (pushed) | host | after structural Q&A changes (topic create/move/rename/status/delete, new part) |
| `topics:updated` | students | `{ topics: PublicTopic[] }` sorted; no `iMeToo` (each phone keeps its own from the snapshot + its acks) |
| `topics:host` | host | `{ version, topics: HostTopic[] }` (Me too counts changed) |
| `qa:flagged` | host | `{ version, flaggedCount, part: { id, flaggedCount } }` (a question was stealth-blocked) |
| `activity:host` | host | `{ version, activity: HostActivity, liveActivityId, stageActivityId }` (lifecycle change) |
| `activity:present` | present | `{ activity: PresentActivity, liveActivityId, stageActivityId }` |
| `activity:student` | students | `{ activity: StudentActivity \| null }` — only the activity **on stage**; phones reset `myResponse` when the id or round changes |
| `activity:stats` | host, present | `{ activityId, round, responses, joined }` (throttle to max 4/s) |
| `present:projected` | present | `{ projected: ProjectedView \| null }` (a topic comes resolved: title, anonymous questions, counts, reply); the host gets a fresh `state:host` with `projectedTopicId` |
| `session:ended` | all | `{ endedAt }` |
| `takeaway:published` | students | – (client fetches `/public/.../takeaway`) |

## Rules
- Emit **after** the DB transaction commits.
- Never emit to `s:{id}:students` anything built by a host DTO. Write a unit test that asserts the student DTO of a LIVE Quick Check has no `correct` / `explanation`.
- Throttle stats broadcasts; a class of 100 answering at once must not flood the projector.
- Socket handlers validate payloads with zod and wrap everything in try/catch → `ack({ ok:false, error })`.

## Timers (Phase 5)
- `Activity.closesAt` is set on launch / new round when the projector has a timer; `+15 s` moves it.
- The server keeps one in-memory timeout per running question and closes it at `closesAt` (revealing if `presentSettings.autoReveal`). On startup and every minute it re-arms running timers and closes overdue ones, so a server restart or a closed projector tab never leaves a question open.
- Snapshots / `activity:present` carry `serverTime`; the projector computes its clock offset from it, so the countdown is right even if the laptop clock is off.
