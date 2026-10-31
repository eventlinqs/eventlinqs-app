-- LAW 24 HOLDS AT THE DATABASE: the proof for 20261101062001_law24_holds_at_the_database.sql.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. It moves a real order between a real organisation
-- inside its window and the rules, and tries to shorten a window.
DO $proof$
DECLARE
  v_inside uuid;
  v_order uuid;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT id INTO v_inside FROM public.organisations
   WHERE greatest(founding_fee_free_until, public.founding_add_months(created_at, 6)) > now() + interval '1 day' LIMIT 1;
  SELECT id INTO v_order FROM public.orders ORDER BY created_at DESC LIMIT 1;
  IF v_inside IS NULL OR v_order IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no organisation inside its window, or no order, on this database'; END IF;

  -- L1 an order written inside the window with a platform fee is refused.
  BEGIN
    UPDATE public.orders SET organisation_id = v_inside, created_at = now(), platform_fee_cents = 150 WHERE id = v_order;
    v_out := v_out || ' | L1 a fee inside the window was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | L1 a fee inside the window is refused: PASS'; END;

  -- L2 the same order with no platform fee is kept.
  BEGIN
    UPDATE public.orders SET organisation_id = v_inside, created_at = now(), platform_fee_cents = 0 WHERE id = v_order;
    v_out := v_out || ' | L2 a fee-free order inside the window is kept: PASS';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | L2 a fee-free order was refused (' || SQLERRM || '): FAIL'; v_fail := v_fail + 1; END;

  -- L3 after the window, the standard fee is kept.
  BEGIN
    UPDATE public.orders SET created_at = (SELECT greatest(founding_fee_free_until, public.founding_add_months(created_at, 6)) + interval '1 day'
                                             FROM public.organisations WHERE id = v_inside),
                             platform_fee_cents = 150 WHERE id = v_order;
    v_out := v_out || ' | L3 a fee after the window is kept: PASS';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | L3 a fee after the window was refused (' || SQLERRM || '): FAIL'; v_fail := v_fail + 1; END;

  -- L4 no window can be shortened below six months from registration.
  BEGIN
    UPDATE public.organisations SET founding_fee_free_until = created_at WHERE id = v_inside;
    v_out := v_out || ' | L4 a window was shortened: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | L4 a window below six months is refused: PASS'; END;

  -- L5 a referral extension (later) is kept.
  BEGIN
    UPDATE public.organisations SET founding_fee_free_until = founding_fee_free_until + interval '3 months' WHERE id = v_inside;
    v_out := v_out || ' | L5 a referral extension is kept: PASS';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || ' | L5 an extension was refused (' || SQLERRM || '): FAIL'; v_fail := v_fail + 1; END;

  -- L6 every organisation already holds a whole window (the constraint validated over them all).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisations_law24_window' AND convalidated) THEN
    v_out := v_out || ' | L6 every organisation holds its six months: PASS';
  ELSE v_out := v_out || ' | L6 the window rule is not validated: FAIL'; v_fail := v_fail + 1; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
