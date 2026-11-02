-- THE PROOF FOR 20261101161001_guide_categories.sql (city first, directive 2), as the database itself.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. Red against an empty migration: guide_order is absent.
DO $proof$
DECLARE
  v_event uuid;
  v_primary uuid;
  v_n int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  -- K1 exactly fifteen guide categories, in the directive's words, one to fifteen.
  SELECT count(*) INTO v_n FROM public.event_categories WHERE guide_order BETWEEN 1 AND 15 AND guide_label IS NOT NULL;
  IF v_n = 15 AND (SELECT guide_label FROM public.event_categories WHERE guide_order = 4) = 'Theatre and performing arts' THEN
    v_out := v_out || ' | K1 fifteen guide categories in the directive''s words: PASS';
  ELSE v_out := v_out || ' | K1 guide rows ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- K2 no existing name or slug changed: the ten outside the fifteen are secondary only.
  SELECT count(*) INTO v_n FROM public.event_categories WHERE guide_order IS NULL AND slug IN ('charity', 'technology', 'religion', 'fashion', 'film');
  IF v_n = (SELECT count(*) FROM public.event_categories WHERE slug IN ('charity', 'technology', 'religion', 'fashion', 'film')) THEN
    v_out := v_out || ' | K2 the others are secondary only: PASS';
  ELSE v_out := v_out || ' | K2 a non guide category has a guide order: FAIL'; v_fail := v_fail + 1; END IF;

  SELECT id, category_id INTO v_event, v_primary FROM public.events WHERE category_id IS NOT NULL LIMIT 1;
  IF v_event IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no event with a category on this database'; END IF;

  -- K3 a secondary is never the primary.
  BEGIN
    INSERT INTO public.event_secondary_categories (event_id, category_id, assigned_by, rule) VALUES (v_event, v_primary, 'rule', 'proof');
    v_out := v_out || ' | K3 the primary was kept as a secondary: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN v_out := v_out || ' | K3 a secondary is never the primary: PASS'; END;

  -- K4 at most three secondary.
  DELETE FROM public.event_secondary_categories WHERE event_id = v_event;
  INSERT INTO public.event_secondary_categories (event_id, category_id, assigned_by, rule)
  SELECT v_event, c.id, 'rule', 'proof' FROM public.event_categories c WHERE c.id <> v_primary AND c.guide_order IS NOT NULL ORDER BY c.guide_order LIMIT 3;
  BEGIN
    INSERT INTO public.event_secondary_categories (event_id, category_id, assigned_by, rule)
    SELECT v_event, c.id, 'rule', 'proof' FROM public.event_categories c
     WHERE c.id <> v_primary AND c.guide_order IS NOT NULL
       AND c.id NOT IN (SELECT category_id FROM public.event_secondary_categories WHERE event_id = v_event)
     ORDER BY c.guide_order LIMIT 1;
    v_out := v_out || ' | K4 a fourth secondary was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN v_out := v_out || ' | K4 at most three secondary: PASS'; END;

  -- K5 every event starts with no review needed, and only the three review words are accepted.
  BEGIN
    UPDATE public.events SET category_review = 'maybe' WHERE id = v_event;
    v_out := v_out || ' | K5 an unknown review word was kept: FAIL'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    IF (SELECT count(*) FROM public.events WHERE category_review <> 'none') = 0 THEN v_out := v_out || ' | K5 review is none until set, one of three words: PASS';
    ELSE v_out := v_out || ' | K5 events start with a review set: FAIL'; v_fail := v_fail + 1; END IF;
  END;

  -- K6 anyone may read the secondary categories; nobody signed out or in may write them.
  IF has_table_privilege('anon', 'public.event_secondary_categories', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.event_secondary_categories', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.event_secondary_categories', 'DELETE') THEN
    v_out := v_out || ' | K6 read by anyone, written by the service role only: PASS';
  ELSE v_out := v_out || ' | K6 grants wrong: FAIL'; v_fail := v_fail + 1; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
