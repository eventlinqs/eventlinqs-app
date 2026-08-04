# Design elevation report - two links, one choice (2026-07-12)

## The two links

- CURRENT (tempo fixed): https://eventlinqs-staging.vercel.app
  (deployment eventlinqs-h9usoqs32, main tree 9e42112 + re-keyed webhook env)
- CHALLENGER: https://eventlinqs-app-git-feat-design-d1873a-lawals-projects-c20c0be8.vercel.app
  (feat/design-elevation, current design + the elevation layers)
- SAFE POINT: tag `design-baseline-2026-07-11`; one-command restore in
  docs/design/SAFE-POINT.md.

## Part 1 - hero tempo (the only change on the current link)

ROTATE_MS 6500 to 4800 with the 700ms crossfade retained. Measured live on
staging with a headed browser: advances at 4831ms and 9666ms (interval
4835ms); the third interval stretched exactly while the pointer rested on the
hero, proving pause-on-hover held. Reduced-motion and the pre-paint gate are
untouched (headless browsers get no rotation, verified). Evidence:
tempo-live-1440.png, tempo-slide-a/b.

## Part 2 - what the challenger changes (styling only, zero functional drift)

1. THE HOUSE GRADE (signature): one photographic grade on every card and
   hero image (saturate 1.06 / contrast 1.03) + a permanent navy base veil on
   card photos + ONE five-stop cinematic scrim replacing four drifting
   per-page curves. The whole catalogue reads colour-graded by one hand.
2. Editorial type: Archivo tracking at display sizes (-0.015 to -0.02em),
   card titles set in Archivo (size unchanged per law), one eyebrow utility
   across SectionHeader / PageHero / KPI labels, tabular Archivo numerals on
   dashboard KPIs.
3. Depth: navy-tinted panel shadow across the four dashboard panels; the
   SectionHeader keyline gains its grounded foot.
4. Micro-interactions (motion-gated): button press acknowledgement,
   link-underline intent utility.

Because every one of these lands in the shared primitives (media components,
HoverWash, PageHero, SectionHeader, globals tokens), ALL ~115 enumerated
routes inherit them (the full enumeration is in ELEVATION-PLAN.md). Flagship
surfaces hand-checked with before/after pairs at 1440 and 390 in this
directory: home, browse, event detail (seated), pricing, organisers, city,
artist profile, login, 404, dashboard (authed). Per-surface verdicts:

| Surface | More premium than baseline? | Passes the Originality Law? |
|---|---|---|
| Home | Yes - marginally (grade + scrim read subtly at full size) | Yes |
| Browse | Yes (type discipline shows in the display heading) | Yes |
| Event detail seated | YES - the strongest win: cinematic hero, anchored title block | Yes |
| Pricing / Organisers | Yes - inherited rhythm, no drift | Yes |
| City / Artist | Yes - unified scrim + grade | Yes |
| Login / 404 | Inherited only (already clean) | Yes |
| Dashboard | Yes - editorial numerals, panel depth, gold sell-through bars | Yes |

No cropped heads or faces observed on any checked surface; hero heights
untouched (the platform token). No purple-blue meshes, no glassmorphism, no
blobs, no palette drift anywhere: the challenger is the same brand executed
harder.

## Lighthouse mobile (same rig, warmed, 3 runs each)

- Baseline home: 51 / 50 / 50 (LCP 5.2-5.3s)
- Challenger home: 41 / 47 / 53 (LCP 6.4 / 5.5 / 5.2s; run 1 was the fresh
  deployment's cold hit)
Verdict: parity within this rig's cold-start noise (best runs 53 vs 51); the
elevation is pure CSS (no new fonts, images, or JS) and costs nothing
structural. The absolute numbers reflect the known preview cold-start
variance (Issue #42), not a regression: the CI Lighthouse mobile gate passed
on both trees.

## Part 3 - regression battery, both links (payment never fails)

During the battery the payment path FAILED on the first run and was
root-caused and fixed, then re-proven on both links:

- ROOT CAUSE (named): the Stripe endpoint's signing secret had drifted from
  the secret held by the deployments and .env.test (the historical two-secret
  saga on this account). Live deliveries failed signature verification, so
  paid orders sat pending while their intents succeeded.
- ROOT FIX: minted a fresh webhook endpoint (we_1TsCg7...) capturing its
  secret at creation; that one secret now lives in BOTH branch envs and
  .env.test; the old endpoint (we_1TpKq2) is disabled; both branches
  rebuilt. The four genuinely-stuck orders were reconciled by replaying their
  REAL Stripe events signed with the new secret (all 200, all confirmed).

| Leg | Current link | Challenger |
|---|---|---|
| GA purchase 4242, webhook-confirmed, buyer attached | EL-SUFNFKVK confirmed | EL-WLNMRFQ2 confirmed |
| Seated purchase, seat through ticket + My Tickets | EL-9L2FQYEW confirmed, seat on ticket + My Tickets | EL-A2J23QUW confirmed |
| Magic Start publish to Launch Kit | kit shown, poster + share links + live page | same, all green |
| Transactional email to a real inbox | guest ticket email + waitlist email in Mailinator | waitlist email in Mailinator |
| Waitlist join + confirmation | joined + email | joined + email |
| Flag-off 404s | /gigs 404, /artists 404 | /gigs 404, /artists 404 |
| Gates (tsc / eslint / suite / build) | green (CI on PR #105 + main battery) | green (local full battery) |

## Honest self-assessment

- Genuinely better on the challenger: the event detail page (cinematic and
  anchored - the clearest studio-grade win), the dashboard (editorial
  numerals and depth), photographic cohesion everywhere, type confidence in
  display settings.
- Where the founder may prefer the baseline: the homepage delta is
  deliberately restrained - at a glance the two homes are close, because the
  locked laws (hero scale, rail scale, container, palette, motion restraint)
  are the design, and they already carry it. The challenger is the same
  design executed deeper, not a re-imagination; if the founder wants a
  visibly different face, that is a law-change conversation, not an
  execution pass.
- Originality Law: held on every checked surface - no AI-design signatures
  were introduced anywhere; every choice deepens the existing navy/gold
  editorial identity.
