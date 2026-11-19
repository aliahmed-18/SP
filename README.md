# Getit — Make sure your students get it.

A classroom interaction website for university lectures: anonymous Q&A with topics and "Me too",
Quick Checks, Explain, a projector mode and an end-of-lecture Take-away.

Stack: React 19 + Vite + Tailwind v4 + shadcn/ui · Express 5 + Socket.io · PostgreSQL 16 + Prisma 6 · TypeScript (strict) everywhere.
Read **`CLAUDE.md`** and **`docs/`** before contributing.

## Setup (fresh clone → running app)

You need **Node.js 22.12+**, **Docker Desktop** and Git.

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:5173 and log in with **`demo@getit.app` / `getit-demo-2026`** (or create an account).
Start a session, then join from a phone or a second browser window with the code.

- `npm run db:migrate` creates the tables in the `getit` database. Docker also creates a `getit_test` database for the tests.
- `npm run db:seed` adds the demo data: instructor, course "ITCS 444 — Mobile Development" and one ended lecture with questions, topics, results and a Take-away. Safe to run again.
- **AI helpers (optional):** put a free Gemini key from [Google AI Studio](https://aistudio.google.com) in `GEMINI_API_KEY` in `.env` and restart. Then these appear: **Group with AI** (Q&A, with Undo), **AI generation** (upload slides — PDF, PowerPoint, Word, HTML, text — or paste notes → Quick Check and Explain drafts), **Sort answers with AI** (Explain) and **AI draft key points** (Take-away). Without a key they stay hidden and everything else works.
- No Docker? Any local PostgreSQL 16 works. Create a `getit` user (password `getit`) that owns the databases `getit` and `getit_test`.
- Already ran Docker before `server/prisma/init-test-db.sql` existed? Run `docker compose exec db createdb -U getit getit_test` once.

## Let phones join a laptop demo (`npm run share`)

**Once, before sharing:** run `npm run secrets`. It replaces the example `JWT_SECRET` / `DEVICE_SALT` in `.env` (public in this repo, so anyone could fake an instructor login) with strong random values; then restart the app. `npm run share` and the production server refuse to start with the example values.

Phones can't open `localhost`. With the app running (`npm run dev`, or `npm run build && npm start`), run in a second terminal:

```bash
npm run share
```

For the lecture, share the production build (`npm run build`, then `npm start`); the dev server works for a quick test. It starts a free Cloudflare quick tunnel (no account, https, works on campus Wi-Fi) and prints a public address like `https://xyz.trycloudflare.com`. The QR code and the projector switch to it by themselves; keep working on `localhost`. `Ctrl + C` stops sharing. Install `cloudflared` once first: `winget install --id Cloudflare.cloudflared` (Windows) or `brew install cloudflared` (macOS). For a hosted deployment, set `PUBLIC_URL` instead (optional).

What it exposes: only this app — no other files or ports on the laptop — and not your IP or home address (the laptop connects out to Cloudflare; phones only see the `trycloudflare.com` name). The link is random and stops working when you press `Ctrl + C`. Anyone with the link can open the login page, so use your own instructor account, not the public demo password.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server on :4000 (tsx watch) + client on :5173 (Vite, proxies `/api` and `/socket.io`) |
| `npm run dev:host -w client` | Same client, reachable from phones on your Wi-Fi at `http://<laptop-ip>:5173` (run the server with `npm run dev -w server`) |
| `npm run typecheck` | `tsc` on shared, server and client |
| `npm run lint` | ESLint (flat config, typescript-eslint) |
| `npm test` | Vitest: shared unit tests + server integration tests against `TEST_DATABASE_URL` |
| `npm run e2e` | Playwright (starts `npm run dev` if it isn't running; needs `db:seed`). Run `npx playwright install chromium` once first. `E2E_BASE_URL=http://localhost:4000 npm run e2e` tests a running production build. The AI flows run against a fake AI (`AI_FAKE=1`, set by `playwright.config.ts`; ignored in production): if `npm run dev` is already running, start it as `AI_FAKE=1 npm run dev` |
| `npm run build` then `npm start` | Production: one Node service on :4000 serves the API, Socket.io and the built client. The login cookie is `Secure` in production, so use `localhost` or HTTPS |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Prisma (loads the root `.env`) |
| `npm run format` | Prettier |
| `npm run smoke -- <url>` | Pre-demo check of a running deployment (HTTPS, health, CSP, deep link, WebSocket) |
| `npm run load-test -- <url> 60` | 60 simulated phones join/answer/ask at once; latencies + exact totals |

Before saying a change is done: run `npm run typecheck && npm run lint && npm test`, then start the app and check it.

## Layout

```
shared/   zod schemas, socket event types, pure rules (+ Vitest)
server/   Express + Socket.io + Prisma  (prisma/ = schema, migrations, seed)
client/   React app (features/, components/ui = shadcn, components/brand = logo)
e2e/      Playwright
docs/     spec, data model, API, realtime contract, UI guide, plan, demo script, deployment, DoD
brand/    logo vectors, icons, theme tokens (source of truth, copied into client/)
reference/ old MVP screenshots + logic to port (read-only)
```

## Deploy

`render.yaml` is a ready Render Blueprint (web service + Postgres 16). Details, alternatives and the pre-demo checklist: `docs/08-deployment.md`.

## Workflow

Branch `feat/<track>` → PR into `main` → one teammate reviews → CI (typecheck, lint, tests, build) must be green. Keep `main` runnable.
