# Platform benchmark matrix - 2026-07 (pre-founder-review audit)

Method: for every axis, the STRONGEST documented competitor experience is
benchmark number one, studied strictly as a user via public help centres,
pricing pages and partner documentation (Ticketmaster, Eventbrite, Humanitix,
DICE; concepts only, no competitor code or assets, none named on customer
surfaces). "Ours" is what is live on the launch line, with evidence. Verdicts:
BETTER / EQUAL / BEHIND. Every BEHIND carries a founder-readable disposition;
none is silent.

| # | Axis | Strongest documented competitor experience | EventLinqs | Verdict | Evidence |
|---|---|---|---|---|---|
| 1 | Event creation + publish speed | Eventbrite AI-assisted creation: title/location/date in, AI drafts summary, description, image, category "in seconds"; ~30% faster first event ([EB press](https://www.eventbrite.com/blog/press/newsroom/eventbrite-introduces-ai-powered-tools-to-empower-creators-and-reimagine-event-marketing/)) | Magic Start: one typed (or SPOKEN - voice input) description builds the full draft; wizard to publish in minutes; publishing delivers the Launch Kit (live link, print-ready QR poster, tracked sharing, reach numbers) on one screen. Proven 10/10 publish-bulletproof + persona C this audit | BETTER (voice input + the publish payoff no competitor documents: a launch kit) | `docs/verification/publish-bulletproof-2026-07-10/`; persona C run (`docs/audit/personas-2026-07-11/`) |
| 2 | Reserved seating | Eventbrite self-serve map builder (sections, tables, tiered pricing, live sold-map); Humanitix post-sale move-an-attendee + reusable templates ([EB](https://www.eventbrite.ca/help/en-ca/articles/683914/how-to-set-up-a-reserved-seating-event/), [Humanitix](https://help.humanitix.com/en/articles/8905642-complete-guide-how-to-build-a-seating-map)) | Full builder (rows/tables/zones/scenery/accessible seats/relabel/notes), buyer map with best-available + atomic holds + whole-table booking, post-sale: organiser move WITH holder notification, buyer self-move, organiser-assigns mode, safe live-chart sync. Zero BEHIND in the feature-level comparison | BETTER (three post-sale mechanics + notification edge no competitor documents) | `docs/seating/humanitix-supremacy-comparison.md`; `docs/seating/evidence-assign-mode-2026-07-11/`; personas B + C |
| 3 | Checkout + fee transparency | Humanitix: published per-currency fee schedule, all-in price display since Aug 2024, absorb/pass/split choice, free events free ([pricing](https://humanitix.com/au/pricing)) | Published rates (3.5% + $0.99 platform, 2.5% processing), ACCC all-in total at FIRST CLICK on the ticket selector (persona A: "Checkout - AUD 27.50"), live payout calculator + what-we-publish disclosure table on /pricing, absorb/pass per event, free events free. displayed == charged by construction (one fee source) | EQUAL (parity on all-in + published rates; never claim cheaper than the leader all-in - our extra is the live calculator + single-source guarantee) | `docs/FEE-SYSTEM.md`; persona A a-03/a-04 captures |
| 4 | Ticket delivery + management | Ticketmaster: app + Apple/Google Wallet NFC passes, account-to-account transfer; DICE in-app transfer/refund wait-list; Humanitix no-login self-serve name changes ([TM](https://help.ticketmaster.com/hc/en-us/articles/9612381551761)) | Instant email QR + bearer ticket page (guest-friendly, no app or login forced), My Tickets, self-serve transfer with secret rotation (old code provably dies), buyer self-move of seats, refunds through the funds-holding engine | EQUAL day-one (no forced app beats DICE's app-lock for accessibility; transfer + self-service parity), BEHIND on native wallet passes | Personas A + B; `docs/verification/seated-attachment-2026-07-11/` (transfer stage) |
| 5 | Organiser dashboard + analytics | Eventbrite: sales summary, attendee reports with configurable columns, 1M+-row CSV/Excel exports, cross-event combined reporting ([EB](https://www.eventbrite.co.uk/help/en-gb/articles/187426/how-to-create-and-export-a-sales-summary-report/)) | Live per-event dashboard (sales, revenue, attendee list + CSV export with consent column), Fill-the-room reach panel (going, followers, share signups - the demand made visible), seat inventory room view, payout statements | EQUAL at launch scale, BEHIND on enterprise reporting depth (cross-event combined reports, custom report builder) | Persona D; organiser reporting (PR #63); Fill the room (surpass evidence) |
| 6 | Discovery + event pages | DICE: 40%+ of sales via personalised feed + push (documented to promoters); Eventbrite: event-page SEO strength ([DICE partners](https://dice.fm/partners)) | Both angles built: demand engine (taste graph, /feed, follows, web push ~5x email, who's-going) AND the SEO spine (Schema.org Event on every page, clean URLs, sitemap, community-by-city programmatic pages). DICE's discovery is app-locked with a weak web surface; ours is web-native and indexable | EQUAL on capability (the engines exist and are live); the leader's PROVEN 40% is earned audience at scale - never claimed, earned post-launch | `docs/MOAT-DEMAND-ENGINE-PLAN.md`; growth-engine build evidence; sitemap + structured data |
| 7 | Share + promotion tooling | Eventbrite: named tracking links with attributed sales, promo codes, built-in email campaigns with documented daily caps (250 free / 2,000-10,000 paid) ([EB](https://intercom.help/eventbrite-marketing/en/articles/7239837-set-up-promotional-tracking-links)) | Attributed tracked links on every surface (event, confirmation, kit, per-artist), share-a-ticket buyer loop with per-link join tracking (NO competitor documents a buyer-side attributed share loop), QR poster kit, OG invitation cards, artist-link attribution proven live this audit | BETTER on attribution + the acquisition loop; BEHIND on organiser email-campaign tooling | Persona E; artist attribution proofs; Launch Kit evidence |
| 8 | Check-in | Humanitix for Hosts: QR scanning, shareable scan access, explicit OFFLINE mode - which their own docs say cannot deduplicate across offline devices (double admission possible) ([Humanitix](https://help.humanitix.com/en/articles/8950925-check-in-your-guests-with-the-humanitix-for-hosts-app)) | Web scanner (no app install), ATOMIC admit-once (compare-and-set: a ticket can never admit twice, proven under concurrency), seat shown on the ADMIT panel resolved live (post-move scans show the new seat), manager-role scan access | BETTER on integrity (their documented offline gap is our proven guarantee); BEHIND on offline operation | Launch-hardening evidence; scan RPC seat_label |

## Dispositions for every BEHIND (none silent)

1. **Axis 4, native wallet passes (Apple/Google).** Post-launch enhancement,
   founder-visible on the roadmap. Day one, the email QR + bearer page covers
   every buyer including guests without forcing an app or account (an
   accessibility edge over the leader's app-lock). Wallet passes are additive
   delivery polish, not a launch gate: no purchase, entry, or transfer journey
   is blocked without them.
2. **Axis 5, enterprise reporting depth.** The launch market is the first 25
   to 50 concierge-onboarded organisers (growth plan lever 1); every report
   they need day one (sales, attendees, exports, reach, payouts) is live. A
   cross-event report builder serves multi-brand enterprises we do not yet
   court, and is scheduled with the post-launch agentic growth engine
   workstream, where reporting is a core surface.
3. **Axis 7, organiser email campaigns.** Deliberate sequencing, not absence:
   the data-ownership wedge means the organiser OWNS their attendee list
   (export with consent column, proven) and can campaign from any tool today,
   uncapped - the leader caps free-tier sends at 250/day. The native
   lifecycle/campaign engine is the named post-launch workstream
   (`docs/MOAT-DEMAND-ENGINE-PLAN.md` phases 3-5, agentic growth engine).
4. **Axis 8, offline check-in.** The concierge launch venues (Geelong and
   Melbourne music rooms) operate with connectivity; the atomic admit-once
   guarantee is judged worth more than an offline mode whose reference
   implementation documents double admission as a known failure. Offline
   caching with reconciliation is routed to post-launch hardening with that
   integrity bar kept.

## Summary

- BETTER: 4 axes (creation/publish, seating, share/promotion, check-in integrity)
- EQUAL: 3 axes (fees transparency, delivery/management, discovery capability)
- BEHIND: 0 unexplained; 4 sub-capabilities dispositioned above with founder-readable reasoning
