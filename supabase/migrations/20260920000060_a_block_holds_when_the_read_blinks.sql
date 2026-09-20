-- ---------------------------------------------------------------------------
-- A MARKETPLACE BLOCK HOLDS WHEN THE READ THAT CHECKS IT BLINKS.
--
-- LB-GIGWHOLE, 20 September 2026, lane B.
--
-- ---------------------------------------------------------------------------
-- THE RULE ALREADY EXISTED. IT WAS A COMMENT.
--
-- 20260711000002_performer_marketplace.sql says it in its own words, above the
-- table it creates:
--
--     -- 6. marketplace_blocks: a block between an organisation and a performer
--     --    stops applications and requests BOTH ways for the pair.
--
-- Nothing in the database has ever stopped either one. The whole enforcement
-- is a single application read, src/lib/marketplace/gigs.ts:
--
--     export async function isPairBlocked(admin, organisationId, artistId) {
--       const { data } = await admin
--         .from('marketplace_blocks')
--         .select('id')
--         .eq('organisation_id', organisationId)
--         .eq('artist_id', artistId)
--         .maybeSingle()
--       return Boolean(data)
--     }
--
-- `error` is not bound. A dropped socket, a pool refusal or a statement timeout
-- leaves `data` null, `Boolean(null)` is false, and false is the answer that
-- means NOT BLOCKED. Both call sites read it as permission:
--
--     if (await isPairBlocked(admin, gig.organisation_id, artist.id)) {
--       return { ok: false, error: 'You cannot apply to this organiser.' }
--     }
--     if (await isPairBlocked(admin, org.id, req.artistId)) {
--       return { ok: false, error: 'You cannot send requests to this performer.' }
--     }
--
-- So a block is a safety decision a person made about somebody they do not want
-- contact from, and it stopped holding for the length of any fault in one read,
-- with HTTP 200 everywhere and nothing in the log. The organiser who blocked a
-- performer receives their application; the performer who was blocked is put in
-- front of the organiser who blocked them.
--
-- The application read is fixed in the same commit and now throws. This is the
-- backstop, in the place a backstop belongs: it holds against a direct SQL
-- insert, against a code path nobody has written yet, and against the read
-- above failing, which is the case that has always been possible.
--
-- ---------------------------------------------------------------------------
-- WHAT IS ENFORCED, AND WHAT DELIBERATELY IS NOT.
--
-- ENFORCED: a new application to a blocked organiser's gig, and a new booking
-- request from a blocked organisation to that performer. Those are the two acts
-- of CONTACT, and they are what the comment above calls "applications and
-- requests".
--
-- NOT ENFORCED: creating the block itself when an application already exists.
-- Blocking somebody who has already applied is the ordinary reason to block,
-- and a constraint that refused it would make the control useless exactly when
-- it is needed. The existing rows stand; the block stops what comes next.
--
-- NOT ENFORCED: a mentoring request between two performers.
-- `booking_requests.organisation_id` is NULL on those, and marketplace_blocks
-- is keyed on (organisation_id, artist_id), so the table cannot express a block
-- between two people. That is a gap in the block MODEL rather than in its
-- enforcement, it is stated here rather than silently half-covered, and it is
-- recorded in C:\dev\REVIEW-QUEUE-B.md for a decision.
--
-- ---------------------------------------------------------------------------
-- OBSERVED BEFORE WRITING, read only, on both databases, 20 September 2026.
--
--                                        TEST vkapki...   production gndnld...
--   marketplace_blocks                               0                      0
--   gig_applications                                 7                      0
--   booking_requests                                 2                      0
--   applications from a blocked pair                 0                      0
--   requests to a blocked pair                       0                      0
--
-- No row on either database breaks the rule this installs, so it goes on
-- without a repair statement and the CREATE cannot fail on data. Measured
-- rather than assumed, because a constraint cannot be added to a database that
-- already breaks it, and the one database nobody measured is the one it fails
-- on.
--
-- IS THIS DESTRUCTIVE? No. Two trigger functions and two BEFORE INSERT
-- triggers. Nothing is dropped, retyped or written.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. AN APPLICATION TO A BLOCKED ORGANISER'S GIG
-- ---------------------------------------------------------------------------
--
-- The organisation is reached through the gig rather than carried on the
-- application, so the lookup is a join of two indexed reads: gigs by primary
-- key, then the unique index on marketplace_blocks (organisation_id,
-- artist_id).
CREATE OR REPLACE FUNCTION public.enforce_marketplace_block_on_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $app$
DECLARE
  v_org UUID;
BEGIN
  SELECT organisation_id INTO v_org FROM public.gigs WHERE id = NEW.gig_id;
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.marketplace_blocks
    WHERE organisation_id = v_org AND artist_id = NEW.artist_id
  ) THEN
    RAISE EXCEPTION
      'marketplace block: organisation % and performer % cannot be put in contact',
      v_org, NEW.artist_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $app$;

COMMENT ON FUNCTION public.enforce_marketplace_block_on_application() IS
  'Refuses a gig application when the gig''s organisation has blocked the performer, or the performer has blocked them. The backstop for isPairBlocked, which read a FAILED read as "not blocked".';

DROP TRIGGER IF EXISTS trg_marketplace_block_on_application ON public.gig_applications;
CREATE TRIGGER trg_marketplace_block_on_application
  BEFORE INSERT ON public.gig_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_marketplace_block_on_application();

-- ---------------------------------------------------------------------------
-- 2. A BOOKING REQUEST TO A BLOCKED PERFORMER
-- ---------------------------------------------------------------------------
--
-- Only when an organisation is the sender. A mentoring request carries a NULL
-- organisation_id by the booking_requests_kind_shape constraint, and the block
-- table cannot express a pair of performers, so those pass through here. Said
-- in the header rather than left to be discovered.
CREATE OR REPLACE FUNCTION public.enforce_marketplace_block_on_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $req$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.marketplace_blocks
    WHERE organisation_id = NEW.organisation_id AND artist_id = NEW.artist_id
  ) THEN
    RAISE EXCEPTION
      'marketplace block: organisation % and performer % cannot be put in contact',
      NEW.organisation_id, NEW.artist_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $req$;

COMMENT ON FUNCTION public.enforce_marketplace_block_on_request() IS
  'Refuses a booking request when the sending organisation and the performer are a blocked pair. Mentoring requests between two performers carry no organisation and are not judged here, because marketplace_blocks cannot express that pair.';

DROP TRIGGER IF EXISTS trg_marketplace_block_on_request ON public.booking_requests;
CREATE TRIGGER trg_marketplace_block_on_request
  BEFORE INSERT ON public.booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_marketplace_block_on_request();

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS. Prove the shape before committing.
--
-- Shape only, deliberately. The BEHAVIOUR is proven against this database by
-- scripts/verify/lb-gigwhole-drive.mjs, which blocks a real pair and reads the
-- 23514 back from a real insert. A DO block that wrote rows to test itself
-- would have to clean up after itself inside the migration's own transaction,
-- and a migration that writes rows to prove it works is a migration that leaves
-- them behind the first time an assertion fires early.
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  missing TEXT := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_marketplace_block_on_application' AND NOT tgisinternal
  ) THEN
    missing := missing || ' trg_marketplace_block_on_application';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_marketplace_block_on_request' AND NOT tgisinternal
  ) THEN
    missing := missing || ' trg_marketplace_block_on_request';
  END IF;

  -- Both must raise check_violation rather than a bare exception, because the
  -- server actions translate 23514 into the sentence the person reads. A
  -- rewrite that dropped the ERRCODE would surface a raw database error to a
  -- performer instead of a refusal.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_marketplace_block_on_application'
      AND p.prosrc LIKE '%check_violation%'
  ) THEN
    missing := missing || ' enforce_marketplace_block_on_application does not raise check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_marketplace_block_on_request'
      AND p.prosrc LIKE '%check_violation%'
  ) THEN
    missing := missing || ' enforce_marketplace_block_on_request does not raise check_violation';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION 'LB-GIGWHOLE migration incomplete, missing:%', missing;
  END IF;

  RAISE NOTICE 'LB-GIGWHOLE: a marketplace block is now enforced by the database on both kinds of contact';
END $post$;
