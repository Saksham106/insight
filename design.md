# Design — Insight Academy

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Vibe: **"lamplight, cream paper, honeyed amber, calm focus"** — a warm
study-room. Soft and welcoming for parents and students, never childish.

## Genre

playful (post-Linear soft school — friendly, rounded, low-chroma, sophisticated)

## Macrostructure family

- Marketing pages (`/`): **Split Studio** — alternating text/proof diptychs.
  Nav N1a (wordmark + log-in; the page genuinely has two destinations).
  Footer Ft5 Statement. Tier-A CSS-art proof panels allowed; no photos, no
  fake browser/phone chrome, no invented metrics or testimonials.
- App pages (`/admin /teacher /student /parent /settings /chat`): **Workbench**
  discipline — function carries the page. No enrichment. Soft cards on cream,
  tinted panel steps instead of border-everything. DashboardHeader is the app
  chrome; it is not a marketing nav archetype.
- Content pages (`/privacy /terms`): Long Document, typography only.
- Auth pages (`/login /forgot-password /set-password`): quiet centered form on
  `paper-2`, typography only. No decorative backdrops.

## Theme

Custom OKLCH ("Warm study-room"). Axes: **light / geometric-sans / chromatic-amber (~75°)**.

- `--color-paper`       oklch(97% 0.015 80)   — page background, warm cream
- `--color-paper-2`     oklch(94.5% 0.018 80) — tinted band / quiet surfaces
- `--color-paper-3`     oklch(91.5% 0.02 80)  — deepest panel step
- `--color-card`        oklch(99% 0.008 85)   — raised card surface
- `--color-ink`         oklch(24% 0.015 70)   — primary text, warm brown-black
- `--color-ink-2`       oklch(42% 0.018 70)   — secondary text
- `--color-muted`       oklch(50% 0.018 70)   — de-emphasised text
- `--color-rule`        oklch(88% 0.018 80)   — hairlines, borders
- `--color-rule-2`      oklch(91% 0.016 80)   — secondary hairlines
- `--color-accent`      oklch(64% 0.14 75)    — honeyed amber; fills + active states, ≤5% footprint
- `--color-accent-hover` oklch(58% 0.14 72)   — hover step of accent fills
- `--color-accent-soft` oklch(92% 0.045 85)   — amber wash for tinted chips/bands
- `--color-accent-deep` oklch(46% 0.11 65)    — amber dark enough for links/underlines
- `--color-accent-ink`  oklch(24% 0.015 70)   — text on accent fills (ink)
- `--color-focus`       oklch(58% 0.19 75)    — :focus-visible ring only, shows instantly
- `--color-success`     oklch(50% 0.11 150)
- `--color-warning`     oklch(55% 0.13 60)
- `--color-error`       oklch(52% 0.16 30)
- Legacy aliases (`--color-navy`, `--color-slate`, `--color-soft`,
  `--color-gold`, `--color-gold-light`, `--color-background`,
  `--color-foreground`, `--color-surface`, `--color-border`) remain declared
  and point INTO this system so existing components stay coherent. New code
  uses the primary names above.

## Typography

- Display: **Bricolage Grotesque**, weights 600–700, style normal (never italic),
  tracking −0.025em. Applied to all headings and the wordmark.
- Body: **Geist**, weight 400 (500 for emphasis). Via next/font.
- Mono: **Geist Mono**, weight 400 — times, schedule data, codes.
- Type scale anchor: `--text-display: clamp(2.25rem, 4.5vw, 3.5rem)`.
- Hero headlines ≤ 7 words / ≤ 50 chars. Headings are always roman.

## Spacing

4-point named scale in `tokens.css` (`--space-3xs` … `--space-3xl`). Pages use
named tokens, never raw values. Major marketing sections separated by
`--space-3xl` minimum.

## Radius

`--radius-card: 12px` (playful upper bound) · `--radius-input: 8px` ·
`--radius-pill: 999px`. Nothing rounder than the pill, nothing squarer than 6px
on interactive elements.

## Motion

- CSS-only; no motion library is added to this project.
- Easings: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`,
  `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`. Never browser `ease`,
  never bounce/overshoot.
- Durations: `--dur-short: 180ms`, `--dur-med: 240ms`.
- Card hover-lift: `translateY(-2px)` + soft amber-tinted shadow
  (`0 8px 24px -12px oklch(46% 0.11 65 / 0.28)`).
- Animate `transform` and `opacity` only.
- Reveal pattern: opposite diptych halves cross-fade with a slight stagger
  (marketing only). App pages: no reveals.
- Reduced-motion fallback: opacity-only, ≤ 150ms; lifts and translates collapse.

## Microinteractions stance

- Silent success over celebratory toasts.
- Optimistic update + Undo over confirmation dialogs where logic already allows.
- Hover tooltips delay 800ms; focus tooltips 0ms.
- `:focus-visible` ring in `--color-focus`, 2px, never animated, ≥3:1 contrast.

## CTA voice

- Primary CTA: amber fill (`--color-accent`) + ink text, `--radius-input` corners,
  hover darkens one step (`--color-accent-hover`) and lifts 1px, active presses
  1px down. Copy is a verb phrase ("Request an invite", "Log in").
- Secondary CTA: hairline outline (`--color-rule`) on `--color-card`, ink text,
  hover fills `--color-paper-2`.
- Final CTA strip: ONE button, not two.

## Per-page allowances

- Marketing pages MAY use Tier-A CSS-art proof panels (soft schedule/chat cards
  drawn in CSS). Never fake browser bars, phone frames, or window chrome.
- App pages MUST NOT use enrichment — function carries the page.
- Content + auth pages: typography only.
- No invented metrics, testimonials, logo walls, or counts anywhere. If a number
  isn't real, the section doesn't ship.

## What pages MUST share

- The "Insight Academy" wordmark set in Bricolage Grotesque 700.
- The amber accent and its discipline (≤5% of any viewport).
- The display + body fonts.
- The CTA voice (shape, radius, padding rhythm, verb-phrase copy).
- Card language: `--color-card` surface, `--color-rule` hairline, 12px radius,
  soft shadow only on interactive/raised cards.

## What pages MAY differ on

- Macrostructure within the page-type family.
- Proof-panel composition on marketing diptychs.
- Density: app tables run tighter spacing than marketing sections.

## Exports

### tokens.css

See [`tokens.css`](tokens.css) at the project root — the canonical token file.
`src/app/globals.css` mirrors it for the Next.js build; keep the two in sync
when amending.
