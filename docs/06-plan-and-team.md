# 06 — Build Plan (phases) & Team Split

Timeline assumes start **Mon 16 Nov 2026** and presentation **≈ mid-December**. Adjust dates to the real presentation day; keep the **feature freeze 3 days before**.

## Phases (Claude Code: stop and report after each)

### Phase 0 — Plan check (½ day)
Read CLAUDE.md + all docs + look at screenshots. Reply with: questions/conflicts you found, the final folder tree, and the package list with versions. **No code yet.**

### Phase 1 — Skeleton end-to-end (1 day) — *one person, before anyone else starts*
npm workspaces (`client`, `server`, `shared`), TS strict, ESLint + Prettier, `docker-compose.yml` (Postgres 16), `.env.example`, Prisma schema from `docs/schema.prisma` + raw-SQL partial indexes, `/api/health`, Socket.io ping round-trip shown on a test page, Tailwind + shadcn + `brand/theme.css` + Readex Pro + brand components + favicons/manifest, `npm run dev` runs both, Vitest set up, GitHub Actions CI (typecheck + test). README setup steps.
✅ Done when: fresh clone → 5 commands → home page with the real logo + "socket connected".

### Phase 2 — Auth, courses, sessions, join (2 days)
Register/login/logout/me, JWT cookie, dashboard (courses + sessions list), start session (code + QR), host page shell, student join by code and `/join/:code`, device id + hash, Participant + live joined count, auto-expiry, seed script.
✅ Done when: instructor starts a session on laptop, 2 phones join, joined count updates live on host.

### Phase 3 — Ask / Q&A + Topics + Me too (2–3 days)
Port `moderation.ts` (+ its tests), stealth moderation, rate limits, question list, addressed/remove, parts, topics (create, move, rename, delete), Me too, reply / answered-in-class, student topics list with replies, "My questions", draft kept in sessionStorage, copy TSV.

### Phase 4 — Quick Check (3 days)
Draft editor (MCQ / TF / Numeric + tolerance + explanation), activity list + reorder, launch/close/reveal/new round with the one-live rule, student answer screens + confidence + reveal screens, stats (% correct, sure-wrong, distribution, suggestion), round comparison, local saving of revealed results, reconnect restores "Answer sent".

### Phase 5 — Present mode (2 days)
Welcome screen (QR + code + joined), run-in-order with keyboard controls, timer, auto-reveal option, blank screen, undo, projector results, project a topic.

### Phase 6 — Explain + End + Take-away + Export (3 days)
Explain create/submit/tag/project misconception, End session, Take-away editor + publish, student Take-away page + local review + Save as image, ended-session summary in dashboard, Excel export.

### Phase 7 — Hardening for the demo (rest of time)
Playwright e2e of the full demo script (1 instructor + 3 student contexts), load test (simulate 60 students answering with a small Socket.io script), deploy (see `08-deployment.md`), fix every bug from rehearsals, polish empty/error states.

### Stretch (ONLY if Phases 1–7 are done and frozen) — AI
Gemini (server-side only, key in env): "Group questions into topics" draft that the instructor must approve; "Generate Quick Checks from slide text" drafts that the instructor must review. Must fail gracefully (timeouts → manual flow still works).

## Calendar
| Week | Dates | Goal |
|---|---|---|
| 1 | 16–22 Nov | Phase 0–2 done. Everyone can run the project locally. |
| 2 | 23–29 Nov | Phase 3 + 4 (parallel). |
| 3 | 30 Nov–6 Dec | Phase 5 + 6 (parallel). **First deploy by 4 Dec.** First full rehearsal. |
| 4 | 7–13 Dec | Phase 7. **Feature freeze 3 days before the presentation.** Only bug fixes after. Rehearse 3+ times with real phones on mobile data. |

## Team split (4 people) — after Phase 1 is merged
Each person runs Claude Code on their own branch `feat/<track>` with this same CLAUDE.md. Merge to `main` daily via PR; one other teammate reviews.

| Track | Owns | Phases |
|---|---|---|
| A — Platform & live engine | Phase 1 skeleton, socket auth/rooms/snapshots, reconnect, deploy, load test | 1, 2 (socket part), 7 |
| B — Instructor experience | auth UI, dashboard, host page, activities editor, Explain tagging, export | 2, 4 (host side), 6 |
| C — Student experience | join, ask, topics/me-too, answer screens, take-away page | 3 (student side), 4 (student side), 6 (student page) |
| D — Projector, Q&A host side, docs & presentation | present mode, topics management, seed data, report/slides, demo script | 3 (host side), 5, demo |

Assign names to tracks in the first team meeting. Shared contracts (`shared/src/*`) change only via PR that all tracks see.

## Daily rhythm
- 10-minute check-in: yesterday / today / blocked.
- `main` must always run. Broken `main` = top priority for everyone.
