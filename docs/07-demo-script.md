# 07 — Demo Script (what the professors will see) — target 10–12 minutes

The Playwright e2e test (`npm run e2e`) must automate this same flow.

## Setup (before the room fills)
- Laptop on HDMI, browser zoom 100 %, two windows: **Host** (laptop screen) and **Present** (projector, full screen).
- Logged in as `demo@getit.app`. Session pre-created? **No** — create it live (it takes 10 seconds and shows the flow).
- Activities ready as templates (from seed) to copy in with one click.
- Check `/api/health` and join from one team phone on **mobile data** (campus Wi-Fi may block device-to-device or websockets).
- Backup: screen recording of the full flow on the laptop desktop + hotspot from a teammate's phone.

## Flow
1. **Problem (1 min, slide):** students don't ask, instructor doesn't know who is lost, time is wasted.
2. **Start session (1 min):** Dashboard → course → Start session "Linear regression and correlation" → Present → welcome screen with QR. **Professors scan the QR with their own phones.** Joined count climbs live.
3. **Ask (2 min):** professors send anonymous questions (one in Arabic). Host sees them live. A rude test question from a teammate disappears silently (show flagged count). Group two similar questions into a topic → students tap **Me too** → topic rises to the top → instructor replies in writing → reply appears on phones.
4. **Quick Check (3 min):** press → on projector: question opens, "12 / 15 answered" climbs, timer closes it, results show **% correct + Sure and wrong + suggestion** "Discuss with your neighbour, then vote again" → **Start round 2** → compare rounds → reveal; phones show "You got it" / "Not quite — here's why".
5. **Explain (1 min):** professors write one sentence; host tags one as Misconception → show it on projector anonymously.
6. **End + Take-away (1.5 min):** End session → key points → Publish → phones show the Take-away with their personal review → Save as image.
7. **Dashboard & export (1 min):** ended session summary + Excel download.
8. **Architecture (1 min, slide):** React/TS ↔ Express/Socket.io ↔ PostgreSQL; anonymity by device hash; server-side answer hiding; stealth moderation; reconnect snapshots.

## Likely professor questions (prepare answers)
- How is anonymity guaranteed? (hash only, DTO allow-lists, no identity in any payload)
- What if Wi-Fi drops? (snapshot on reconnect; show it by toggling airplane mode)
- How many students can it handle? (load-test numbers from Phase 7)
- Why not Kahoot / Mentimeter / Slido? (lecture-focused: anonymous Q&A + Me too + confidence + Take-away in one flow; we researched these competitors for the proposal)
- How do you stop cheating / spam? (one answer per device per round, rate limits, moderation)
- What's next? (AI topic grouping, slide-based drafts, schools, Arabic UI)
