-- ITEM 11, THE SOCIAL ENGINE'S PROOF: every rule 20261027233001_social_engine.sql makes the database hold, tried as
-- the roles themselves on TEST (docs/SOCIAL-ENGINE.md).
--
-- Run it through scripts/verify/replay-under-new-default.mjs (Supabase's own opt-in to the new default, the tables made
-- again from the migration, then this), one transaction; it ends by RAISING its verdict, so TEST is left exactly as it
-- was found. The verdict reads PROOF PASSED or PROOF FAILED, line by line.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_user uuid;
  v_e1 uuid;
  v_e2 uuid;
  v_title text;
  v_l1 uuid;
  v_l2 uuid;
  v_c1 text := 'Bp' || substr(md5(clock_timestamp()::text), 1, 8);
  v_c2 text := 'Bq' || substr(md5(clock_timestamp()::text || 'x'), 1, 8);
  v_p1 uuid;
  v_p2 uuid;
  v_link1 text;
  v_link2 text;
  v_d1 uuid;
  v_d2 uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_n int;
  v_r public.social_cadence_rules;
  v_e3 uuid;
  v_l3 uuid;
  v_p3 uuid;
  v_d3 uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT e.id, e.title INTO v_e1, v_title FROM public.events e
   WHERE e.status = 'published' AND e.visibility = 'public' AND e.end_date > now() + interval '2 days'
     AND NOT public.social_event_sold_out(e.id)
   ORDER BY e.start_date LIMIT 1;
  SELECT e.id INTO v_e2 FROM public.events e
   WHERE e.status = 'published' AND e.visibility = 'public' AND e.end_date > now() + interval '2 days'
     AND NOT public.social_event_sold_out(e.id) AND e.id <> v_e1
   ORDER BY e.start_date LIMIT 1;
  IF v_user IS NULL OR v_e1 IS NULL OR v_e2 IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED (1 failure(s), rolled back): | no user or no two published, public, unsold events on this database';
  END IF;

  -- S1 the starting rules: feed 12 hours apart, stories 2, no learned hours.
  v_r := public.social_cadence_at('instagram', 'feed', now());
  IF v_r.gap_hours = 12 AND v_r.basis = 'starting' AND cardinality(v_r.slots) = 0 THEN v_out := v_out || ' | S1a feed starts 12 hours apart: PASS';
  ELSE v_out := v_out || ' | S1a feed start: FAIL (' || coalesce(v_r.gap_hours::text, 'none') || ')'; v_fail := v_fail + 1; END IF;
  v_r := public.social_cadence_at('instagram', 'story', now());
  IF v_r.gap_hours = 2 THEN v_out := v_out || ' | S1b stories start 2 hours apart: PASS';
  ELSE v_out := v_out || ' | S1b story start: FAIL'; v_fail := v_fail + 1; END IF;
  BEGIN
    INSERT INTO public.social_cadence_rules (platform, format, version, gap_hours, basis, learned_from, floor_posts, settle_hours, reason, set_at, set_by)
    VALUES ('instagram', 'feed', 1, 6, 'learned', 12, 12, 48, 'a feed rule closer than twelve hours apart', now(), 'proof');
    v_out := v_out || ' | S1c a feed gap under 12 hours is refused: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | S1c a feed gap under 12 hours is refused: PASS'; END;
  BEGIN
    INSERT INTO public.social_cadence_rules (platform, format, version, gap_hours, basis, learned_from, floor_posts, settle_hours, reason, set_at, set_by)
    VALUES ('instagram', 'feed', 1, 24, 'learned', 5, 12, 48, 'a rule learned from fewer posts than its floor', now(), 'proof');
    v_out := v_out || ' | S1d a rule on fewer posts than its floor is refused: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | S1d a rule on fewer posts than its floor is refused: PASS'; END;

  -- Two posts, each with its own share link.
  INSERT INTO public.share_links (event_id, channel, code, created_by) VALUES (v_e1, 'instagram', v_c1, v_user) RETURNING id INTO v_l1;
  INSERT INTO public.share_links (event_id, channel, code, created_by) VALUES (v_e2, 'instagram', v_c2, v_user) RETURNING id INTO v_l2;
  v_link1 := 'https://www.eventlinqs.com.au/e/' || v_c1;
  v_link2 := 'https://www.eventlinqs.com.au/e/' || v_c2;
  INSERT INTO public.social_posts (event_id, platform, format, share_link_id, link, facts, planned_by)
  VALUES (v_e1, 'instagram', 'feed', v_l1, v_link1, ARRAY[v_title, 'Friday 30 October', '8:00 pm', 'From $35.50'], v_user) RETURNING id INTO v_p1;
  INSERT INTO public.social_posts (event_id, platform, format, share_link_id, link, facts, planned_by)
  VALUES (v_e2, 'instagram', 'feed', v_l2, v_link2, ARRAY['Saturday 31 October'], v_user) RETURNING id INTO v_p2;
  BEGIN
    INSERT INTO public.social_posts (event_id, platform, format, share_link_id, link, facts) VALUES (v_e1, 'instagram', 'feed', v_l2, v_link2, ARRAY['x']);
    v_out := v_out || ' | P1 one post per event, network and format: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN v_out := v_out || ' | P1 one post per event, network and format: PASS'; END;

  -- W the words: numbered, carrying the link, stating only the listing's own numbers, no long dash, no exclamation.
  INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p1, 1, 'Friday 30 October, 8:00 pm. From $35.50. ' || v_link1, 'kit') RETURNING id INTO v_d1;
  v_out := v_out || ' | W1 the listing''s own numbers and the link are kept: PASS';
  BEGIN
    INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p1, 2, 'Only 12 left. ' || v_link1, 'kit');
    v_out := v_out || ' | W2 a number the listing does not hold is refused: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | W2 a number the listing does not hold is refused: PASS'; END;
  BEGIN
    INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p1, 2, 'Friday night at the bar.', 'kit');
    v_out := v_out || ' | W3 words without the post''s link are refused: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | W3 words without the post''s link are refused: PASS'; END;
  BEGIN
    INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p1, 2, 'Friday ' || chr(8212) || ' the bar. ' || v_link1, 'kit');
    v_out := v_out || ' | W4 a long dash is refused: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | W4 a long dash is refused: PASS'; END;
  BEGIN
    INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p1, 2, 'Friday at the bar! ' || v_link1, 'kit');
    v_out := v_out || ' | W5 an exclamation mark is refused: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | W5 an exclamation mark is refused: PASS'; END;
  BEGIN
    INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p1, 3, 'Friday 30 October. ' || v_link1, 'kit');
    v_out := v_out || ' | W6 a version out of turn is refused: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | W6 a version out of turn is refused: PASS'; END;
  BEGIN
    INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p1, 2, 'Friday 30 October. ' || v_link1, 'person');
    v_out := v_out || ' | W7 a person''s words name the person: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | W7 a person''s words name the person: PASS'; END;
  INSERT INTO public.social_drafts (post_id, version, caption, written_by, written_by_user) VALUES (v_p1, 2, 'Friday 30 October at 8:00 pm. ' || v_link1, 'person', v_user) RETURNING id INTO v_d2;

  -- A the approval: of the newest only, for a public, live, unsold event, outside the gap.
  BEGIN
    INSERT INTO public.social_approvals (draft_id, approved_by) VALUES (v_d1, v_user);
    v_out := v_out || ' | A1 an older version is not approved: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | A1 an older version is not approved: PASS'; END;
  BEGIN
    UPDATE public.events SET visibility = 'unlisted' WHERE id = v_e1;
    BEGIN
      INSERT INTO public.social_approvals (draft_id, approved_by) VALUES (v_d2, v_user);
      v_out := v_out || ' | A2 an unlisted event is not posted: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | A2 an unlisted event is not posted: PASS'; END;
    RAISE EXCEPTION 'undo' USING ERRCODE = 'P0001';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  -- A3 sold out, on an EventLinqs-ticketed event (its active tiers), as a story so no gap stands in the way. TEST holds
  -- its ticketed events unlisted, so inside the undone block the event is made published and public first: the only
  -- reason left to refuse is that it sold out, and the refusal must say so.
  SELECT e.id INTO v_e3 FROM public.events e
   WHERE e.status <> 'cancelled' AND e.end_date > now() + interval '2 days'
     AND EXISTS (SELECT 1 FROM public.ticket_tiers t WHERE t.event_id = e.id AND t.is_active)
     AND NOT public.social_event_sold_out(e.id)
   ORDER BY e.start_date LIMIT 1;
  IF v_e3 IS NULL THEN
    v_out := v_out || ' | A3 a sold out event is not posted: FAIL (no ticketed event on this database to try it on)'; v_fail := v_fail + 1;
  ELSE
    INSERT INTO public.share_links (event_id, channel, code, created_by) VALUES (v_e3, 'instagram', v_c1 || 's', v_user) RETURNING id INTO v_l3;
    INSERT INTO public.social_posts (event_id, platform, format, share_link_id, link, facts, planned_by)
    VALUES (v_e3, 'instagram', 'story', v_l3, 'https://www.eventlinqs.com.au/e/' || v_c1 || 's', ARRAY['Sunday'], v_user) RETURNING id INTO v_p3;
    INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p3, 1, 'Sunday. https://www.eventlinqs.com.au/e/' || v_c1 || 's', 'kit') RETURNING id INTO v_d3;
    BEGIN
      UPDATE public.events SET status = 'published', visibility = 'public' WHERE id = v_e3;
      UPDATE public.ticket_tiers SET sold_count = total_capacity - reserved_count WHERE event_id = v_e3 AND is_active;
      IF public.social_event_sold_out(v_e3) THEN v_out := v_out || ' | A3a every place sold is sold out: PASS';
      ELSE v_out := v_out || ' | A3a every place sold is sold out: FAIL'; v_fail := v_fail + 1; END IF;
      BEGIN
        INSERT INTO public.social_approvals (draft_id, approved_by) VALUES (v_d3, v_user);
        v_out := v_out || ' | A3b a sold out event is not posted: FAIL'; v_fail := v_fail + 1;
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM LIKE '%sold out%' THEN v_out := v_out || ' | A3b a sold out event is not posted: PASS';
        ELSE v_out := v_out || ' | A3b refused for another reason: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1; END IF;
      END;
      RAISE EXCEPTION 'undo' USING ERRCODE = 'P0001';
    EXCEPTION WHEN raise_exception THEN NULL; END;
    IF NOT public.social_event_sold_out(v_e3) THEN v_out := v_out || ' | A3c with places left again it is not sold out: PASS';
    ELSE v_out := v_out || ' | A3c places left: FAIL'; v_fail := v_fail + 1; END IF;
  END IF;
  INSERT INTO public.social_approvals (draft_id, approved_by, approved_at) VALUES (v_d2, v_user, now() - interval '20 hours') RETURNING id INTO v_a1;
  v_out := v_out || ' | A4 the newest words of a public, live, unsold event are approved: PASS';

  -- G the gap: the second feed post waits 12 hours after the first.
  INSERT INTO public.social_drafts (post_id, version, caption, written_by) VALUES (v_p2, 1, 'Saturday 31 October. ' || v_link2, 'kit');
  BEGIN
    INSERT INTO public.social_approvals (draft_id, approved_by, approved_at)
    SELECT id, v_user, now() - interval '15 hours' FROM public.social_drafts WHERE post_id = v_p2;
    v_out := v_out || ' | G1 a feed post inside 12 hours of the last waits: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%waits until%' THEN v_out := v_out || ' | G1 a feed post inside 12 hours of the last waits: PASS';
    ELSE v_out := v_out || ' | G1 refused for another reason: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1; END IF;
  END;

  -- R the post as it went.
  BEGIN
    INSERT INTO public.social_postings (post_id, approval_id, post_url, posted_at, recorded_by) VALUES (v_p1, v_a1, 'http://www.instagram.com/p/bp', now() - interval '19 hours', v_user);
    v_out := v_out || ' | R1 only an https Instagram or Facebook address: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | R1 only an https Instagram or Facebook address: PASS'; END;
  BEGIN
    INSERT INTO public.social_postings (post_id, approval_id, post_url, posted_at, recorded_by) VALUES (v_p2, v_a1, 'https://www.instagram.com/p/bp', now() - interval '19 hours', v_user);
    v_out := v_out || ' | R2 an approval of another post''s words: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | R2 an approval of another post''s words is refused: PASS'; END;
  BEGIN
    INSERT INTO public.social_postings (post_id, approval_id, post_url, posted_at, recorded_by) VALUES (v_p1, v_a1, 'https://www.instagram.com/p/bp', now() + interval '1 hour', v_user);
    v_out := v_out || ' | R3 a post recorded before it went: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | R3 a post recorded before it went is refused: PASS'; END;
  INSERT INTO public.social_postings (post_id, approval_id, post_url, posted_at, recorded_by) VALUES (v_p1, v_a1, 'https://www.instagram.com/p/bp' || v_c1, now() - interval '19 hours', v_user);
  v_out := v_out || ' | R4 the approved post is recorded with its address: PASS';
  BEGIN
    INSERT INTO public.social_approvals (draft_id, approved_by) VALUES (v_d2, v_user);
    v_out := v_out || ' | R5 a post that went is not approved again: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | R5 a post that went is not approved again: PASS'; END;
  -- After it went 19 hours ago, the next feed post may go now (12 hours on).
  INSERT INTO public.social_approvals (draft_id, approved_by) SELECT id, v_user FROM public.social_drafts WHERE post_id = v_p2 RETURNING id INTO v_a2;
  v_out := v_out || ' | G2 the next feed post goes once 12 hours have passed: PASS';

  -- K the grants: staff only through the service role, added to and never rewritten.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM count(*) FROM public.social_posts;
    v_out := v_out || ' | K1 a visitor reads no post: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | K1 a visitor reads no post: PASS'; END;
  BEGIN
    PERFORM public.social_event_sold_out(v_e1);
    v_out := v_out || ' | K2 a visitor cannot ask what is left: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | K2 a visitor cannot ask what is left: PASS'; END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.social_approvals (draft_id, approved_by) VALUES (v_d2, v_user);
    v_out := v_out || ' | K3 a signed in user approves nothing: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | K3 a signed in user approves nothing: PASS'; END;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_n FROM public.social_drafts WHERE post_id = v_p1;
  IF v_n = 2 THEN v_out := v_out || ' | K4 the service role reads the versions: PASS';
  ELSE v_out := v_out || ' | K4 the service role reads ' || v_n || ' versions: FAIL'; v_fail := v_fail + 1; END IF;
  BEGIN
    UPDATE public.social_drafts SET caption = caption WHERE post_id = v_p1;
    v_out := v_out || ' | K5 a kept version is never rewritten: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | K5 a kept version is never rewritten: PASS'; END;
  BEGIN
    DELETE FROM public.social_postings WHERE post_id = v_p1;
    v_out := v_out || ' | K6 a recorded post is never deleted: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | K6 a recorded post is never deleted: PASS'; END;
  RESET ROLE;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
