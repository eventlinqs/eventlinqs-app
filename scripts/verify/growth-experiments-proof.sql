-- THE PROOF FOR 20261101165001_growth_experiments.sql, as the database itself. Run through
-- scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by RAISING its verdict,
-- so TEST is left exactly as it was found. Red against an empty migration: the table is absent.
DO $proof$
DECLARE
  v_id uuid;
  v_out text := '';
  v_fail int := 0;
BEGIN
  -- E1 an experiment is kept with every field section 7 names.
  INSERT INTO public.growth_experiments (city_slug, title, hypothesis, audience, channel, starts_on, ends_on, primary_metric, baseline)
  VALUES ('geelong', 'Proof weekly guide', 'A weekly Geelong guide brings returning visitors', 'Geelong residents', 'weekly_guide',
          current_date, current_date + 28, 'returning visitors a week', 0) RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN v_out := v_out || ' | E1 kept with every field: PASS';
  ELSE v_out := v_out || ' | E1 not kept: FAIL'; v_fail := v_fail + 1; END IF;

  -- E2 no decision without a result.
  BEGIN
    UPDATE public.growth_experiments SET decision = 'scale', decided_at = now(), decided_by = 'proof' WHERE id = v_id;
    v_out := v_out || ' | E2 scaled with no result: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | E2 no decision without a result: PASS'; END;

  -- E3 with a result against the baseline, a decision is kept with who and when.
  UPDATE public.growth_experiments SET result = 42, decision = 'improve', decided_at = now(), decided_by = 'proof' WHERE id = v_id;
  IF (SELECT decision FROM public.growth_experiments WHERE id = v_id) = 'improve' THEN v_out := v_out || ' | E3 decided on a result: PASS';
  ELSE v_out := v_out || ' | E3 decision not kept: FAIL'; v_fail := v_fail + 1; END IF;

  -- E4 paid advertising refused without its tracking proof.
  BEGIN
    INSERT INTO public.growth_experiments (title, hypothesis, audience, channel, budget_cents, starts_on, ends_on, primary_metric)
    VALUES ('Proof paid ads', 'Ads sell tickets', 'Geelong', 'paid_advertising', 50000, current_date, current_date + 7, 'paid tickets');
    v_out := v_out || ' | E4 paid advertising with no tracking proof was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | E4 paid advertising needs its tracking proof: PASS'; END;

  -- E5 an end before the start is refused; nobody signed out or in reaches the register.
  BEGIN
    INSERT INTO public.growth_experiments (title, hypothesis, audience, channel, starts_on, ends_on, primary_metric)
    VALUES ('Proof backwards', 'x', 'y', 'other', current_date, current_date - 1, 'z');
    v_out := v_out || ' | E5 an end before the start was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    IF has_table_privilege('anon', 'public.growth_experiments', 'SELECT') OR has_table_privilege('authenticated', 'public.growth_experiments', 'SELECT') THEN
      v_out := v_out || ' | E5 readable outside the service role: FAIL'; v_fail := v_fail + 1;
    ELSE v_out := v_out || ' | E5 dates in order, service role only: PASS'; END IF;
  END;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
