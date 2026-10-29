-- THE REPORT A LISTING PROOF (supabase/migrations/20261029150201_removal_request_from_the_event_page.sql), on TEST.
-- One transaction that ends by RAISING its verdict, so TEST is left as found.
--   RED:   this file alone (the migration not there).
--   GREEN: the migration followed by this file, joined, in one transaction:
--          scripts\ops\with-supabase-token.ps1 node scripts/verify/run-proof-on-test.mjs <the two, joined>
-- Every check runs in its own block, so a missing column is reported as that check failing.
DO $proof$
DECLARE
  v_event uuid;
  v_venue uuid;
  v_fail int := 0;
  v_out text := '';
  v_id uuid;
BEGIN
  SELECT id, venue_id INTO v_event, v_venue FROM public.events WHERE status = 'published' AND venue_id IS NOT NULL LIMIT 1;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'PROOF FAILED: TEST holds no published event with a venue';
  END IF;

  -- R1 a visitor's report of one night: a reason, no name, no email.
  BEGIN
    EXECUTE 'insert into public.removal_requests (event_id, reason) values ($1, $2) returning id' INTO v_id
      USING v_event, 'The details are wrong';
    v_out := v_out || E'\nPASS R1 a night reported with a reason alone';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R1 a night reported with a reason alone: ' || SQLERRM;
  END;

  -- R2 the same with an email.
  BEGIN
    EXECUTE 'insert into public.removal_requests (event_id, reason, requester_email) values ($1, $2, $3)'
      USING v_event, 'It is cancelled or not happening', 'someone@example.com';
    v_out := v_out || E'\nPASS R2 a night reported with an email';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R2 a night reported with an email: ' || SQLERRM;
  END;

  -- R3 two targets at once are refused (exactly one of venue, series, event).
  BEGIN
    EXECUTE 'insert into public.removal_requests (event_id, venue_id, reason) values ($1, $2, $3)'
      USING v_event, v_venue, 'two targets';
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R3 a night and a venue in one request were accepted';
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || E'\nPASS R3 two targets refused';
  WHEN OTHERS THEN
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R3 two targets: ' || SQLERRM;
  END;

  -- R4 no target at all is refused.
  BEGIN
    EXECUTE 'insert into public.removal_requests (reason) values ($1)' USING 'no target';
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R4 a request naming nothing was accepted';
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || E'\nPASS R4 no target refused';
  WHEN OTHERS THEN
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R4 no target: ' || SQLERRM;
  END;

  -- R5 an email that is not one is still refused when given.
  BEGIN
    EXECUTE 'insert into public.removal_requests (event_id, reason, requester_email) values ($1, $2, $3)'
      USING v_event, 'bad email', 'not an address';
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R5 a malformed email was accepted';
  EXCEPTION WHEN check_violation THEN
    v_out := v_out || E'\nPASS R5 a malformed email refused';
  WHEN OTHERS THEN
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R5 malformed email: ' || SQLERRM;
  END;

  -- R6 the old shape still holds: a venue request with a name and email, as the outreach reply handler writes it.
  BEGIN
    EXECUTE 'insert into public.removal_requests (venue_id, reason, requester_name, requester_email) values ($1, $2, $3, $4)'
      USING v_venue, 'Asked by reply to an outreach email', 'A Host', 'host@example.com';
    v_out := v_out || E'\nPASS R6 the outreach reply''s venue request still written';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R6 the outreach reply''s venue request: ' || SQLERRM;
  END;

  -- R7 the anonymous and signed in roles still cannot touch the table (the form writes through the server).
  IF has_table_privilege('anon', 'public.removal_requests', 'INSERT') OR has_table_privilege('authenticated', 'public.removal_requests', 'SELECT') THEN
    v_fail := v_fail + 1; v_out := v_out || E'\nFAIL R7 anon or authenticated reaches removal_requests';
  ELSE
    v_out := v_out || E'\nPASS R7 service role only, as before';
  END IF;

  IF v_fail = 0 THEN
    RAISE EXCEPTION 'PROOF PASSED (0 failure(s), rolled back)%', v_out;
  END IF;
  RAISE EXCEPTION 'PROOF FAILED (% failure(s), rolled back)%', v_fail, v_out;
END
$proof$;
