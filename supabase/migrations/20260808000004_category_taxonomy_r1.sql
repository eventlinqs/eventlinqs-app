-- R1: make the category taxonomy match the platform that ships on top of it.
--
-- THE DIVERGENCE. The homepage renders nine category tiles
-- (`category-nav-rail.tsx`) and a rail per category (`page.tsx`, `byCategory`).
-- TWO of the nine match no row in `event_categories` at all, so both the tile
-- and the rail behind it can NEVER render an event, and the tile links to
-- `/events?category=...`, which resolves 200 to a permanently empty result.
-- Measured on TEST, 8 August 2026:
--
--     music                EXISTS
--     comedy               *** NO SUCH CATEGORY ***
--     food-drink           EXISTS
--     festival             EXISTS
--     arts-community       *** NO SUCH CATEGORY ***   (the table says arts-culture)
--     nightlife            EXISTS
--     sports               EXISTS
--     family               EXISTS
--     business-networking  EXISTS
--
-- This is why the category-landing repair in 2a701db moved music 0 -> 6,
-- sports 0 -> 5 and nightlife 0 -> 6 but left comedy at 0. The query was fixed;
-- there was no category for it to find.
--
-- ---------------------------------------------------------------------------
-- 1. arts-culture -> arts-community.
--
-- Two problems, one rename. The constitution bans the word in every form,
-- "route names, file names, slugs, identifiers, database tables/columns, and
-- data", and the platform ALREADY calls this category `arts-community`
-- everywhere in code: the homepage tile, the homepage rail, the category photo
-- map and the image spine. The database was the last holdout, and the mismatch
-- is exactly what made the tile unable to match an event.
--
-- The photo library KEY stays `arts-culture` (`src/lib/images/spine.ts`): that
-- is a storage path for files already uploaded, and renaming it breaks the
-- image spine. It carries a copy-tell-gate allowlist entry saying so.
--
-- 2. Comedy becomes a real category.
--
-- Law 3 (Australia-smart): LPA data has comedy as the fastest-growing ticketed
-- category in Australia, and the platform already merchandises it with a
-- homepage tile and a rail. 28 published events on TEST are tagged `comedy`
-- and none of them could reach it.
--
-- 3. The comedy-tagged events are moved into it.
--
-- Of those 28: 23 sit in arts-culture and 5 have no category at all. None sits
-- in a different specific category, so nothing is being taken away from a
-- category the organiser deliberately chose. The `comedy` TAG is the signal and
-- it is preserved, so this is reversible by reading the tag back.
--
-- 4. The `arts-culture` TAG is merged into `arts-community`.
--
-- The same banned word, in data rather than in a slug. Both tags already exist
-- (20 and 7 events) and are plainly the same concept split by an earlier
-- half-done rename, so merging them is a repair rather than a reclassification.
--
-- SAFETY. Additive and repairing only:
--   * every statement is idempotent, so a re-run is a no-op;
--   * no row is deleted, no category is removed, no event loses its tags;
--   * only `category_id` and `tags` change on events, and `category_id` only
--     where the comedy tag says it should;
--   * no payment, order, ticket or payout column is read or written.
--
-- Apply with `supabase db push --linked` from PowerShell against the TEST
-- project. NEVER the Dashboard SQL editor, NEVER the Supabase MCP, NEVER
-- against Production without Lawal running it himself.

begin;

-- 1. The rename. Guarded so a re-run, or a database where it already happened,
--    is a no-op rather than an error on the UNIQUE constraints.
update public.event_categories
   set slug = 'arts-community',
       name = 'Arts & Community'
 where slug = 'arts-culture'
   and not exists (
        select 1 from public.event_categories where slug = 'arts-community'
       );

-- 2. Comedy. sort_order 9 puts it after the eight seeded categories rather than
--    renumbering rows other surfaces may already order by.
insert into public.event_categories (name, slug, icon, sort_order, is_active)
select 'Comedy', 'comedy', 'mic', 9, true
 where not exists (select 1 from public.event_categories where slug = 'comedy');

-- 3. Move the comedy-tagged events onto the comedy category. Restricted to
--    events that are currently uncategorised or in arts-community, so an event
--    an organiser deliberately filed elsewhere is never moved out from under
--    them.
update public.events e
   set category_id = (select id from public.event_categories where slug = 'comedy')
 where e.tags @> '["comedy"]'::jsonb
   and (
        e.category_id is null
        or e.category_id = (select id from public.event_categories where slug = 'arts-community')
       );

-- 4. Merge the arts-culture tag into arts-community. jsonb_agg(distinct ...)
--    also de-duplicates an event that already carried both.
update public.events e
   set tags = (
        select jsonb_agg(distinct
                 case when tag = '"arts-culture"'::jsonb
                      then '"arts-community"'::jsonb
                      else tag end)
          from jsonb_array_elements(e.tags) as tag
       )
 where e.tags @> '["arts-culture"]'::jsonb;

commit;
