-- WI2 PART 1, THE GRANTS PROOF: each role reaches exactly what its policy serves.
--
-- Lawal, 21 October 2026: every migration that creates a public table grants
-- it in the same migration, to exactly the roles its row security policies
-- serve, never wider. 20261023000010_city_guide_listings.sql makes two tables
-- (event_series, listing_checks), adds columns to venues and events, and adds
-- three triggers; this proves all of it as the roles themselves.
--
-- Run it through scripts/verify/replay-under-new-default.mjs, which applies
-- Supabase's own opt-in to the new default (changelog 45329), drops the two
-- tables and creates them again from the migration, then runs this. One
-- transaction; this block ends by RAISING its verdict, so TEST is left exactly
-- as it was found. The verdict reads PROOF PASSED or PROOF FAILED, line by line.
--
-- The roles are taken for real (SET LOCAL ROLE), with the request claims the
-- Data API would set, so a row a role reaches here is a row supabase-js would
-- hand it.
DO $proof$
DECLARE
  v_listings uuid;
  v_owner uuid;
  v_org uuid;
  v_member uuid;
  v_cat uuid;
  v_cover text;
  v_venue uuid;
  v_own_venue uuid;
  v_active uuid;
  v_removed uuid;
  v_occurrence uuid;
  v_own_event uuid;
  v_later uuid;
  v_out text := '';
  v_fail int := 0;
  v_n int;
  v_text text;
  v_on date;
  v_until timestamptz;
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
BEGIN
  -- The listings organisation (ruling A), and an organiser who acts for an
  -- ordinary organisation as a member.
  SELECT id, owner_id INTO v_listings, v_owner FROM public.organisations WHERE slug = 'eventlinqs-listings';
  IF v_listings IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no listings organisation on this database'; END IF;
  SELECT m.organisation_id, m.user_id INTO v_org, v_member
    FROM public.organisation_members m
   WHERE m.role::text IN ('owner', 'admin', 'manager') AND m.organisation_id <> v_listings
   ORDER BY m.organisation_id LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no organisation member to act as on this database'; END IF;
  SELECT id INTO v_cat FROM public.event_categories WHERE is_active ORDER BY slug LIMIT 1;
  SELECT cover_image_url INTO v_cover FROM public.events WHERE status = 'published' AND cover_image_url IS NOT NULL LIMIT 1;

  -- As the owner of the schema: an EventLinqs host, two nights (one active,
  -- one removed), one occurrence of the active night, and the organiser's own
  -- draft event and venue.
  INSERT INTO public.venues (organisation_id, name, address, slug, suburb, city_slug, published_email, listing_source, is_active)
  VALUES (v_listings, 'Proof Hall ' || v_stamp, '1 Proof Street', 'proof-hall-' || v_stamp, 'Fitzroy', 'melbourne',
          'hello@proof-hall.example.com', 'eventlinqs', true)
  RETURNING id INTO v_venue;
  INSERT INTO public.event_series (venue_id, organisation_id, name, category_id, rule, anchor_date, day, starts_at, ends_at,
                                   timezone, summary, listing_source, status)
  VALUES (v_venue, v_listings, 'Proof Night ' || v_stamp, v_cat, 'weekly', current_date + 7,
          extract(dow from current_date + 7)::int2, '19:00', '22:00', 'Australia/Melbourne', 'A proof night.', 'eventlinqs', 'active')
  RETURNING id INTO v_active;
  INSERT INTO public.event_series (venue_id, organisation_id, name, category_id, rule, anchor_date, day, starts_at, ends_at,
                                   timezone, summary, listing_source, status)
  VALUES (v_venue, v_listings, 'Proof Night removed ' || v_stamp, v_cat, 'once', current_date + 8,
          extract(dow from current_date + 8)::int2, '19:00', '22:00', 'Australia/Melbourne', 'A removed night.', 'eventlinqs', 'removed')
  RETURNING id INTO v_removed;
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone, event_type,
                             entry_mode, listing_source, venue_name, status, visibility, published_at, cover_image_url,
                             listing_series_id, occurrence_date)
  VALUES (v_listings, v_owner, 'Proof Night ' || v_stamp, 'proof-night-' || v_stamp,
          (current_date + 7)::timestamp AT TIME ZONE 'Australia/Melbourne' + interval '19 hours',
          (current_date + 7)::timestamp AT TIME ZONE 'Australia/Melbourne' + interval '22 hours',
          'Australia/Melbourne', 'in_person', 'walk_in', 'eventlinqs', 'Proof Hall', 'published', 'public', now(), v_cover,
          v_active, current_date + 7)
  RETURNING id INTO v_occurrence;
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone, event_type,
                             venue_name, status, visibility)
  VALUES (v_org, v_member, 'Organiser proof draft ' || v_stamp, 'organiser-proof-draft-' || v_stamp,
          now() + interval '20 days', now() + interval '20 days 3 hours', 'Australia/Melbourne', 'in_person',
          'Own Hall', 'draft', 'public')
  RETURNING id INTO v_own_event;
  INSERT INTO public.venues (organisation_id, name, address, is_active)
  VALUES (v_org, 'Own Hall ' || v_stamp, '2 Proof Street', true)
  RETURNING id INTO v_own_venue;

  -- ---------------------------------------------------------------- anon --
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_series WHERE id IN (v_active, v_removed);
    IF v_n = 1 THEN v_out := v_out || ' | A1 anon reads the active night and not the removed one: PASS';
    ELSE v_out := v_out || ' | A1 anon nights read: FAIL (' || v_n || ' rows, expected 1)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A1 anon nights read: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    INSERT INTO public.event_series (venue_id, organisation_id, name, rule, anchor_date, day, starts_at, timezone, summary)
    VALUES (v_venue, v_listings, 'anon night', 'once', current_date, extract(dow from current_date)::int2, '19:00', 'Australia/Melbourne', 'x');
    v_out := v_out || ' | A2 anon write a night refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A2 anon write a night refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.listing_checks;
    v_out := v_out || ' | A3 anon read checks refused: FAIL (read ' || v_n || ')'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A3 anon read checks refused: PASS';
  END;
  BEGIN
    SELECT slug INTO v_text FROM public.venues WHERE id = v_venue;
    IF v_text = 'proof-hall-' || v_stamp THEN v_out := v_out || ' | A4 anon reads a host''s public columns: PASS';
    ELSE v_out := v_out || ' | A4 anon venue slug read: FAIL (' || coalesce(v_text, 'no row') || ')'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A4 anon venue slug read: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    SELECT published_email INTO v_text FROM public.venues WHERE id = v_venue;
    v_out := v_out || ' | A5 anon read a published email refused: FAIL (read)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A5 anon read a published email refused: PASS';
  END;
  RESET ROLE;

  -- ------------------------------------------------- signed-in stranger --
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  PERFORM set_config('request.jwt.claim.sub', (current_setting('request.jwt.claims')::jsonb ->> 'sub'), true);
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_series WHERE id IN (v_active, v_removed);
    IF v_n = 1 THEN v_out := v_out || ' | S1 a stranger reads the active night and not the removed one: PASS';
    ELSE v_out := v_out || ' | S1 stranger nights read: FAIL (' || v_n || ' rows, expected 1)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S1 stranger nights read: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    UPDATE public.event_series SET name = 'taken' WHERE id = v_active;
    v_out := v_out || ' | S2 stranger change a night refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S2 stranger change a night refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.listing_checks;
    v_out := v_out || ' | S3 stranger read checks refused: FAIL (read ' || v_n || ')'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S3 stranger read checks refused: PASS';
  END;
  BEGIN
    SELECT published_email INTO v_text FROM public.venues WHERE id = v_venue;
    v_out := v_out || ' | S4 stranger read a published email refused: FAIL (read)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S4 stranger read a published email refused: PASS';
  END;
  RESET ROLE;

  -- -------------------------------------------------------- organiser --
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_member)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  BEGIN
    UPDATE public.events SET title = 'Organiser proof draft, renamed' WHERE id = v_own_event;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN v_out := v_out || ' | O1 the organiser still edits their own event: PASS';
    ELSE v_out := v_out || ' | O1 organiser own edit: FAIL (' || v_n || ' rows)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O1 organiser own edit: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    UPDATE public.events SET listing_source = 'eventlinqs' WHERE id = v_own_event;
    v_out := v_out || ' | O2 organiser marks their own event listed by EventLinqs refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O2 organiser marks their own event listed by EventLinqs refused: PASS';
  END;
  BEGIN
    UPDATE public.events SET listing_series_id = v_active, occurrence_date = current_date + 14 WHERE id = v_own_event;
    v_out := v_out || ' | O3 organiser takes a date of an EventLinqs night refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O3 organiser takes a date of an EventLinqs night refused: PASS';
  END;
  BEGIN
    UPDATE public.events SET listing_fresh_until = now() + interval '1 year' WHERE id = v_own_event;
    v_out := v_out || ' | O4 organiser sets a freshness refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O4 organiser sets a freshness refused: PASS';
  END;
  BEGIN
    UPDATE public.venues SET slug = 'proof-hall-' || v_stamp || '-taken' WHERE id = v_own_venue;
    v_out := v_out || ' | O5 organiser sets a venue slug refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O5 organiser sets a venue slug refused: PASS';
  END;
  BEGIN
    UPDATE public.venues SET claimed_at = now() WHERE id = v_own_venue;
    v_out := v_out || ' | O6 organiser marks their venue claimed refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O6 organiser marks their venue claimed refused: PASS';
  END;
  RESET ROLE;

  -- ----------------------------------------------------- service role --
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    UPDATE public.event_series SET summary = 'A proof night, checked.' WHERE id = v_active;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN v_out := v_out || ' | V1 service role changes a night: PASS';
    ELSE v_out := v_out || ' | V1 service role night change: FAIL (' || v_n || ' rows)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V1 service role night change: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    INSERT INTO public.listing_checks (series_id, source_url, source_date, import_file, outcome)
    VALUES (v_active, 'https://example.com/proof', current_date - 3, 'wi2-grants-proof', 'confirmed');
    SELECT last_checked_on INTO v_on FROM public.event_series WHERE id = v_active;
    SELECT listing_fresh_until INTO v_until FROM public.events WHERE id = v_occurrence;
    IF v_on = current_date - 3 AND v_until = ((current_date - 3 + 22)::timestamp AT TIME ZONE 'Australia/Melbourne') THEN
      v_out := v_out || ' | V2 a check records its day on the night and the 21-day freshness on its occurrence: PASS';
    ELSE
      v_out := v_out || ' | V2 check freshness: FAIL (night ' || coalesce(v_on::text, 'null') || ', occurrence ' || coalesce(v_until::text, 'null') || ')'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V2 service role records a check: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  RESET ROLE;
  -- An occurrence written after the check takes the same freshness at once.
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone, event_type,
                             entry_mode, listing_source, venue_name, status, visibility, listing_series_id, occurrence_date)
  VALUES (v_listings, v_owner, 'Proof Night later ' || v_stamp, 'proof-night-later-' || v_stamp,
          (current_date + 14)::timestamp AT TIME ZONE 'Australia/Melbourne' + interval '19 hours',
          (current_date + 14)::timestamp AT TIME ZONE 'Australia/Melbourne' + interval '22 hours',
          'Australia/Melbourne', 'in_person', 'walk_in', 'eventlinqs', 'Proof Hall', 'draft', 'public', v_active, current_date + 14)
  RETURNING id, listing_fresh_until INTO v_later, v_until;
  IF v_until = ((current_date - 3 + 22)::timestamp AT TIME ZONE 'Australia/Melbourne') THEN
    v_out := v_out || ' | V3 an occurrence written after the check takes its freshness at once: PASS';
  ELSE
    v_out := v_out || ' | V3 later occurrence freshness: FAIL (' || coalesce(v_until::text, 'null') || ')'; v_fail := v_fail + 1;
  END IF;
  SET LOCAL ROLE service_role;
  BEGIN
    DELETE FROM public.event_series WHERE id = v_removed;
    v_out := v_out || ' | V4 service role holds no DELETE on nights (removal is a status): FAIL (deleted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V4 service role holds no DELETE on nights (removal is a status): PASS';
  END;
  BEGIN
    UPDATE public.listing_checks SET outcome = 'changed' WHERE series_id = v_active;
    v_out := v_out || ' | V5 service role cannot rewrite a check (append only): FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V5 service role cannot rewrite a check (append only): PASS';
  END;
  BEGIN
    DELETE FROM public.listing_checks WHERE series_id = v_active;
    v_out := v_out || ' | V6 service role cannot delete a check: FAIL (deleted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V6 service role cannot delete a check: PASS';
  END;
  BEGIN
    TRUNCATE public.listing_checks;
    v_out := v_out || ' | V7 service role holds no TRUNCATE: FAIL (truncated)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V7 service role holds no TRUNCATE: PASS';
  END;
  RESET ROLE;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
