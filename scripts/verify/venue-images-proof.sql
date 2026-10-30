-- THE VENUE MEDIA MODEL, THE PROOF (supabase/migrations/20261030171501_venue_images.sql; the project manager's 16:42
-- of 30 October 2026). Each rule the database must refuse or keep, on a venue, a staff member and a non-staff user
-- TEST already holds, and the public read as the anon role itself.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (Supabase's own opt-in to the new default, the table made
-- again from the migration, then this), one transaction; it ends by RAISING its verdict, so TEST is left exactly as it
-- was found. RED: without the migration every check fails in its own block. The verdict reads PROOF PASSED or PROOF
-- FAILED, line by line.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_venue uuid;
  v_staff uuid;
  v_outsider uuid;
  v_a uuid;
  v_b uuid;
  v_url text;
  v_n int;
  v_ok boolean;
  v_manager uuid;
  v_stranger uuid;
  v_c uuid;
  v_d uuid;
  v_e uuid;
  v_f uuid;
  v_other uuid;
  v_bucket constant text := 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/organiser-media/venue-proof/';
BEGIN
  SELECT id INTO v_venue FROM public.venues ORDER BY created_at LIMIT 1;
  SELECT id INTO v_staff FROM public.admin_users ORDER BY id LIMIT 1;
  SELECT u.id INTO v_outsider FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = u.id) ORDER BY u.created_at LIMIT 1;
  IF v_venue IS NULL OR v_staff IS NULL OR v_outsider IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: TEST lacks a venue, a staff member or a non-staff user to prove with';
  END IF;

  -- V1 nobody but the service role reaches the table; everyone may ask the public read.
  BEGIN
    IF NOT has_table_privilege('anon', 'public.venue_images', 'select')
       AND NOT has_table_privilege('authenticated', 'public.venue_images', 'select')
       AND NOT has_table_privilege('anon', 'public.venue_images', 'insert')
       AND has_table_privilege('service_role', 'public.venue_images', 'insert')
       AND has_function_privilege('anon', 'public.venue_photo_for(uuid, text)', 'execute') THEN
      v_out := v_out || ' | V1 only the service role reaches the table, anon asks venue_photo_for: PASS';
    ELSE v_out := v_out || ' | V1 grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V1 grants: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V2 a venue's own photograph with its yes is kept, pending; without the yes it is refused.
  BEGIN
    INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, permission_evidence, submitted_by)
    VALUES (v_venue, v_bucket || 'a.jpg', 'venue', 'mailto:hello@eventlinqs.com', 'owner_permission', 'Photo: the venue',
            array['event_card', 'event_page', 'venue_page'], 'Yes, you are welcome to use these photos of our venue.', v_outsider)
    RETURNING id INTO v_a;
    v_ok := false;
    BEGIN
      INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses)
      VALUES (v_venue, v_bucket || 'no-yes.jpg', 'venue', 'mailto:hello@eventlinqs.com', 'owner_permission', 'Photo: the venue', array['event_card']);
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF v_a IS NOT NULL AND v_ok THEN v_out := v_out || ' | V2 the yes is required, and kept pending: PASS';
    ELSE v_out := v_out || ' | V2 a photograph with no yes was kept: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V2 the yes: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V3 an approval with no verified depiction is refused.
  BEGIN
    v_ok := false;
    BEGIN
      UPDATE public.venue_images SET approval_state = 'approved', approved_by = v_staff, approved_at = now(), quality_score = 80 WHERE id = v_a;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF v_ok THEN v_out := v_out || ' | V3 no approval before someone checks it shows the venue: PASS';
    ELSE v_out := v_out || ' | V3 approved unverified: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V3 unverified: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V4 someone who is not staff may neither verify nor approve.
  BEGIN
    v_ok := false;
    BEGIN
      UPDATE public.venue_images SET verified_depicts_venue = true, verified_by = v_outsider, verified_at = now() WHERE id = v_a;
    EXCEPTION WHEN raise_exception THEN v_ok := true; END;
    IF v_ok THEN v_out := v_out || ' | V4 only staff verify and approve: PASS';
    ELSE v_out := v_out || ' | V4 a non-staff user verified: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V4 staff only: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V5 while pending, nothing serves; once staff verify and approve it, it serves, to anon itself.
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_card') f;
    RESET ROLE;
    v_ok := v_url IS NULL OR v_url NOT LIKE v_bucket || '%';
    UPDATE public.venue_images SET verified_depicts_venue = true, verified_by = v_staff, verified_at = now(),
      approval_state = 'approved', approved_by = v_staff, approved_at = now(), quality_score = 80, is_primary = true WHERE id = v_a;
    SET LOCAL ROLE anon;
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_card') f;
    RESET ROLE;
    IF v_ok AND v_url = v_bucket || 'a.jpg' THEN v_out := v_out || ' | V5 pending serves nothing, approved serves to anon: PASS';
    ELSE v_out := v_out || ' | V5 serving: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN RESET ROLE; v_out := v_out || ' | V5 serving: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V6 a use the photograph is not permitted for is never answered.
  BEGIN
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'social') f;
    IF v_url IS NULL OR v_url NOT LIKE v_bucket || '%' THEN v_out := v_out || ' | V6 not served for a use it lacks (social): PASS';
    ELSE v_out := v_out || ' | V6 served for social: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V6 uses: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V7 Creative Commons without the author, the licence link and a credit naming the author is refused; with them, kept.
  BEGIN
    v_ok := false;
    BEGIN
      INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses)
      VALUES (v_venue, v_bucket || 'cc-bare.jpg', 'licensed', 'https://commons.wikimedia.org/wiki/File:X.jpg', 'cc_by_sa', 'Wikimedia Commons', array['event_card']);
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses)
    VALUES (v_venue, v_bucket || 'cc.jpg', 'licensed', 'https://commons.wikimedia.org/wiki/File:X.jpg', 'cc_by_sa',
            'https://creativecommons.org/licenses/by-sa/4.0/', 'Jane Citizen', 'Photo: Jane Citizen, CC BY-SA 4.0', array['event_card'])
    RETURNING id INTO v_b;
    IF v_ok AND v_b IS NOT NULL THEN v_out := v_out || ' | V7 Commons needs author, licence link and credit: PASS';
    ELSE v_out := v_out || ' | V7 Commons credit: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V7 Commons: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V8 the stock library is never a venue photograph.
  BEGIN
    v_ok := false;
    BEGIN
      INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses)
      VALUES (v_venue, 'https://vkapkibzokmfaxqogypq.supabase.co/storage/v1/object/public/event-images/stock/hero/x-1920.avif',
              'licensed', 'https://eventlinqs.com.au', 'licensed', 'EventLinqs', array['event_card']);
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF v_ok THEN v_out := v_out || ' | V8 never the stock library: PASS';
    ELSE v_out := v_out || ' | V8 a stock photograph was kept: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V8 stock: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V9 one primary per venue.
  BEGIN
    UPDATE public.venue_images SET verified_depicts_venue = true, verified_by = v_staff, verified_at = now(),
      approval_state = 'approved', approved_by = v_staff, approved_at = now(), quality_score = 95 WHERE id = v_b;
    v_ok := false;
    BEGIN
      UPDATE public.venue_images SET is_primary = true WHERE id = v_b;
    EXCEPTION WHEN unique_violation THEN v_ok := true; END;
    IF v_ok THEN v_out := v_out || ' | V9 one primary per venue: PASS';
    ELSE v_out := v_out || ' | V9 two primaries: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V9 primary: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V10 the primary leads even where another approved photograph scores higher.
  BEGIN
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_card') f;
    IF v_url = v_bucket || 'a.jpg' THEN v_out := v_out || ' | V10 the primary leads: PASS';
    ELSE v_out := v_out || ' | V10 order: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V10 order: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V11 a challenge stops it serving at once and takes its primary away; the next approved photograph serves.
  BEGIN
    UPDATE public.venue_images SET approval_state = 'challenged', challenge_reason = 'This is not our venue.', challenged_by = v_outsider, challenged_at = now() WHERE id = v_a;
    SELECT is_primary INTO v_ok FROM public.venue_images WHERE id = v_a;
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_card') f;
    IF NOT v_ok AND v_url = v_bucket || 'cc.jpg' THEN v_out := v_out || ' | V11 a challenge stops it at once: PASS';
    ELSE v_out := v_out || ' | V11 challenge: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V11 challenge: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V12 a withdrawal stops it too; with nothing approved left, nothing serves.
  BEGIN
    UPDATE public.venue_images SET approval_state = 'withdrawn', withdrawn_at = now() WHERE id = v_b;
    SELECT count(*) INTO v_n FROM public.venue_photo_for(v_venue, 'event_card') f WHERE f.image_url LIKE v_bucket || '%';
    IF v_n = 0 THEN v_out := v_out || ' | V12 a withdrawal stops it, nothing left serves: PASS';
    ELSE v_out := v_out || ' | V12 withdrawn still serves: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | V12 withdrawal: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- V13 anon cannot write the table itself.
  BEGIN
    v_ok := false;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
    BEGIN
      INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, permission_evidence)
      VALUES (v_venue, v_bucket || 'anon.jpg', 'venue', 'mailto:x@example.com', 'owner_permission', 'Photo', array['event_card'], 'Yes, use it please.');
    EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
    RESET ROLE;
    IF v_ok THEN v_out := v_out || ' | V13 anon writes nothing: PASS';
    ELSE v_out := v_out || ' | V13 anon wrote a row: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN RESET ROLE; v_out := v_out || ' | V13 anon: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- THE WRITERS. The venue is made claimed for this transaction only; its organisation's owner is its manager.
  BEGIN
    UPDATE public.venues SET listing_source = 'organiser' WHERE id = v_venue;
    SELECT o.owner_id INTO v_manager FROM public.venues v JOIN public.organisations o ON o.id = v.organisation_id WHERE v.id = v_venue;
    SELECT u.id INTO v_stranger FROM auth.users u
     WHERE u.id <> v_manager
       AND NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.organisations o WHERE o.owner_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.organisation_members m WHERE m.user_id = u.id)
     ORDER BY u.created_at LIMIT 1;
    IF v_manager IS NULL OR v_stranger IS NULL THEN RAISE EXCEPTION 'TEST lacks a venue owner or a stranger'; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | W0 setting up the writers: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- W1 the venue's own people add a photograph with their yes, kept pending; a stranger, or no real yes, is refused.
  BEGIN
    v_c := public.venue_image_add(v_manager, v_venue, v_bucket || 'w1.jpg', 'https://www.eventlinqs.com.au/venues/proof', 'Yes, please use these photos of our venue.', null, null);
    v_ok := false;
    BEGIN PERFORM public.venue_image_add(v_stranger, v_venue, v_bucket || 'w1x.jpg', 'https://www.eventlinqs.com.au/venues/proof', 'Yes, please use these photos of our venue.', null, null);
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    v_n := 0;
    BEGIN PERFORM public.venue_image_add(v_manager, v_venue, v_bucket || 'w1y.jpg', 'https://www.eventlinqs.com.au/venues/proof', 'ok', null, null);
    EXCEPTION WHEN check_violation THEN v_n := 1; END;
    IF v_c IS NOT NULL AND v_ok AND v_n = 1 AND (SELECT approval_state FROM public.venue_images WHERE id = v_c) = 'pending' THEN
      v_out := v_out || ' | W1 the venue adds with its yes, pending; a stranger or no yes refused: PASS';
    ELSE v_out := v_out || ' | W1 add: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | W1 add: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- W2 staff approve it once, as primary; it serves.
  BEGIN
    PERFORM public.venue_image_approve(v_staff, v_c, 85::smallint, true);
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_page') f;
    IF v_url = v_bucket || 'w1.jpg' THEN v_out := v_out || ' | W2 approved once, it serves: PASS';
    ELSE v_out := v_out || ' | W2 approve: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | W2 approve: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- W3 a replacement waits pending while the old one keeps serving; its approval withdraws the old one.
  BEGIN
    v_d := public.venue_image_replace(v_manager, v_c, v_bucket || 'w3.jpg', 'https://www.eventlinqs.com.au/venues/proof', 'Yes, use this newer photo of our venue.');
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_page') f;
    v_ok := v_url = v_bucket || 'w1.jpg';
    PERFORM public.venue_image_approve(v_staff, v_d, 90::smallint, true);
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_page') f;
    IF v_ok AND v_url = v_bucket || 'w3.jpg' AND (SELECT approval_state FROM public.venue_images WHERE id = v_c) = 'withdrawn' THEN
      v_out := v_out || ' | W3 a replacement serves only once approved, and retires the old one: PASS';
    ELSE v_out := v_out || ' | W3 replace: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | W3 replace: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- W4 a stranger may not challenge; the venue may, and it stops serving at once.
  BEGIN
    v_ok := false;
    BEGIN PERFORM public.venue_image_challenge(v_stranger, v_d, 'This is not that venue.');
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    PERFORM public.venue_image_challenge(v_manager, v_d, 'This photo is out of date.');
    SELECT count(*) INTO v_n FROM public.venue_photo_for(v_venue, 'event_page') f WHERE f.image_url LIKE v_bucket || 'w%';
    IF v_ok AND v_n = 0 THEN v_out := v_out || ' | W4 only the venue or its organisers challenge, and it stops at once: PASS';
    ELSE v_out := v_out || ' | W4 challenge: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | W4 challenge: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- W5 the venue withdraws a photograph; a stranger may not.
  BEGIN
    v_ok := false;
    BEGIN PERFORM public.venue_image_withdraw(v_stranger, v_d);
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    PERFORM public.venue_image_withdraw(v_manager, v_d);
    IF v_ok AND (SELECT approval_state FROM public.venue_images WHERE id = v_d) = 'withdrawn' THEN
      v_out := v_out || ' | W5 the venue withdraws, a stranger may not: PASS';
    ELSE v_out := v_out || ' | W5 withdraw: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | W5 withdraw: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- W6 no visitor calls a writer.
  BEGIN
    IF NOT has_function_privilege('anon', 'public.venue_image_add(uuid, uuid, text, text, text, text, text[])', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.venue_image_approve(uuid, uuid, smallint, boolean)', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.venue_image_challenge(uuid, uuid, text)', 'execute')
       AND has_function_privilege('service_role', 'public.venue_image_approve(uuid, uuid, smallint, boolean)', 'execute') THEN
      v_out := v_out || ' | W6 the writers are the service role''s alone: PASS';
    ELSE v_out := v_out || ' | W6 writer grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | W6 writer grants: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- THE HARVEST (the PM's 16:52, E to G). C1 a Commons candidate matched to no venue is kept; approving it unmatched is
  -- refused in words; staff match it by hand, approve it, and it serves.
  BEGIN
    INSERT INTO public.venue_images (image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses,
                                     approval_state, wikidata_id, commons_file, latitude, longitude, width, height, quality_score)
    VALUES (v_bucket || 'c1.jpg', 'wikimedia_commons', 'https://commons.wikimedia.org/wiki/File:Hall.jpg', 'cc_by', 'https://creativecommons.org/licenses/by/4.0/',
            'A Photographer', 'Photo: A Photographer, CC BY 4.0', array['event_card', 'event_page', 'venue_page'],
            'candidate', 'Q123', 'File:Hall.jpg', -38.1500000, 144.3600000, 2400, 1600, 70)
    RETURNING id INTO v_e;
    v_ok := false;
    BEGIN PERFORM public.venue_image_approve(v_staff, v_e, 70::smallint, false);
    EXCEPTION WHEN check_violation THEN v_ok := sqlerrm LIKE 'refused: match the photograph%'; END;
    PERFORM public.venue_image_link(v_staff, v_e, v_venue);
    PERFORM public.venue_image_approve(v_staff, v_e, 70::smallint, true);
    SELECT f.image_url INTO v_url FROM public.venue_photo_for(v_venue, 'event_card') f;
    IF v_ok AND v_url = v_bucket || 'c1.jpg' AND (SELECT match_method FROM public.venue_images WHERE id = v_e) = 'manual' THEN
      v_out := v_out || ' | C1 an unmatched candidate waits; matched by hand and approved, it serves: PASS';
    ELSE v_out := v_out || ' | C1 candidate: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | C1 candidate: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- C2 a Commons file under 1200 pixels wide is refused; a CC0 file needs no author.
  BEGIN
    v_ok := false;
    BEGIN
      INSERT INTO public.venue_images (image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses, approval_state, width, height)
      VALUES (v_bucket || 'c2-small.jpg', 'wikimedia_commons', 'https://commons.wikimedia.org/wiki/File:Small.jpg', 'cc_by', 'https://creativecommons.org/licenses/by/4.0/',
              'A Photographer', 'Photo: A Photographer, CC BY 4.0', array['event_card'], 'candidate', 800, 600);
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    INSERT INTO public.venue_images (image_url, source, source_url, licence, attribution_text, permitted_uses, approval_state, width, height)
    VALUES (v_bucket || 'c2-cc0.jpg', 'wikimedia_commons', 'https://commons.wikimedia.org/wiki/File:Free.jpg', 'cc0', 'Photo: Wikimedia Commons, CC0', array['event_card'], 'candidate', 2000, 1300)
    RETURNING id INTO v_e;
    IF v_ok AND v_e IS NOT NULL THEN v_out := v_out || ' | C2 Commons under 1200 wide refused, CC0 kept with no author: PASS';
    ELSE v_out := v_out || ' | C2 size and CC0: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | C2 size and CC0: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- Q1 Lawal's queue holds a matched waiting photograph with its venue, never an approved or unmatched one; the
  -- unmatched candidates are counted; no visitor reads the queue.
  BEGIN
    v_f := public.venue_image_add(v_manager, v_venue, v_bucket || 'q1.jpg', 'https://www.eventlinqs.com.au/venues/proof', 'Yes, please use this photo of our venue.', null, null);
    SELECT count(*) INTO v_n FROM public.venue_photo_queue() q WHERE q.id = v_f AND q.venue_name IS NOT NULL;
    v_ok := v_n = 1;
    SELECT count(*) INTO v_n FROM public.venue_photo_queue() q WHERE q.image_url IN (v_bucket || 'c1.jpg', v_bucket || 'c2-cc0.jpg');
    IF v_ok AND v_n = 0 AND public.venue_photo_unmatched_count() >= 1
       AND NOT has_function_privilege('authenticated', 'public.venue_photo_queue()', 'execute') THEN
      v_out := v_out || ' | Q1 the queue holds matched waiting photographs only, staff only: PASS';
    ELSE v_out := v_out || ' | Q1 queue: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | Q1 queue: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- R1 staff refuse it with a reason, and it never serves; someone who is not staff may not.
  BEGIN
    v_ok := false;
    BEGIN PERFORM public.venue_image_refuse(v_outsider, v_f, 'Not the venue.');
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    PERFORM public.venue_image_refuse(v_staff, v_f, 'Blurred.');
    IF v_ok AND (SELECT approval_state FROM public.venue_images WHERE id = v_f) = 'refused'
       AND NOT EXISTS (SELECT 1 FROM public.venue_photo_queue() q WHERE q.id = v_f) THEN
      v_out := v_out || ' | R1 staff refuse with a reason, it leaves the queue: PASS';
    ELSE v_out := v_out || ' | R1 refuse: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R1 refuse: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- B1 the page's batch read (20261030190501): to anon itself, one row a venue, the primary photograph, none for a venue
  -- with nothing approved, none for a use not permitted, and the single read answers the same photograph.
  BEGIN
    SELECT id INTO v_other FROM public.venues v WHERE v.id <> v_venue
       AND NOT EXISTS (SELECT 1 FROM public.venue_images i WHERE i.venue_id = v.id) ORDER BY created_at LIMIT 1;
    UPDATE public.venue_images SET is_primary = false WHERE venue_id = v_venue AND is_primary;
    INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, width, height,
        verified_depicts_venue, verified_by, verified_at, approval_state, approved_by, approved_at, quality_score, is_primary)
      VALUES (v_venue, v_bucket || 'batch-primary.jpg', 'wikimedia_commons', 'https://commons.wikimedia.org/wiki/File:Batch.jpg', 'cc0', 'Photo: batch', array['venue_page'], 1600, 1200,
        true, v_staff, now(), 'approved', v_staff, now(), 10, true);
    INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, width, height,
        verified_depicts_venue, verified_by, verified_at, approval_state, approved_by, approved_at, quality_score)
      VALUES (v_venue, v_bucket || 'batch-higher-score.jpg', 'wikimedia_commons', 'https://commons.wikimedia.org/wiki/File:Batch2.jpg', 'cc0', 'Photo: batch two', array['venue_page'], 1600, 1200,
        true, v_staff, now(), 'approved', v_staff, now(), 99);
    SET LOCAL ROLE anon;
    SELECT count(*), min(f.image_url) INTO v_n, v_url FROM public.venue_photos_for(array[v_venue, v_other, v_venue], 'venue_page') f;
    RESET ROLE;
    IF v_n = 1 AND v_url = v_bucket || 'batch-primary.jpg'
       AND (SELECT count(*) FROM public.venue_photos_for(array[v_other], 'venue_page')) = 0
       AND (SELECT count(*) FROM public.venue_photos_for('{}'::uuid[], 'venue_page')) = 0
       AND (SELECT f.image_url FROM public.venue_photo_for(v_venue, 'venue_page') f) = v_url
       AND NOT EXISTS (SELECT 1 FROM public.venue_photos_for(array[v_venue], 'no_such_use')) THEN
      v_out := v_out || ' | B1 the batch read answers one row a venue, primary first, to anon, as the single read does: PASS';
    ELSE v_out := v_out || ' | B1 batch: FAIL (' || coalesce(v_n::text, 'null') || ', ' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN RESET ROLE; v_out := v_out || ' | B1 batch: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- B2 the file page is answered for a licensed photograph, and a mailto: yes never reaches a visitor.
  BEGIN
    SELECT f.source_url INTO v_url FROM public.venue_photos_for(array[v_venue], 'venue_page') f;
    v_ok := v_url = 'https://commons.wikimedia.org/wiki/File:Batch.jpg';
    UPDATE public.venue_images SET source_url = 'mailto:owner@example.com' WHERE venue_id = v_venue AND image_url = v_bucket || 'batch-primary.jpg';
    SELECT f.source_url INTO v_url FROM public.venue_photos_for(array[v_venue], 'venue_page') f;
    IF v_ok AND v_url IS NULL THEN v_out := v_out || ' | B2 an https file page is answered, a mailto: yes never is: PASS';
    ELSE v_out := v_out || ' | B2 source: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | B2 source: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- C1 a challenged photograph stops serving and waits in the queue with what was said; approved again, it serves and
  -- leaves the queue with the challenge cleared (20261030194501).
  BEGIN
    SELECT id INTO v_c FROM public.venue_images WHERE venue_id = v_venue AND image_url = v_bucket || 'batch-primary.jpg';
    UPDATE public.venue_images SET approval_state = 'challenged', challenge_reason = 'Not this hall.', challenged_at = now() WHERE id = v_c;
    SELECT q.challenge_reason INTO v_url FROM public.venue_photo_queue() q WHERE q.id = v_c;
    v_ok := v_url = 'Not this hall.'
      AND NOT EXISTS (SELECT 1 FROM public.venue_photos_for(array[v_venue], 'venue_page') f WHERE f.image_url = v_bucket || 'batch-primary.jpg');
    PERFORM public.venue_image_approve(v_staff, v_c, 10::smallint, true);
    IF v_ok AND NOT EXISTS (SELECT 1 FROM public.venue_photo_queue() q WHERE q.id = v_c)
       AND EXISTS (SELECT 1 FROM public.venue_photos_for(array[v_venue], 'venue_page') f WHERE f.image_url = v_bucket || 'batch-primary.jpg')
       AND (SELECT challenge_reason FROM public.venue_images WHERE id = v_c) IS NULL THEN
      v_out := v_out || ' | C1 a challenged photograph waits for a person with what was said, approved again it serves: PASS';
    ELSE v_out := v_out || ' | C1 challenge: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | C1 challenge: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- The runner reads the verdict up to the first double quote, and error messages quote names.
  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
