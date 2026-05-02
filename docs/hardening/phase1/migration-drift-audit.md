# Migration drift audit - Phase 1 deliverable E

Date: 2026-05-02
Status: PARTIAL - on-disk audit complete, remote `supabase migration list --linked` requires founder action to link the project
Owner: hardening session

## On-disk migrations

10 migration files on disk:

| File | Purpose |
| --- | --- |
| 20260101000001_baseline_schema.sql | Initial schema |
| 20260412000001_fix_expire_stale_squads_return_type.sql | RPC return type fix |
| 20260414000001_seed_culturally_relevant_sample_events.sql | Seed events |
| 20260418000001_add_geo_and_pricing_columns.sql | M4 geo + pricing |
| 20260421000001_m5_phase1_personalisation.sql | saved_events, personalisation |
| 20260425000001_hot_path_indexes.sql | Index tuning |
| 20260426000001_cultural_breadth_seed.sql | Additional seed events |
| 20260426000002_fix_org_members_rls_recursion.sql | RLS hotfix |
| 20260428000001_m6_connect_schema.sql | Stripe Connect tables |
| 20260502000001_brand_sweep_event_copy.sql | Brand sweep event copy |

## Audit input vs current state

### Memory item: "20260419000001_add_saved_events.sql on disk but never applied"

**Resolved.** That file is not on disk. The `saved_events` table is created in the m5 migration `20260421000001_m5_phase1_personalisation.sql` at line 18 using `CREATE TABLE IF NOT EXISTS saved_events`. The earlier proposed migration was either renamed into the m5 migration or never landed; either way the table now ships through m5.

Code consumer `src/components/features/events/save-event-button.tsx` reads/writes `saved_events` and is in production traffic, which implies the table is applied remotely. Will confirm in remote audit step.

### Memory item: "seed migration 20260414000001 partial application (13 events in prod vs 8 expected)"

**Pending remote audit.** Cannot confirm event count without live DB access. Two plausible explanations:

1. The seed migration ran cleanly with 8 events, then `20260426000001_cultural_breadth_seed.sql` added 5 more for a total of 13. This is the most likely answer and is NOT drift.
2. The seed migration partially failed mid-INSERT, leaving 13 of an intended different total.

Will resolve in T2 below.

### .env.local has duplicate NEXT_PUBLIC_SUPABASE_URL

`.env.local` line 1 (commented out or earlier) sets `https://cqwdlimwlnyaaowwcyzp.supabase.co`; later in the same file `https://gndnldyfudbytbboxesk.supabase.co` overrides. dotenv last-write semantics mean `gndnldyfudbytbboxesk` is the live project. The earlier value is dead config.

Action: founder-managed file, will not edit. Recommended cleanup: remove the dead line in a future founder commit. Logged for visibility only.

## Remote audit - founder action required

Supabase CLI cannot enumerate remote migrations without a project link. Linking requires the database password, which is not available to this session.

### Founder action

In a PowerShell terminal in this worktree:

```powershell
npx supabase login
# If first time. Authenticates with the Supabase access token from
# https://supabase.com/dashboard/account/tokens

npx supabase link --project-ref gndnldyfudbytbboxesk
# Prompts for database password. Enter the prod DB password.
# Writes .supabase/ project link state to disk.
```

Then tell me you are done. I will run:

```powershell
npx supabase migration list --linked
npx supabase db diff --linked --schema public
```

And capture both outputs to:

- `docs/hardening/phase1/audit/supabase-migration-list.txt`
- `docs/hardening/phase1/audit/supabase-db-diff.txt`

### Remote-vs-disk reconciliation matrix (to be filled in T2)

| File on disk | Remote applied? | Notes |
| --- | --- | --- |
| 20260101000001_baseline_schema.sql | TBD | |
| 20260412000001_fix_expire_stale_squads_return_type.sql | TBD | |
| 20260414000001_seed_culturally_relevant_sample_events.sql | TBD | |
| 20260418000001_add_geo_and_pricing_columns.sql | TBD | |
| 20260421000001_m5_phase1_personalisation.sql | TBD | |
| 20260425000001_hot_path_indexes.sql | TBD | |
| 20260426000001_cultural_breadth_seed.sql | TBD | |
| 20260426000002_fix_org_members_rls_recursion.sql | TBD | |
| 20260428000001_m6_connect_schema.sql | TBD | Payment-territory: REPAIR REQUIRES SESSION 1 |
| 20260502000001_brand_sweep_event_copy.sql | TBD | |

### Event count probe

Once linked, run:

```powershell
npx supabase db remote sql --linked -- "select count(*) as event_count, status, created_at::date from events group by 2,3 order by 3"
```

Pass criteria for closing the "13 vs 8" memory item: explain the count via the seed + cultural-breadth migrations, no orphan event rows.

## Repair scope

This session repairs:
- Public-schema migrations (events, categories, saved_events, personalisation tables, indexes)
- Auth-adjacent migrations that don't touch payment columns
- Seed migrations

This session does NOT repair:
- `20260428000001_m6_connect_schema.sql` (payment-territory) - any drift here gets handed off to Session 1 via [COORDINATION] in `docs/sessions/hardening/progress.log`.
- Any drift in `organisations.stripe_*` columns - same handoff.

If the remote audit shows zero drift, no repair is needed and this audit closes with a single closure entry.

## Coordination

[COORDINATION] founder action required: `npx supabase link --project-ref gndnldyfudbytbboxesk`. Session pauses on E pending link, continues with D, F, G in parallel.

## Closure conditions

- All 10 on-disk migrations confirmed applied remotely (or explicit gap with repair plan)
- Event count discrepancy explained
- Payment-territory drift, if any, handed off to Session 1
- This file updated in-place with T2 results
- Closure logged to progress.log with prefix `[E]`
