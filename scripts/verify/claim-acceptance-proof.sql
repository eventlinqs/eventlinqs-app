-- THE CLAIM AS ACCEPTANCE PROOF (supabase/migrations/20261028220201_claim_acceptance.sql), on TEST, which holds the
-- asset register (20261028141001). One transaction that ends by RAISING its verdict, so TEST is left as found.
--   RED:   153001 and 205501 (where TEST lacks them) followed by this file, the claim acceptance migration not there.
--   GREEN: the same with 220201 before this file, joined, in one transaction:
--          scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <the four, joined>
-- Every check runs in its own block, so a missing column or function is reported as that check failing.
DO $proof$
DECLARE
  v_line constant text := 'Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.';
  v_line_one constant text := 'Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts for this event.';
  v_bucket constant text := 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/organiser-media/';
  v_hash constant text := repeat('a', 64);
  v_user uuid;
  v_outsider uuid;
  v_org uuid;
  v_org_out uuid;
  v_venue uuid;
  v_host text;
  v_night1 uuid;
  v_night2 uuid;
  v_event uuid;
  v_claim uuid;
  v_yes uuid;
  v_asset uuid;
  v_new uuid;
  v_paths text[];
  v_answer text;
  v_json jsonb;
  v_row record;
  v_n int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_outsider FROM auth.users WHERE id <> v_user ORDER BY created_at LIMIT 1;
  -- A curated venue with two nights to come in its series, so "future events" is shown on the second.
  SELECT v.id, v.name INTO v_venue, v_host
    FROM public.venues v
    JOIN public.event_series s ON s.venue_id = v.id
    JOIN public.events e ON e.listing_series_id = s.id AND e.start_date >= now() AND lower(btrim(e.venue_name)) = lower(btrim(v.name))
   WHERE v.claimed_at IS NULL
   GROUP BY v.id, v.name HAVING count(*) >= 2 ORDER BY count(*) DESC, v.id LIMIT 1;
  SELECT e.id INTO v_night1 FROM public.events e JOIN public.event_series s ON s.id = e.listing_series_id
   WHERE s.venue_id = v_venue AND e.start_date >= now() ORDER BY e.start_date, e.id LIMIT 1;
  SELECT e.id INTO v_night2 FROM public.events e JOIN public.event_series s ON s.id = e.listing_series_id
   WHERE s.venue_id = v_venue AND e.start_date >= now() AND e.id <> v_night1 ORDER BY e.start_date DESC, e.id LIMIT 1;
  -- A night of another host, for a claim of one event.
  SELECT id INTO v_event FROM public.events
   WHERE venue_name IS NOT NULL AND lower(btrim(venue_name)) <> lower(btrim(v_host)) AND start_date >= now() ORDER BY start_date, id LIMIT 1;
  IF v_user IS NULL OR v_outsider IS NULL OR v_night1 IS NULL OR v_night2 IS NULL OR v_event IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: TEST lacks two users, a venue with two nights to come, or a second host';
  END IF;
  v_out := v_out || format(' | venue %s (%s), nights %s and %s, other night %s', v_host, v_venue, v_night1, v_night2, v_event);

  INSERT INTO public.organisations (name, slug, owner_id, status) VALUES (v_host, 'w2-proof-claimant-' || substr(md5(random()::text), 1, 8), v_user, 'active') RETURNING id INTO v_org;
  INSERT INTO public.organisation_members (organisation_id, user_id, role) VALUES (v_org, v_user, 'owner');
  INSERT INTO public.organisations (name, slug, owner_id, status) VALUES ('W2 Proof Outsider', 'w2-proof-outsider-' || substr(md5(random()::text), 1, 8), v_outsider, 'active') RETURNING id INTO v_org_out;
  INSERT INTO public.organisation_members (organisation_id, user_id, role) VALUES (v_org_out, v_outsider, 'owner');

  -- The host's own post, registered as a native share before any claim.
  INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, attribution_text, scope)
  VALUES ('native_share', 'post', v_night1, 'https://proof.eventlinqs.test/w2/their-post.jpg', 'https://proof.eventlinqs.test/w2/their-post', v_host, 'Their own post', 'social');

  -- A1: a tick with no authority is refused.
  BEGIN
    INSERT INTO public.listing_claims (venue_id, claimant_user_id, claimant_name, claimant_role, email_used, method, code_hash, expires_at,
                                       permission_words, permission_scope, permission_given_at, permission_authority)
    VALUES (v_venue, v_user, 'Proof', 'Manager', 'proof@eventlinqs.test', 'published_email', v_hash, now() + interval '15 minutes', v_line, 'current_and_future', now(), false);
    v_out := v_out || ' | A1 a yes without authority kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | A1 a yes without authority refused: PASS';
    WHEN others THEN v_out := v_out || ' | A1 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A2: a venue's yes for one event only is refused; a future scope in words that do not say so is refused.
  BEGIN
    INSERT INTO public.listing_claims (venue_id, claimant_user_id, claimant_name, claimant_role, email_used, method, code_hash, expires_at,
                                       permission_words, permission_scope, permission_given_at, permission_authority)
    VALUES (v_venue, v_user, 'Proof', 'Manager', 'proof@eventlinqs.test', 'published_email', v_hash, now() + interval '15 minutes', v_line_one, 'this_event', now(), true);
    v_out := v_out || ' | A2 a venue yes for one event kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    BEGIN
      INSERT INTO public.listing_claims (event_id, claimant_user_id, claimant_name, claimant_role, email_used, method, code_hash, expires_at,
                                         permission_words, permission_scope, permission_given_at, permission_authority)
      VALUES (v_event, v_user, 'Proof', 'Manager', 'proof@eventlinqs.test', 'published_email', v_hash, now() + interval '15 minutes', v_line_one, 'current_and_future', now(), true);
      v_out := v_out || ' | A2 future scope in one-night words kept: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | A2 a venue yes for one event, and future scope the words do not give, refused: PASS';
    END;
    WHEN others THEN v_out := v_out || ' | A2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A3: the venue claimed with the tick. A wrong code writes no yes; the right code moves the venue and writes exactly one.
  BEGIN
    INSERT INTO public.listing_claims (venue_id, claimant_user_id, claimant_name, claimant_role, email_used, method, code_hash, expires_at,
                                       permission_words, permission_scope, permission_given_at, permission_authority)
    VALUES (v_venue, v_user, 'Proof', 'Manager', 'proof@eventlinqs.test', 'published_email', v_hash, now() + interval '15 minutes', v_line, 'current_and_future', now() - interval '2 minutes', true)
    RETURNING id INTO v_claim;
    v_answer := public.listing_claim_check(v_claim, repeat('b', 64), v_org, now());
    EXECUTE 'SELECT count(*) FROM public.organiser_permissions WHERE claim_id = $1' INTO v_n USING v_claim;
    IF v_answer = 'wrong' AND v_n = 0 THEN v_out := v_out || ' | A3a a wrong code wrote no yes: PASS';
    ELSE v_out := v_out || format(' | A3a wrong code answered %s and wrote %s: FAIL', v_answer, v_n); v_fail := v_fail + 1; END IF;

    v_answer := public.listing_claim_check(v_claim, v_hash, v_org, now());
    EXECUTE 'SELECT id, host_name, wording, scope, channel, logged_by, organisation_id, event_id, withdrawn_at FROM public.organiser_permissions WHERE claim_id = $1' INTO v_row USING v_claim;
    v_yes := v_row.id;
    EXECUTE 'SELECT count(*) FROM public.organiser_permissions WHERE claim_id = $1' INTO v_n USING v_claim;
    IF v_answer = 'verified' AND v_n = 1 AND v_row.wording = v_line AND v_row.scope = 'current_and_future' AND v_row.channel = 'claim'
       AND v_row.logged_by = v_user AND v_row.organisation_id = v_org AND v_row.event_id IS NULL AND v_row.host_name = btrim(v_host)
       AND v_row.withdrawn_at IS NULL
       AND (SELECT organisation_id FROM public.events WHERE id = v_night2) = v_org THEN
      v_out := v_out || ' | A3b the right code moved the venue and wrote exactly one yes, as ticked, citing the claim: PASS';
    ELSE v_out := v_out || format(' | A3b answered %s, %s yes rows: FAIL', v_answer, v_n); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A4: the host's own post took the yes and waits for a person; the second night is covered with no re-ask.
  BEGIN
    SELECT asset_state, permission_id, approval_status INTO v_row FROM public.social_assets WHERE asset_url = 'https://proof.eventlinqs.test/w2/their-post.jpg';
    IF v_row.asset_state = 'organiser_authorised' AND v_row.permission_id = v_yes AND v_row.approval_status = 'pending'
       AND (public.organiser_permission_for(v_night2)).id = v_yes THEN
      v_out := v_out || ' | A4 their post now under the yes, pending; their next night covered with no re-ask: PASS';
    ELSE v_out := v_out || format(' | A4 post %s %s: FAIL', v_row.asset_state, v_row.approval_status); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A4 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A5: a claim with no tick still verifies, and writes no yes.
  BEGIN
    INSERT INTO public.listing_claims (event_id, claimant_user_id, claimant_name, claimant_role, email_used, method, code_hash, expires_at)
    VALUES (v_event, v_outsider, 'Proof', 'Owner', 'proof@eventlinqs.test', 'published_email', v_hash, now() + interval '15 minutes')
    RETURNING id INTO v_claim;
    v_answer := public.listing_claim_check(v_claim, v_hash, v_org_out, now());
    EXECUTE 'SELECT count(*) FROM public.organiser_permissions WHERE claim_id = $1' INTO v_n USING v_claim;
    IF v_answer = 'verified' AND v_n = 0 THEN v_out := v_out || ' | A5 a claim with no tick verified and wrote no yes: PASS';
    ELSE v_out := v_out || format(' | A5 answered %s, %s yes rows: FAIL', v_answer, v_n); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A5 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A6: an outsider cannot add an image to the claimed night; nor can anyone add one that is not in our bucket.
  BEGIN
    PERFORM public.organiser_media_add(v_outsider, v_night1, v_bucket || 'p/out.webp', 'out.jpg', 'photo', NULL, NULL);
    v_out := v_out || ' | A6 an outsider added an image: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    BEGIN
      PERFORM public.organiser_media_add(v_user, v_night1, 'https://elsewhere.example/a.jpg', 'a.jpg', 'photo', NULL, NULL);
      v_out := v_out || ' | A6 an outside address kept: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN v_out := v_out || ' | A6 an outsider, and an address not stored by EventLinqs, refused: PASS';
    END;
    WHEN others THEN v_out := v_out || ' | A6 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A7: the organiser adds an image: organiser authorised, pending, the yes as evidence, its media-rights fields kept;
  -- not usable until a person approves it, usable once they do.
  BEGIN
    v_asset := public.organiser_media_add(v_user, v_night2, v_bucket || 'p/one.webp', 'Night one.JPG', 'photo', NULL, 'No cropping of the band');
    SELECT * INTO v_row FROM public.social_assets WHERE id = v_asset;
    IF v_row.asset_state = 'organiser_authorised' AND v_row.approval_status = 'pending' AND v_row.permission_id = v_yes
       AND position(v_line in v_row.permission_evidence) > 0 AND v_row.original_file = 'Night one.JPG' AND v_row.received_on IS NOT NULL AND position('future events' in v_row.permitted_uses) > 0
       AND v_row.attribution_text = 'Photo: ' || v_host AND v_row.restrictions = 'No cropping of the band' AND v_row.withdrawal_status = 'current'
       AND NOT public.social_asset_usable(v_bucket || 'p/one.webp', v_night2, now()) THEN
      UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_user, approved_at = now() WHERE id = v_asset;
      IF public.social_asset_usable(v_bucket || 'p/one.webp', v_night2, now()) THEN
        v_out := v_out || ' | A7 added under the yes, pending, record kept, usable only once approved: PASS';
      ELSE v_out := v_out || ' | A7 approved image not usable: FAIL'; v_fail := v_fail + 1; END IF;
    ELSE v_out := v_out || format(' | A7 row %s %s %s: FAIL', v_row.asset_state, v_row.approval_status, v_row.original_file); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A7 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A8: replaced: the old image is marked replaced, links to the new one, and is not usable at once; the new one waits.
  BEGIN
    v_json := public.organiser_media_replace(v_user, v_asset, v_bucket || 'p/two.webp', 'Night two.jpg');
    v_new := (v_json ->> 'id')::uuid;
    SELECT withdrawal_status, replaced_by INTO v_row FROM public.social_assets WHERE id = v_asset;
    IF v_row.withdrawal_status = 'replaced' AND v_row.replaced_by = v_new AND v_json ->> 'old_path' = 'p/one.webp'
       AND NOT public.social_asset_usable(v_bucket || 'p/one.webp', v_night2, now())
       AND (SELECT approval_status FROM public.social_assets WHERE id = v_new) = 'pending' THEN
      v_out := v_out || ' | A8 replaced: old one out of use at once, new one pending: PASS';
    ELSE v_out := v_out || format(' | A8 old %s: FAIL', v_row.withdrawal_status); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A8 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A9: one image withdrawn: an outsider is refused; the organiser's withdrawal takes it out of use at once with the reason.
  BEGIN
    UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_user, approved_at = now() WHERE id = v_new;
    BEGIN
      PERFORM public.organiser_media_withdraw(v_outsider, v_new, 'Not theirs');
      v_out := v_out || ' | A9 an outsider withdrew an image: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    v_paths := public.organiser_media_withdraw(v_user, v_new, 'We would rather not use this one');
    SELECT withdrawal_status, withdrawal_reason INTO v_row FROM public.social_assets WHERE id = v_new;
    IF v_row.withdrawal_status = 'withdrawn' AND v_row.withdrawal_reason = 'We would rather not use this one' AND v_paths = array['p/two.webp']
       AND NOT public.social_asset_usable(v_bucket || 'p/two.webp', v_night2, now()) THEN
      v_out := v_out || ' | A9 outsider refused; withdrawn by the organiser, out of use at once, its file named for removal: PASS';
    ELSE v_out := v_out || format(' | A9 %s: FAIL', v_row.withdrawal_status); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A9 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A10: the yes withdrawn: an outsider is refused; every current image under it goes, the yes covers nothing, and no
  -- image can be added after it.
  BEGIN
    v_asset := public.organiser_media_add(v_user, v_night1, v_bucket || 'p/three.webp', 'three.jpg', 'artwork', 'Artwork: the host', NULL);
    BEGIN
      PERFORM public.organiser_permission_withdraw(v_outsider, v_yes, 'Not theirs');
      v_out := v_out || ' | A10 an outsider withdrew the yes: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    v_paths := public.organiser_permission_withdraw(v_user, v_yes, 'We are no longer working with EventLinqs');
    SELECT count(*) INTO v_n FROM public.social_assets WHERE permission_id = v_yes AND withdrawal_status = 'current';
    IF v_n = 0 AND 'p/three.webp' = ANY (v_paths) AND (public.organiser_permission_for(v_night2)).id IS NULL
       AND (SELECT withdrawal_status FROM public.social_assets WHERE asset_url = 'https://proof.eventlinqs.test/w2/their-post.jpg') = 'withdrawn' THEN
      BEGIN
        PERFORM public.organiser_media_add(v_user, v_night2, v_bucket || 'p/four.webp', 'four.jpg', 'photo', NULL, NULL);
        v_out := v_out || ' | A10 an image added after the yes was withdrawn: FAIL'; v_fail := v_fail + 1;
      EXCEPTION WHEN check_violation THEN
        v_out := v_out || ' | A10 outsider refused; the yes withdrawn takes every image under it, covers nothing, and refuses a new image: PASS';
      END;
    ELSE v_out := v_out || format(' | A10 %s still current: FAIL', v_n); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A10 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A12: the regular nights: an outsider cannot pause them; the organiser pauses a series and keeps it listing again.
  BEGIN
    SELECT s.id INTO v_new FROM public.event_series s WHERE s.venue_id = v_venue ORDER BY s.id LIMIT 1;
    BEGIN
      PERFORM public.organiser_series_keep(v_outsider, v_new, false);
      v_out := v_out || ' | A12 an outsider paused the nights: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    -- Each call is its own statement: a read in the same statement as the call sees the statement's starting snapshot.
    v_answer := public.organiser_series_keep(v_user, v_new, false);
    v_answer := v_answer || ',' || (SELECT status FROM public.event_series WHERE id = v_new);
    v_answer := v_answer || ',' || public.organiser_series_keep(v_user, v_new, true);
    v_answer := v_answer || ',' || (SELECT status FROM public.event_series WHERE id = v_new);
    IF v_answer = 'paused,paused,active,active' THEN
      v_out := v_out || ' | A12 outsider refused; the organiser pauses their nights and keeps them listing again: PASS';
    ELSE v_out := v_out || format(' | A12 answered %s: FAIL', v_answer); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A12 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- A11: nobody but the service role may call the claim's check or the four organiser functions.
  BEGIN
  IF NOT has_function_privilege('authenticated', 'public.organiser_media_add(uuid, uuid, text, text, text, text, text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.organiser_permission_withdraw(uuid, uuid, text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.listing_claim_check(uuid, text, uuid, timestamptz)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.organiser_series_keep(uuid, uuid, boolean)', 'EXECUTE') THEN
    v_out := v_out || ' | A11 the functions are the service role''s alone: PASS';
  ELSE v_out := v_out || ' | A11 a signed in or signed out role may call them: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A11 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  IF v_fail = 0 THEN
    RAISE EXCEPTION 'PROOF PASSED (0 failure(s), rolled back)%', v_out;
  END IF;
  RAISE EXCEPTION 'PROOF FAILED (% failure(s), rolled back)%', v_fail, v_out;
END
$proof$;
