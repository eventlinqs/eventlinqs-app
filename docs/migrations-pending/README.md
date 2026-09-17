# Migrations written, waiting on the founder

A migration in `supabase/migrations/` is a migration the guards expect to already
exist on production. Two of them say so, and they are right:

- `scripts/guards/types-cover-migrations.mjs` replays every file in that folder
  and demands each object it creates from the committed `src/types/database.ts`.
- `scripts/guards/types-drift-guard` compares that same committed file with the
  LIVE schema of production.

Together they enforce the constitution's order: **schema first, then code.**
Applying a migration to production is reserved to the founder (Verification and
gates, Migrations; Law 10 leaves it reserved), and merging code is not. So a
migration file dropped into `supabase/migrations/` before he has applied it turns
main red for every lane until he acts, which is a lane blocking three other
people on a step it cannot take.

This folder is where such a file waits. It is in version control, so it is
reviewable and diffable; it is under `docs/`, which `.vercelignore` strips from
the upload and which no build-time script reads, so nothing at build time can
depend on it.

## How one leaves this folder

1. The founder applies it. The one command is in `REVIEW-QUEUE-C.md` beside the
   file that needs it.
2. `src/types/database.ts` is regenerated against the now-matching schema.
3. The file is moved into `supabase/migrations/` in the same commit as the
   regenerated types, and both guards go green together.

## What is here now

| File | Item | What it does | Who is waiting |
|---|---|---|---|
| `20260914000001_seo_settings.sql` | close-out SEO3 step 2 | Creates `public.seo_settings` and seeds `discovery_indexing_threshold` at 1, so the owner can change what search engines index without a deploy. | Nobody. The code reads the row when it exists and falls back to the compiled constant when it does not, so the platform behaves identically before and after. |
| `20260914000002_accessibility_fields.sql` | close-out SEO5 step 4 | Adds twelve accessibility columns to `public.events` and ten to `public.venues`, every one traced to an Australian primary source, and GRANTS the ten venue columns to `anon` (that table carries a column-level grant, not a table-level one, so a new column is invisible without it). | Nobody. Before it is applied, every property reads `undefined`, the derivation returns nothing and the section renders nothing at all, which is exactly what an unfilled event looks like. The organiser panel says the fields are not available yet and saves nothing; it is deliberately NOT part of `updateEvent`, because PostgREST fails a whole statement on a column it does not have and folding these in would have stopped every organiser saving every event until he acted. |

APPLIED TO **TEST** ALREADY, which is not the same thing as applied. Both files
above have been run against `vkapkibzokmfaxqogypq` so the code could be driven
against a real schema; production `gndnldyfudbytbboxesk` is untouched and the
committed `src/types/database.ts` still describes it, which is why
`types-drift` and `types-cover-migrations` are both green.
