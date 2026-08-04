# Design elevation - the challenger (feat/design-elevation, 2026-07-12)

The system-wide elevation track. The baseline is preserved at tag
`design-baseline-2026-07-11` (docs/design/SAFE-POINT.md). The challenger keeps
the locked identity (navy #0A1628 + gold, Archivo display / Hanken body /
Manrope UI, light and airy, 1400 container, hero scale token, no
glassmorphism) and elevates EXECUTION only. Styling only: no content, copy
meaning, flow or logic changes.

## The design plan (per the studio process)

- Palette: locked. Navy ink, canvas, gold-400 (dark surfaces), gold-800
  (light-surface text), navy alphas for every shadow/scrim. No new colours.
- Type: locked stack, elevated setting: Archivo display gains -0.015 to
  -0.02em tracking at display sizes; one `.type-eyebrow` utility (11px, 600,
  0.18em caps) used by SectionHeader, PageHero and KpiCard; tabular numerals
  on dashboard KPIs (Archivo extrabold).
- SIGNATURE - THE HOUSE GRADE: every photograph on the platform passes
  through one colourist's grade: `saturate(1.06) contrast(1.03)` on all card
  and hero media, plus a permanent navy base veil on card photos (0.16 to 0
  by 48%) and ONE five-stop cinematic scrim curve on every hero (0.84 / 0.54
  at 20% / 0.24 at 44% / 0.06 at 68% / 0 at 88%), replacing four subtly
  different per-page curves. The whole catalogue reads graded by one hand.
- Structure device: the SectionHeader gold keyline gains a 3px grounded foot
  (the house section mark), quiet and recurring.
- Depth: navy-tinted `--shadow-panel` for organiser panels; existing card
  shadow family untouched.
- Motion: press acknowledgement on every button (scale 0.99, transform-only
  so no transition overrides, motion-flag gated), `.link-underline` intent
  underline utility. All under `html[data-motion="1"]`; reduced-motion and
  audits see static paint only.

## Originality Law check (the plan level)

No gradient meshes, no glassmorphism, no blobs, no palette drift, no template
sameness: the elevation deepens the existing editorial navy/gold identity.
The one signature (the house grade + unified scrim) is a colourist's move,
not an AI-design trope.

## Enumerated surfaces (nothing silently skipped)

All inherit the primitives above (media components, PageHero, SectionHeader,
ContentSection, EmptyState, dashboard shell, globals tokens); flagship
surfaces additionally receive hand review with screenshots at 1440 + 390.

PUBLIC: / (home), /events, /events/[slug] (GA + seated incl. seat-map visual
treatment), /events/[slug]/with/[artist], /events/browse/[city], /artists,
/artists/[slug], /artists/claim/[token], /cities, /city/[slug],
/city/[slug]/[suburb], /communities, /community/[community],
/community/[community]/[city], /faith/[faith], /categories/[slug], /about,
/pricing, /organisers, /organisers/[handle], /for-organisers, /waitlist,
/feed, /help, /help/[slug], /contact, /careers, /press, /legal/* (6),
/venues/[handle], /join/[code], /queue/[slug], /squad/[token] (+pay),
/unsubscribe/* (2), /waitlist/unsubscribe/[token].
AUTH: /login, /signup, /forgot-password, /verify-email-sent,
/auth/reset-password, /organisers/signup.
BUYER: /tickets, /t/[code] (QR ticket), /checkout/[reservation_id],
/orders/[order_id]/confirmation, /account (+notifications, saved, tickets),
/scan/[eventId].
ORGANISER: /dashboard (shell + home), events list, event screen, attendees,
discounts, edit, launch-kit, lineup, orders (+detail), pricing, reach, seats,
create (wizard end to end incl. Magic Start), gigs (flag-off), insights,
invites, my-squads, my-waitlists, organisation (+create), payouts, tickets,
venues, venues/[id]/seat-maps (builder).
ADMIN: shell + 24 admin pages (inherit tokens/panels).
SYSTEM STATES: not-found (404), global error, checkout error, dashboard
error, loading states (dashboard, events, event detail, checkout, create),
EmptyState/CategoryHeroEmpty everywhere they render.
EMAIL SHELLS: order confirmation (+ seat variants), transfer, seat
assignment/move, waitlist join.

## Evidence

Per-surface before/after screenshots land in this directory
(`docs/design/elevation-2026-07-12/`), named `<surface>-<vp>-{base|elev}.png`.
Lighthouse mobile before/after on the challenger preview. The regression
battery result rides the final report.
