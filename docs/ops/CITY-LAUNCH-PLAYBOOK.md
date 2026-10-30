# City launch playbook

The repeatable way to open EventLinqs in a new city. Written by window 6 on 30 October 2026 for the supreme
specification's section 18 (C:\dev\START-16OCT\EVENTLINQS-SUPREME-SPEC-30OCT.md): "local event source discovery,
organiser prospecting, venue partnerships, city editorial calendars, consumer distribution, acquisition economics,
supply density thresholds, operational support requirements", and its rule: "Do not expand aggressively before the
existing market demonstrates repeatable retention and contribution economics."

Every step below names the code or the record that already does it. Where no number has been set by Lawal, this file
says so and proposes one for his ruling; it never presents a proposal as a decision.

The four initial markets are Melbourne, Geelong, Ballarat and Bendigo (src/lib/growth/supply-scorecard-math.ts,
MARKETS). A new city is opened only when the gate in part 7 is met in the city before it.

## 1. Local event source discovery

Goal: the city's events, read lawfully, with a source for every one.

1. Register each candidate source in the source register (listing_sources) with its terms: a source is read only when
   its terms allow it; an 'ask' source is never read until the venue agrees (part 3).
2. The daily collection run reads the allowed sources (/api/cron/collection-run, 19:00 UTC each day) and lands every
   new event for review, never published by itself (the first production run, 30 October: 470 events landed for
   review from 4 allowed sources; the 7 'ask' sources were not read).
3. Each landed event carries its horizon, counted in Melbourne calendar days (src/lib/listings/horizon.ts): 0 to 14
   days publish, 15 to 45 acquire, 46 to 90 relationships.
4. A person verifies each before it goes up; a collected listing stays fresh for 21 days and then leaves every
   discovery surface until it is checked again (src/lib/events/public-visibility.ts, clause 5).
5. Organiser submissions (/submit-event) are the long-term source: no account, the organiser's own booking link,
   photo, authority and permission line.

Done when: the city's sources are in the register with their terms, and one collection run has landed its events for
review.

## 2. Organiser prospecting

Goal: a short list of the city's organisers worth asking first, each with a lawful way to reach them.

1. Record each host as an organiser in the CRM (organisers, organiser_venues), linking their venues; a host found
   only in a source file keeps its stated city in notes (scripts/ops/outreach-cohort.mjs).
2. Record each published contact with its whole basis: the page it is published on, the date read, the
   no-marketing statement checked, the role it is published for and why the message fits it
   (organiser_contacts_basis_is_whole; Spam Act 2003, Schedule 2 clause 4). A prospect is not a contact: no basis,
   no email.
3. Rank by the organiser score, 0 to 100 (src/lib/outreach/organiser-score.ts): frequency 25, fit 20, ticketing or
   referral value 20, readiness 15, completeness 10, partnership 10. It sets who is asked first and predicts nothing.
4. Each organiser's acquisition state is decided by the database from its proof (migration 20261030034001), from
   discovered to recurring, and moves every 15 minutes with the outreach run (/api/cron/outreach-run).
5. Pick the first cohort by city share (src/lib/outreach/cohort-pick.ts); a city short of its share stays short.

Done when: the city's organisers are scored, the cohort is picked, and every email in it has a recorded basis.

## 3. Venue partnerships

Goal: a feed, a submission route or permission from each recurring venue whose terms keep us out.

1. List the city's recurring venues whose sources are 'ask' in the register.
2. Read each venue's published address on its own site, with the page and the date (as
   C:\dev\EVIDENCE\W6-30OCT\d7-venue-addresses.md did for the first twelve); a venue with no address read gets no
   email.
3. Draft each ask in Lawal's format with the true line from its research (scripts/ops/outreach-venue-asks.ts and its
   data file): a draft play, every message held until Lawal approves it.
4. A venue's yes goes into the register as a venue partnership, its words quoted and dated, and the collection run
   reads it from then on.

Done when: every recurring 'ask' venue has a held draft or a recorded reason for none.

## 4. City editorial calendar

Goal: a steady week of true, approved posts for the city.

1. Plan This Week builds the week's campaign into the approval queue; it never publishes by itself (/admin/social).
2. The weekly rhythm (the growth blueprint and the PM's rulings): Monday the week ahead, Wednesday the Reel or a
   spotlight, Friday the Weekend Edit, and the daily poster (Family F, one night per city per day, the poster
   directive).
3. Every piece takes the night's facts from its listing, its image only with a recorded right (event_image_rights),
   and its call to action from the five admission states (src/lib/events/cta.ts).
4. Lawal approves each piece; nothing posts before he does.

Done when: one week's campaign for the city is planned and approved.

## 5. Consumer distribution

Goal: people in the city find the nights.

1. The city page (/city/[slug]) and its weekend guide, indexable, every night with structured data.
2. Organiser-powered sharing: an approved piece's partner kit (/kit/[pieceId]) with the night's own tracked link
   (/e/), sent as message 7 after the organiser's yes.
3. Opt-in city editions: the weekly roundup, approved per city on /admin/roundup, sent by the weekly digest only to
   subscribers, only after its approval.
4. Reminders for a night, with consent (Remind me).

Done when: the city page lists the city's verified nights and one approved edition is ready to send.

## 6. Acquisition economics

Goal: know what a city costs and earns before scaling it.

1. Every organiser has six months with no platform fee from registration (LAW 24, the constitution); revenue from a
   city starts after its first organisers' six months.
2. Outside ticketing is a referral, never revenue (spec s13): presses out are counted as presses, not sales.
3. The founder dashboard's economics read gross ticket sales, platform fee earned, payment cost, contribution and the
   break-even volume at the current fee (the PM's ruling 6).
4. The blueprint's A$2.50 net per ticket is a hypothesis to test against Stripe's real cost, not a figure to plan on.
5. Spend per channel is recorded before it is spent; with no paid acquisition the cost is $0 and is said so.

Done when: the city's contribution is read from counted rows, with its spend recorded.

## 7. Supply density thresholds

Goal: a city is opened, and the next one started, on evidence.

1. The state gate (the plan, Expansion; src/lib/growth/weekly-math.ts, RECURRING_EVENTS_FOR_THE_NEXT_STATE): 50
   recurring events live, repeat organisers, returning visitors up and a positive margin, read on the state
   scorecard. The plan sets no number for the other three; they must each be true.
2. The weekly supply scorecard per city (src/lib/growth/supply-scorecard-math.ts): verified upcoming, new this week,
   expiring soon, cancelled, awaiting verification, with approved imagery, active organisers, recurring suppliers,
   missing category and category gaps.
3. PROPOSED, FOR LAWAL'S RULING (not set): a city is 'open' when its scorecard shows verified upcoming nights in every
   week of the next four and no category gap among its five largest categories. Until he rules, the state gate in
   1 is the only threshold.
4. A thin rail is filled with invitations, never hidden (the constitution's 'one event shows the rail').

Done when: the city's scorecard reads every week, and the state gate is met before the next state starts.

## 8. Operational support requirements

Goal: the city runs without Lawal watching it.

1. The daily runs: collection (19:00 UTC), listing occurrences (hourly at :10), outreach (every 15 minutes), the
   weekly digest (Wednesday 22:00 UTC) (vercel.json).
2. What waits for Lawal is on /admin/today: plays to approve, sends paused with their reason, replies the system could
   not read, exceptions. Everything else runs.
3. Outreach is held until his Graph consent; then each approved play sends inside a daily cap that starts at 20,
   steps up by 10 a day to at most 200, and pauses itself above 2 percent hard bounces or 0.1 percent complaints
   (migration 20261028213001).
4. Every production write is a script with a dry run, applied only when APPLY is typed, and logged in
   C:\dev\PRODUCTION-WRITES.txt (the constitution's operating rule 4).
5. Recovery: docs/ops/disaster-recovery.md.

Done when: a week passes in the city with /admin/today the only place Lawal looks.

## The order, in one line

Sources and the collection run, then organisers scored with their bases, then the venue asks, then the city page and
one approved week of posts, then the first cohort's play for Lawal to approve; the next city only when the state gate
in part 7 is met.
