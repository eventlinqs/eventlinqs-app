-- ===========================================================================
-- "Arts & Community" BECOMES "Arts". THE DISPLAY NAME ONLY.
-- ===========================================================================
--
-- FOUNDER RULING, 27 August 2026:
--
--   "Arts & Community becomes Arts everywhere. Having Communities and
--    Arts & Community side by side on the homepage means two different things
--    and it is confusing."
--
-- THE SLUG DELIBERATELY DOES NOT CHANGE, and the reasoning is recorded here so
-- nobody 'finishes the job' later and reintroduces the class this platform has
-- already been bitten by twice.
--
--   1. The homepage tile renders the NAME. The slug appears only in the URL bar
--      after a click, so the confusion the ruling describes is entirely fixed by
--      this one column.
--
--   2. A slug rename would need a THIRD storage folder. The category spine
--      objects were copied into stock/categories/arts-community/ on
--      26 August 2026; renaming the slug to `arts` means copying them again, or
--      leaving the storage key pointing at a folder the slug no longer names.
--      That mismatch IS the defect that published the retired path into every
--      homepage image URL, found on 26 August.
--
--   3. It would make a two-hop alias chain. Today CATEGORY_SLUG_ALIASES maps the
--      retired `arts-culture` to `arts-community`. Renaming again would leave one
--      category carrying two retired names, and that map is the only thing
--      keeping already-shared links alive.
--
-- WHY A MIGRATION AND NOT A BARE UPDATE. 20260808000004_category_taxonomy_r1.sql
-- SETS this name. A hand-run UPDATE would be silently reverted the next time a
-- fresh environment replays the migrations, which is how a fix becomes a defect
-- that only appears on new deployments.
--
-- The homepage reads the name live from this table (the tiles stopped carrying
-- hand-typed names on 26 August), so this row is the only place it lives.
-- ---------------------------------------------------------------------------

UPDATE public.event_categories
SET name = 'Arts'
WHERE slug = 'arts-community';

COMMENT ON TABLE public.event_categories IS
  'The live category taxonomy. Display names are read from here by every '
  'surface; the homepage curation in src/lib/categories/homepage-curation.ts '
  'chooses WHICH nine and in what order, and nothing else about a category is '
  'typed out anywhere. Slug renames are expensive (storage keys, the alias map, '
  'the redirect table, the sitemap) and are avoided where a display name will do.';
