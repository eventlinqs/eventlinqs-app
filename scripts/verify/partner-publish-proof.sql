-- THE PARTNER PUBLISH ON TEST (the engine plan of 28 October 2026, part E; 20261028204001's
-- listing_publish_partner_night). Run with
--   scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs scripts/verify/partner-publish-proof.sql
-- It borrows an existing venue whose city has a timezone, an organisation that is not EventLinqs' own listings
-- organisation, and a category; every row it writes carries bp-proof, and the DO block ends by raising its verdict, so
-- the transaction rolls back and TEST is left exactly as found.
do $proof$
declare
  v_lines text[] := '{}';
  v_fail int := 0;
  v_venue record;
  v_org uuid;
  v_cat uuid;
  v_src uuid;
  v_cand uuid;
  v_person uuid;
  v_series uuid;
  v_again uuid;
  v_s record;
  v_n int;
begin
  select v.id, v.name, c.timezone into v_venue
    from public.venues v join public.cities c on c.slug = v.city_slug
   where c.timezone is not null
   order by v.created_at limit 1;
  select id into v_org from public.organisations where slug <> 'eventlinqs-listings' order by created_at limit 1;
  select id into v_cat from public.event_categories order by created_at limit 1;
  if v_venue.id is null or v_org is null or v_cat is null then
    raise exception 'PROOF FAILED | TEST holds no venue with a city timezone, no partner organisation or no category to borrow';
  end if;

  insert into public.listing_sources (name, kind, page_url, collection, changes, source_type, organisation_id, venue_id, category_id, permits_links)
  values ('bp-proof partner feed', 'venue', 'https://bp-proof-partner.example.com/events.ics', 'ask', 'daily', 'venue_partnership', v_org, v_venue.id, v_cat, true)
  returning id into v_src;

  insert into public.listing_candidates (source_id, kind, title, starts_at, ends_at, venue_name, venue_address, page_url, links,
                                         confidence, reasons, decided_by, status, reviewed_at)
  values (v_src, 'new', 'bp-proof partner night', timestamptz '2026-11-20 19:30+11', timestamptz '2026-11-20 22:30+11',
          v_venue.name, '1 bp-proof st', 'https://bp-proof-partner.example.com/e/1',
          '[{"url": "https://bp-proof-partner.example.com/tickets/1", "availability": "on_sale", "priceFromCents": 2500}]'::jsonb,
          'high', '{}', 'partner_rule', 'accepted', now())
  returning id into v_cand;

  v_series := public.listing_publish_partner_night(v_cand);
  select * into v_s from public.event_series where id = v_series;
  if v_s.rule = 'once' and v_s.anchor_date = (timestamptz '2026-11-20 19:30+11' at time zone v_venue.timezone)::date
     and v_s.starts_at = (timestamptz '2026-11-20 19:30+11' at time zone v_venue.timezone)::time
     and v_s.ends_at = (timestamptz '2026-11-20 22:30+11' at time zone v_venue.timezone)::time
     and v_s.timezone = v_venue.timezone and v_s.venue_id = v_venue.id and v_s.organisation_id = v_org
     and v_s.category_id = v_cat and v_s.listing_source = 'organiser' and v_s.status = 'active'
     and v_s.day = extract(dow from v_s.anchor_date)::smallint
     and v_s.summary = 'bp-proof partner night at ' || v_venue.name || '.' then
    v_lines := v_lines || ('PASS the night is a dated series at the partner''s venue, held by its organisation, in ' || v_venue.timezone || ', summary from the facts alone')::text;
  else
    v_fail := v_fail + 1; v_lines := v_lines || ('FAIL the series fields: ' || row_to_json(v_s)::text)::text;
  end if;
  if v_s.booking_links = jsonb_build_array(jsonb_build_object('url', 'https://bp-proof-partner.example.com/tickets/1', 'kind', 'tickets',
       'price_from_cents', 2500, 'price_checked_on', (now() at time zone v_venue.timezone)::date)) then
    v_lines := v_lines || 'PASS its booking link carries the price with the day it was read'::text;
  else
    v_fail := v_fail + 1; v_lines := v_lines || ('FAIL the booking links: ' || v_s.booking_links::text)::text;
  end if;
  select count(*) into v_n from public.listing_checks
   where series_id = v_series and reuse_basis = 'organiser_submission' and outcome = 'confirmed'
     and source_url = 'https://bp-proof-partner.example.com/e/1' and import_file = 'partner-feed:' || v_src;
  if v_n = 1 then
    v_lines := v_lines || 'PASS one listing check, basis organiser_submission, naming the partner feed'::text;
  else
    v_fail := v_fail + 1; v_lines := v_lines || ('FAIL listing checks found: ' || v_n)::text;
  end if;
  if (select published_series_id from public.listing_candidates where id = v_cand) = v_series then
    v_lines := v_lines || 'PASS the candidate names the series it became'::text;
  else
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL the candidate does not name its series'::text;
  end if;

  v_again := public.listing_publish_partner_night(v_cand);
  select count(*) into v_n from public.listing_checks where series_id = v_series;
  if v_again = v_series and v_n = 1 then
    v_lines := v_lines || 'PASS asked again, the same series and no second check'::text;
  else
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a second call wrote again'::text;
  end if;

  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, confidence, reasons)
  values (v_src, 'new', 'bp-proof waiting night', timestamptz '2026-11-21 19:30+11', v_venue.name, 'https://bp-proof-partner.example.com/e/2', 'low', '{no_venue_address}')
  returning id into v_person;
  begin
    perform public.listing_publish_partner_night(v_person);
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a night waiting for a person was published'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a night waiting for a person is never published here (' || sqlerrm || ')')::text;
  end;
  begin
    update public.listing_candidates set published_series_id = v_series where id = v_person;
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a person''s row was marked published'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS only a partner rule row can name a series (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  update public.listing_sources set category_id = null where id = v_src;
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, venue_address, page_url, confidence, reasons, decided_by, status, reviewed_at)
  values (v_src, 'new', 'bp-proof no category', timestamptz '2026-11-22 19:30+11', v_venue.name, '1 bp-proof st', 'https://bp-proof-partner.example.com/e/3', 'high', '{}', 'partner_rule', 'accepted', now())
  returning id into v_person;
  begin
    perform public.listing_publish_partner_night(v_person);
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a night from a source with no category was published'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a source with no category publishes nothing (' || sqlerrm || ')')::text;
  end;

  execute 'set local role anon';
  begin
    perform public.listing_publish_partner_night(v_cand);
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a visitor called the publish'::text;
  exception when insufficient_privilege then
    v_lines := v_lines || 'PASS a visitor cannot call the publish (permission denied)'::text;
  end;
  execute 'reset role';

  raise exception 'PROOF % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, array_to_string(v_lines, ' | ');
end
$proof$;
