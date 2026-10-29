-- THE WEEKLY SOCIAL REPORT DRIVE: remove what scripts/verify/social-report-drive.mts made on TEST, and nothing else.
-- Run as postgres through the Management API on TEST only (the service role is granted no delete on these tables, by
-- design):
--   scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <this file with its values set>
-- The values are the drive's own MADE lines: its two campaigns and its one share link. A campaign takes its pieces,
-- revisions, approvals, postings, entered figures and decisions with it (on delete cascade); the link takes its rows.
DO $clean$
DECLARE
  v_campaigns uuid[] := ':CAMPAIGNS'::uuid[];
  v_link uuid := ':LINK';
  v_left int;
BEGIN
  DELETE FROM public.social_campaigns WHERE id = ANY (v_campaigns) AND week_start < date '2026-07-01';
  DELETE FROM public.share_links WHERE id = v_link AND code LIKE 'bpm%';
  SELECT (SELECT count(*) FROM public.social_campaigns WHERE id = ANY (v_campaigns))
       + (SELECT count(*) FROM public.social_pieces WHERE campaign_id = ANY (v_campaigns))
       + (SELECT count(*) FROM public.share_links WHERE id = v_link)
    INTO v_left;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'CLEANUP FAILED: % rows remain', v_left;
  END IF;
END
$clean$;
SELECT 'PROOF PASSED cleanup: the drive''s campaigns, pieces and link removed, rows_left 0' AS verdict;
