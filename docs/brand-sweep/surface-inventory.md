# Public Surface Inventory

Date:    2026-05-02
Source:  src/app/**, src/components/layout/**, src/components/templates/**, src/lib/help-content.ts, src/lib/hero-categories.ts, src/lib/content/**, email builders in src/app/api/webhooks/stripe/route.ts and src/lib/waitlist/promote.ts.
Goal:    Enumerate every customer-facing surface that owns brand copy. This is the workload for Phase 4. Every row that says "diaspora present" or "non-locked positioning" must move to "culture-first" by the end of Phase 4.

Notation:
- "Public" means the surface is reachable without authentication, OR it is shown to authenticated users as part of the consumer / organiser brand experience (for example, the dashboard onboarding card and the order confirmation page are authenticated but still in scope).
- "Internal-only" surfaces (admin panels, debug pages, dev previews) are out of scope and intentionally omitted.
- "diaspora?" column is `Y` if the file currently contains the literal string "diaspora" in any form, `N` otherwise. Confirmed via grep on 2026-05-02.

---

## Phase 4 Batch 1: Homepage and template

| File                                                            | Role                                                  | diaspora? | Notes                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| src/app/page.tsx                                                | Homepage: hero, rails, organiser pitch                | Indirect  | Imports from hero-categories and section-skeletons which contain "diaspora". Hero itself reads "WHERE THE CULTURE GATHERS" (legacy positioning). Must adopt locked hero "Every culture. Every event. One platform." |
| src/components/features/home/cultural-picks-section.tsx         | Cultural rail section                                 | Y         | Line 70 "Made for the diaspora" must go.                                |
| src/components/features/home/section-skeletons.tsx              | Skeleton/empty placeholder for rails                  | Y         | Line 64 "Made for the diaspora" must go.                                |
| src/components/features/events/featured-event-hero.tsx          | Featured event hero                                   | Y         | Verify and replace.                                                     |
| src/lib/hero-categories.ts                                      | Hero category metadata source                         | Y (heavy) | 18+ lines reference diaspora. Replace with culture-first descriptions tied to the locked cultures list. |
| src/lib/content/category-highlight-slides.ts                    | Category highlight slide copy                         | Y         | Lines 27, 53 must go.                                                    |
| src/lib/images/category-photo.ts                                | Image query keywords                                  | Y         | Line 17 query parameter; replace keyword without breaking image lookup. |

## Phase 4 Batch 2: Browse, category, city

| File                                                  | Role                                                | diaspora? | Notes                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| src/app/events/page.tsx                               | Browse-all-events page                              | N         | Verify hero, filter labels, empty states match voice.md.                                                |
| src/app/events/browse/[city]/page.tsx                 | City-specific browse                                | N         | Verify city-page hero, meta, empty state.                                                              |
| src/app/categories/[slug]/page.tsx                    | Culture/category browse                             | N         | Verify the category labels render the locked cultures list correctly with middle-dot separators.       |
| src/app/events/[slug]/page.tsx                        | Single event page                                   | N         | Verify all CTAs (Get tickets, Save, Share) match approved CTA verbs.                                   |
| src/components/ui/location-picker.tsx                 | Global location picker                              | Y         | `showDiaspora` state and "Global diaspora cities" label at line 447. Rename to "Global cities" and the prop accordingly. |
| src/lib/locations/picker-cities.ts                    | Picker city data                                    | Y         | Lines 17 and 54 are comments. Internal but still must go (em-dash/diaspora memory rule).                |
| src/lib/locations/launch-cities.ts                    | Launch city list                                    | Y         | Line 4 comment. Same as above.                                                                          |

## Phase 4 Batch 3: Organiser, pricing, about, contact, careers, press, blog

| File                                                            | Role                                                   | diaspora? | Notes                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------- |
| src/app/organisers/page.tsx                                     | Organiser landing                                      | N         | Verify hero matches "Sell tickets. Keep more." Includes 5 bullets per voice.md.             |
| src/components/templates/OrganisersLandingPage.tsx              | Organiser landing template                             | Y         | Lines 220 and 232 reference diaspora. Replace with culture-first organiser pitch.           |
| src/app/organisers/signup/page.tsx                              | Organiser signup                                       | N         | Verify intro and form labels.                                                                |
| src/app/pricing/page.tsx                                        | Pricing page                                           | N         | "All-in pricing. No surprise fees." trust line goes here.                                    |
| src/app/about/page.tsx                                          | About page                                             | Y         | Line 7 description. Lede must use locked sub-tagline. Mission paragraph must list cultures. |
| src/app/contact/page.tsx                                        | Contact page                                           | N         | Verify intro and form labels.                                                                |
| src/app/careers/page.tsx                                        | Careers page                                           | N         | Verify intro and culture/values copy.                                                        |
| src/app/press/page.tsx                                          | Press page                                             | N         | Verify positioning paragraph and quotes.                                                     |
| src/app/blog/page.tsx                                           | Blog index                                             | Y         | Line 7 description. Replace.                                                                 |

## Phase 4 Batch 4: Help and FAQ

| File                          | Role                  | diaspora? | Notes                                                                                                  |
| ----------------------------- | --------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| src/app/help/page.tsx         | Help index            | N         | Verify intro line.                                                                                      |
| src/app/help/[slug]/page.tsx  | Help article          | N         | Verify intro line, related-article block.                                                               |
| src/lib/help-content.ts       | Help content source   | Y         | Lines 42 and 74 reference launch-market framing tied to diaspora. Replace with culture-first phrasing. |

## Phase 4 Batch 5: Legal preambles

| File                                                  | Role                  | diaspora? | Notes                                                                       |
| ----------------------------------------------------- | --------------------- | --------- | --------------------------------------------------------------------------- |
| src/app/legal/terms/page.tsx                          | Terms of Service      | N         | Update preamble paragraph only. Substantive legal text untouched.           |
| src/app/legal/privacy/page.tsx                        | Privacy Policy        | N         | Update preamble paragraph only.                                              |
| src/app/legal/cookies/page.tsx                        | Cookies Policy        | N         | Update preamble paragraph only.                                              |
| src/app/legal/refunds/page.tsx                        | Refunds Policy        | N         | Update preamble paragraph only.                                              |
| src/app/legal/organiser-terms/page.tsx                | Organiser Terms       | N         | Update preamble paragraph only. Trust line "All-in pricing" appears here.    |

## Phase 4 Batch 6: Auth, error, empty states

| File                                              | Role                                                       | diaspora? | Notes                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| src/app/(auth)/login/page.tsx                     | Login                                                      | N         | Verify hero copy and helper text.                                       |
| src/app/(auth)/signup/page.tsx                    | Signup                                                     | N         | Verify hero copy.                                                       |
| src/app/(auth)/forgot-password/page.tsx           | Forgot password                                            | N         | Verify body copy.                                                       |
| src/app/(auth)/verify-email-sent/page.tsx         | Email-verification confirmation                            | N         | Verify body copy.                                                       |
| src/app/auth/reset-password/page.tsx              | Password reset                                             | N         | Verify body copy.                                                       |
| src/app/not-found.tsx                             | Global 404                                                 | N         | Replace stock 404 with voice-doc-compliant copy.                         |
| src/app/orders/[order_id]/confirmation/page.tsx   | Post-purchase confirmation                                 | N         | "You're in" replaces "Thank you for your purchase!"                     |

(The codebase does not currently have a top-level `error.tsx` file. The 500-state copy in voice.md will be added when the file is created in a later sprint; out of scope for Phase 4.)

## Phase 4 Batch 7: Email templates

| File                                                              | Role                                                  | diaspora? | Notes                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| src/app/api/webhooks/stripe/route.ts (buildConfirmationEmailHtml) | Order confirmation HTML                               | N         | Subject "Order Confirmed:" must become "Your tickets for {event} {date}". Body: "You're in." opener. |
| src/lib/waitlist/promote.ts (buildPromotionEmailHtml)             | Waitlist promotion HTML                               | N         | Subject "A spot opened up." OK. Body must match voice.md tone.                         |

(EventLinqs does not currently have a `src/emails/` directory or `src/lib/email/` module. Email HTML lives inline. Phase 4 batch 7 will edit the inline builders; a future M-series may extract them into a templates module.)

## Phase 4 Batch 8: Meta, footer, dashboard chrome, seed data

| File                                          | Role                                                 | diaspora? | Notes                                                                                |
| --------------------------------------------- | ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| src/app/layout.tsx                            | Root meta (og:title, og:description, twitter cards)  | N         | Update meta to locked hero / sub-tagline.                                            |
| src/components/layout/site-header.tsx         | Public header                                        | N         | Verify nav labels and search placeholder.                                            |
| src/components/layout/site-header-client.tsx  | Public header (client)                               | N         | Same as above.                                                                       |
| src/components/layout/site-footer.tsx         | Public footer                                        | Y         | Reshape into Humanitix four-column shape per findings.md Q4. Trust line "All-in pricing. No surprise fees." appears here. |
| src/components/layout/bottom-nav.tsx          | Mobile bottom nav                                    | N         | Verify labels.                                                                        |
| src/components/layout/nav-search.tsx          | Nav search                                           | N         | Verify placeholder.                                                                   |
| src/components/layout/PageHero.tsx            | Reusable page hero                                   | N         | Verify default copy.                                                                  |
| src/app/(dashboard)/dashboard/page.tsx        | Organiser dashboard root                             | N         | Verify hero, empty states, success/celebration copy.                                  |
| src/components/organiser/connect-onboarding-card.tsx | Stripe Connect onboarding card                | N         | Verify all 5 capability states match the tone-in-product table for the Connect block. |

(No JSON / seed-data files in scope contain "diaspora" outside the source files already listed in batches above. The `supabase/seed/` directory is empty as of this commit. If seed data lands later, it joins this batch.)

## Out-of-scope surfaces (intentionally excluded)

| File                                                            | Why excluded                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| src/app/dev/logo-preview/page.tsx                               | Internal dev preview. Never linked from public nav.                                                            |
| src/app/dev/shell-preview/page.tsx                              | Internal dev preview. Never linked from public nav.                                                            |
| src/app/dev/connect-onboarding-preview/route.ts (and its body)  | Internal dev preview for visual regression.                                                                    |
| src/app/(dashboard)/dashboard/insights/page.tsx                 | Authenticated organiser analytics. Functional dashboard, not brand surface.                                    |
| src/app/(dashboard)/dashboard/events/[id]/orders/...            | Authenticated organiser order management. Functional, not brand surface.                                       |
| src/app/(dashboard)/dashboard/events/[id]/discounts/page.tsx    | Authenticated organiser feature. Functional.                                                                   |
| src/app/(dashboard)/dashboard/venues/...                        | Authenticated organiser feature. Functional.                                                                   |
| src/app/(dashboard)/dashboard/payouts/page.tsx                  | Authenticated organiser feature. Functional.                                                                   |
| src/app/(dashboard)/dashboard/tickets/page.tsx                  | Authenticated user's tickets list. Could be in scope for tone polish in a later sweep; out of scope for M6.5. |
| src/app/queue/[slug]/page.tsx                                   | Functional queue page. Out of scope for brand sweep but recipient of voice.md tone in a future polish.         |
| src/app/squad/[token]/...                                       | Functional squad-buy flow. Out of scope for brand sweep.                                                       |
| src/lib/supabase/public-client.ts                               | Internal. Contains the only em-dash in the codebase (line 14 dev comment). Will be repaired in Phase 5 grep.   |

## Internal-only items that still need touching for compliance

These do not ship to public surfaces but contain the words "diaspora" or em-dashes and so must be cleaned to satisfy the mandate's verification gates.

| File                                       | Issue                                | Resolution                            | Phase |
| ------------------------------------------ | ------------------------------------ | ------------------------------------- | ----- |
| src/lib/locations/picker-cities.ts         | Comment with "diaspora"              | Rewrite comment as "global cities"    | Batch 2 |
| src/lib/locations/launch-cities.ts         | Comment with "diaspora"              | Rewrite comment                       | Batch 2 |
| src/lib/supabase/public-client.ts (line 14)| Em-dash in developer comment          | Replace with comma                    | Phase 5 sweep |

## Volume summary

- Public surfaces touched in Phase 4: **40 files** spanning 8 batches.
- Files containing "diaspora" today: **15** (per Grep on 2026-05-02). After Phase 4: **0**.
- Em-dashes in `src/`: **1** (developer comment). After Phase 5: **0**.
- New surfaces created during Phase 4: **0**. The mandate is rewrite-only, not feature-add.

## Definition of done for Phase 4

A batch is complete when:

1. Every file in the batch reads in voice.md tone.
2. `git grep -i diaspora -- src/` against files in the batch returns zero matches.
3. `rg -nP '[\u2014\u2013]' -- src/` against files in the batch returns zero matches.
4. The locked hero, sub-tagline, mission lede, cultures list, and trust line render exactly as voice.md specifies on the appropriate surfaces.
5. The batch passes `pnpm typecheck` and `pnpm lint`. (Existing pre-existing lint issues are not introduced by the batch.)
6. The commit message matches the mandate-prescribed message for the batch.

Phase 5 verification re-runs all six checks across all batches together.
