-- THE PROOF FOR 20261101203001_secondary_categories_not_a_join_table.sql, as the database itself (CONTROLLER 20:20).
--
-- Run it through scripts/verify/replay-under-new-default.mjs (the migration, then this, one transaction); it ends by
-- RAISING its verdict, so TEST is left exactly as it was found. Red against an empty migration: on TEST the primary key
-- of event_secondary_categories is (event_id, category_id), the shape PostgREST reads as a join table.
DO $proof$
DECLARE
  v_pk text;
  v_out text := '';
  v_fail int := 0;
BEGIN
  -- J1 the primary key is the table's own id, so neither foreign key is part of it.
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_pk
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = 'public.event_secondary_categories'::regclass AND c.contype = 'p';
  IF v_pk = 'id' THEN v_out := v_out || ' | J1 primary key is id alone: PASS';
  ELSE v_out := v_out || ' | J1 primary key ' || coalesce(v_pk, 'none') || ': FAIL'; v_fail := v_fail + 1; END IF;

  -- J2 the pair is still unique, by constraint.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.event_secondary_categories'::regclass AND contype = 'u'
                AND conname = 'event_secondary_categories_pair_unique') THEN
    v_out := v_out || ' | J2 (event_id, category_id) unique by constraint: PASS';
  ELSE v_out := v_out || ' | J2 no pair constraint: FAIL'; v_fail := v_fail + 1; END IF;

  -- J3 both foreign keys kept, and events keeps exactly one key to event_categories.
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.event_secondary_categories'::regclass AND contype = 'f') = 2
     AND (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.events'::regclass AND contype = 'f'
            AND confrelid = 'public.event_categories'::regclass) = 1 THEN
    v_out := v_out || ' | J3 both foreign keys kept, events has one key to event_categories: PASS';
  ELSE v_out := v_out || ' | J3 foreign keys changed: FAIL'; v_fail := v_fail + 1; END IF;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
