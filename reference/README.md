# reference/ — from the old MVP (Lovable + Supabase). READ, don't copy blindly.

## screenshots/
The MVP's real screens (generated from its design-preview page with sample data). Build our screens to match their layout and feel.
| File | Screen |
|---|---|
| 01-home | Home: headline + Start session / Join cards |
| 02-instructor-dashboard | Live session host view (activities left, Q&A right) |
| 03-instructor-empty | Host view before any questions/activities |
| 04-quick-check-editor | Quick Check create form |
| 05-projector-run-start | Projector welcome: topic, QR, code, joined |
| 06-projector-live-question | Projector: MCQ live, "23 / 42 answered", timer |
| 07-projector-results | Projector: numeric results + suggestion + round 2 |
| 08-projector-mcq | Projector: MCQ results with Correct %, Sure and wrong |
| 09-session-ended | Host after End: Take-away draft + download results |
| 10-instructor-dark | Host view in dark mode |
| 20-student-ask | Phone: joined, ask box, topics with Me too + reply |
| 21–26 | Phone: MCQ answer, confidence, revealed correct/wrong, True/False, Numeric |
| 27-student-ask-sheet | Phone: ask sheet opened from the floating Ask button |
| 28-student-takeaway | Phone: published Take-away |
| 29-student-dark | Phone in dark mode |

Note: the MVP had an "AI generation" button, "Prepare from slides" and "Classify" — these are **out of scope** for the core rebuild (stretch only). The MVP had no instructor accounts; we add them.

## mvp-code/
| File | Port it? |
|---|---|
| `moderation.ts` + `moderation.test.ts` | **YES, as-is** → `server/src/lib/moderation.ts` (also usable in the client for instant feedback). Pure TS, no dependencies. Arabic + English + Arabizi profanity filter with an allow-list for academic words. |
| `activities.ts` | **Port the logic**: `quickCheckSchema`, `isCorrect`, `suggestion`, `summarizeRound`, `publicActivity` → `shared/src/rules.ts`. Drop localStorage parts or move them to client `local-history.ts`. |
| `grouping.ts` | Port `sortGroups` + `exportQuestionsTsv` idea (topics sorted by Me too; TSV copy). Ignore the AI classification parts. |
| `identity.ts` | Idea only: device id in localStorage, "my questions" kept locally. |
| `i18n.tsx` | **Copy wording only** from the English `en` object. We don't build Arabic UI now. |
| `styles.css` | Same as `brand/theme.css` — use the brand one. |
| `sql/*.sql` | Old Supabase schema + functions. Read to understand rules (locking, limits, expiry). **Do not run.** Our schema is `docs/schema.prisma`. |
