# Rate-limit doctrine: fail-open, fail-closed, and what each policy actually spends

Status: AUTHORITY for the fail-open / fail-closed decision.
Date: 19 August 2026.
Executable authority: `src/lib/rate-limit/policies.ts` (the table) and
`scripts/verify/rate-limit-audit.mjs` (the audit, which reads the table and the
call sites out of source and cannot drift from what ships).

Where this document and the policy table disagree, the table wins and the
disagreement is a defect to report. Where this document and a rationale STRING in
the table disagree about COST, run the audit: it traces the code.

---

## 1. The two behaviours, which are not the same thing

Read from `src/lib/redis/rate-limit.ts`.

**Missing configuration** (neither `UPSTASH_REDIS_REST_URL` nor
`UPSTASH_REDIS_REST_TOKEN` is set):

| policy | production | anywhere else |
|---|---|---|
| `failClosed: true` | BLOCK, 429 | allow |
| fail-open (default) | allow, unlimited | allow |

**Store error** (Upstash is configured and failing): every policy, fail-open and
fail-closed alike, degrades to a per-instance in-memory window. It is bounded, not
unlimited.

So `failClosed` decides the behaviour of a MISCONFIGURED DEPLOY, not the behaviour
of an Upstash incident. An earlier audit conflated the two and overstated the risk
of an outage. Size the decision against a deploy that went out without the
variables, because that is the only case it governs.

---

## 2. The launch-compose ruling, and why it is NOT to be reversed

**RULING (founder, 19 August 2026): `launch-compose` and `launch-compose-daily`
stay FAIL-OPEN.**

A prior ruling made them fail-closed. It was made on this premise:

> the compose path costs real money per request, so an unlimited AI endpoint
> during an outage is a bill with no ceiling.

**The premise was false, and it was supplied by an assistant, not by the founder.**
The compose path is deterministic. It calls no model and makes no network request.

The evidence, in the code, today:

- `src/app/launch/actions.ts` (`composeKit`): "DETERMINISTIC. It spends no model
  tokens."
- `src/lib/launch/compose.ts`: "THE ANONYMOUS COMPOSER, ON THE DETERMINISTIC
  FLOOR."
- `scripts/verify/rate-limit-audit.mjs` section 3b traces `composeKit` and reports
  **no metered external spend**, while reporting `emailKitToSelf` in the SAME FILE
  as an email sender. See section 4 for why that pairing is the proof and not a
  coincidence.

What a compose request actually costs: database writes and render CPU. There is no
third-party meter behind it.

**Why fail-open is the right posture given that.** The surface exists so a stranger
with no account can build a launch kit. It is the top of the acquisition funnel. A
deploy that shipped without the Upstash variables would, under fail-closed, return
429 to every first-time visitor on the one surface whose entire purpose is that it
always works, in exchange for protecting a spend that does not exist.

**If you are about to make this fail-closed, stop and answer this first:** what
does one compose request bill, to whom, and which line of code makes that charge?
Run `node scripts/verify/rate-limit-audit.mjs` and read section 3b before
answering. If the answer is still "nothing", the ruling stands.

This is the second time this decision has been made on a cost claim. It is written
down here so the third time starts from the measurement.

---

## 3. Fail-open policies that DO sit in front of a metered spend

Traced 19 August 2026 by `scripts/verify/rate-limit-audit.mjs` section 3b, from the
enclosing function of each rate-limit call plus one hop into the modules it calls.
Re-run it rather than trusting this table; it is a snapshot and the code moves.

These four are **REPORTED FOR A FOUNDER RULING, not changed.** A fail-open posture
is a founder decision, and the last one was reversed on a wrong premise, so the
correction is to supply the right premise rather than to swing the other way.

| policy | fail-open, and it spends | where | what bounds it today |
|---|---|---|---|
| `waitlist-join` | **Resend email, billed per message, from our sending domain** | `src/app/waitlist/actions.ts` -> `joinCityWaitlist()` -> `sendEmail()` | 5 per IP per 10 min. PUBLIC and unauthenticated. |
| `cron-job` | **Resend email, billed per message** | `src/app/api/cron/connect-divergence/route.ts` -> `GET()` -> `sendEmail()` | 12/min, and `CRON_SECRET` gates the route. The mail is a founder divergence alert and only sends when divergence is found. |
| `media-upload` | **Supabase Storage bytes, billed by stored GB and egress** | `src/lib/upload.ts`, `src/lib/organisation/logo.ts`, `src/app/actions/section-view-photo.ts` | 60/min, and every call site requires a signed-in user. |
| `payouts-stripe-link` | Stripe API call (no per-call fee, but a metered quota, and it mints a login-link token) | `src/app/api/payouts/stripe-dashboard-link/route.ts` -> `createDashboardLoginLink()` | 6/min, organiser-scoped. |

**The sharpest of the four is `waitlist-join`**, and the reason is written in the
policy table itself, one entry away. `launch-email` is the only fail-closed policy
on the launch surface, and its rationale says why:

> every other launch action is local computation with no marginal cost, while this
> one sends real mail from our verified domain. The cost of getting it wrong is not
> a bill, it is deliverability, and a sending domain burned by an open relay cannot
> be un-burned by a rate limit added later.

`waitlist-join` sends real mail from the same domain and is fail-open. Its rationale
says "the confirmation email is best-effort, so abuse cost is bounded", which prices
the email as a message and not as the sending domain. That is the same reasoning
`launch-email` rejects. The two policies are inconsistent with each other and one of
them is wrong; which one is a founder call.

`cron-job` and `media-upload` are materially weaker cases: both are gated by
something other than the limiter (a secret, a session), so a missing Upstash config
does not open them to an anonymous caller.

### Fail-open policies with no metered spend traced

`health-redis`, `health-sentry-error`, `launch-artefact`, `launch-compose`,
`launch-compose-daily`, `marketplace-report`, `newsletter-subscribe`,
`payouts-read`, `share-link-mint`, `share-track`.

Two notes a table cannot hold:

- `health-sentry-error` dispatches a Sentry event, which IS metered quota, and its
  own rationale says so. It is not listed above because the tracer looks at the
  handler and the Sentry dispatch sits behind the `HEALTH_CHECK_TOKEN` check. What
  the rate limiter guards there is the bucket, not the quota. Worth knowing: the
  limiter runs BEFORE the token check, so an unauthenticated flood can exhaust the
  window and lock out the monitoring agent without ever producing a Sentry event.
  That is denial of monitoring, not spend.
- `launch-artefact` renders with sharp, which is Vercel Active CPU. Real compute,
  no third-party per-request meter.

---

## 4. The tracer has a control, because it measures an absence

"`launch-compose` spends nothing" is a claim of absence, and an absence reported by
a broken tracer is indistinguishable from an absence reported by a working one.

The first version of section 3b scanned the call-site FILE and its imports. It
reported `launch-compose` as an email spend path, because
`src/app/launch/actions.ts` also contains `emailKitToSelf` and therefore imports
`kit-email` at the top of the file. That is the exact false premise this document
exists to prevent, regenerated by the tool written to prevent it.

So the audit now scopes to the enclosing function, and proves it can, every run:

```
CONTROL: can this tracer tell two handlers in one file apart?
  launch-email   (same file) sends email: DETECTED       handlers: src/app/launch/actions.ts:emailKitToSelf
  launch-compose (same file) sends email: NOT DETECTED   handlers: src/app/launch/actions.ts:composeKit
  CONTROL PASSES
```

If that control ever fails, every "no metered external spend traced" line is
UNKNOWN, not clean, and the audit says so and records a finding.

---

## 5. The bucket is half the limit, and it is where the table has been wrong

A limit is a number AND a bucket. The number is in the table and is reviewable. The
bucket lives at the call site, and until 19 August 2026 nothing compared the two,
so a rationale could say one thing while the code did another and no gate could
notice.

`scripts/verify/rate-limit-audit.mjs` section 3c now reads the key expression out of
each call site, by parsing the argument list rather than pattern-matching the call,
and prints it beside what the prose claims. Two things it found:

- **`event-create` (FIXED 19 August 2026).** Shipped that morning with a rationale
  reading "per organiser per hour" and a call of `actionRateLimit('event-create')`
  with no identifier, which defaults to the forwarded IP. Now passes `user.id`
  explicitly. Both halves of the old behaviour were wrong at once: the named threat
  is one free account looping, which an address stops bounding the moment the
  account moves, while a shared office put every legitimate organiser behind it
  into one bucket of thirty an hour. Account minting is bounded upstream by
  `auth-signup`, which is where it belongs.
- **`payouts-read` (OPEN, for a founder ruling).** The rationale said "60/min per
  user"; all three routes key by IP. The prose was corrected rather than the code,
  and deliberately: moving the bucket to the organiser means moving the limiter
  after `resolveOrganiserScope` on three routes, which is a behaviour change on a
  surface that was not under review. It is a read path with no metered spend, so
  the cost of the IP bucket is a shared office losing dashboard refreshes, not a
  bill. **The ruling to make: re-key to the organiser, or accept the address
  bucket.**

The check's own history is the reason it parses rather than greps. Earlier versions
of it reported `ai-chat`, `ai-chat-daily` and `payouts-read` as mismatches when the
first two were correct: `applyRateLimit` takes a third `identifierOverride`
argument, the AI routes pass `user?.id ?? clientIp(request)`, and a regex that only
knew the two-argument form called that the IP default. Three false findings on the
platform's most expensive policy, from a check written to prevent exactly that. It
is the same shape as the two false "dead limiter" findings before it, and the same
answer applies: know every call shape, or report UNKNOWN instead of guessing.

## 6. Policies that were deleted rather than wired

`location-set` (deleted 19 August 2026, commit 11d07fcf). It guarded a write to a
location preference that does not exist: `profiles.preferred_city` is READ by the
affinity and feed fetchers and written by nothing. A policy for a surface that does
not exist reads as protection and is not any, and inventing the surface to justify
the policy is the wrong direction.

`docs/hardening/phase1/rate-limit-handoff.md` (2 May 2026) still refers to
`POST /api/location/set` and proposes a `checkout-confirm` policy. That document is
HISTORICAL. This one and the policy table are current.

---

## 7. Before launch

Both variables must be set in production:

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Declared in `src/lib/env/manifest.mjs`, which is not the same as set. Without both,
production is either refusing paying customers (every fail-closed policy returns
429, which includes checkout, signup, login and password reset) or unthrottled on
the fail-open ones. Verify by confirming a limiter actually returns 429 on the
(limit + 1)th request against the preview, measured, not assumed: it has been
measured both ways before, and an unconfigured Upstash allowed everything.
