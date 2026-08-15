# EventLinqs: For Organisers Landing Page Copy
## Conversion copy for the redesigned organiser page. Version 1.0, 4 July 2026.
## Australian English. No em-dashes or en-dashes. "Community" always.

---

## HOW TO USE THIS DOCUMENT

Each section below maps to a block on the page, in order from top to bottom. Copy is written to slot into the Tab 4 redesign. Anything in [SQUARE BRACKETS] is a placeholder awaiting a founder decision (fees, payout timing, founding offer terms) or real data (testimonials, counts). Do not publish the page with placeholders visible. Two hero options are provided; pick one, A/B test later if traffic allows.

Voice rules applied throughout: plain, confident, specific, no hype words (no revolutionary, no disrupt, no game-changing), short sentences, every claim concrete. The page sells three things in this order: money, ease, local audience. Trust is handled by proof blocks, not adjectives.

---

## 1. HERO

### LOCKED POSITIONING (build side, binding): the page leads with THE EVENT LAUNCH KIT. Hook is verbatim and must not be edited.

**Headline (verbatim, locked):** Build your event, map your room, get your complete promo kit, in minutes. Free.

**Subheadline:** EventLinqs is the Australian ticketing platform built for local organisers. Every event you create comes with its complete promo kit: live event page, print-ready QR poster, social share cards, tracked links, and a live reach panel. One all-in fee of $1.69 on a $20 ticket, and you keep the full $20.

**Primary CTA button:** Build your event
**Secondary CTA:** Join the Founding Organiser Program

**Hero trust strip (small text under the CTAs):** Payments powered by Stripe. Free events are always free. Built and supported in Australia.

### Retired hero options (superseded by the locked positioning, kept for DM and segment language only)

Option A (money-led): "Keep more of every ticket you sell." Use as a DM and email angle for organisers on paid platforms.
Option B (local-led): "Sell out your next event, right here in your city." Use for community-segment DMs.

---

## 2. THE FEE COMPARISON BLOCK

**Section heading:** The maths, out in the open.

**Intro line:** On a $20 ticket, here is what your attendee pays and what you keep.

**Comparison table copy (CLAIMS LAW COMPLIANT: no competitor is named publicly, ever. The comparison is against "your current platform", which the visitor fills in mentally):**

| | EventLinqs |
|---|---|
| Fee on a $20 ticket | $1.69 all-in, one fee with card processing included, shown up front |
| Buyer pays | $21.69 |
| You keep | The full $20.00 |
| Free events | Always free, no fee at all |

**Comparison prompt (under the table):** Pull up what your current platform charges on a $20 ticket, and what it holds back from you. Then compare. We publish our numbers because we are happy for you to.

**Founding organiser line (directly under the table):** Founding organisers pay zero fees for 6 months, and zero means zero: your $20 ticket costs your attendees exactly $20.00.

**Secondary example line (small text under the table):** On a $30 ticket: $2.04 all-in, buyer pays $32.04, you keep the full $30. Fees correct as at [date].

**RETIRED (claims law, 8 July 2026):** the previous version of this table named Eventbrite and Ticketek in public copy. Competitors are never named publicly. Naming a prospect's own current platform inside a private one-to-one DM or email remains acceptable, because that is their platform, not public comparative advertising. The cheapest-all-in claim is also never made: we state our own numbers and invite comparison, we never claim to be the cheapest.

**Line under the table:** No hidden charges. No fee to create an event. There is one fee, card processing is inside it, it is shown to the buyer up front, and in the default setup you keep the full face value of every ticket.

**PRICING ANCHOR RULE (founder directive, 5 July 2026):** every fee example on this page and in every template anchors on a $20 ticket first, with $30 as the secondary example where a second helps. The founding segment is local gigs, comedy, markets and community events priced $15 to $35. Higher-priced examples are banned because they position the platform for expensive events and alienate the exact organisers being recruited. STATUS: RE-DERIVED 15 August 2026 against the PRICING-LOCK block in docs/PRICING.md after the second fee was deleted. There is now ONE fee, pass-on mode default, and card processing comes out of it. The figures above are produced by `node scripts/pricing-derive.mjs --write`; re-derive rather than re-guess if the rate ever moves, and never write a rate into this file.

**COPY SAFETY RULES FROM ENGINEERING (binding on all marketing copy):**
1. These figures are one ticket per order, pass-on mode. The flat component is per ticket, so NEVER multiply a single-ticket row to claim fees for multi-ticket orders. Multi-ticket examples must be recomputed, never extrapolated.
2. "You keep the full face value" is true in pass-on mode (the default) only. In absorb mode the buyer pays face value and fees come from the payout. Never mix the two framings in one claim.
3. All amounts are GST-inclusive; never add or imply a separate GST line.
4. PRE-PUBLISH CHECK: these rates were resolved from the TEST database pricing rules. Confirm production carries identical pricing rules before this page goes live.

**IMPORTANT PRODUCTION NOTE:** competitor fees must be verified against their current published Australian rates immediately before this page goes live, and the table should carry a small "fees correct as at [date]" line. Publishing wrong competitor numbers invites a legal letter and destroys trust in one hit.

**CTA:** Calculate your savings

---

## 3. FOUNDING ORGANISER PROGRAM (the conversion engine)

**Section heading:** The first 50 organisers get the best deal we will ever offer.

**Body copy:**
We are launching in Geelong and Melbourne first, and we are doing it with 50 founding organisers who get in before everyone else.

Here is the deal, plainly: you get 6 months with zero platform fees, and in return we get your honest feedback. One short chat after your first event, a quick survey each quarter, and an open line for the features and ideas you want. You are not just early, you are helping build the platform around organisers like you.

As a founding organiser you get:

- **Zero fees for 6 months, and zero means zero.** There is no second fee left to charge, so on a $20 ticket your attendees pay exactly $20.00 instead of $21.69.
- **Extend it by referring.** Every organiser you successfully refer adds 3 months to your zero-fee period.
- **Free migration.** Send us your event details and attendee list, and we will have your events live within a day. You approve everything before it goes public.
- **A direct line to the founder.** Not a ticket queue. A real person who will fix your problem today.
- **The Founding Organiser badge** on every event you run, permanently.
- **Your feedback, built.** Founding organisers shape the roadmap. When we ship something you asked for, you will know it came from you.

(COPY RULE: the feedback exchange is always framed as light and specific, one chat, one quarterly survey, an open line. It is never presented as a condition that can revoke the zero-fee period, and the free period is never revoked for non-participation.)

**Scarcity line:** [XX] of 50 spots remaining.
(PRODUCTION NOTE: this number must be real and must update. A fake countdown is the fastest way to lose this market's trust.)

**CTA:** Claim a founding spot

---

## 4. HOW IT WORKS (ease)
### STATUS: HELD AS DRAFT. Do not publish until the production feature-claim audit confirms every capability described below (AI description assistant, discovery placement, payout mechanics) is live and working on the platform.

**Section heading:** Live in minutes, not afternoons.

**Three steps:**

1. **Create your event.** Add your details, upload your image, set your tickets. Our built-in assistant helps you write a description that sells and picks the right categories, so a great event page takes minutes.
2. **Share your link.** Sell through your socials, your email list, your posters. Your event also appears in EventLinqs discovery, where locals in your city are browsing for something to do.
3. **Get paid.** Payments run on Stripe, the same infrastructure behind the biggest platforms in the world. Payouts land in your account in [X days].

**CTA:** Create your first event

---

## 5. LOCAL AUDIENCE BLOCK (the density pitch)

**Section heading:** A platform where your neighbours are actually looking.

**Body copy:**
Most ticketing platforms are a national firehose. Your event sits on page nine behind everything happening everywhere. EventLinqs is different by design: we are building city by city, starting with Geelong and Melbourne, so the people browsing the platform are your actual local audience.

Every event you list makes the platform better for every local looking for something to do, and every local browsing makes the platform better for you. That is the point. Local events, local community, local sellouts.

---

## 6. FOR EVERY KIND OF ORGANISER (segment reassurance)
### STATUS: HELD AS DRAFT. Do not publish until the production feature-claim audit confirms each capability named in these cards (registrations, capacity limits, QR check-in, multiple ticket types, early bird pricing, recurring events, session capacities) exists on the platform. Any card whose features fail the audit is cut or rewritten, never fudged.

**Section heading:** Built for the events that make a city worth living in.

**Four short cards (CLAIMS LAW: recurring events, wallet passes, organiser email campaigns, offline check-in and cheapest-pricing claims are banned and must never appear here):**

- **Community groups and clubs.** Free events are always free to run. Registrations, capacity limits, and attendee lists without the spreadsheet chaos.
- **Live music and comedy.** Lineup tagging for your performers, door lists that work, QR check-in, and ticket pages that look as good as the gig.
- **Markets, food and galas.** Reserved seating for any room shape, whole-table booking in one tap, and imagery that does your event justice.
- **Workshops and fitness.** Fast event creation with Magic Start: describe your session in one sentence and the draft builds itself, ready to publish in under a minute.

---

## 7. TRUST AND SAFETY BLOCK
### STATUS: HELD AS DRAFT. Do not publish until the production feature-claim audit confirms payout timing, the attendee data export capability, and the consent handling described below. Trust claims that turn out to be untrue are worse than no trust claims at all.

**Section heading:** Your money and your attendees are safe.

**Body copy:**
- Payments are processed by Stripe, PCI-DSS compliant and used by millions of businesses worldwide. EventLinqs never stores card details.
- Payouts go directly to your nominated account in [X days].
- Attendee data belongs to you. Export your list any time. We never sell it, and we never email your attendees without consent.
- Australian-based support, with founding organisers getting a direct line to the founder.

---

## 8. TESTIMONIAL BLOCK

(PRODUCTION NOTE: leave this section hidden until the first two or three founding organisers have run events, then populate with real quotes, real names, real event photos. Do not launch with invented testimonials under any circumstances. In the interim, this slot can hold a founder note instead:)

**Interim founder note version:**

**Heading:** A note from the founder.

I'm Lawal. I built EventLinqs in Melbourne because local organisers deserve a platform that takes less of their money and gives more back to their community. For our first 50 organisers, I am personally handling migration and support. If something is not right, you message me and I fix it. That is the deal.

**CTA:** Talk to me directly

---

## 9. FAQ

**Do I have to move my whole event calendar across?**
No. Run one event with us and see how it goes. Most organisers move the rest after their first payout.

**What does it cost?**
One fee, with card processing already inside it, shown up front. On a $20 ticket that is $1.69 all-in, and you keep the full $20. There is no separate processing charge and no second fee anywhere. Free events are always free, no fee at all. Founding organisers pay zero fees for 6 months, extendable by 3 months per successful organiser referral.

**When do I get paid?**
[X days] after [purchase / your event]. Payouts go straight to your nominated bank account via Stripe.

**Can you migrate my events from Eventbrite or Humanitix?**
Yes. Founding organisers get migration done for them, free. Send us your event details and attendee list and we will have everything live within a day for your approval.

**What if I need help?**
Founding organisers have a direct line to the founder. Everyone gets Australian-based support that actually responds.

**Is my attendee data mine?**
Yes. Export it any time. We never sell it and never contact your attendees without consent.

---

## 10. FINAL CTA BLOCK

**Headline:** Your next event, more of the money, all of the community.

**Subline:** [XX] founding organiser spots remain in Geelong and Melbourne.

**Primary CTA:** Claim a founding spot
**Secondary CTA:** Create a free event first

---

## 11. SEO AND META (for the production team)

- **Title tag:** Sell Tickets Online in Australia | Low Fee Ticketing for Event Organisers | EventLinqs
- **Meta description:** EventLinqs is the Australian ticketing platform for local organisers. Lower fees, fast payouts, free events always free. Launching in Geelong and Melbourne. Claim a founding organiser spot.
- Target terms to weave naturally (already present in the copy): sell tickets online Australia, event ticketing platform Australia, Eventbrite alternative Australia, low fee ticketing, sell tickets Geelong, sell tickets Melbourne.
- One H1 only (the hero headline). Section headings as H2s.

---

## OUTSTANDING FOUNDER DECISIONS BLOCKING PUBLICATION

1. Standard fee structure, in numbers, for the comparison table and FAQ.
2. Payout timing, in days.
3. Which hero option ships first (recommendation: Option A for the page, Option B language for community-segment DMs).
4. Verification of competitor fee figures immediately before go-live.
5. Production feature-claim audit clearing sections 4, 6 and 7 for publication.

## LOCKED TERMS (do not deviate)

**Claims law, locked 8 July 2026 (build side, binding on every asset):** BETTER claims are made only on creation speed, seating, share-attribution, and check-in integrity, all benchmark-proven. Everything else is claimed as EQUAL at most. No competitor is ever named publicly (naming a prospect's own current platform in private one-to-one outreach is acceptable). Never claim: recurring events, wallet passes, organiser email campaigns, offline check-in, or cheapest all-in pricing. The gig board and performer directory are built but OFF: they are never marketed until the post-launch "performers, bring your numbers" moment. The Event Launch Kit hook is verbatim and unedited: "Build your event, map your room, get your complete promo kit, in minutes. Free."

<!-- ONE-FEE-ALLOW: records what the waiver used to leave behind. -->
**Founding Organiser offer, locked 4 July 2026, amended 5 July 2026 and 15 August 2026:** zero fees for 6 months, and with the second fee deleted that is now literally zero to the buyer rather than the ticket price plus a processing line, extendable by 3 months per successful organiser referral, capped at the first 50 organisers in Geelong and Melbourne, offered in exchange for the organiser's honest feedback (one short chat after their first event, a brief quarterly survey, and an open line for feature and growth ideas). The feedback ask is light and specific, and the zero-fee period is never revoked for non-participation. Every mention of the offer, in this document and in every template, uses this term and no other.

**Pricing anchor rule, locked 5 July 2026, figures RE-DERIVED 15 August 2026:** all fee examples anchor on a $20 ticket as the primary example, $30 as the secondary where a second helps. Exact figures come only from the derived block in docs/PRICING.md section 3, used exactly as given with no rounding into different numbers. STATUS: there is now ONE fee and the second fee is deleted, so every canonical row below changed. Canonical rows: $20 ticket = $1.69 all-in, buyer pays $21.69, organiser keeps $20.00; $30 ticket = $2.04 all-in, buyer pays $32.04, organiser keeps $30.00; founding period $20 ticket = $20.00 to the buyer, because the waiver now takes the whole fee to zero. Binding caveats: single-ticket, pass-on mode figures only, never extrapolated to multi-ticket orders; "keep full face value" claims apply to pass-on mode only; never imply a separate GST line and never name a processing fee; confirm production pricing rules match the lock block before anything publishes.
