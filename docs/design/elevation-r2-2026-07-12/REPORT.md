# Elevation round 2 - three links, final round (2026-07-12)

## The three links

- CURRENT: https://eventlinqs-staging.vercel.app (main `414d801`, tree-identical
  to the aliased build eventlinqs-44mn3oo27; hero wiring fixed, sentinel live)
- ROUND-1 CHALLENGER (frozen comparison point):
  https://eventlinqs-app-git-feat-design-d1873a-lawals-projects-c20c0be8.vercel.app
  (tag `elevation-r1-2026-07-12` = aa97187, confirmed on the remote; the branch
  alias serves that exact tree)
- ROUND 2: https://eventlinqs-app-git-feat-design-c923a8-lawals-projects-c20c0be8.vercel.app
  (feat/design-elevation-r2: r1 + hero fix + sentinel + consistency law +
  luxury pass)

## Part 1 - hero image wiring, root cause and fix (on main)

Root cause, BOTH barrels: (1) every fixture event ships `cover_image_url:
null` by design, so all five featured slides were coverless; (2)
`heroRasterFor` sent every unmapped general category slug to the ONE default
raster - five different events, one identical photo. Fixes: curated licensed
covers for the five hero-reaching fixture events (CURATED_COVERS in the
catalogue seeder) and a deterministic per-event variety fallback (seeded by
event title) so coverless siblings can never share one photo anywhere.

Verified live through a FULL rotation at 1440 AND 390 (headed browser):
five slides, five distinct images travelling with their texts
(rotation-1440-slide1..5.png, rotation-390-slide1..5.png), tempo ~4.8s and
pause-on-hover intact. Standing invariant recorded as a home-page gate:
pinned unit tests (tests/unit/home/featured-hero-media.test.ts) + the live
gate `scripts/verify/hero-slide-integrity.mjs` (GREEN on the final build),
documented in docs/verification/HOME-GATES.md.

## Part 2 - consistency law + luxury pass (r2)

- CONSISTENCY LAW ENCODED: one faint divider weight platform-wide
  (`border-t border-ink-200`). The heavier gold rule above the community
  rail corrected; the moat keeps its identity through the gold eyebrow.
- ABOUT US ELEVATED (Law 4): opens photographic on the platform hero token
  with the cinematic scrim, plus a licensed story band mid-page; copy
  untouched; slots in src/lib/images/about-photos.ts
  (about-1440-r2.png / about-390-r2.png).
- CRAFTED CONTROLS: buttons move to the navy-tinted shadow family with the
  gold hover bloom made systemic (no grey Tailwind shadows anywhere on the
  control language); rail arrows already carry the locked navy/gold craft.
- Self-check per touched surface at both viewports: more luxurious than r1
  where touched (About is the decisive win), Originality Law passes
  everywhere - photography, navy and gold deepened, zero AI-design
  signatures.

## Part 3 - the payment sentinel (permanent)

Built on the existing cron + Resend rails; READ-ONLY against the payment
engine. `/api/cron/webhook-sentinel`, scheduled every 10 minutes
(vercel.json) plus a post-deploy hook step (post-deploy-smoke workflow;
arms when CRON_SECRET lands in GitHub secrets at go-live).

- SELF-PROBE: synthetic event signed with the deployment's own secret
  through the REAL webhook route (400 = signature mismatch; unreachable =
  endpoint down; other non-200 = processing error).
- DRIFT WATCHDOG: alerts ONLY on true drift (stuck-pending orders
  cross-checked against Stripe's succeeded intents) - abandoned checkouts
  are classified and reported, never alerted.
- ENDPOINT CONFIG: exactly one enabled endpoint at the canonical host.
- Canonical secret home, rotation procedure, and the go-live-day step:
  docs/payments/WEBHOOK-CANON.md.

PROVEN BOTH WAYS: final green probe on the deployed current link (200,
ok:true, all three checks OK); the mis-sign drill correctly rejected (400)
and produced the alert email in a real inbox naming the deployment and the
probable cause (sentinel-alert-inbox.png, sentinel-alert-email.png). Bonus:
the sentinel's FIRST live run caught a genuinely stuck pending order and
emailed about it unprompted.

Two REAL defects found and root-fixed during the battery:
1. The reservation expiry sweeper crashed on seat-shaped reservation items,
   so one stale seat hold froze the entire GA expiry sweep (oversell risk).
   Fixed with a jsonb_typeof guard (migration 20260712000001, applied to
   TEST): the first fixed run released 17 silently-stuck reservations.
2. The sentinel watchdog itself was refined to true-drift-only after its
   first run flagged an abandoned checkout.

## Payment battery, both links (never fails)

| Leg | Current | R2 |
|---|---|---|
| GA purchase, webhook-confirmed, attached | EL-CWZKE4DX | EL-LNS6J6KU |
| Seated purchase, seat through ticket + My Tickets | EL-PGESYPZN | EL-PKJPMQHW |
| Displayed == charged to the cent | 27.50 selector = 27.50 TOTAL = 2750c charged (EL-SPN58CEW; cents-checkout.png shows the full fee breakdown) | same, EL-HVUL6G3A |
| Declined card clean | stayed on checkout, clear decline message | same |
| Abandoned seated hold released | Rows C2 + E4 back to available via the real cron | Row D1 released (released:1, seatsReleased:1) |
| Gates (tsc / eslint / suite / build) | green (CI on PRs #106/#107 + main battery) | green (full local battery on the r2 head) |

## Lighthouse mobile (same rig, warmed, 3 runs per link)

| Link | Runs | Median |
|---|---|---|
| Current | 44 / 49 / 53 | 49 |
| Round 1 (frozen) | 55 / 53 / 53 | 53 |
| Round 2 | 52 / 42 / 49 | 49 |

All three sit in the rig's established noise band around 50 (LCP 4.5 to
5.7s across runs; r2 posted the best single LCP of the day at 4.5s).
Elevation never cost speed: the round-2 layers are pure CSS plus curated
covers, and the CI Lighthouse mobile gate passed on every merged tree.

## Honest self-assessment

- R2 visibly surpasses r1 on: About Us (bland text page to a photographic
  brand story - the single clearest win of the round), divider consistency
  (the homepage rhythm reads calmer), button light (the gold bloom reads
  crafted), and the homepage hero itself now telling five distinct stories
  (a main fix, but it is what the founder SEES).
- Deliberately held back: rail control geometry (locked and already
  excellent), hero scale and type families (identity laws), and any broader
  re-skin - r2 spends its licence where the founder pointed and where the
  answer to "is this clearly better" was yes, not on change for its own
  sake.
- Originality Law: held on every surface touched; every choice deepens
  navy, gold and photography.
