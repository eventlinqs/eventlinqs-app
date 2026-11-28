-- WINDOW 5A, 28 November 2026 (the PM's 22:50, fix (d): test orders never count in sales, revenue or ticket figures,
-- history kept; C:\dev\EVIDENCE\EL-28NOV\incident\V4-qa-orders.md).
--
-- Read on production at 22:38 (OUR DATA): two QA journey orders of 21 November, EL-D6JLKAAP and EL-3KFUDC47, $0 each,
-- bought from a hello+qa address on a QA night whose is_test is true, carry orders.is_test FALSE. They were made at 14:12
-- and 15:04 AEDT that day, after migration 20261121140001 read production (13:47: "no test order") and before it was
-- applied, and its backfill rewrote no order. Every count of the owner's sales now leaves out orders.is_test, so these
-- two would still count as real orders and their tickets as sold.
--
-- An order takes its night's mark or its buyer's, exactly as order_is_test_from_night_or_buyer gives it on insert
-- (20261121140001). Only is_test changes: no amount, no status, no row deleted (law 19 (d)); a row already marked is
-- left as it is, so the file is re-runnable. Fires set_updated_at and the add on recount (both idempotent); the owner's
-- notice and the referral credit fire on a status change only, which this is not.
update public.orders o
   set is_test = true
 where o.is_test = false
   and (
     exists (select 1 from public.events e where e.id = o.event_id and e.is_test)
     or coalesce(lower(btrim(o.guest_email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$', false)
     or exists (
       select 1 from auth.users u
        where u.id = o.user_id
          and lower(btrim(u.email)) ~ '^hello\+(qa|test|acceptance)[^@]*@eventlinqs\.com$'
     )
   );
