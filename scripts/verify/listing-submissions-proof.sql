-- LISTING SUBMISSIONS, THE PROOF (release checklist H1, window 2, 28 October 2026).
--
-- supabase/migrations/20261028140201_listing_submissions.sql makes listing_submissions, its rules, its row security,
-- its grants and the private listing-submissions bucket. This proves each as the roles themselves.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the table made again from the migration under
-- Supabase's new default, then this), one transaction; it ends by RAISING its verdict, so TEST is left exactly as it
-- was found. The verdict reads PROOF PASSED or PROOF FAILED, line by line.
DO $proof$
DECLARE
  v_id uuid;
  v_n int;
  v_out text := '';
  v_fail int := 0;
  v_case record;
BEGIN
  -- S1. A whole submission is written by the service role.
  SET LOCAL ROLE service_role;
  INSERT INTO public.listing_submissions (name, email, role, title, starts_at, venue_name, venue_address, city_slug,
      booking_url, entry, price_from_cents, photo_path, photo_owned, authority_confirmed, permission_words, permission_given_at)
  VALUES ('bp proof organiser', 'bp-proof@example.com', 'organiser', 'bp proof night', now() + interval '7 days',
      'bp proof venue', '1 Proof Street, Geelong VIC 3220', 'geelong', 'https://www.humanitix.com/au/events/bp-proof', 'paid',
      1250, '00000000-0000-4000-8000-000000000001.webp', true, true,
      'Yes, you''re welcome to use our event promotional material for EventLinqs listings and social posts, now and for future events.', now())
  RETURNING id INTO v_id;
  RESET ROLE;
  v_out := v_out || ' | S1 a whole submission is written: PASS';

  -- S2 to S9. Each broken row is refused by the database, for its own rule.
  FOR v_case IN
    SELECT * FROM (VALUES
      ('S2 a booking page on http', 'booking_url', 'http://example.com/e'),
      ('S3 a javascript: booking page', 'booking_url', 'javascript:alert(1)'),
      ('S4 a booking page with a space', 'booking_url', 'https://exa mple.com/e'),
      ('S5 a photo sent and not owned', 'photo_owned', 'false'),
      ('S5b authority not confirmed', 'authority_confirmed', 'false'),
      ('S6 a permission line too short to be one', 'permission_words', 'yes'),
      ('S7 a price on a free event', 'entry', 'free'),
      ('S8 a city outside the four', 'city_slug', 'sydney'),
      ('S9 a photo path that is not a random name', 'photo_path', '../other-bucket/x.webp')
    ) AS t(label, col, val)
  LOOP
    BEGIN
      SET LOCAL ROLE service_role;
      EXECUTE format(
        'INSERT INTO public.listing_submissions (name, email, role, title, starts_at, venue_name, venue_address, city_slug, booking_url, entry, price_from_cents, photo_path, photo_owned, authority_confirmed, permission_words, permission_given_at)
         SELECT name, email, role, title, starts_at, venue_name, venue_address, city_slug, booking_url, entry, price_from_cents, photo_path, photo_owned, authority_confirmed, permission_words, permission_given_at
           FROM (SELECT (jsonb_populate_record(r, jsonb_build_object(%L, %L))).* FROM public.listing_submissions r WHERE r.id = %L) s',
        v_case.col, v_case.val, v_id);
      RESET ROLE;
      v_out := v_out || ' | ' || v_case.label || ': FAIL (accepted)'; v_fail := v_fail + 1;
    EXCEPTION WHEN check_violation THEN
      RESET ROLE;
      v_out := v_out || ' | ' || v_case.label || ', refused: PASS';
    END;
  END LOOP;

  -- S9b. With no photo it is a whole submission (the checklist's section K: discovery never waits for an image).
  SET LOCAL ROLE service_role;
  INSERT INTO public.listing_submissions (name, email, role, title, starts_at, venue_name, venue_address, city_slug, booking_url, entry, photo_path, photo_owned, authority_confirmed, permission_words, permission_given_at)
  SELECT name, email, role, title || ' no photo', starts_at, venue_name, venue_address, city_slug, booking_url, 'free', null, false, true, permission_words, permission_given_at
    FROM public.listing_submissions WHERE id = v_id;
  RESET ROLE;
  v_out := v_out || ' | S9b with no photo it is still written: PASS';

  -- S10. A refusal with no reason is refused; a review with no moment is refused.
  BEGIN
    UPDATE public.listing_submissions SET status = 'refused', reviewed_at = now() WHERE id = v_id;
    v_out := v_out || ' | S10a a refusal with no reason: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | S10a a refusal with no reason, refused: PASS';
  END;
  BEGIN
    UPDATE public.listing_submissions SET status = 'accepted' WHERE id = v_id;
    v_out := v_out || ' | S10b an acceptance with no moment: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | S10b an acceptance with no moment, refused: PASS';
  END;

  -- S11. A visitor and a signed in user read nothing and write nothing.
  FOR v_case IN SELECT * FROM (VALUES ('anon'), ('authenticated')) AS t(r) LOOP
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', v_case.r);
      SELECT count(*) INTO v_n FROM public.listing_submissions;
      RESET ROLE;
      v_out := v_out || ' | S11 ' || v_case.r || ' reads ' || v_n || ': FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      v_out := v_out || ' | S11 ' || v_case.r || ' reads nothing: PASS';
    END;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', v_case.r);
      INSERT INTO public.listing_submissions (name) VALUES ('bp proof');
      RESET ROLE;
      v_out := v_out || ' | S11 ' || v_case.r || ' writes: FAIL'; v_fail := v_fail + 1;
    EXCEPTION WHEN insufficient_privilege OR not_null_violation THEN
      RESET ROLE;
      IF SQLSTATE = '42501' THEN v_out := v_out || ' | S11 ' || v_case.r || ' writes nothing: PASS';
      ELSE v_out := v_out || ' | S11 ' || v_case.r || ' reached a column rule: FAIL'; v_fail := v_fail + 1; END IF;
    END;
  END LOOP;

  -- S11c. The service role may remove a submission (a person asking for theirs to go).
  SET LOCAL ROLE service_role;
  DELETE FROM public.listing_submissions WHERE id = v_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n = 1 THEN v_out := v_out || ' | S11c the service role removes a submission: PASS';
  ELSE v_out := v_out || ' | S11c the service role removed ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- S12. The photos' bucket is private.
  SELECT count(*) INTO v_n FROM storage.buckets WHERE id = 'listing-submissions' AND public = false;
  IF v_n = 1 THEN v_out := v_out || ' | S12 the photos'' bucket is private: PASS';
  ELSE v_out := v_out || ' | S12 the photos'' bucket: FAIL'; v_fail := v_fail + 1; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
