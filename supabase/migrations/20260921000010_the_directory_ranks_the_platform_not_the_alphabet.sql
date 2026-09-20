-- ---------------------------------------------------------------------------
-- "STRONGEST DRAW FIRST" RANKED THE ALPHABETICALLY FIRST 48 PERFORMERS.
--
-- LB-DRAWSORT, 21 September 2026, lane B.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT, IN THE ORDER THE CODE RUNS IT.
--
-- src/app/artists/page.tsx, the public performer directory, offers a sort
-- control whose option reads "Strongest draw first". What it did:
--
--   1. fetchDirectoryArtists  ->  SELECT ... ORDER BY name, id LIMIT 48
--   2. fetchDrawTotalsForArtists(those 48 ids)
--   3. rows.sort((x, y) => (y.draw?.tickets ?? 0) - (x.draw?.tickets ?? 0))
--
-- The bound is applied at step 1, BY NAME, and the ranking at step 3, over
-- whatever survived it. So the control does not rank the platform's strongest
-- draw. It ranks the alphabetically first 48 performers by draw and calls that
-- the answer. A performer named Zara who has sold four thousand tickets is not
-- ranked below somebody, she is not on the page at all, while the page's own
-- hero says "Talent with the numbers to prove it".
--
-- With the five performers on TEST the two orders are identical, which is
-- exactly why this survived a driven proof of the numbers themselves on
-- 19 September: the truncation of the NUMBERS was found and fixed
-- (fetchDrawTotalsForArtists now pages), and the truncation of the CANDIDATE
-- SET was recorded as found-and-not-fixed in C:\dev\REVIEW-QUEUE-B.md because
-- it needed the ranking to become a query rather than a post-pass. This is
-- that query.
--
-- ---------------------------------------------------------------------------
-- THE SECOND DEFECT ON THE SAME LINE, WHICH IS A DISCLOSURE ONE.
--
-- Step 3 sorted on `draw?.tickets ?? 0` for EVERY performer, and the badge that
-- shows the number renders only when `artist.draw_consent` is true. A performer
-- who has NOT consented to publishing their draw was therefore placed by it: at
-- the top of "strongest draw first", with no badge, which publishes the rank of
-- a number they asked us not to publish. Position is disclosure.
--
-- So the ranking key installed here is the PUBLISHED draw: a performer's
-- attributed tickets when they have consented, and zero when they have not.
-- A performer with no published draw ranks with the others who have none, in
-- name order. The number and its rank now appear and disappear together.
--
-- ---------------------------------------------------------------------------
-- WHAT COUNTS AS DRAW, MATCHED TO THE BADGE RATHER THAN INVENTED HERE.
--
-- src/lib/marketplace/showcase.ts computes the badge as: the share_links tagged
-- to the performer, the `conversion` rows on those links that carry an order,
-- and the count of tickets on those orders. This function computes the same
-- thing. It has to, because the page renders the TypeScript number beside the
-- SQL order, and two computations of one quantity is how a directory ends up
-- displaying 40, 120, 90 down the page.
--
-- ONE DIFFERENCE, DELIBERATE, AND THE TYPESCRIPT IS CHANGED TO MATCH IN THE
-- SAME COMMIT. The schema permits one order to carry a conversion on two
-- different links, so an order can be claimed by two performers:
-- share_link_events is unique on (link_id, order_id), not on order_id. The
-- TypeScript resolved that with a Map keyed by order id, so the winner was
-- whichever conversion row happened to be processed last, which is an
-- arbitrary answer that can change between two renders of the same page. Both
-- sides now take the EARLIEST conversion by (occurred_at, id), which is the
-- first claim, is deterministic, and agrees with AQ2's "attribution is the
-- single stored decision per order".
--
-- ---------------------------------------------------------------------------
-- OBSERVED BEFORE WRITING, read only, on both databases, 21 September 2026.
-- TEST through `supabase db query --linked`, production through the Management
-- API SELECT-only reader (scripts/lib/production-select.mjs).
--
--                                              TEST vkapki...  production gndnld...
--   artists                                               5                     0
--   artists with draw_consent                             1                     0
--   share_links carrying an artist                       10                     0
--   conversion rows carrying an order                    14                     0
--   orders claimed by two performers                      0                     0
--
-- The last row is measured rather than assumed, because it is the only case in
-- which the first-claim rule above changes an existing answer. It changes none
-- on either database today; it is installed so that the two sides cannot drift
-- when it does occur.
--
-- IS THIS DESTRUCTIVE? No. One new function and two indexes that support it.
-- Nothing is dropped, retyped, written or repaired. Reversible by dropping the
-- function.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. THE INDEXES THE RANKING READS THROUGH.
--
-- `share_link_events (link_id, kind)` already exists and serves the join from
-- links to conversions. What did not exist is a way to reach the conversions
-- for an ORDER without scanning, and a way to reach an order's tickets: the
-- ranking groups by order_id and then joins tickets on order_id.
--
-- Both are `if not exists`, and the first is partial, so neither costs a write
-- path anything for rows it never matches.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS share_link_events_conversion_order_idx
  ON public.share_link_events (order_id, occurred_at, id)
  WHERE kind = 'conversion' AND order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_order_idx
  ON public.tickets (order_id);

-- ---------------------------------------------------------------------------
-- 2. THE RANKED DIRECTORY READ.
--
-- Returns the performer ids the directory should render, IN ORDER, with the
-- published draw each was ranked on, after the same four filters the unranked
-- read applies. The caller then reads those rows; the bound is applied here,
-- after the ranking, which is the whole point.
--
-- SECURITY INVOKER, stated rather than left to the default, and granted to
-- service_role alone. The aggregate reads share_link_events and tickets, which
-- carry no public read policy, so an invoker function is incapable of leaking
-- them: a caller without rights to those tables aggregates over nothing. The
-- directory page calls it through the admin client and is the only caller.
--
-- STABLE rather than VOLATILE so the planner may fold it, and because it
-- writes nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.directory_artists_ranked_by_draw(
  p_city_slug TEXT DEFAULT NULL,
  p_performance_type TEXT DEFAULT NULL,
  p_available_only BOOLEAN DEFAULT FALSE,
  p_mentor_only BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 48
)
RETURNS TABLE (artist_id UUID, published_tickets INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $ranked$
  WITH candidates AS (
    SELECT a.id, a.name, a.draw_consent
    FROM public.artists a
    WHERE (p_city_slug IS NULL OR a.city_slug = p_city_slug)
      AND (p_performance_type IS NULL OR a.performance_types @> ARRAY[p_performance_type])
      AND (NOT COALESCE(p_available_only, FALSE) OR a.available_for_booking)
      AND (NOT COALESCE(p_mentor_only, FALSE) OR a.mentor_open)
  ),
  -- One performer per attributed order, and it is the FIRST claim rather than
  -- an arbitrary one. DISTINCT ON collapses the order to a single row; the
  -- ORDER BY inside decides which, and (occurred_at, id) is total because id is
  -- the primary key.
  claims AS (
    SELECT DISTINCT ON (e.order_id) e.order_id, sl.artist_id
    FROM public.share_link_events e
    JOIN public.share_links sl ON sl.id = e.link_id
    WHERE e.kind = 'conversion'
      AND e.order_id IS NOT NULL
      AND sl.artist_id IN (SELECT id FROM candidates)
    ORDER BY e.order_id, e.occurred_at, e.id
  ),
  draw AS (
    SELECT c.artist_id, COUNT(t.id)::INTEGER AS tickets
    FROM claims c
    JOIN public.tickets t ON t.order_id = c.order_id
    GROUP BY c.artist_id
  )
  SELECT
    cand.id,
    -- The PUBLISHED draw. Consent gates the number on the page, so it gates the
    -- rank as well; see the disclosure note in this file's header.
    CASE WHEN cand.draw_consent THEN COALESCE(d.tickets, 0) ELSE 0 END AS published_tickets
  FROM candidates cand
  LEFT JOIN draw d ON d.artist_id = cand.id
  ORDER BY
    CASE WHEN cand.draw_consent THEN COALESCE(d.tickets, 0) ELSE 0 END DESC,
    -- `name` is not unique, so it cannot break a tie on its own and the page
    -- could reshuffle between two renders. `id` is the primary key and makes
    -- the order total. The same reasoning is written out in
    -- src/lib/marketplace/showcase.ts and src/lib/marketplace/cities.ts.
    cand.name ASC,
    cand.id ASC
  LIMIT GREATEST(COALESCE(p_limit, 48), 0);
$ranked$;

COMMENT ON FUNCTION public.directory_artists_ranked_by_draw(TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER) IS
  'The public performer directory ordered by PUBLISHED attributed draw, filtered and bounded in that order. Replaces a JavaScript sort that ranked the alphabetically first 48 performers and that placed non-consenting performers by a number they had not published.';

-- Postgres grants EXECUTE on a new function to PUBLIC by default, so the
-- revoke is the part that matters and it comes first.
REVOKE EXECUTE ON FUNCTION public.directory_artists_ranked_by_draw(TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.directory_artists_ranked_by_draw(TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS. Prove the shape before committing.
--
-- Shape and one BEHAVIOURAL property that can be proven without writing rows:
-- that the function answers at all and answers in a non-increasing order on
-- whatever this database already holds. The ranking against a fixture larger
-- than the page bound is proven by scripts/verify/lb-drawsort-drive.mjs against
-- the real project, because a migration that writes 60 performers to test
-- itself is a migration that leaves them behind the first time an assertion
-- fires early.
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  missing TEXT := '';
  prev INTEGER := NULL;
  r RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'directory_artists_ranked_by_draw'
  ) THEN
    missing := missing || ' directory_artists_ranked_by_draw';
  END IF;

  -- SECURITY INVOKER, asserted rather than trusted: prosecdef true would mean a
  -- definer function reading two tables that carry no public read policy.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'directory_artists_ranked_by_draw'
      AND p.prosecdef
  ) THEN
    missing := missing || ' directory_artists_ranked_by_draw is SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'share_link_events_conversion_order_idx'
  ) THEN
    missing := missing || ' share_link_events_conversion_order_idx';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'tickets_order_idx') THEN
    missing := missing || ' tickets_order_idx';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'LB-DRAWSORT migration incomplete, missing:%', missing;
  END IF;

  FOR r IN SELECT published_tickets FROM public.directory_artists_ranked_by_draw() LOOP
    IF prev IS NOT NULL AND r.published_tickets > prev THEN
      RAISE EXCEPTION 'LB-DRAWSORT: the ranked directory came back out of order (% after %)',
        r.published_tickets, prev;
    END IF;
    prev := r.published_tickets;
  END LOOP;

  RAISE NOTICE 'LB-DRAWSORT: the performer directory now ranks in the database, over the whole filtered set';
END $post$;
