-- THE CLAIM ACCEPTANCE DRIVE: put back what scripts/verify/claim-acceptance-drive.mjs changed on TEST, and remove what it
-- made, nothing else. Run as postgres through the Management API on TEST only (the service role is granted no delete on
-- these tables, by design); the drive runs it itself in its finally, with its values set:
--   :USER      the claimant account the drive made (everything it wrote carries this user)
--   :SNAPSHOT  the venue, its series and their nights to come as they were before the claim (jsonb)
DO $clean$
DECLARE
  v_user uuid := ':USER';
  v_snap jsonb := ':SNAPSHOT'::jsonb;
  v_row jsonb;
  v_left int;
BEGIN
  -- What the claimant made: images (newest first, as a replacement points at the one it replaced), the yes, the claim.
  UPDATE public.social_assets SET replaced_by = NULL WHERE created_by = v_user;
  DELETE FROM public.social_assets WHERE created_by = v_user;
  DELETE FROM public.organiser_permissions WHERE logged_by = v_user;

  -- The venue, its series and their nights back to their organisation, source and state.
  UPDATE public.venues v
     SET organisation_id = (v_snap #>> '{venue,organisation_id}')::uuid,
         listing_source = v_snap #>> '{venue,listing_source}',
         claimed_at = (v_snap #>> '{venue,claimed_at}')::timestamptz
   WHERE v.id = (v_snap #>> '{venue,id}')::uuid;
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_snap -> 'series') LOOP
    UPDATE public.event_series
       SET organisation_id = (v_row ->> 'organisation_id')::uuid, listing_source = v_row ->> 'listing_source', status = v_row ->> 'status'
     WHERE id = (v_row ->> 'id')::uuid;
  END LOOP;
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_snap -> 'events') LOOP
    UPDATE public.events SET organisation_id = (v_row ->> 'organisation_id')::uuid WHERE id = (v_row ->> 'id')::uuid;
  END LOOP;

  DELETE FROM public.listing_claims WHERE claimant_user_id = v_user;
  DELETE FROM public.organisation_members WHERE user_id = v_user;
  DELETE FROM public.organisations WHERE owner_id = v_user;

  SELECT (SELECT count(*) FROM public.social_assets WHERE created_by = v_user)
       + (SELECT count(*) FROM public.organiser_permissions WHERE logged_by = v_user)
       + (SELECT count(*) FROM public.listing_claims WHERE claimant_user_id = v_user)
       + (SELECT count(*) FROM public.organisations WHERE owner_id = v_user)
       + (SELECT count(*) FROM public.venues WHERE id = (v_snap #>> '{venue,id}')::uuid
            AND (organisation_id IS DISTINCT FROM (v_snap #>> '{venue,organisation_id}')::uuid
                 OR listing_source IS DISTINCT FROM v_snap #>> '{venue,listing_source}'
                 OR claimed_at IS DISTINCT FROM (v_snap #>> '{venue,claimed_at}')::timestamptz))
    INTO v_left;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'CLEANUP FAILED: % rows remain or differ', v_left;
  END IF;
END
$clean$;
SELECT 'CLEANUP PASSED: the drive''s rows removed and the venue put back' AS verdict;
