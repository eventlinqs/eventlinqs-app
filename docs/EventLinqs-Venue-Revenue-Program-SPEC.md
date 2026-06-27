# EventLinqs Venue Revenue Sharing Program — SPEC (build after launch-readiness)

Founder's vision, captured so nothing is lost. This is a MAJOR build, scheduled as
the next big workstream after launch-readiness and the fee structure are done. It is
NOT a tonight build: it touches the funds-holding payment engine (proven, gate-green)
by adding a third party (the venue) to the money flow, so it must be engineered and
verified carefully, never rushed. Dash rule followed in prose to Lawal.

## The idea (the moat)

Venues earn a percentage of revenue from every event ticketed through EventLinqs at
their venue. In exchange, venues champion EventLinqs to the organisers who run events
there. The principle: people act when there is something in it for them. Give venues a
cut, and they become a sales force that recruits organisers for you, and they spread
the word. This is positioned as the platform's standout differentiator and a magnet
for adoption.

## The mechanics (to design properly)

- Venues get a revenue share: a percentage of EventLinqs revenue (or of ticket
  revenue, TBD) from events at their venue. Suggested starting range 4 to 5%,
  to be set by proper margin maths against the locked fee structure (see below).
- The organiser still runs their event and sets their own booking fee normally; the
  venue share comes out of a modelled, agreed slice, not stacked surprise cost.
- Venues get accounts, get linked to events at their address, see a dashboard of
  their earnings, and get paid out their share via the funds-holding payout system.

## THE ONE DECISION LAWAL MUST MAKE FIRST (legal, important)

Lawal's notes describe ENFORCING that events at a partner venue are sold ONLY via
EventLinqs (venue exclusivity). Flag, honestly: hard venue exclusivity is the exact
conduct that drew the US DOJ antitrust suit against Ticketmaster and ACCC scrutiny in
Australia. For a solo founder this is real exposure. STRONG RECOMMENDATION: structure
this as an ATTRACTIVE OFFER (the revenue share is the carrot, venues CHOOSE EventLinqs
because it pays them and works best), NOT a contractual lock-out of competitors. Same
commercial outcome, far less legal risk. The revenue share itself is completely fine;
the hard-exclusivity enforcement is the risky part. Decide this before building.

## Margin maths (must be done before setting the venue percentage)

The locked fee structure is platform fee 3.5% + $0.99 and processing 2.5%. The venue
share comes out of the platform fee margin, not on top of the buyer's price (or it
makes EventLinqs uncompetitive). So the real question: after paying Stripe (~1.75% +
30c) and the venue (4 to 5%), is EventLinqs still profitable? Model this carefully
before committing a venue percentage. It may require a slightly higher platform fee
for venue-partnered events, or the venue share being a portion of the platform fee
only. Do the maths, do not guess.

## The build (its own mission, after launch-readiness)

A venue subsystem: venue accounts and onboarding; venue-to-event linking by address;
automatic venue-share calculation tied to the fee engine (single source of truth, do
not fork fee logic); venue payout via the funds-holding payout path (the proven engine,
extended carefully and re-verified); a venue earnings dashboard; partnership agreement
copy. All gate-green, payment spine re-verified, ACCC-clean.

## The go-to-market layer (the magnet Lawal wants)

Treat the program as a marketing funnel: a venue-facing landing page that sells the
revenue-share offer, outreach material Lawal uses to approach venues, and SEO so venues
find it. This pitch material can be prepared EARLY (before the full payment plumbing
exists) so Lawal can start talking to venues at launch. Ties into the parked agentic
growth engine, the marketing/SEO tool stack (Semrush etc.), and the funnels, all of
which switch on at/after launch on the live platform.

## Status

LOCKED as the next MAJOR build after launch-readiness and the fee structure. Captured
in full so the vision is not lost. Built carefully, with the money path verified and
the exclusivity decision made, never rushed into the launch sequence. The venue PITCH
material can be prepared early for launch outreach.
