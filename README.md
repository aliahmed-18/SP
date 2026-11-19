# Getit — Make sure your students get it.

**Getit** is a classroom interaction website for university lectures. The instructor starts a live session and shows a **5-letter code + QR** on the projector; students open the site on their **phones**, enter the code and take part **anonymously** — no student accounts, no names.

> Vision: no lecture time wasted · every feature has a clear purpose · every student leaves with their question answered · the instructor stays human — the tools support talking, they never replace it.

Senior project. Stack: React 19 + Vite + Tailwind v4 + shadcn/ui · Express 5 + Socket.io · PostgreSQL 16 + Prisma 6 · TypeScript (strict) everywhere. Contributors: read **`CLAUDE.md`** and **`docs/`** first.

---

## Contents

1. [Features](#features)
2. [Privacy and safety by design](#privacy-and-safety-by-design)
3. [Quick start (first time)](#quick-start-first-time)
4. [Every day: start the app](#every-day-start-the-app)
5. [Running a lecture](#running-a-lecture)
6. [Phones on a laptop demo (`npm run share`)](#phones-on-a-laptop-demo-npm-run-share)
7. [AI helpers (optional)](#ai-helpers-optional)
8. [Configuration (`.env`)](#configuration-env)
9. [Commands](#commands)
10. [Tests](#tests)
11. [Project layout](#project-layout)
12. [Deploy](#deploy)
13. [Troubleshooting](#troubleshooting)
14. [Team workflow and docs](#team-workflow-and-docs)

---

## Features

### For the instructor (laptop)
- **Accounts and courses:** email + password login, courses, a dashboard of every lecture (planned, live and ended).
- **Calendar — plan lectures ahead:** a month calendar on the dashboard shows every lecture. **Plan a lecture** (or pick a day) sets the date, time and length; its join code is reserved at once, so you can print it on slides. Prepare its activities in advance; it **starts by itself** at its time (or waits for **Start now**, your choice), can be edited or cancelled, and **Add to calendar** downloads an `.ics` event (with a 15-minute reminder) for Google / Outlook / Apple Calendar. Students who open the code early see a waiting screen with a countdown and join automatically when it starts.
- **Live session:** 5-letter join code + QR, live "Joined" count, *Start presenting* opens the projector window.
- **Ask (Q&A):** anonymous questions arrive live (Arabic and English, right-to-left text supported). Mark as addressed, group similar questions into **Topics**, students tap **Me too**, reply **in class** or **in writing** (the reply reaches every phone). **New part** starts a fresh list; **Copy questions** pastes into Excel.
- **Quick Check:** Multiple choice, True / False, Write a number (with tolerance). Launch → live answer count → close → results → show the answer. Students say how **sure** they are; results show **% correct** and **Sure and wrong**, with a suggestion (*Re-explain* / *Discuss and vote again* / *Move on*) and **vote again** rounds.
- **Explain:** an open question; students write up to **1000 characters**. Tag answers *Correct / Partial / Misconception* and show one misconception on the projector to discuss.
- **Activities list:** drafts in run order, reorder, edit, copy from an earlier session.
- **End session → Take-away:** key points + the topics the class asked most (with your replies), then **Publish** to every phone.
- **Download results:** **PDF report** (print-ready, Arabic-safe) or a branded **Excel workbook** (Summary sheet with logo + Questions, Topics, Quick Checks, Answers, Explain).
- Works on laptop, tablet and phone (Session / Q&A tabs on small screens), light and dark theme.

### For students (phone)
- Join with the code or the QR — no account, no name.
- Ask anonymously (my questions are kept on the phone only), see topics, tap **Me too**, read written replies.
- Answer Quick Checks (with confidence) and Explain prompts; see the correct answer and explanation when revealed.
- A refreshed or reconnected phone returns to exactly where it was.
- After the lecture: the **Take-away** with the key points, the replies and a personal Quick Check review; **Save as image**. Visible for 24 hours.

### Projector
- Welcome screen (topic, code, QR, joined count), then one activity per screen, big type.
- One key moves forward: **→ / Space / clicker** next · **←** undo · **B** hide the screen · **F** full screen · **R** vote again · **Esc** exit.
- Timer per question (30 / 60 / 90 s, click to add 15 s); option to show the answer as soon as a question closes.

### AI helpers (optional, see [below](#ai-helpers-optional))
AI generation from uploaded slides · Group with AI · Grade with AI (one activity or all written answers) · AI draft key points for the Take-away.

---

## Privacy and safety by design

- **Anonymous for real:** a phone is identified only by a random id stored on the phone; the server keeps only a salted hash of it. No name, device id, IP or per-student identity ever reaches the instructor, the projector or other students. Exports contain no identities.
- **No answer leaks:** a Quick Check's correct answer and explanation reach phones only after the instructor reveals them.
- **Server is authoritative:** every input is validated on the server; one live activity at a time and one answer per device are enforced by the database.
- **Stealth moderation:** inappropriate questions/answers (Arabic, English, Arabizi) are silently dropped — the student sees the same "sent" message; only a *Flagged* count goes up.
- **Limits:** questions up to 300 characters, at least 5 s apart, at most 40 per phone per session.
- Sessions end automatically after **6 hours**; a published Take-away is visible for **24 hours** after the lecture.
- **AI:** only question / slide / answer **text** is sent to Google Gemini — never an identity. AI output is re-checked by the server and is never shown to students before the instructor confirms it.

---

## Quick start (first time)

You need **Node.js 22.12+**, **Docker Desktop** (for the database) and **Git**.

### Windows (PowerShell)

> Tip: keep the project **outside OneDrive** (e.g. `C:\dev\SP`) — OneDrive syncing `node_modules` makes installs slow and can lock files.
> If PowerShell says *"running scripts is disabled"*, run once: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (or use Command Prompt, or type `npm.cmd` instead of `npm`).

```powershell
git clone https://github.com/aliahmed-18/SP.git
```

```powershell
cd SP
```

```powershell
copy .env.example .env
```

Open **Docker Desktop** and wait for *Engine running*, then:

```powershell
docker compose up -d
```

```powershell
npm install
```

```powershell
npm run db:migrate
```

```powershell
npm run db:seed
```

```powershell
npm run dev
```

### macOS / Linux

```bash
git clone https://github.com/aliahmed-18/SP.git && cd SP
```

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

Open **http://localhost:5173** and log in with **`demo@getit.app` / `getit-demo-2026`** (or create an account).

- `npm run db:migrate` creates the tables in the `getit` database (Docker also creates `getit_test` for the tests).
- `npm run db:seed` adds demo data: the demo instructor, the course *ITCS 444 — Mobile Development* and one ended lecture with questions, topics, results and a Take-away. Safe to run again.
- No Docker? Any local PostgreSQL 16 works: create a `getit` user (password `getit`) that owns the databases `getit` and `getit_test`.
- Already ran Docker before `server/prisma/init-test-db.sql` existed? Run `docker compose exec db createdb -U getit getit_test` once.

---

## Every day: start the app

1. Open **Docker Desktop** (the database runs in it).
2. In the project folder:

```bash
docker compose up -d
```

```bash
npm run dev
```

Keep that terminal open; `Ctrl + C` stops the app.

**After `git pull`:** if `package.json` changed run `npm install`; if there are new migrations run `npm run db:migrate`. Restart `npm run dev` after editing `.env` (it is read only at start).

---

## Running a lecture

1. **Dashboard → Start session**, type the lecture topic (optionally pick a course). Or **Plan a lecture** for later: choose the date, time and length — the lecture starts by itself at that time (or when you press **Start now**), and you prepare it in the meantime.
2. Prepare activities (Multiple choice, True / False, Write a number, Explain), copy them from an earlier lecture, or use **AI generation**.
3. **Start presenting** opens the projector window (drag it to the projector, press **F** for full screen). Students scan the QR or type the code.
4. During the lecture: questions arrive in **Q&A**; group them into topics (or **Group with AI**); press **→** to run each activity; discuss, vote again, reveal.
5. **Menu → End session.** Write the Take-away (or **AI draft key points**) and **Publish** — phones show it at once.
6. **Download results → PDF report / Excel workbook.**

The full live demo script for the presentation is in `docs/07-demo-script.md`.

---

## Phones on a laptop demo (`npm run share`)

Phones can't open `localhost`. `npm run share` gives the app a temporary public **https** address through a free **Cloudflare quick tunnel** (no account, works on campus Wi-Fi). The QR code and the projector switch to it automatically — you keep working on `localhost`.

**Once, before sharing:**

1. Install `cloudflared`: `winget install --id Cloudflare.cloudflared` (Windows, then open a new terminal) or `brew install cloudflared` (macOS).
2. Replace the example secrets (they are public in this repo — anyone could fake an instructor login with them):

```bash
npm run secrets
```

Then restart the app and log in again. Do this **before** a lecture, not during one (phones that already joined would count as new devices). `npm run share` and the production server refuse to start with the example secrets.

**For the lecture** (production build — faster, and it doesn't expose development tools):

```bash
npm run build
```

```bash
npm start
```

and in a second terminal:

```bash
npm run share
```

It prints an address like `https://xyz.trycloudflare.com`. Keep the window open; `Ctrl + C` stops sharing. (`npm run share` also works with `npm run dev` for a quick test.)

**What is exposed:** only this app — no other files or ports on the laptop — and **not** your IP or home address (the laptop connects out to Cloudflare; phones only see the `trycloudflare.com` name). The link is random and stops working when you stop sharing. Anyone with the link can open the login page, so use your **own instructor account**, not the public demo password.

Alternatives: same Wi-Fi only — `npm run dev:host -w client` and open `http://<laptop-ip>:5173` (campus networks often block this); or deploy online (see [Deploy](#deploy)) and set `PUBLIC_URL`.

---

## AI helpers (optional)

Without a key, the AI buttons are hidden and everything else works.

### Set up
1. Get a free key at **[Google AI Studio](https://aistudio.google.com)** → *Get API key* → *Create API key*.
2. Put it in `.env`: `GEMINI_API_KEY=your-key` (never commit `.env`, never paste the key in chats).
3. Leave `GEMINI_MODEL=` empty (default `gemini-flash-latest`, Google's alias for its newest Flash model — pinned versions get retired; `gemini-2.5-flash` shuts down on 2026-12-01).
4. Restart `npm run dev`.

> **Free tier limits:** the free key allows only a few requests a minute and a daily quota. Getit waits and retries, then falls back to `gemini-flash-lite-latest` (its own allowance). For the real presentation, consider enabling billing on the key in Google AI Studio to lift the limits (check current prices there first).

### What it does
| Where | Button | What happens |
|---|---|---|
| Set up activities | **AI generation** | Upload slides or notes (**PDF, PowerPoint incl. speaker notes, Word, HTML, text**; up to 8 files × 60 MB — read **in the browser**, only their text is sent) or paste text; choose types (incl. Explain), count and an optional note. The dialog closes at once; drafts are written **in the background** and appear in the list as **AI drafts**. |
| Activities list | **Review / Confirm draft / Confirm all** | AI drafts can't be launched (and the projector skips them) until confirmed or edited. *Confirm all* warns first. |
| Q&A | **Group with AI** | Runs in the background; when ready, the suggested topics **pop up** to rename, untick and apply (with **Undo**). |
| Explain answers | **Grade with AI** | Tags the untagged answers *Correct / Partial / Misconception* in one click, shows *What the AI found*, **Undo**. Your own tags are never changed. |
| Activities list | **Grade all with AI** | Grades every closed Explain's untagged answers in the background, with **Undo**. |
| Take-away editor | **AI draft key points** | 3–5 key points from what happened in class, to edit before publishing. |

How it stays fast and reliable: generation runs on the server (close the dialog, present, even reload the page — nothing is lost), up to 2 requests run in parallel, each draft is saved the moment it arrives, a 150-second timeout with readable errors ("…carry on by hand"), and every AI answer is re-validated by the server. The server log prints one line per call, e.g. `[getit] AI gemini-flash-latest answered in 9.4 s`.

---

## Configuration (`.env`)

Copy `.env.example` to `.env`. Never commit `.env`.

| Variable | Required | Meaning |
|---|---|---|
| `NODE_ENV` | — | `development` locally, `production` when deployed |
| `PORT` | — | Server port (default 4000) |
| `DATABASE_URL` | ✅ | PostgreSQL for the app |
| `TEST_DATABASE_URL` | for tests | A separate, throw-away database for `npm test` |
| `JWT_SECRET` | ✅ | Signs instructor logins — **replace the example** (`npm run secrets`) before going online |
| `DEVICE_SALT` | ✅ | Salt for anonymous device hashes — **replace the example** before going online |
| `CLIENT_ORIGIN` | — | Dev client address (default `http://localhost:5173`) |
| `GEMINI_API_KEY` | optional | Enables the AI helpers |
| `GEMINI_MODEL` | optional | Empty = `gemini-flash-latest` |
| `PUBLIC_URL` | optional | Public https address for the QR (hosting). `npm run share` sets one automatically |
| `AI_FAKE` | tests only | `1` = a fake AI for the end-to-end tests (ignored in production) |

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server on :4000 (tsx watch) + client on :5173 (Vite, proxies `/api` and `/socket.io`) |
| `npm run build` then `npm start` | Production: one Node service on :4000 serves the API, Socket.io and the built client (login cookie is `Secure`: use `localhost` or HTTPS) |
| `npm run share` | Public https link for phones through a Cloudflare tunnel (see above) |
| `npm run secrets` | Replace the example `JWT_SECRET` / `DEVICE_SALT` in `.env` with strong random values |
| `npm run dev:host -w client` | Client reachable on your Wi-Fi at `http://<laptop-ip>:5173` (run the server with `npm run dev -w server`) |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Prisma: create/update tables, deploy migrations, demo data, reset (loads the root `.env`) |
| `npm run typecheck` | TypeScript on shared, server and client |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Vitest: shared unit tests + server integration tests (uses `TEST_DATABASE_URL`) |
| `npm run e2e` | Playwright end-to-end tests (see below) |
| `npm run smoke -- <url>` | Pre-demo check of a running deployment (HTTPS, health, CSP, deep link, WebSocket) |
| `npm run load-test -- <url> 60` | 60 simulated phones join, answer and ask at once; latencies + exact totals |

Before saying a change is done: `npm run typecheck && npm run lint && npm test`, then start the app and check it.

---

## Tests

- **Unit + server integration:** `npm test` (Postgres must be running; uses the `getit_test` database).
- **End-to-end (Playwright):** run `npx playwright install chromium` once, then `npm run e2e`. It starts `npm run dev` itself if nothing is running, with the **fake AI** (`AI_FAKE=1`) so the AI flows are tested without a key. If `npm run dev` is already running, start it as `AI_FAKE=1 npm run dev` for the AI tests. `E2E_BASE_URL=http://localhost:4000 npm run e2e` tests a running production build (the fake-AI tests are skipped there).
- The full presentation flow (1 instructor + projector + 3 phones, one phone offline for 30 s) is `e2e/demo.spec.ts`.
- **Load test:** `npm run load-test -- http://localhost:4000 150`.
- CI (GitHub Actions) runs typecheck, lint, tests, build and the end-to-end tests on every push.

---

## Project layout

```
shared/    zod schemas, socket event types, pure rules (moderation, scoring, runner) + Vitest
server/    Express + Socket.io + Prisma
  src/routes/     REST endpoints (parse → service → respond/emit)
  src/services/   business logic (sessions, questions, activities, take-away, export, AI)
  src/realtime/   socket auth, rooms, snapshots, broadcasts, background AI jobs
  src/lib/        errors, rate limits, Gemini client, AI output checks
  prisma/         schema, migrations, seed
  test/           integration tests
client/    React app
  src/features/   auth, dashboard, session-instructor (+ ai/), present, student, takeaway, report
  src/components/ ui (shadcn), brand (logo), layout
e2e/       Playwright tests (+ fixtures: sample PDF / PowerPoint / Word / HTML)
scripts/   share (tunnel), secrets, smoke check
docs/      spec, data model, API, realtime contract, UI guide, plan, demo script, deployment, definition of done
brand/     logo vectors, icons, theme tokens (source of truth)
reference/ the old MVP: screenshots + logic that was ported (read-only)
```

---

## Deploy

`render.yaml` is a ready **Render** Blueprint (web service + PostgreSQL 16; secrets are generated for you). Add `GEMINI_API_KEY` in the dashboard if you want the AI helpers. Details, alternatives and the pre-demo checklist: `docs/08-deployment.md`. After deploying: `npm run smoke -- https://your-app.onrender.com`.

---

## Troubleshooting

| You see | Do this |
|---|---|
| `npm.ps1 cannot be loaded because running scripts is disabled` | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use Command Prompt / `npm.cmd` |
| `open //./pipe/dockerDesktopLinuxEngine … cannot find the file` | Docker Desktop isn't running: open it, wait for *Engine running*, `docker compose up -d` |
| "Can't reach the database. Start Docker Desktop…" | Same: start Docker Desktop, then `docker compose up -d` |
| "The database tables are missing or out of date" | `npm run db:migrate` |
| Login says the account doesn't exist | `npm run db:seed` (demo account) or create an account |
| Port 5173 / 4000 already in use | Another `npm run dev` is running — close that terminal |
| AI buttons don't appear | `GEMINI_API_KEY` is empty or the server wasn't restarted after editing `.env` |
| "The AI is busy right now (free limit reached)" / "Today's free AI limit is used up" | Free-tier Gemini quota: wait a minute / until tomorrow, or enable billing on the key |
| "The AI key isn't valid" | Check `GEMINI_API_KEY` in `.env`, restart |
| Phones can't open the QR link | You're on `localhost`: run `npm run share` (see above) |
| `npm run share`: "Not sharing yet: your .env still uses the example secrets" | `npm run secrets`, restart the app, run `npm run share` again |
| `npm run share`: "cloudflared is not installed" | `winget install --id Cloudflare.cloudflared`, open a new terminal |

---

## Team workflow and docs

Branch `feat/<track>` → PR into `main` → one teammate reviews → CI must be green. Keep `main` runnable.

| Doc | About |
|---|---|
| `CLAUDE.md` | Project rules (read first) |
| `docs/01-product-spec.md` | What every feature does |
| `docs/02-data-model.md`, `docs/schema.prisma` | Database |
| `docs/03-api.md` | REST API (incl. AI and laptop-demo endpoints) |
| `docs/04-realtime-events.md` | Socket.io events |
| `docs/05-ui-guide.md` | UI rules |
| `docs/06-plan-and-team.md` | Phases and team split |
| `docs/07-demo-script.md` | The live presentation script |
| `docs/08-deployment.md` | Hosting and pre-demo checklist |
| `docs/09-definition-of-done.md` | When a feature counts as done |
