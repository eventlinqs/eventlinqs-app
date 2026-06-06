# Staging in 10 minutes (founder guide)

A focused quickstart to stand up a staging deployment so the certification
harness (`docs/launch-hardening/certification.md`) can run. This is the short
path: the full parallel-stack detail (load-test rig) is in
`docs/staging/PROVISIONING-RUNBOOK.md`.

The rule that matters: staging points at staging-only resources. Never point
staging at the production Supabase project or production Stripe live keys.

## 1. Create the staging Supabase project (Sydney) - 3 min

1. Supabase Dashboard, New project. Name it `eventlinqs-staging`.
2. Region: Sydney (`ap-southeast-2`), same as production.
3. Set a database password and save it (this is `SUPABASE_DB_PASSWORD_STAGING`).
4. When it finishes provisioning, open Settings, API and copy:
   - Project URL -> `NEXT_PUBLIC_SUPABASE_URL` and `STAGING_SUPABASE_URL`
   - `anon` `public` key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY` and
     `STAGING_SUPABASE_SERVICE_ROLE_KEY`

## 2. Apply the schema to staging - 2 min

From PowerShell in the repo (uses the `supabase` CLI directly; `npx` is broken
on this machine):

```
supabase link --project-ref <staging-ref>
supabase db push --linked
```

`<staging-ref>` is the ref in the staging project URL. This applies every
migration in `supabase/migrations/`. Confirm with
`supabase migration list --linked` (local count should equal remote).

When done, re-link to production so later work targets prod again:
`supabase link --project-ref gndnldyfudbytbboxesk`.

## 3. Stripe test mode + webhook - 2 min

1. Stripe Dashboard in TEST mode, Developers, API keys: copy the test secret
   and publishable keys -> `STRIPE_SECRET_KEY`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. Developers, Webhooks, Add endpoint:
   `https://staging.eventlinqs.com/api/webhooks/stripe`, subscribe to
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `charge.refunded` (plus the Connect events). Copy the signing secret ->
   `STRIPE_WEBHOOK_SECRET`.

## 4. Wire the Vercel preview/staging env - 2 min

1. Vercel, the EventLinqs project, Settings, Environment Variables.
2. Add every variable from `.env.staging.example` to the Preview environment
   (or a dedicated `staging` environment / branch). The Supabase, Stripe,
   Upstash, Cron, Resend, and App values come from steps 1-3; reuse the
   read-only public keys (Maps, Mapbox, Pexels) and restrict them to the
   staging domain.
3. Generate fresh staging-only secrets for `CRON_SECRET` and
   `ADMIN_TOTP_ENC_KEY`.
4. Point a branch or the `staging.eventlinqs.com` domain at this environment
   and redeploy.

Note: Plausible does not load on staging (it is gated to
`VERCEL_ENV === 'production'`), so leave `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` blank.

## 5. Seed two events and run the certification - 1 min to kick off

1. Create (or seed) one published FREE event and one published PAID event whose
   organiser has completed Stripe Connect onboarding (test mode, charges
   enabled). Note their slugs.
2. Create a reservation and let it lapse past 10 minutes (or seed an expired
   one) for the expiry drill; note its id.
3. Run the certification harness:

```
CERT_BASE_URL=https://staging.eventlinqs.com \
CERT_PAID_EVENT_SLUG=<paid-slug> \
CERT_FREE_EVENT_SLUG=<free-slug> \
CERT_EXPIRED_RESERVATION_ID=<expired-id> \
npx playwright test --config playwright.certification.config.ts
```

Green across all seven tests is the buyer-journey certification.

## Checklist

- [ ] Staging Supabase project in Sydney, schema pushed, migration list matches
- [ ] Stripe test keys + staging webhook endpoint + signing secret
- [ ] Every `.env.staging.example` variable set on the Vercel preview/staging env
- [ ] Fresh staging-only `CRON_SECRET` and `ADMIN_TOTP_ENC_KEY`
- [ ] One free event, one paid event (Stripe-enabled organiser), one expired reservation
- [ ] Certification harness green
