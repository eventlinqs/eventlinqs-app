-- A PERSON'S ACCEPT PUBLISHES THE NIGHT (supabase/migrations/20261101171501_accept_publishes_the_night.sql), on TEST,
-- rolled back by its own closing raise. Window 6, 1 November 2026. RED before the migration (the function does not
-- exist; the constraint refuses a person's published series); GREEN after.

create function pg_temp.refused(p_sql text, p_like text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'FAIL (kept)';
exception when others then
  if sqlerrm ilike '%' || p_like || '%' then return 'PASS'; end if;
  return 'FAIL (' || replace(replace(sqlerrm, '"', ''), '|', '/') || ')';
end
$f$;

do $proof$
declare
  v_out text := '';
  v_fail int := 0;
  v_r text;
  v_user uuid;
  v_venue uuid;
  v_vname text;
  v_cat uuid;
  v_src uuid;
  v_c1 uuid;
  v_c2 uuid;
  v_c3 uuid;
  v_s1 uuid;
  v_s1b uuid;
  v_row record;
  v_start timestamptz := date_trunc('day', now() at time zone 'Australia/Melbourne') + interval '9 days 19 hours 30 minutes';
begin
  select id into v_user from auth.users order by created_at limit 1;
  select id, name into v_venue, v_vname from public.venues where city_slug = 'geelong' and removed_at is null order by name limit 1;
  select id into v_cat from public.event_categories where slug = 'music';
  insert into public.listing_sources (name, kind, page_url, collection, city_slug, permits_facts, permits_links)
    values ('W6 Accept Proof Source', 'venue', 'https://w6-accept-proof.example.com/events/', 'ask', 'geelong', true, true) returning id into v_src;
  v_start := (v_start::timestamp at time zone 'Australia/Melbourne');
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, links, confidence, reasons)
    values (v_src, 'new', 'W6 Accept Proof Quartet', v_start, v_vname, 'https://w6-accept-proof.example.com/events/quartet/',
            '[{"url":"https://w6-accept-proof.example.com/events/quartet/","availability":"on_sale","priceFromCents":3000}]'::jsonb, 'high', '{}')
    returning id into v_c1;
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, links, confidence, reasons)
    values (v_src, 'new', 'W6 Accept Proof Quartet', v_start + interval '2 hours', v_vname, 'https://w6-accept-proof.example.com/events/quartet/', '[]'::jsonb, 'high', '{}')
    returning id into v_c2;
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, links, confidence, reasons, status, refused_because, reviewed_by, reviewed_at)
    values (v_src, 'new', 'W6 Accept Proof Refused One', v_start, v_vname, 'https://w6-accept-proof.example.com/events/x/', '[]'::jsonb, 'high', '{}', 'refused', 'not a public event (proof)', v_user, now())
    returning id into v_c3;

  -- A1: a waiting new candidate, a held venue, a category, a reviewer: published.
  v_s1 := public.listing_publish_accepted_night(v_c1, v_venue, v_cat, v_user);
  select * into v_row from public.event_series where id = v_s1;
  v_r := case when v_row.venue_id = v_venue and v_row.category_id = v_cat and v_row.listing_source = 'eventlinqs'
                 and v_row.organisation_id = (select id from public.organisations where slug = 'eventlinqs-listings')
                 and v_row.rule = 'once' and v_row.anchor_date = (v_start at time zone 'Australia/Melbourne')::date
                 and v_row.starts_at = (v_start at time zone 'Australia/Melbourne')::time
                 and v_row.booking_links -> 0 ->> 'url' = 'https://w6-accept-proof.example.com/events/quartet/'
                 and (v_row.booking_links -> 0 ->> 'price_from_cents')::int = 3000
              then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | A1 the night is a dated EventLinqs listing at the held venue, its start in Melbourne, its booking link and price: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  v_r := case when exists (select 1 from public.listing_checks where series_id = v_s1 and source_url = 'https://w6-accept-proof.example.com/events/quartet/'
                              and reuse_basis = 'manual_research_facts_only' and outcome = 'confirmed') then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | A2 a listing check cites the candidate''s own page, facts only: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  select * into v_row from public.listing_candidates where id = v_c1;
  v_r := case when v_row.status = 'accepted' and v_row.decided_by = 'person' and v_row.reviewed_by = v_user and v_row.published_series_id = v_s1 then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | A3 the candidate reads accepted by that person and linked to its night: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  v_s1b := public.listing_publish_accepted_night(v_c1, v_venue, v_cat, v_user);
  v_r := case when v_s1b = v_s1 and (select count(*) from public.event_series where name = 'W6 Accept Proof Quartet') = 1 then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | A4 a second call returns the same night, nothing twice: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  v_r := pg_temp.refused(format('select public.listing_publish_accepted_night(%L, %L, %L, %L)', v_c2, gen_random_uuid(), v_cat, v_user), 'held venue');
  v_out := v_out || ' | R1 a venue we do not hold refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format('select public.listing_publish_accepted_night(%L, %L, null, %L)', v_c2, v_venue, v_user), 'category');
  v_out := v_out || ' | R2 no category refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format('select public.listing_publish_accepted_night(%L, %L, %L, %L)', v_c3, v_venue, v_cat, v_user), 'still waiting');
  v_out := v_out || ' | R3 a candidate no longer waiting refused: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;
  v_r := pg_temp.refused(format('select public.listing_publish_accepted_night(%L, %L, %L, %L)', v_c2, v_venue, v_cat, v_user), 'another time');
  v_out := v_out || ' | R4 a second session the same day is refused in words until the session key lands: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  v_r := case when not has_function_privilege('anon', 'public.listing_publish_accepted_night(uuid,uuid,uuid,uuid)', 'execute')
                   and not has_function_privilege('authenticated', 'public.listing_publish_accepted_night(uuid,uuid,uuid,uuid)', 'execute')
              then 'PASS' else 'FAIL' end;
  v_out := v_out || ' | G1 nobody signed out or in can call it: ' || v_r; if v_r <> 'PASS' then v_fail := v_fail + 1; end if;

  raise exception 'PROOF %: % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, v_fail || ' failure(s)', substr(v_out, 4);
end
$proof$;
