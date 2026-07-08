# Platform surpass audit (2026-07-05)

Match first, then surpass: anywhere EventLinqs merely equals a competitor
is treated as a failure to fix. Grounded in the live four-platform study of
2026-07-04 (`docs/design/competitive-analysis-2026-07-04.md`, every claim
fetched and cited), the seating studies (`docs/seating/`), and today's
payout-timing checks:
[Humanitix payouts](https://help.humanitix.com/en/articles/8889219-when-will-my-event-be-paid-out)
(default 5 business days post event, most processed about 2 business days
after end, plus 1 to 3 bank days),
[Eventbrite payouts](https://www.eventbrite.com/help/en-us/articles/640593/when-do-i-get-paid/)
(processing starts 3 days post event, up to 5 further bank days in
Australia). Experience and concepts studied only; no competitor code,
markup, or assets inspected or reproduced.

## Axis A: organiser experience

| Competitor | Where they are |
|---|---|
| Humanitix | Solid self-serve console; seating builder; no hold timers; remap tiers every event |
| Eventbrite | The most mature dashboards and sales analytics; fee upsells inside the tooling; US spelling on the AU surface |
| DICE | Sales-gated; small organisers cannot self-serve at all |
| Ticketek | No self-serve product; the organiser front door is a help-desk article |

Where we are: AHEAD on the seat builder (one-tap tables, safe templates,
tier binding by name), the wizard (7 steps, immediate image preview), data
ownership (full export, consent recorded), and the door scanner (seat on
the ADMIT panel). MATCH on the dashboard overview: our stat tiles equal
Humanitix and trail Eventbrite's analytics depth, and nothing on the
organiser's event screen answers the one question every organiser wakes up
with: how do I fill the room?

EDGE TO BUILD (A1, impact HIGH, effort MODERATE): the FILL THE ROOM panel
on the organiser's event screen: who is going (real sold count), how many
followers will be alerted, how many signups the event's shared links have
driven, and a one-tap attributed share kit, all live data already in the
platform. Eventbrite shows sales; nobody shows an organiser their own
reach engine working. Ranked above deeper sales charts (A2, HIGH effort,
Eventbrite parity-chasing rather than surpassing) and payout schedule
customisation (A3, LOW impact pre-launch).

## Axis B: buyer and attendee experience

| Competitor | Where they are |
|---|---|
| Humanitix | Event pages are long single-column text walls; follow-without-account is their best buyer device |
| Eventbrite | Strong discovery flywheel; price hidden off the page body; stale incident banners observed live |
| DICE | Best-in-class app feel; web is a funnel; all-in price at the buy button |
| Ticketek | Date-dropdown purchase entry, compliance wall above the artist story, no prices before selection |

Where we are: AHEAD on the seat map, share cards, who's-going, hover and
imagery standards, all-in pricing at the point of decision. MATCH on the
practical-questions moment: like every competitor, the practical answers a
buyer needs on the night (when do doors open, what happens if it is
cancelled, is there accessible seating, what do I show at the door) are
scattered down the page or missing, and Ticketek actively buries them.

EDGE TO BUILD (B1, impact HIGH, effort LOW): KNOW BEFORE YOU GO: one
scannable card on every event page compiling the real answers from data
the platform already holds (doors and local start time, venue with a
directions link, age rule, accessible seating detected from the chart,
refund position, QR-at-door entry note). Every section renders only when
the platform truly knows the answer. Ranked above wallet passes (B2, HIGH
effort, certificate plumbing) and saved-search alerts (B3, demand engine
already covers follows and alerts).

## Axis C: the money story

| Competitor | Fees (published) | Payout (published) |
|---|---|---|
| Humanitix | 4% + $0.99 AUD incl processing (charities 2.5% + $0.50) | Default 5 business days post event; most initiated about 2 business days after end + 1 to 3 bank days |
| Eventbrite | 3.7% + $1.79 + 2.9% processing AUD, a click deep behind a "transparent fees" claim | Processing starts 3 days post event + up to 5 bank days (AU) |
| DICE | No public organiser pricing at all | Not published |
| Ticketek | No public organiser pricing at all | Not published |

Where we are: AHEAD structurally: 3.5% + $0.99 platform + 2.5% processing
published and admin-tunable, ACCC all-in shown from the first click, the
live payout calculator on /organisers running the exact charge maths, and
payouts within 5 business days of event end through the funds-holding
engine. HONEST NOTE: we do not beat Humanitix on raw payout initiation
speed (their ~2 business days versus our within-5 promise), so the edge is
level-of-fee plus radical transparency, and the audit does not claim
otherwise. MATCH on visible comparison: like everyone, we currently make
the buyer or organiser do the cross-platform maths themselves.

FINDING FOR THE FOUNDER (surfaced by this audit, P0 honesty): the locked
doctrine's "cheaper than Humanitix" claim does NOT hold on an all-in
basis. Humanitix's published 4% + $0.99 INCLUDES payment processing;
ours is 3.5% + $0.99 platform PLUS 2.5% processing. At a $30 ticket,
buyer-pays default: Humanitix about $32.41 all-in (their fee attracts GST
on top), EventLinqs $32.79, Eventbrite $33.77. We are far cheaper than
Eventbrite and slightly ABOVE Humanitix all-in at typical price points.
A public three-way price table would therefore either mislead or
advertise Humanitix, so it is NOT built. Decision needed: trim a rate in
/admin/pricing (for example processing to 2.2% or platform to 3.2% makes
the all-in claim true at $30+), or scope the marketing claim to the
platform fee only.

EDGE TO BUILD (C1 as pivoted, impact HIGH, effort LOW): SEE YOUR EXACT
NUMBERS on /pricing: the live payout calculator (the exact charge maths,
absorb or pass toggle) joined by a WHAT WE PUBLISH disclosure table:
fees published, payout timing published, all-in shown at first click,
live calculator, attendee data ownership: EventLinqs ticks every row;
Eventbrite hides fees a click deep, DICE and Ticketek publish nothing.
Radical transparency IS the honest money edge today. Ranked above instant
payouts (C2, engine change, forbidden) and any price-war table (see the
finding).

## Axis D: broadcast and reach

| Competitor | Where they are |
|---|---|
| Humanitix | Bare share icons, no attribution, no incentive |
| Eventbrite | Discovery flywheel serves EVENTBRITE (cross-sell to other events); organiser reach tools are paid ads and a $15/month email upsell |
| DICE | The 41% discovery stat is the pitch, but organisers buy it on faith; sales-gated |
| Ticketek | Waitlists capture demand for Ticketek, not for the organiser |

Where we are: AHEAD on plumbing: attributed share links on every event
page and confirmation (share-a-ticket, per-referrer codes), signup
attribution recorded and summarised, share-your-seat, per-event OG
invitation cards, follows and alerts live. BEHIND on visibility: none of
that reach is shown to the organiser, so the wedge is invisible exactly
where the switching decision happens. The full broadcast layer (trackable
short links, QR poster kit, digest) lives on the launch line; this branch
must surface what exists here without duplicating that work.

EDGE TO BUILD (D1, impact HIGH, effort LOW-MODERATE): the REACH module
inside the Fill the room panel: "N signups arrived through shares of this
event" (real attribution rows), the attributed link and WhatsApp share kit
one tap away, and the OG share-card preview, making EventLinqs the only
platform where an organiser watches the share loop work on their own
event. RECONCILIATION FLAG: when the broadcast layer's reach panel merges
from release/launch-line, its short-link stats join this module rather
than getting a second surface.

## Build decision (one visible edge per axis)

1. A1 + D1: the Fill the room panel with the reach module (one surface,
   two evidenced edges).
2. B1: Know before you go on every event page.
3. C1: What you keep comparison on /pricing.
All behind the `surpass_edges` feature flag, default ON for testing, design
system throughout.

## Step 3: proof (docs/surpass/evidence/)

All three edges captured live on the TEST production build
(surpass-proofs.json is the machine-readable record):
- A1 + D1 Fill the room: surpass-fill-the-room-desktop.png shows the panel
  live on the organiser event screen with real numbers (3 going, 0
  followers, 0 share signups: honest zeroes for a fresh test organisation)
  and the attributed share kit. Why an organiser prefers ours: Eventbrite
  shows sales; only EventLinqs shows an organiser their own demand and
  share loop working, with the lever one tap away.
- B1 Know before you go: surpass-know-before-desktop.png and -mobile.png;
  rows rendered from real data only (When, Getting there, At the door,
  Accessible seating, If plans change). Why a buyer prefers ours: Ticketek
  buries these answers in a compliance wall and Humanitix in text walls;
  ours answers the night's five questions in one card.
- C1 See your exact numbers + What we publish:
  surpass-pricing-desktop.png; the live calculator and the sourced, dated
  disclosure table. Why an organiser prefers ours: DICE and Ticketek
  publish nothing, Eventbrite hides its rates a click deep; EventLinqs
  shows the exact charge maths before signup.

Regression smoke re-run green on the same build: wizard advances, seated
free purchase mints a sold-seat ticket, paid GA checkout renders with the
pay button, the public share bar stands (surpass-proofs.json).

## Reconciliation flags for other workstreams

1. The organiser event screen's KPI row still shows pre-existing "Page
   views" and "Conversion" tiles reading "Wiring up in M5": a placeholder
   on a shipped surface (constitution breach that predates this pass).
   Either wire them or remove the tiles; the Fill the room panel makes the
   reach story without them.
2. When the broadcast layer's reach panel merges from release/launch-line,
   its short-link stats belong INSIDE Fill the room, not on a second
   surface.
3. The all-in fee finding versus Humanitix (axis C) needs a founder
   pricing decision; the disclosure table stays honest either way.
