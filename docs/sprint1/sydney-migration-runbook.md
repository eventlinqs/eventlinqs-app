# Sydney Migration — Operational Runbook

**Owner:** Lawal
**Status as of 2026-04-26:** **Path B (Fresh Start) executed and complete.** Sydney is live with baseline schema + cultural breadth seed. No Mumbai data was migrated.
**Sprint:** Sprint 1, Section 2.

---

## Path Selected: B — Fresh Start (no data migration)

Three paths were considered:

- **Path A — Studio Backup + Restore:** required Mumbai to be unpaused with a free-tier daily backup available. Mumbai was paused; backup access was not exercised.
- **Path B — Fresh Start (selected):** apply baseline schema + cultural breadth seed directly to Sydney, bypassing Mumbai entirely. Mumbai's data was early-stage / pre-launch, so there were no production users, real orders, or paid tickets to preserve.
- **Path C — `pg_dump` + `psql`:** required local PostgreSQL client install and a Mumbai DB password reset. Not pursued.

**Why Path B was the right call:**
- Mumbai contained only test data and seed orgs — no real customer data, no payments, no orders to preserve.
- Fresh start lets Sydney begin with the canonical schema (one consolidated baseline migration, not a long forward-only history).
- Mumbai was paused and would have required a wake + password reset cycle to extract data of zero business value.
- Cultural breadth seed (12 orgs, 5 diaspora categories, 24-30 events) gives a richer demo dataset than what Mumbai held.

---

## Project IDs

| Region | Project Ref | URL | Status |
|---|---|---|---|
| Mumbai (legacy) | `cqwdlimwlnyaaowwcyzp` | `https://cqwdlimwlnyaaowwcyzp.supabase.co` | **Scheduled for deletion 2026-05-03** |
| Sydney (production) | `gndnldyfudbytbboxesk` | `https://gndnldyfudbytbboxesk.supabase.co` | **Live, all migrations applied** |

Sydney is the destination because:
- ap-southeast-2 is closer to Australian users (~30ms vs Mumbai's ~140ms RTT from Melbourne).
- Mumbai stays alive as a 7-day archive window before being decommissioned on 2026-05-03.

---

## What Was Done (Path B execution log)

1. **Sydney baseline schema applied** (commit `dc73f06`):
   - Single consolidated 89KB migration captured the full canonical schema (events, organisations, profiles, tickets, ticket_tiers, pricing_rules, saved_events, squads, waitlists, RLS policies, indexes, RPCs).
2. **RLS recursion fix** (commit `dc73f06`):
   - `organisation_members` policy was recursive; rewritten to break the cycle.
3. **Cultural breadth seed** (commit `dc73f06`):
   - 12 organisations across 5 diaspora categories, 24-30 events. Replaces Mumbai's narrow seed.
4. **All 6 migrations confirmed applied** to Sydney project `gndnldyfudbytbboxesk`.
5. **Local site verified** — homepage and mobile both returned HTTP 200 against Sydney.
6. **Playwright screenshot pass** (commit `8675a91`) captured baseline visual state, stored in `docs/sprint1/screenshots/`.
7. **Build / lint / typecheck** — all clean (verified 2026-04-26 post-stale-cache reset).

---

## Confirmed Sydney state

- **REST API:** alive, returns expected responses against `public.events`, `public.organisations`, etc.
- **Schema:** all 6 migrations applied (1 baseline + 5 incremental).
- **Seed data:** cultural breadth seed loaded.
- **`.env.local`:** points at Sydney. Mumbai vars no longer present.
- **Production deploy:** pending Vercel env var swap (see below).

---

## Post-Migration: `.env.local`

`.env.local` has been cleaned to point only at Sydney. Mumbai vars were removed (rather than commented) since Mumbai is on a deletion timer.

```
NEXT_PUBLIC_SUPABASE_URL=https://gndnldyfudbytbboxesk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sydney-anon>
SUPABASE_SERVICE_ROLE_KEY=<sydney-service-role>
SUPABASE_DB_PASSWORD_SYDNEY=dQ3U4NKL88bBL9VV
```

---

## Vercel Environment Variable Swap (operator action required)

Sydney is live locally. Production still points at Mumbai until Vercel env vars are updated.

### Via Vercel Dashboard
1. Go to https://vercel.com/lawals-projects-c20c0be8/eventlinqs-app/settings/environment-variables.
2. Edit `NEXT_PUBLIC_SUPABASE_URL`:
   - Production / Preview / Development: set to `https://gndnldyfudbytbboxesk.supabase.co`.
3. Edit `NEXT_PUBLIC_SUPABASE_ANON_KEY`:
   - Replace with Sydney anon key (value in `.env.local`).
4. Edit `SUPABASE_SERVICE_ROLE_KEY`:
   - Replace with Sydney service-role key (value in `.env.local`).
5. Click **Save** for each.
6. Open the **Deployments** tab and trigger a redeploy of the latest commit so the new env vars are picked up.

### Smoke test after deploy
- Hit the production URL.
- Open homepage — confirm `ThisWeekStrip` renders with seeded cultural events.
- Open DevTools Network tab — confirm requests go to `gndnldyfudbytbboxesk.supabase.co`.
- Sign in as a test user — confirm session persists.
- Sentry should be quiet on the deploy (no Supabase connection errors).

---

## Decommission Mumbai

**Scheduled deletion date: 2026-05-03** (7 days after Sydney went live).

Steps:
1. Confirm Sydney has been live in production for 7+ days with no Supabase-related Sentry alerts.
2. Confirm Vercel logs show zero traffic to `cqwdlimwlnyaaowwcyzp.supabase.co`.
3. In Supabase Studio for Mumbai → Settings → General → **Delete project**.
4. No final backup needed — Mumbai held only pre-launch test data, fully superseded by Sydney's seed.

---

## Why Path B was chosen over A/C

The original Sprint 1 plan called for in-session migration via Supabase MCP. The available MCP was read-only and locked to Mumbai. Mumbai was paused, requiring a wake + password reset cycle to extract data that turned out to be of no business value (pre-launch test seeds only). Fresh start was the responsible alternative — it gave Sydney a clean canonical baseline, a richer culturally-relevant seed, and avoided destructive credential cycles in chat. Mumbai is preserved for 7 days as a safety net even though the data is non-essential.
