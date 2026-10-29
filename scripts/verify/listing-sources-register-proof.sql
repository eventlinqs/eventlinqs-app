-- THE SOURCE REGISTER'S RULES ON TEST (the release checklist's D2 to D5; 20261028140001). Run with
--   scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs scripts/verify/listing-sources-register-proof.sql
-- Every row it writes carries bp- in its name or address, and the DO block ends by raising its verdict, so the
-- transaction rolls back and TEST is left exactly as found.
do $proof$
declare
  v_lines text[] := '{}';
  v_fail int := 0;
  v_feed uuid;
  v_facts uuid;
  v_media uuid;
  v_order smallint;
  v_state text;
begin
  -- D2: a source is 'read' only where scraping, a feed or a dataset is answered yes.
  begin
    insert into public.listing_sources (name, kind, page_url, collection, terms_url, terms_quote, terms_read_on, verification, verified_on)
    values ('bp-proof no answer', 'venue', 'https://bp-proof-none.example.com/feed.ics', 'read', 'https://bp-proof-none.example.com/', 'bp-proof terms', date '2026-10-28', 'verified', date '2026-10-28');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a read source with every answer unknown was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a read source with no yes is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  -- D2: an answer of yes carries its quote, its address and its day.
  begin
    insert into public.listing_sources (name, kind, page_url, collection, may_subscribe)
    values ('bp-proof bare yes', 'venue', 'https://bp-proof-bare.example.com/feed.ics', 'ask', 'yes');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a yes with no evidence was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a yes with no evidence is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  -- D2: a read source must be verified.
  begin
    insert into public.listing_sources (name, kind, page_url, collection, terms_url, terms_quote, terms_read_on,
      may_subscribe, may_subscribe_quote, may_subscribe_url, may_subscribe_read_on)
    values ('bp-proof unverified', 'venue', 'https://bp-proof-unverified.example.com/feed.ics', 'read', 'https://bp-proof-unverified.example.com/', 'bp-proof terms', date '2026-10-28',
      'yes', 'bp-proof: the page publishes its iCal feed', 'https://bp-proof-unverified.example.com/events/', date '2026-10-28');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL an unverified read source was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS an unverified read source is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  -- D2 and D5: a feed answered yes, with evidence, verified, is read; its acquisition order is 2.
  insert into public.listing_sources (name, kind, page_url, collection, terms_url, terms_quote, terms_read_on, source_type,
    may_subscribe, may_subscribe_quote, may_subscribe_url, may_subscribe_read_on, verification, verified_on, licence_owner, contact)
  values ('bp-proof feed', 'venue', 'https://bp-proof-feed.example.com/feed.ics', 'read', 'https://bp-proof-feed.example.com/', 'bp-proof terms', date '2026-10-28', 'subscription_feed',
    'yes', 'bp-proof: the page publishes its iCal feed', 'https://bp-proof-feed.example.com/events/', date '2026-10-28', 'verified', date '2026-10-28', 'bp-proof venue', 'bp-proof@example.com')
  returning id, acquisition_order into v_feed, v_order;
  if v_order = 2 then v_lines := v_lines || 'PASS a feed, answered yes and verified, is read, acquisition order 2'::text;
  else v_fail := v_fail + 1; v_lines := v_lines || ('FAIL acquisition order ' || coalesce(v_order::text, 'null'))::text; end if;

  -- D3: the defaults on a new row: facts only, unverified, every answer unknown, manual research, order 4.
  insert into public.listing_sources (name, kind, page_url, collection)
  values ('bp-proof defaults', 'promoter', 'https://bp-proof-defaults.example.com/', 'ask')
  returning id into v_facts;
  select source_type || '/' || acquisition_order || '/' || verification || '/' || may_scrape || may_use_dataset || may_subscribe || may_redistribute_facts || may_reuse_media
         || '/' || permits_facts || permits_descriptions || permits_images || permits_links
    into v_state from public.listing_sources where id = v_facts;
  if v_state = 'manual_research/4/unverified/unknownunknownunknownunknownunknown/truefalsefalsefalse' then
    v_lines := v_lines || ('PASS a new row defaults to ' || v_state)::text;
  else v_fail := v_fail + 1; v_lines := v_lines || ('FAIL defaults ' || coalesce(v_state, 'null'))::text; end if;

  -- D4: images and descriptions only where reuse of media is answered yes.
  begin
    update public.listing_sources set permits_images = true where id = v_feed;
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL images permitted with media reuse unknown'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS images are not permitted while media reuse is not yes (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  -- D4: the trigger refuses an image, a description or a link a facts only source does not permit.
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, image_url)
    values (v_feed, 'new', 'bp-proof poster night', now() + interval '9 days', 'bp-proof hall', 'https://bp-proof-feed.example.com/e/1', 'https://bp-proof-feed.example.com/poster.jpg');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL an image landed from a facts only source'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS an image from a facts only source is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, description)
    values (v_feed, 'new', 'bp-proof described night', now() + interval '9 days', 'bp-proof hall', 'https://bp-proof-feed.example.com/e/2', 'bp-proof their words');
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a description landed from a facts only source'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a description from a facts only source is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  begin
    insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, links)
    values (v_feed, 'new', 'bp-proof linked night', now() + interval '9 days', 'bp-proof hall', 'https://bp-proof-feed.example.com/e/3',
      '[{"url": "https://bp-proof.example.com/t", "availability": "on_sale", "priceFromCents": null}]'::jsonb);
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a link landed from a source that permits no links'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a link from a source that permits no links is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url)
  values (v_feed, 'new', 'bp-proof facts night', now() + interval '9 days', 'bp-proof hall', 'https://bp-proof-feed.example.com/e/4');
  v_lines := v_lines || 'PASS the facts alone land as waiting'::text;

  -- D4: a source answered yes on media reuse may give its images and descriptions.
  insert into public.listing_sources (name, kind, page_url, collection,
    may_reuse_media, may_reuse_media_quote, may_reuse_media_url, may_reuse_media_read_on, permits_images, permits_descriptions)
  values ('bp-proof media', 'venue', 'https://bp-proof-media.example.com/', 'ask',
    'yes', 'bp-proof: you may use our posters and words', 'https://bp-proof-media.example.com/terms', date '2026-10-28', true, true)
  returning id into v_media;
  insert into public.listing_candidates (source_id, kind, title, starts_at, venue_name, page_url, image_url, description)
  values (v_media, 'new', 'bp-proof poster', now() + interval '9 days', 'bp-proof hall', 'https://bp-proof-media.example.com/e/1', 'https://bp-proof-media.example.com/p.jpg', 'bp-proof their words');
  v_lines := v_lines || 'PASS a source that permits media lands its image and description'::text;

  -- D3: last successful collection never runs ahead of the last check.
  begin
    update public.listing_sources set last_success_at = now(), last_checked_at = now() - interval '1 day' where id = v_feed;
    v_fail := v_fail + 1; v_lines := v_lines || 'FAIL a success later than the last check was taken'::text;
  exception when check_violation then
    v_lines := v_lines || ('PASS a success later than the last check is refused (' || replace(sqlerrm, '"', '') || ')')::text;
  end;

  raise exception 'PROOF % | %', case when v_fail = 0 then 'PASSED' else 'FAILED' end, array_to_string(v_lines, ' | ');
end
$proof$;
