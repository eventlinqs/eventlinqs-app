-- A VENUE PHOTO REPLACED, THE PROOF (X7, the controller's 05:15 of 31 October 2026: the approval-time thumbnail and the
-- replacement workflow; EVENTLINQS-PHOTO-SYSTEM-31OCT.md P2, P3 and P11). Run joined after Supabase's new default and
-- supabase/migrations/20261031054001_commons_thumbnail_at_approval.sql through scripts/verify/replay-under-new-default.mjs,
-- one transaction; it ends by RAISING its verdict, so TEST is left as found. It needs 20261031010001 (the assignment)
-- already on TEST. RED without 054001: the photo dealt to the night is the full original, so R1 and R2 fail.
-- photo-assignments-proof.sql A8 proves a withdrawn photo retires; this proves the whole replacement as staff see it:
-- approve, deal, the venue's new photo replaces it, approve the new one, and the night shows only the new one.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_venue uuid;
  v_staff uuid;
  v_old uuid;
  v_new uuid;
  v_event uuid;
  v_series uuid;
  v_night uuid;
  v_n int;
  v_url text;
  v_state text;
BEGIN
  -- The venue: the first on TEST with an open public night that has no photo of its own.
  SELECT e.venue_id INTO v_venue
    FROM public.events e
   WHERE e.status = 'published' AND e.visibility = 'public' AND e.venue_id IS NOT NULL
     AND public.event_is_open_night(e.start_date, e.end_date, now())
     AND NOT public.event_has_own_photo(e.cover_image_url)
   ORDER BY e.venue_id
   LIMIT 1;
  SELECT id INTO v_staff FROM public.admin_users ORDER BY id LIMIT 1;
  IF v_venue IS NULL OR v_staff IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: TEST lacks a venue with an open night, or a staff member, to prove with';
  END IF;

  -- The venue's photographs start clean for the proof: any it holds are set aside inside this transaction.
  UPDATE public.venue_images SET approval_state = 'withdrawn', withdrawn_at = now(), is_primary = false WHERE venue_id = v_venue;
  UPDATE public.photo_assignments a SET retired_at = now()
   WHERE a.retired_at IS NULL AND a.venue_image_id IN (SELECT id FROM public.venue_images WHERE venue_id = v_venue);

  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses, width, height)
  VALUES (v_venue, 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Proof_Replace_Old.jpg', 'wikimedia_commons',
          'https://commons.wikimedia.org/wiki/File:Proof_Replace_Old.jpg', 'cc_by_sa', 'https://creativecommons.org/licenses/by-sa/4.0/',
          'Jane Citizen', 'Photo: Jane Citizen, CC BY-SA 4.0', array['event_card', 'event_page'], 4000, 2667)
  RETURNING id INTO v_old;
  PERFORM public.venue_image_fingerprint(v_old, repeat('a', 64), 0);

  -- R1 approved, the wide original is stored as its 1920 px thumbnail; dealt, the night holds the thumbnail.
  BEGIN
    PERFORM public.venue_image_approve(v_staff, v_old, 80::smallint, true);
    v_n := public.deal_venue_photos();
    SELECT event_id, listing_series_id, image_url INTO v_event, v_series, v_url
      FROM public.photo_assignments WHERE venue_image_id = v_old AND retired_at IS NULL;
    IF v_n >= 1 AND v_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Proof_Replace_Old.jpg/1920px-Proof_Replace_Old.jpg'
       AND (v_event IS NOT NULL OR v_series IS NOT NULL) THEN
      v_out := v_out || ' | R1 approved and dealt, the night holds the 1920 px thumbnail: PASS';
    ELSE v_out := v_out || ' | R1 approve and deal: FAIL (' || coalesce(v_url, 'no assignment') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R1 approve and deal: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- The venue's new photograph replaces it (as venue_image_replace records it: the old row points to the new one).
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses, width, height)
  VALUES (v_venue, 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Proof_Replace_New.jpg', 'wikimedia_commons',
          'https://commons.wikimedia.org/wiki/File:Proof_Replace_New.jpg', 'cc_by_sa', 'https://creativecommons.org/licenses/by-sa/4.0/',
          'Jane Citizen', 'Photo: Jane Citizen, CC BY-SA 4.0', array['event_card', 'event_page'], 3000, 2000)
  RETURNING id INTO v_new;
  UPDATE public.venue_images SET replaced_by = v_new WHERE id = v_old;
  PERFORM public.venue_image_fingerprint(v_new, repeat('b', 64), -1);

  -- R2 approving the new one withdraws the old; the next deal retires the old from its night and gives that same night
  --    the new one's thumbnail.
  BEGIN
    PERFORM public.venue_image_approve(v_staff, v_new, 80::smallint, true);
    SELECT approval_state INTO v_state FROM public.venue_images WHERE id = v_old;
    v_n := public.deal_venue_photos();
    SELECT image_url INTO v_url FROM public.photo_assignments
     WHERE venue_image_id = v_new AND retired_at IS NULL
       AND (event_id IS NOT DISTINCT FROM v_event) AND (listing_series_id IS NOT DISTINCT FROM v_series);
    IF v_state = 'withdrawn'
       AND NOT EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id = v_old AND retired_at IS NULL)
       AND v_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Proof_Replace_New.jpg/1920px-Proof_Replace_New.jpg' THEN
      v_out := v_out || ' | R2 the replacement approved: the old withdrawn and retired, the same night holds the new thumbnail: PASS';
    ELSE v_out := v_out || ' | R2 replace: FAIL (' || coalesce(v_state, 'null') || ', ' || coalesce(v_url, 'no new assignment') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R2 replace: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- R3 the old photo is never dealt again, and a further deal changes nothing.
  BEGIN
    v_n := public.deal_venue_photos();
    IF v_n = 0 AND (SELECT count(*) FROM public.photo_assignments WHERE venue_image_id = v_old) = 1
       AND NOT EXISTS (SELECT 1 FROM public.photo_assignments WHERE venue_image_id = v_old AND retired_at IS NULL) THEN
      v_out := v_out || ' | R3 the old photo is never dealt again, a further deal assigns nothing: PASS';
    ELSE v_out := v_out || ' | R3 never again: FAIL (' || v_n || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | R3 never again: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- R4 the visitor's read, as anon: the night shows the new thumbnail, and the old photo shows nowhere at the venue.
  BEGIN
    SELECT id INTO v_night FROM public.events
     WHERE (v_event IS NOT NULL AND id = v_event)
        OR (v_event IS NULL AND listing_series_id = v_series AND public.event_is_open_night(start_date, end_date, now()))
     ORDER BY start_date, id LIMIT 1;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
    SELECT max(CASE WHEN f.event_id = v_night THEN f.image_url END),
           count(*) FILTER (WHERE f.image_url LIKE '%Proof_Replace_Old%')
      INTO v_url, v_n
      FROM public.event_cover_photos_for(
             (SELECT array_agg(id) FROM public.events WHERE venue_id = v_venue AND coalesce(end_date, start_date) >= now()),
             'event_card') f;
    RESET ROLE;
    IF v_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Proof_Replace_New.jpg/1920px-Proof_Replace_New.jpg' AND v_n = 0 THEN
      v_out := v_out || ' | R4 anon reads the new thumbnail for the night, the old photo nowhere: PASS';
    ELSE v_out := v_out || ' | R4 read: FAIL (' || coalesce(v_url, 'null') || ', old shown ' || v_n || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN RESET ROLE; v_out := v_out || ' | R4 read: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
