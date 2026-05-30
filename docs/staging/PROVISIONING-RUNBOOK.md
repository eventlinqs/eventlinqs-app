# Staging Rig: Provisioning Runbook

Status: ready to execute. Owner: founder (account-level steps) + engineering (wiring).
Purpose: stand up the full parallel staging stack defined in `docs/SCALE-AND-LOAD-TEST-PLAN.md` section 2, so the platform can be load-tested without ever touching production.

This runbook is split into:
- Decisions you (Lawal) make once, up front.
- Account-level steps that only you can do in a browser (they create paid resources under your accounts and yield credentials).
- Wiring steps Claude Code can do the moment you paste the credentials back.

Each step states what it produces and where that value goes in `.env.staging`.

Estimated time: about 30 to 45 minutes of your hands-on time, most of it waiting for resources to come up.

---

## Why these steps need you and not Claude

Claude Code cannot create any of these resources autonomously: there is no Supabase access token, no Vercel token, no Upstash or Stripe API credential in this environment, and creating each resource spends real money under your accounts and is hard to reverse. Vercel CLI is present but not logged in; the Supabase CLI is npx-only and not linked. So the account-level creation is yours; everything downstream of the credentials is automatable.

---

## 0. Decisions (make these first)

### 0.1 Staging Supabase compute tier

The plan requires staging to mirror the production compute tier so the load-test ceiling is honest (section 2.2). The decision is what that tier is.

- Recommended: stand staging up on a small paid tier that matches the launch target (for example Supabase Pro / the smallest paid compute), run the stress test, and size production to whatever the stress test shows. Testing on Free proves nothing about the launch ceiling because Free has a much lower connection and CPU budget than you will launch on.
- Cheapest interim: start on Free to validate the rig and the seed end to end (smoke and average profiles only), then upgrade staging to the launch tier before the stress, spike, and soak runs. The numbers from a Free run are not the launch numbers and must not be quoted as such.

Cost note: a second Supabase paid project is an additional monthly cost on top of production. You can pause or delete the staging project between test campaigns to control spend.

### 0.2 Staging domain

- Recommended: `staging.eventlinqs.com` (a CNAME to the staging Vercel deployment). Already the default in `.env.staging.example` and the seed.
- Alternative: use the Vercel-generated preview domain and skip custom DNS. Faster, less tidy.

### 0.3 When to migrate Redis to Sydney paid

The plan calls for Upstash Sydney paid for honest throughput. You can do this for staging now (recommended, since it is also a production launch action) or reuse a Free Sydney database for the early profiles and upgrade before the stress run.

---

## 1. Supabase staging project (database)

ALL OF STEP 1 IS YOURS (browser + your PowerShell), except 1.4 which Claude can drive.

1.1 In the Supabase dashboard, create a new project. Region: Sydney (ap-southeast-2). Name: `eventlinqs-staging`. Tier: per decision 0.1. This yields the project ref, anon key, and service-role key (Settings > API) and the database password (Settings > Database).

1.2 Put those into `.env.staging` (copy from `.env.staging.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `STAGING_SUPABASE_URL` = `https://<staging-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD_STAGING`

1.3 Apply all migrations to staging from your PowerShell terminal (the project rule is migrations via `supabase db push --linked`, never the Dashboard SQL editor, never MCP). Link to the staging ref first, then push:

```powershell
npx supabase link --project-ref <staging-ref>
npx supabase db push --linked
```

This creates the full schema AND runs the seed migrations, so staging comes up with the same realistic catalogue production has (about 47 events, tiers, pricing_rules, tax_rules, taxonomies). Verify the push applied by checking a table count, not by trusting the "up to date" line (per the migration runbook memory).

1.4 (Claude can drive) Add the designated load-test drop event with its constrained hot tier:

```powershell
node scripts/staging-seed.mjs
```

The script reads `STAGING_SUPABASE_URL` / `STAGING_SUPABASE_SERVICE_ROLE_KEY`, refuses to run against the production ref, and is idempotent. It adds `/events/loadtest-national-flash-drop` with a 1000-capacity "Early Bird (HOT)" tier (the spike-test contention target) plus GA and VIP tiers, and sets `is_high_demand = true` so the virtual queue engages for it.

---

## 2. Upstash Redis (staging)

YOURS (browser), then Claude wires it.

2.1 Create a new Upstash Redis database. Region: ap-southeast-2 (Sydney). Plan: per decision 0.3. Name: `eventlinqs-staging`. This must be a separate database from production (no shared rate-limit or inventory-cache namespace).

2.2 Copy the REST URL and REST token into `.env.staging`:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

---

## 3. Stripe (staging, TEST MODE ONLY)

YOURS (browser).

3.1 In the Stripe dashboard, stay in TEST mode. Use the test publishable and secret keys (a restricted test key is fine). A load test must never be able to create a real charge, so staging never uses live keys.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = test publishable key
- `STRIPE_SECRET_KEY` = test secret key

3.2 Create a webhook endpoint pointing at the staging deployment: `https://staging.eventlinqs.com/api/webhooks/stripe`. Subscribe the same 14 events production uses (5 payment + 9 Connect). Copy the signing secret:
- `STRIPE_WEBHOOK_SECRET`

3.3 Connect: the existing test-mode Connect setup is shared in test mode; no new Connect account is needed for staging. The seed organisations will need a connected test account to exercise the paid path end to end, exactly as in production test mode.

---

## 4. Sentry (staging)

YOURS (browser), or skip for the first runs.

4.1 Either create a separate Sentry project `eventlinqs-staging` or reuse the existing project with the environment tag `staging`. The point is that staging load-test errors never page the production on-call.
- `NEXT_PUBLIC_SENTRY_DSN` (staging project DSN, or the existing DSN if using the env tag)
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `SENTRY_ENVIRONMENT=staging` (already set in the template)

---

## 5. Vercel staging project (the app)

5.1 (YOURS, browser) Create a new Vercel project from the same GitHub repo, named `eventlinqs-staging`. Set its production branch to a dedicated `staging` branch (or deploy the commit under test). This keeps staging deploys, analytics, and functions fully separate from the production project.

5.2 (YOURS or Claude with a token) Set the staging project's environment variables to the contents of `.env.staging`. Region: set the function region to Sydney (`syd1`) to match Supabase, so the function-to-database round trip is not a cross-Pacific hop (this is also a production launch action; see the plan section 2.2). The crons in `vercel.json` (including the reservation-expiry sweeper) deploy with the project.

5.3 (YOURS, browser) Point `staging.eventlinqs.com` at the staging Vercel project (DNS CNAME), per decision 0.2.

---

## 6. Verification (the rig is real)

Run these after wiring. Claude can run all of them once `.env.staging` is populated.

6.1 Schema and catalogue present:
```powershell
# expect a non-trivial event count and the drop event present
node scripts/staging-seed.mjs   # idempotent: should report "already present"
```

6.2 Storefront answers on staging:
- `https://staging.eventlinqs.com/` returns 200
- `https://staging.eventlinqs.com/events` returns 200
- `https://staging.eventlinqs.com/events/loadtest-national-flash-drop` returns 200 and shows the three tiers
- `https://staging.eventlinqs.com/api/health/redis` returns 200 with low latency from Sydney

6.3 Isolation proof (the one that matters): confirm the staging Supabase URL, Upstash URL, and Stripe keys in the staging Vercel project are all the staging values, none of them the production values. The seed script's prod-ref guard is the backstop, but verify by eye.

6.4 Stripe test webhook reaches staging: send a test event from the Stripe dashboard to the staging endpoint and confirm a 200.

---

## 7. Definition of done for "staging rig provisioned"

- A separate Supabase Sydney project exists at the chosen tier, all migrations applied, the load-test drop event seeded.
- A separate Upstash Sydney database, a separate Stripe test webhook, and a separate Vercel project (region `syd1`) all exist and are wired to `.env.staging` values only.
- `staging.eventlinqs.com` serves the app and the drop event renders.
- No staging credential anywhere points at a production resource.

When all of the above hold, proceed to plan step 2: add `tests/load/` with the k6 ladder and run smoke against staging.

---

## Appendix: what is already in the repo for this

- `.env.staging.example` - the full staging env contract.
- `scripts/staging-seed.mjs` - idempotent drop-event seed, prod-ref guarded.
- `docs/SCALE-AND-LOAD-TEST-PLAN.md` - the program this rig serves.
- The reservation-expiry sweeper and queue-admit crons already live in `vercel.json` / the cron routes and deploy with the staging project (the queue-admit schedule is activated in a later plan step).
