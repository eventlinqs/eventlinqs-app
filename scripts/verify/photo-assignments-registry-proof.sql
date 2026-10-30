-- THE MEDIA REGISTRY FIELDS, THE PROOF (supabase/migrations/20261031090501_photo_assignments_media_registry.sql; A5).
-- Run joined after Supabase's new default and the migration through scripts/verify/replay-under-new-default.mjs, one
-- transaction; it ends by RAISING its verdict, so TEST is left as found. Needs 20261031010001 on TEST.
-- RED without the migration: the columns do not exist, so G1 to G3 fail.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_venue uuid;
  v_staff uuid;
  v_img uuid;
  v_night uuid;
  v_n int;
  v_ok boolean;
  r record;
BEGIN
  SELECT e.venue_id INTO v_venue
    FROM public.events e
   WHERE e.status = 'published' AND e.visibility = 'public' AND e.venue_id IS NOT NULL
     AND public.event_is_open_night(e.start_date, e.end_date, now())
     AND NOT public.event_has_own_photo(e.cover_image_url)
   ORDER BY e.venue_id LIMIT 1;
  SELECT id INTO v_staff FROM public.admin_users ORDER BY id LIMIT 1;
  IF v_venue IS NULL OR v_staff IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: TEST lacks a venue with an open night, or a staff member, to prove with';
  END IF;

  -- G3 first, before anything new is made: every venue row already on TEST carries its registry fields.
  BEGIN
    SELECT count(*) INTO v_n FROM public.photo_assignments
     WHERE venue_image_id IS NOT NULL AND (approved_subject IS NULL OR review_by IS NULL OR venue_id IS NULL);
    IF v_n = 0 THEN v_out := v_out || ' | G3 the rows already made carry their registry fields: PASS';
    ELSE v_out := v_out || ' | G3 backfill: FAIL (' || v_n || ' row(s) without)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G3 backfill: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  UPDATE public.venue_images SET approval_state = 'withdrawn', withdrawn_at = now(), is_primary = false WHERE venue_id = v_venue;
  UPDATE public.photo_assignments a SET retired_at = now()
   WHERE a.retired_at IS NULL AND a.venue_image_id IN (SELECT id FROM public.venue_images WHERE venue_id = v_venue);
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses, width, height)
  VALUES (v_venue, 'https://upload.wikimedia.org/wikipedia/commons/2/2b/Proof_Registry_Hall.jpg', 'wikimedia_commons',
          'https://commons.wikimedia.org/wiki/File:Proof_Registry_Hall.jpg', 'cc_by_sa', 'https://creativecommons.org/licenses/by-sa/4.0/',
          'Jane Citizen', 'Photo: Jane Citizen, CC BY-SA 4.0', array['event_card', 'event_page'], 1600, 1067)
  RETURNING id INTO v_img;
  PERFORM public.venue_image_fingerprint(v_img, repeat('c', 64), 12345);
  PERFORM public.venue_image_approve(v_staff, v_img, 77::smallint, true);

  -- G1 a venue photo dealt to a night carries, from its own record, every A5 field.
  BEGIN
    PERFORM public.deal_venue_photos();
    SELECT * INTO r FROM public.photo_assignments WHERE venue_image_id = v_img AND retired_at IS NULL;
    IF r.id IS NOT NULL AND r.venue_id = v_venue AND r.approved_subject = 'venue:' || v_venue::text
       AND r.rights_holder = 'Jane Citizen' AND r.licence = 'cc_by_sa'
       AND r.licence_url = 'https://creativecommons.org/licenses/by-sa/4.0/'
       AND r.attribution = 'Photo: Jane Citizen, CC BY-SA 4.0'
       AND r.permitted_placements = array['event_card', 'event_page'] AND r.visual_quality = 77
       AND r.review_by = (r.assigned_at + interval '12 months')::date THEN
      v_out := v_out || ' | G1 a dealt venue photo carries its subject, rights holder, licence, attribution, placements, quality and review date: PASS';
    ELSE v_out := v_out || ' | G1 dealt: FAIL (' || coalesce(r.approved_subject, 'no row') || ', ' || coalesce(r.rights_holder, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G1 dealt: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G2 an organiser's photo locked to its event carries its event as subject and the organiser as rights holder.
  BEGIN
    SELECT id INTO v_night FROM public.events WHERE venue_id = v_venue AND status = 'published' ORDER BY start_date DESC, id LIMIT 1;
    PERFORM public.photo_lock_for_event(v_night, repeat('d', 64), -98765, 'https://images.eventlinqs.com/proof/registry-cover.jpg', 'gallery');
    SELECT * INTO r FROM public.photo_assignments WHERE photo_sha256 = repeat('d', 64);
    IF r.id IS NOT NULL AND r.approved_subject = 'event:' || v_night::text AND r.rights_holder = 'the event''s organiser'
       AND r.licence = 'organiser_upload' AND r.venue_id = v_venue AND r.review_by IS NOT NULL
       AND r.permitted_placements = array['event_card', 'event_page', 'social'] THEN
      v_out := v_out || ' | G2 an organiser photo carries its event as subject and the organiser as rights holder: PASS';
    ELSE v_out := v_out || ' | G2 organiser: FAIL (' || coalesce(r.approved_subject, 'no row') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G2 organiser: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G4 the photo itself still can never be edited.
  BEGIN
    BEGIN
      UPDATE public.photo_assignments SET image_url = 'https://images.eventlinqs.com/proof/other.jpg' WHERE photo_sha256 = repeat('c', 64);
      v_ok := false;
    EXCEPTION WHEN raise_exception THEN v_ok := sqlerrm LIKE '%never edited%';
    END;
    IF v_ok THEN v_out := v_out || ' | G4 the photo itself is still never edited: PASS';
    ELSE v_out := v_out || ' | G4 never edited: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G4 never edited: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- G5 nobody but the service role reaches the table or the fill function.
  BEGIN
    IF NOT has_table_privilege('anon', 'public.photo_assignments', 'select')
       AND NOT has_table_privilege('authenticated', 'public.photo_assignments', 'select')
       AND NOT has_function_privilege('anon', 'public.photo_assignments_registry_fill()', 'execute')
       AND NOT has_function_privilege('authenticated', 'public.photo_assignments_registry_fill()', 'execute') THEN
      v_out := v_out || ' | G5 anon and authenticated reach neither the table nor the fill: PASS';
    ELSE v_out := v_out || ' | G5 grants: FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | G5 grants: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
