-- AN APPROVED COMMONS PHOTO IS STORED AS ITS 1920 PX THUMBNAIL OF THE SAME FILE, THE PROOF
-- (supabase/migrations/20261031054001_commons_thumbnail_at_approval.sql). Run joined after Supabase's new default and the
-- migration, one transaction; it ends by RAISING its verdict, so TEST is left as found. RED: without the migration the
-- approved wide original keeps its own address, so T1 fails; T2 to T4 hold either way and guard the rewrite's edges.
DO $proof$
DECLARE
  v_out text := '';
  v_fail int := 0;
  v_venue uuid;
  v_staff uuid;
  v_wide uuid;
  v_narrow uuid;
  v_svg uuid;
  v_bucket uuid;
  v_url text;
  v_state text;
  v_credit text;
BEGIN
  SELECT id INTO v_venue FROM public.venues ORDER BY created_at LIMIT 1;
  SELECT id INTO v_staff FROM public.admin_users ORDER BY id LIMIT 1;
  IF v_venue IS NULL OR v_staff IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: TEST lacks a venue or a staff member to prove with'; END IF;

  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses, width, height)
  VALUES (v_venue, 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Proof_Hall_Wide.JPG', 'wikimedia_commons',
          'https://commons.wikimedia.org/wiki/File:Proof_Hall_Wide.JPG', 'cc_by_sa', 'https://creativecommons.org/licenses/by-sa/4.0/',
          'Jane Citizen', 'Photo: Jane Citizen, CC BY-SA 4.0', array['event_card'], 4000, 2667)
  RETURNING id INTO v_wide;
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses, width, height)
  VALUES (v_venue, 'https://upload.wikimedia.org/wikipedia/commons/1/10/Proof_Hall_Narrow.jpg', 'wikimedia_commons',
          'https://commons.wikimedia.org/wiki/File:Proof_Hall_Narrow.jpg', 'cc_by_sa', 'https://creativecommons.org/licenses/by-sa/4.0/',
          'Jane Citizen', 'Photo: Jane Citizen, CC BY-SA 4.0', array['event_card'], 1600, 1067)
  RETURNING id INTO v_narrow;
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, licence_url, author, attribution_text, permitted_uses, width, height)
  VALUES (v_venue, 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Proof_Hall_Plan.svg', 'wikimedia_commons',
          'https://commons.wikimedia.org/wiki/File:Proof_Hall_Plan.svg', 'cc_by_sa', 'https://creativecommons.org/licenses/by-sa/4.0/',
          'Jane Citizen', 'Photo: Jane Citizen, CC BY-SA 4.0', array['event_card'], 4000, 3000)
  RETURNING id INTO v_svg;
  INSERT INTO public.venue_images (venue_id, image_url, source, source_url, licence, attribution_text, permitted_uses, permission_evidence, width, height)
  VALUES (v_venue, 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/venue-media/proof/wide.webp', 'venue',
          'mailto:proof@example.com', 'owner_permission', 'Photo supplied by the venue', array['event_card'],
          'Yes, you may show these photographs of our venue.', 4000, 2667)
  RETURNING id INTO v_bucket;

  -- T1 a Commons original wider than 1920 px is stored, once approved, as the 1920 px thumbnail of the same file, and
  --    its credit is untouched.
  BEGIN
    PERFORM public.venue_image_approve(v_staff, v_wide, 80::smallint, false);
    SELECT image_url, approval_state, attribution_text INTO v_url, v_state, v_credit FROM public.venue_images WHERE id = v_wide;
    IF v_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Proof_Hall_Wide.JPG/1920px-Proof_Hall_Wide.JPG'
       AND v_state = 'approved' AND v_credit = 'Photo: Jane Citizen, CC BY-SA 4.0' THEN
      v_out := v_out || ' | T1 a wide Commons original is stored as its 1920 px thumbnail, credit kept: PASS';
    ELSE v_out := v_out || ' | T1 wide: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | T1 wide: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- T2 an original 1920 px wide or narrower keeps its own address.
  BEGIN
    PERFORM public.venue_image_approve(v_staff, v_narrow, 80::smallint, false);
    SELECT image_url INTO v_url FROM public.venue_images WHERE id = v_narrow;
    IF v_url = 'https://upload.wikimedia.org/wikipedia/commons/1/10/Proof_Hall_Narrow.jpg' THEN
      v_out := v_out || ' | T2 a narrow original keeps its address: PASS';
    ELSE v_out := v_out || ' | T2 narrow: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | T2 narrow: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- T3 a file that is not a JPEG, PNG or WebP keeps its address (its thumbnail would carry another extension).
  BEGIN
    PERFORM public.venue_image_approve(v_staff, v_svg, 80::smallint, false);
    SELECT image_url INTO v_url FROM public.venue_images WHERE id = v_svg;
    IF v_url = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Proof_Hall_Plan.svg' THEN
      v_out := v_out || ' | T3 another file type keeps its address: PASS';
    ELSE v_out := v_out || ' | T3 svg: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | T3 svg: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  -- T4 a venue's own photo, however wide, keeps its address.
  BEGIN
    PERFORM public.venue_image_approve(v_staff, v_bucket, 80::smallint, false);
    SELECT image_url INTO v_url FROM public.venue_images WHERE id = v_bucket;
    IF v_url = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/venue-media/proof/wide.webp' THEN
      v_out := v_out || ' | T4 a venue photo keeps its address: PASS';
    ELSE v_out := v_out || ' | T4 venue: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN others THEN v_out := v_out || ' | T4 venue: FAIL (' || sqlerrm || ')'; v_fail := v_fail + 1; END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, replace(v_out, '"', '');
END
$proof$;
