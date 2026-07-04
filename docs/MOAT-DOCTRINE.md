# EventLinqs Moat Doctrine - the defensibility standard (locked 2026)

**Status:** Binding. Every feature is judged against this for defensibility, the
same way every surface is judged against the Definition of Done for quality.

**Sits beside:** the Growth plan in `CLAUDE.md` (the wedge, the two engines, the
levers), `EventLinqs-Growth-Plan.md`, the `event-demand-engine` skill,
`docs/MOAT-DEMAND-ENGINE-PLAN.md`, `EventLinqs-Venue-Revenue-Program-SPEC.md`,
`docs/FEE-SYSTEM.md`.

**Relationship to those docs:** this doctrine does NOT introduce new growth
mechanics and does NOT override the locked Growth plan. It consolidates the "why
EventLinqs is defensible" layer on top of them, names the moat as a stack, fixes
the build order, and gives one test every feature must pass. Where mechanics are
concerned, the Growth plan and the demand-engine skill remain the source of truth.

---

## 0. Why this exists

A founder instinct says "build a network effect and we are safe." The instinct is
right that a moat is survival, and wrong about the mechanism. There is no module
called "network effect" to switch on. A network effect is an emergent property of
how the product is designed and grown.

And the hard truth specific to our industry: ticketing has structurally WEAK
classic network effects. Two reasons. Organisers list on several platforms at
once and buyers follow the event, not the platform, so the "more buyers attract
more organisers" loop is real but leaky and locks no one in by itself. And event
liquidity is local and time-bound: a packed Melbourne calendar does nothing for a
Sydney buyer, and last week's sold-out show does nothing for next week's. A single
network effect will not save EventLinqs.

What wins is a STACK of compounding advantages, built in a deliberate order, each
reinforcing the next. This document names the stack, fixes the order, and gives
the one question every build must answer: which layer does this deepen.

## 1. Get the vocabulary right (read before claiming a "network effect")

Four things founders blur into one word. Keep them separate or the strategy goes
soft.

- **Network effect:** value rises as the network grows. (The native data graph
  getting smarter; "who's-going" social proof.)
- **Virality:** users bring users. A growth engine, not a moat. (Share-a-ticket,
  invite-an-organiser.)
- **Switching cost:** users stay because leaving is painful or costly. Retention.
  (An organiser's followers, attendee history, and recurring-event tooling
  accumulating here.)
- **Counter-positioning:** we hold a business model the incumbent cannot copy
  without damaging their own. (Full attendee data ownership and an active demand
  engine, which a fee-maximising or shrinking incumbent structurally cannot match.)

Great companies stack all four. EventLinqs does too. The seven sources of durable
power (Helmer's frame) name the same set; of them, the three EventLinqs can
realistically own are counter-positioning, switching costs, and network economies
(the data graph). We are partway into all three already.

## 2. The moat stack (six layers, in build and defend order)

Each layer states what it is, the mechanism in our platform, why it is
defensible, and the one signal that proves it is deepening.

**1. Counter-positioning, the wedge (live day one, needs no scale).**
The locked two-bladed wedge: (a) the demand engine puts every organiser's event in
front of the right attendees via the discovery feed and push, the way DICE drives
about 40% of sales, which a shrinking post-acquisition Eventbrite cannot push the
same way; (b) the organiser owns every attendee relationship, full data ownership
with consent, no withheld emails, which DICE refuses and Eventbrite limits.
Competitive organiser pricing supports the wedge; it is not the wedge by itself.
Defensible because the incumbents cannot match data ownership or the same
discovery without damaging their own model, and the timing edge (Eventbrite taken
private by Bending Spoons in March 2026, free tier reportedly at risk) opens the
door now.
Signal: organisers naming discovery and data ownership as the reason they switched.

**2. Local density, two-sided liquidity (the launch geography).**
The locked launch shape: nationally available, locally dense. National
availability is kept, anyone in Australia can use it, but recruitment and seeding
concentrate on the Geelong and Melbourne music and community scenes where the
founder has real reach. Density inside one geography is the unit of liquidity, not
national coverage. Depth before breadth is the single most repeated lesson in the
research.
Signal: in the focus geography, enough live events and active attendees that the
feed feels full and a new organiser's room actually fills.

**3. Supply-side switching costs, the durable retention moat.**
Recurring-event organisers whose followers, attendee history, and marketing
automation accumulate on EventLinqs. Note the discipline: we do NOT manufacture
lock-in by holding attendee data hostage, that is the very thing we
counter-position against. Retention is earned by performance, the demand engine
making the organiser money, plus the compounding value of their accumulated graph
and recurring-event tooling. Earned retention is more durable than hostage
retention, and it reinforces the wedge instead of undermining it.
Signal: share of organisers running a second and third event on the platform, and
rising.

**4. The venue revenue loop, a supply acquisition flywheel.**
Venues earn a share and become an incentivised channel that clusters organisers
onto us inside a geography. Structured as an attractive offer, never hard
exclusivity, per `EventLinqs-Venue-Revenue-Program-SPEC.md` (hard exclusivity is
the conduct that drew the DOJ suit against Ticketmaster and ACCC scrutiny; a solo
founder does not take that on). The revenue share is fine; the lock-out is the
risk.
Signal: organisers arriving by venue referral.

**5. Same-side virality, the levers that feed the graph.**
The acquisition loop (share-a-ticket and invite-an-organiser, both attributed)
plus the ranked levers, with supply-side direct recruitment first. Each buyer
recruits buyers, and every interaction thickens the native taste graph. The graph
is native (follows, communities, scenes, behaviour, home city and radius), with no
streaming dependency.
Signal: attributed signups per share and per invited organiser.

**6. The data network effect, the long game (dominant at scale).**
The native attendee demand graph compounding with every interaction until the
matching is something no rival can replicate. Thin at launch, decisive at scale.
The AI tuning layer that sharpens it is the next major workstream, built after
launch on a live earning platform, never before. The graph is the durable asset
because it is ours and gets better with use.
Signal: discovery and push share of sales trending toward and past the DICE
benchmark of about 40%, and push converting roughly 5x email.

## 3. The flywheel

The wedge wins the first organisers cheaply, because the incumbents cannot match
it. The demand engine fills their rooms, so they run recurring events and bring
their peers, and venues amplify that locally. Attendees arrive through friends and
the acquisition loop and connect their taste, so the graph thickens, so the
matching improves, so rooms fill faster. Each turn lowers the cost to fill a room
and raises the cost of leaving, and the loop runs separately inside each
geography, which is why density, not reach, is the target. The full mechanics live
in the `event-demand-engine` skill and `docs/MOAT-DEMAND-ENGINE-PLAN.md`.

## 4. The defensibility test (the bar every build is judged against)

Before building any growth, discovery, social, organiser, or venue feature,
answer:

1. **Which layer does this deepen?** Name one of the six. If it deepens none,
   justify why it exists at all.
2. **Does it protect the graph?** First-party taste and follow data is the moat.
   Capture it on every interaction, never leak it, never erode the trust that lets
   us hold it. The graph is sacred.
3. **Does it lower the cost to fill a room or raise the cost of leaving?** If
   neither, it is not moat work.
4. **Does it keep the counter-position honest?** Nothing that reintroduces walled
   gardens, withheld data, or the fee-maximising behaviour we attack the
   incumbents for.
5. **Is it measured?** Tie it to the layer's signal above and the demand-engine
   benchmarks. If the signal does not move, the feature is not done.

A feature can pass the Definition of Done for quality and still fail this test for
defensibility. Both bars must be met.

## 5. What we explicitly do NOT chase

- **Ticketmaster's moat (exclusive venue and promoter lock-out, vertical
  integration).** A cornered resource built on exclusivity and scale a solo
  founder cannot and should not replicate, and the exact antitrust-shaped risk the
  venue spec warns against.
- **Pure marketplace breadth (the Eventbrite path).** Reach and SEO scale alone
  are weakly defensible and lose to anyone who matches them. We use SEO as a quiet
  compounding lever, not as the moat.
- **Anything that erodes the graph or fan trust** for a short-term number: hostage
  data, walled gardens, reseller leakage on sold-out events, dark-pattern fees.

## 6. How to use this doctrine

Read it alongside the `event-demand-engine` skill before any feature that brings
users in, keeps them coming back, or pitches an organiser or venue. Identify the
moat layer, build to the Definition of Done, then verify the layer's signal
actually moved. Defensibility is not a phase; it is a property every build either
adds to or wastes.
