-- Give every existing event its DISTRICT claim, so suburb pages stop being
-- copies of the city page.
--
-- WHY. `events.suburb_primary` was never written by anything. The organiser
-- wizard did not write it, no backfill had ever filled it, and on TEST exactly
-- 0 of 362 published events carried one. Every /city/[slug]/[suburb] page was
-- therefore permanently empty of organiser events.
--
-- The page hid that, which is why it survived every gate. Its comment claimed
-- the bridge was "venue_city matching city OR venue_name containing the suburb
-- name", but the code only ever applied the first half: it selected every event
-- in the CITY and rendered them under the district's name. So
-- /city/melbourne/inner-melbourne and /city/melbourne/bayside returned the
-- identical list, each asserting those were its own district's events. Nothing
-- errored and every page looked full. A wrong answer that looks like a right
-- one is worse than an empty one.
--
-- WHY THIS IS NOT THE CITY BACKFILL (20260808000001). That one resolves the
-- locality the organiser TYPED, because "Geelong" is the city of Geelong. A
-- district cannot be derived that way and must not be guessed from a city name:
-- the entries the platform ships are metropolitan DISTRICTS ("Inner West",
-- "Eastern Suburbs"), not names any organiser ever types, and no text column
-- contains one. What is real is the venue's coordinates and the district
-- centroids already in `public.suburbs`.
--
-- THE RULE, identical to the one the application now applies at write time
-- (`src/lib/cities/resolve-suburb.ts`, `resolveSuburbSlug`): the ONE NEAREST
-- district centroid, within 12 km, among the districts OF THAT EVENT'S OWN
-- CITY. Write and read decided by the same rule, or the suburb page and the
-- browse view give different answers to the same question.
--
-- Assignment is exclusive on purpose. Melbourne's six districts all sit within
-- 12 km of the CBD, so "every district within range" would hand the same events
-- to all six. `order by distance limit 1` is what makes it an assignment.
--
-- SAFETY. Additive repair only:
--   * touches ONE column, `suburb_primary`, and only where it is already null,
--     so a hand-set value is never overwritten;
--   * writes only slugs that already exist in `public.suburbs`, so the existing
--     foreign key cannot be violated;
--   * an event with no coordinates, no city claim, or nothing within 12 km is
--     LEFT NULL. That is the honest state: the event is still listed, still
--     searchable and still on its city page, it is simply not claimed by a
--     district. Inventing one is the failure mode, not the fix;
--   * no payment, order, ticket or payout column is read or written.
--
-- ORDERING. Runs after 20260808000001 because it reads `city_primary`, which
-- that migration fills. Applied in the same push, the city claim exists by the
-- time this statement runs.
--
-- Apply with `supabase db push --linked` from PowerShell against the TEST
-- project. NEVER the Dashboard SQL editor, NEVER the Supabase MCP, NEVER
-- against Production without Lawal running it himself.

-- A CORRELATED SCALAR SUBQUERY IN SET, not UPDATE ... FROM LATERAL.
--
-- The first version of this used `from lateral (... where s.city_slug =
-- e.city_primary ...)` and PostgreSQL rejected it with "invalid reference to
-- FROM-clause entry for table e" (SQLSTATE 42P10): the UPDATE target is not in
-- scope for a LATERAL item in the FROM clause. A correlated subquery on the
-- right-hand side of SET can see the target row, which is what this needs.
--
-- The subquery yields NULL when nothing is within range. Assigning NULL to a
-- column the WHERE clause has already restricted to NULL is a no-op, so an
-- event outside every district is left exactly as it was.

begin;

update public.events e
   set suburb_primary = (
        select s.slug
          from public.suburbs s
         where s.city_slug = e.city_primary
           and s.is_active
           -- Haversine, kilometres. Mirrors distanceKm() in
           -- src/lib/cities/resolve-suburb.ts.
           and 6371 * 2 * asin(sqrt(
                 power(sin(radians(s.latitude - e.venue_latitude) / 2), 2)
                 + cos(radians(e.venue_latitude)) * cos(radians(s.latitude))
                   * power(sin(radians(s.longitude - e.venue_longitude) / 2), 2)
               )) <= 12
         -- ORDER BY distance + LIMIT 1 is what makes this an ASSIGNMENT rather
         -- than a membership test. Every Melbourne district sits within 12 km
         -- of the CBD, so "any district in range" would file the same event
         -- under all six.
         order by 6371 * 2 * asin(sqrt(
                 power(sin(radians(s.latitude - e.venue_latitude) / 2), 2)
                 + cos(radians(e.venue_latitude)) * cos(radians(s.latitude))
                   * power(sin(radians(s.longitude - e.venue_longitude) / 2), 2)
               )) asc
         limit 1
       )
 where e.suburb_primary is null
   and e.city_primary is not null
   and e.venue_latitude is not null
   and e.venue_longitude is not null;

commit;
