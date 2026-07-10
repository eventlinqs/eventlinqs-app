# Honest critique: what still needs improving (2026-07-04 design upgrade, Phase 5)

Everything below survived this mission or was found by it, ranked by impact.
Items 1-3 need a founder decision; the rest are execution work.

## P0 - operational risk

1. **`.env.local` points local development at the PRODUCTION database**
   (gndnldyfudbytbboxesk). Any local write-path test (a checkout smoke, a
   consent record, a seed) would write production, and the fee resolvers
   silently fall back to STALE constants (2% + $0.50) against prod because it
   lacks the fee migration, so a local session can show the wrong public fee
   with no error. Every run this mission exported `.env.test` over it. Fix:
   repoint `.env.local` at TEST (keep prod creds out of the repo tree
   entirely) and update the stale `public-fee.ts` fallback constants to the
   locked 3.5% + $0.99 / 2.5% so the last-resort display can never contradict
   the locked model.

## P1 - product decisions the founder should make

2. **The /categories route does not serve the general categories.**
   `/categories/[slug]` hosts only the seven legacy scene categories
   (afrobeats, amapiano, gospel, owambe, caribbean, heritage-and-independence,
   networking); `/categories/music`, `/categories/comedy` etc. render the 404
   page (they did in the baseline too). General categories only exist as
   `/events?category=` filters. Nothing internal links to the broken URLs, but
   these are exactly the programmatic-SEO landing pages the growth plan wants
   (Schema.org category pages that rank). Decide: build general category
   landings on this route, or 301 `/categories/*` into `/events?category=*`
   until they exist.
3. **The admin panel contradicts the light-and-airy law.** It runs a parallel
   hardcoded dark palette (`#0A0F1A`/`#131A2A`/`#C9A227`) across ~40 files and
   a fourth gold. Decide: bless a dark admin theme (then tokenise it once as
   admin tokens), or re-skin admin to the light system. Until then admin is
   exempt from the token gates by omission, which will drift further.
4. **Founding Organiser terms and testimonials are config slots awaiting real
   content** (`src/lib/organisers/founding-offer.ts`, `testimonials.ts`).
   The offer band runs with honest generic terms; the founder should set the
   real reduced-fee arrangement (deliverable through the existing per-organiser
   pricing_rules override) and drop in real quotes as they arrive. The
   testimonials band correctly renders nothing today.

## P2 - design system completion

5. **`.type-*` adoption is still partial.** The shared SectionHeader now
   enforces the 24px rail law, but ~20 template files still re-roll
   `text-2xl sm:text-3xl` headings by hand (city/community/venue/help
   templates). One mechanical sweep ends the drift.
6. **Radius/shadow token adoption beyond the primitives.** The tokens exist
   (`--radius-card/panel/control`, `--shadow-card/-hover/modal`) and new work
   uses them; legacy surfaces still carry the lg/xl/2xl scatter and ~20
   hand-rolled navy shadows.
7. **Dead hero components still ship.** `featured-event-hero.tsx`,
   `event-bento-tile.tsx` (only their TYPES are imported) and the GlassCard
   primitive (the last backdrop-blur in the repo) are dead code. Extract the
   types, delete the components.
8. **The organiser dashboard and wizard deserve the next full design pass.**
   This mission fixed the container cap, error boundary, and verified the
   7-step walk + immediate upload preview, but the dashboard's data-rich
   states (real sales, payouts) and the wizard's visual rhythm were not
   redesigned. Do it against an account with live sales data.

## P3 - verification debt (before calling the constitutional gates green)

9. **Lighthouse 95+ was NOT measured this session.** The law requires medians
   on a warmed Vercel preview; this branch has not deployed. Run the full
   battery (Lighthouse desktop+mobile, axe, benchmark SURPASS/PARITY verdicts
   per surface) on the preview once `feat/design-upgrade-2026-07-04` deploys.
10. **External OG validation needs a public URL.** The per-event card is
    verified locally (200 image/png, correct content, metadata deferring to
    it); paste a staging event URL into a link-preview debugger after deploy
    to close the loop the mission asked for.
11. **axe and the link crawler are still not blocking CI jobs** (pre-existing
    gap, routed to engine hardening). The crawler also needs a longer
    per-request timeout: cold ISR renders on a loaded machine read as dead
    links (three false positives this run, all verified 200).
12. **events-browse tail imagery** showed lazy-load grey in dev captures;
    production captures were clean, but confirm the tail cards on the deployed
    preview and confirm every card image resolves (branded fallback, never
    grey).

## P4 - polish backlog

13. The Sentry monitoring tunnel 403s on local production hosts (console
    noise on every page in capture-smoke.json); verify the tunnel path on the
    deployed preview.
14. The homepage community-strip on /organisers still runs two tile rows;
    consider tightening to one editorial row so the community share of the
    page sits nearer the 10-20% law under the new band order.
15. Wizard drafts created by proof runs ("After Capture Draft ...", baseline
    "Baseline Capture Draft ...") accumulate on TEST; sweep them with the TEST
    cleanup script periodically.
