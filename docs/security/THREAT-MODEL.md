# EventLinqs threat model

Status: LIVE working document for the application security pass on
`fix/security-hardening`.
Written: 2026-08-08. Author: application security pass.
Standard: OWASP ASVS v5.0.0 (fetched from the published source, not memory).
Target level: **ASVS L2** for the whole application, with **L3** on the payment
path, the admin console, and the funds path.

This document is written BEFORE the audit and is the map the audit walks. It is
the reason a finding exists, not a summary of findings. Findings live in
`docs/security/AUDIT-2026-08-08.md`.

## Why the model comes first

The defect that triggered this pass was not a missing control. It was a missing
question. Every auth form was written as `<form onSubmit={handler}>` with
`preventDefault()`, which is correct once React is live and a credential leak
before it is:

```
/login?email=...&password=ArtistGate2026%21Drive
```

Nobody asked "what does this surface do in the window before its own code
exists". A checklist does not ask that. A threat model does, because it forces
each boundary to be named and each boundary to be asked what crosses it and
when. So the boundaries are named first, and the audit is the walk.

## What this application is, in security terms

A live Australian ticketing platform. EventLinqs is the merchant of record: it
holds buyer funds and disburses to organisers after the event. That single fact
sets the stakes. This is not a content site with a login. It is a system that
takes card payments from the public, holds other people's money, stores the
personal data of ticket buyers, and mints bearer credentials (tickets) that are
exchanged for physical entry to venues.

Stack and the security-relevant shape of it:

| Layer | Technology | Security consequence |
|---|---|---|
| Rendering | Next.js 16.2.7 App Router, Turbopack | Server and client code live in one tree. The `'use client'` boundary is a data-egress boundary that looks like an import. |
| Request interception | `src/proxy.ts` (Next 16 renamed middleware) | Single choke point for host canonicalisation, the `/dev/*` gate, the queue gate, and session refresh. A proxy bypass defeats all four at once. |
| Data | Supabase Postgres, RLS enabled on 69 tables | RLS is the backstop, but see the service-role note below. |
| Authorisation reality | 230 `createAdminClient()` call sites across 128 files | The service-role key bypasses RLS entirely. Every one of those 230 sites is a place where authorisation must be enforced in application code, because the database will not do it. This is the single largest authorisation surface in the system. |
| Payments | Stripe, platform-held funds, destination charges | Money moves. The webhook is the authority for granting tickets. |
| Shared state | Upstash Redis | Rate limits, feature-flag cache, inventory cache. Not namespaced per environment. |
| Email | Resend | Auth links, order confirmations. An email-sending endpoint is an abuse amplifier. |
| Hosting | Vercel | `x-forwarded-for` is platform-set and not client-spoofable (confirmed in Vercel's request-headers documentation), so IP-keyed limits have a trustworthy key. |

## Actors

Ranked by how much an attacker gains by becoming them.

### A1. Anonymous visitor (the stranger)
Reaches every public route with a browser and `curl`. No credential. This is the
actor that matters most: anything this actor can do is exploitable today by
anyone who finds the site. Capabilities: read public event data, hit every
unauthenticated API route, submit every public form, follow any bearer link
(ticket URL, share link, unsubscribe token, squad invite), and replay any
request they can observe.

### A2. Authenticated buyer
Has an account, has bought tickets, holds a session cookie. Wants: other
people's tickets, other people's personal data, a cheaper or free ticket, a
ticket without paying, someone else's order. The buyer is the natural IDOR
actor because the platform hands them object identifiers (order ids, ticket
codes, reservation ids) as a matter of normal operation.

### A3. Authenticated organiser
Owns an organisation, creates events, sees attendee data, receives payouts.
Wants: another organiser's attendee list (a competitor's customer database is
directly monetisable), another organiser's revenue figures, another
organiser's payout details, a higher payout, a lower platform fee. The
organiser is the most dangerous authenticated actor because the platform
deliberately gives them bulk access to personal data for their own events, so
the only thing standing between them and someone else's data is a correct
ownership check on every single query.

### A4. Admin / founder
Full platform control through `/admin`, gated by password plus TOTP plus
role. Wants (when impersonated): everything. Compromise of this actor is
total: pricing, payouts, refunds, user roles, feature flags. The admin login
page is therefore a higher-value target than the buyer login page, and the
admin's own credentials in a URL are a worse outcome than a buyer's.

### A5. Machine callers
Not human, and each is a distinct trust relationship:

- **Stripe webhook** (`/api/webhooks/stripe`). Inbound, unauthenticated at the
  network layer, authenticated by signature. It is the authority that grants
  tickets, so forging it forges tickets.
- **Vercel Cron** (12 routes under `/api/cron/*`). Inbound, bearer
  `CRON_SECRET`. Two of these move money (`event-disbursement`,
  `payout-holds-release`).
- **Supabase**, **Stripe API**, **Resend**, **Upstash**, **Anthropic**:
  outbound, credentialled by us.
- **Search-engine crawlers and link unfurlers**: anonymous, high volume, and
  they follow every URL they find, including ones that leaked into a Referer
  header or a share.

### A6. Non-production process holding production credentials
Called out as its own actor because it already happened. A local development
server inherited production Upstash credentials and wrote to production's
feature-flag cache. This actor has no malice and full authority, which makes it
the one that bypasses every control designed against A1 to A4.

## Assets

Ranked by loss if taken.

| # | Asset | Where it lives | Loss if taken |
|---|---|---|---|
| S1 | **Admin credentials** (password, TOTP seed, recovery codes) | Supabase auth, `admin_invites`, admin session cookie | Total platform compromise, including the money path. |
| S2 | **The funds path** (payout destination, disbursement trigger, fee value) | `organisations.stripe_account_id`, `payouts`, `pricing_rules`, the cron routes | Direct theft. Redirect a payout and the money is gone and not recoverable. |
| S3 | **Payment credentials** | Never ours to hold. Card data lives in the Stripe iframe. | Our exposure is Stripe API keys and webhook signing secrets, not PANs. |
| S4 | **Session tokens** | Supabase auth cookies, admin session cookie | Full account takeover for whichever actor owns the session. |
| S5 | **Personal data of buyers** | `profiles`, `orders`, `order_items`, `tickets`, `marketing_consents` | Privacy breach. Australian Privacy Act exposure, notifiable data breach obligations, and the single fastest way to destroy organiser trust. |
| S6 | **Organiser attendee data** | `orders` joined to `events` | The data-ownership promise is a headline product claim. A cross-organiser leak falsifies the pitch and hands a competitor a customer list. |
| S7 | **Ticket bearer credentials** (`ticket_code` plus `secret`) | `tickets` | Free entry. Forgeable or readable tickets mean revenue loss and door chaos. |
| S8 | **Organiser payout details** | `organisations`, Stripe Connect account | Fraud and identity exposure. |
| S9 | **Platform secrets** | Vercel env store, GitHub secrets | Depends which. `SUPABASE_SERVICE_ROLE_KEY` is total database compromise; `CRON_SECRET` is the money crons. |
| S10 | **Inventory integrity** (seats, tiers, holds) | `seats`, `seat_holds`, `reservations`, `ticket_tiers` | Oversell, double-book, or denial of sale by holding all inventory. |

## Trust boundaries

Each boundary is a place where data or authority changes hands. For each: what
crosses, what an attacker wants from it, and what currently stops them. The
"what stops them" column is the claim the audit must verify or refute. A claim
here is a hypothesis until the audit pastes proof.

### B1. Browser to server, before hydration
**What crosses:** raw HTML and native browser behaviour, with no application
JavaScript yet running.

**What an attacker wants:** the window in which the application's own
protections do not exist. Native form submission, native link following, and
native validation are all live before React is.

**What is meant to stop them:** nothing structural. This boundary was not
modelled at all, which is precisely how the `/login?password=` leak shipped. A
form with an `onSubmit` handler and no `action` is a GET to the current URL
with every field in the query string.

**Why this boundary is first:** it is the only boundary where the defence is
absent by default rather than present and possibly wrong. Every form in the
application is suspect until read, not just the auth ones. The leak destination
is browser history, server access logs, and the `Referer` header on the next
request, which is why the referrer policy is part of the same finding.

### B2. Browser to server, normal request
**What crosses:** session cookies, form bodies, JSON bodies, query strings,
route parameters.

**What an attacker wants:** to reach another actor's data by changing an
identifier, to reach a function they lack permission for, to forge a
state-changing request from another origin, or to send input the server trusts.

**What is meant to stop them:** the session cookie set by `@supabase/ssr`, the
`getUser()` check in server code, per-route ownership gates such as
`getOrganiserEvent()` and `resolveOrganiserScope()`, Zod-style input
validation, and Next.js Server Action origin checks. Security headers
(`next.config.ts`) constrain the browser side.

**Known weak point going in:** the protected-route list in
`src/lib/supabase/middleware.ts` is `['/dashboard']` only. Everything else is
default-public at the proxy layer, so `/admin`, `/account`, `/api/*`, `/scan`
and the rest must each enforce their own auth. That is a defensible design
(explicit-protected, and API routes genuinely should own their auth) but it
means the audit cannot infer that any route is protected. Each must be read.

### B3. The `'use client'` boundary
**What crosses:** every prop passed from a server component into a client
component, serialised into the HTML payload and readable with view-source.

**What an attacker wants:** columns the page never renders. A server component
that fetches a row with `select('*')` and passes the whole row to a client
component ships every column to the browser, including internal flags, PII, and
anything else on that row.

**What is meant to stop them:** developer discipline only. There is no
mechanical control. 155 client components exist. This is a read-every-boundary
problem, and ASVS 8.2.3 (field-level authorisation) is the requirement it maps
to.

### B4. Server to Supabase
**What crosses:** SQL through PostgREST, as one of two identities.

**What an attacker wants:** to be the service role.

**What is meant to stop them:** two different things depending on the client,
and this is the most important architectural fact in the model:

- **Anon client** (`src/lib/supabase/server.ts`, `middleware.ts`): carries the
  user's JWT. RLS applies. The database enforces authorisation.
- **Service-role client** (`src/lib/supabase/admin.ts`): bypasses RLS
  completely. The database enforces nothing. Authorisation is whatever the
  surrounding TypeScript happens to do.

230 call sites use the service-role client. RLS being enabled on 69 tables is
therefore not the protection it appears to be on those paths: it is switched off
by the key in use. Every service-role call site is a candidate authorisation
defect, and a missing ownership check there is invisible to any RLS review.

### B5. Server to Stripe
**What crosses:** secret API key outbound, amounts, destination accounts.

**What an attacker wants:** to change an amount, to change a destination
account, to reuse a payment intent, or to be granted a ticket without paying.

**What is meant to stop them:** server-side price computation from
`pricing_rules` through the single resolver, and the constitutional rule that
displayed fee equals charged fee via shared pure fee math. The audit's job here
is read-only: confirm the client cannot influence the charged amount, and
confirm the ticket grant is webhook-only. Per the brief, no change to
funds-holding logic without founder approval.

### B6. Stripe to server, inbound webhook
**What crosses:** an unauthenticated HTTP POST from the public internet that
grants tickets.

**What an attacker wants:** to forge one, or to replay a real one.

**What is meant to stop them:** `constructEvent` signature verification against
the endpoint signing secret, and a `processed_webhook_events` table for replay
suppression. Note the proxy deliberately exempts this path from host
canonicalisation and from cookie handling, so it is the one route that skips
`updateSession`. That exemption is correct (Stripe does not follow redirects)
and it also means this route has no session-layer safety net at all.

### B7. Cron to server, inbound
**What crosses:** a bearer token, and then money moves.

**What an attacker wants:** to trigger a disbursement early, repeatedly, or at
all.

**What is meant to stop them:** `requireCronAuth()`, which fails closed when
`CRON_SECRET` is unset, plus a 12-per-minute limit to blunt replay if the secret
leaks. The fail-closed posture is correct and deliberate, and the code comment
records that it was previously fail-open.

### B8. Server to shared Redis
**What crosses:** rate-limit counters, feature-flag state, inventory cache.

**What an attacker wants:** to make the rate limiter stop counting. Every
abuse-sensitive control on the platform (login, signup, password reset, magic
link, checkout, AI spend) is backed by this store, so the store is a
single point of failure for anti-automation.

**What is meant to stop them:** `failClosed: true` on the abuse-sensitive
policies, which blocks in production when the Upstash configuration is
missing.

**The gap the model predicts:** "configuration missing" and "store unreachable"
are handled differently. A transient error fails OPEN unconditionally. If an
attacker can induce that error state, every fail-closed policy becomes
advisory. Whether an attacker can induce it is the question the audit must
answer, not assume.

### B9. Environment to environment (the boundary that is not supposed to exist)
**What crosses:** credentials, when they should not.

**What an attacker wants:** nothing. This boundary is breached by accident, not
attack, and that is what makes it dangerous: it defeats controls without
tripping any of them.

**What is meant to stop them:** the env doctrine holds that development carries
no production secrets. Supabase has a real mechanism for this, the `*_PREVIEW`
overrides applied by `src/lib/supabase/env.ts`. Upstash has none:
`getRedisClient()` reads `UPSTASH_REDIS_REST_URL` and `_TOKEN` straight from
`process.env` with no environment binding and no assertion that the instance it
reached matches the runtime it is running in. Redis keys are not namespaced per
environment either (`ff:v1:<flag>`, `rl:<policy>:<ip>:<window>`), so a
credential mix-up is silent by construction. The already-observed incident is
the proof: namespacing one key fixed one symptom and left the shape intact.

### B10. Server to log sinks
**What crosses:** whatever is printed, plus whatever Sentry captures
automatically, including URLs and request context.

**What an attacker wants:** to read credentials and personal data out of a
place with weaker access control than the database.

**What is meant to stop them:** unverified. This is where the B1 leak lands, so
the two are the same finding seen from two ends: a password in a URL is a
password in the access log and, depending on the referrer policy, in a Referer
header too.

## Attack scenarios worth walking

Concrete paths, each of which the audit must either close or explain.

1. **Stranger reads a stranger's ticket.** Guess or harvest a `ticket_code`,
   then defeat the `secret`. Is the secret high-entropy, is the pair
   rate-limited, and does any surface leak either?
2. **Buyer reads another buyer's order.** Change an order id in a URL or an
   action argument and see whether any service-role query forgot its owner
   filter.
3. **Organiser reads another organiser's attendee list.** The
   highest-value IDOR on the platform. Every attendee, export, and reporting
   path must prove its ownership gate.
4. **Ticket without payment.** Find any path other than the verified webhook
   that inserts a ticket.
5. **Price tampering.** Submit a chosen amount at any point in the reservation
   to checkout flow.
6. **Rate limiter neutralised, then credential stuffing.** Push the shared
   store into its error path, then brute force the login.
7. **Admin credential capture.** Get the founder's admin password, TOTP, or
   recovery code into a log, a history entry, or a Referer header.
8. **Cross-organiser payout redirect.** Change a Stripe account id on an
   organisation you do not own.
9. **Attacker-supplied image reaches a native image library.** Uploads are
   processed by `sharp`, which currently carries known libvips CVEs.
10. **Proxy bypass.** The installed Next.js version is in the affected range
    for a documented App Router proxy bypass, and this application puts four
    security decisions in `proxy.ts`.

## What this model deliberately does not claim

- It does not claim RLS protects the 230 service-role call sites. It claims the
  opposite, and requires each to be read.
- It does not claim any route is authenticated because it sits under a path that
  sounds protected. The proxy protects `/dashboard` and nothing else.
- It does not claim a control works because a code comment says it does. Every
  "what stops them" above is a hypothesis. The audit pastes proof or downgrades
  the claim.
- It does not rank a theoretical weakness above something a stranger can do
  today. Exploitability is the ranking key, and the audit inherits that rule.

## Scope and conduct

In scope: the application. Authentication and session, every form and client
boundary, every API route and server action, data exposure and RLS,
the payment path read-only, headers and transport, dependencies, and the shared
store environment defect.

Out of scope without founder approval: any migration file, any environment
store, any Redis key, `vercel.json`, and any change to funds-holding payment
logic. The production Supabase database is never written to. No working exploit
is written against production: reachability is proven and then the work stops.
