-- NO PHOTO IS EVER REUSED, THE PROOF (supabase/migrations/20261031010001_photo_assignments.sql; Lawal's ruling of
-- 31 October 2026, 00:14; the project manager's 00:22 (2)). On a venue TEST already holds with two weekly series and
-- no night of its own photo, three approved photographs of it, and the public read as the anon role itself.
--
-- Run it through scripts/verify/replay-under-new-default.mjs, one transaction; it ends by RAISING its verdict, so TEST
-- is left exactly as it was found. RED: without the migration every check fails in its own block. The verdict reads
-- PROOF PASSED or PROOF FAILED, line by line.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_venue uuid;
  v_staff uuid;
  v_sat uuid;
  v_sun uuid;
  v_sat_first uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_p3 uuid;
  v_n int;
  v_m int;
  v_url text;
  v_ok boolean;
  v_series_n int;
BEGIN
  -- The venue: the first on TEST with two series open and no night of its own photo (Queen Victoria Market today).
  SELECT e.venue_id INTO v_venue
    FROM public.events e
   WHERE e.status = 'published' AND e.visibility = 'public' AND e.venue_id IS NOT NULL AND e.listing_series_id IS NOT NULL
     AND coalesce(e.end_date, e.start_date) >= now()
   GROUP BY e.venue_id
  HAVING count(DISTINCT e.listing_series_id) = 2
     AND NOT bool_or(e.cover_image_url !~ '/generated-covers/' AND e.cover_image_url !~ '/event-images/stock/')
     AND count(*) = count(*) FILTER (WHERE e.listing_series_id IS NOT NULL)
   ORDER BY e.venue_id
   LIMIT 1;
  SELECT id INTO v_staff FROM public.admin_users ORDER BY id LIMIT 1;
  IF v_venue IS NULL OR v_staff IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: TEST lacks a venue with two open series, or a staff member, to prove with';
  END IF;
  SELECT listing_series_id, id INTO v_sat, v_sat_first FROM public.events
   WHERE venue_id = v_venue AND status = 'published' AND visibility = 'public' AND coalesce(end_date, start_date) >= now()
   ORDER BY start_date, id LIMIT 1;
  SELECT listing_series_id INTO v_sun FROM public.events
   WHERE venue_id = v_venue AND status = 'published' AND visibility = 'public' AND coalesce(end_date, start_date) >= now()
     AND listing_series_id <> v_sat
   ORDER BY start_date, id LIMIT 1;

  -- The venue's photographs start clean for the proof: any it holds are set aside inside this transaction.
  UPDATE public.venue_images SET approval_state = 'withdrawn', withdrawn_at = now(), is_primary = false WHERE venue_id = v_venue;
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, approval_state, match_method)
  VALUES (v_venue, 'https://images.eventlinqs.com/proof/photo-1.jpg', 'licensed', 'https://images.eventlinqs.com/proof/photo-1', 'licensed', 'Photo: Proof One', array['event_card', 'event_page'], 'pending', 'manual')
  RETURNING id INTO v_p1;
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, approval_state, match_method)
  VALUES (v_venue, 'https://images.eventlinqs.com/proof/photo-2.jpg', 'licensed', 'https://images.eventlinqs.com/proof/photo-2', 'licensed', 'Photo: Proof Two', array['event_card', 'event_page'], 'pending', 'manual')
  RETURNING id INTO v_p2;
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, approval_state, match_method)
  VALUES (v_venue, 'https://images.eventlinqs.com/proof/photo-3.jpg', 'licensed', 'https://images.eventlinqs.com/proof/photo-3', 'licensed', 'Photo: Proof Three', array['event_card', 'event_page'], 'pending', 'manual')
  RETURNING id INTO v_p3;
  PERFORM public.venue_image_approve(v_staff, v_p1, 80::smallint, true);
  PERFORM public.venue_image_approve(v_staff, v_p2, 60::smallint, false);
  PERFORM public.venue_image_approve(v_staff, v_p3, 50::smallint, false);

  -- A1 nobody but the service role reaches the table; anon asks the read and cannot deal.
  BEGIN
    IF NOT has_table_privilege('anon', 'public.photo_assignments', 'select')
       AND NOT has_table_privilege('authenticated', 'public.photo_assignments', 'select')
       AND has_table_privilege('service_role', 'public.photo_assignments', 'select')
       AND NOT has_table_privilege('service_role', 'public.photo_assignments', 'insert')
       AND has_function_privilege('anon', 'public.event_cover_photos_for(uuid[], text, timestamptz)', 'execute')
       AND NOT has_function_privilege('anon', 'public.deal_venue_photos(timestamptz)', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.deal_venue_photos(timestamptz)', 'execute') THEN
      v_out := v_out || ' | A1 only the service role reads the table, anon asks the read and cannot deal: PASS';
    ELSE v_out := v_out || ' | A1 grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A1 grants: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- A2 an unhashed photo is never dealt.
  BEGIN
    v_n := public.deal_venue_photos();
    IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id IN (v_p1, v_p2, v_p3)) THEN
      v_out := v_out || ' | A2 a photo without its hash is never dealt: PASS';
    ELSE v_out := v_out || ' | A2 unhashed: FAIL (' || v_n || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A2 unhashed: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  UPDATE public.venue_images SET photo_sha256 = repeat('1', 64), photo_dhash = 0 WHERE id = v_p1;
  UPDATE public.venue_images SET photo_sha256 = repeat('2', 64), photo_dhash = -1 WHERE id = v_p2;
  UPDATE public.venue_images SET photo_sha256 = repeat('3', 64), photo_dhash = 6148914691236517205 WHERE id = v_p3;

  -- A3 dealt one per series, the strongest to the soonest; the pool beyond the nights stays unassigned; twice is once.
  BEGIN
    v_n := public.deal_venue_photos();
    v_m := public.deal_venue_photos();
    IF v_n = 2 AND v_m = 0
       AND EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id = v_p1 AND listing_series_id = v_sat AND event_id IS NULL)
       AND EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id = v_p2 AND listing_series_id = v_sun AND event_id IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id = v_p3) THEN
      v_out := v_out || ' | A3 one photo per series, the strongest to the soonest, the third waits, a second deal assigns nothing: PASS';
    ELSE v_out := v_out || ' | A3 deal: FAIL (' || v_n || ', ' || v_m || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A3 deal: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- A4 the public read, as anon: across every open night at the venue each photo answers for one night only, the
  -- series' soonest, with its credit.
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
    SELECT count(*), count(DISTINCT f.image_url),
           max(CASE WHEN f.event_id = v_sat_first THEN f.image_url END)
      INTO v_n, v_m, v_url
      FROM public.event_cover_photos_for(
             (SELECT array_agg(id) FROM public.events WHERE venue_id = v_venue AND coalesce(end_date, start_date) >= now()),
             'event_card') f;
    RESET ROLE;
    IF v_n = 2 AND v_m = 2 AND v_url = 'https://images.eventlinqs.com/proof/photo-1.jpg' THEN
      v_out := v_out || ' | A4 anon reads each photo for one night only, the series soonest, the strongest first: PASS';
    ELSE v_out := v_out || ' | A4 read: FAIL (' || v_n || ' rows, ' || v_m || ' photos, ' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN RESET ROLE; v_out := v_out || ' | A4 read: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- A5 the same bytes twice are refused.
  BEGIN
    BEGIN
      INSERT INTO public.photo_assignments (photo_sha256, image_url, event_id, source)
      VALUES (repeat('1', 64), 'https://images.eventlinqs.com/proof/copy.jpg', v_sat_first, 'organiser');
      v_ok := false;
    EXCEPTION WHEN unique_violation THEN v_ok := true;
    END;
    IF v_ok THEN v_out := v_out || ' | A5 the same photo assigned twice is refused by the unique index: PASS';
    ELSE v_out := v_out || ' | A5 same bytes: FAIL (accepted)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A5 same bytes: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- A6 a near copy (one bit of 64 apart, other bytes) is refused.
  BEGIN
    BEGIN
      INSERT INTO public.photo_assignments (photo_sha256, photo_dhash, image_url, event_id, source)
      VALUES (repeat('9', 64), 1, 'https://images.eventlinqs.com/proof/resized.jpg', v_sat_first, 'organiser');
      v_ok := false;
    EXCEPTION WHEN raise_exception THEN v_ok := sqlerrm LIKE '%near copy%';
    END;
    IF v_ok THEN v_out := v_out || ' | A6 a near copy of an assigned photo is refused: PASS';
    ELSE v_out := v_out || ' | A6 near copy: FAIL (accepted)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A6 near copy: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- A7 an assignment never moves to another event.
  BEGIN
    BEGIN
      UPDATE public.photo_assignments SET listing_series_id = v_sun WHERE venue_image_id = v_p1;
      v_ok := false;
    EXCEPTION WHEN raise_exception THEN v_ok := sqlerrm LIKE '%never moves%';
    END;
    IF v_ok THEN v_out := v_out || ' | A7 a photo never moves to another event: PASS';
    ELSE v_out := v_out || ' | A7 move: FAIL (accepted)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A7 move: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- A8 a photo withdrawn after dealing stops showing at once, is never dealt again, and the next deal gives its series
  -- the waiting photo.
  BEGIN
    UPDATE public.venue_images SET approval_state = 'withdrawn', withdrawn_at = now() WHERE id = v_p2;
    v_m := public.deal_venue_photos();
    SELECT count(*) INTO v_n FROM public.event_cover_photos_for(
             (SELECT array_agg(id) FROM public.events WHERE venue_id = v_venue AND coalesce(end_date, start_date) >= now()),
             'event_card') f;
    SELECT count(*) INTO v_series_n FROM public.photo_assignments WHERE listing_series_id = v_sun;
    IF v_n = 2 AND v_m = 1 AND v_series_n = 2
       AND EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id = v_p2 AND retired_at IS NOT NULL)
       AND EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id = v_p3 AND listing_series_id = v_sun AND retired_at IS NULL) THEN
      v_out := v_out || ' | A8 a withdrawn photo retires, stays used, and its series takes the waiting photo: PASS';
    ELSE v_out := v_out || ' | A8 withdrawn: FAIL (' || v_n || ', ' || v_m || ', ' || v_series_n || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | A8 withdrawn: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- The runner reads the verdict up to the first double quote, and error messages quote names.
  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
