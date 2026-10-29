-- FAMILY F's PIECE RULES, THE PROOF (supabase/migrations/20261030010001_social_daily_poster.sql), on TEST. One
-- transaction that ends by RAISING its verdict, so TEST is left as found.
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

  -- P1: two posters for one city on two days are both kept.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format, poster_day)
    VALUES (v_campaign, 'daily_poster', 'geelong', 'attendees', 'audience_growth', 'Tonight in Geelong', 'Open the night', 'Taps through its link', 'https://www.eventlinqs.com.au/events/x', 'feed', '2099-01-08'),
           (v_campaign, 'daily_poster', 'geelong', 'attendees', 'audience_growth', 'Tonight in Geelong', 'Open the night', 'Taps through its link', 'https://www.eventlinqs.com.au/events/y', 'feed', '2099-01-09');
    v_out := v_out || ' | P1 one city, two days, two posters: PASS';
  EXCEPTION WHEN others THEN v_out := v_out || ' | P1 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P2: a second poster for the same city and day is refused (a second press makes nothing).
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format, poster_day)
    VALUES (v_campaign, 'daily_poster', 'geelong', 'attendees', 'audience_growth', 'Tonight in Geelong', 'Open the night', 'Taps through its link', 'https://www.eventlinqs.com.au/events/z', 'feed', '2099-01-08');
    v_out := v_out || ' | P2 a second poster for one city and day kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN v_out := v_out || ' | P2 a second poster for one city and day refused: PASS';
    WHEN others THEN v_out := v_out || ' | P2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P3: a daily poster without its day is refused; P4: a day on any other kind is refused.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'daily_poster', 'ballarat', 'attendees', 'audience_growth', 'Tonight in Ballarat', 'Open the night', 'Taps through its link', 'https://www.eventlinqs.com.au/events/w', 'feed');
    v_out := v_out || ' | P3 a poster with no day kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P3 a poster with no day refused: PASS';
    WHEN others THEN v_out := v_out || ' | P3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format, poster_day)
    VALUES (v_campaign, 'week_ahead', 'ballarat', 'attendees', 'audience_growth', 'The week', 'Open the week', 'Visits', 'https://www.eventlinqs.com.au/city/ballarat', 'feed', '2099-01-08');
    v_out := v_out || ' | P4 a day on a week_ahead kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P4 a day on another kind refused: PASS';
    WHEN others THEN v_out := v_out || ' | P4 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P5: the older kinds keep their rule exactly: one of a kind per city and partner.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'week_ahead', 'geelong', 'attendees', 'audience_growth', 'The week', 'Open the week', 'Visits', 'https://www.eventlinqs.com.au/city/geelong', 'feed');
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_campaign, 'week_ahead', 'geelong', 'attendees', 'audience_growth', 'The week', 'Open the week', 'Visits', 'https://www.eventlinqs.com.au/city/geelong', 'feed');
    v_out := v_out || ' | P5 two week_ahead pieces for one city kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN v_out := v_out || ' | P5 the older kinds still once per city: PASS';
    WHEN others THEN v_out := v_out || ' | P5 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P6: a daily poster may hold its own share link; the other kinds still may not (but the partner kit).
  BEGIN
    IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'social_pieces_partner_link')) ~ 'daily_poster'
       AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'social_pieces_partner_link')) ~ 'partner_kit'
       AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'social_pieces_partner_link')) !~ 'week_ahead' THEN
      v_out := v_out || ' | P6 a share link on a partner kit or a daily poster only: PASS';
    ELSE v_out := v_out || ' | P6 the share link rule does not read as written: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | P6 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  IF v_fail = 0 THEN
    RAISE EXCEPTION 'PROOF PASSED (0 failure(s), rolled back)%', v_out;
  END IF;
  RAISE EXCEPTION 'PROOF FAILED (% failure(s), rolled back)%', v_fail, v_out;
END
$proof$;
