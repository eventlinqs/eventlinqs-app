-- COLLABORATORS, THE PROOF: a venue joins an event another organisation runs, as the roles themselves.
--
-- supabase/migrations/20261027150101_event_collaborators.sql makes event_collaborators, its three rules, the
-- collaborator tag on share_links, the row security and the grants (item 15 of the locked plan of 27 October
-- 2026; docs/walk-in/COLLABORATORS-DECISION.md). This proves each, on rows TEST already holds.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (Supabase's own opt-in to the new default, the
-- table made again from the migration, then this), one transaction; it ends by RAISING its verdict, so TEST is
-- left exactly as it was found. The verdict reads PROOF PASSED or PROOF FAILED, line by line.
DO $proof$
DECLARE
  v_venue uuid;          -- a venue its own people hold
  v_x uuid;              -- the venue's organisation
  v_x_owner uuid;
  v_y uuid;              -- another organisation, running two events
  v_y_owner uuid;
  v_e1 uuid;
  v_e2 uuid;
  v_ex uuid;             -- an event the venue's own organisation runs, or null
  v_z_owner uuid;        -- somebody owning neither
  v_listed uuid;         -- a listed venue nobody has claimed, or null
  v_listed_org uuid;
  v_r1 uuid;
  v_r2 uuid;
  v_link uuid;
  v_n int;
  v_out text := '';
  v_fail int := 0;
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
BEGIN
  SELECT v.id, v.organisation_id, o.owner_id INTO v_venue, v_x, v_x_owner
    FROM public.venues v JOIN public.organisations o ON o.id = v.organisation_id
   WHERE (v.listing_source = 'organiser' OR v.claimed_at IS NOT NULL) AND o.owner_id IS NOT NULL
   ORDER BY v.created_at LIMIT 1;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no venue its own people hold on this database'; END IF;

  SELECT e.organisation_id, o.owner_id INTO v_y, v_y_owner
    FROM public.events e JOIN public.organisations o ON o.id = e.organisation_id
   WHERE e.organisation_id <> v_x AND o.owner_id IS NOT NULL AND o.owner_id <> v_x_owner
   GROUP BY e.organisation_id, o.owner_id HAVING count(*) >= 2 LIMIT 1;
  IF v_y IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no second organisation with two events on this database'; END IF;
  SELECT id INTO v_e1 FROM public.events WHERE organisation_id = v_y ORDER BY created_at LIMIT 1;
  SELECT id INTO v_e2 FROM public.events WHERE organisation_id = v_y AND id <> v_e1 ORDER BY created_at LIMIT 1;
  SELECT id INTO v_ex FROM public.events WHERE organisation_id = v_x LIMIT 1;
  SELECT owner_id INTO v_z_owner FROM public.organisations
   WHERE owner_id IS NOT NULL AND owner_id NOT IN (v_x_owner, v_y_owner) LIMIT 1;
  SELECT v.id, v.organisation_id INTO v_listed, v_listed_org FROM public.venues v
   WHERE v.listing_source = 'eventlinqs' AND v.claimed_at IS NULL AND v.organisation_id <> v_y LIMIT 1;

  -- C1. A venue joins for the organisation that owns it, on another's event.
  INSERT INTO public.event_collaborators (event_id, organisation_id, venue_id, asked_by)
  VALUES (v_e1, v_x, v_venue, v_y_owner) RETURNING id INTO v_r1;
  v_out := v_out || ' | C1 the venue''s own organisation is asked on another''s event: PASS';

  -- C2. Named for an organisation that does not own the venue: refused.
  BEGIN
    INSERT INTO public.event_collaborators (event_id, organisation_id, venue_id) VALUES (v_e2, v_y, v_venue);
    v_out := v_out || ' | C2 another organisation named for the venue: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'a venue joins only for the organisation that owns it%' THEN v_out := v_out || ' | C2 another organisation named for the venue, refused: PASS';
    ELSE v_out := v_out || ' | C2 refused for the wrong reason: ' || SQLERRM || ': FAIL'; v_fail := v_fail + 1; END IF;
  END;

  -- C3. On the venue's own organisation's event: refused.
  IF v_ex IS NULL THEN
    v_out := v_out || ' | C3 SKIPPED: the venue''s organisation runs no event on this database';
  ELSE
    BEGIN
      INSERT INTO public.event_collaborators (event_id, organisation_id, venue_id) VALUES (v_ex, v_x, v_venue);
      v_out := v_out || ' | C3 collaborating on its own event: FAIL (accepted)'; v_fail := v_fail + 1;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'an organisation does not collaborate on its own event%' THEN v_out := v_out || ' | C3 its own event, refused: PASS';
      ELSE v_out := v_out || ' | C3 refused for the wrong reason: ' || SQLERRM || ': FAIL'; v_fail := v_fail + 1; END IF;
    END;
  END IF;

  -- C4. A listed venue nobody has claimed: refused.
  IF v_listed IS NULL THEN
    v_out := v_out || ' | C4 SKIPPED: no unclaimed listed venue on this database';
  ELSE
    BEGIN
      INSERT INTO public.event_collaborators (event_id, organisation_id, venue_id) VALUES (v_e2, v_listed_org, v_listed);
      v_out := v_out || ' | C4 an unclaimed listed venue: FAIL (accepted)'; v_fail := v_fail + 1;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'a venue joins only once its own people hold it%' THEN v_out := v_out || ' | C4 an unclaimed listed venue, refused: PASS';
      ELSE v_out := v_out || ' | C4 refused for the wrong reason: ' || SQLERRM || ': FAIL'; v_fail := v_fail + 1; END IF;
    END;
  END IF;

  -- C5. An answer carries its moment, and a joined row is public while an invitation is not.
  BEGIN
    UPDATE public.event_collaborators SET status = 'joined' WHERE id = v_r1;
    v_out := v_out || ' | C5a joined with no moment: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | C5a joined with no moment, refused: PASS'; END;
  UPDATE public.event_collaborators SET status = 'joined', answered_at = now(), answered_by = v_x_owner WHERE id = v_r1;
  INSERT INTO public.event_collaborators (event_id, organisation_id, venue_id, asked_by)
  VALUES (v_e2, v_x, v_venue, v_y_owner) RETURNING id INTO v_r2;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n FROM public.event_collaborators WHERE id IN (v_r1, v_r2);
  RESET ROLE;
  IF v_n = 1 THEN v_out := v_out || ' | C5b a visitor reads the joined row and not the invitation: PASS';
  ELSE v_out := v_out || ' | C5b a visitor reads ' || v_n || ' of the two: FAIL'; v_fail := v_fail + 1; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.event_collaborators (event_id, organisation_id, venue_id) VALUES (v_e2, v_x, v_venue);
    v_out := v_out || ' | C5c a visitor writes a row: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | C5c a visitor writes nothing: PASS'; END;
  RESET ROLE;

  -- C6. The organiser and the venue each read the invitation; somebody else does not.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_y_owner)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.event_collaborators WHERE id = v_r2;
  RESET ROLE;
  IF v_n = 1 THEN v_out := v_out || ' | C6a the event''s organiser reads its invitation: PASS';
  ELSE v_out := v_out || ' | C6a the event''s organiser reads ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_x_owner)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.event_collaborators WHERE id = v_r2;
  RESET ROLE;
  IF v_n = 1 THEN v_out := v_out || ' | C6b the venue reads what it was asked: PASS';
  ELSE v_out := v_out || ' | C6b the venue reads ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  IF v_z_owner IS NULL THEN
    v_out := v_out || ' | C6c SKIPPED: no third organisation owner on this database';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_z_owner)::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.event_collaborators WHERE id = v_r2;
    RESET ROLE;
    IF v_n = 0 THEN v_out := v_out || ' | C6c somebody else reads nothing of it: PASS';
    ELSE v_out := v_out || ' | C6c somebody else reads ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;
  END IF;

  -- C7. A joined venue's own link is tagged to it and the venue reads it; somebody else does not.
  INSERT INTO public.share_links (event_id, channel, code, collaborator_id, created_by)
  VALUES (v_e1, 'instagram', 'bp-proof-collab-' || v_stamp, v_r1, v_x_owner) RETURNING id INTO v_link;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_x_owner)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.share_links WHERE id = v_link;
  RESET ROLE;
  IF v_n = 1 THEN v_out := v_out || ' | C7a the venue reads its own link: PASS';
  ELSE v_out := v_out || ' | C7a the venue reads ' || v_n || ' of its link: FAIL'; v_fail := v_fail + 1; END IF;
  IF v_z_owner IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_z_owner)::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.share_links WHERE id = v_link;
    RESET ROLE;
    IF v_n = 0 THEN v_out := v_out || ' | C7b somebody else reads nothing of it: PASS';
    ELSE v_out := v_out || ' | C7b somebody else reads ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;
  END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
