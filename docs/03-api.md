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
| GET | `/sessions/:id/summary` | ended session summary for dashboard |
| GET | `/sessions/:id/export.xlsx` | Excel export |

## Activities (instructor)
| POST | `/sessions/:code/activities` | Quick Check or Explain draft (shared zod `activityDraftSchema`) |
| PATCH | `/activities/:id` | edit (only DRAFT, or CLOSED/REVEALED for text fixes) |
| DELETE | `/activities/:id` | not allowed while LIVE |
| POST | `/sessions/:code/activities/reorder` | `{ ids: string[] }` |
| PATCH | `/responses/:id/tag` | Explain tag `{ tag }` |

## Q&A (instructor)
| POST | `/sessions/:code/parts` | New part |
| POST | `/sessions/:code/topics` | `{ title, questionIds[] }` |
| PATCH | `/topics/:id` | `{ title? , status?, reply? }` (REPLIED requires reply) |
| POST | `/topics/:id/questions` | `{ questionIds[] }` move into topic |
| DELETE | `/topics/:id` | questions become ungrouped |
| PATCH | `/questions/:id` | `{ addressed }` |
| DELETE | `/questions/:id` | remove inappropriate → flaggedCount++ |

## Take-away (instructor)
| GET | `/sessions/:code/takeaway/draft` | draft with suggested top topics |
| PUT | `/sessions/:code/takeaway` | `{ keyPoints[], topTopicIds[], replies: {topicId: text} }` save draft |
| POST | `/sessions/:code/takeaway/publish` | publish → emit `takeaway:published` |

## Student (no account, header `x-device-id`)
| GET | `/public/sessions/:code` | `{ topic, status }` or 404 "That session doesn't exist or has expired." |
| POST | `/public/sessions/:code/join` | registers Participant, returns **student snapshot** `StudentState` |
| GET | `/public/sessions/:code/takeaway` | published Take-away (404 until published / after 24 h) |

Student live actions (ask, answer, me-too, confidence, explain) go through Socket.io with acks.

Code lookup (codes are reused after a session ends): students get the LIVE session with that code, else the newest ENDED one that ended < 24 h ago; instructors get their own session with that code, LIVE first, else the most recent.

## Health
| GET | `/health` | `{ ok: true, db: true }` — used by the hosting platform and before the demo |
