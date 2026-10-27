-- ITEM 11: remove what scripts/verify/social-engine-drive.mts made on TEST, and nothing else. Run as postgres through
-- the Management API on TEST only (the service role is granted no delete on the social tables, by design). The two
-- values are the drive's own MADE line: its start moment and the TEST admin it planned as.
DO $clean$
DECLARE
  v_since timestamptz := ':SINCE';
  v_by uuid := ':BY';
  v_posts int;
  v_links int;
  v_events int;
BEGIN
  CREATE TEMP TABLE w3_links ON COMMIT DROP AS
    SELECT id FROM public.share_links WHERE created_by = v_by AND created_at >= v_since AND channel = 'instagram';
  DELETE FROM public.social_posts WHERE planned_by = v_by AND planned_at >= v_since;
  GET DIAGNOSTICS v_posts = ROW_COUNT;
  DELETE FROM public.share_link_events WHERE link_id IN (SELECT id FROM w3_links);
  GET DIAGNOSTICS v_events = ROW_COUNT;
  DELETE FROM public.share_links WHERE id IN (SELECT id FROM w3_links);
  GET DIAGNOSTICS v_links = ROW_COUNT;
  RAISE NOTICE 'removed % posts (with their versions, approvals and postings), % share links, % link events', v_posts, v_links, v_events;
  IF EXISTS (SELECT 1 FROM public.social_posts WHERE planned_by = v_by AND planned_at >= v_since) THEN
    RAISE EXCEPTION 'CLEANUP FAILED: posts remain';
  END IF;
END
$clean$;
SELECT (SELECT count(*) FROM public.social_posts) AS posts_left, (SELECT count(*) FROM public.social_drafts) AS drafts_left;
