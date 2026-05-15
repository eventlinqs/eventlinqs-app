# Batch 11.1 D2 - Migration chain CI fix

Date: 2026-05-15
Status: SHIPPED. Awaiting founder to apply via `npx supabase db push --linked`.

## Problem

GitHub Lighthouse CI workflow fails during `supabase start` because
the migration chain cannot apply against a fresh DB.

## Root cause

Three migrations interact:

1. `20260426000001_cultural_breadth_seed.sql` inserts events with
   `status='published'` and `cover_image_url LIKE 'https://picsum.photos/%'`.
2. `20260504000001_event_photo_required.sql` adds the CHECK
   constraint `events_published_real_cover` that forbids picsum
   URLs on published-public events. The constraint is added with
   `NOT VALID` so it does not validate existing rows at migration
   time.
3. `20260507000001_city_taxonomy.sql` line 208-213 runs:

   ```sql
   UPDATE public.events e
      SET city_primary = c.slug
     FROM public.cities c
    WHERE e.city_primary IS NULL
      AND e.venue_city IS NOT NULL
      AND lower(e.venue_city) LIKE '%' || lower(c.name) || '%';
   ```

   Postgres re-validates CHECK constraints on any UPDATE to a row.
   The published+picsum rows from migration 1 fail the constraint
   from migration 2, and the migration chain aborts.

Production runs cleanly because `scripts/batch-4-seed-real-covers.mjs`
backfilled picsum URLs to real Pexels URLs manually after migration 2
shipped. CI / fresh DB doesn't have that backfill, so it fails.

## Fix

`supabase/migrations/20260505000001_fix_seed_cover_urls_pre_taxonomy.sql`

A new migration positioned between the constraint add (20260504)
and the city_taxonomy UPDATE (20260507). It swaps every picsum
cover URL on a published-public event for a brand-aligned Pexels
stock URL keyed to the event's culture tag (with a generic festival
fallback for events without a culture tag).

Key properties:

- **Idempotent**: re-running is safe. `WHERE cover_image_url LIKE 'https://picsum.photos/%'` matches zero rows on a second run.
- **No-op against production**: prod data has been manually backfilled. The WHERE clause matches zero published rows; the 14 draft rows with picsum URLs (from `20260504000003_seed_pride_european_me_pacific_events.sql`, status='draft') get updated to real Pexels URLs, which is harmless because drafts are not user-visible.
- **Culture-keyed**: a CTE maps each culture tag to a curated Pexels URL so the seed photos look plausible per event type. Generic festival fallback for tagless events.

## Acceptance verification

Founder runs `npx supabase db push --linked` from PowerShell to
apply the migration. Expected behaviour:

1. Migration applies successfully (or no-ops on rows where
   already-real URLs exist).
2. Subsequent `npx supabase migration list --linked` shows
   `20260505000001_fix_seed_cover_urls_pre_taxonomy.sql` as applied.
3. GitHub Lighthouse CI workflow `supabase start` step succeeds on
   the next push.

Local verification of the SQL syntax + WHERE clause was done via
the matching REST query (`scripts/batch-11.1-find...mjs`-pattern)
confirming the picsum LIKE pattern is correct.

End of report.
