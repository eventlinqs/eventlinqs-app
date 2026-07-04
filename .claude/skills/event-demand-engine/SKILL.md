---
name: event-demand-engine
description: The EventLinqs moat doctrine for radically filling every organiser's event faster than any competitor. Use this skill on ANY task that touches discovery, the home feed, recommendations, follows, notifications, push, email, SMS, attendee taste profiles, the waitlist, referral, social sharing, group/Squad invites, abandoned checkout, urgency or social-proof UI, organiser demand dashboards, predicted demand, suggested pricing, or marketing automation for events. Even when the request looks like a small feature (one notification, one card, one filter), consult this skill first, because every one of those features is a node in the demand engine and must obey these laws. This is the single most important system on the platform: if an event does not fill, the organiser leaves, so this skill governs the work that decides whether EventLinqs survives.
---

# Event Demand Engine: the moat that fills every event

**Read alongside:** `docs/MOAT-DOCTRINE.md`, the defensibility bar. This skill holds the mechanics that fill events; the doctrine names the moat stack each feature must deepen and gives the one defensibility test every build must pass.

## The one idea

Every cheap, low-fee ticketing platform is a **passive listing tool**. It puts the event online and leaves the organiser to drive their own traffic. EventLinqs is an **active demand engine**. We own a growing graph of attendees and their tastes, and we proactively put each organiser's event in front of the exact people most likely to buy, at the right moment, on the channel that actually converts, then turn each buyer into someone who brings more buyers, and if the room is filling too slowly the system intervenes automatically to sell it out.

The organiser's number one goal is to make money and fill the room so they run recurring events. Price alone never does that. This engine does. This is the pitch we make at the door, and it is the reason an organiser chooses us over a platform that is the same price or even cheaper.

## Proven benchmarks (this is not theory)

These are the numbers the engine is designed to hit or beat. They come from the platforms that already win.

- Discovery and push drive about **40% of all ticket sales** on DICE. The organiser does not pay for those sales with ads. They happen organically because the platform markets for them. (Source: DICE partner pages and DICE exec interview, Trapital.)
- **Push notifications convert roughly 5x better than email** on DICE. Push is the primary channel, email and SMS support it. (Source: DICE marketing strategy analysis, 2025 to 2026.)
- The recommendation engine ingests **streaming taste data (Spotify, Apple Music), past attendance, and behaviour**, then surfaces relevant events in the feed and via alerts. (Source: DICE how-it-works.)
- Bandsintown runs the same machine at **100M+ fans, 700k artists**, with automated lifecycle alerts (Just Announced, On Sale Now, reminders) targeted by **followed acts plus location radius**, sent at the **optimal time per fan timezone**. (Source: Bandsintown Pro for venues and artists.)
- The **waitlist** is a demand sensor, not just a recovery tool. When a 200-cap room sells out and 600 join the waitlist, the organiser knows they can sell out three more dates. Returns recirculate at face value, so sold out means a genuinely packed room and no revenue lost to resellers. (Source: DICE waitlist blog and partner pages.)

## The five engines (architecture)

Build and judge every feature against these five. They compound into a flywheel: more attendees with richer taste data, better matching and alerts, events fill faster with less organiser spend, more organisers bring more events, more events and discovery pull in more attendees. The data graph is the durable asset that no competitor can copy, because it is ours.

### 1. The Attendee Demand Graph (the asset)
The foundation. Every attendee builds a taste profile from explicit and implicit signals:
- Follows: organisers, artists/acts, venues, communities, scenes.
- Communities and sounds chosen at signup (heritage, faith, genre, scene), plus home city and a travel radius.
- Optional streaming connect (Spotify, Apple Music) to seed taste instantly and kill the cold-start problem.
- Behaviour: views, saves, shares, past purchases, waitlist joins, no-shows.
This first-party graph is the moat. Protect it, grow it, enrich it on every interaction.

### 2. The Match and Personalised Feed
A recommendation engine ranks every live event for every attendee by affinity: taste match, location and radius, recency, social signal (friends going), and scarcity. Surfaces: a personalised "for you" home feed, a weekly "near you this week" digest, "similar events", and affinity-ranked search and browse. Cold start handled by signup community/genre/city selection plus streaming connect.

### 3. The Alert Engine (the single biggest lever)
Lifecycle alerts fired automatically off the graph, primarily by **push** (about 5x email), supported by email and SMS for high intent:
- Just Announced (to followers and affinity matches in radius)
- On Sale Now (ticket link front and centre)
- Going Fast (scarcity trigger when sales velocity or low remaining stock crosses a threshold)
- Last Chance (final window)
- Tonight / reminder
- Waitlist Available (face-value return released)
Send time and channel optimised per attendee. This is what converts the graph into sales without the organiser spending on ads.

### 4. The Conversion and Virality Layer
Turn discovery into a purchase, and each purchase into more purchases:
- Frictionless checkout: saved card, Apple Pay, Google Pay, discovery to ticket in a few taps.
- Proven urgency and social proof: "N going", "M watching", "K tickets left", early-bird and tiered pricing as a marketing tool.
- Abandoned-checkout recovery via push and email.
- Referral and social: prompt every buyer to invite friends, tag friends, share before and after checkout; group / Squad invites; referral and affiliate tracking for organisers and promoters so each attendee recruits more attendees.

### 5. The Waitlist and Demand Intelligence (organiser superpower)
- Notify Me / RSVP before on-sale builds the demand list before tickets even drop.
- Waitlist on sold-out events captures overflow; returns recirculate at face value inside the platform.
- Organiser demand dashboard: how many want in, where they are, what they like, so they confidently add dates, raise allocation, and plan the next event. Real-time sales, marketing attribution, audience insight.

## The AI layer (embedded in the workflow, never bolted on)

This is the intelligence that makes it "radically" better, not incrementally. Each item rides on the graph.
- **Affinity scoring and ranking**: the recommendation core.
- **Optimal send-time, channel, and copy per attendee**: every alert tuned automatically.
- **Lookalike expansion**: find attendees similar to those who already bought, widen the target set.
- **Predictive demand and suggested pricing/timing for organisers**: will this fill, when to release, what to charge.
- **Campaign autopilot for organisers**: auto-generate the event's marketing (copy, social posts, email and push sequence) from the event details, so the organiser markets like a professional with zero effort. This is the literal "we do your marketing for you" promise.
- **Fill-gap engine (the killer feature)**: if an event is pacing below its predicted curve, the system automatically widens targeting, fires a Going-Fast or limited-offer alert, and triggers referral pushes. It actively works to fill the room instead of passively listing it.

## The laws (non-negotiable)

1. **Never build a passive listing.** Every event surface must connect to the demand graph and the alert engine. If a feature does not help fill a room or grow the graph, question why it exists.
2. **Push first.** Push is the primary conversion channel. Email and SMS support it. Always capture notification opt-in and respect it.
3. **The graph is sacred.** First-party taste and follow data is the moat. Capture it on every interaction, never leak it, never sell it in a way that erodes trust.
4. **Sold out must mean packed.** Waitlist and face-value recirculation are mandatory on sold-out events. No revenue leaks to resellers, no empty seats from no-shows.
5. **Save the organiser money and effort.** Tools are built into the platform economics, never billed to the organiser as add-ons. The organiser pays less and sells more. That is the whole deal.
6. **Measure against the benchmarks.** Track discovery and push share of sales (target: push and discovery driving a large share, benchmarked against DICE's 40%), push vs email conversion (target 4 to 6x uplift), waitlist fill rate, and sell-through velocity. If a feature does not move these, it is not done.

## Competitive Benchmark Gate (required before any related feature ships)

Per the EventLinqs build standard, every demand-engine feature is benchmarked with Playwright against the leaders at desktop and mobile before it is called done:
- **DICE** for discovery feed, personalised alerts, waitlist, and frictionless checkout.
- **Eventbrite** for marketplace discovery and breadth.
- **Bandsintown** for the follow-and-alert lifecycle.
The bar is to match or beat them on the specific mechanic, not to resemble them visually (EventLinqs keeps its own navy and gold, light, refined identity).

## The organiser pitch (say this at the door)

"Every other platform lists your event and leaves you to fill the room. We fill it. The moment you publish, we put your event in front of the exact people in your city who love your kind of event, because we already know their taste. We alert them at the right time on the channel that actually converts, we generate your marketing for you, we turn every buyer into someone who brings their friends, and if the room is filling slowly our system steps in and works to sell it out. When it sells out, our waitlist keeps the demand and packs the room. You pay less than the big platforms and you sell more. That is the deal."

## How to use this skill in a build task

1. Read this file before writing any code on a discovery, feed, recommendation, follow, notification, waitlist, referral, conversion, or organiser-analytics feature.
2. Identify which of the five engines the task belongs to and which law(s) apply.
3. Build to the benchmark, then run the Competitive Benchmark Gate vs the relevant leader.
4. Verify against the measured targets in the laws. If it does not move discovery share, push conversion, waitlist fill, or sell-through, it is not finished.
5. See the companion file MOAT-DEMAND-ENGINE-PLAN.md for the full phased roadmap, the data model, the current-state map, and the Claude Code build prompt.
