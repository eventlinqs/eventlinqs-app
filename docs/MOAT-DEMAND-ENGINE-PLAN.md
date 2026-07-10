# MOAT: The EventLinqs Demand Engine

The plan that makes EventLinqs radically better at filling every organiser's event than any platform in the world. Review and approve this before any code runs. Nothing here executes until you say go.

Companion: the reusable doctrine lives in `event-demand-engine/SKILL.md`. This document is the proof, the architecture, the current-state map, the phased checklist, and the Claude Code build prompt.

---

## 1. The verdict from the research

The platforms that actually sell out events do not win on price. They win on a demand engine. Verified:

- **DICE**: discovery plus push notifications drive about **40% of all ticket sales**. The organiser pays nothing extra for those sales. Push converts roughly **5x better than email**. The recommendation engine ingests Spotify and Apple Music taste, past attendance, and behaviour. The waitlist is a demand sensor and a sold-out recirculation loop at face value. (Sources: dice.fm partners, businessmodelcanvastemplate DICE analysis, Trapital interview.)
- **Bandsintown**: the same machine at **100M+ fans and 700k artists**. Automated lifecycle Fan Alerts (Just Announced, On Sale Now, reminders) targeted by followed acts plus a location radius, sent at the optimal time per fan timezone, with Notify Me and waitlist opt-ins that build first-party fan data. (Sources: Bandsintown Pro for venues and artists.)
- **Eventbrite**: organisers tolerate roughly 11% effective fees mainly for one thing, its marketplace discovery. Strip the marketplace and you are cheaper but you bring the organiser no audience. (Sources: tixfox, ticket-generator fee analyses 2026.)
- **2026 market**: the durable advantage is proprietary, domain-rich data with AI embedded in the workflow, not generic AI bolted on. The data graph is the moat as models commoditise. (Sources: SaaS Mag, L40, BetterCloud 2026.)

Conclusion: EventLinqs must be an active demand engine built on a first-party attendee taste graph, not a passive listing tool. That is the moat. It is provable, it is what the winners do, and it compounds.

---

## 2. The flywheel

More attendees with richer taste data, then better matching and alerts, then events fill faster with less organiser spend, then more organisers bring more events, then more events and discovery pull in more attendees. Repeat. The attendee demand graph is the asset that gets stronger every day and cannot be copied, because it is yours.

---

## 3. The five engines (architecture)

1. **Attendee Demand Graph**: follows (organiser, act, venue, community, scene), taste from signup choices plus optional Spotify/Apple Music connect, home city plus travel radius, and behavioural signals (views, saves, shares, purchases, waitlist joins, no-shows).
2. **Match and Personalised Feed**: affinity ranking of every live event per attendee (taste, location, recency, social signal, scarcity). A "for you" feed, a weekly near-you digest, similar events, and affinity-ranked search and browse.
3. **Alert Engine**: lifecycle alerts off the graph, push first (about 5x email), email and SMS support. Just Announced, On Sale Now, Going Fast, Last Chance, Tonight, Waitlist Available. Send time and channel optimised per attendee.
4. **Conversion and Virality**: frictionless checkout, urgency and social proof, abandoned-checkout recovery, referral and social sharing, group / Squad invites, affiliate tracking. Each buyer recruits more buyers.
5. **Waitlist and Demand Intelligence**: Notify Me before on-sale, waitlist with face-value recirculation, organiser demand dashboard (who, where, what they like) so they add dates and plan the next event.

Plus the **AI layer** embedded throughout: affinity scoring, optimal send-time and copy, lookalike expansion, predictive demand and suggested pricing, campaign autopilot that generates the organiser's marketing for them, and the **fill-gap engine** that detects an underpacing event and actively works to sell it out.

---

## 4. Current-state map (what you likely already have vs what the moat needs)

Confirm each against the codebase with Claude Code before building. Based on the existing scope:

Likely already built (verify and wire into the engine):
- Waitlist and virtual queue (engine 5 partial)
- Squad / group bookings (engine 4 virality, the invite loop)
- Dynamic pricing (engine 4 and AI pricing input)
- Programmatic SEO community-city pages (engine 2 discovery, organic surface)
- Reserved seating, QR delivery, Upstash Redis inventory caching (supporting)

Missing or incomplete (the actual moat work):
- The Attendee Demand Graph: follow model, taste profiles, Spotify/Apple Music connect, behavioural event tracking (engine 1, the foundation, build first)
- Recommendation and personalised feed (engine 2)
- The Alert Engine: push infrastructure, email, SMS, lifecycle triggers, send-time optimisation (engine 3, the biggest lever)
- Conversion virality: referral, social share, tag-a-friend, abandoned-checkout recovery, social-proof and urgency UI (engine 4)
- Organiser demand dashboard depth and Notify-Me-before-on-sale (engine 5)
- The entire AI layer: campaign autopilot, fill-gap engine, predictive demand, lookalike (AI layer)

---

## 5. Data model sketch (for Claude Code to refine)

- `follows` (attendee_id, target_type [organiser, act, venue, community, scene], target_id, created_at)
- `attendee_taste` (attendee_id, communities[], sounds/genres[], home_city, travel_radius_km, streaming_source, streaming_seed_json, updated_at)
- `attendee_events_behaviour` (attendee_id, event_id, action [view, save, share, purchase, waitlist_join, no_show], weight, created_at)
- `event_affinity_tags` (event_id, communities[], sounds/genres[], acts[], venue_id, city, geo)
- `notifications` (attendee_id, event_id, type [just_announced, on_sale, going_fast, last_chance, reminder, waitlist_available], channel [push, email, sms], scheduled_for, sent_at, opened_at, converted)
- `notification_prefs` (attendee_id, push_enabled, email_enabled, sms_enabled, quiet_hours, timezone)
- `waitlist` (event_id, attendee_id, position, created_at, offered_at, expires_at, status)
- `referrals` (referrer_attendee_id, invitee, event_id, channel, status, reward)

All schema changes go through one owner agent, applied via `supabase db push --linked` from PowerShell only, never the Dashboard or MCP.

---

## 6. Phased build checklist (the tick list)

Build in this order. Each phase ships fully working and benchmarked before the next. Mark each box only when verified end to end with proof.

### Phase 0: the graph (foundation, build first)
- [ ] Follow model and follow buttons on organiser, act, venue, community, scene
- [ ] Taste capture at signup (communities, sounds, home city, travel radius)
- [ ] Optional Spotify and Apple Music connect to seed taste
- [ ] Behavioural event tracking (view, save, share, purchase, waitlist, no-show)
- [ ] Event affinity tagging so every event is matchable

### Phase 1: the alert engine (biggest lever)
- [ ] Push infrastructure (web push and mobile if app), opt-in capture, prefs and quiet hours
- [ ] Email and SMS channels wired to the same lifecycle
- [ ] Lifecycle triggers: Just Announced, On Sale Now, Going Fast, Last Chance, Tonight, Waitlist Available
- [ ] Targeting by follows plus affinity plus location radius
- [ ] Send-time and channel optimisation per attendee timezone
- [ ] Instrumentation: sent, opened, converted, push vs email uplift

### Phase 2: discovery and feed
- [ ] Affinity ranking model (taste, location, recency, social, scarcity)
- [ ] Personalised "for you" home feed
- [ ] Weekly "near you this week" digest
- [ ] Similar events and affinity-ranked search and browse

### Phase 3: conversion and virality
- [ ] Frictionless checkout polish (saved card, Apple Pay, Google Pay, minimal taps)
- [ ] Urgency and social proof UI (going, watching, tickets left, early-bird, tiers)
- [ ] Abandoned-checkout recovery (push and email)
- [ ] Referral, social share, tag-a-friend, Squad invite loop, affiliate tracking

### Phase 4: waitlist and demand intelligence
- [ ] Notify Me / RSVP before on-sale
- [ ] Waitlist with face-value recirculation inside the platform
- [ ] Organiser demand dashboard (count, location, taste, add-a-date prompt)
- [ ] Real-time sales, marketing attribution, audience insight for organisers

### Phase 5: the AI layer
- [ ] Affinity scoring and ranking model live in production
- [ ] Optimal send-time, channel, and copy generation per attendee
- [ ] Lookalike expansion from buyers
- [ ] Predictive demand and suggested pricing/timing for organisers
- [ ] Campaign autopilot: auto-generate organiser marketing (copy, social, email, push)
- [ ] Fill-gap engine: detect underpacing, widen targeting, fire offers, trigger referral pushes

### Ship gate for the whole moat
- [ ] Each phase verified end to end in production with proof
- [ ] Competitive Benchmark Gate passed vs DICE, Eventbrite, Bandsintown at desktop and mobile
- [ ] Measured targets moving: discovery and push share of sales, push vs email uplift (4 to 6x), waitlist fill rate, sell-through velocity
- [ ] Lighthouse 95+ desktop and mobile on warmed production builds

---

## 7. The organiser pitch

"Every other platform lists your event and leaves you to fill the room. We fill it. The moment you publish, we put your event in front of the exact people in your city who love your kind of event, because we already know their taste. We alert them at the right time on the channel that actually converts, we generate your marketing for you, we turn every buyer into someone who brings their friends, and if the room is filling slowly our system steps in and works to sell it out. When it sells out, our waitlist keeps the demand and packs the room. You pay less than the big platforms and you sell more. That is the deal."

---

## 8. Claude Code build prompt (for when you approve, not before)

Paste this per phase, starting with Phase 0. It follows the EventLinqs build standard.

```
ROLE: You are the demand-engine build agent for EventLinqs.

FIRST: read CLAUDE.md and skills/event-demand-engine/SKILL.md in full. Obey every law in the skill.

SCOPE MANIFEST:
- Authorised: [list exact files/dirs for this phase only]
- Do not touch: everything else, especially payment spine and auth unless declared

TASK: Implement Phase [N] of the Demand Engine per MOAT-DEMAND-ENGINE-PLAN.md and the SKILL.md.
Before coding, audit current state: report what already exists for this phase and what is missing.

DB: any schema change is yours alone this phase, applied via `supabase db push --linked` from PowerShell only. Never Dashboard, never MCP.

QA AGENT: spin up a QA pass that verifies the phase end to end in production-equivalent conditions, with evidence (screenshots, logs, metric readouts).

COMPETITIVE BENCHMARK GATE: Playwright comparison vs DICE (discovery, alerts, waitlist, checkout), Eventbrite (marketplace discovery), Bandsintown (follow-and-alert lifecycle), at desktop 1440 and mobile 390. Match or beat the mechanic. Keep EventLinqs navy and gold, light, refined identity.

PROOF REQUIRED: do not report done until the phase works end to end with evidence and the measured targets in the SKILL.md laws are moving.

OUTPUT: a short report of what was built, the proof, the benchmark result, and the next phase's exact scope manifest. Do not start the next phase.
```

---

## 9. What is decided and what you confirm

Decided (the strategy is locked and proven):
- The moat is the active demand engine on a first-party attendee taste graph, not price.
- Build order: graph, then alerts, then feed, then conversion and virality, then waitlist intelligence, then the AI layer.
- Benchmark leaders: DICE, Eventbrite, Bandsintown.

You confirm before execution:
- That Phase 0 (the graph) is the starting point.
- Whether the app is web-only at launch (web push) or also native (mobile push), which sets the Phase 1 push infrastructure.
- That this moat is part of the launch ship gate, as you said: if it is not built, we are not ready to launch.
