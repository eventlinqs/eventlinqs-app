# Launch-certification harness

`tests/e2e/certification.spec.ts` (run via `playwright.certification.config.ts`)
certifies the full buyer journey and the failure drills against a real, fully
wired deployment. It is built now so it runs the moment staging credentials
exist. It is excluded from the default Playwright suite and from CI, and it
skips cleanly when its env is absent.

## What it certifies

| Test | Covers |
|---|---|
| browse | `/events` lists events that link to `/events/[slug]` |
| event detail | a paid event shows the ticket panel and a buy CTA |
| happy path (free) | register a free ticket, reach a confirmed order with an order number |
| happy path (paid) | reserve, checkout, pay with Stripe test card 4242, Stripe webhook confirms the order, ticket issued with a scannable QR on the confirmation page |
| declined card | Stripe test card 4000 0000 0000 0002 surfaces a decline, no order is created, retry is possible |
| double-submit | the checkout submit disables while pending so a second click cannot create a second order (payment idempotency key is the server backstop) |
| expired reservation | visiting a reservation past its 10-minute TTL cannot be paid (redirect to browse with `reservation_expired`, or the in-page expired state) |

## Required environment

| Variable | Required | What it is |
|---|---|---|
| `CERT_BASE_URL` | yes | Base URL of the wired deployment, e.g. `https://staging.eventlinqs.com`. Without it the whole suite skips. |
| `CERT_PAID_EVENT_SLUG` | for paid + failure drills | Slug of a published PAID event whose organiser has a connected Stripe account with charges enabled. |
| `CERT_FREE_EVENT_SLUG` | for the free path | Slug of a published FREE event. |
| `CERT_EXPIRED_RESERVATION_ID` | for the expiry drill | A reservation id already past its 10-minute TTL (seed one, or create then let it lapse). |
| `CERT_BUYER_EMAIL` | optional | Buyer email for checkout. Defaults to a unique `cert+<ts>@eventlinqs.test`. Guest checkout is used; no login required. |
| `CERT_BUYER_NAME` | optional | Buyer name. Defaults to `Cert Buyer`. |

Each scenario skips with a clear message when its slug/id is not set, so you can
run a partial certification (for example browse + free path) before the paid
event and expired reservation are seeded.

## Deployment prerequisites (staging)

The harness drives the UI; the deployment behind `CERT_BASE_URL` must have:

- Supabase (staging Sydney project) reachable, with at least one published free
  event and one published paid event whose organiser's Stripe Connect account
  has charges enabled.
- Stripe in TEST mode, with a webhook endpoint at
  `<CERT_BASE_URL>/api/webhooks/stripe` subscribed to `payment_intent.succeeded`
  (plus the other Connect/payment events) and `STRIPE_WEBHOOK_SECRET` set on the
  deployment. The paid happy path only passes once the webhook actually
  confirms the order.
- The reservation-expire cron reachable (it releases stale holds); the expiry
  drill only needs a reservation that is already past TTL.

See `.env.staging.example` and the staging provisioning guide in that file's
companion section for the full deployment env.

## How to run

```
CERT_BASE_URL=https://staging.eventlinqs.com \
CERT_PAID_EVENT_SLUG=<paid-slug> \
CERT_FREE_EVENT_SLUG=<free-slug> \
CERT_EXPIRED_RESERVATION_ID=<expired-id> \
npx playwright test --config playwright.certification.config.ts
```

The HTML report lands in `qa/certification-report/`; traces, screenshots, and
video are retained on failure.

## Selector assumptions

Per the no-buyer-component rule the harness adds no `data-testid`s; it targets
accessible names (roles, labels, visible text). The one best-effort area is the
Stripe Payment Element iframe (`fillStripeCard`). If Stripe ships a markup
change, only that helper needs adjusting; the route flow is stable. The buyer
journey routes and field labels this harness relies on are:

- browse `/events` -> card link `/events/[slug]`
- event detail `/events/[slug]` -> "Get tickets" -> reservation
- checkout `/checkout/[reservation_id]` -> buyer name/email + "Continue to
  payment" -> Stripe Payment Element -> "Pay"
- confirmation `/orders/[order_id]/confirmation` -> issued ticket QR

## Status

Built and structurally validated (`playwright test --list` enumerates all seven
tests; tsc and eslint clean). Not yet executed end to end: that requires the
staging deployment and its credentials. Run it as the launch-certification gate
the moment staging is live, and record the pass in this file.
