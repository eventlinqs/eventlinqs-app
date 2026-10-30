-- D5's EDITION PIECES, THE PROOF (supabase/migrations/20261030180401_social_editions.sql), on TEST. One transaction
-- that ends by RAISING its verdict, so TEST is left as found.
--   RED:   this file alone (the migration not there).
--   GREEN: the migration and this file joined:
--          scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <the two, joined>
DO $proof$
DECLARE
  v_user uuid;
  v_campaign uuid;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT u.id INTO v_user FROM auth.users u ORDER BY u.created_at LIMIT 1;
  INSERT INTO public.social_campaigns (week_start, planned_by) VALUES ('2099-01-05', v_user) RETURNING id INTO v_campaign;

  -- E1: a Tonight and Tomorrow and a Category Spotlight for one city are both kept.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'tonight_tomorrow', 'geelong', 'attendees', 'audience_growth', 'Pick a night out Friday and Saturday in Geelong', 'Open the city', 'Visits through its link', 'https://www.eventlinqs.com.au/city/geelong', 'feed'),
           (v_campaign, 'category_spotlight', 'geelong', 'attendees', 'audience_growth', 'Show the music on in Geelong', 'Open the view', 'Visits through its link', 'https://www.eventlinqs.com.au/events?city=geelong&category=music', 'feed');
    v_out := v_out || ' | E1 both editions kept for one city: PASS';
  EXCEPTION WHEN others THEN v_out := v_out || ' | E1 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- E2: a second edition of one kind for one city is refused (a second press of Plan this week makes nothing).
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'tonight_tomorrow', 'geelong', 'attendees', 'audience_growth', 'Again', 'Open the city', 'Visits', 'https://www.eventlinqs.com.au/city/geelong', 'feed');
    v_out := v_out || ' | E2 a second Tonight and Tomorrow for one city kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN v_out := v_out || ' | E2 a second edition of one kind for one city refused: PASS';
    WHEN others THEN v_out := v_out || ' | E2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- E3: a kind nobody named is still refused.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'midweek_teaser', 'geelong', 'attendees', 'audience_growth', 'No such kind', 'Open', 'Visits', 'https://www.eventlinqs.com.au/city/geelong', 'feed');
    v_out := v_out || ' | E3 an unnamed kind kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | E3 an unnamed kind refused: PASS';
    WHEN others THEN v_out := v_out || ' | E3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- E4: an edition carries no share link of its own (only a partner kit and a daily poster may).
  BEGIN
    IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'social_pieces_partner_link')) !~ 'tonight_tomorrow'
       AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'social_pieces_partner_link')) !~ 'category_spotlight' THEN
      v_out := v_out || ' | E4 no share link on an edition: PASS';
    ELSE v_out := v_out || ' | E4 an edition may carry a share link: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | E4 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- E5: every older kind is still accepted, the daily poster with its day.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'week_ahead', 'melbourne', 'attendees', 'audience_growth', 'The week', 'Open the week', 'Visits', 'https://www.eventlinqs.com.au/city/melbourne', 'feed'),
           (v_campaign, 'weekend_carousel', 'melbourne', 'attendees', 'audience_growth', 'The weekend', 'Open the week', 'Visits', 'https://www.eventlinqs.com.au/city/melbourne', 'feed'),
           (v_campaign, 'venue_spotlight', 'melbourne', 'attendees', 'audience_growth', 'A venue', 'Open the city', 'Visits', 'https://www.eventlinqs.com.au/city/melbourne', 'feed');
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format, poster_day)
    VALUES (v_campaign, 'daily_poster', 'melbourne', 'attendees', 'audience_growth', 'A night', 'Open the night', 'Visits', 'https://www.eventlinqs.com.au/events/x', 'feed', '2099-01-08');
    v_out := v_out || ' | E5 the older kinds still accepted: PASS';
  EXCEPTION WHEN others THEN v_out := v_out || ' | E5 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  IF v_fail = 0 THEN
    RAISE EXCEPTION 'PROOF PASSED (0 failure(s), rolled back)%', v_out;
  END IF;
  RAISE EXCEPTION 'PROOF FAILED (% failure(s), rolled back)%', v_fail, v_out;
END
$proof$;
