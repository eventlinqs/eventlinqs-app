-- WI1, THE GRANTS PROOF: each role reaches exactly what its policy serves.
--
-- Lawal, 21 October 2026: "every migration that creates a table in public also
-- grants it in the same migration, to exactly the roles its row security
-- policies serve ... never wider than the policies." And the reversal: "if a
-- fresh TEST reset with the grants shows any role reaching a row its policy
-- should refuse, remove that role's grant and record why."
--
-- Run it through scripts/verify/replay-under-new-default.mjs, which first
-- applies Supabase's own opt-in to the new default (no automatic grants on new
-- public tables, changelog 45329), drops the three WI1 tables and creates them
-- again from 20261021000020_free_walk_in_entry.sql, then runs this. Everything
-- is one transaction and this block ends by RAISING its verdict, so TEST is
-- left exactly as it was found. The verdict reads PROOF PASSED or PROOF FAILED
-- with each line.
--
-- The roles are taken for real (SET LOCAL ROLE), with the request claims the
-- Data API would set, so a row a role reaches here is a row supabase-js would
-- hand it.
DO $proof$
DECLARE
  v_org uuid;
  v_user uuid;
  v_member uuid;
  v_public uuid;
  v_draft uuid;
  v_ended uuid;
  v_rem uuid;
  v_rem_old uuid;
  v_owner uuid;
  v_owner_org uuid;
  v_owned_draft uuid;
  v_out text := '';
  v_fail int := 0;
  v_n int;
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
  v_cover text;
BEGIN
  -- An organiser who acts for their organisation as a member (owner, admin or
  -- manager row). The owner with no membership row is O5's, below.
  SELECT m.organisation_id, m.user_id INTO v_org, v_member
    FROM public.organisation_members m
   WHERE m.role::text IN ('owner', 'admin', 'manager')
   ORDER BY m.organisation_id
   LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: no organisation member to act as on this database';
  END IF;
  v_user := v_member;
  -- A published event needs a real cover (events_published_real_cover): borrow one.
  SELECT cover_image_url INTO v_cover FROM public.events
   WHERE status = 'published' AND cover_image_url IS NOT NULL LIMIT 1;

  -- A published public walk-in event, a walk-in draft of the same organiser,
  -- and a walk-in event that ended 40 days ago (for the retention purge).
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone,
                             event_type, entry_mode, venue_name, status, visibility, published_at, cover_image_url)
  VALUES (v_org, v_user, 'WI1 grants proof public', 'wi1-grants-proof-public-' || v_stamp,
          now() + interval '10 days', now() + interval '12 days', 'Australia/Melbourne',
          'in_person', 'walk_in', 'Proof Hall', 'published', 'public', now(), v_cover)
  RETURNING id INTO v_public;
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone,
                             event_type, entry_mode, venue_name, status, visibility)
  VALUES (v_org, v_user, 'WI1 grants proof draft', 'wi1-grants-proof-draft-' || v_stamp,
          now() + interval '20 days', now() + interval '21 days', 'Australia/Melbourne',
          'in_person', 'walk_in', 'Proof Hall', 'draft', 'unlisted')
  RETURNING id INTO v_draft;
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone,
                             event_type, entry_mode, venue_name, status, visibility, published_at, cover_image_url)
  VALUES (v_org, v_user, 'WI1 grants proof ended', 'wi1-grants-proof-ended-' || v_stamp,
          now() - interval '41 days', now() - interval '40 days', 'Australia/Melbourne',
          'in_person', 'walk_in', 'Proof Hall', 'published', 'unlisted', now() - interval '50 days', v_cover)
  RETURNING id INTO v_ended;

  -- An organiser who owns their organisation by organisations.owner_id ALONE,
  -- with no organisation_members row. "Org members can view their events" lets
  -- them view their own event, so the guide policy must let them read its guide:
  -- the WI1 drive found the edit page blank for one on 22 October, and O1 could
  -- not see it, because O1's organiser is chosen by the narrower member rule.
  SELECT o.id, o.owner_id INTO v_owner_org, v_owner
    FROM public.organisations o
   WHERE o.owner_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.organisation_members m
                      WHERE m.organisation_id = o.id AND m.user_id = o.owner_id)
   ORDER BY o.id
   LIMIT 1;
  IF v_owner_org IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: no organisation owned without a membership row to act as on this database';
  END IF;
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone,
                             event_type, entry_mode, venue_name, status, visibility)
  VALUES (v_owner_org, v_owner, 'WI1 grants proof owner draft', 'wi1-grants-proof-owner-draft-' || v_stamp,
          now() + interval '20 days', now() + interval '21 days', 'Australia/Melbourne',
          'in_person', 'walk_in', 'Proof Hall', 'draft', 'unlisted')
  RETURNING id INTO v_owned_draft;

  INSERT INTO public.event_guides (event_id, days) VALUES (v_public, '[]'::jsonb), (v_draft, '[]'::jsonb), (v_owned_draft, '[]'::jsonb);
  INSERT INTO public.event_reminders (event_id, email, consent_version, consent_text)
  VALUES (v_public, 'wi1-grants-' || v_stamp || '@eventlinqs.test', 'remind-me-v1-2026-10-21', 'proof')
  RETURNING id INTO v_rem;
  INSERT INTO public.event_reminders (event_id, email, consent_version, consent_text)
  VALUES (v_ended, 'wi1-grants-old-' || v_stamp || '@eventlinqs.test', 'remind-me-v1-2026-10-21', 'proof')
  RETURNING id INTO v_rem_old;
  INSERT INTO public.event_reminder_sends (reminder_id, kind, sent_at) VALUES (v_rem_old, 'day_before', now() - interval '41 days');

  -- ---------------------------------------------------------------------
  -- ANON: a signed-out visitor through the anon key.
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- A read the policies serve is caught too, so a red run (no grants) reports
  -- every role it refuses instead of stopping at the first.
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_guides WHERE event_id IN (v_public, v_draft);
    IF v_n = 1 THEN v_out := v_out || ' | A1 anon reads the published public guide and not the draft: PASS';
    ELSE v_out := v_out || ' | A1 anon guides read: FAIL (' || v_n || ' rows, expected 1)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A1 anon guides read: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;

  BEGIN
    INSERT INTO public.event_guides (event_id) VALUES (v_ended);
    v_out := v_out || ' | A2 anon insert guide refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A2 anon insert guide refused: PASS';
  END;
  BEGIN
    UPDATE public.event_guides SET program_note = 'anon' WHERE event_id = v_public;
    v_out := v_out || ' | A3 anon update guide refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A3 anon update guide refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_reminders;
    v_out := v_out || ' | A4 anon read reminders refused: FAIL (read ' || v_n || ')'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A4 anon read reminders refused: PASS';
  END;
  BEGIN
    INSERT INTO public.event_reminders (event_id, email, consent_version, consent_text)
    VALUES (v_public, 'anon-' || v_stamp || '@eventlinqs.test', 'x', 'x');
    v_out := v_out || ' | A5 anon write reminder refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A5 anon write reminder refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_reminder_sends;
    v_out := v_out || ' | A6 anon read sends refused: FAIL (read ' || v_n || ')'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A6 anon read sends refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.walk_in_reminders_due('program', NULL, 10, now(), 9);
    v_out := v_out || ' | A7 anon run the due list refused: FAIL (ran)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | A7 anon run the due list refused: PASS';
  END;
  RESET ROLE;

  -- ---------------------------------------------------------------------
  -- AUTHENTICATED, A STRANGER: signed in, member of nothing here.
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  PERFORM set_config('request.jwt.claim.sub', (current_setting('request.jwt.claims')::jsonb ->> 'sub'), true);

  BEGIN
    SELECT count(*) INTO v_n FROM public.event_guides WHERE event_id IN (v_public, v_draft);
    IF v_n = 1 THEN v_out := v_out || ' | S1 a signed-in stranger reads the public guide and not the draft: PASS';
    ELSE v_out := v_out || ' | S1 stranger guides read: FAIL (' || v_n || ' rows, expected 1)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S1 stranger guides read: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    INSERT INTO public.event_guides (event_id) VALUES (v_ended);
    v_out := v_out || ' | S2 stranger insert guide refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S2 stranger insert guide refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_reminders;
    v_out := v_out || ' | S3 stranger read reminders refused: FAIL (read ' || v_n || ')'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S3 stranger read reminders refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_reminder_sends;
    v_out := v_out || ' | S4 stranger read sends refused: FAIL (read ' || v_n || ')'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | S4 stranger read sends refused: PASS';
  END;
  RESET ROLE;

  -- ---------------------------------------------------------------------
  -- AUTHENTICATED, THE ORGANISER: reads its own draft guide, writes nothing.
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_member)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);

  BEGIN
    SELECT count(*) INTO v_n FROM public.event_guides WHERE event_id IN (v_public, v_draft);
    IF v_n = 2 THEN v_out := v_out || ' | O1 the organiser reads its own draft guide too: PASS';
    ELSE v_out := v_out || ' | O1 organiser guides read: FAIL (' || v_n || ' rows, expected 2)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O1 organiser guides read: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    UPDATE public.event_guides SET program_note = 'organiser' WHERE event_id = v_draft;
    v_out := v_out || ' | O2 organiser direct update refused (the action writes): FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O2 organiser direct update refused (the action writes): PASS';
  END;
  BEGIN
    DELETE FROM public.event_guides WHERE event_id = v_draft;
    v_out := v_out || ' | O3 organiser delete refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O3 organiser delete refused: PASS';
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_reminders WHERE event_id = v_public;
    v_out := v_out || ' | O4 organiser read of their Remind me list refused (numbers come from the server): FAIL (read ' || v_n || ')'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O4 organiser read of their Remind me list refused (numbers come from the server): PASS';
  END;
  RESET ROLE;

  -- ---------------------------------------------------------------------
  -- AUTHENTICATED, AN OWNER WITH NO MEMBERSHIP ROW: reads its own draft guide.
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_owner)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  BEGIN
    SELECT count(*) INTO v_n FROM public.event_guides WHERE event_id = v_owned_draft;
    IF v_n = 1 THEN v_out := v_out || ' | O5 an owner with no membership row reads its own draft guide, as it views the event: PASS';
    ELSE v_out := v_out || ' | O5 owner without a membership row reads its draft guide: FAIL (' || v_n || ' rows, expected 1)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | O5 owner without a membership row reads its draft guide: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  RESET ROLE;

  -- ---------------------------------------------------------------------
  -- SERVICE ROLE: every server job, and nothing it does not do.
  -- ---------------------------------------------------------------------
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  BEGIN
    SELECT count(*) INTO v_n FROM public.event_guides WHERE event_id IN (v_public, v_draft);
    IF v_n = 2 THEN v_out := v_out || ' | V1 service role reads every guide (publish gate, scheduled run, emails): PASS';
    ELSE v_out := v_out || ' | V1 service role guides read: FAIL (' || v_n || ' rows)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V1 service role guides read: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    INSERT INTO public.event_guides (event_id, days) VALUES (v_ended, '[]'::jsonb)
      ON CONFLICT (event_id) DO UPDATE SET days = excluded.days;
    UPDATE public.event_guides SET program_published_at = now() WHERE event_id = v_public;
    v_out := v_out || ' | V2 service role saves a guide and publishes the program (upsert, update): PASS';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | V2 service role save guide: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    DELETE FROM public.event_guides WHERE event_id = v_ended;
    v_out := v_out || ' | V3 service role holds no DELETE on guides (no path deletes one): FAIL (deleted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V3 service role holds no DELETE on guides (no path deletes one): PASS';
  END;
  BEGIN
    INSERT INTO public.event_reminders (event_id, email, consent_version, consent_text)
    VALUES (v_public, 'wi1-grants-' || v_stamp || '@eventlinqs.test', 'remind-me-v1-2026-10-21', 'proof')
      ON CONFLICT (event_id, email) DO NOTHING;
    UPDATE public.event_reminders SET unsubscribed_at = now() WHERE id = v_rem;
    UPDATE public.event_reminders SET unsubscribed_at = NULL, requested_at = now() WHERE id = v_rem;
    SELECT count(*) INTO v_n FROM public.event_reminders WHERE event_id = v_public;
    v_out := v_out || ' | V4 service role asks, stops and restarts a reminder: PASS';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | V4 service role reminders: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    INSERT INTO public.event_reminder_sends (reminder_id, kind) VALUES (v_rem, 'program');
    UPDATE public.event_reminder_sends SET sent_at = now(), provider_message_id = 'proof' WHERE reminder_id = v_rem AND kind = 'program';
    v_out := v_out || ' | V5 service role claims a send and records it: PASS';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | V5 service role sends: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.walk_in_reminders_due('day_before', NULL, 10, now(), 9);
    SELECT count(*) INTO v_n FROM public.walk_in_reminders_due('program', v_public, 10, now(), 9);
    v_out := v_out || ' | V6 service role runs the due list, both kinds: PASS';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | V6 service role due list: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    SELECT public.purge_walk_in_reminders(30) INTO v_n;
    IF v_n >= 1 AND NOT EXISTS (SELECT 1 FROM public.event_reminders WHERE id = v_rem_old)
       AND NOT EXISTS (SELECT 1 FROM public.event_reminder_sends WHERE reminder_id = v_rem_old) THEN
      v_out := v_out || ' | V7 service role purges an ended event''s reminders and their sends go with them: PASS';
    ELSE
      v_out := v_out || ' | V7 purge: FAIL (' || v_n || ' purged, old row or its send left)'; v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | V7 purge: FAIL (' || SQLERRM || ')'; v_fail := v_fail + 1;
  END;
  BEGIN
    DELETE FROM public.event_reminder_sends WHERE reminder_id = v_rem;
    v_out := v_out || ' | V8 service role holds no DELETE on sends: FAIL (deleted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V8 service role holds no DELETE on sends: PASS';
  END;
  BEGIN
    TRUNCATE public.event_reminders CASCADE;
    v_out := v_out || ' | V9 service role holds no TRUNCATE: FAIL (truncated)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | V9 service role holds no TRUNCATE: PASS';
  END;
  RESET ROLE;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
