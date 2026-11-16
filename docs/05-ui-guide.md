# 05 — UI & Brand Guide ("Calm Classroom")

Always open the matching screenshot in `reference/screenshots/` before building a screen.

## Brand assets (in `brand/`)
| File | Use |
|---|---|
| `brand-paths.ts` + `brand.tsx` | `<Wordmark/>`, `<LogoMark/>`, `<Spinner/>`, `<LoadingState/>` — copy to `client/src/components/brand/` |
| `logo.svg` / `logo-white.svg` | wordmark for light / dark backgrounds (put in `client/public/`) |
| `favicon.svg`, `icons/*` | favicon, PWA icons, apple-touch-icon, `og-image.png` (1200×630 link preview), `site.webmanifest` → `client/public/` |
| `png/*` | logo PNGs for slides / report / poster (not used by the app) |
| `theme.css` | Tailwind v4 + shadcn tokens (light + `.dark`) → becomes `client/src/styles.css` (adjust the `@source` path) |

**Never redraw or retype the logo.** The "Getit" letters are custom vector paths; the 4-point **sparkle** sits where the dot of the "i" would be.

## Colours
| Token | Hex | Use |
|---|---|---|
| primary (teal) | `#0F766E` | buttons, links, logo letters, app-icon background |
| accent-foreground | `#115E59` | text on teal tints |
| accent (teal tint) | `#EEFBF8` | selected rows, info boxes |
| foreground (navy) | `#1E293B` | text; dark-mode backgrounds are navy, never pure black |
| background | `#F8FAFC` | page |
| muted-foreground | `#64748B` | secondary text |
| border | `#E2E8F0` | |
| sparkle / attention (amber) | `#F59E0B` | the sparkle, "Sure and wrong", warnings. Text on amber tint: `#92400E` |
| correct (blue) | `#2563EB` | correct answers |
| wrong (orange) | `#EA580C` | wrong answers ("Not quite") |

Correct = **blue**, wrong = **orange** (colour-blind safe; not green/red). Always pair colour with an icon or text (✓, "Your answer", "Correct").

## Type & shape
- Font: **Readex Pro** (variable, self-hosted via `@fontsource-variable/readex-pro` — works on weak campus Wi-Fi). Body 16 px, line-height 1.6.
- Radius: controls 12 px, cards 16 px, page panels 20 px.
- Icons: lucide-react, 16–20 px.
- Motion: 150 ms fades only; projector steps slide up 260 ms. Everything off with `prefers-reduced-motion`.
- No sounds, confetti or vibration.

## Layouts
- **Student (phone, 360–430 px)**: single column, sticky header (LogoMark 32 px + topic + theme toggle + menu), big tap targets (≥ 44 px), answer options as full-width cards with a letter badge (A, B, C…), floating **Ask** button bottom-right while an activity is live.
- **Instructor (laptop ≥ 1280 px)**: main column + right Q&A panel (≈ 380 px). Cards on `bg-card` with `border`.
- **Projector (1920×1080)**: one idea per screen, huge type, thin progress bar on top, controls bar at the bottom (small, low-contrast), join line "Join: CODE" in a corner. Code ≥ 96 px, QR ≥ 300 px, question title ≥ 40 px, key numbers ≥ 64 px.
- **Dark mode**: instructor + student toggle (store in localStorage). Take-away PNG is always light.

## Copy (use these exact strings)
- Tagline: "Make sure your students get it."
- Join: "Join a lecture" · "Enter the 5-letter code on the screen." · Error: "That session doesn't exist or has expired."
- Student joined: "You're in" · "Ask anything, any time. The instructor never sees who asked."
- Ask placeholder: "Ask anything about the lecture…" · "Anonymous — your name is never shown."
- After answer: "Answer sent" · "You'll see the right answer when the instructor shows it." · "How sure are you?" Sure / Not sure / Skip
- Reveal: "You got it" / "Not quite — here's why" · "Back to the lecture"
- Topics: "Topics the class is asking about" · "Tap "Me too" if you have the same question."
- Suggestions: "Re-explain" · "Discuss with your neighbour, then vote again" · "Move on"
- One live: "One activity can be live at a time."
- Take-away: "Today's key points" · "What the class asked most" · "Your Quick Check review" · "Nothing to revisit — well done." · "This page disappears 24 hours after the lecture ends."
More strings: `reference/mvp-code/i18n.tsx` (English object `en`) — reuse wording from there.

## Naming
The Explain activity is labelled **Explain** in the UI (subtitle "Short written answer"), not "Open-ended question".

## States every screen needs
Loading (brand Spinner) · Empty (friendly line + next action, e.g. "No questions yet — show the join code so the class can join.") · Error with Retry · Reconnecting banner · Session ended.
