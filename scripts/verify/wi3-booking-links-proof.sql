-- WI3, THE BOOKING LINKS PROOF: one event, every place it sells, the one button and its mirror, as the roles themselves.
--
-- The project manager's 12:30 of 27 October 2026 asks these tests first: two sources, one event, one card; three
-- platforms, one button plus "Also on"; primary dead, button re-picks; all sold out, no dead button; claimed
-- organiser's order wins. 20261027130001_wi3_event_booking_links.sql makes event_booking_links, the button
-- (event_booking_button), the mirror on events.external_ticket_url both ways, and the grants; this proves each.
--
-- Run it through scripts/verify/replay-under-new-default.mjs (Supabase's own opt-in to the new default, the table made
-- again from the migration, then this), one transaction; it ends by RAISING its verdict, so TEST is left exactly as it
-- was found. The verdict reads PROOF PASSED or PROOF FAILED, line by line.
DO $proof$
DECLARE
  v_listings uuid;
  v_owner uuid;
  v_event uuid;
  v_draft uuid;
  v_out text := '';
  v_fail int := 0;
  v_n int;
  v_url text;
  v_cover text;
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
  v_h text := 'https://events.humanitix.com/bp-proof-' || v_stamp;
  v_e text := 'https://www.eventbrite.com.au/e/bp-proof-' || v_stamp;
  v_m text := 'https://www.moshtix.com.au/v2/event/bp-proof-' || v_stamp;
BEGIN
  SELECT id, owner_id INTO v_listings, v_owner FROM public.organisations WHERE slug = 'eventlinqs-listings';
  IF v_listings IS NULL THEN RAISE EXCEPTION 'PROOF FAILED: no listings organisation on this database'; END IF;
  SELECT cover_image_url INTO v_cover FROM public.events WHERE status = 'published' AND cover_image_url IS NOT NULL LIMIT 1;

  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone, event_type,
                             listing_source, venue_name, status, visibility, published_at, cover_image_url)
  VALUES (v_listings, v_owner, 'BP Proof Gig ' || v_stamp, 'bp-proof-gig-' || v_stamp,
          now() + interval '10 days', now() + interval '10 days 3 hours', 'Australia/Melbourne', 'in_person',
          'eventlinqs', 'BP Proof Hall', 'published', 'public', now(), v_cover)
  RETURNING id INTO v_event;
  INSERT INTO public.events (organisation_id, created_by, title, slug, start_date, end_date, timezone, event_type,
                             listing_source, venue_name, status, visibility)
  VALUES (v_listings, v_owner, 'BP Proof Draft ' || v_stamp, 'bp-proof-draft-' || v_stamp,
          now() + interval '11 days', now() + interval '11 days 3 hours', 'Australia/Melbourne', 'in_person',
          'eventlinqs', 'BP Proof Hall', 'draft', 'public')
  RETURNING id INTO v_draft;

  -- T1 two sources, one event: two curated links, the button the first found on sale; one event row still.
  INSERT INTO public.event_booking_links (event_id, provider, url, position, set_by) VALUES (v_event, 'humanitix', v_h, 1, 'curated');
  INSERT INTO public.event_booking_links (event_id, provider, url, position, set_by) VALUES (v_event, 'eventbrite', v_e, 2, 'curated');
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_url = v_h THEN v_out := v_out || ' | T1 two sources, one event, the button the first found: PASS';
  ELSE v_out := v_out || ' | T1 two sources: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;

  -- T2 three platforms: a sold out link found first never takes the button from one on sale.
  INSERT INTO public.event_booking_links (event_id, provider, url, availability, position, set_by) VALUES (v_event, 'moshtix', v_m, 'sold_out', 0, 'curated');
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_url = v_h THEN v_out := v_out || ' | T2 on sale before sold out: PASS';
  ELSE v_out := v_out || ' | T2 on sale before sold out: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;

  -- T3 the link the organiser's own pages point to.
  UPDATE public.event_booking_links SET pointed_to_by_organiser = true WHERE event_id = v_event AND url = v_e;
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_url = v_e THEN v_out := v_out || ' | T3 what the organiser points to: PASS';
  ELSE v_out := v_out || ' | T3 what the organiser points to: FAIL'; v_fail := v_fail + 1; END IF;

  -- T4 the claimed organiser's order wins, even sold out.
  UPDATE public.event_booking_links SET is_primary = true, set_by = 'organiser' WHERE event_id = v_event AND url = v_m;
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_url = v_m THEN v_out := v_out || ' | T4 the organiser''s choice wins: PASS';
  ELSE v_out := v_out || ' | T4 the organiser''s choice wins: FAIL'; v_fail := v_fail + 1; END IF;

  -- T5 the primary dead: the button re-picks.
  UPDATE public.event_booking_links SET availability = 'dead' WHERE event_id = v_event AND url = v_m;
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_url = v_e THEN v_out := v_out || ' | T5 primary dead, the button re-picks: PASS';
  ELSE v_out := v_out || ' | T5 primary dead: FAIL (' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;

  -- T6 all sold out: the button stays on a sold out link; all dead: no button at all.
  UPDATE public.event_booking_links SET availability = 'sold_out' WHERE event_id = v_event AND url IN (v_h, v_e);
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_url = v_e THEN v_out := v_out || ' | T6a all sold out, a sold out button: PASS';
  ELSE v_out := v_out || ' | T6a all sold out: FAIL'; v_fail := v_fail + 1; END IF;
  UPDATE public.event_booking_links SET availability = 'dead' WHERE event_id = v_event;
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_url IS NULL THEN v_out := v_out || ' | T6b all dead, never a dead button: PASS';
  ELSE v_out := v_out || ' | T6b all dead: FAIL'; v_fail := v_fail + 1; END IF;

  -- T7 an older direct write becomes the organiser's own link, and the mirror agrees.
  UPDATE public.events SET external_ticket_url = 'https://bp-proof-own.example.com/tickets-' || v_stamp WHERE id = v_event;
  SELECT count(*) INTO v_n FROM public.event_booking_links
   WHERE event_id = v_event AND is_primary AND set_by = 'organiser' AND url = 'https://bp-proof-own.example.com/tickets-' || v_stamp;
  SELECT external_ticket_url INTO v_url FROM public.events WHERE id = v_event;
  IF v_n = 1 AND v_url = 'https://bp-proof-own.example.com/tickets-' || v_stamp THEN v_out := v_out || ' | T7 a direct write is the organiser''s link: PASS';
  ELSE v_out := v_out || ' | T7 a direct write: FAIL (' || v_n || ', ' || coalesce(v_url, 'null') || ')'; v_fail := v_fail + 1; END IF;

  -- T8 a direct null takes every link away: the two never disagree.
  UPDATE public.events SET external_ticket_url = NULL WHERE id = v_event;
  SELECT count(*) INTO v_n FROM public.event_booking_links WHERE event_id = v_event;
  IF v_n = 0 THEN v_out := v_out || ' | T8 a direct null takes the links: PASS';
  ELSE v_out := v_out || ' | T8 a direct null: FAIL (' || v_n || ' left)'; v_fail := v_fail + 1; END IF;

  -- T9 the database's refusals: a curated primary, an http link, a price with no check.
  BEGIN
    INSERT INTO public.event_booking_links (event_id, provider, url, is_primary, set_by) VALUES (v_event, 'other', v_h, true, 'curated');
    v_out := v_out || ' | T9a a curated primary: FAIL (kept)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | T9a a curated primary refused: PASS'; END;
  BEGIN
    INSERT INTO public.event_booking_links (event_id, provider, url, set_by) VALUES (v_event, 'other', 'http://bp-proof.example.com/x', 'curated');
    v_out := v_out || ' | T9b an http link: FAIL (kept)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | T9b an http link refused: PASS'; END;
  BEGIN
    INSERT INTO public.event_booking_links (event_id, provider, url, price_from_cents, set_by) VALUES (v_event, 'humanitix', v_h, 2850, 'curated');
    v_out := v_out || ' | T9c a price with no check: FAIL (kept)'; v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN v_out := v_out || ' | T9c a price with no check refused: PASS'; END;

  -- T10 as the roles: anon reads a published event's links, never a draft's, and writes none.
  INSERT INTO public.event_booking_links (event_id, provider, url, set_by) VALUES (v_event, 'humanitix', v_h, 'curated');
  INSERT INTO public.event_booking_links (event_id, provider, url, set_by) VALUES (v_draft, 'eventbrite', v_e, 'curated');
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n FROM public.event_booking_links WHERE event_id IN (v_event, v_draft);
  IF v_n = 1 THEN v_out := v_out || ' | T10a anon reads the published event''s link alone: PASS';
  ELSE v_out := v_out || ' | T10a anon read ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;
  BEGIN
    INSERT INTO public.event_booking_links (event_id, provider, url, set_by) VALUES (v_event, 'other', 'https://bp-proof.example.com/anon', 'curated');
    v_out := v_out || ' | T10b anon writes: FAIL (kept)'; v_fail := v_fail + 1;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | T10b anon writes nothing: PASS'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.event_booking_links SET availability = 'dead' WHERE event_id = v_event;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN v_out := v_out || ' | T10c a signed in user changes nothing: PASS';
    ELSE v_out := v_out || ' | T10c a signed in user changed ' || v_n || ': FAIL'; v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_out := v_out || ' | T10c a signed in user changes nothing: PASS'; END;
  RESET ROLE;

  RAISE EXCEPTION 'PROOF % (% failure(s), rolled back):%',
    CASE WHEN v_fail = 0 THEN 'PASSED' ELSE 'FAILED' END, v_fail, v_out;
END
$proof$;
