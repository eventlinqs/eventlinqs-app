-- The waitlist bridge, part 2: give every existing event its city claim back.
--
-- WHY. `events.city_primary` is the ONE column every city-scoped surface
-- filters on, including the weekly local digest
-- (`src/lib/broadcast/digest.ts`, `.eq('city_primary', citySlug)`). The
-- organiser wizard only ever wrote `venue_city` as free text and never wrote
-- `city_primary`, so an organiser could publish an event in Geelong that the
-- Geelong audience could never be shown. Measured on the TEST database on
-- 8 August 2026: 330 of 362 published events, 91 percent, carried a null
-- city_primary while carrying a perfectly recognisable venue_city.
--
-- The root fix is in the application (`resolveCitySlug` wired into
-- createEvent and updateEvent), so this never recurs. This migration repairs
-- the rows written before it.
--
-- SAFETY. Additive repair only:
--   * touches ONE column, `city_primary`, and only where it is already null,
--     so a hand-set or admin-set value is never overwritten;
--   * matches only on an EXACT case-folded, whitespace-trimmed equality
--     against the canonical `public.cities` name or slug, so a suburb
--     ("North Melbourne") or an unlisted town ("Torquay") is left null rather
--     than filed under a city the organiser never chose;
--   * writes only slugs that already exist in `public.cities`, so the
--     existing foreign key cannot be violated;
--   * no payment, order, ticket or payout column is read or written.
--
-- Reversal, if it were ever needed, is `update public.events set
-- city_primary = null where ...`, but a null here is the defect, not a state
-- worth returning to.
--
-- Apply with `supabase db push --linked` from PowerShell against the TEST
-- project. NEVER the Dashboard SQL editor, NEVER the Supabase MCP, NEVER
-- against Production without Lawal running it himself.

begin;

update public.events e
   set city_primary = c.slug
  from public.cities c
 where e.city_primary is null
   and e.venue_city is not null
   and lower(btrim(e.venue_city)) in (lower(c.name), lower(c.slug));

commit;
