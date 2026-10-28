-- APPROVED PIECES SCHEDULE THEMSELVES; PUBLISHING WAITS FOR META (20261028210501), PROVED ON TEST AND ROLLED BACK.
--   red   = 20261028153001 + 20261028205501 + this proof
--   green = 20261028153001 + 20261028205501 + 20261028210501 + this proof
-- through scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <file>. The block raises its
-- verdict, so the whole transaction rolls back and TEST is left as found.

DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_user uuid;
  v_night uuid;
  v_camp uuid;
  v_piece uuid;
  v_appr uuid;
  v_sched uuid;
  v_asset uuid;
  v_photo text := 'https://proof.eventlinqs.test/w3/sched-own.jpg';
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_night FROM public.events WHERE venue_name IS NOT NULL ORDER BY start_date, id LIMIT 1;
  INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope, original_file, received_on, permitted_uses)
  VALUES ('organiser_authorised', 'photo', v_night, v_photo, 'mailto:host@proof.eventlinqs.test', 'The host', 'Yes, you are welcome to use it for this night.', 'The host', 'social', 'IMG_1.jpg', '2026-10-21', 'Social promotion of this night')
  RETURNING id INTO v_asset;
  UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_user, approved_at = now() WHERE id = v_asset;
  INSERT INTO public.social_campaigns (week_start) VALUES (date_trunc('week', date '2099-02-04')::date) RETURNING id INTO v_camp;
  INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
  VALUES (v_camp, 'week_ahead', 'proof-city', 'attendees', 'audience_growth', 'Proof purpose', 'Proof next step', 'Proof outcome', 'https://www.eventlinqs.com.au/events', 'feed')
  RETURNING id INTO v_piece;
  INSERT INTO public.social_piece_revisions (piece_id, version, event_ids, picks, mode, slides, caption, versions, made_by)
  VALUES (v_piece, 1, ARRAY[v_night], '[]'::jsonb, 'photo_led', jsonb_build_array(jsonb_build_object('t', 'night', 'eventId', v_night, 'photo', v_photo)), 'Proof', '{"instagram": {}, "facebook": {}}'::jsonb, 'planner');
  INSERT INTO public.social_piece_approvals (piece_id, revision, approved_by, approved_at) VALUES (v_piece, 1, v_user, now() - interval '2 hours') RETURNING id INTO v_appr;

  -- P1: the switch exists and starts OFF.
  IF coalesce((SELECT enabled FROM public.feature_flags WHERE flag = 'social_auto_publish'), true) THEN
    v_out := v_out || ' | P1 the publishing switch is missing or on: FAIL'; v_fail := v_fail + 1;
  ELSE
    v_out := v_out || ' | P1 the publishing switch starts off: PASS';
  END IF;

  -- P2: a schedule before its approval is refused; at or after it is kept.
  BEGIN
    BEGIN
      INSERT INTO public.social_piece_schedules (piece_id, approval_id, platform, go_at) VALUES (v_piece, v_appr, 'instagram', now() - interval '3 hours');
      v_out := v_out || ' | P2 scheduled before its approval: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P2 never before its approval: PASS';
    END;
    INSERT INTO public.social_piece_schedules (piece_id, approval_id, platform, go_at) VALUES (v_piece, v_appr, 'instagram', now() - interval '1 hour') RETURNING id INTO v_sched;
  EXCEPTION WHEN others THEN v_out := v_out || ' | P2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P3: with the switch off, nothing is published.
  BEGIN
    UPDATE public.social_piece_schedules SET state = 'published', published_ref = 'https://www.instagram.com/p/proof1', published_at = now() WHERE id = v_sched;
    v_out := v_out || ' | P3 published with the switch off: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P3 switched off, nothing publishes: PASS';
            WHEN others THEN v_out := v_out || ' | P3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P4: switched on (inside this rolled back proof only), a withdrawn image stops it.
  BEGIN
    UPDATE public.feature_flags SET enabled = true WHERE flag = 'social_auto_publish';
    UPDATE public.social_assets SET withdrawal_status = 'withdrawn', withdrawal_reason = 'The organiser asked us to stop.' WHERE id = v_asset;
    BEGIN
      UPDATE public.social_piece_schedules SET state = 'published', published_ref = 'https://www.instagram.com/p/proof2', published_at = now() WHERE id = v_sched;
      v_out := v_out || ' | P4 published a withdrawn image: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P4 a withdrawn image stops publishing: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | P4 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P5: a changed piece stops it; a schedule for an old approval is refused.
  BEGIN
    INSERT INTO public.social_piece_revisions (piece_id, version, event_ids, picks, mode, slides, caption, versions, made_by)
    VALUES (v_piece, 2, ARRAY[v_night], '[]'::jsonb, 'type_led', jsonb_build_array(jsonb_build_object('t', 'night', 'eventId', v_night, 'photo', NULL)), 'Proof', '{"instagram": {}, "facebook": {}}'::jsonb, 'sweep');
    BEGIN
      INSERT INTO public.social_piece_schedules (piece_id, approval_id, platform, go_at) VALUES (v_piece, v_appr, 'facebook', now());
      v_out := v_out || ' | P5 scheduled an old approval: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P5 an old approval is never scheduled: PASS';
    END;
    BEGIN
      UPDATE public.social_piece_schedules SET state = 'published', published_ref = 'https://www.instagram.com/p/proof3', published_at = now() WHERE id = v_sched;
      v_out := v_out || ' | P5b published a changed piece: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P5b a changed piece never publishes on its old approval: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | P5 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P6: approved again and switched on, it publishes once, and then stays as it went.
  BEGIN
    INSERT INTO public.social_piece_approvals (piece_id, revision, approved_by, approved_at) VALUES (v_piece, 2, v_user, now() - interval '30 minutes') RETURNING id INTO v_appr;
    INSERT INTO public.social_piece_schedules (piece_id, approval_id, platform, go_at) VALUES (v_piece, v_appr, 'instagram', now() - interval '10 minutes') RETURNING id INTO v_sched;
    UPDATE public.social_piece_schedules SET state = 'published', published_ref = 'https://www.instagram.com/p/proof4', published_at = now() WHERE id = v_sched;
    BEGIN
      UPDATE public.social_piece_schedules SET published_ref = 'https://www.instagram.com/p/other' WHERE id = v_sched;
      v_out := v_out || ' | P6 a published schedule was changed: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | P6 publishes once when approved, switched on and whole, then stays: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | P6 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- P7: staff only; the moment and the approval are never rewritten.
  BEGIN
    IF has_table_privilege('anon', 'public.social_piece_schedules', 'SELECT') OR has_table_privilege('authenticated', 'public.social_piece_schedules', 'SELECT')
       OR has_column_privilege('service_role', 'public.social_piece_schedules', 'go_at', 'UPDATE')
       OR has_column_privilege('service_role', 'public.social_piece_schedules', 'approval_id', 'UPDATE')
       OR has_table_privilege('service_role', 'public.social_piece_schedules', 'DELETE')
       OR NOT has_column_privilege('service_role', 'public.social_piece_schedules', 'state', 'UPDATE') THEN
      v_out := v_out || ' | P7 a grant is wider or narrower than the rule: FAIL'; v_fail := v_fail + 1;
    ELSE
      v_out := v_out || ' | P7 staff only, the moment never rewritten: PASS';
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | P7 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%', CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
