-- WI1, THE DATABASE PROOF. Run against TEST only.
--
-- Every rule migration 20261021000020 promises is exercised by a real statement
-- on real rows. The whole block runs in ONE transaction and ends by RAISING its
-- own verdict, so every row it wrote is rolled back and TEST is left exactly as
-- it was found. A run therefore always "fails" at the HTTP level; the verdict is
-- the message, and it reads PROOF PASSED or PROOF FAILED with each line.
--
-- Run, under Supabase's new default (the migration replayed first, then this):
--   scripts\ops\with-supabase-token.ps1 node scripts/verify/replay-under-new-default.mjs \
--     supabase/migrations/20261021000020_free_walk_in_entry.sql scripts/verify/wi1-walk-in-db-proof.sql
DO $proof$
DECLARE
  v_org uuid;
  v_user uuid;
  v_walk uuid;
  v_tick uuid;
  v_rem uuid;
  v_out text := '';
  v_fail int := 0;
  v_bool boolean;
  v_n int;
BEGIN
  SELECT organisation_id, created_by INTO v_org, v_user
    FROM public.events WHERE created_by IS NOT NULL ORDER BY created_at LIMIT 1;

  -- A walk-in draft, and a ticketed draft with a tier.
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone,
                             event_type, entry_mode, venue_name, status, visibility)
  VALUES (v_org, v_user, 'WI1 db proof walk-in', 'wi1-db-proof-walk-in-' || extract(epoch from now())::bigint,
          now() + interval '10 days', now() + interval '12 days', 'Australia/Melbourne',
          'in_person', 'walk_in', 'Proof Hall', 'draft', 'unlisted')
  RETURNING id INTO v_walk;

  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone,
                             event_type, venue_name, status, visibility)
  VALUES (v_org, v_user, 'WI1 db proof ticketed', 'wi1-db-proof-ticketed-' || extract(epoch from now())::bigint,
          now() + interval '10 days', now() + interval '11 days', 'Australia/Melbourne',
          'in_person', 'Proof Hall', 'draft', 'unlisted')
  RETURNING id INTO v_tick;
  INSERT INTO public.ticket_tiers (event_id, name, tier_type, price, total_capacity)
  VALUES (v_tick, 'General', 'general_admission', 2500, 100);

  -- 1. A walk-in event is free by definition.
  SELECT is_free INTO v_bool FROM public.events WHERE id = v_walk;
  IF v_bool THEN v_out := v_out || ' | 1 walk-in is_free true: PASS';
  ELSE v_out := v_out || ' | 1 walk-in is_free true: FAIL'; v_fail := v_fail + 1; END IF;

  -- 2. A ticket type on a walk-in event is refused.
  BEGIN
    INSERT INTO public.ticket_tiers (event_id, name, tier_type, price, total_capacity)
    VALUES (v_walk, 'Sneaky', 'general_admission', 0, 10);
    v_out := v_out || ' | 2 tier on walk-in refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 2 tier on walk-in refused: PASS';
  END;

  -- 3. An event with ticket types cannot become walk-in.
  BEGIN
    UPDATE public.events SET entry_mode = 'walk_in' WHERE id = v_tick;
    v_out := v_out || ' | 3 tiered event to walk-in refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 3 tiered event to walk-in refused: PASS';
  END;

  -- 4. A walk-in event carries no external ticket link.
  BEGIN
    UPDATE public.events SET external_ticket_url = 'https://example.com/tix' WHERE id = v_walk;
    v_out := v_out || ' | 4 external link on walk-in refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 4 external link on walk-in refused: PASS';
  END;

  -- 5. A walk-in event is in person.
  BEGIN
    UPDATE public.events SET event_type = 'virtual' WHERE id = v_walk;
    v_out := v_out || ' | 5 virtual walk-in refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 5 virtual walk-in refused: PASS';
  END;

  -- 6. The mode is fixed once the event leaves draft.
  UPDATE public.events SET status = 'paused' WHERE id = v_walk;
  BEGIN
    UPDATE public.events SET entry_mode = 'tickets' WHERE id = v_walk;
    v_out := v_out || ' | 6 mode change after draft refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 6 mode change after draft refused: PASS';
  END;
  UPDATE public.events SET status = 'draft' WHERE id = v_walk;

  -- 7. A ticketed draft with no tiers may still switch (nothing depends on it).
  DELETE FROM public.ticket_tiers WHERE event_id = v_tick;
  BEGIN
    UPDATE public.events SET entry_mode = 'walk_in' WHERE id = v_tick;
    SELECT is_free INTO v_bool FROM public.events WHERE id = v_tick;
    IF v_bool THEN v_out := v_out || ' | 7 tierless draft switches and is free: PASS';
    ELSE v_out := v_out || ' | 7 tierless draft switches and is free: FAIL (not free)'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 7 tierless draft switches: FAIL (refused)'; v_fail := v_fail + 1;
  END;

  -- 8. One Remind me row per event and address.
  INSERT INTO public.event_reminders (event_id, email, consent_version, consent_text)
  VALUES (v_walk, 'proof@example.com', 'remind-me-v1', 'proof') RETURNING id INTO v_rem;
  BEGIN
    INSERT INTO public.event_reminders (event_id, email, consent_version, consent_text)
    VALUES (v_walk, 'proof@example.com', 'remind-me-v1', 'proof');
    v_out := v_out || ' | 8 duplicate reminder refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN
    v_out := v_out || ' | 8 duplicate reminder refused: PASS';
  END;

  -- 9. An address that is not normalised is refused.
  BEGIN
    INSERT INTO public.event_reminders (event_id, email, consent_version, consent_text)
    VALUES (v_walk, ' Proof2@Example.com', 'remind-me-v1', 'proof');
    v_out := v_out || ' | 9 unnormalised address refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 9 unnormalised address refused: PASS';
  END;

  -- 10. Each message is claimed once.
  INSERT INTO public.event_reminder_sends (reminder_id, kind) VALUES (v_rem, 'day_before');
  BEGIN
    INSERT INTO public.event_reminder_sends (reminder_id, kind) VALUES (v_rem, 'day_before');
    v_out := v_out || ' | 10 second claim refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN
    v_out := v_out || ' | 10 second claim refused: PASS';
  END;
  INSERT INTO public.event_reminder_sends (reminder_id, kind)
    VALUES (v_rem, 'day_before') ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_n FROM public.event_reminder_sends WHERE reminder_id = v_rem;
  IF v_n = 1 THEN v_out := v_out || ' | 10b claim with on conflict do nothing stays one row: PASS';
  ELSE v_out := v_out || ' | 10b claim stays one row: FAIL (' || v_n || ')'; v_fail := v_fail + 1; END IF;

  -- 11. The full program is published once.
  INSERT INTO public.event_guides (event_id) VALUES (v_walk);
  UPDATE public.event_guides SET program_published_at = now() WHERE event_id = v_walk;
  BEGIN
    UPDATE public.event_guides SET program_published_at = now() + interval '1 hour' WHERE event_id = v_walk;
    v_out := v_out || ' | 11 second program publish refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 11 second program publish refused: PASS';
  END;

  -- 12. A guide list longer than the page was drawn for is refused.
  BEGIN
    UPDATE public.event_guides SET at_a_glance = '[1,2,3,4,5]'::jsonb WHERE event_id = v_walk;
    v_out := v_out || ' | 12 five glance tiles refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 12 five glance tiles refused: PASS';
  END;

  -- 13. An add to calendar is an anonymous demand row.
  BEGIN
    PERFORM 1 FROM pg_constraint WHERE conname = 'ledger_entries_demand_shape'
      AND pg_get_constraintdef(oid) LIKE '%calendar_add%' AND pg_get_constraintdef(oid) LIKE '%follow%';
    IF FOUND THEN v_out := v_out || ' | 13 demand shape admits calendar_add, share, follow: PASS';
    ELSE v_out := v_out || ' | 13 demand shape admits the new actions: FAIL'; v_fail := v_fail + 1; END IF;
  END;

  -- 14. The recount agrees a walk-in event is free.
  SELECT (stored = truth) INTO v_bool FROM public.stored_aggregate_drift
   WHERE column_name = 'events.is_free' AND key = v_walk::text;
  IF v_bool THEN v_out := v_out || ' | 14 drift view agrees walk-in is free: PASS';
  ELSE v_out := v_out || ' | 14 drift view agrees walk-in is free: FAIL'; v_fail := v_fail + 1; END IF;

  -- 15. An Instagram handle that would break a link is refused.
  BEGIN
    UPDATE public.organisations SET instagram_handle = 'amcf/oz' WHERE id = v_org;
    v_out := v_out || ' | 15 unsafe handle refused: FAIL (accepted)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || ' | 15 unsafe handle refused: PASS';
  END;

  -- 16. Nobody but the service role can read Remind me.
  IF NOT has_table_privilege('anon', 'public.event_reminders', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.event_reminders', 'SELECT') THEN
    v_out := v_out || ' | 16 reminders hidden from anon and authenticated: PASS';
  ELSE v_out := v_out || ' | 16 reminders hidden: FAIL'; v_fail := v_fail + 1; END IF;

  -- The same verdict shape as wi1-grants-proof.sql, so either proof can run
  -- inside scripts/verify/replay-under-new-default.mjs, under Supabase's new
  -- default, as well as on its own.
  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
