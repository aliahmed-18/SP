# Getit — Starter Kit for Claude Code

## ابدأ من هني (خطوات)
1. **جهّز جهازك:** Node.js 22، و Docker Desktop (عشان PostgreSQL)، و Git، و Claude Code.
2. **سوّ repo جديد** في GitHub (مثلاً `getit`)، واعمل clone على جهازك.
3. **فك الـ zip** وانسخ كل محتوياته في root الـ repo: `CLAUDE.md` و `FIRST_PROMPT.md` و `docs/` و `brand/` و `reference/`. سوّ commit.
4. افتح Terminal في الـ repo واكتب `claude`.
5. **انسخ الـ prompt** من `FIRST_PROMPT.md` (اللي تحت الخط) والصقه.
6. راجع رد Phase 0، وبعدها قل له "go". بعد كل phase جرّب بنفسك قبل ما تقول له يكمل.
7. بعد ما تخلص Phase 1، كل واحد في الفريق يسوي clone ويشتغل على track حقه (`docs/06-plan-and-team.md`).

## What's inside
| Path | What |
|---|---|
| `CLAUDE.md` | Main context file — Claude Code reads it automatically every session |
| `FIRST_PROMPT.md` | First message to paste into Claude Code |
| `docs/01-product-spec.md` | Every feature, screen, rule and limit |
| `docs/02-data-model.md` + `docs/schema.prisma` | Database (Prisma 6, validated) |
| `docs/03-api.md` | REST endpoints |
| `docs/04-realtime-events.md` | Socket.io events, rooms, snapshots, privacy DTOs |
| `docs/05-ui-guide.md` | Colours, font, layouts, exact copy |
| `docs/06-plan-and-team.md` | Phases, calendar, 4-person split |
| `docs/07-demo-script.md` | Presentation flow + likely professor questions |
| `docs/08-deployment.md` | Env vars, local setup, hosting |
| `docs/09-definition-of-done.md` | Tests and checklists |
| `brand/` | Logo SVGs, icons, PWA manifest, og-image, theme.css, brand.tsx, logo PNGs for slides |
| `reference/screenshots/` | 19 screens of the old MVP (desktop, projector, phone) |
| `reference/mvp-code/` | Moderation filter + logic to port, old SQL for reading only |
