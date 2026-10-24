-- SECURITY: THE REST OF THE DEFINER FUNCTIONS MEANT FOR THE SERVICE ROLE, AND ONE VIEW (window 4, written 25 October 2026).
--
-- The second tier of the 25 October grants pass (findings (2) and (3) of window 4's 05:15 line, ruled A by the
-- project manager at 05:30, "each body and caller read before any revoke"). 20261023000006 closed the 28
-- functions that move money and tickets. These sixteen are SECURITY DEFINER too, executable by anon and
-- authenticated on production and TEST (read 25 October, definers-0430.json), and none checks its caller:
--   writes as their owner on anyone's behalf: admit_queue_batch (admits a batch from a virtual queue),
--     promote_waitlist (promotes a waitlist and writes its notifications), join_waitlist and enter_queue (each
--     takes a user id as an argument), rematerialize_seats_additive (rewrites an event's seats), the three
--     sweeps expire_stale_reservations, expire_stale_queue_admissions and expire_waitlist_notifications, and
--     record_platform_notification (writes the founder's notification feed);
--   answers for any email: consent_permits and audience_consent_is_live (whether a person consented, and to
--     what wording);
--   internal rules: marketing_attribution_is_billable, platform_notification_guards, platform_trigger_on, and
--     the two column defaults of marketing_campaign, marketing_attribution_default_window and
--     marketing_campaigner_default_cap.
--
-- EVERY CALLER, read in src (origin/main f47aea92) and in the waiting branches (WI2 parts 1 and 2, v3: none):
--   admit_queue_batch      src/app/api/cron/queue-admit/route.ts:56, createAdminClient
--   expire_stale_queue_admissions  src/app/api/cron/queue-admit/route.ts:26, createAdminClient
--   expire_stale_reservations      src/app/api/cron/reservation-expire/route.ts:34, createAdminClient
--   promote_waitlist       src/lib/waitlist/promote.ts:51, createAdminClient
--   join_waitlist          src/app/actions/waitlist.ts:71, createAdminClient
--   enter_queue            src/app/actions/queue.ts:83, createAdminClient
--   rematerialize_seats_additive   src/app/(dashboard)/dashboard/events/[id]/seats/actions.ts:350, createAdminClient
--   the other nine         no caller in src: they run inside SECURITY DEFINER triggers and functions, as their
--                          owner, and the guards read them with the service key.
-- WHAT ELSE USES THEM (read on both, dependents-tier2-0550.json): no policy, check, invoker function or invoker
-- trigger; two column defaults on marketing_campaign, which only the service role writes; and the view
-- marketing_match_invariant_breaches, which calls audience_consent_is_live.
--
-- THE VIEW. marketing_match_invariant_breaches is readable by anon and authenticated (arwdDxtm) and is not
-- security_invoker, so it runs as its owner past the row policies of marketing_match_score and audience_members
-- (audience member ids and run ids). Its one reader is scripts/guards/matcher-consented-and-capped.mjs with the
-- service key. It goes to the service role only, the 21 October rule's shape: revoke all, then grant exactly.
--
-- NOT HERE, ON PURPOSE: create_reservation, create_seat_reservation, redeem_tier_access_codes and
-- get_current_tier_price serve signed out and signed in buyers by design (granted to anon by name in
-- 20260517000001, 20260705000002 and 20260825000003), so they keep their grants.
--
-- It checks itself at its end and raises, rolling the whole file back, if any of it did not take.
-- THE VERSION sorts after 20261023000007 and before 20261023000010 (WI2).

revoke execute on function public.admit_queue_batch(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admit_queue_batch(uuid, integer, integer) to service_role;
revoke execute on function public.promote_waitlist(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.promote_waitlist(uuid, uuid, integer, integer) to service_role;
revoke execute on function public.join_waitlist(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.join_waitlist(uuid, uuid, uuid, integer) to service_role;
revoke execute on function public.enter_queue(uuid, uuid, text, inet, text) from public, anon, authenticated;
grant execute on function public.enter_queue(uuid, uuid, text, inet, text) to service_role;
revoke execute on function public.rematerialize_seats_additive(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rematerialize_seats_additive(uuid, uuid) to service_role;
revoke execute on function public.expire_stale_reservations() from public, anon, authenticated;
grant execute on function public.expire_stale_reservations() to service_role;
revoke execute on function public.expire_stale_queue_admissions() from public, anon, authenticated;
grant execute on function public.expire_stale_queue_admissions() to service_role;
revoke execute on function public.expire_waitlist_notifications() from public, anon, authenticated;
grant execute on function public.expire_waitlist_notifications() to service_role;
revoke execute on function public.record_platform_notification(platform_notification_kind, text, text, text, uuid, uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_platform_notification(platform_notification_kind, text, text, text, uuid, uuid, uuid, uuid, text, text, text, jsonb) to service_role;
revoke execute on function public.consent_permits(text, text, text, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.consent_permits(text, text, text, text, timestamp with time zone) to service_role;
revoke execute on function public.audience_consent_is_live(text) from public, anon, authenticated;
grant execute on function public.audience_consent_is_live(text) to service_role;
revoke execute on function public.marketing_attribution_is_billable(text, smallint, uuid) from public, anon, authenticated;
grant execute on function public.marketing_attribution_is_billable(text, smallint, uuid) to service_role;
revoke execute on function public.platform_notification_guards() from public, anon, authenticated;
grant execute on function public.platform_notification_guards() to service_role;
revoke execute on function public.platform_trigger_on(text, text) from public, anon, authenticated;
grant execute on function public.platform_trigger_on(text, text) to service_role;
revoke execute on function public.marketing_attribution_default_window() from public, anon, authenticated;
grant execute on function public.marketing_attribution_default_window() to service_role;
revoke execute on function public.marketing_campaigner_default_cap() from public, anon, authenticated;
grant execute on function public.marketing_campaigner_default_cap() to service_role;

revoke all on public.marketing_match_invariant_breaches from public, anon, authenticated, service_role;
grant select on public.marketing_match_invariant_breaches to service_role;

do $definers_check$
declare
  failures text[] := '{}';
  f text;
  service_only text[] := array[
    'public.admit_queue_batch(uuid, integer, integer)', 'public.promote_waitlist(uuid, uuid, integer, integer)',
    'public.join_waitlist(uuid, uuid, uuid, integer)', 'public.enter_queue(uuid, uuid, text, inet, text)',
    'public.rematerialize_seats_additive(uuid, uuid)', 'public.expire_stale_reservations()',
    'public.expire_stale_queue_admissions()', 'public.expire_waitlist_notifications()',
    'public.record_platform_notification(platform_notification_kind, text, text, text, uuid, uuid, uuid, uuid, text, text, text, jsonb)',
    'public.consent_permits(text, text, text, text, timestamp with time zone)', 'public.audience_consent_is_live(text)',
    'public.marketing_attribution_is_billable(text, smallint, uuid)', 'public.platform_notification_guards()',
    'public.platform_trigger_on(text, text)', 'public.marketing_attribution_default_window()',
    'public.marketing_campaigner_default_cap()'];
begin
  foreach f in array service_only loop
    if has_function_privilege('anon', f, 'EXECUTE') then failures := failures || ('anon can execute ' || f); end if;
    if has_function_privilege('authenticated', f, 'EXECUTE') then failures := failures || ('authenticated can execute ' || f); end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then failures := failures || ('service_role cannot execute ' || f); end if;
  end loop;
  if has_table_privilege('anon', 'public.marketing_match_invariant_breaches', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.marketing_match_invariant_breaches', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    failures := failures || 'anon or authenticated still reach marketing_match_invariant_breaches'::text;
  end if;
  if not has_table_privilege('service_role', 'public.marketing_match_invariant_breaches', 'SELECT') then
    failures := failures || 'service_role cannot read marketing_match_invariant_breaches'::text;
  end if;
  -- The buyer path keeps what it was granted by name.
  foreach f in array array['public.create_seat_reservation(uuid, uuid, uuid[], integer, text)',
                           'public.redeem_tier_access_codes(text, uuid[])'] loop
    if not has_function_privilege('anon', f, 'EXECUTE') then failures := failures || ('anon lost the buyer path ' || f); end if;
  end loop;

  if array_length(failures, 1) > 0 then
    raise exception 'SECURITY DEFINERS post-condition failed: %', array_to_string(failures, '; ');
  end if;
end
$definers_check$;
