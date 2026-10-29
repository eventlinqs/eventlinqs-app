-- THE MEDIA-RIGHTS RECORD AND THE PHOTOGRAPHY-LED RULE, PROVED ON TEST AND ROLLED BACK (20261028205501).
--
-- Run red, then green, through scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <file>:
--   red   = 20261028153001 (the organiser's yes, which TEST does not hold yet) + this proof
--   green = 20261028153001 + 20261028205501 + this proof
-- The block ends by raising its verdict, so the whole transaction rolls back and TEST is left as found.

DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_user uuid;
  v_host text;
  v_a1 uuid;
  v_a2 uuid;
  v_other uuid;
  v_asset uuid;
  v_lic uuid;
  v_yes uuid;
  v_carried uuid;
  v_new uuid;
  v_camp uuid;
  v_piece uuid;
  v_brand uuid;
  v_appr uuid;
  v_ok boolean;
  v_n int;
  v_photo text := 'https://proof.eventlinqs.test/w3/organiser-own.jpg';
  v_whole_cols text := 'original_file, received_on, permitted_uses';
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  -- A host with two nights, and a night of another host.
  SELECT venue_name INTO v_host FROM public.events WHERE venue_name IS NOT NULL GROUP BY venue_name HAVING count(*) >= 2 ORDER BY venue_name LIMIT 1;
  SELECT id INTO v_a1 FROM public.events WHERE venue_name = v_host ORDER BY start_date, id LIMIT 1;
  SELECT id INTO v_a2 FROM public.events WHERE venue_name = v_host AND id <> v_a1 ORDER BY start_date, id LIMIT 1;
  SELECT id INTO v_other FROM public.events WHERE venue_name IS NOT NULL AND lower(btrim(venue_name)) <> lower(btrim(v_host)) ORDER BY start_date, id LIMIT 1;
  v_out := format(' | host %s, nights %s and %s, another %s', v_host, v_a1, v_a2, v_other);

  -- M1: someone else's photograph without the original, the day it came and its uses is refused.
  BEGIN
    INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope)
    VALUES ('organiser_authorised', 'photo', v_a1, 'https://proof.eventlinqs.test/w3/no-record.jpg', 'mailto:host@proof.eventlinqs.test', 'The host', 'Yes, you are welcome to use it for this night.', 'The host', 'social');
    v_out := v_out || ' | M1 a photograph with no record was taken: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | M1 a photograph with no record is refused: PASS';
  END;

  -- M2: the organiser's own photograph, whole and approved, is usable on its night only, never on another or a brand piece.
  BEGIN
    EXECUTE format('INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope, %s)
                    VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L) RETURNING id', v_whole_cols,
                   'organiser_authorised', 'photo', v_a1, v_photo, 'mailto:host@proof.eventlinqs.test', 'The host',
                   'Yes, you are welcome to use it for this night.', 'The host', 'social', 'IMG_2041.jpg', '2026-10-21', 'Listing and social promotion of this night')
      INTO v_asset;
    UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_user, approved_at = now() WHERE id = v_asset;
    IF public.social_asset_usable(v_photo, v_a1, now()) AND NOT public.social_asset_usable(v_photo, v_other, now())
       AND NOT public.social_asset_usable(v_photo, NULL, now()) AND NOT public.social_asset_usable(v_photo, v_a2, now()) THEN
      v_out := v_out || ' | M2 its own night only: PASS';
    ELSE
      v_out := v_out || ' | M2 usable beyond its own night: FAIL'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M3: a separately licensed photograph is usable on a piece naming no night, never on a named night.
  BEGIN
    EXECUTE format('INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope, %s)
                    VALUES (%L, %L, NULL, %L, %L, %L, %L, %L, %L, %L, %L, %L) RETURNING id', v_whole_cols,
                   'separately_licensed', 'photo', 'https://proof.eventlinqs.test/w3/licensed.jpg', 'https://proof.eventlinqs.test/w3/licence', 'A photographer',
                   'Licensed to EventLinqs for its own social promotion, no event named.', 'A photographer', 'social', 'crowd.png', '2026-10-28', 'EventLinqs brand posts naming no event')
      INTO v_lic;
    UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_user, approved_at = now() WHERE id = v_lic;
    IF public.social_asset_usable('https://proof.eventlinqs.test/w3/licensed.jpg', NULL, now())
       AND NOT public.social_asset_usable('https://proof.eventlinqs.test/w3/licensed.jpg', v_a1, now()) THEN
      v_out := v_out || ' | M3 a licensed photograph on brand pieces only: PASS';
    ELSE
      v_out := v_out || ' | M3 a licensed photograph reached a named night, or no piece: FAIL'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M4: a yes for current and future events carries the host's photograph to their next night with no re-ask, made
  -- whole from the yes; never to another host.
  BEGIN
    v_yes := public.social_log_organiser_yes(v_host, now() - interval '1 day', 'Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.',
                                             'current_and_future', 'email', NULL, v_user);
    INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope)
    VALUES ('organiser_authorised', 'photo', v_a1, 'https://proof.eventlinqs.test/w3/carried.jpg', 'mailto:host@proof.eventlinqs.test', 'The host', 'The host', 'social')
    RETURNING id INTO v_carried;
    UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_user, approved_at = now() WHERE id = v_carried;
    SELECT count(*) INTO v_n FROM public.social_assets WHERE id = v_carried AND original_file IS NOT NULL AND received_on IS NOT NULL AND permitted_uses ~* 'future';
    IF v_n = 1 AND public.social_asset_usable('https://proof.eventlinqs.test/w3/carried.jpg', v_a2, now())
       AND NOT public.social_asset_usable('https://proof.eventlinqs.test/w3/carried.jpg', v_other, now()) THEN
      v_out := v_out || ' | M4 the yes carries to the next night, made whole from the yes: PASS';
    ELSE
      v_out := v_out || format(' | M4 not carried, or carried too far (whole %s): FAIL', v_n); v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M4 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M5: social_usable_images gives a night its own photograph before a carried one.
  BEGIN
    SELECT asset_id INTO v_new FROM public.social_usable_images(ARRAY[v_a1], now());
    IF v_new IN (v_asset, v_carried) AND (SELECT event_id FROM public.social_assets WHERE id = v_new) = v_a1 THEN
      v_out := v_out || ' | M5 the night''s own first: PASS';
    ELSE
      v_out := v_out || ' | M5 the wrong image first: FAIL'; v_fail := v_fail + 1;
    END IF;
    SELECT count(*) INTO v_n FROM public.social_usable_images(ARRAY[v_other], now());
    IF v_n <> 0 THEN v_out := v_out || ' | M5b another host received an image: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M5 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M6, M7, M8: a slide carrying the photograph is approved; the owner withdraws it; the approved piece cannot post.
  BEGIN
    INSERT INTO public.social_campaigns (week_start) VALUES (date_trunc('week', date '2099-01-07')::date) RETURNING id INTO v_camp;
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_camp, 'week_ahead', 'proof-city', 'attendees', 'audience_growth', 'Proof purpose', 'Proof next step', 'Proof outcome', 'https://www.eventlinqs.com.au/events', 'feed')
    RETURNING id INTO v_piece;
    INSERT INTO public.social_piece_revisions (piece_id, version, event_ids, picks, mode, slides, caption, versions, made_by)
    VALUES (v_piece, 1, ARRAY[v_a1], '[]'::jsonb, 'photo_led',
            jsonb_build_array(jsonb_build_object('t', 'night', 'eventId', v_a1, 'photo', v_photo)),
            'Proof caption', '{"instagram": {}, "facebook": {}}'::jsonb, 'planner');
    INSERT INTO public.social_piece_approvals (piece_id, revision, approved_by, approved_at) VALUES (v_piece, 1, v_user, now() - interval '10 minutes') RETURNING id INTO v_appr;
    UPDATE public.social_assets SET withdrawal_status = 'withdrawn', withdrawal_reason = 'The organiser asked us to stop using it.' WHERE id = v_asset;
    IF public.social_asset_usable(v_photo, v_a1, now()) OR (SELECT withdrawn_at FROM public.social_assets WHERE id = v_asset) IS NULL THEN
      v_out := v_out || ' | M6 a withdrawn photograph is still usable, or undated: FAIL'; v_fail := v_fail + 1;
    ELSE
      v_out := v_out || ' | M6 withdrawn is never usable, and dated: PASS';
    END IF;
    BEGIN
      UPDATE public.social_assets SET withdrawal_status = 'current', withdrawal_reason = NULL, withdrawn_at = NULL WHERE id = v_asset;
      v_out := v_out || ' | M7 a withdrawal was undone: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | M7 a withdrawal is final: PASS';
    END;
    BEGIN
      INSERT INTO public.social_piece_postings (piece_id, approval_id, post_url, posted_at, recorded_by)
      VALUES (v_piece, v_appr, 'https://www.instagram.com/p/proof', now(), v_user);
      v_out := v_out || ' | M8 an approved piece posted a withdrawn photograph: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | M8 the posting re-checks every image and refuses: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M6 to M8 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M9: a replacement is a current asset of the same night; the replaced one is never usable again.
  BEGIN
    BEGIN
      UPDATE public.social_assets SET withdrawal_status = 'replaced', withdrawal_reason = 'A better one came.', replaced_by = v_lic WHERE id = v_carried;
      v_out := v_out || ' | M9 replaced by another night''s asset: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | M9 a replacement of another night refused: PASS';
    END;
    EXECUTE format('INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope, %s)
                    VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L) RETURNING id', v_whole_cols,
                   'organiser_authorised', 'photo', v_a1, 'https://proof.eventlinqs.test/w3/better.jpg', 'mailto:host@proof.eventlinqs.test', 'The host',
                   'Yes, use this one instead for this night.', 'The host', 'social', 'IMG_2050.jpg', '2026-10-27', 'Listing and social promotion of this night')
      INTO v_new;
    UPDATE public.social_assets SET withdrawal_status = 'replaced', withdrawal_reason = 'A better one came.', replaced_by = v_new WHERE id = v_carried;
    IF public.social_asset_usable('https://proof.eventlinqs.test/w3/carried.jpg', v_a1, now()) THEN
      v_out := v_out || ' | M9b a replaced photograph is still usable: FAIL'; v_fail := v_fail + 1;
    ELSE
      v_out := v_out || ' | M9b replaced is never usable: PASS';
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M9 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M10: the approval refuses a licensed photograph on a named night.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_camp, 'weekend_carousel', 'proof-city', 'attendees', 'audience_growth', 'Proof purpose', 'Proof next step', 'Proof outcome', 'https://www.eventlinqs.com.au/events', 'feed')
    RETURNING id INTO v_piece;
    INSERT INTO public.social_piece_revisions (piece_id, version, event_ids, picks, mode, slides, caption, versions, made_by)
    VALUES (v_piece, 1, ARRAY[v_a1], '[]'::jsonb, 'photo_led',
            jsonb_build_array(jsonb_build_object('t', 'night', 'eventId', v_a1, 'photo', 'https://proof.eventlinqs.test/w3/licensed.jpg')),
            'Proof caption', '{"instagram": {}, "facebook": {}}'::jsonb, 'planner');
    BEGIN
      INSERT INTO public.social_piece_approvals (piece_id, revision, approved_by) VALUES (v_piece, 1, v_user);
      v_out := v_out || ' | M10 a licensed photograph was approved on a named night: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | M10 a licensed photograph on a named night refused at approval: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M10 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M11: a brand piece names no night.
  BEGIN
    INSERT INTO public.social_pieces (campaign_id, kind, city, audience, objective, purpose, next_step, outcome, link, format)
    VALUES (v_camp, 'brand_campaign', 'victoria', 'attendees', 'audience_growth', 'Proof purpose', 'Proof next step', 'Proof outcome', 'https://www.eventlinqs.com.au/events', 'feed')
    RETURNING id INTO v_brand;
    INSERT INTO public.social_piece_revisions (piece_id, version, event_ids, picks, mode, slides, caption, versions, made_by)
    VALUES (v_brand, 1, '{}', '[]'::jsonb, 'photo_led',
            jsonb_build_array(jsonb_build_object('t', 'brand', 'photo', 'https://proof.eventlinqs.test/w3/licensed.jpg')),
            'Say yes to this weekend.', '{"instagram": {}, "facebook": {}}'::jsonb, 'planner');
    INSERT INTO public.social_piece_approvals (piece_id, revision, approved_by) VALUES (v_brand, 1, v_user);
    BEGIN
      INSERT INTO public.social_piece_revisions (piece_id, version, event_ids, picks, mode, slides, caption, versions, made_by)
      VALUES (v_brand, 2, ARRAY[v_a1], '[]'::jsonb, 'graphic_led', jsonb_build_array(jsonb_build_object('t', 'brand')), 'x', '{"instagram": {}, "facebook": {}}'::jsonb, 'edit');
      v_out := v_out || ' | M11 a brand piece named a night: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | M11 a brand piece with a licensed photograph approved, naming a night refused: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M11 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M12: the sweep's own decision is written by no person, and only the sweep's is.
  BEGIN
    INSERT INTO public.social_piece_revisions (piece_id, version, event_ids, picks, mode, slides, caption, versions, made_by)
    VALUES (v_piece, 2, ARRAY[v_a1], '[]'::jsonb, 'type_led', jsonb_build_array(jsonb_build_object('t', 'night', 'eventId', v_a1, 'photo', NULL)), 'Proof caption', '{"instagram": {}, "facebook": {}}'::jsonb, 'sweep');
    INSERT INTO public.social_piece_decisions (piece_id, revision, decision, reason, decided_by) VALUES (v_piece, 2, 'image_withdrawn', 'The sweep: proof', NULL);
    BEGIN
      INSERT INTO public.social_piece_decisions (piece_id, revision, decision, reason, decided_by) VALUES (v_piece, 2, 'rejected', 'No person said this', NULL);
      v_out := v_out || ' | M12 a rejection with no person was kept: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | M12 the sweep writes its own decision, nobody else unnamed: PASS';
    END;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M12 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- M13: the service role updates an asset's approval and withdrawal only; the rule is staff only.
  BEGIN
    IF has_column_privilege('service_role', 'public.social_assets', 'withdrawal_status', 'UPDATE')
       AND NOT has_column_privilege('service_role', 'public.social_assets', 'permitted_uses', 'UPDATE')
       AND NOT has_column_privilege('service_role', 'public.social_assets', 'asset_url', 'UPDATE')
       AND NOT has_column_privilege('service_role', 'public.social_assets', 'original_file', 'UPDATE')
       AND NOT has_table_privilege('service_role', 'public.social_assets', 'DELETE')
       AND has_function_privilege('service_role', 'public.social_usable_images(uuid[], timestamptz)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.social_usable_images(uuid[], timestamptz)', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.social_brand_images(timestamptz)', 'EXECUTE') THEN
      v_out := v_out || ' | M13 grants as the rule needs: PASS';
    ELSE
      v_out := v_out || ' | M13 a grant is wider or narrower than the rule: FAIL'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | M13 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%', CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
