-- LAW 24 HOLDS AT THE DATABASE (Lawal 1 November 2026 06:15 through the CONTROLLER: "the two Afro-Fusion orders took
-- an EventLinqs fee of A$4.86 (absorb mode) from an organiser inside their six fee free months. Find every path where a
-- fee is set or deducted ... and make Law 24 hold in all of them from the organiser's registration date, one rule, with
-- a guard so it can never recur").
--
-- WHAT WAS FOUND (production, read only, 1 November 06:20): the two orders, EL-9HE57YNV and EL-UGPM3FQV, were priced on
-- 9 and 10 September, before LAW 24 (20 and 26 September), and kept 162 and 324 cents; MKLStudios registered on
-- 27 August and its window now runs to 27 February 2027. Every organisation's window is stamped and none is short. The
-- payout, the application fee, the ledger and the webhook all carry the fee the ORDER recorded, so the order row is the
-- one place every path meets; and the charge sets that fee from the stored window, falling back to the standard fee
-- when its read fails, which inside the window is a breach of LAW 24 that nothing would notice.
--
-- THE ONE RULE, held where every path meets it:
--   1. An organisation's fee-free window can never end before six months from its own registration
--      (founding_fee_free_until >= founding_add_months(created_at, 6), the SQL twin of registrationWaiverUntil). The
--      registration trigger already stamps it; now no edit can shorten it. Referral months only ever move it later.
--   2. An order written inside its organisation's window carries no platform fee. A charge that computed one (a failed
--      waiver read, a new path, a script) is refused at the insert, so the buyer is told to try again and the organiser
--      is never charged; it never reaches the payout, the ledger or a report.
-- Orders written before this migration are left as they are (the two above are settled outside the platform by
-- Lawal, in full, and the ledger records that; item 8).

alter table public.organisations drop constraint if exists organisations_law24_window;
alter table public.organisations add constraint organisations_law24_window
  check (founding_fee_free_until is not null and founding_fee_free_until >= public.founding_add_months(created_at, 6)) not valid;
alter table public.organisations validate constraint organisations_law24_window;

create or replace function public.order_fee_respects_law24()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_until timestamptz;
begin
  if coalesce(new.platform_fee_cents, 0) <= 0 then
    return new;
  end if;
  select greatest(o.founding_fee_free_until, public.founding_add_months(o.created_at, 6)) into v_until
    from public.organisations o where o.id = new.organisation_id;
  if v_until is not null and coalesce(new.created_at, now()) < v_until then
    raise exception 'LAW 24: organisation % has no platform fee until %, so this order carries none (it carried % cents)',
      new.organisation_id, v_until, new.platform_fee_cents using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.order_fee_respects_law24() from public, anon, authenticated;

drop trigger if exists trg_order_fee_respects_law24 on public.orders;
create trigger trg_order_fee_respects_law24
  before insert or update of platform_fee_cents, organisation_id on public.orders
  for each row execute function public.order_fee_respects_law24();

comment on function public.order_fee_respects_law24() is
  'LAW 24 (26 September 2026): an order written inside its organisation''s fee-free window carries no platform fee; a charge that computed one is refused at the insert. Migration 20261101062001.';

do $post$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_order_fee_respects_law24') then
    raise exception 'trg_order_fee_respects_law24 is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_law24_window' and convalidated) then
    raise exception 'organisations_law24_window is missing or not validated';
  end if;
end
$post$;
