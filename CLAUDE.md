# Getit — Project Context for Claude Code

Read this file fully before doing anything. Then read every file in `docs/`. They are the source of truth.
If something here conflicts with your own idea, follow this file and ask the team before changing it.

## 1. What we are building
**Getit** — "Make sure your students get it." A classroom interaction **website** for university lectures.
- The instructor (logged in) starts a live session and shows a **5-letter join code + QR** on the projector.
- Students open the site on their **phones**, enter the code, and take part **anonymously** (no student accounts, no names).
- Tools: **Ask** (anonymous Q&A + Topics + Me too), **Quick Check** (MCQ / True-False / Numeric), **Explain** (short written answers), **Present mode** (projector), **Take-away** (end-of-lecture summary).
- Vision: no lecture time wasted · every feature has a clear purpose (no filler) · every student leaves with their question answered · the instructor stays human — tools support talking, they never replace it.

This is our **university senior project**. It will be presented live to **3–5 professors** in **under 4 weeks**. The demo must never break. Fewer features that work 100% beat many features that half-work.

There is an earlier MVP (built with Lovable + Supabase). We are **rebuilding from scratch** with our own stack. The MVP is used only as a **reference** for product behaviour and look (`reference/`). Never copy its Supabase/Lovable/TanStack code. Pure logic files listed in `reference/README.md` may be ported.

## 2. Tech stack (fixed — do not change without asking)
| Layer | Choice |
|---|---|
| Repo | npm workspaces monorepo: `client/`, `server/`, `shared/` |
| Language | TypeScript everywhere, `strict: true` |
| Frontend | React 19 + Vite + React Router + Tailwind CSS v4 + shadcn/ui (new-york, slate) + lucide-react |
| Data fetching | TanStack Query (REST) + socket.io-client (live) |
| Backend | Node.js 22 + Express + TypeScript (run with `tsx` in dev) |
| Real-time | Socket.io (server + client) |
| Database | PostgreSQL 16 + **Prisma 6** (pin `prisma@^6` and `@prisma/client@^6` — NOT Prisma 7, whose config format differs; `docs/schema.prisma` is validated against 6.19) |
| Validation | Zod — schemas live in `shared/` and are used by both client and server |
| Auth | Instructors only: email + password (bcrypt) → JWT (httpOnly cookie for REST, token in Socket.io handshake `auth`) |
| Tests | Vitest (unit, shared + server), Playwright (one end-to-end demo flow) |
| Other libs | `qrcode` (QR), `recharts` (charts), `sonner` (toasts), `@fontsource-variable/readex-pro` (font), `html-to-image` (Take-away PNG) |
| Local DB | `docker-compose.yml` with Postgres 16 |

## 3. Folder structure
```
getit/
├─ CLAUDE.md  docs/  brand/  reference/        ← this starter kit (keep)
├─ docker-compose.yml  .env.example  package.json (workspaces)
├─ shared/src/        types.ts, schemas.ts (zod), events.ts (socket event names + payload types), rules.ts (pure logic), codes.ts, moderation.ts (ported, used by server + client)
├─ server/src/
│   ├─ index.ts           app + http server + socket.io
│   ├─ env.ts             zod-validated env
│   ├─ db.ts              prisma client
│   ├─ auth/              register, login, me, jwt middleware
│   ├─ routes/            courses.ts, sessions.ts, activities.ts, questions.ts, takeaway.ts, export.ts
│   ├─ realtime/          socket.ts (auth + rooms), broadcast.ts (DTO builders + emit helpers)
│   ├─ services/          business logic per feature (no Express/Socket types inside)
│   ├─ lib/               deviceHash.ts, rateLimit.ts, errors.ts
│   └─ (server/prisma/: schema.prisma, migrations/, seed.ts — next to src/, Prisma's default)
└─ client/src/
    ├─ main.tsx, router.tsx, styles.css (= brand/theme.css)
    ├─ components/ui/     shadcn components
    ├─ components/brand/  brand.tsx, brand-paths.ts (from brand/)
    ├─ features/          auth/, dashboard/, session-instructor/, present/, student/, takeaway/
    ├─ lib/               api.ts, socket.ts, device.ts, local-history.ts
    └─ hooks/
```

## 4. Non-negotiable rules
1. **Server is authoritative.** Validate every input with the shared zod schemas on the server. Never trust the client.
2. **Anonymity is real.** Students are identified only by a random `deviceId` (UUID in localStorage). The server stores only `deviceHash = sha256(deviceId + DEVICE_SALT)`. No device hash, IP, or per-student identity ever reaches the instructor, the projector, or other students.
3. **No answer leaks.** A Quick Check's correct answer and explanation are sent to students **only after REVEALED**. Build student payloads with explicit allow-list DTO functions (`toStudentActivity()` etc.), never by spreading DB rows.
4. **One live activity per session at a time. One answer per device per round.** Enforce with DB unique constraints + transactions, not only UI.
5. **Stealth moderation.** Blocked questions get the *same* success response as normal ones. Blocked text is never stored; only a `flaggedCount` goes up. Use the ported `shared/src/moderation.ts`.
6. **Rate limits on questions:** min 5 s between questions per device, max 40 questions per device per session. Rejections also look like success.
7. **Reconnect-safe.** Every client, on (re)connect or tab focus, asks for a full **state snapshot**; events after that are applied on top. A refreshed phone returns to exactly where it was (same answers, same confirmation screens).
8. **Every server write that changes what someone sees must emit an event** (see `docs/04-realtime-events.md`).
9. Sessions auto-end after **6 hours LIVE**. A published Take-away is visible to students for **24 hours** after end.
10. UI language is **English**. Student question text may be Arabic or English — support RTL text inside question bubbles (`dir="auto"`).
11. Use the **brand** exactly: `brand/` folder, logo paths in `brand-paths.ts` (never redraw), colours/tokens from `brand/theme.css`, font Readex Pro. The loading indicator is the brand sparkle `Spinner`, not a generic spinner.
12. No AI features in the core. AI is an optional stretch phase only (see `docs/06-plan-and-team.md`).
13. Accessibility basics: keyboard reachable, visible focus ring, `prefers-reduced-motion` respected, contrast from the theme tokens, buttons ≥ 44 px on phones.
14. Never commit `.env`. Keep `.env.example` updated.

## 5. Code conventions
- Small files, one responsibility. Services hold logic; routes/socket handlers only parse → call service → respond/emit.
- Shared names: `QUICK_CHECK | EXPLAIN`, `MCQ | TRUE_FALSE | NUMERIC`, `DRAFT | LIVE | CLOSED | REVEALED`, `LIVE | ENDED`.
- Errors: REST returns `{ error: { code, message } }` with proper status; socket acks return `{ ok: true, data } | { ok: false, error }`.
- Pure logic (scoring, suggestions, code generation, moderation) goes in `shared/` or `server/src/lib` with Vitest tests.
- Commit per feature with clear messages. Each teammate works on a branch `feat/<slice>` and opens a PR into `main`. Keep `main` always runnable.

## 6. How to work with me (Claude Code)
- Work **phase by phase** (see `docs/06-plan-and-team.md`). **Stop after each phase**, report: what was built, how to run/test it, what is next.
- Before a big decision not covered by these docs, **ask**.
- After any change: run `npm run typecheck`, `npm test`, and start the app to verify. Do not say "done" without verifying.
- Look at `reference/screenshots/` before building any screen. Match the layout and feel; it does not need to be pixel-perfect.

## 7. Commands
```
cp .env.example .env          # once
docker compose up -d          # Postgres (creates getit + getit_test)
npm install
npm run db:migrate            # prisma migrate dev
npm run db:seed               # demo instructor + course + sample activities
npm run dev                   # client :5173 + server :4000 together
npm run typecheck && npm run lint && npm test   # tests use TEST_DATABASE_URL
npm run e2e                   # Playwright demo flow
```
Demo login after seed: `demo@getit.app` / `getit-demo-2026`.
