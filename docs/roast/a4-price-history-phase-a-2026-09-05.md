# Roast: A4, price history on the event page, and the close of Phase A

Written 5 September 2026 before adjudication, from the brief's literal text
(C:\dev\BUILD-BRIEF.md, A4 and the Completion Law) and Scope v5 section 3.3.

## Phase 1: the requirement ledger

| # | Requirement (verbatim or split) | Source |
|---|---|---|
| 1 | "A4. 3.3 Price history shown on the event page." | Brief, Phase A |
| 2 | "Price history visible on event page so buyers can see how pricing has moved, reinforcing transparency." | Scope v5 3.3 |
| 3 | Completion law 1: migration written, applied to TEST, verified by querying it back | Brief |
| 4 | Completion law 2: built, typechecked, linted, no silent catches | Brief |
| 5 | Completion law 3: real tests added; the suite grows and the canary baseline is raised in the same commit | Brief |
| 6 | Completion law 4: a registered blocking guard for an invariant that could silently break, PROVEN red and green, both outputs shown | Brief |
| 7 | Completion law 5: DRIVEN in a real browser as a real organiser or attendee at 390, 768 and 1440, screenshots under C:\dev\EVIDENCE\A4\ | Brief |
| 8 | Completion law 6: the FULL gate set green after the item: build, every guard, the complete suite, lint, typecheck, axe zero at every impact on affected surfaces, Lighthouse; anything the item broke is fixed inside the item | Brief |
| 9 | Completion law 7: committed, Australian English, no trailers, pushed | Brief |
| 10 | "The item is not finished until production deploys green with it included." | Brief, DRIVEN |
| 11 | DRIVEN: through the same UI a real person sees; no API call, no direct database write, no harness shortcut | Brief, DRIVEN |
| 12 | DRIVEN: a journey that passes only because a script seeded state a real user could not create FAILS | Brief, DRIVEN |
| 13 | Never write to production; every migration to TEST vkapkibzokmfaxqogypq only; read the ref back | Brief, laws |
| 14 | Disk floor 5 GB never breached; free space logged at the start and end of the item | Brief, laws |
| 15 | Park .env.local around every push and restore it | Brief, laws |
| 16 | Australian English, no em dashes, no en dashes, no hyphens surrounded by spaces, no exclamation marks in copy, never the banned community word | Brief, CLAUDE.md Copy |
| 17 | Lawal is sole author: zero AI trailers in every commit (Law 8) | Brief, CLAUDE.md |
| 18 | Design system inherited exactly: no new colour, size or type; light cards; gold eyebrow; Lucide only (Law 1, Design system) | CLAUDE.md |
| 19 | Law 5: zero dead links on the surfaces touched | CLAUDE.md |
| 20 | Law 7: no competitor claim without a cited primary source, otherwise UNSOURCED | CLAUDE.md |
| 21 | Law 10: every founder step scripted, reserved or impossible, with a verdict | CLAUDE.md |
| 22 | After every PHASE: run brief-roast against the phase's requirements; write MET / PARTIAL / NOT MET into BUILD-LEDGER.md; anything not MET is finished before the phase closes | Brief, SELF REVIEW |
| 23 | Push BUILD-LOG.md, REVIEW-QUEUE.md and BUILD-LEDGER.md to ops/session-log after every item | Brief, WHAT LAWAL REVIEWS |
| 24 | Phase A as a whole: A1, A2, A3, A4 each finished under the completion law | Brief, Phase A |

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | src/components/features/events/price-history-panel.tsx rendered under the ticket panel by src/app/events/[slug]/page.tsx in the seated, sold out and general admission branches; the stranger's screenshots at three viewports, docs/verification/journeys-2026-08-28/a4-price-history/*/46-a-stranger-reads-the-price-history.png |
| 2 | MET | The drive's verdicts 42 to 44 at every viewport: current price 40.00, "Up from AUD 28.00" under it, entries "Listed at AUD 30.00", "Lowered to AUD 28.00", "Rose to AUD 40.00 at 50% sold", summary "changed 2 times". A buyer sees every move, its direction and its date |
| 3 | MET | supabase/migrations/20260904000002_ticket_price_history.sql applied to vkapkibzokmfaxqogypq with the ref read back (C:\dev\EVIDENCE\A4-migration-push.txt, A4-migration-readback.txt); scripts/verify/ticket-price-history-schema-verify.mjs 13 of 13 (C:\dev\EVIDENCE\A4-schema-verify-test.txt) |
| 4 | MET | build-4: 61 of 61 guards PASS including no-silent-catch, compiled, BUILD_EXIT=0 (C:\dev\EVIDENCE\A4\build-4.txt); typecheck clean and lint clean in the pre-push hook on 7dbd4200 and f16a499f (A4-push-checkpoint-4.txt, A4-push-evidence-2.txt) |
| 5 | MET | Seven files, 68 tests: price-history (21), dynamic-pricing-steps (6), read-price-history (4), save-dynamic-pricing-action (6), ticket-price-history-migration (11), guards/price-history-integrity (8), a11y/light-surface-text-tokens (5), plus schema-ahead-of-code +2 and guard-registry +1. Canary 264/3114 to 270/3177 in 0da757d0 and 271/3182 in 7dbd4200, each in the commit that added the files; the hook measured 271 files / 3182 tests, 0 failed |
| 6 | MET | scripts/guards/price-history-integrity.mjs registered in run-guards.mjs; red on the old direct delete in the action and green after (C:\dev\EVIDENCE\A4-guard-price-history-integrity-proof.txt); schema-ahead-of-code green against TEST with ticket_price_history.id in the manifest (A4-guard-schema-ahead-proof.txt); no-plaintext-credential red on the committed literal and green on the minted password (A4-guard-no-plaintext-credential-proof.txt) |
| 7 | MET | drive-all on build-4 of 7dbd4200: desktop-1440, tablet-768 and mobile-390 each 20 of 20, 0 blockers, 0 server errors; 19 screenshots per viewport under C:\dev\EVIDENCE\A4\ and committed as f16a499f. The organiser resets the password through the real forgot-password path on the local production server, the two buyers pay with the test card on the Vercel preview of the same commit, the stranger reads the local server. See the adversarial pass on the origin |
| 8 | PARTIAL | Build 61 of 61, suite 271/3182, lint, typecheck: green. axe on build-4: 6 scans at 390 and 1440, 0 violations at any impact (C:\dev\EVIDENCE\A4\axe-run.txt); the one violation build-3's scan found was fixed inside the item (7dbd4200). Lighthouse median of three on the preview, local server stopped: desktop 98, mobile 66, accessibility 100 on both (C:\dev\EVIDENCE\A4\lighthouse-run.txt). MOBILE 66 IS BELOW THE 95 LAW. It is the same figure A3 measured on the same page type (66, 68) and A2 (78) and is the platform-wide client shell of the founder's 25 August ruling (Issue #42); the block is a server component with no script of its own. Not closable inside A4 |
| 9 | MET | 0da757d0, d72899b5, 59497321, 7dbd4200, f16a499f, each pushed through the hook; the messages carry no Co-Authored-By, no "Generated with", no robot emoji; the no-ai-authorship guard PASSES in build-4 |
| 10 | PARTIAL, by design | Production CANNOT deploy A4 until the founder applies 20260904000002 to gndnldyfudbytbboxesk (RESERVED under Law 10, Migrations); the schema-ahead-of-code guard names ticket_price_history.id ABSENT on production and refuses the production build until then, rather than 500 every event page. Same shape as A2 and A3. The code is merge-ready: PR #124 green on 7dbd4200 |
| 11 | MET | Every step is a click, a keystroke or a card number in a real Chromium: the reset form, the wizard, the edit form, the Pricing tab, the switch and the step fields, Get tickets, +, Checkout, the Stripe frame, Pay. The only non-UI reads are verdicts (rows on TEST), never actions |
| 12 | MET, with the fact stated | The organiser account is the Stripe-connected fixture already on TEST (owner_1781981785246@example.com). A real organiser reaches that state through Stripe Connect onboarding, which journeys 7 to 10 proved on 2 September; the password was NOT known and was reset through the real path. Nothing else was seeded |
| 13 | MET | Every migration command was run linked to vkapkibzokmfaxqogypq with the ref read back; the journey, the probe and the verify script each refuse the production ref by reading NEXT_PUBLIC_SUPABASE_URL; production received no write at any point in A4 |
| 14 | MET | 8.39 GB at the start of the session, 8.71 before the rebuild, 13.29 at the close; never under 5 |
| 15 | MET | Every push in this session used the try/finally park; ".env.local present: True, parked present: False" printed after each |
| 16 | MET | Sweep over the six A4 user-facing files: 0 em or en dashes, 0 uses of the banned word, 0 exclamation marks in copy, 0 tell words in copy (the four hits in access-code-input.tsx are the identifiers onUnlocked and unlockedTierIds, not text). Dates render en-AU ("5 Sept 2026") |
| 17 | MET | As row 9 |
| 18 | MET | The panel uses SectionHeader (gold eyebrow), the house rounded-2xl white card with border-ink-200, tabular numerals, Lucide Tag, ArrowDownRight and ArrowUpRight; the scarcity line moved to text-error-strong, an existing token, rather than any new colour |
| 19 | MET | The Pricing tab and the Dynamic pricing quick action resolve to /dashboard/events/[id]/pricing (drive verdicts 23 and 24 at every viewport); the Overview link resolves back; axe reports 0 non-200 loads |
| 20 | MET, as UNSOURCED | docs/benchmark/competitor-2026/INDEX.md and docs/design/competitor-page-specs.md carry no price history surface on any captured Ticketmaster or Eventbrite page. Whether either shows one today is UNSOURCED here: no primary page was fetched in A4, and no claim is made beyond the captures |
| 21 | MET | Four founder items, each with a verdict in C:\dev\REVIEW-QUEUE.md: the production migration (RESERVED, one command), stripe login (IMPOSSIBLE for a machine, optional, one command proves it), the no-plaintext-credential regex hole (a decision, sized), the event page's five-minute ISR window (a decision, sized) |
| 22 | MET | This file; the ledger rows in C:\dev\BUILD-LEDGER.md |
| 23 | MET | push-build-log.ps1 run at the close of A4 |
| 24 | PARTIAL | A1 MET in full. A2, A3 and A4 each MET on laws 1 to 5 and PARTIAL on 6 (mobile Lighthouse, platform-wide) and 7 (production deploy waits on the founder's migrations). The two PARTIALs are the same two across all three items and neither is work I can finish: one is reserved by law, the other is a founder-ruled platform close |

## Phase 3: the adversarial pass

**Silent drops.** None found. The brief's A4 line is one sentence and the scope's is one; both are rows 1 and 2. The externally ticketed branch of the event page shows no block, because it shows no price; that is stated in the plan and is not a drop.

**Interpretation drift.** Two places where the task changed shape, both stated rather than reworded. (a) "Price history" was read to include dynamic-pricing steps crossed as tickets sold, not only the organiser's edits; that is a superset, and the drive proves both kinds. (b) The two buyers pay on the Vercel preview rather than the local production server. The UI is identical, the database is the same TEST project, and the reason is a credential the local machine cannot hold; the alternative was a paid leg that could not run at all. Every buyer line prints the origin. This is not an easier task; it is the same task on a real deployed surface.

**Match versus surpass.** The captured Ticketmaster and Eventbrite event pages show a current price and nothing about how it moved. On that evidence EventLinqs is AHEAD: a buyer sees every move, its direction, its date and the reason a dynamic step rose. Against the live sites today the claim is UNSOURCED, and it is not made.

**Unverifiable claims.** "A buyer sees how pricing has moved": falsified if the stranger's page lacked the entries; tested, verdicts 42 to 44. "Saving steps never records a spurious flip": falsified by a history row after save_dynamic_pricing; tested by the schema verify (two steps saved and cleared, no row) and drive verdict 30. "An edit that re-creates every tier keeps the history": falsified by a second listed row; tested by drive verdict 20 (exactly two entries after the edit). "The checkout charges the price the page shows after a step": falsified if buyer B's order item differed from 4000; tested, verdict 41. "No coral text on the white card": falsified by axe; tested, build-4 scan 0 violations.

**The generic test.** The block is the house SectionHeader eyebrow "PRICE HISTORY" over "How the price has moved", the ink-200 card, the tabular numerals, the closing line "Prices lock when you reserve, so what you see at checkout is what you pay", which is the platform's own reservation rule in words. It could not sit on Ticketmaster or Eventbrite, which do not have the rule.

**AI-tell sweep.** 0 em dashes, 0 en dashes, 0 exclamation marks, 0 uses of the banned word, 0 tell words across the six A4 user-facing files.

**Regression sweep, DESIGN-LOCK.** Existing elements changed that the brief did not name, each kept for a stated reason rather than reverted: (1) the ticket selector's "Only N left" line, coral-500 to text-error-strong, because axe measured 3.28:1 on the white card and no coral token clears 4.5:1 there; (2) the access-code refusal beside it, coral-600 to text-error-strong, same defect; (3) the event overview gained a Pricing tab and a Dynamic pricing quick action, because the pricing screen was unreachable by mouse (Law 5); (4) the pricing screen gained an Overview link back; (5) saveDynamicPricing moved from three auto-committed statements onto one RPC, behaviour preserved, so the deferred triggers judge one final state. No hero, spacing, chrome, colour token or copy elsewhere changed.

**Founder-cost test.** No dashboard step is handed over that a machine could take: the migration apply is reserved by his own ruling; stripe login is a browser OAuth only he can complete and is optional; the guard hole and the ISR window are decisions about ordering and design. No question in the queue could have been answered by reading the code.

**Evidence-visibility test.** 57 screenshots at three viewports committed under docs/verification and copied to C:\dev\EVIDENCE\A4; the axe, Lighthouse, build, guard, schema and push outputs at named paths; the probe's four screens.

**Found and recorded, not pulled in (each in the review queue).** The no-plaintext-credential regex hole (20 sites if widened). The event page's ISR window: for up to five minutes after a purchase the availability pill, the price and the history can lag the checkout, by the page's existing design at src/app/events/[slug]/page.tsx:85; the checkout resolves the true price at reservation, which the drive proved.

## Phase 4: the gate

NOT MET: 0. PARTIAL: 3 (rows 8, 10, 24), all the same two causes: mobile Lighthouse on the platform-wide client shell (founder-ruled, Issue #42) and production deployment waiting on migrations the founder applies himself. Unresolved adversarial findings: 0. Neither PARTIAL is finishable by me inside the item, so the report leads with UNFULFILLED and names what unblocks each.

## Phase 5: decision evidence (showing a price history to buyers)

| Dimension | Evidence |
|---|---|
| Competitor | The 2026 captures of Ticketmaster and Eventbrite event pages show no price history. Live behaviour today: UNSOURCED |
| Market | UNSOURCED. No primary source on buyer expectation of price transparency was fetched in A4 |
| Engagement | UNSOURCED. No conversion evidence for a price-history display exists on this platform yet |
| Trend | UNSOURCED |
| Our code | Dynamic pricing existed with nothing recording a price (src/app/actions/dynamic-pricing.ts, get_current_tier_price); the history is now written by the database only (20260904000002) and read by one reader (src/lib/pricing/read-price-history.ts) |
| Test plan | When D5 (PostHog) lands: checkout initiations over event page views, pages with a moved price and the block against a variant without it, over one month. Until then the block ships on the scope's own instruction, and the variant to test later is named here |
