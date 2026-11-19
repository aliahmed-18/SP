# 01 — Product Spec (what every feature does, exactly)

Screens referenced as `[shot NN]` → `reference/screenshots/NN-*.png`.

## Roles
| Role | Device | Identity |
|---|---|---|
| Instructor | Laptop (+ projector) | Account (email + password) |
| Student | Phone (any modern browser) | Anonymous `deviceId` in localStorage |
| Projector | Second browser tab/window opened by instructor | Instructor's login |

---

## A. Public & auth
**Home `/`** `[shot 01]`
- Left: headline + short value line ("Make sure your students get it."), small "How it works" (3 steps), privacy line "No student accounts. Questions stay anonymous."
- Right: **Join a lecture** card (5-char code input, auto-uppercase, Join button) and **For instructors** card (Log in / Create account).
- Also support direct link `/join/:code` (what the QR opens).

**Register / Login** — name, email, password (min 8). Errors shown inline. After login → dashboard.

## B. Instructor dashboard `/dashboard`
- List of **Courses** (e.g. "ITCS 444 — Mobile Dev"). Create / rename / delete course.
- Inside a course: list of **Sessions** (topic, date, status LIVE/ENDED, joined count, question count). Button **Start session**.
- Start session form: **Lecture topic** (1–80 chars) + **Academic mode** toggle (default ON — enables moderation; OFF only for informal sessions).
- Ended sessions open a read-only **Summary** (questions, topics, Quick Check results, Take-away) with **Export** (Excel; PDF if time).

## C. Live session — instructor view `/s/:code/host` `[shot 02, 03, 10]`
Two-column layout on laptop:
- **Left (main):** header with topic + **Invite card** (big code, QR button, "Show on projector"), joined count. **Set up activities**: create Quick Check (MCQ / True-False / Number) or Explain. **Activities list** in run order (drag or up/down to reorder; edit; delete; launch). Big **Start presenting** button.
- **Right (side panel):** **Q&A** with two tabs: **Topics** and **List**.
- Header menu: dark mode toggle, **End session** (confirm dialog).

### C1. Ask / Q&A (instructor side)
- New questions appear live at the top of **List** (time + text). No identity, ever.
- Each question: ✓ **Addressed** toggle, **Remove** (inappropriate → deleted, counts as flagged), **Add to topic**.
- **Topics**: instructor creates a topic (title ≤ 100) and moves questions into it (select questions → "Group into topic"). Topics are sorted by **Me too count**, then by number of questions.
- Topic actions: **Answered in class** or **Reply in writing** (text ≤ 2000) → status `REPLIED`, reply is pushed to students.
- **New part**: starts a fresh list (e.g. after the break). Earlier parts collapse below with summary "Questions: q · Flagged: f".
- **Copy questions** (TSV to clipboard) for pasting into Excel.

### C2. Quick Check (instructor side) `[shot 04]`
Create form: **Question** (≤ 2000), **Answer type**:
- **Multiple choice** — 2 to 5 options (≤ 300 each), choose the correct one.
- **True / False** — choose correct.
- **Numeric** — correct number + **tolerance** (≥ 0). Answer counts correct if |answer − correct| ≤ tolerance.
- **Explanation** (≤ 2000) — required; shown to students after reveal.

Lifecycle: `DRAFT → LIVE → CLOSED → REVEALED`. Only **one activity LIVE** per session. Launching another while one is live is rejected with "One activity can be live at a time."
- While LIVE: shows **responses / joined** live ("23 / 42 answered"). Results are **hidden** by default on the projector until the instructor shows them.
- **Close** → stops answers. **Reveal** → students see correct answer + explanation.
- Results per round: **Responses**, **% Correct**, **Sure and wrong** count, distribution bars per option `[shot 07]`.
- **Suggestion** chip: `< 30%` → "Re-explain" · `30–70%` → "Discuss with your neighbour, then vote again" · `> 70%` → "Move on".
- **Start round 2** (vote again, Peer-Instruction style): same question, new round, each device can answer once more. Show round 1 vs round 2 comparison.

### C3. Explain (instructor side)
- Create: **Prompt** (≤ 2000) + **Model answer** (≤ 2000, never sent to students).
- Students write ≤ **1000 characters** (a few sentences). Moderated like questions (same words and characters; the length rule is the answer's own).
- After **Close**, instructor sees all answers (no identities) and tags each: **Correct / Partial / Misconception** (manual). Filter by tag.
- **Show on projector**: one selected misconception (anonymous) to discuss it with the class.

## D. Present mode (projector) `/s/:code/present` `[shot 05–08]`
Opened in a new window; full screen; large type (titles ≥ 32 px, key numbers ≥ 64 px, code ≥ 96 px, QR ≥ 300 px).
1. **Welcome screen**: topic, QR, code, "N joined" live.
2. **Run activities in order** (from the activities list). One key moves forward through each step: *open question → close (and show answer if auto-reveal) → show answer → next question*.
3. Keyboard: `→`/`Space`/clicker = next · `←` = undo last step · `B` = blank screen · `R` = vote again · `Esc` = exit.
4. Optional **timer per question** (off / 30 / 60 / 90 s; click to +15 s). Auto-closes at 0.
5. Option **"Show the answer as soon as a question closes"** (default ON; OFF lets the class discuss the vote first).
6. Explain on projector shows "Write your answer on your phone" + answer count.
7. A small join line ("Join: CODE") stays visible in a corner during activities.
8. **Q&A topic** can be pushed to the projector ("Show on projector") from the host view.

## E. Student `/s/:code` (phone-first) `[shot 20–29]`
- Header: logo mark, lecture topic, theme toggle, menu.
- After join: "You're in — Ask anything, any time. The instructor never sees who asked."
- **Ask box** (always available; when an activity is live it becomes a floating **Ask** button opening a sheet `[shot 27]`). ≤ 300 chars with counter. Draft text is kept in sessionStorage across activity switches and refresh.
- **My questions (n)**: questions this device sent (from localStorage).
- **Topics the class is asking about**: topic titles with **Me too** button (one per device per topic, can undo) and replies when `REPLIED` `[shot 20]`.
- When a Quick Check goes LIVE, the screen switches to it automatically `[shot 21, 25, 26]`:
  - Tap an option (or True/False, or type a number) → "Answer sent — you'll see the right answer when the instructor shows it."
  - Then **How sure are you?** Sure / Not sure / Skip `[shot 22]`.
  - On REVEALED: "You got it" or "Not quite — here's why", own answer + correct answer + explanation, **Back to the lecture** `[shot 23, 24]`.
  - Each revealed result is saved locally (for the Take-away review).
- Explain: text box ≤ 1000 + Send → quiet confirmation "Answer sent".
- Session ENDED: "The lecture has ended" → Take-away when published (or "The instructor is preparing your Take-away").

## F. Take-away (end of lecture) `[shot 09, 28]`
- After **End session**, instructor sees a **Take-away editor**: key points (add/remove/reorder, ≤ 10, each ≤ 300), **top topics** auto-filled from most Me-too topics (with their replies; instructor can fill missing replies), **Save draft** / **Publish**.
- Student Take-away page: **Today's key points**, **What the class asked most** (+ replies), **Your Quick Check review** (only questions this device got wrong or was not sure about — computed from localStorage, never sent to server), **Save as image** (PNG, always light theme).
- "This page disappears 24 hours after the lecture ends."

## G. Export (instructor)
- Excel (.xlsx) with sheets: Questions (part, time, text, topic, addressed), Topics (title, me-too, status, reply), Quick Checks (question, round, responses, % correct, sure-wrong, distribution), Explain (prompt, answers, tags). No identities.
- PDF report (done): "Download results" offers **PDF report** (a print-ready page at `/s/:code/report`, saved with the browser's *Save as PDF*, so Arabic text renders correctly) and **Excel workbook**. Same data as the host view; no identities.

## H. Limits & numbers (use these exact values)
| Thing | Limit |
|---|---|
| Join code | 5 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I) — unique among LIVE sessions |
| Topic (lecture) | 1–80 chars |
| Question | 1–300 chars, ≥ 5 s apart, ≤ 40 per device per session |
| Explain answer | 1–1000 chars, one per device per activity |
| Quick Check | prompt ≤ 2000, MCQ 2–5 options ≤ 300 each, explanation required |
| Topic title | 1–100 |
| Reply | ≤ 2000 |
| Session auto-end | 6 h after start |
| Take-away visible | 24 h after end |

## I. Out of scope (do NOT build unless the team asks)
AI generation / classification / analysis · student accounts · native mobile app · Arabic UI translation · math notation rendering · payments · LMS integration · notifications/sounds/confetti.
