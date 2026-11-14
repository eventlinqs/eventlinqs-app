-- LAW 24 IS RETIRED: EVERY ORGANISER PAYS THE PLATFORM FEE FROM DAY ONE (Lawal, 15 November 2026, 00:19: "Nobody gets
-- 6 months without any platform fee ... They pay the fee from day one ... no free 6-month platform. No 3-month organiser
-- extra ... every organiser must pay from day one." His law 19 (e) yes for this payments change is in the same order.)
--
-- THE PM'S RULING ON THOSE ALREADY REGISTERED (the same order, item 2): an organiser who registered under the published
-- offer keeps the window they were given, to its date; no new window is ever granted and none is moved later. Read from
-- production on 15 November 2026 at 00:22 (C:/dev/EVIDENCE/EL-15NOV/law24-retired/out-production.json): five
-- organisations, all inside their window, none extended by a referral.
--
-- WHERE LAW 24 LIVED IN THE DATABASE, read in force on production and TEST on 15 November 2026 at 00:26 (identical but
-- for line endings; C:/dev/EVIDENCE/EL-15NOV/law24-retired/in-force-*.json):
--   1. trg_registration_fee_free_window (organisations, before insert) stamped a six-month window on every new row;
--   2. trg_founding_referral_credit and trg_founding_referral_credit_insert (orders) called credit_founding_referral,
--      which moved a referrer's window three months later;
--   3. the constraint organisations_law24_window required every organisation to hold a window of at least six months
--      from its registration, so a new organisation could not be without one;
--   4. order_fee_respects_law24 refused a platform fee on any order before greatest(window, registration + 6 months),
--      which for an organisation with no window is still six months: every new organiser would have been fee-free.
--
-- WHAT THIS MIGRATION DOES, and nothing else:
--   a. drops the three triggers of 1 and 2 (their functions stay, uncalled, so the history reads whole);
--   b. replaces the constraint of 3 with the cutover: an organisation registered before this migration holds a window
--      of at least six months from its registration (never shortened), and one registered after holds none;
--   c. a window never moves later (trg_fee_free_window_never_moves_later), so no referral, admin action or script can
--      grant or extend one;
--   d. changes order_fee_respects_law24 IN PLACE (law 14 (z)) from the function in force, reading the stored window
--      alone: for the organisations of item 2 that is the same instant (the constraint holds it at six months or more
--      from registration), and for everyone else there is none, so the fee is charged from the first paid ticket.
-- The charge itself (src/lib/payments/founding-waiver.ts) has always read the stored window only; it needs no change
-- to charge a new organiser.

drop trigger if exists trg_registration_fee_free_window on public.organisations;
drop trigger if exists trg_founding_referral_credit on public.orders;
drop trigger if exists trg_founding_referral_credit_insert on public.orders;

-- b. The cutover is this migration's own instant, written into the constraint as a literal, so the rule never moves.
do $cutover$
declare
  v_cut timestamptz := now();
begin
  alter table public.organisations drop constraint if exists organisations_law24_window;
  execute format(
    'alter table public.organisations add constraint organisations_law24_window check ('
    || '(created_at < %1$L::timestamptz and founding_fee_free_until is not null '
    || 'and founding_fee_free_until >= public.founding_add_months(created_at, 6)) '
    || 'or (created_at >= %1$L::timestamptz and founding_fee_free_until is null)) not valid',
    v_cut);
  alter table public.organisations validate constraint organisations_law24_window;
  execute format(
    'comment on constraint organisations_law24_window on public.organisations is %L',
    'LAW 24 retired (Lawal, 15 November 2026): an organisation registered before ' || v_cut::text
      || ' keeps a fee-free window of at least six months from its registration; one registered after holds none.'
      || ' Migration 20261115000001.');
end
$cutover$;

-- c. A window never moves later and is never granted.
create or replace function public.fee_free_window_never_moves_later()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $never$
begin
  if new.founding_fee_free_until is not null
     and (old.founding_fee_free_until is null or new.founding_fee_free_until > old.founding_fee_free_until) then
    raise exception 'LAW 24 is retired (15 November 2026): no organisation is given a fee-free window or a later one (organisation %)',
      new.id using errcode = 'check_violation';
  end if;
  return new;
end;
$never$;

revoke all on function public.fee_free_window_never_moves_later() from public, anon, authenticated;

drop trigger if exists trg_fee_free_window_never_moves_later on public.organisations;
create trigger trg_fee_free_window_never_moves_later
  before update of founding_fee_free_until on public.organisations
  for each row execute function public.fee_free_window_never_moves_later();

comment on function public.fee_free_window_never_moves_later() is
  'LAW 24 retired (Lawal, 15 November 2026): a fee-free window is never granted and never moved later; the organisations registered before the cutover keep theirs to its date. Migration 20261115000001.';

-- e. The founding_open switch (FO1's reversal condition, built for this) is set false, so the invite conversion
-- grants no spot and no window; the code switch FOUNDING_OFFER_OPEN closes it as well.
update public.feature_flags
  set enabled = false,
      description = 'LAW 24 retired (Lawal, 15 November 2026): every organiser pays the fee from day one. No new spot is granted and no fee-free window is opened. Migration 20261115000001.'
  where flag = 'founding_open';

-- d. The order trigger reads the stored window alone, changed in place from the function in force (law 14 (z)). The
-- text replaced is one line in both production's and TEST's definitions, so their line endings do not matter.
do $inplace$
declare
  v_def text;
  v_old constant text := 'select greatest(o.founding_fee_free_until, public.founding_add_months(o.created_at, 6)) into v_until';
  v_new constant text := 'select o.founding_fee_free_until into v_until';
  v_count int;
begin
  v_def := pg_get_functiondef('public.order_fee_respects_law24()'::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then
    raise exception 'order_fee_respects_law24: % copies of the registration fallback in force, expected exactly 1', v_count;
  end if;
  execute replace(v_def, v_old, v_new);
end
$inplace$;

comment on function public.order_fee_respects_law24() is
  'An order written inside its organisation''s stored fee-free window carries no platform fee (LAW 24 of 26 September 2026, honoured for the organisations registered before its retirement on 15 November 2026). Migrations 20261101062001 and 20261115000001.';

do $post$
declare
  v_def text;
begin
  if exists (select 1 from pg_trigger where tgname in
      ('trg_registration_fee_free_window', 'trg_founding_referral_credit', 'trg_founding_referral_credit_insert')) then
    raise exception 'a LAW 24 grant trigger is still in place';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_fee_free_window_never_moves_later') then
    raise exception 'trg_fee_free_window_never_moves_later is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_order_fee_respects_law24') then
    raise exception 'trg_order_fee_respects_law24 is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_law24_window' and convalidated
      and pg_get_constraintdef(oid) like '%founding_fee_free_until IS NULL%') then
    raise exception 'organisations_law24_window does not carry the cutover';
  end if;
  v_def := pg_get_functiondef('public.order_fee_respects_law24()'::regprocedure);
  if position('greatest(' in v_def) > 0 then
    raise exception 'order_fee_respects_law24 still falls back to the registration date';
  end if;
end
$post$;
