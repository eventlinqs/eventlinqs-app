# EventLinqs: Scale and Load-Test Plan

Status: authoritative robustness program. Owner: founder + engineering. Version 1.0, 31 May 2026.
Scope: how EventLinqs proves it can take a national-scale on-sale without overselling, without the storefront falling over, and without an organiser ever failing to get paid. This document defines the bar, the staging rig, the bottlenecks, the test ladder, the queue throttle, and the production safeguards. It changes no application code; it is the contract the code is then made to satisfy.

Competitor grounding is deliberate throughout. The mission is to surpass Ticketmaster.com.au, Eventbrite.com.au and DICE.fm, not to reach parity. Every target below is set at or above what those platforms demonstrably do, and every mechanism is one those platforms already rely on. Where a target is more aggressive than the incumbent, that is the point.

---

## 0. The one architectural fact that frames everything

EventLinqs does not open raw Postgres connections. Every server path that touches the database under load (browse, reservation, checkout, squad checkout, the Stripe webhook) goes through `@supabase/supabase-js` / `@supabase/ssr` clients pointed at the PostgREST HTTPS endpoint (`https://<ref>.supabase.co`). There is no `postgres://` connection string, no port 6543 or 5432, and no `pg` / Prisma / Drizzle / Kysely driver anywhere in the dependency tree or source.

Consequence: the classic serverless-Postgres failure mode (each function instance opening a direct 5432 connection and exhausting `max_connections` during a flash sale) does not apply in its usual form. Supabase's PostgREST tier owns the actual Postgres connections and pools them internally. The scale risk therefore shifts to three places this plan targets directly:

1. PostgREST's own pool to Postgres saturating under extreme requests per second.
2. `FOR UPDATE` row locks inside `create_reservation` and `confirm_order` serialising under contention on a hot tier.
3. The database compute tier ceiling (CPU, memory, pooler capacity) for the chosen Supabase plan.

Hard rule for the future: if any direct-connection component is ever introduced (a migration runner inside a function, a raw SQL job, an ORM), it must use Supavisor transaction mode on port 6543, never 5432, on serverless. Today this is not applicable and must stay that way unless deliberately revisited.

---

## 1. The SLO bar (the standard we hold the line on)

These are the numbers a national ticketing platform is judged against during an on-sale. The first is an invariant, not a target: it is never traded away for any other metric.

### 1.1 Hard invariant: zero oversell

Under every load profile, for every ticket tier, at every instant and at final settlement:

```
sold_count + reserved_count <= total_capacity        (always, no exceptions)
issued_tickets(tier)        <= total_capacity        (at settlement, exactly)
```

Overselling is the single failure a ticketing platform cannot recover from: it is a refund, a legal exposure, and a reputational event all at once. Ticketmaster and Eventbrite both treat a confirmed oversell as a Sev-1. EventLinqs treats even a transient breach of the first line above (a momentary negative availability) as a test failure, because under real money that transient becomes a double-sold seat. The spike/drop test in section 4 asserts this invariant by direct query after the storm, and the run fails if a single tier breaches it.

### 1.2 Service-level objectives under peak (a live high-demand drop)

| Objective | Target under peak | Why this number, grounded in the field |
|---|---|---|
| Storefront availability during a drop | 100% of users get a usable response (queue page or event page), 0% see a hard error or timeout | Ticketmaster's entire on-sale model exists to keep the storefront answering during a herd (the Eras Tour presale took ~3.5 billion requests; the lesson was that the queue must absorb the herd so the store never simply dies). EventLinqs matches that model: nobody gets a dead page, everyone gets the queue or the store. |
| Mobile p95 page response under peak | < 1.5 s | DICE is mobile-first and sells out high-demand shows on phones; 88% of ticket discovery and purchase is mobile (scope section 10.2). Google's "good" LCP is 2.5 s; we set 1.5 s p95 to be visibly faster than the incumbents on the device that matters. |
| Checkout completion p95 (reservation through PaymentIntent) | < 8 s end to end | Scope SLO 2.6.2. Eventbrite and Humanitix complete an on-sale checkout in single-digit seconds; we hold the same and verify it under load, not just at rest. |
| Error rate (5xx + unhandled) under peak | < 0.1% of requests | Three nines of successful requests is the marketplace-and-payments norm (Stripe-grade). Anything above 0.1% during an on-sale is a degraded sale. |
| Search response p95 | < 100 ms | Scope SLO 2.6.2. Discovery must stay instant while a drop is happening on another event. |
| Payment success rate (excluding user cancels) | > 98% | Scope SLO 2.6.2; gateway-webhook measured. |
| Queue admission fairness | First-come-first-served, position monotonic, no starvation | Ticketmaster and DICE both sell fairness as a feature against bots and touts. Our queue is cryptographically ordered (HMAC tokens) and must demonstrably admit in order. |

### 1.3 What "pass" means

A load tier passes only when every objective above is met for that profile AND the zero-oversell invariant holds exactly. A green latency chart with one oversold seat is a failure. A perfect inventory ledger with a storefront that returned 503s is a failure. Both must be true together.

---

## 2. Staging environment that mirrors production (never load-test prod)

Production is never the target of a load test. A simulated 50,000-user drop against the live platform would create real reservations, real PaymentIntents, real Stripe webhook traffic, real emails, and could oversell a real organiser's event. Ticketmaster, Eventbrite and DICE all rehearse big on-sales in dedicated performance environments; EventLinqs does the same.

### 2.1 The staging rig (a full parallel stack)

| Component | Production | Staging (this plan provisions) | Isolation requirement |
|---|---|---|---|
| Vercel project | `eventlinqs` (prod) | a separate Vercel project / environment with its own deployment and domain (for example `staging.eventlinqs.com`) | separate project so staging deploys and traffic never touch prod functions or analytics |
| Supabase | Sydney project `<prod-ref>` | a separate Supabase Sydney project `<staging-ref>`, same region, same migrations applied via `supabase db push`, same compute tier as the prod target | a distinct project ref and database, seeded with synthetic events and tiers, never the prod database |
| Redis | Upstash (prod) | a separate Upstash database, Sydney region, same plan as the prod target | distinct REST URL and token; the load test must not share rate-limit or inventory-cache keys with prod |
| Stripe | live mode (post flip) or test | Stripe TEST mode only, separate restricted keys and a separate webhook endpoint pointed at staging | test-mode keys exclusively, so no real charge is ever possible from a load test |
| Email | Resend (prod domain) | Resend test/sandbox or a suppressed-send key | load tests must not fan out tens of thousands of real emails |
| Monitoring | Sentry prod project | Sentry staging project / environment tag `staging` | staging errors never page the prod on-call |

### 2.2 Parity rules

- Staging runs the exact commit under test (the same build artefact you intend to ship), not an approximation.
- Staging Supabase is on the same compute tier as the production target for the launch. Testing on a smaller tier proves nothing about the launch ceiling; testing on a larger tier hides the real bottleneck. Size staging to the launch plan, then load-test, then confirm the prod plan matches.
- Staging is seeded with a realistic catalogue: a few thousand published events, at least one designated "drop" event with a constrained hot tier (for example 500 or 1,000 capacity) so contention is real, and a spread of free and paid tiers.
- Region alignment is part of parity. Production Vercel functions should be pinned to a region close to Supabase Sydney (for example `syd1`) so the function-to-PostgREST round trip is not a cross-Pacific hop. Note: at the time of writing there is no explicit Vercel region pin, so functions default to a US region (for example `iad1`), which adds ~200 ms of avoidable round-trip latency to every DB call. Pinning the region is a launch action (tracked in section 7), and staging must mirror whatever production uses so the latency numbers are honest.

### 2.3 Synthetic identities and cleanup

- Load tests use synthetic guest sessions and test users only. No real attendee or organiser identity is ever used.
- Every test run is bracketed by a teardown that returns inventory to baseline and removes synthetic reservations, orders, and queue rows, so the next run starts clean and the staging catalogue does not drift.

---

## 3. Per-component bottleneck inventory

The order below is the order in which these components fail as load climbs. Each entry states the limit, how to observe it, and the mitigation this plan validates.

### 3.1 Database access path (PostgREST pool and DB compute)

- Limit: PostgREST holds a fixed-size internal pool to Postgres sized by the Supabase compute tier. Beyond it, requests queue inside PostgREST and latency climbs, then `503`/`pgrst` errors appear. The DB compute tier (CPU, RAM) caps total throughput regardless.
- Observe: Supabase dashboard (database CPU, active connections, pool saturation), PostgREST error rate, and p95 of RPC calls in the k6 output.
- Mitigate and validate: keep read traffic off the DB via edge caching (3.3); keep write transactions short (3.2); size the DB compute tier to the stress-test result, not to a guess; if a direct-connection component is ever added, force Supavisor transaction mode (6543). The stress test (section 4) finds the requests-per-second at which the DB path is the binding constraint and records it as the platform ceiling.

### 3.2 Reservation oversell under contention (the row-lock path)

- Limit: `create_reservation` takes `SELECT ... FOR UPDATE` on the hot tier row, checks `total_capacity - sold_count - reserved_count`, increments `reserved_count`, and inserts the reservation, all in one transaction. `confirm_order` similarly locks the order and reservation. On a single hot tier, every concurrent buyer serialises on that one row lock. This is correct (it is what prevents oversell) but it is also the throughput ceiling for a single tier: the tier can only process reservations as fast as the lock can be taken, the check run, and the transaction committed.
- Observe: lock wait time and transaction duration on the hot tier; reservation success/failure mix in k6; and the post-run invariant query.
- Mitigate and validate: this is the heart of the spike/drop test. The point is not to remove the lock (the lock is the safety) but to prove two things at once under maximum contention: (a) the invariant in 1.1 never breaks, and (b) the serial throughput of one hot tier is high enough, behind the queue, to clear the admitted batch within the cart window. The queue (section 5) is what keeps the number of buyers hitting that lock at any instant bounded, so the lock never becomes a global stall. The reservation-expiry sweeper (now scheduled every minute) is what returns abandoned holds so the lock path does not leak capacity during a long drop.

### 3.3 Page caching (keeping the storefront read path off the DB)

- Limit: if every event-page view hit PostgREST, a drop would drive the DB into the ground on reads alone, before a single ticket sold. The defence is that public storefront pages are statically generated and revalidated (ISR): event detail revalidates every 300 s, the events list every 60 s, city pages every 300 s. Served from the Vercel edge cache, these reads do not touch the database per request.
- Observe: Vercel cache hit ratio on storefront routes during the test; DB read RPS during a read-heavy profile.
- Mitigate and validate: the average and stress tests include a read-heavy browse profile and assert that storefront p95 stays under target while DB read RPS stays low (proving the edge cache, not the DB, is serving the herd). Any storefront route that is accidentally dynamic (touches `cookies()` and so opts out of ISR) is a caching regression and must be caught here. Personalised and inventory-exact surfaces (the live "X left" count, the buy action) are intentionally dynamic and are exercised separately.

### 3.4 Redis throughput (Upstash)

- Limit: Upstash bounds requests per second and adds latency when cross-region. Redis backs the inventory display cache (30 s TTL), rate limiting, and the queue tokens. A free-tier, US-region database is both slower (cross-Pacific) and rate-capped relative to a Sydney paid plan.
- Observe: Upstash dashboard (requests/sec, throttling, latency) and the `/api/health/redis` latency probe during the test.
- Mitigate and validate: migrate Redis to a Sydney paid plan before the launch load test, and size it to the spike profile. The graceful-degradation requirement (6.1) is that a Redis failure degrades to a DB read for inventory display and fails open or closed deliberately for rate limiting and the queue, never a hard 500. The spike test injects a Redis slowdown to confirm degradation, not collapse.

### 3.5 Vercel function concurrency

- Limit: serverless functions have a concurrency ceiling per plan and per region; beyond it, requests queue or cold-start, adding latency. The reservation and checkout server actions, the webhook, and the cron routes all run as functions.
- Observe: Vercel function metrics (concurrency, cold starts, durations, error rate) during each profile.
- Mitigate and validate: pin functions to the Supabase region (section 2.2); keep function work short (the DB does the heavy atomic work via RPC); rely on the queue to bound concurrent checkout attempts. The stress test records the concurrency at which cold starts or queueing push p95 past target.

### 3.6 Stripe limits

- Limit: Stripe enforces API rate limits (the default read/write ceiling is roughly in the low hundreds of requests per second and can be raised on request) and delivers webhooks asynchronously. A drop creates a burst of PaymentIntent creations and a following burst of `payment_intent.succeeded` webhooks.
- Observe: Stripe dashboard (API request rate, 429s, webhook delivery latency and retries) in test mode during the spike test.
- Mitigate and validate: every payment write already uses idempotency keys, and the webhook is idempotent via `processed_webhook_events`, so Stripe retries and duplicate deliveries cannot double-issue (this is already unit-proven and is re-asserted under load). The queue bounds PaymentIntent creation rate to the admitted batch rate, keeping the platform well under Stripe's ceiling. If a launch is expected to exceed default Stripe limits, request an increase ahead of time; the spike test confirms the admitted-batch rate stays under the negotiated ceiling.

---

## 4. The escalating k6 load-test ladder

Five profiles, each with a defined intent, a VU/arrival shape, pass thresholds, and a teardown. Each runs only against staging (section 2). Scripts live under `tests/load/` (added in a later implementation PR, not this one). The k6 examples below are illustrative of the thresholds and the oversell assertion; they are documentation, not shipped application code.

Common thresholds applied to every profile unless overridden:

```js
thresholds: {
  http_req_failed:   ['rate<0.001'],                  // < 0.1% errors (SLO 1.2)
  http_req_duration: ['p(95)<1500'],                  // mobile p95 < 1.5 s (SLO 1.2)
  checks:            ['rate>0.999'],                  // functional checks must pass
}
```

### 4.1 Smoke (correctness at low load)

- Intent: prove the test harness, the staging rig, and the happy path before spending money on big runs. Catch broken auth, broken seeds, wrong base URL.
- Shape: 1 to 5 VUs, 1 to 2 minutes, the full journey (browse, event detail, reserve, checkout to PaymentIntent created, free RSVP).
- Pass: zero failures, every functional check green, one synthetic ticket issues end to end in test mode.

### 4.2 Average load (a normal busy evening)

- Intent: the everyday national baseline: many people browsing, a steady trickle buying across many events, no single drop.
- Shape: a constant-arrival-rate browse profile (read-heavy, hitting cached storefront routes) plus a low-rate purchase profile spread across many events. Target an arrival rate representative of a busy evening (for example a few hundred requests per second of browse, a few purchases per second).
- Pass: storefront p95 < 1.5 s, checkout p95 < 8 s, error rate < 0.1%, and DB read RPS stays low (proving the edge cache is serving browse, section 3.3).

### 4.3 Stress (find the ceiling)

- Intent: ramp until something becomes the binding constraint, and name it. This is the test that produces the platform's honest capacity number.
- Shape: step the arrival rate up in stages (for example 2x, 4x, 8x the average) until a threshold breaks. Hold each step long enough to see steady state.
- Pass criteria are different here: the test is expected to eventually degrade. "Pass" means the degradation is graceful (latency climbs, then requests shed cleanly with 429/queue, never a 5xx storm or an oversell), the binding component is identified (almost always 3.1 the DB path or 3.2 the hot-tier lock), and the requests-per-second at first threshold breach is recorded as the documented ceiling that the queue admission rate (section 5) is then set below.

### 4.4 Spike / drop (the flash-sale, and the zero-oversell proof)

- Intent: the marquee test. Simulate a high-demand on-sale: thousands of users arrive within seconds for one event with a deliberately constrained hot tier, far exceeding its capacity. This is the Taylor-Swift-presale shape in miniature, and it is where Ticketmaster has historically failed. EventLinqs must not.
- Shape: from near-zero, jump to a very high VU count (for example 5,000 to 20,000 virtual users) arriving over a few seconds against one event, with the queue active (section 5). Demand must exceed the hot tier capacity by a large multiple (for example 10,000 buyers chasing 1,000 seats) so contention and sell-out are both real.
- Pass, both must hold:
  1. Availability: every VU receives either the queue page or the store, never a hard error; storefront and queue p95 stay under target; error rate < 0.1%.
  2. Zero oversell, asserted exactly. After the storm settles, query staging directly:

```sql
-- Must return zero rows. Any row is a hard failure of the run.
SELECT id, name, total_capacity, sold_count, reserved_count
FROM ticket_tiers
WHERE sold_count + reserved_count > total_capacity
   OR sold_count > total_capacity;

-- Issued tickets must never exceed capacity for the hot tier.
SELECT tt.id, tt.total_capacity, COUNT(t.id) AS issued
FROM ticket_tiers tt
LEFT JOIN tickets t ON t.ticket_tier_id = tt.id
GROUP BY tt.id, tt.total_capacity
HAVING COUNT(t.id) > tt.total_capacity;   -- must return zero rows
```

   The k6 run also tracks, as a custom metric, that the count of successful reservations for the hot tier never exceeds its capacity at any sampled instant. The drop test fails if a single seat is oversold, even transiently.

### 4.5 Soak (no slow leaks)

- Intent: catch the failures that only appear over hours: reservation holds that never release, memory or connection creep, the inventory cache drifting from the DB, queue rows accumulating.
- Shape: a sustained moderate load (well under the stress ceiling) for a long duration (for example 2 to 8 hours), with a steady mix of browse, reserve, abandon, and buy so the reservation-expiry sweeper is continuously exercised.
- Pass: latency and error rate are flat from start to finish (no upward drift); after the soak, no `active` reservation remains past its `expires_at` (the every-minute sweeper kept up); `reserved_count` on exercised tiers matches the true outstanding holds; no orphaned queue rows; DB and Redis memory stable.

---

## 5. The virtual queue as the thundering-herd throttle

The queue is the single most important scale mechanism, because it converts an unbounded herd into a bounded, fair, admitted stream that the reservation lock path can actually serve. This is exactly how Ticketmaster's Smart Queue and DICE's waiting room work: the storefront and checkout are protected behind a queue that admits people in controlled batches. EventLinqs has the primitives for this already built, but the admission loop is dormant.

### 5.1 Current state (what exists, and the one gap)

- Built: HMAC-signed position and admission tokens (`src/lib/queue/tokens.ts`), the `admit_queue_batch(event_id, batch_size = 50, window = 10 min)` RPC that atomically promotes the next waiting entries to admitted, the `expire_stale_queue_admissions` RPC, the `/api/cron/queue-admit` route that drives admission, the `/queue/[slug]` waiting room, and an organiser toggle.
- Gap: `/api/cron/queue-admit` is not listed in `vercel.json`, so nothing calls it. The queue can enqueue but never admits. The waiting-room page also needs its live position and estimated-wait display confirmed under load.

### 5.2 Activation (an implementation step, not part of this docs PR)

1. Add `/api/cron/queue-admit` to `vercel.json` on a one-minute schedule (the same cadence the SQL design intended), CRON_SECRET-gated like the other cron routes.
2. Calibrate the admission rate from the stress-test ceiling (4.3): set batch size and cadence so the admitted arrival rate at the reservation lock stays comfortably below the hot-tier serial throughput found in 3.2, with headroom. Admitting 50 every minute is the seed value; the real number is whatever keeps the lock path under its threshold with margin.
3. Confirm the event "high-demand" toggle auto-engages the queue for designated drops, and that non-drop events bypass the queue entirely (no queue tax on ordinary browsing).

### 5.3 Validation (inside the spike test)

- Fairness: tokens are HMAC-ordered; the test asserts admission order matches arrival order and that no waiting VU is starved.
- Throttle effectiveness: with the queue active, the number of VUs hitting `create_reservation` at any instant stays bounded to the admitted batch, so the lock path never enters a global stall and the invariant in 1.1 holds.
- Token integrity: forged or replayed admission tokens are rejected (HMAC validation), so the queue cannot be skipped.
- Degradation: if Redis (which backs queue state) slows, the queue fails in a defined direction (hold users in the waiting room rather than flood the store), never opening the floodgates.
- User experience: the waiting-room page shows a live position and a plausible wait estimate, and admitted users transition into checkout within the admission window.

A drop test that passes 1.1 only because the queue held the herd is a pass: that is the queue doing its job. A drop test run with the queue off is also run deliberately, to demonstrate that without the throttle the system sheds load gracefully (429 / shed, never oversell, never 5xx storm) rather than overselling. Both runs must preserve the invariant.

---

## 6. Production safeguards

Load testing proves the system survives the storm. These safeguards keep it surviving in production, where the storm is real and unrepeatable.

### 6.1 Graceful degradation (defined failure directions)

Every dependency has a pre-decided behaviour when it slows or fails, so failure is a degraded experience, never a hard 500 or an oversell:

- Redis inventory cache down: fall back to a direct DB read for the display count (already implemented as a graceful fallback). Slower, still correct.
- Redis rate-limit down: fail open or closed by a deliberate decision per route (auth and checkout fail closed to protect integrity; pure read endpoints may fail open), never a hard error to the user.
- Redis queue state down: hold users in the waiting room (fail closed) rather than admit everyone, preserving the throttle.
- PostgREST / DB saturated: shed with 429 and a retry hint, and keep the queue page (edge-served) alive so users see "you are in line", never a dead store. The invariant holds because no reservation that cannot acquire the lock is ever counted as sold.
- Stripe slow or 429: the cart hold protects inventory while the PaymentIntent retries idempotently; the buyer sees a "confirming payment" state, not a double charge and not a lost seat.
- Email (Resend) down: ticket issuance does not depend on email; the ticket exists in the account and at `/t/[code]` regardless, and the email is retried. A failed email never blocks a sale or a ticket.

### 6.2 Monitoring and alerting (see the storm as it forms)

- Sentry: 5xx and unhandled-rejection alerts, payment-failure alerts, release-tagged, already live in production.
- SLO dashboard: storefront p95, checkout p95, error rate, payment success rate, search p95, tracked against the section 1 targets, with alerts when an objective is breached for a sustained window.
- Supabase metrics: DB CPU, memory, pool saturation, slow queries, with an alert as the pool approaches its ceiling (the early-warning signal for 3.1).
- Upstash metrics: requests/sec, throttling, latency.
- Stripe dashboard: API request rate, 429s, webhook delivery latency and retry backlog.
- Inventory invariant monitor: a periodic production check that no tier satisfies `sold_count + reserved_count > total_capacity`. If one ever does, it pages immediately; this is the canary for the one failure that must never happen.
- Synthetic uptime checks every 60 s on the critical paths (homepage, event detail, checkout entry, queue page, scanner).

### 6.3 On-sale runbook (operate a drop with intent)

Before a known high-demand on-sale:

1. Confirm the event's high-demand toggle is on and the queue is active for it.
2. Confirm Redis is on the Sydney paid plan with headroom for the expected herd.
3. Confirm Supabase compute is sized to (or above) the stress-test ceiling for the expected peak; pre-scale if the plan allows.
4. Confirm Vercel functions are pinned to the Supabase region and concurrency limits are adequate.
5. Confirm Stripe rate limits cover the expected admitted-batch PaymentIntent rate (request an increase ahead of time if needed).
6. Confirm the reservation-expiry sweeper and the queue-admit cron are both scheduled and running.
7. Confirm the inventory invariant monitor and SLO alerts are armed.

During the on-sale:

- Watch the SLO dashboard and the inventory invariant monitor live.
- If the DB pool approaches saturation, reduce the queue admission rate (the one knob that directly lowers pressure on the lock path) before anything else.
- If a dependency degrades, confirm it is degrading in its defined direction (6.1) and not erroring.

After the on-sale:

- Run the oversell invariant query (section 4.4) against production for the event; it must return zero rows.
- Reconcile issued tickets against capacity and against Stripe settled charges.
- Capture the actual peak numbers and feed them back into the next stress test and the admission-rate calibration.

Incident response and rollback:

- Severity follows scope 2.7: P1 (checkout/payments down) 15-minute response, P2 (degraded) 1-hour, P3 next business day.
- Rollback is a Vercel deployment promotion to the last known-good build; database migrations are forward-only and must be backward-compatible so an app rollback never strands the schema.

---

## 7. Acceptance gate (definition of done for "load-ready")

The platform is load-ready for a national soft launch only when all of the following are true and evidenced:

1. The staging rig (section 2) exists, mirrors the production tier, and runs the exact commit under test.
2. Smoke, average, stress, spike/drop, and soak have all been run on staging and archived with their results.
3. The spike/drop test passed both clauses of 4.4: full availability and exactly zero oversell, asserted by the post-run query, with the queue active. A queue-off drop run demonstrated graceful shedding with the invariant still intact.
4. The stress test produced a documented requests-per-second ceiling, and the queue admission rate is calibrated below the hot-tier lock throughput with headroom.
5. The virtual queue is activated (`queue-admit` scheduled), fairness and token integrity validated, and degradation confirmed.
6. The soak test showed flat latency and error rate with no reservation, queue, or memory leak; the every-minute reservation-expiry sweeper kept up.
7. Redis is on Sydney paid, Vercel functions are region-pinned to Supabase Sydney, and the Supabase compute tier matches the tested ceiling.
8. Monitoring, the inventory invariant monitor, SLO alerts, and the on-sale runbook are all in place.

Until all eight hold, the scope's most important infrastructure requirement (section 2.3 of the scope: handle massive concurrent load with zero downtime and zero oversell) is unproven, and a national on-sale is not authorised.

---

## 8. Sequenced execution plan (what happens after this document)

This document is the plan. The work it authorises, in order, in separate PRs:

1. Provision the staging rig (Vercel project, Supabase Sydney staging project with migrations and seed, Upstash Sydney, Stripe test keys, Sentry staging).
2. Add `tests/load/` with the five k6 scripts and the oversell-invariant assertions.
3. Region-pin Vercel functions to Sydney and migrate Redis to Sydney paid.
4. Activate and calibrate the virtual queue (`vercel.json` schedule for `queue-admit`).
5. Run the ladder (smoke through soak), fix what each tier surfaces, re-run until the section 7 gate is green.
6. Wire the inventory invariant monitor, SLO dashboard, and alerts; finalise the on-sale runbook.

No application code changes are made by this PR. It establishes the bar and the program; the implementation PRs above satisfy it.
