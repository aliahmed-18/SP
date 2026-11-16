Paste everything below the line into Claude Code as your first message (from the repo root, after copying this kit into it).

---

You are building **Getit**, our university senior project: a classroom interaction website (React/TS + Express/Socket.io + PostgreSQL/Prisma). We present it live to 3–5 professors in under 4 weeks, so it must work 100% reliably.

This repository already contains a complete starter kit:
- `CLAUDE.md` — project context, fixed stack, non-negotiable rules. Follow it strictly.
- `docs/01…09` — product spec, data model + validated `schema.prisma`, REST API, Socket.io contract, UI & brand guide, phased plan, demo script, deployment, definition of done.
- `brand/` — the real logo (vector paths — never redraw), icons, theme tokens (`theme.css`), brand React components.
- `reference/` — screenshots of our previous MVP (match their layout) and pure logic files to port (`moderation.ts` as-is).

Start with **Phase 0 only** (see `docs/06-plan-and-team.md`):
1. Read `CLAUDE.md`, every file in `docs/`, `reference/README.md`, and look at every image in `reference/screenshots/`.
2. Reply with: (a) anything unclear or contradictory, (b) the final folder tree, (c) the exact packages and versions you will install, (d) your step list for Phase 1.
3. Do not write code yet. Wait for my "go".

After I approve, do Phase 1, then stop and report (what you built, how to run it, how you verified it, what's next). Continue one phase at a time, always waiting for my approval. Never mark something done without running typecheck, tests, and the app.
