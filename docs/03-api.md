# 03 — REST API

Base: `/api`. JSON. Zod-validate every body/param with schemas from `shared/`.
Instructor routes need the JWT cookie (`getit_token`, httpOnly, sameSite=lax, secure in prod). Student routes need header `x-device-id: <uuid>`.
Errors: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`.

Rule of thumb: **REST for loading and creating; Socket.io for live actions** (see `04-realtime-events.md`). Every REST write that changes live state must also emit the matching socket event.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | password ≥ 8, bcrypt cost 10, sets cookie |
| POST | `/auth/login` | `{ email, password }` | sets cookie; same error for wrong email or password; 429 after 20 tries / 10 min per IP+email |
| POST | `/auth/logout` | – | clears cookie |
| GET | `/auth/me` | – | `{ id, name, email }` |
| GET | `/auth/socket-token` | – | short-lived JWT (15 min) for the Socket.io handshake |

## Courses (instructor)
| GET | `/courses` | list with session counts |
| POST | `/courses` | `{ name }` |
| PATCH | `/courses/:id` | `{ name }` |
| DELETE | `/courses/:id` | sessions keep existing with `courseId = null` |

## Sessions (instructor)
| GET | `/courses/:id/sessions` | list: id, code, topic, status, startedAt, joined, questions |
| GET | `/sessions?courseId=<id\|none>` | same list for all my sessions (dashboard); `none` = sessions whose course was deleted |
| POST | `/sessions` | `{ courseId?, topic, academicMode }` → `{ id, code }` (generate code, retry on collision) |
| GET | `/sessions/:code/host` | full **instructor snapshot** (see events doc `HostState`) |
| POST | `/sessions/:code/end` | ends session, creates Takeaway draft |
| GET | `/sessions/:code/host` (ended) | **is** the ended-session summary: the host page of an ended session shows every question, topic, result and the Take-away editor (no separate summary endpoint) |
| GET | `/sessions/:id/export.xlsx` | Excel export (owner only): sheets Questions, Topics, Quick Checks, Explain. Text is written as text, never formulas; no identities |

## Activities (instructor)
| POST | `/sessions/:code/activities` | Quick Check or Explain draft (shared zod `activityDraftSchema`); Explain = `{ type: 'EXPLAIN', prompt, modelAnswer? }` |
| PATCH | `/activities/:id` | DRAFT: full draft (shared `quickCheckDraftSchema`). CLOSED/REVEALED: wording only `{ prompt, explanation, options? }` (same number of options). LIVE: 409 |
| DELETE | `/activities/:id` | not allowed while LIVE |
| POST | `/sessions/:code/activities/reorder` | `{ ids: string[] }` (exactly this session's activities, new order) |
| POST | `/sessions/:code/activities/copy` | `{ fromSessionId }` → copies that (own) session's activities as DRAFTs at the end (seeded templates) |
| PATCH | `/responses/:id/tag` | Explain tag `{ tag: 'CORRECT' \| 'PARTIAL' \| 'MISCONCEPTION' \| null }` (owner only) |

## Q&A (instructor)
| POST | `/sessions/:code/parts` | New part |
| POST | `/sessions/:code/topics` | `{ title, questionIds[] }` |
| PATCH | `/topics/:id` | `{ title? , status?, reply? }` (REPLIED requires reply) |
| POST | `/topics/:id/questions` | `{ questionIds[] }` move into topic |
| DELETE | `/topics/:id` | questions become ungrouped |
| PATCH | `/questions/:id` | `{ addressed }` |
| DELETE | `/questions/:id` | remove inappropriate → flaggedCount++ |

## Take-away (instructor)
| GET | `/sessions/:code/takeaway/draft` | draft: key points, chosen topic ids, every topic (most Me too first). Session must be ENDED |
| PUT | `/sessions/:code/takeaway` | `{ keyPoints[], topTopicIds[], replies: {topicId: text} }` save draft |
| POST | `/sessions/:code/takeaway/publish` | publish (needs ≥ 1 key point) → emit `takeaway:published`. Saving again after publishing updates phones too |

## Student (no account, header `x-device-id`)
| GET | `/public/sessions/:code` | `{ topic, status }` or 404 "That session doesn't exist or has expired." |
| POST | `/public/sessions/:code/join` | registers Participant, returns **student snapshot** `StudentState` |
| GET | `/public/sessions/:code/takeaway` | published Take-away (404 until published / after 24 h) |

Student live actions (ask, answer, me-too, confidence, explain) go through Socket.io with acks.

Code lookup (codes are reused after a session ends): students get the LIVE session with that code, else the newest ENDED one that ended < 24 h ago; instructors get their own session with that code, LIVE first, else the most recent.

## AI helpers (optional, stretch — docs/06)
Instructor only. They **propose**; nothing is written until the instructor applies the proposal through the normal endpoints above (which validate and emit as usual). Only question / slide text is sent to Gemini — never a device hash or identity. No `GEMINI_API_KEY` → `/ai/status` says `enabled: false`, the buttons are hidden, the rest returns `503 AI_OFF`. 20 requests per instructor per 10 min. AI output is untrusted input: re-validated with the shared schemas, unknown ids / invalid drafts / restricted words dropped. Gemini errors: `504 AI_TIMEOUT` (20 s), `429 AI_BUSY` (free limit), `502 AI_FAILED` — each message says the manual flow still works.
| Method | Path | Purpose |
|---|---|---|
| GET | `/ai/status` | `{ enabled }` |
| POST | `/sessions/:code/ai/group` | `{ suggestions: { title, topicId \| null, questionIds }[] }` for the current part's ungrouped questions (needs ≥ 3). `topicId` = add to that existing topic |
| POST | `/sessions/:code/ai/generate` | body `{ text (200–30 000 chars), count 1–8, kinds }` → `{ drafts }`, each valid for `POST /sessions/:code/activities` |

## Health
| GET | `/health` | `{ ok: true, db: true }` — used by the hosting platform and before the demo |
