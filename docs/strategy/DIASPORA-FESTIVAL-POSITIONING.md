# EventLinqs — Diaspora Festival Positioning

**Question:** is Wizkid/Davido/Burna Boy tier festival targeting the right positioning for EventLinqs? What does it require? How does it fit the narrow-first principle?
**Author:** Lawal Adams with Claude
**Date:** 15 April 2026
**Status:** Strategic evaluation — informs M11/M12 planning and all marketing from launch

---

## 1. The Honest Question

The instinct is "go big — win the Afrobeats mega-festivals, Wizkid/Davido/Burna Boy tier, use that to put EventLinqs on the map." It's a seductive pitch. The question is whether it's the *right* pitch for this moment, or whether it's a trap dressed as ambition.

This doc answers that.

---

## 2. The Two Positioning Paths

Two fundamentally different strategies. They look similar from the outside. They lead to different companies.

### Path A — Mega-Festival Wedge (the headline strategy)

Target top-tier artist festivals (Afro Nation, Homecoming, Promiseland, Wizkid tours, Davido tours). Pitch: "we'll handle your ticketing better than Ticketmaster — transparent fees, no fraud, fan-first experience." Win one, use it as the case study to win the next. Volume and prestige compound.

### Path B — Diaspora Community Wedge (the underdog strategy)

Target the 50-5,000 person diaspora events that happen *every weekend* in Melbourne, Sydney, London, Toronto, Houston, Atlanta: Nigerian Independence parties, Ghanaian weddings with ticketed receptions, Somali community galas, Afrobeats club nights, Caribbean carnival after-parties, African church conferences, diaspora comedy nights, Ethiopian New Year, Eritrean youth events. Low-glamour, high-frequency, chronically underserved by Ticketmaster (too big) and Eventbrite (too generic). Win these, the community trusts you, and *they* introduce you to the mega-festival organisers because the promoters know each other.

---

## 3. Honest Evaluation of Path A (the mega-festival pitch)

### What's attractive
- One win = instant credibility
- Massive top-of-funnel traffic
- Press angle ("the startup that took on Ticketmaster")
- Investor-friendly story
- Emotionally energising

### What's brutal
1. **You cannot win these deals cold.** Afro Nation is promoted by organisations (Smade, Livenation, etc.) with existing multi-year contracts. They don't pick a new ticketing platform because it's better. They pick based on relationships, platform insurance, and who's written them the biggest cheque. You are a solo founder building nights after a process-worker shift. You do not have the chequebook or the relationships.
2. **The infrastructure demand is extreme.** A single Burna Boy tour announcement drops 40,000 tickets in 90 seconds. Your Upstash Redis is on N. Virginia free tier. Your Supabase is on the default plan. You would crater in minute one and never get a second chance. Even Ticketmaster crashes under Taylor Swift-scale drops and they have a billion dollars of infrastructure.
3. **The legal and financial exposure is different.** When $2M of ticket money flows through you in an afternoon, you need treasury management, fraud underwriting, chargeback reserves, and a platform insurance policy. You're a sole trader. You'd need to incorporate (Pty Ltd), raise capital, hire a CFO-type, and get covered before you could even accept the first sale. That's a 12-18 month preparation, not a 7-day sprint.
4. **It's not actually the problem you're best-positioned to solve.** Ticketmaster is bad for these artists, but the artists have *bigger* leverage than the fans. They'll force improvements when they're ready. The fan problem — overpaying, being bot-scalped, not seeing friends attending — is real but the *mega-festival fan* is not the fan you can reach. That fan will buy wherever the artist sells.
5. **If you win one and fumble it, your reputation is torched before you have a reputation.** One crash on a Wizkid drop and every promoter in the African diaspora has heard about it by Monday.

**Verdict:** Path A is not wrong as an *eventual* destination. It is dangerously wrong as a *starting* position. Attempting it now would almost certainly end the company.

---

## 4. Honest Evaluation of Path B (the diaspora community wedge)

### What's attractive
1. **You understand these events.** You've been to them, your family goes to them, your friends DJ them. You know what works and what doesn't. That's a founder-market fit advantage you literally cannot buy.
2. **The market is ignored.** Eventbrite is fine but generic — it doesn't understand that a Nigerian wedding reception needs "couple's table" seating logic, or that a Ghanaian church anniversary needs family-group bookings, or that Afrobeats night organisers want WhatsApp-first flyer sharing. The cultural design layer is wide open.
3. **The organisers are reachable.** You can DM them on Instagram. You can show up to their events. You can offer to handle their next one for free to prove it. That's a sales motion a solo founder can execute.
4. **The infrastructure demand matches what you've built.** 200-5,000 ticket events don't need a queue system strained to its limits. M4 Phase 1 is already enough for 95% of these events.
5. **Narrow-first alignment is clean.** This is the Facebook-at-Harvard move. Win one city's diaspora scene, use the case studies to win the next city. Melbourne → Sydney → London → Toronto → Houston. Every win is reachable from the last.
6. **It's the on-ramp to Path A, not an alternative.** Every diaspora mega-festival organiser started by promoting 500-person events. Every Afro Nation booker came through the Lagos club scene. Win the community scene, and in 3-5 years the mega-festival conversations come to you.

### What's honest
- It's unglamorous. You will not be on TechCrunch for handling a 300-person Nigerian Independence party in Footscray.
- Revenue per event is small. You need volume and retention, not one-off windfalls.
- It's slower. Path A is "shoot your shot and hope." Path B is "compound for 3 years."
- It demands cultural authenticity in the product that generic platforms cannot fake. If EventLinqs looks like Eventbrite with an Afrobeats banner, you lose.

**Verdict:** Path B is the correct starting position. It is the *only* starting position that actually aligns with narrow-first expansion, your founder advantages, and the infrastructure you have.

---

## 5. The Answer

**Path B is the wedge. Path A is the eventual prize.**

Both lives on the same platform. You do not need to rebuild for Path A later — every feature Path B demands (social group booking, trust signals, community-authentic design, fast payouts) is a direct prerequisite for Path A. When Path A organisers come knocking in 2028, the platform will already be ready because Path B forced you to build it properly.

The specific framing for every pitch, page, and investor deck for the next 18 months:

> "EventLinqs is the ticketing platform for the global African diaspora — starting with community events, scaling to the festivals."

Not "we compete with Ticketmaster." That's the 2028 story. The 2026 story is "we're the platform every diaspora promoter in your city already uses."

---

## 6. What Path B Requires (the feature implications)

Ordered by how urgently each needs to exist for the wedge to work.

### Must-have before friends test (this 7-day window)
1. **Culturally authentic visual design** — imagery, typography, copywriting that reads as "for us, by us" without being kitschy. No clip-art kente, no generic stock photos. Real community energy.
2. **WhatsApp-first share flow** — every event page has a one-tap WhatsApp share with a clean preview card. This is the #1 channel these events promote through.
3. **Zero-fee free events** — community announcements, church services, comedy open mics. If you charge for free events you are out of the market.
4. **Transparent pricing on paid events** — "AUD 25 + AUD 2.50 service fee" shown upfront, not a 30% shock at checkout.

### Must-have before M5 (multi-gateway payments)
5. **Group booking** — "buy 4 tickets for the squad" with one payment and one QR per person. Diaspora events are social, never solo.
6. **City-scoped discovery** — `/melbourne`, `/sydney`, `/london` pages that show only local diaspora events. This IS the narrow-first expansion primitive.
7. **Organiser trust page** — previous events run, reviews, response time, verified badge. Community buys on trust, not SEO.

### Must-have before M10 (marketing)
8. **Follow organiser** — so when Mama's Lounge drops their next event, her 600 followers get pinged automatically.
9. **Category-specific templates** — "Wedding reception," "Cultural celebration," "Community fundraiser," "Afrobeats night" — each with a pre-configured ticket structure and image crop spec.
10. **Multi-currency at listing level** — organiser sets AUD but fans in Nigeria see NGN with live conversion. Respects the diaspora — people are genuinely distributed.

### Path A prerequisites (do not build until Path B is winning, earliest 2027)
11. Virtual queue for 10k+ concurrent drops
12. Multi-gateway routing with Flutterwave/Paystack primaries
13. Enterprise SLA, insurance, and legal vehicle (Pty Ltd + proper capitalisation)
14. Dedicated account management team
15. Direct artist ticketing partnerships

---

## 7. Narrow-First Expansion Plan (the revised sequence)

Replace or supersede any earlier "expand by country" plan with this:

| Phase | Timing | Geography | Target | Goal |
|---|---|---|---|---|
| 0 | Now | Melbourne diaspora | 5 organisers, 10 events | Prove the loop works end-to-end |
| 1 | Month 2-4 | Melbourne + Sydney | 30 organisers, 80 events | Prove second-city replication |
| 2 | Month 5-9 | AU east coast | 100 organisers, 400 events | Prove national operation |
| 3 | Month 10-18 | London + Toronto | 200 organisers, 1k events | Prove cross-border, currency, diaspora bridge |
| 4 | Month 18-36 | Houston, Atlanta, DC | 500 organisers, 5k events | Prove US market entry |
| 5 | Year 3+ | Lagos, Accra, Nairobi | Partner-first entry | African continent, reversed flow |
| 6 | Year 4+ | Path A mega-festivals | First tier-1 festival wins | The headline strategy activates |

**Critical rule:** do not expand to a new geography until the previous geography is at "5+ events per weekend." Expansion by vanity is how startups die.

---

## 8. Positioning Statement (use this verbatim everywhere)

> **EventLinqs is the ticketing platform where the culture gathers. We start with the events the diaspora already throws every weekend — the community celebrations, the Afrobeats nights, the cultural festivals that Ticketmaster's too big to care about and Eventbrite's too generic to understand. Built by the culture, for the culture. The mega-festivals are coming. The community comes first.**

Three-second version: "Where the culture gathers."

Investor version: "The ticketing platform for the global African diaspora, starting with community events, scaling to the festivals."

---

## 9. What This Means for This Week

- **Featured mini-rail cards:** use the 3 aspirational festivals (Afro Nation, Homecoming, Promiseland) as "Coming Soon" — this signals the eventual ambition without pretending we have the deals.
- **Homepage copy:** lead with "Where the culture gathers." Subcopy references community. No "compete with Ticketmaster" language anywhere.
- **Session 4 rails:** "Trending Now" draws from the community-scene test events; "Culture Picks" is editorially curated and highlights diaspora-resonant events.
- **First 10 real organisers:** you personally recruit from Melbourne's African diaspora scene. Offer: zero platform fees for their first 3 months in exchange for a testimonial and permission to use their event as a launch case study.

---

## 10. Decision Required From Lawal

Three things to confirm so the rest of the build aligns:

1. **Positioning locked: "Where the culture gathers, diaspora-first."** Yes / change it.
2. **Path A deferred to Year 3+.** Yes / argue for earlier.
3. **First 10 organisers sourced personally from Melbourne diaspora scene.** Yes / different plan.

Once confirmed, every subsequent design, feature, and marketing decision is evaluated against this document.
