# Footer Rebuild + Organisers Page Elevation - Report

Branch `feat/home-rebuild`. NO merge to main.
Preview: https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app

> **Founder-ruling item (one):** the brief said the paid fee is "2% + 50c". The
> exact value in the pricing SOURCE (`src/lib/pricing/public-fee.ts`,
> `PUBLIC_FEE_LABEL`, which mirrors the live `pricing_rules` baseline) is
> **2.5% + AUD 0.50**. Per the brief's own instruction ("pull exact copy from the
> pricing page source, never invent numbers"), the page states **2.5% + AUD 0.50**.
> If the intended fee is genuinely 2% + 50c, change the `pricing_rules` baseline
> and `public-fee.ts` first; the page will follow the source.

---

## PART 1 - Footer: coupling fixed, rebuilt to standard (commit `0976b8f`)

**Bug (confirmed):** mobile footer used a 2-column grid of accordions; expanding
one stretched its grid ROW and dragged the adjacent column's section down.

**Rebuild (shared `SiteFooter`, platform-wide by construction):**
- MOBILE: full-width STACKED accordions, one per row, each independent
  (`FooterAccordion`, a new client component). Real `<button aria-expanded
  aria-controls>` + rotating chevron, 44px+ touch target, smooth grid-rows
  0fr->1fr height transition (reduced-motion disables), collapsed panel `inert`
  (links leave tab + a11y trees).
- DESKTOP: unchanged - four static, always-open columns.
- Social row (Instagram, TikTok, X, LinkedIn, **Facebook present** - hardcoded in
  the component, not config), logo, legal links, First Nations acknowledgement
  all present and resolving. Link constants unchanged (footer unit test green).
- Footer standard written into the page-build skill.

**Proof (`scripts/footer-proof.mjs`, deployed preview):**
- MOBILE 390: single-column stacked layout confirmed (all four buttons share one
  x, strictly stacked). Expanding EACH accordion: sections ABOVE it move by
  **delta 0** (Discover/Communities/For organisers/Company all `aboveMoved=NONE`).
  The coupling is gone. Panel heights animate (224/260/152/152px).
- DESKTOP 1440/1280/1024: **0 visible accordion buttons** (static columns), stable
  at every width. Captures: `footer-organisers/footer-390-*.png`,
  `footer-desktop-{1440,1280,1024}.png`.

## PART 2 - Organisers page: elevated to the premium bar (commit `2a4bbaa`)

Founder verdict was "repaired but not elevated." Mirrored the captured Eventbrite
organiser evidence (`competitor-2026/eventbrite__organizer-{1440,390}.png`) and
surpassed in EventLinqs identity. The page already had a photographic hero, a
real-truths stats band, alternating feature bands, a visual how-it-works, the
linked community strip, FAQ, and a photographic CTA. The conversion gap was
PRICING CLARITY - filled:

- **Cost in one glance, above the fold:** the hero now states "Free events are
  free. Paid tickets 2.5% + AUD 0.50 each" (exact fee from the source).
- **Dedicated pricing-clarity band** (promoted from the old vague "transparent
  fees" photo band): two cards - Free events (Free forever / zero platform fees)
  and Paid events (highlighted: 2.5% + AUD 0.50 per paid ticket, the whole fee) -
  with product-truth points (pass-or-absorb, no setup/monthly/lock-in,
  multi-currency, payouts via Stripe) and a link to /pricing. No invented
  testimonials, no fake statistics.
- Surface alternation preserved; photographic hero at platform scale; treated
  alternating bands (never bare white); linked community strip as the
  differentiator; strong final CTA. Mobile-first (verified at 390 first).

### Side-by-side vs Eventbrite organiser (390 + 1440)

| Aspect | EB organiser | EventLinqs | Verdict |
|---|---|---|---|
| Hero | split text+photo, pink gradient, "trusted by millions" (unverifiable) | full-bleed cinematic photo at platform scale, navy/gold, cost above the fold | SURPASS |
| Proof points | vague "millions" social proof | real product-truth stats (all-in pricing, 5-day payout, same-day live, every community) | SURPASS |
| Pricing clarity | Pricing in nav -> separate page | actual fee inline (free + 2.5% + AUD 0.50) in a band AND above the fold | SURPASS |
| How it works | present (below fold) | 4-step visual with connecting thread | PARITY |
| Feature bands | feature sections | alternating image+text bands (tools, self-serve) | PARITY |
| Differentiator | none | linked "every community" strip (unique) | SURPASS |
| Final CTA | present | photographic CTA band | PARITY |
| Mobile | stacked, full-width CTAs | mobile-first, cost above fold, full-width CTAs | SURPASS |

**No aspect graded BELOW** - no iteration required.

---

## PROVE EVERYTHING (deployed preview)

- **Affordance scan:** 0 dead-end tiles across all 16 public pages.
- **Link integrity:** 0 dead / 292 internal links.
- **axe:** 0 violations on organisers, home, and pricing (footer pages sample),
  desktop + mobile (`footer-organisers/organisers-axe.json`).
- **Gates:** tsc clean, eslint clean (0 errors), vitest 329/329, build clean (both
  commits).
- **Captures** (`footer-organisers/`, gitignored PNGs): footer behaviour at 390
  (each accordion expanded, nothing above moves) + desktop static columns at
  1440/1280/1024; organisers hero + pricing band at 390 + 1440.

## Commits (feat/home-rebuild, NO merge)
- `0976b8f` fix(footer): mobile stacked independent accordions + footer standard
- `2a4bbaa` feat(organisers): pricing clarity + cost above the fold
