# Production proves itself, 2026-07-26

Founder ruling behind this work: he will NOT paste the live Stripe secret key or
either webhook signing secret into a session. Vercel stores them Sensitive, which
is write-only by design, so no session can read them back. Production therefore
has to prove its own configuration.

Predecessors: `docs/verification/blockers-round-2-2026-07-25.md`, ledger
`docs/roast/live-keys-production-2026-07-26.md`. This task's ledger is
`docs/roast/production-proves-itself-2026-07-26.md`.

Sacred rules in force: no PRODUCTION database writes (every production query here
is a GET, and PostgREST served them inside a READ-ONLY transaction, proven in
section 5); the funds-holding engine's money logic untouched; Australian English;
no em-dashes or en-dashes.

## 1. The build now proves the Stripe keys (JOB 1)

`STRIPE_LIVE_KEY_PAIRING` in `src/lib/health/critical-env.mjs`, `buildCritical`.
When `VERCEL_ENV === 'production'` it asserts the secret key is `sk_live_`, the
publishable key is `pk_live_`, and that the account id both keys embed after the
`_51` marker is IDENTICAL. On preview and local it is an explicit no-op pass,
because those legitimately run test keys.

It never logs or exposes either value. `resolve()` packs only the deployment
target, each key's declared MODE, and the account ref; `validate()` returns a
boolean and a reason naming NEITHER key NOR either ref. Both consumers
(`scripts/check-public-env.mjs` and the runtime sentinel) print only name, state
and reason.

Observed, running the real build guard:

| Case | `VERCEL_ENV` | Keys | Result |
|---|---|---|---|
| A | production | both `sk_test_`/`pk_test_` (the state production was in) | **BUILD BLOCKED** |
| B | production | both live, DIFFERENT accounts | **BUILD BLOCKED** |
| C | production | both live, same account | passes, exit 0 |
| D | preview | both test | no-op pass, exit 0 |

Case A message: `STRIPE_SECRET_KEY is test, expected a key starting sk_live_ ...
Production would take card details and settle NOTHING: a test-mode charge moves
no money.`

Case B message: `the publishable and secret keys belong to DIFFERENT Stripe
accounts. Stripe.js cannot resolve a clientSecret minted by another account, so
the payment element renders nothing and reports no error.`

15 tests in `tests/unit/security/stripe-live-key-pairing.test.ts`, including a
secrecy test asserting no key material or account ref reaches the reason, and two
self-proving tests showing the pre-existing per-variable rules ACCEPT both the
test-key-on-production case and the mismatched-live-pair case, which is exactly
why this rule is needed.

**Consequence the founder must know:** the next production build FAILS if the
secret key is not a live key from the same account as the publishable key. That
is the proof mechanism. A green production build IS the proof.

## 2. Both webhook destinations are probed on schedule (JOB 2)

`selfProbe` now returns one result PER CONFIGURED SIGNING SECRET, iterating
`resolveWebhookSecrets()` imported from the adapter, so the sentinel and the
route can never disagree about which secrets the deployment accepts. Each probe
is named by a one-way sha256 fingerprint, never the secret.

11 tests in `tests/unit/payments/sentinel-probes-every-secret.test.ts`. They
verify by real HMAC that each probe carries a DIFFERENT secret, not merely that
two calls were made.

**What this proves:** for every secret the deployment holds, the real route is
reachable, `getStripeClient()` constructs (so `STRIPE_SECRET_KEY` is set and
non-empty), and the multi-secret loop accepts that secret.

**What this does NOT prove, stated so nobody reads more into a green result:** it
does NOT prove Stripe is SIGNING with those secrets. The prober and the route
read the same environment, so a configured secret always verifies against itself.
Only a real Stripe delivery proves that.

The structural half IS now covered, by a new assertion in `endpointConfigCheck`:
if Stripe has more enabled endpoints at the canonical host than we hold signing
secrets, at least one endpoint's deliveries will 400 forever while payments keep
succeeding. That is precisely the 2026-07-25 failure, and the sentinel now says
so. Counting is the strongest check available, because Stripe never reveals an
existing endpoint's secret, so a secret cannot be matched to its endpoint.

## 3. Every check now says what it found (JOB 3)

`[payment-check] PASS|FAIL <name> :: <detail> :: probable cause: <cause>` from
every payment check, a one-line `[webhook-sentinel] GREEN|RED (n/m checks
passed): ...` verdict on the route, and `[health-check] ...` from every platform
check via the shared `timed()` wrapper. Asserted by test, including that no
secret material reaches a log line.

### What drove the production 503: PARTIALLY DETERMINED

Observed on deployment `eventlinqs-250kollpv`, twice, an hour apart:

```
2026-07-26T00:40:16.229Z /api/cron/webhook-sentinel status=503
2026-07-26T01:50:16.313Z /api/cron/webhook-sentinel status=503
```

- `selfProbe` **PASSED**. The webhook route returned 200 to the sentinel's own
  signed probe at 00:40:16.616Z, logged as
  `[stripe-webhook] unhandled event type: sentinel.probe`.
- Therefore the failure is `driftWatchdog` or `endpointConfigCheck`.

**Which one is NOT VERIFIED.** Neither logged its result, which is the defect
fixed above, and neither can be determined from outside: the route is behind
fail-closed cron auth whose `CRON_SECRET` is Sensitive, and reading `orders` with
the anon key returns `200 []` under row level security, which proves nothing
either way.

Most likely `endpointConfigCheck`, which fails when no ENABLED Stripe endpoint
matches the canonical host `https://www.eventlinqs.com.au` (confirmed as the
canonical host: production's `/cities` JSON-LD emits it). Stated as a hypothesis,
not a finding. The next production deploy answers it in one log line.

## 4. The Resend defect (JOB 4)

Observed on production, recurring on every sentinel run:

```
[webhook-sentinel] alert email failed: Error: The send.eventlinqs.com domain
is not verified. Please, add and verify your domain on https://resend.com/domains
```

The payment sentinel detects a fault and then cannot tell the founder.

### Which sender each flow uses

| Sender | Set where | Flows |
|---|---|---|
| `EMAIL_FROM` env, production resolves to an address at **`send.eventlinqs.com`** (NOT verified) | Vercel env, used by `sendEmail()` | ticket transfer, organiser seat moves, waitlist join, weekly digest, notification dispatch, marketplace notify, admin network actions, AI handoff, **payment sentinel alerts**, **health sentinel alerts** |
| `EventLinqs <noreply@eventlinqs.com>` | hardcoded in 4 files | **order confirmation (the ticket email)**, refund confirmation, payout emails, waitlist promotion |

The buyer's ticket email uses a DIFFERENT domain from the failing one. Whether
`eventlinqs.com` is itself verified at Resend is **NOT VERIFIED**: that needs
Resend dashboard access, which this session does not have. What is proven is that
`send.eventlinqs.com` is not verified and every send through `sendEmail` fails.

### The fix shipped

`checkEmail` in `src/lib/health/checks.ts` previously called `domains.list()` and
only asserted the API key was valid. It now asserts every domain the platform
actually sends FROM is present AND `status === 'verified'`, and names the
unverified one with the exact fix. A valid key is not a working sender, and that
gap is why this rotted unnoticed.

`senderDomainsInUse()` in `src/lib/email/send.ts` is the single source. 12 tests
in `tests/unit/email/sender-domains.test.ts`, including a drift guard that reads
the four hardcoded call sites so the constant cannot silently diverge, and a test
that subdomains are treated as distinct (collapsing `send.eventlinqs.com` to
`eventlinqs.com` would have hidden this defect).

### Is repointing EMAIL_FROM the faster path

**Yes, if `eventlinqs.com` is verified.** Verifying `send.eventlinqs.com` needs
DNS records plus propagation; repointing `EMAIL_FROM` is a Vercel env change plus
a redeploy, minutes not hours. The prepared change is in founder step 3 below.
The catch is that it is only faster if `eventlinqs.com` is already verified, which
is the one fact this session cannot observe. The founder sees both answers on the
same Resend screen.

## 5. The migration audit (JOB 5)

### Method, and how it was validated

Production was read ONLY. Every probe is a GET through PostgREST with the
production anon key. Existence oracle:

- table or view: `GET /rest/v1/<t>?select=*&limit=0` -> 404 `PGRST205` means absent
- column: `GET /rest/v1/<t>?select=<c>&limit=0` -> 400 `42703` means absent
- function: `GET /rest/v1/rpc/<fn>?<declared arg names>` -> 404 `PGRST202` means absent

PostgREST serves GET inside a **READ-ONLY transaction**, proven by observation: a
mutating function returned `25006 cannot execute SELECT FOR UPDATE in a read-only
transaction` rather than running. No production write was possible.

The method was validated against the TEST project, which has every migration
applied, and CORRECTED TWICE before being trusted:

1. A bare `GET /rpc/<fn>` looks for a ZERO-ARGUMENT overload, so every function
   taking arguments reported absent. On TEST, `confirm_order` reported "missing"
   even though TEST certainly has it. Fixed by extracting each function's
   declared argument names from the migration SQL and passing them.
2. Trigger functions are never exposed via `/rpc` at all, so they are excluded as
   NOT OBSERVABLE rather than counted absent.

After both corrections the method reported **0 false negatives on TEST** (54
APPLIED, 0 MISSING, 20 NOT OBSERVABLE, 1 PARTIAL which is the superseded
`culture_taxonomy`, legitimately renamed away).

Independent corroboration of the cutoff:

| table | PRODUCTION | TEST |
|---|---|---|
| `cultures` | PRESENT | ABSENT |
| `communities` | ABSENT | PRESENT |

Migration `20260621000006_rename_culture_to_community` has definitively not run
on production.

### What this method CANNOT see, stated plainly

- Policies, triggers, indexes, grants and constraints. 20 migrations are marked
  NOT OBSERVABLE because they change only those, or only seed data.
- **A migration that only REDEFINES an existing function is indistinguishable
  from an applied one**, because the function existed beforehand. So the true
  number of unapplied migrations is very likely HIGHER than 23. Specifically,
  `20260621000002`, `20260621000004`, `20260621000005` and `20260704000005`
  report APPLIED but sit after the cutoff and only redefine pre-existing
  functions, so they are almost certainly unapplied too.

### The finding

**Production's database is frozen at approximately 2026-06-21.** Every migration
through `20260608000004` is applied. The first gap is
`20260621000001_funds_holding_replatform`, the funds-holding re-platform itself.

**23 migrations are provably not fully applied.** None is destructive at apply
time: every `DROP` is an idempotent guard (`DROP POLICY IF EXISTS`, `DROP TRIGGER
IF EXISTS`, `DROP CONSTRAINT IF EXISTS`, `DROP FUNCTION IF EXISTS` on a specific
old signature) and every `DELETE` sits inside a function body, executed only when
that function is later called.

| # | Migration | Status | What it does | What breaks without it |
|---|---|---|---|---|
| 1 | `20260621000001_funds_holding_replatform` | MISSING | The funds-holding payment spine: platform holds funds and pays the organiser after the event. Objects: payouts.kind, organiser_balance_ledger.event_id, organiser_event_available_balance(), disburse_transfer() | Per-event balances and the post-event transfer leg do not exist. The whole merchant-of-record payout model is absent. |
| 2 | `20260621000003_chargeback_dispute_funds_holding` | MISSING | Chargeback and dispute handling under funds holding. Objects: freeze_chargeback(), resolve_chargeback() | A disputed charge cannot be frozen against the organiser balance, so a chargeback could be paid out anyway. |
| 3 | `20260624000001_demand_engine_notifications` | MISSING | Alert engine: web push primary, email backbone. Objects: push_subscriptions, notification_prefs, notifications | No push subscriptions, no notification preferences, no in-app notifications. The demand engine cannot notify anyone. |
| 4 | `20260624000002_organiser_marketing_consent` | MISSING | Per-organiser attendee marketing consent (Spam Act 2003 / ACMA). Objects: organiser_marketing_consents | Consent cannot be recorded, so organiser marketing to attendees has no lawful consent record. |
| 5 | `20260625000001_door_checkin_scan` | MISSING | Single-use door admission. Objects: scan_ticket() | Door check-in cannot admit a ticket. No scanning at the venue. |
| 6 | `20260625000003_ticket_transfer` | MISSING | In-platform ticket transfer with identity reissue. Objects: ticket_transfers, transfer_ticket() | A buyer cannot transfer a ticket to someone else. |
| 7 | `20260627000002_venue_revenue_program` | MISSING | The Venue Revenue Sharing Program, REMOVED by founder decision 2026-07-05. Objects: venue_enrolments, venue_share_ledger, venue_payouts, 3 functions, venues.stripe_account_id | Nothing user-facing. The programme was removed; these tables would be dormant history only. |
| 8 | `20260628000001_events_is_seed_data` | MISSING | Marks demo catalogue events at the data layer. Objects: events.is_seed_data | Seed events cannot be distinguished from real organiser events in queries. |
| 9 | `20260628000002_event_media_standard` | MISSING | Event Media Standard: accessible cover imagery. Objects: events.cover_image_alt | No alt text on event covers. An accessibility gap on every event page. |
| 10 | `20260704000001_broadcast_artists_extension` | MISSING | Broadcast Stage 3: performer attribution on events. Objects: artists.links, artists.owner_user_id, event_artists.status, event_artists.invite_token | Artists cannot own a profile or be invited to an event. The artist layer cannot function. |
| 11 | `20260704000002_broadcast_share_links` | MISSING | Broadcast Stage 1: trackable share links and attribution. Objects: share_links, share_link_events | The share-a-ticket acquisition loop cannot attribute a single join. This is growth lever 2 in the constitution. |
| 12 | `20260704000003_broadcast_audience` | MISSING | Broadcast Stage 2: platform marketing consent and weekly local digest. Objects: marketing_consents, digest_sends | No platform marketing consent, no digest audit trail. |
| 13 | `20260704000004_broadcast_feature_flags` | MISSING | DB-backed feature flags so a stage switches on without a deploy. Objects: feature_flags | Every DB-backed flag is absent, so flag-gated features fall back to their default and cannot be switched on. |
| 14 | `20260705000001_reserved_seating_v2` | PARTIAL | Reserved Seating v2. Objects: assign_order_seats(), release_expired_seat_reservations(), scan_ticket() | THE ONE PRODUCTION IS ALREADY ERRORING ON, every minute. Expired seat reservations are never released: abandoned seated checkouts hold their seats permanently. |
| 15 | `20260705000006_community_giving_groundwork` | MISSING | Community giving groundwork (settlement split). Objects: community_contributions | Buyer round-up contributions cannot be recorded. |
| 16 | `20260709000001_launch_kit` | MISSING | Event Launch Kit flag and the national city waitlist. Objects: city_waitlist_signups | The city waitlist cannot capture a signup. |
| 17 | `20260710000001_seat_reassignment_and_live_sync` | MISSING | Post-sale seat reassignment and safe live-chart sync. Objects: reassign_ticket_seat(), rematerialize_seats_additive() | An organiser cannot move an attendee to another seat, and a live chart cannot be extended safely. |
| 18 | `20260710000002_founding_network` | MISSING | Founding-organiser invites and demand signal. Objects: founding_invites, kit_poster_downloads, claim_founding_spot(), organisations.is_founding | The founding-organiser recruitment engine cannot issue or claim an invite. This is growth lever 1. |
| 19 | `20260710000003_seat_notes_and_self_service` | PARTIAL | Per-seat notes and buyer self-service seat change. Objects: seats.note, events.allow_seat_self_service | No per-seat notes on tickets, and buyers cannot change their own seat. |
| 20 | `20260711000002_performer_marketplace` | MISSING | Performer Marketplace: Gig Board and Showcase. Objects: gigs, gig_applications, booking_requests, marketplace_blocks, marketplace_reports, artists.performance_types, notifications.subject_id | The entire performer marketplace is absent. Both flags default OFF, so no user-facing break today. |
| 21 | `20260711000004_organiser_assigns_seats` | MISSING | Organiser-assigns seating mode. Objects: events.organiser_assigns_seats | Organisers cannot sell a seated event GA-style and assign seats afterwards. |
| 22 | `20260711000005_fix_reassign_unassigned_path` | MISSING | Root fix for reassign_ticket_seat on the unassigned path. Objects: reassign_ticket_seat() | Reassigning an unassigned ticket fails with a record-not-assigned error. |
| 23 | `20260726000001_seat_section_views` | MISSING | View-from-seat photography per section (in flight from another session, today). Objects: seat_section_views | Buyers cannot see the real view from a section. Not yet expected on production. |

## 6. The smoke gate (JOB 6)

### Why it was skipped, proven

Not a defect in the smoke gate. A chain:

1. The `SUPABASE_ACCESS_TOKEN` repository secret expired around 2026-07-10. The
   CI log shows the guard's own presence check PASSING and then:
   `failed to retrieve generated types: {"message":"Unauthorized"}`.
2. `types-drift guard` has `continue-on-error: false`, so the whole CI run
   concluded `failure`. Confirmed: every CI run on main since 2026-07-10 is
   `failure`; the last success was 2026-06-06. `test (vitest)` and
   `lint / typecheck / build` PASS in those same runs.
3. post-deploy-smoke gated on `github.event.workflow_run.conclusion == 'success'`,
   which was false, so the job was skipped, every time, since 2026-07-12.

Production had no smoke gate for two weeks because an unrelated
schema-introspection job could not authenticate.

### What was fixed

- **Decoupled.** post-deploy-smoke now also triggers on `deployment_status`,
  filtered to `state == 'success'` and `environment == 'Production'`. A
  post-DEPLOY gate should key off the DEPLOY. Verified that Vercel does create
  GitHub Deployments with environment `Production` (6 observed, most recent
  2026-07-12 `414d801`). The `workflow_run` path is kept as a second route.
  The drift guard is NOT weakened: it stays blocking on its own merits.
- **Canonical host.** `PROD_URL` moved from `https://www.eventlinqs.com` to
  `https://www.eventlinqs.com.au`. The old value is one of the three hosts the
  canonical 301 will redirect, so the gate had a scheduled expiry date. The two
  sentinel probes also gained `-L` and now use `$PROD_URL`, because they used
  `curl -sS` with a hardcoded host and would have started reading a redirect body
  instead of the sentinel JSON the moment the 301 landed.
- **Present is not valid.** The CI token check now actually exercises the token
  against the Supabase API and reports `PRESENT but REJECTED ... expired or been
  revoked. This is NOT schema drift.` instead of letting an expired token
  masquerade as a types-drift failure. That is the platform's named worst failure
  class: a variable that exists but does not work.

**NOT VERIFIED:** that the `deployment_status` trigger fires in practice. The
YAML parses and the trigger list is confirmed, but only the next production
deploy can prove the event actually arrives and the job runs. Called out rather
than claimed.

## 7. Gates

- `npx tsc --noEmit` exit 0
- `npx eslint src scripts tests` exit 0 (10 pre-existing warnings, 0 errors)
- `npx vitest run` **919 passed / 919**, 106 files (38 of them new here)
- Disk guard: not near the 1.5 GB floor
