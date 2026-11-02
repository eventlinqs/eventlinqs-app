-- THE GROWTH DATABASE PROOF, V3 ITEM 2: 20261101060001_growth_database.sql, as the roles and rules themselves.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found.
DO $proof$
DECLARE
  v_org uuid;
  v_opp uuid;
  v_n int;
  v_before timestamptz;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT id INTO v_org FROM public.organisers LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no organiser on this database'; END IF;

  -- G1 an opportunity is kept with its source, and its insert is in the audit trail.
  INSERT INTO public.conversion_opportunities (organiser_id, city_slug, who_first, source, source_ref)
  VALUES (v_org, 'geelong', 'community_paid_organiser', 'manual', 'proof') RETURNING id, updated_at INTO v_opp, v_before;
  SELECT count(*) INTO v_n FROM public.conversion_opportunity_changes WHERE opportunity_id = v_opp AND action = 'insert';
  IF v_n = 1 THEN v_out := v_out || ' | G1 kept, its insert audited: PASS';
  ELSE v_out := v_out || ' | G1 insert audit rows ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- G2 a second open opportunity for the same organiser is refused.
  BEGIN
    INSERT INTO public.conversion_opportunities (organiser_id, city_slug, who_first, source)
    VALUES (v_org, 'melbourne', 'ticketed_venue', 'manual');
    v_out := v_out || ' | G2 a second open opportunity was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN v_out := v_out || ' | G2 one open opportunity per organiser: PASS'; END;

  -- G3 closing it must say why; the change is audited with the old and new rows.
  BEGIN
    UPDATE public.conversion_opportunities SET state = 'won' WHERE id = v_opp;
    v_out := v_out || ' | G3 closed without a reason: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | G3 a close without a reason is refused: PASS'; END;
  PERFORM pg_sleep(0.01);
  UPDATE public.conversion_opportunities SET state = 'won', closed_reason = 'first sale through EventLinqs' WHERE id = v_opp;
  SELECT count(*) INTO v_n FROM public.conversion_opportunity_changes
   WHERE opportunity_id = v_opp AND action = 'update' AND old_row ->> 'state' = 'open' AND new_row ->> 'state' = 'won';
  IF v_n = 1 THEN v_out := v_out || ' | G4 the change audited, old and new: PASS';
  ELSE v_out := v_out || ' | G4 update audit rows ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- G5 the audit trail is append only.
  BEGIN
    DELETE FROM public.conversion_opportunity_changes WHERE opportunity_id = v_opp;
    v_out := v_out || ' | G5 an audit row was deleted: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN v_out := v_out || ' | G5 the audit trail is append only: PASS'; END;

  -- G6 a sale is an EventLinqs order, never an event row or an outside click; a claim step is a claim.
  BEGIN
    INSERT INTO public.ticketing_activations (organiser_id, opportunity_id, step, proved_by, proof_id, source)
    VALUES (v_org, v_opp, 'first_sale', 'events', 'proof', 'admin');
    v_out := v_out || ' | G6 a sale proved by an event row was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | G6 a sale is only an order: PASS'; END;
  BEGIN
    INSERT INTO public.ticketing_activations (organiser_id, opportunity_id, step, proved_by, proof_id, source)
    VALUES (v_org, v_opp, 'claim_verified', 'organisations', 'proof', 'admin');
    v_out := v_out || ' | G7 a claim step proved by no claim was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | G7 a claim step is only a claim: PASS'; END;

  -- G8 a step is recorded once, and the steps are append only.
  INSERT INTO public.ticketing_activations (organiser_id, opportunity_id, step, proved_by, proof_id, source)
  VALUES (v_org, v_opp, 'organisation', 'organisations', 'proof', 'admin');
  BEGIN
    INSERT INTO public.ticketing_activations (organiser_id, opportunity_id, step, proved_by, proof_id, source)
    VALUES (v_org, v_opp, 'organisation', 'organisations', 'proof-again', 'admin');
    v_out := v_out || ' | G8 a step was recorded twice: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN v_out := v_out || ' | G8 a step is recorded once: PASS'; END;
  BEGIN
    UPDATE public.ticketing_activations SET source = 'webhook' WHERE organiser_id = v_org;
    v_out := v_out || ' | G9 a step was changed: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN v_out := v_out || ' | G9 the steps are append only: PASS'; END;

  -- G10 no signed out visitor and no signed in user reaches any of the three.
  IF has_table_privilege('anon', 'public.conversion_opportunities', 'SELECT')
     OR has_table_privilege('authenticated', 'public.conversion_opportunities', 'SELECT')
     OR has_table_privilege('anon', 'public.ticketing_activations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ticketing_activations', 'SELECT')
     OR has_table_privilege('anon', 'public.conversion_opportunity_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.conversion_opportunity_changes', 'SELECT') THEN
    v_out := v_out || ' | G10 a growth table is readable outside the service role: FAIL'; v_fail := v_fail + 1;
  ELSE v_out := v_out || ' | G10 service role only: PASS'; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
