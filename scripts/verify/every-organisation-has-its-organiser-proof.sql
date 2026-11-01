-- THE PROOF FOR 20261101132001_every_organisation_has_its_organiser.sql, as the database itself.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. Red against an empty migration: O1 and O3 fail, and O5 cannot find the function.
DO $proof$
DECLARE
  v_owner uuid;
  v_org uuid;
  v_org2 uuid;
  v_found uuid;
  v_n int;
  v_state text;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT id INTO v_owner FROM public.profiles LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no profile on this database'; END IF;

  -- O1 a new organisation gets its one organiser, linked, owned by its account, its state derived from the link.
  INSERT INTO public.organisations (name, owner_id, slug)
  VALUES ('Proof Organisation Gets Its Organiser', v_owner, 'proof-organisation-gets-its-organiser') RETURNING id INTO v_org;
  SELECT count(*), max(acquisition_state) INTO v_n, v_state FROM public.organisers
   WHERE organisation_id = v_org AND created_by = v_owner AND name = 'Proof Organisation Gets Its Organiser';
  IF v_n = 1 AND v_state IS DISTINCT FROM 'discovered' THEN
    v_out := v_out || ' | O1 a new organisation gets its one organiser (state ' || v_state || '): PASS';
  ELSE v_out := v_out || ' | O1 organiser rows ' || v_n || ', state ' || coalesce(v_state, 'none') || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- O2 a name already held by a host we found is never linked by name, and the found host is left as it was.
  INSERT INTO public.organisers (name, created_by) VALUES ('Proof Found Host Named Alike', v_owner) RETURNING id INTO v_found;
  INSERT INTO public.organisations (name, owner_id, slug)
  VALUES ('Proof Found Host Named Alike', v_owner, 'proof-found-host-named-alike') RETURNING id INTO v_org2;
  SELECT count(*) INTO v_n FROM public.organisers WHERE organisation_id = v_org2;
  IF v_n = 0 AND (SELECT organisation_id FROM public.organisers WHERE id = v_found) IS NULL THEN
    v_out := v_out || ' | O2 a found host is never linked by name, the sign up still made: PASS';
  ELSE v_out := v_out || ' | O2 linked or duplicated by name: FAIL'; v_fail := v_fail + 1; END IF;

  -- O3 after the backfill, every organisation has its organiser unless its name is held by a host we found.
  SELECT count(*) INTO v_n FROM public.organisations o
   WHERE NOT EXISTS (SELECT 1 FROM public.organisers g WHERE g.organisation_id = o.id)
     AND NOT EXISTS (SELECT 1 FROM public.organisers g WHERE g.name_key = lower(regexp_replace(btrim(o.name), '\s+', ' ', 'g')))
     AND length(btrim(o.name)) BETWEEN 2 AND 200;
  IF v_n = 0 THEN v_out := v_out || ' | O3 every organisation has its organiser, name holders aside: PASS';
  ELSE v_out := v_out || ' | O3 organisations without one ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- O4 an organisation never gets a second organiser: a later change of the organisation writes none, and a second
  -- row naming the same organisation is refused.
  UPDATE public.organisations SET name = 'Proof Organisation Renamed' WHERE id = v_org;
  SELECT count(*) INTO v_n FROM public.organisers WHERE organisation_id = v_org;
  BEGIN
    INSERT INTO public.organisers (name, organisation_id, created_by) VALUES ('Proof Second Row', v_org, v_owner);
    v_out := v_out || ' | O4 a second organiser for one organisation was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN
    IF v_n = 1 THEN v_out := v_out || ' | O4 one organiser per organisation, never a second: PASS';
    ELSE v_out := v_out || ' | O4 rows after a rename ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;
  END;

  -- O5 no signed out visitor and no signed in user can call the writer.
  IF has_function_privilege('anon', 'public.organisation_created_gets_its_organiser()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.organisation_created_gets_its_organiser()', 'EXECUTE') THEN
    v_out := v_out || ' | O5 callable outside the service role: FAIL'; v_fail := v_fail + 1;
  ELSE v_out := v_out || ' | O5 nobody signed out or in can call it: PASS'; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
