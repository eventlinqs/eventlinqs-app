-- THE PART H DRIVE: remove what scripts/verify/engine-today-drive.mts made on TEST, and nothing else.
-- Run as postgres through the Management API on TEST only (the service role is granted no delete on these tables, by
-- design):
--   scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <this file with its values set>
-- The values are the drive's own MADE and STARTED lines: its one campaign (June 2026), its one removal request, and the
-- moment it started. The campaign takes its pieces, revisions, approvals, postings and /go presses with it (on delete
-- cascade). The reports the drive's sweeps kept are every organiser_night_reports row read after it started: the table
-- is new and nothing else writes it on TEST.
DO $clean$
DECLARE
  v_campaign uuid := ':CAMPAIGN';
  v_removal uuid := ':REMOVAL';
  v_started timestamptz := ':STARTED';
  v_left int;
BEGIN
  DELETE FROM public.social_campaigns WHERE id = v_campaign AND week_start < date '2026-07-01';
  DELETE FROM public.removal_requests WHERE id = v_removal AND requester_name LIKE 'bp drive %';
  DELETE FROM public.organiser_night_reports WHERE read_at >= v_started;
  SELECT (SELECT count(*) FROM public.social_campaigns WHERE id = v_campaign)
       + (SELECT count(*) FROM public.social_pieces WHERE campaign_id = v_campaign)
       + (SELECT count(*) FROM public.removal_requests WHERE id = v_removal)
       + (SELECT count(*) FROM public.organiser_night_reports WHERE read_at >= v_started)
       + (SELECT count(*) FROM public.go_presses WHERE visitor LIKE 'bpdrive%')
    INTO v_left;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'CLEANUP FAILED: % rows remain', v_left;
  END IF;
END
$clean$;
SELECT 'PROOF PASSED cleanup: the drive''s campaign, pieces, presses, removal request and kept reports removed, rows_left 0' AS verdict;
