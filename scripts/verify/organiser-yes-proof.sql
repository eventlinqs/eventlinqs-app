-- THE ORGANISER'S YES PROOF (supabase/migrations/20261028153001_organiser_permissions.sql), on TEST, which already holds
-- the asset register (20261028141001). One transaction that ends by RAISING its verdict, so TEST is left as found.
--   RED:   this file alone (the migration not there): the checks fail.
--   GREEN: the migration followed by this file, in one transaction:
--          scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <migration + this file, joined>
-- Every check runs in its own block, so a missing function is reported as that check failing, not as the end of the run.
DO $proof$
DECLARE
  v_line constant text := 'Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.';
  v_user uuid;
  v_host text;
  v_ev1 uuid;
  v_ev2 uuid;
  v_other_ev uuid;
  v_yes uuid;
  v_row record;
  v_ok boolean;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  -- A host with two nights, so "future events" can be shown on a second night.
  SELECT lower(btrim(venue_name)) INTO v_host FROM public.events WHERE venue_name IS NOT NULL
   GROUP BY lower(btrim(venue_name)) HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 1;
  SELECT id INTO v_ev1 FROM public.events WHERE lower(btrim(venue_name)) = v_host ORDER BY start_date, id LIMIT 1;
  SELECT id INTO v_ev2 FROM public.events WHERE lower(btrim(venue_name)) = v_host AND id <> v_ev1 ORDER BY start_date DESC, id LIMIT 1;
  SELECT id INTO v_other_ev FROM public.events WHERE venue_name IS NOT NULL AND lower(btrim(venue_name)) <> v_host LIMIT 1;
  IF v_user IS NULL OR v_ev1 IS NULL OR v_ev2 IS NULL OR v_other_ev IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: TEST lacks a user, a host with two nights or a second host';
  END IF;
  IF to_regclass('public.social_assets') IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: the asset register (20261028141001) is not on this database';
  END IF;
  v_out := v_out || format(' | host %s, nights %s and %s', v_host, v_ev1, v_ev2);

  -- Before any yes: the organiser's own post, kept as a native share and approved for sharing; and an EventLinqs design.
  INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope, approval_status, approved_by, approved_at)
  VALUES ('native_share', 'post', v_ev1, 'https://proof.eventlinqs.test/w6/their-post.jpg', 'https://proof.eventlinqs.test/w6/their-post', v_host, 'Their own post', 'social', 'approved', v_user, now());
  INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope)
  VALUES ('original_design', 'artwork', v_ev1, 'https://proof.eventlinqs.test/w6/our-design.png', 'https://proof.eventlinqs.test/w6/our-design', 'EventLinqs', 'EventLinqs design', 'social');

  -- Y1: an organiser poster recorded as organiser authorised with no yes and no evidence is refused.
  BEGIN
    INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope)
    VALUES ('organiser_authorised', 'photo', v_ev2, 'https://proof.eventlinqs.test/w6/before-yes.jpg', 'https://proof.eventlinqs.test/w6/before-yes', v_host, 'Poster by the organiser', 'social');
    v_out := v_out || ' | Y1 organiser authorised with no yes kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | Y1 organiser authorised with no yes refused: PASS';
  END;

  -- Y2: "current and future" is refused when the organiser's words do not say future.
  BEGIN
    PERFORM public.social_log_organiser_yes(v_host, now() - interval '1 hour', 'Yes, go ahead and use our posters.', 'current_and_future', 'email', NULL, v_user);
    v_out := v_out || ' | Y2 future scope without the word kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | Y2 future scope without the organiser saying so refused: PASS';
    WHEN others THEN v_out := v_out || ' | Y2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y3: a yes for a host with no night on EventLinqs is refused.
  BEGIN
    PERFORM public.social_log_organiser_yes('No Such Host W6 Proof', now() - interval '1 hour', v_line, 'current_and_future', 'email', NULL, v_user);
    v_out := v_out || ' | Y3 unknown host kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | Y3 a host with no night refused: PASS';
    WHEN others THEN v_out := v_out || ' | Y3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y4: a yes dated after it was logged is refused.
  BEGIN
    PERFORM public.social_log_organiser_yes(v_host, now() + interval '1 day', v_line, 'current_and_future', 'email', NULL, v_user);
    v_out := v_out || ' | Y4 future-dated yes kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | Y4 a yes dated ahead refused: PASS';
    WHEN others THEN v_out := v_out || ' | Y4 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y5: the yes is logged with its date, its exact wording and its scope.
  BEGIN
    v_yes := public.social_log_organiser_yes(v_host, timestamptz '2026-10-28 09:00+11', v_line, 'current_and_future', 'email', NULL, v_user);
    EXECUTE 'SELECT granted_at, wording, scope, channel, logged_by FROM public.organiser_permissions WHERE id = $1' INTO v_row USING v_yes;
    IF v_row.wording = v_line AND v_row.granted_at = timestamptz '2026-10-28 09:00+11' AND v_row.scope = 'current_and_future'
       AND v_row.channel = 'email' AND v_row.logged_by = v_user THEN
      v_out := v_out || ' | Y5 logged: date, exact wording, scope current and future, channel: PASS';
    ELSE
      v_out := v_out || ' | Y5 logged row differs: FAIL'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | Y5 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y6: their post turns organiser authorised, citing the yes, and waits for the founder's approval of the new use.
  BEGIN
    EXECUTE 'SELECT asset_state, permission_id, permission_evidence, approval_status FROM public.social_assets WHERE asset_url = $1' INTO v_row
      USING 'https://proof.eventlinqs.test/w6/their-post.jpg';
    IF v_row.asset_state = 'organiser_authorised' AND v_row.permission_id = v_yes AND position(v_line in v_row.permission_evidence) > 0
       AND v_row.approval_status = 'pending' THEN
      v_out := v_out || ' | Y6 their post now organiser authorised, citing the yes, pending approval: PASS';
    ELSE
      v_out := v_out || format(' | Y6 their post is %s, %s: FAIL', v_row.asset_state, v_row.approval_status); v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | Y6 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y7: EventLinqs' own design is left as it was.
  SELECT asset_state INTO v_row FROM public.social_assets WHERE asset_url = 'https://proof.eventlinqs.test/w6/our-design.png';
  IF v_row.asset_state = 'original_design' THEN v_out := v_out || ' | Y7 our own design untouched: PASS';
  ELSE v_out := v_out || ' | Y7 our design changed: FAIL'; v_fail := v_fail + 1; END IF;

  -- Y8: not usable until approved, usable once the founder approves (the register's own rule).
  BEGIN
    v_ok := public.social_asset_usable('https://proof.eventlinqs.test/w6/their-post.jpg', v_ev1, now());
    UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_user, approved_at = now()
     WHERE asset_url = 'https://proof.eventlinqs.test/w6/their-post.jpg';
    IF NOT v_ok AND public.social_asset_usable('https://proof.eventlinqs.test/w6/their-post.jpg', v_ev1, now()) THEN
      v_out := v_out || ' | Y8 unusable while pending, usable once approved: PASS';
    ELSE
      v_out := v_out || ' | Y8 usable before approval or not after: FAIL'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | Y8 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y9: a poster recorded later for another night of the same host takes the yes as its evidence.
  BEGIN
    INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope)
    VALUES ('organiser_authorised', 'photo', v_ev2, 'https://proof.eventlinqs.test/w6/later.jpg', 'https://proof.eventlinqs.test/w6/later', v_host, 'Poster by the organiser', 'social');
    EXECUTE 'SELECT permission_id, permission_evidence FROM public.social_assets WHERE asset_url = $1' INTO v_row USING 'https://proof.eventlinqs.test/w6/later.jpg';
    IF v_row.permission_id = v_yes AND position(v_line in v_row.permission_evidence) > 0 THEN
      v_out := v_out || ' | Y9 a later night of the host takes the yes: PASS';
    ELSE
      v_out := v_out || ' | Y9 later poster kept without citing the yes: FAIL'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | Y9 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y10: the yes covers that host only; another host's poster is still refused.
  BEGIN
    INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope)
    VALUES ('organiser_authorised', 'photo', v_other_ev, 'https://proof.eventlinqs.test/w6/other-host.jpg', 'https://proof.eventlinqs.test/w6/other-host', 'Another host', 'Poster', 'social');
    v_out := v_out || ' | Y10 another host borrowed the yes: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | Y10 another host still refused: PASS';
  END;

  -- Y11: "this event" covers that night only.
  BEGIN
    v_yes := public.social_log_organiser_yes((SELECT venue_name FROM public.events WHERE id = v_other_ev), now() - interval '1 hour',
                                             'Yes, use our poster for this one.', 'this_event', 'instagram', v_other_ev, v_user);
    INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope)
    VALUES ('organiser_authorised', 'photo', v_other_ev, 'https://proof.eventlinqs.test/w6/this-one.jpg', 'https://proof.eventlinqs.test/w6/this-one', 'Another host', 'Poster', 'social');
    v_out := v_out || ' | Y11 a this-event yes covers its night: PASS';
  EXCEPTION WHEN others THEN v_out := v_out || ' | Y11 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- Y12: the service role cannot write a yes or an asset's state directly; only the function does.
  BEGIN
    IF has_table_privilege('service_role', 'public.organiser_permissions', 'INSERT')
       OR has_column_privilege('service_role', 'public.social_assets', 'asset_state', 'UPDATE')
       OR NOT has_function_privilege('service_role', 'public.social_log_organiser_yes(text, timestamptz, text, text, text, uuid, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.social_log_organiser_yes(text, timestamptz, text, text, text, uuid, uuid, text)', 'EXECUTE') THEN
      v_out := v_out || ' | Y12 a direct write path is open: FAIL'; v_fail := v_fail + 1;
    ELSE
      v_out := v_out || ' | Y12 only the function writes a yes or turns a state: PASS';
    END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | Y12 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%', CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
