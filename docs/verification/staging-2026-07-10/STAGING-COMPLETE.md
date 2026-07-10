# LAUNCH KIT LIVE ON STAGING (2026-07-10)

Deployment: `feat/launch-kit` at 10192b6, built by the Vercel git integration
and aliased to https://eventlinqs-staging.vercel.app (deployment
eventlinqs-135xh4khx). Environment verified: Supabase = TEST
(vkapkibzokmfaxqogypq; proven by TEST-only content resolving on staging),
Stripe = sandbox keys branch-scoped to feat/launch-kit, EMAIL_FROM corrected
to the verified eventlinqs.com sender (the unscoped preview value pointed at
the unverified send.eventlinqs.com and was overridden branch-scoped).
Production was never touched.

## 1. Launch Kit journey on real staging (screenshots 01-16)

Create seated event through the real wizard (cover upload to TEST storage,
40-seat chart attached) -> "Publish and get your launch kit" -> Kit screen
delivered -> poster PDF valid (286 KB) -> on-screen QR decoded
programmatically to its tracked short link -> the link opened as an anonymous
visitor landed on the live event page -> WhatsApp channel link clicked ->
reach panel shows 2 link views, 2 link clicks attributed. Mobile passes at
390x844 for the kit, waitlist, organiser page and home. Zero console errors
in every context. Note: kit-page short links carry the canonical domain
(NEXT_PUBLIC_SITE_URL); their paths were replayed against the staging host,
and the poster QR builds from the request origin.

## 2. Waitlist email end to end (screenshots 06-10b)

Joined the Geelong waitlist as eventlinqs-kit-944088@mailinator.com through
the real staging UI. The confirmation email ARRIVED in the public Mailinator
inbox (From hello@eventlinqs.com, sending IP 23.251.234.59, received
2026-07-10 12:19:40 local), rendered correctly (navy masthead, founding
candidate copy, one-click leave link), and the unsubscribe link's token page
was exercised: the deliberate button press set unsubscribed_at
(2026-07-10T02:19:48Z) in TEST, provably excluding the address. The TEST row
carries founding_candidate=true and the verbatim consent wording.

## 3. Copy on staging (screenshots 11-12, 15-16)

/organisers leads with "Build your event, map your room, get your complete
promo kit." / "In minutes. Free.", the launch kit band, and the Founding
Organiser offer (first 50, Geelong and Melbourne, 6 months fee-free plus 3
per referral, invite-only) linking into /waitlist. Home renders correctly.

## 4. Paid checkout regression (screenshots 17-19, paid-proof.json)

One standard purchase on staging: Harbour Lights Live (Geelong), Early Bird
AUD 15.00, ACCC all-in total AUD 16.90 shown before payment, card 4242 via
Stripe Payment Element, redirect_status=succeeded, order EL-G74QPXRV
CONFIRMED in TEST with 1 ticket minted. Zero console errors. Nothing in the
payment engine was modified. (Rig note: a coordinate click on Pay can be
swallowed by Stripe's invisible Link overlay; the form submit path, which is
what a real pointer drives, works - earlier attempts left a handful of
pending orders in TEST that expire with their reservations.)

## Staging URLs

- Launch Kit screen: https://eventlinqs-staging.vercel.app/dashboard/events/e54cb929-e194-4348-8ea3-87ddfe748111/launch-kit (organiser-gated; delivered at publish)
- Waitlist: https://eventlinqs-staging.vercel.app/waitlist
- Organiser page: https://eventlinqs-staging.vercel.app/organisers
