-- THE WEEKLY CAMPAIGN DRIVE: remove what scripts/verify/social-campaign-drive.mts made on TEST, and nothing else. Run as
-- postgres through the Management API on TEST only (the service role is granted no delete on these tables, by design):
--   scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <this file with its values set>
-- The values are the drive's own MADE lines: the campaign, the assets, its start moment and the TEST admin it ran as.
DO $clean$
DECLARE
  v_campaign uuid := ':CAMPAIGN';
  v_assets uuid[] := ':ASSETS'::uuid[];
  v_since timestamptz := ':SINCE';
  v_by uuid := ':BY';
  v_links int;
  v_left int;
BEGIN
  -- The campaign's pieces, revisions, decisions, approvals, postings, exclusions and image requests go with it.
  DELETE FROM public.social_campaigns WHERE id = v_campaign;
  DELETE FROM public.social_assets WHERE id = ANY (v_assets);
  -- The partner kits' own links, minted by the drive alone.
  DELETE FROM public.share_link_events WHERE link_id IN (
    SELECT id FROM public.share_links WHERE created_by = v_by AND created_at >= v_since AND channel = 'other');
  DELETE FROM public.share_links WHERE created_by = v_by AND created_at >= v_since AND channel = 'other';
  GET DIAGNOSTICS v_links = ROW_COUNT;
  SELECT count(*) INTO v_left FROM public.social_pieces WHERE campaign_id = v_campaign;
  IF v_left > 0 OR EXISTS (SELECT 1 FROM public.social_assets WHERE id = ANY (v_assets)) THEN
    RAISE EXCEPTION 'CLEANUP FAILED: rows remain';
  END IF;
  RAISE NOTICE 'removed the campaign, its pieces and their history, % assets and % partner links', cardinality(v_assets), v_links;
END
$clean$;
SELECT (SELECT count(*) FROM public.social_campaigns WHERE id = ':CAMPAIGN') AS campaigns_left,
       (SELECT count(*) FROM public.social_assets WHERE id = ANY (':ASSETS'::uuid[])) AS assets_left;
