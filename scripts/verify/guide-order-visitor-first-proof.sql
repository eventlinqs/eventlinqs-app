-- THE PROOF FOR 20261101192001_guide_order_visitor_first.sql, as the database itself (Lawal 19:17, CONTROLLER 19:19 (3)).
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. Red against an empty migration: on TEST, where
-- 20261101161001 is applied, Sports sits at 6 and Nightlife at 2.
DO $proof$
DECLARE
  v_order text;
  v_n int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  -- O1 the first eight in the order a visitor looks for them.
  SELECT string_agg(slug, ',' ORDER BY guide_order) INTO v_order
    FROM public.event_categories WHERE guide_order BETWEEN 1 AND 8;
  IF v_order = 'music,sports,comedy,nightlife,markets,food-drink,family,arts-community' THEN
    v_out := v_out || ' | O1 music, sport, comedy, nightlife, markets, food and drink, family, arts: PASS';
  ELSE v_out := v_out || ' | O1 first eight ' || coalesce(v_order, 'none') || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- O2 the rest in their earlier order.
  SELECT string_agg(slug, ',' ORDER BY guide_order) INTO v_order
    FROM public.event_categories WHERE guide_order BETWEEN 9 AND 15;
  IF v_order = 'theatre,festival,community,classes-workshops,business-networking,health-wellness,education' THEN
    v_out := v_out || ' | O2 the rest keep their order: PASS';
  ELSE v_out := v_out || ' | O2 the rest ' || coalesce(v_order, 'none') || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- O3 still exactly fifteen, each label unchanged, nothing left aside above 100.
  SELECT count(*) INTO v_n FROM public.event_categories WHERE guide_order BETWEEN 1 AND 15 AND guide_label IS NOT NULL;
  IF v_n = 15 AND NOT EXISTS (SELECT 1 FROM public.event_categories WHERE guide_order > 15)
     AND (SELECT guide_label FROM public.event_categories WHERE slug = 'sports') = 'Sports'
     AND (SELECT guide_label FROM public.event_categories WHERE slug = 'festival') = 'Festivals and community celebrations' THEN
    v_out := v_out || ' | O3 fifteen, labels unchanged: PASS';
  ELSE v_out := v_out || ' | O3 guide rows ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
