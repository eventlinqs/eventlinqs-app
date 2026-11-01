-- A VENUE'S NEW NAME REACHES ITS EVENTS: the proof for 20261101052001_venue_rename_carries_its_events.sql.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. It takes a real venue with events carrying its name,
-- sets one of those events to a deliberately different name, renames the venue, and reads every event back.
DO $proof$
DECLARE
  v_venue uuid;
  v_old text;
  v_new text := 'BP Proof Renamed ' || extract(epoch from clock_timestamp())::bigint::text;
  v_kept uuid;
  v_all int;
  v_carried int;
  v_left int;
  v_out text := '';
  v_fail int := 0;
BEGIN
  SELECT v.id, v.name INTO v_venue, v_old
    FROM public.venues v
   WHERE (SELECT count(*) FROM public.events e WHERE e.venue_id = v.id AND e.venue_name = v.name) >= 2
   LIMIT 1;
  IF v_venue IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no venue with two events carrying its name on this database'; END IF;

  SELECT id INTO v_kept FROM public.events WHERE venue_id = v_venue AND venue_name = v_old LIMIT 1;
  UPDATE public.events SET venue_name = 'BP Proof Outdoor Address' WHERE id = v_kept;
  SELECT count(*) INTO v_all FROM public.events WHERE venue_id = v_venue AND venue_name = v_old;

  UPDATE public.venues SET name = v_new WHERE id = v_venue;

  SELECT count(*) INTO v_carried FROM public.events WHERE venue_id = v_venue AND venue_name = v_new;
  SELECT count(*) INTO v_left FROM public.events WHERE venue_id = v_venue AND venue_name = v_old;
  IF v_carried = v_all AND v_left = 0 THEN
    v_out := v_out || ' | R1 every event that carried the old name takes the new one (' || v_carried || '): PASS';
  ELSE
    v_out := v_out || ' | R1 ' || v_carried || ' of ' || v_all || ' took the new name, ' || v_left || ' kept the old: FAIL'; v_fail := v_fail + 1;
  END IF;

  IF (SELECT venue_name FROM public.events WHERE id = v_kept) = 'BP Proof Outdoor Address' THEN
    v_out := v_out || ' | R2 an event named differently on purpose is left as it is: PASS';
  ELSE
    v_out := v_out || ' | R2 the deliberately different name was overwritten: FAIL'; v_fail := v_fail + 1;
  END IF;

  IF has_function_privilege('anon', 'public.venue_rename_carries_its_events()', 'EXECUTE') THEN
    v_out := v_out || ' | R3 anon may execute the trigger function: FAIL'; v_fail := v_fail + 1;
  ELSE
    v_out := v_out || ' | R3 no signed out visitor reaches the trigger function: PASS';
  END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
