-- EVERY EVENT IMAGE CARRIES ITS PROVENANCE AND RIGHTS STATE: THE PROOF (supabase/migrations/20261029221501_event_image_rights.sql),
-- on TEST. One transaction that ends by RAISING its verdict, so TEST is left as found.
--   RED:   this file alone (the migration not there): every check fails.
--   GREEN: the migration and this file joined, in one transaction:
--          scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <the two, joined>
-- Every check runs in its own block, so a missing table or function is reported as that check failing.
DO $proof$
DECLARE
  v_store constant text := 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/';
  v_staff uuid;
  v_member uuid;
  v_outsider uuid;
  v_org uuid;
  v_event uuid;
  v_asset uuid;
  v_url text;
  v_state text;
  v_prov text;
  v_n int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT s.id INTO v_staff FROM public.admin_users s ORDER BY s.id LIMIT 1;
  SELECT u.id INTO v_member FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.admin_users s WHERE s.id = u.id) ORDER BY u.created_at LIMIT 1;
  SELECT u.id INTO v_outsider FROM auth.users u WHERE u.id <> v_member AND NOT EXISTS (SELECT 1 FROM public.admin_users s WHERE s.id = u.id) ORDER BY u.created_at LIMIT 1;
  INSERT INTO public.organisations (name, slug, owner_id, status)
  VALUES ('W3 Proof Host', 'w3-proof-host-' || substr(md5(random()::text), 1, 8), v_member, 'active') RETURNING id INTO v_org;
  INSERT INTO public.organisation_members (organisation_id, user_id, role) VALUES (v_org, v_member, 'owner');
  SELECT e.id INTO v_event FROM public.events e WHERE e.status = 'draft' ORDER BY e.created_at LIMIT 1;
  IF v_event IS NULL THEN SELECT e.id INTO v_event FROM public.events e ORDER BY e.created_at LIMIT 1; END IF;
  UPDATE public.events SET organisation_id = v_org, gallery_urls = '[]'::jsonb WHERE id = v_event;
  v_out := format(' | staff %s, member %s, outsider %s, night %s', v_staff, v_member, v_outsider, v_event);

  -- R1: a library photograph is platform_library, said to be not of this night.
  BEGIN
    UPDATE public.events SET cover_image_url = v_store || 'stock/categories/arts-community/theatre-interior-evening-1440.avif' WHERE id = v_event;
    SELECT r.rights_state, r.provenance INTO v_state, v_prov FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'platform_library' AND v_prov ~ 'not of this night' THEN v_out := v_out || ' | R1 a library photograph is platform_library: PASS';
    ELSE v_out := v_out || format(' | R1 a library photograph read %s: FAIL', coalesce(v_state, 'no row')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R1 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R2: our typographic cover is original_design, and the library row it replaced is gone.
  BEGIN
    UPDATE public.events SET cover_image_url = v_store || 'generated-covers/' || v_event || '/1.jpg' WHERE id = v_event;
    SELECT r.rights_state INTO v_state FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    SELECT count(*) INTO v_n FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'original_design' AND v_n = 1 THEN v_out := v_out || ' | R2 our typographic cover is original_design, one cover row: PASS';
    ELSE v_out := v_out || format(' | R2 read %s with %s cover row(s): FAIL', coalesce(v_state, 'no row'), v_n); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R2 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R3: an upload by a member of the night's own organisation is organiser_authorised and names the account.
  BEGIN
    UPDATE public.events SET cover_image_url = v_store || v_member || '/' || v_event || '/1.jpg' WHERE id = v_event;
    SELECT r.rights_state, r.provenance INTO v_state, v_prov FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'organiser_authorised' AND v_prov ~ v_member::text THEN v_out := v_out || ' | R3 the organiser''s own upload is organiser_authorised: PASS';
    ELSE v_out := v_out || format(' | R3 read %s: FAIL', coalesce(v_state, 'no row')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R3 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R4: an upload by platform staff on the night's behalf is unrecorded, never assumed authorised.
  BEGIN
    UPDATE public.events SET cover_image_url = v_store || v_staff || '/' || v_event || '/2.jpg' WHERE id = v_event;
    SELECT r.rights_state INTO v_state FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'unrecorded' THEN v_out := v_out || ' | R4 a staff upload is unrecorded: PASS';
    ELSE v_out := v_out || format(' | R4 read %s: FAIL', coalesce(v_state, 'no row')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R4 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R5: an upload by someone outside the organisation is unrecorded.
  BEGIN
    UPDATE public.events SET cover_image_url = v_store || v_outsider || '/' || v_event || '/3.jpg' WHERE id = v_event;
    SELECT r.rights_state INTO v_state FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'unrecorded' THEN v_out := v_out || ' | R5 an outsider''s upload is unrecorded: PASS';
    ELSE v_out := v_out || format(' | R5 read %s: FAIL', coalesce(v_state, 'no row')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R5 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R6: a register row still pending gives the image nothing: it stays unrecorded.
  BEGIN
    v_url := 'https://proof.eventlinqs.test/w3/licensed-photo.jpg';
    INSERT INTO public.social_assets (asset_state, asset_type, event_id, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope,
                                      original_file, received_on, permitted_uses)
    VALUES ('separately_licensed', 'photo', v_event, v_url, v_url, 'W3 Proof Licensor', 'Licence for the proof, W3, 29 October 2026', 'Photo: W3 Proof Licensor', 'both',
            'w3-proof/licensed-photo.jpg', current_date, 'the listing and social posts, for the proof') RETURNING id INTO v_asset;
    UPDATE public.events SET cover_image_url = v_url WHERE id = v_event;
    SELECT r.rights_state INTO v_state FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'unrecorded' THEN v_out := v_out || ' | R6 a pending register row gives nothing: PASS';
    ELSE v_out := v_out || format(' | R6 read %s: FAIL', coalesce(v_state, 'no row')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R6 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R7: approving that row later moves the night's cover to its state, naming the row, with no write to events.
  BEGIN
    UPDATE public.social_assets SET approval_status = 'approved', approved_by = v_staff, approved_at = now() WHERE id = v_asset;
    SELECT r.rights_state, r.provenance INTO v_state, v_prov FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'separately_licensed' AND v_prov ~ v_asset::text THEN v_out := v_out || ' | R7 the approved register row gives its state and is named: PASS';
    ELSE v_out := v_out || format(' | R7 read %s: FAIL', coalesce(v_state, 'no row')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R7 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R8: withdrawing it takes the state away again.
  BEGIN
    UPDATE public.social_assets SET withdrawal_status = 'withdrawn', withdrawn_at = now(), withdrawal_reason = 'W3 proof: the licensor withdrew it' WHERE id = v_asset;
    SELECT r.rights_state INTO v_state FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'cover';
    IF v_state = 'unrecorded' THEN v_out := v_out || ' | R8 a withdrawn row gives nothing: PASS';
    ELSE v_out := v_out || format(' | R8 read %s: FAIL', coalesce(v_state, 'no row')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R8 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R9: every gallery image gets its own row.
  BEGIN
    UPDATE public.events SET gallery_urls = jsonb_build_array(v_store || 'stock/x/one.avif', v_store || 'generated-covers/' || v_event || '/9.jpg') WHERE id = v_event;
    SELECT count(*) INTO v_n FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'gallery';
    SELECT string_agg(r.rights_state, ',' ORDER BY r.rights_state) INTO v_state FROM public.event_image_rights r WHERE r.event_id = v_event AND r.image_role = 'gallery';
    IF v_n = 2 AND v_state = 'original_design,platform_library' THEN v_out := v_out || ' | R9 each gallery image has its own row: PASS';
    ELSE v_out := v_out || format(' | R9 read %s row(s), %s: FAIL', v_n, coalesce(v_state, 'none')); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R9 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R10: the backfill left no night that shows a cover without its row.
  BEGIN
    SELECT count(*) INTO v_n FROM public.events e
     WHERE e.cover_image_url IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.event_image_rights r WHERE r.event_id = e.id AND r.image_role = 'cover' AND r.image_url = e.cover_image_url);
    IF v_n = 0 THEN v_out := v_out || ' | R10 every night with a cover has its row: PASS';
    ELSE v_out := v_out || format(' | R10 %s night(s) with a cover and no row: FAIL', v_n); v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R10 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  -- R11: nobody signed in or out reads or writes the table; only the service role reads it; only the derivation writes.
  BEGIN
    IF NOT has_table_privilege('anon', 'public.event_image_rights', 'SELECT')
       AND NOT has_table_privilege('authenticated', 'public.event_image_rights', 'SELECT')
       AND NOT has_table_privilege('authenticated', 'public.event_image_rights', 'INSERT')
       AND has_table_privilege('service_role', 'public.event_image_rights', 'SELECT')
       AND NOT has_table_privilege('service_role', 'public.event_image_rights', 'INSERT')
       AND NOT has_function_privilege('authenticated', 'public.derive_event_image_rights(uuid)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.derive_event_image_rights(uuid)', 'EXECUTE') THEN
      v_out := v_out || ' | R11 read by the service role only, written by the derivation only: PASS';
    ELSE v_out := v_out || ' | R11 a role reaches the table or the derivation it should not: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R11 ' || replace(SQLERRM, '"', '') || ': FAIL'; v_fail := v_fail + 1;
  END;

  IF v_fail = 0 THEN
    RAISE EXCEPTION 'PROOF PASSED (0 failure(s), rolled back)%', v_out;
  END IF;
  RAISE EXCEPTION 'PROOF FAILED (% failure(s), rolled back)%', v_fail, v_out;
END
$proof$;
