-- SECURITY HOTFIX: WHAT ANON AND A SIGNED IN USER CAN READ AND CALL (window 4, written 25 October 2026).
--
-- READ ON PRODUCTION, 25 October 2026, read only through the Management API (the scripts and their raw
-- output: C:\dev\EVIDENCE\WI1\GRANTS-HOTFIX-25oct\ and C:\dev\EVIDENCE\WI1\VENUES-GRANTS-25oct\):
--
--   1. anon and authenticated hold TABLE LEVEL select (with insert, update, delete, truncate, references,
--      trigger and maintain) on organisations, venues, seats and event_artists. Table level select reaches
--      every column, so with the anon key every page carries anyone can read organisations.email, phone,
--      owner_id, abn, legal_name and every stripe_* and payout_* column, venues.stripe_* and
--      revenue_share_*, seats.held_by_user_id and event_artists.invite_token (a single use credential that
--      transfers an artist profile). 20260818000001 and 20260819000002 narrowed exactly these and are
--      recorded as applied on production; the table level grant came back after them. TEST does not have
--      it, which is why every proof on TEST passed.
--   2. anon and authenticated can EXECUTE SECURITY DEFINER functions the migrations meant for the service
--      role only, none of which checks its caller: confirm_order confirms any pending order and the ticket
--      trigger mints its tickets, so a buyer could take tickets without paying through /rest/v1/rpc; and
--      write_pricing_rule writes the fee, disburse_* and void_* write payouts, freeze_ and
--      resolve_chargeback move held money. PUBLIC also holds EXECUTE on thirteen of them, so a revoke from
--      anon alone would leave it reachable.
--
-- WHAT THIS FILE DOES.
--
--   A. The four tables. SELECT is revoked from anon and authenticated and granted again on exactly the
--      columns the migrations made public. PostgreSQL drops a role's column grants when its table grant
--      is revoked ("When revoking privileges on a table, the corresponding column privileges (if any) are
--      automatically revoked on each column of the table, as well",
--      https://www.postgresql.org/docs/17/sql-revoke.html, read 25 October 2026), so every column grant a
--      role held before this file is granted again, except the private columns named below. On production
--      that is exactly the lists below; on TEST it also keeps the public columns later migrations granted.
--      Truncate, references, trigger and maintain are revoked from both roles (no policy serves them), and
--      insert, update and delete from anon on all four and from authenticated on seats, because no policy
--      serves those (every write policy names an organisation the caller owns or is a member of, or the
--      service role). Authenticated keeps insert, update and delete on organisations, venues and
--      event_artists, which its owner and member policies serve.
--   B. The functions. EXECUTE is revoked from PUBLIC, anon and authenticated and granted to service_role on
--      every function below whose every caller in src is the service role client (createAdminClient), each
--      caller listed beside it. scan_ticket and transfer_ticket are called by a signed in user through the
--      session client and check auth.uid() themselves, so they lose PUBLIC and anon only.
--   C. The file checks itself at the end and raises, rolling the whole file back, if any of it did not
--      take.
--
-- WHAT IT DOES NOT TOUCH. No table, column, policy or function body changes. The policy helpers
-- el_owned_organisation_ids, el_member_organisation_ids and el_any_member_organisation_ids keep their
-- grants: the row policies call them as the caller (20260819000001). No function here is called by a
-- policy, a column default, a check, a view or an invoker function (read on both databases, 25 October).
--
-- THE VERSION sorts after 20261023000005 (production's newest) and before 20261023000010 (WI2, not yet on
-- production), so `supabase db push --linked` applies it with no --include-all.

-- A. THE FOUR TABLES ------------------------------------------------------------------------------------

do $hotfix_tables$
declare
  spec record;
  r text;
  keep text[];
begin
  for spec in
    select * from (values
      ('organisations',
       array['id','name','slug','description','logo_url','website','instagram_handle','short_name'],
       null::text[]),
      ('venues',
       array['id','name','description','image_url','capacity','address','city','state','country','postal_code',
             'latitude','longitude','organisation_id','is_active','created_at','updated_at'],
       array['stripe_account_id','stripe_account_country','stripe_payouts_enabled','revenue_share_status',
             'revenue_share_enrolled_at','revenue_share_unenrolled_at','published_email','removed_at']),
      ('seats',
       array['id','event_id','seat_map_section_id','ticket_tier_id','row_label','seat_number','seat_type','status',
             'x','y','price_cents','held_reason','note','created_at','updated_at'],
       array['reservation_id','order_item_id','held_by_user_id','metadata']),
      ('event_artists',
       array['id','event_id','artist_id','billing_order','status','created_at'],
       array['invite_token'])
    ) as t(tbl, public_cols, private_cols)
  loop
    foreach r in array array['anon','authenticated'] loop
      -- The column grants this role holds now, other than private ones. For organisations nothing outside the
      -- public list is kept: the founder's ruling of 8 August 2026 names its public fields and "nothing else".
      select coalesce(array_agg(a.attname::text order by a.attnum), '{}') into keep
        from pg_attribute a, aclexplode(a.attacl) g
       where a.attrelid = format('public.%I', spec.tbl)::regclass
         and a.attnum > 0 and not a.attisdropped
         and g.grantee = r::regrole::oid and g.privilege_type = 'SELECT'
         and spec.private_cols is not null
         and not (a.attname::text = any (spec.private_cols));

      execute format('revoke select, truncate, references, trigger, maintain on public.%I from %I', spec.tbl, r);
      execute format('grant select (%s) on public.%I to %I',
        (select string_agg(format('%I', c), ', ') from (select distinct unnest(spec.public_cols || keep) as c) as u),
        spec.tbl, r);
      if r = 'anon' or spec.tbl = 'seats' then
        execute format('revoke insert, update, delete on public.%I from %I', spec.tbl, r);
      end if;
    end loop;
  end loop;
end
$hotfix_tables$;

-- B. THE FUNCTIONS --------------------------------------------------------------------------------------
-- Each line names every caller in src (25 October 2026, origin/main f47aea92); each is createAdminClient().

-- The order and ticket path.
revoke execute on function public.confirm_order(uuid) from public, anon, authenticated;
grant execute on function public.confirm_order(uuid) to service_role;
  -- src/app/actions/checkout.ts:590 and :990, src/app/actions/register-free.ts:210, src/app/api/webhooks/stripe/route.ts:336
revoke execute on function public.issue_tickets_for_order(uuid) from public, anon, authenticated;
grant execute on function public.issue_tickets_for_order(uuid) to service_role;
  -- no caller in src: called inside confirm_order's trigger, which runs as its owner
revoke execute on function public.transition_payment_status(uuid, payment_status, jsonb) from public, anon, authenticated;
grant execute on function public.transition_payment_status(uuid, payment_status, jsonb) to service_role;
  -- src/app/api/webhooks/stripe/route.ts:353, :760 and :782
revoke execute on function public.increment_sold_count(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_sold_count(uuid, integer) to service_role;
  -- src/app/api/webhooks/stripe/route.ts:993
revoke execute on function public.increment_discount_uses(uuid) from public, anon, authenticated;
grant execute on function public.increment_discount_uses(uuid) to service_role;
  -- src/lib/payments/discount-usage.ts:136, given the admin client by checkout.ts:609 and the webhook's :408
revoke execute on function public.assign_order_seats(uuid) from public, anon, authenticated;
grant execute on function public.assign_order_seats(uuid) to service_role;
  -- no caller in src
revoke execute on function public.reassign_ticket_seat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reassign_ticket_seat(uuid, uuid) to service_role;
  -- src/app/(dashboard)/dashboard/events/[id]/seats/actions.ts:164 and :237, src/app/actions/self-seat.ts:160
revoke execute on function public.materialize_seats(uuid, uuid) from public, anon, authenticated;
grant execute on function public.materialize_seats(uuid, uuid) to service_role;
  -- src/app/(dashboard)/dashboard/events/actions.ts:537 and :951
revoke execute on function public.release_expired_seat_reservations() from public, anon, authenticated;
grant execute on function public.release_expired_seat_reservations() to service_role;
  -- src/app/api/cron/reservation-expire/route.ts:69
revoke execute on function public.expire_stale_squads() from public, anon, authenticated;
grant execute on function public.expire_stale_squads() to service_role;
  -- src/app/api/cron/squad-expire/route.ts:61

-- Refunds and disputes.
revoke execute on function public.reconcile_refund(text, text, bigint) from public, anon, authenticated;
grant execute on function public.reconcile_refund(text, text, bigint) to service_role;
  -- src/app/api/webhooks/stripe/route.ts:1143 and :1171
revoke execute on function public.create_refund_request(uuid, uuid[], refund_reason, refund_initiator, uuid, text) from public, anon, authenticated;
grant execute on function public.create_refund_request(uuid, uuid[], refund_reason, refund_initiator, uuid, text) to service_role;
  -- src/lib/payments/refund-service.ts:76, given the admin client by every caller of requestTicketRefund
revoke execute on function public.freeze_chargeback(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.freeze_chargeback(uuid, text, bigint) to service_role;
  -- src/app/api/webhooks/stripe/route.ts:2462
revoke execute on function public.resolve_chargeback(text, text) from public, anon, authenticated;
grant execute on function public.resolve_chargeback(text, text) to service_role;
  -- src/app/api/webhooks/stripe/route.ts:2542

-- Payouts, balances and the fee.
revoke execute on function public.disburse_payout(uuid, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.disburse_payout(uuid, text, bigint, uuid) to service_role;
  -- src/lib/payments/payout.ts:165
revoke execute on function public.disburse_transfer(uuid, uuid, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.disburse_transfer(uuid, uuid, text, bigint, uuid) to service_role;
  -- src/lib/payments/event-transfer.ts:119
revoke execute on function public.disburse_venue_share(uuid, uuid, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.disburse_venue_share(uuid, uuid, text, bigint, uuid) to service_role;
  -- src/lib/payments/venue-transfer.ts:110
revoke execute on function public.void_payout(uuid, text, text) from public, anon, authenticated;
grant execute on function public.void_payout(uuid, text, text) to service_role;
  -- src/lib/payments/event-transfer.ts:227, src/lib/payments/payout.ts:270 and :305
revoke execute on function public.void_venue_payout(uuid, text, text) from public, anon, authenticated;
grant execute on function public.void_venue_payout(uuid, text, text) to service_role;
  -- src/lib/payments/venue-transfer.ts:211
revoke execute on function public.release_holds() from public, anon, authenticated;
grant execute on function public.release_holds() to service_role;
  -- src/lib/payments/payout.ts:327
revoke execute on function public.organiser_available_balance(uuid, text) from public, anon, authenticated;
grant execute on function public.organiser_available_balance(uuid, text) to service_role;
  -- src/lib/admin/payouts.ts:72, src/lib/payouts/queries.ts:164, src/lib/refunds/request-service.ts:211
revoke execute on function public.organiser_event_available_balance(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.organiser_event_available_balance(uuid, uuid, text) to service_role;
  -- no caller in src
revoke execute on function public.venue_event_share_balance(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.venue_event_share_balance(uuid, uuid, text) to service_role;
  -- no caller in src
revoke execute on function public.write_pricing_rule(text, text, text, text, uuid, uuid, uuid, numeric, bigint, bigint) from public, anon, authenticated;
grant execute on function public.write_pricing_rule(text, text, text, text, uuid, uuid, uuid, numeric, bigint, bigint) to service_role;
  -- src/lib/admin/pricing.ts:235, src/lib/admin/venues.ts:156

-- Growth, audience and the directory.
revoke execute on function public.claim_founding_spot(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_founding_spot(uuid, text) to service_role;
  -- no caller in src
revoke execute on function public.record_marketing_decline(text, text, text, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.record_marketing_decline(text, text, text, text, timestamp with time zone) to service_role;
  -- no caller in src
revoke execute on function public.refresh_audience_member(text) from public, anon, authenticated;
grant execute on function public.refresh_audience_member(text) to service_role;
  -- no caller in src: called by the audience triggers, which run as their owner
revoke execute on function public.directory_artists_ranked_by_draw(text, text, boolean, boolean, integer) from public, anon, authenticated;
grant execute on function public.directory_artists_ranked_by_draw(text, text, boolean, boolean, integer) to service_role;
  -- src/lib/marketplace/showcase.ts:233, given the admin client by src/app/artists/page.tsx:77

-- Signed in callers only.
revoke execute on function public.scan_ticket(text, uuid, uuid, text) from public, anon;
grant execute on function public.scan_ticket(text, uuid, uuid, text) to authenticated, service_role;
  -- src/app/scan/actions.ts:40, the session client after auth.getUser() refuses a signed out caller
revoke execute on function public.transfer_ticket(uuid, text, text) from public, anon;
grant execute on function public.transfer_ticket(uuid, text, text) to authenticated, service_role;
  -- src/app/actions/transfer-ticket.ts:78, the session client of a signed in holder; a guest goes through
  -- transfer_ticket_for_order with the admin client (:72)

-- C. THE FILE CHECKS ITSELF -----------------------------------------------------------------------------

do $hotfix_check$
declare
  failures text[] := '{}';
  r text;
  f text;
  c record;
  service_only text[] := array[
    'public.confirm_order(uuid)', 'public.issue_tickets_for_order(uuid)',
    'public.transition_payment_status(uuid, payment_status, jsonb)', 'public.increment_sold_count(uuid, integer)',
    'public.increment_discount_uses(uuid)', 'public.assign_order_seats(uuid)', 'public.reassign_ticket_seat(uuid, uuid)',
    'public.materialize_seats(uuid, uuid)', 'public.release_expired_seat_reservations()', 'public.expire_stale_squads()',
    'public.reconcile_refund(text, text, bigint)',
    'public.create_refund_request(uuid, uuid[], refund_reason, refund_initiator, uuid, text)',
    'public.freeze_chargeback(uuid, text, bigint)', 'public.resolve_chargeback(text, text)',
    'public.disburse_payout(uuid, text, bigint, uuid)', 'public.disburse_transfer(uuid, uuid, text, bigint, uuid)',
    'public.disburse_venue_share(uuid, uuid, text, bigint, uuid)', 'public.void_payout(uuid, text, text)',
    'public.void_venue_payout(uuid, text, text)', 'public.release_holds()', 'public.organiser_available_balance(uuid, text)',
    'public.organiser_event_available_balance(uuid, uuid, text)', 'public.venue_event_share_balance(uuid, uuid, text)',
    'public.write_pricing_rule(text, text, text, text, uuid, uuid, uuid, numeric, bigint, bigint)',
    'public.claim_founding_spot(uuid, text)',
    'public.record_marketing_decline(text, text, text, text, timestamp with time zone)',
    'public.refresh_audience_member(text)', 'public.directory_artists_ranked_by_draw(text, text, boolean, boolean, integer)'];
  signed_in text[] := array['public.scan_ticket(text, uuid, uuid, text)', 'public.transfer_ticket(uuid, text, text)'];
begin
  foreach f in array service_only loop
    if has_function_privilege('anon', f, 'EXECUTE') then failures := failures || ('anon can execute ' || f); end if;
    if has_function_privilege('authenticated', f, 'EXECUTE') then failures := failures || ('authenticated can execute ' || f); end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then failures := failures || ('service_role cannot execute ' || f); end if;
  end loop;
  foreach f in array signed_in loop
    if has_function_privilege('anon', f, 'EXECUTE') then failures := failures || ('anon can execute ' || f); end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then failures := failures || ('authenticated cannot execute ' || f); end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then failures := failures || ('service_role cannot execute ' || f); end if;
  end loop;

  foreach r in array array['anon', 'authenticated'] loop
    foreach f in array array['organisations', 'venues', 'seats', 'event_artists'] loop
      if has_table_privilege(r, 'public.' || f, 'SELECT') then failures := failures || (r || ' holds table select on ' || f); end if;
      if has_table_privilege(r, 'public.' || f, 'TRUNCATE') then failures := failures || (r || ' can truncate ' || f); end if;
      if r = 'anon' and has_table_privilege(r, 'public.' || f, 'INSERT,UPDATE,DELETE') then
        failures := failures || ('anon can write ' || f);
      end if;
    end loop;
    if has_table_privilege(r, 'public.seats', 'INSERT,UPDATE,DELETE') then failures := failures || (r || ' can write seats'); end if;
  end loop;

  -- Every column, by name, on whichever database this runs: what each role may read.
  for c in
    select a.attrelid::regclass::text as tbl, a.attname::text as col,
           has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT') as anon_reads,
           has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT') as auth_reads
      from pg_attribute a
     where a.attrelid in ('public.organisations'::regclass, 'public.venues'::regclass, 'public.seats'::regclass,
                          'public.event_artists'::regclass)
       and a.attnum > 0 and not a.attisdropped
  loop
    if (c.tbl = 'organisations' and c.col in ('id','name','slug','description','logo_url','website','instagram_handle','short_name'))
       or (c.tbl = 'venues' and c.col in ('id','name','description','image_url','capacity','address','city','state','country',
            'postal_code','latitude','longitude','organisation_id','is_active','created_at','updated_at'))
       or (c.tbl = 'seats' and c.col in ('id','event_id','seat_map_section_id','ticket_tier_id','row_label','seat_number',
            'seat_type','status','x','y','price_cents','held_reason','note','created_at','updated_at'))
       or (c.tbl = 'event_artists' and c.col in ('id','event_id','artist_id','billing_order','status','created_at')) then
      if not c.anon_reads then failures := failures || ('anon lost public ' || c.tbl || '.' || c.col); end if;
      if not c.auth_reads then failures := failures || ('authenticated lost public ' || c.tbl || '.' || c.col); end if;
    elsif c.tbl = 'organisations'
       or (c.tbl = 'venues' and c.col in ('stripe_account_id','stripe_account_country','stripe_payouts_enabled',
            'revenue_share_status','revenue_share_enrolled_at','revenue_share_unenrolled_at','published_email','removed_at'))
       or (c.tbl = 'seats' and c.col in ('reservation_id','order_item_id','held_by_user_id','metadata'))
       or (c.tbl = 'event_artists' and c.col = 'invite_token') then
      if c.anon_reads then failures := failures || ('anon reads private ' || c.tbl || '.' || c.col); end if;
      if c.auth_reads then failures := failures || ('authenticated reads private ' || c.tbl || '.' || c.col); end if;
    end if;
  end loop;

  if array_length(failures, 1) > 0 then
    raise exception 'SECURITY GRANTS HOTFIX post-condition failed: %', array_to_string(failures, '; ');
  end if;
end
$hotfix_check$;
