-- COMING UP's PIECE RULE, THE PROOF (supabase/migrations/20261030204001_social_coming_up.sql), on TEST. One transaction
-- that ends by RAISING its verdict, so TEST is left as found.
--   RED:   this file alone (the migration not there).
--   GREEN: 20261030180401_social_editions, 20261030204001_social_coming_up and this file joined:
--          scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <the three, joined>
DO $proof$
DECLARE
  v_user uuid;
  v_campaign uuid;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT u.id INTO v_user FROM auth.users u ORDER BY u.created_at LIMIT 1;
  INSERT INTO public.social_campaigns (week_start, planned_by) VALUES ('2099-01-05', v_user) RETURNING id INTO v_campaign;

  -- C1: a Coming Up for a city is kept, and an edition of the earlier list still is.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'coming_up', 'geelong', 'attendees', 'audience_growth', 'What is coming up', 'Open the city', 'Visits through its link', 'https://www.eventlinqs.com.au/city/geelong', 'feed'),
           (v_campaign, 'tonight_tomorrow', 'geelong', 'attendees', 'audience_growth', 'Friday and Saturday', 'Open the city', 'Visits through its link', 'https://www.eventlinqs.com.au/city/geelong', 'feed');
    v_out := v_out || ' | C1 Coming Up kept beside the earlier editions: PASS';
  EXCEPTION WHEN others THEN v_out := v_out || ' | C1 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- C2: a second for one city is refused.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'coming_up', 'geelong', 'attendees', 'audience_growth', 'Again', 'Open the city', 'Visits', 'https://www.eventlinqs.com.au/city/geelong', 'feed');
    v_out := v_out || ' | C2 a second Coming Up for one city kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN v_out := v_out || ' | C2 a second for one city refused: PASS';
    WHEN others THEN v_out := v_out || ' | C2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- C3: a kind nobody named is still refused.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'midweek_teaser', 'geelong', 'attendees', 'audience_growth', 'No such kind', 'Open', 'Visits', 'https://www.eventlinqs.com.au/city/geelong', 'feed');
    v_out := v_out || ' | C3 an unnamed kind kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | C3 an unnamed kind refused: PASS';
    WHEN others THEN v_out := v_out || ' | C3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  IF v_fail = 0 THEN
    RAISE EXCEPTION 'PROOF PASSED (0 failure(s), rolled back)%', v_out;
  END IF;
  RAISE EXCEPTION 'PROOF FAILED (% failure(s), rolled back)%', v_fail, v_out;
END
$proof$;
