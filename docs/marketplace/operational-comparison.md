# Performer marketplace: operational comparison (2026-07-11)

How the adjacent platforms run gig marketplaces, studied as a user from their
public documentation and review aggregates (concepts only; none of them is
named in any EventLinqs customer-facing copy), and precisely how the
EventLinqs closed loop surpasses each mechanic or dispositions it. Strategic
frame: social platforms are where artists get seen; EventLinqs is where they
get booked and paid. We own the money layer of a performer's career, never
the content layer.

## What they do

### Platform A (US entertainment lead marketplace)
- Anyone posts an event request free; it is broadcast to matching providers.
- Providers respond with quotes through on-platform messaging; profiles carry
  photos, videos, reviews, and badges computed from booking data.
- Fees on BOTH sides: provider memberships (hundreds of dollars a year for
  meaningful lead volume) plus a 2.5 to 5 percent provider booking fee plus a
  10 to 12 percent buyer service fee.
- Booking and payment on-platform: deposit up front, balance released after
  the event.
- No identity verification ("we do not endorse, sanction, or verify").
- Complaint pattern: untargeted lead spraying, ghost listings venues deny
  posting, months of paid membership with zero bookings, fee creep, and a
  hollowed-out free tier.

### Platform B (AU/NZ/UK casting and creator jobs)
- Free, moderated job posting with REQUIRED application assets (photo, video
  reel, audio reel) per listing; talent hosts unlimited media on-platform.
- Applying requires a paid subscription (roughly AU$20 to 45 a month): the
  pay-to-apply model.
- No on-platform booking or payment: once cast, everything moves off-platform
  and the platform earns nothing from the actual work.
- Complaint pattern: paying monthly to "maybe" get work, auto-renew traps,
  scam listings surviving moderation, and a re-platform that lost user data.

### Platform C (AU general services marketplace, mechanics reference)
- Free structured task posting with a poster-set budget; offers are free and
  carry the profile (ratings, completion rate, badges).
- Success-priced, double-sided fees (10 to 20 percent tiered on the tasker,
  a capped connection fee on the poster).
- True escrow: full amount captured at assignment, held, released after
  completion. The strongest verification stack of the set (government ID plus
  biometric, police check, licence badges).
- Complaint pattern: visible double-dipping fees, race-to-the-bottom
  lowballing, and vetting gaps despite the badges.

### Platform D (UK curated musician booking)
- Enforced MINIMUM budget floors per job (union-anchored) so musicians cannot
  be undercut below a fair rate; transparent take-home shown while quoting.
- Free to quote; single-sided 20 percent success fee; deposit plus held
  balance auto-paid 48 hours after the gig.
- Complaint pattern: non-refundable deposits demanded before meaningful
  contact.

### Platform E (EU live-music booking, SaaS model)
- Free gig calls from promoters; artist applications carry FANBASE AND
  STREAMING data as a draw proxy: the closest anyone gets to proof of draw,
  and it is still borrowed third-party data, not sales.
- Zero commission on the gig; monetised by artist subscriptions with
  application limits on the free tier (pay-to-apply by another name).

### Platform F (artist promotion layer, not a marketplace)
- Artists publish tour dates; followers get push and email alerts when a show
  lands nearby; fan demand signals ("request a show" by city) route tours.
  No posting, no applying, no booking, no payment.

## Where they are weak (the pattern across all six)

1. **Fees on performers for hope, not outcomes.** Pay-to-apply subscriptions
   and lead fees are the single most resented mechanic in every review
   thread.
2. **No ticketing loop.** Every one of them stops at (or before) the booking.
   None can see whether the room actually filled, so none can close the loop
   between booking a performer and selling the event.
3. **No proof of draw.** At best, borrowed streaming stats. Nobody can show
   an organiser what a performer verifiably SELLS, because none of them issue
   the tickets.
4. **Ghost listings and spray.** Free-text demand plus lead-fee economics
   produces untargeted blasts and listings nobody honours.
5. **Trust theatre.** Badges without held money, or moderation without
   identity, still produces the no-show and scam complaint patterns.

## How the EventLinqs closed loop surpasses them

| Mechanic | Their state of the art | EventLinqs |
|---|---|---|
| Proof of draw | Streaming stats as a proxy (Platform E) | Applications automatically carry PLATFORM-VERIFIED attributed ticket sales, lineup history from real events, and showcase links. Unfakeable: the same platform issued the tickets. |
| Application economics | Pay-to-apply or lead fees | Free to post, free to apply, no lead fees, no subscription. The platform already earns its ticketing fee on the event the gig feeds. |
| Posting integrity | Anyone posts; ghost listings | Posting is organiser-verified accounts only (active organiser lifecycle), and an organiser's listing sits beside their real on-platform event history. |
| Booking flow | Open chat with offer objects inside | Fully structured: application, then a booking request (gig, terms, note), accept or decline. No open messaging surface exists to spam. |
| Booking-to-event continuity | None (booking is the end) | Acceptance adds the performer to the event lineup in one tap, which mints their tracked share link and wires attribution automatically. The loop: gig posted, performer booked, event sells, draw data grows, better gigs follow. |
| Audience continuity | Alerts platform is separate (Platform F) | The performer's followers, alerts, and share cards are already native (Broadcast Layer); every booking feeds them with a buy button attached. |
| Trust and safety | Badges or escrow, rarely both | Verified organisers, rate limits on posting and applying, one-report-per-user queues into an audit-logged admin surface, and pair blocking that stops contact both ways. |

## BEHINDs found against them, each closed or dispositioned

1. **BEHIND: on-platform escrow of the performance fee** (Platforms C and D
   capture and hold the gig fee; we do not move performer money at all).
   DISPOSITION: deliberate, not closed. The mission boundary is that the
   funds-holding payment engine is never modified, and performer-fee escrow
   is a regulated money-movement feature the platform should only take on as
   a founder-approved workstream on the proven funds-holding spine. The
   structured pay-terms field on booking requests records the agreement; the
   money settles between the parties for now. Revisit post-launch.
2. **BEHIND: reviews and completion badges** (Platforms A and C compute trust
   badges from booking history). PARTIALLY CLOSED, honestly: our draw card is
   a stronger, harder signal than a star rating, and credits are
   auto-populated from real events. Star ratings between organisers and
   performers are deferred: reviews without volume produce fake-looking
   surfaces, which Law 1 forbids. Revisit when real booking volume exists.
3. **BEHIND: enforced pay floors** (Platform D's union-anchored minimums).
   DISPOSITION: not enforced at launch; the pay field is structured (fixed
   fee, door split, ticket share, negotiable) so floors can be added as a
   validation rule later without a schema change. An Australian floor needs
   an authoritative rate source before we hard-code one.
4. **BEHIND: identity verification tiers** (Platform C's ID and police-check
   badges). PARTIALLY CLOSED: organisers are lifecycle-verified (approve,
   suspend, reinstate) and performers claim profiles through authenticated
   accounts; document-grade identity checks ride the existing Stripe KYC for
   anyone who gets paid on-platform. Marketplace-specific badges deferred to
   the escrow workstream, where they belong.
5. **BEHIND: hosted media lockers** (Platform B hosts unlimited reels).
   DISPOSITION: deliberate, permanent. We own the money layer, never the
   content layer: video stays on the artist's own channels and embeds through
   the platform allowlist (up to six showcase links). No hosting cost, no
   moderation surface, no competing with the content platforms.
6. **BEHIND: demand-signal routing** (Platform F's request-a-show by city).
   DISPOSITION: out of scope for the marketplace; the platform's own demand
   engine (follows, alerts, waitlists) already carries this signal and the
   admin demand dashboard surfaces it. No duplicate build.

## The one-sentence verdict

Every adjacent platform monetises hope, the transaction, or tooling; none of
them sells the tickets, so none of them can prove a performer's draw or close
the booking into a selling event. EventLinqs gives the gig board away, makes
every application carry verified sales, and lands every booking on the lineup
of an event whose tickets it already sells: the closed loop none of them can
copy without becoming a ticketing platform.
