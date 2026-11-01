-- THE PROOF FOR 20261101140001_growth_acquisition_facts.sql (V3 item 10): the desk's facts are the database's own.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. Red against an empty migration: the function is absent.
DO $proof$
DECLARE
  v_facts jsonb;
  v_n int;
  v_m int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  v_facts := public.growth_acquisition_facts();

  -- F1 one row per organiser, no more, no fewer.
  SELECT count(*) INTO v_n FROM public.organisers;
  IF jsonb_array_length(v_facts) = v_n THEN v_out := v_out || ' | F1 one row per organiser (' || v_n || '): PASS';
  ELSE v_out := v_out || ' | F1 rows ' || jsonb_array_length(v_facts) || ' for ' || v_n || ' organisers: FAIL'; v_fail := v_fail + 1; END IF;

  -- F2 the eligible contacts are the send path's own: a whole basis that outreach_contact_refusal does not refuse.
  SELECT coalesce(sum((f ->> 'eligible_contacts')::int), 0) INTO v_n FROM jsonb_array_elements(v_facts) f;
  SELECT count(*) INTO v_m FROM public.organiser_contacts c WHERE c.basis <> 'none' AND public.outreach_contact_refusal(c.id) IS NULL;
  IF v_n = v_m THEN v_out := v_out || ' | F2 eligible contacts match the send check (' || v_m || '): PASS';
  ELSE v_out := v_out || ' | F2 eligible ' || v_n || ' against ' || v_m || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- F3 the replies are every reply logged against an organiser's contacts.
  SELECT coalesce(sum((f ->> 'replies')::int), 0) INTO v_n FROM jsonb_array_elements(v_facts) f;
  SELECT count(*) INTO v_m FROM public.outreach_replies r JOIN public.organiser_contacts c ON c.id = r.contact_id;
  IF v_n = v_m THEN v_out := v_out || ' | F3 replies match (' || v_m || '): PASS';
  ELSE v_out := v_out || ' | F3 replies ' || v_n || ' against ' || v_m || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- F4 a paid sale is only a paid order: no organiser shows more paid events than it has events with a paid order.
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_facts) f
   WHERE ((f ->> 'paid_events')::int > 0 AND NOT EXISTS (
            SELECT 1 FROM public.orders o JOIN public.events e ON e.id = o.event_id JOIN public.organisers g ON g.organisation_id = e.organisation_id
             WHERE g.id = (f ->> 'organiser_id')::uuid AND o.status IN ('confirmed', 'partially_refunded') AND o.total_cents > 0));
  IF v_n = 0 THEN v_out := v_out || ' | F4 every paid event stands on a paid order: PASS';
  ELSE v_out := v_out || ' | F4 paid events with no paid order ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- F5 nobody signed out or in can read it.
  IF has_function_privilege('anon', 'public.growth_acquisition_facts()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.growth_acquisition_facts()', 'EXECUTE') THEN
    v_out := v_out || ' | F5 readable outside the service role: FAIL'; v_fail := v_fail + 1;
  ELSE v_out := v_out || ' | F5 service role only: PASS'; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
