-- SECURITY: A SIGNED IN OWNER CANNOT WRITE THEIR OWN ORGANISATION'S MONEY COLUMNS (window 4, written 25 October 2026).
--
-- FOUND 25 October 2026 while proving 20261023000006, and proved on TEST in a rolled back transaction
-- (C:\dev\EVIDENCE\WI1\GRANTS-HOTFIX-25oct\owner-writes-own-org.txt): as role authenticated, with auth.uid()
-- the owner of an organisation, "UPDATE public.organisations SET hold_amount_cents = 0, stripe_charges_enabled
-- = true WHERE id = <their own>" answered "UPDATED 1 row(s)". The policy "Owners can update their own
-- organisations" is USING (owner_id = auth.uid()) with no column limit, and authenticated holds table level
-- INSERT, UPDATE and DELETE on organisations on production and TEST (20261023000006 kept them, as its
-- approved scope was reading and calling). So through /rest/v1 with their own session an organiser could clear
-- their reserve hold, mark themselves charge ready, lift an admin's payout_status, or create an organisation
-- that starts out with any of those set.
--
-- WHAT THE APPLICATION WRITES THROUGH A SIGNED IN SESSION, every write to organisations in src read
-- (25 October 2026, origin/main f47aea92):
--   INSERT  src/app/(dashboard)/dashboard/organisation/actions.ts:70, the session client (createClient), the
--           create step of organiser onboarding: name, slug, description, website, email, phone, owner_id,
--           status. It is the ONLY session write.
--   Every other write is the service role client (createAdminClient), which this file does not touch:
--           organisation/actions.ts:113 (delete on a failed create), :242 and :335 (updates), src/lib/organisation/
--           logo.ts:147 and :195, src/app/api/stripe/connect/onboard/route.ts:142, src/lib/stripe/connect-handlers.ts:96
--           and :156, src/lib/stripe/reconcile-connect.ts:374, :471 and :510 (every caller passes createAdminClient),
--           src/lib/payments/connect-ledger.ts:369, src/lib/admin/organisers.ts (both updates), and
--           src/lib/walk-in/list-draft.ts:292 and :306 (run by scripts/ops/list-walk-in-draft.mjs with the
--           service key).
-- NOTHING WRITES ORGANISATIONS AS THE CALLER inside the database either (read on both, 25 October,
-- org-writers-0545.json): no invoker function's body writes it; the two invoker triggers on it
-- (set_updated_at, trg_registration_fee_free_window) change the row in flight, which needs no column
-- privilege; every function that updates it is SECURITY DEFINER.
--
-- WHAT THIS FILE DOES. authenticated loses INSERT, UPDATE and DELETE on organisations and is granted INSERT on
-- exactly the eight columns the create step writes. No policy changes: "Authenticated users can create
-- organisations" still checks auth.uid() = owner_id, and the UPDATE policy is left in place with nothing to
-- admit. anon already holds none of the three (20261023000006). It checks itself at its end and raises,
-- rolling the whole file back, if any of it did not take.
--
-- THE VERSION sorts after 20261023000006 and before 20261023000010 (WI2), so `supabase db push --linked` applies
-- it with no --include-all.

revoke insert, update, delete on public.organisations from authenticated;
grant insert (name, slug, description, website, email, phone, owner_id, status)
  on public.organisations to authenticated;

do $owner_writes_check$
declare
  failures text[] := '{}';
  c record;
  writable text[] := array['name', 'slug', 'description', 'website', 'email', 'phone', 'owner_id', 'status'];
begin
  if has_table_privilege('authenticated', 'public.organisations', 'INSERT') then
    failures := failures || 'authenticated holds table level insert'::text;
  end if;
  if has_table_privilege('authenticated', 'public.organisations', 'UPDATE') then
    failures := failures || 'authenticated holds table level update'::text;
  end if;
  if has_table_privilege('authenticated', 'public.organisations', 'DELETE') then
    failures := failures || 'authenticated holds delete'::text;
  end if;
  if has_table_privilege('anon', 'public.organisations', 'INSERT,UPDATE,DELETE') then
    failures := failures || 'anon can write organisations'::text;
  end if;
  for c in
    select a.attname::text as col,
           has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT') as ins,
           has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') as upd
      from pg_attribute a
     where a.attrelid = 'public.organisations'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    if c.upd then failures := failures || ('authenticated can update ' || c.col); end if;
    if c.ins and not (c.col = any (writable)) then failures := failures || ('authenticated can insert ' || c.col); end if;
    if not c.ins and c.col = any (writable) then failures := failures || ('authenticated lost insert on ' || c.col); end if;
  end loop;
  if not (has_table_privilege('service_role', 'public.organisations', 'INSERT')
          and has_table_privilege('service_role', 'public.organisations', 'UPDATE')
          and has_table_privilege('service_role', 'public.organisations', 'DELETE')) then
    failures := failures || 'service_role lost a write'::text;
  end if;

  if array_length(failures, 1) > 0 then
    raise exception 'SECURITY OWNER WRITES post-condition failed: %', array_to_string(failures, '; ');
  end if;
end
$owner_writes_check$;
