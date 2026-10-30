-- share_link_events.piece_id (20261030201001) on TEST, rolled back by its closing raise. Window 5, 30 October 2026.
do $proof$
declare v_out text := ''; v_fail int := 0; v_link uuid; v_row uuid; v_refused boolean := false;
begin
  -- P1 additive: nullable, with its index, and service_role's grant on the table still reaches it.
  if (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'share_link_events' and column_name = 'piece_id') = 'YES'
     and to_regclass('public.share_link_events_by_piece') is not null
     and has_column_privilege('service_role', 'public.share_link_events', 'piece_id', 'INSERT') then
    v_out := v_out || ' | P1 nullable, indexed, reachable by the service role: PASS';
  else v_out := v_out || ' | P1 the column: FAIL'; v_fail := v_fail + 1; end if;

  -- P2 the new column widens nothing: this older table keeps table-level grants, and what holds it is row security, on,
  -- with owner-only SELECT policies and no INSERT policy for anyone.
  if (select relrowsecurity from pg_class where oid = 'public.share_link_events'::regclass)
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'share_link_events' and cmd in ('INSERT', 'ALL', 'UPDATE')) then
    v_out := v_out || ' | P2 row security on, no policy lets anyone write: PASS';
  else v_out := v_out || ' | P2 row security: FAIL'; v_fail := v_fail + 1; end if;

  -- P3 a row with no piece inserts as it always has; a made-up piece is refused by the foreign key.
  select id into v_link from public.share_links limit 1;
  if v_link is null then
    v_out := v_out || ' | P3 no share link on TEST to try: NOT RUN';
  else
    insert into public.share_link_events (link_id, kind, is_test) values (v_link, 'click', true) returning id into v_row;
    begin
      insert into public.share_link_events (link_id, kind, is_test, piece_id) values (v_link, 'click', true, gen_random_uuid());
    exception when foreign_key_violation then v_refused := true; end;
    if v_row is not null and v_refused then v_out := v_out || ' | P3 no piece inserts, a made-up piece is refused: PASS';
    else v_out := v_out || ' | P3 inserts: FAIL'; v_fail := v_fail + 1; end if;
  end if;

  -- P4 the piece going away leaves the press standing.
  if (select confdeltype from pg_constraint where conrelid = 'public.share_link_events'::regclass and conname = 'share_link_events_piece_id_fkey') = 'n' then
    v_out := v_out || ' | P4 on delete set null: PASS';
  else v_out := v_out || ' | P4 delete action: FAIL'; v_fail := v_fail + 1; end if;

  raise exception 'PROOF % (% failure(s), rolled back):%', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail, v_out;
end
$proof$;
