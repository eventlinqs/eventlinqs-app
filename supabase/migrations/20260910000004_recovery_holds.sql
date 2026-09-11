-- ============================================================================
-- THE TIME LIMITED HOLD. Close-out D2, the second of the three things.
--
--     "Inventory class sold out, person joins waitlist. A refund or release
--      frees a unit, the waitlist is notified in join order with a time limited
--      hold that passes down the list on expiry."
--
-- WHY IT IS A SEPARATE TABLE FROM THE PLATFORM'S OWN waitlist_notifications.
-- The engine may read the ledger and nothing else, so it cannot read a table
-- that names events and ticket tiers. This is the engine's own record of an
-- offer: who was given a unit, on which slot, until when, and how it ended. The
-- platform's `waitlist_notifications` row is the INVENTORY hold, against a real
-- ticket tier, and it stays exactly where it is; this is the OFFER, and it is
-- what makes the same behaviour available to a gym tomorrow with a new adapter
-- and no new tables.
--
-- WHY THE OFFER AND THE INVENTORY HOLD ARE ALLOWED TO BE TWO ROWS. They record
-- two different facts. "This person was offered a place until 14:20" is true for
-- ever, whatever the inventory does next; "one unit of General Admission is
-- reserved" stops being true the moment the reservation lapses. Collapsing them
-- would mean the engine's recovery rate changed when inventory moved, and a
-- number that changes depending on when you ask it is worth nothing.
--
-- WHY IT IS NOT APPEND ONLY, unlike recovery_sends. A hold has an END, and the
-- end is not knowable when it starts. `claimed_at` and `released_at` are each
-- written ONCE, from null, and a trigger below refuses any other edit: the row
-- can be completed but it can never be rewritten, which is the guarantee that
-- actually matters here.
-- ============================================================================

create table if not exists public.recovery_holds (
  id bigint generated always as identity primary key,

  source_system text not null default 'eventlinqs',
  slot_id uuid not null references public.ledger_slots(id),
  organisation_id uuid not null,

  -- The demand row that put this person in the queue. Same receipt as a send:
  -- the engine may only ever offer somebody a place on a slot they themselves
  -- asked about, and this names the row that authorised it.
  demand_entry_id bigint not null references public.ledger_entries(id),

  contact_email text not null,
  inventory_class text,
  units integer not null default 1,

  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  released_at timestamptz,

  constraint recovery_holds_units_positive check (units > 0),
  constraint recovery_holds_ends_after_it_starts check (expires_at > offered_at),
  -- One outcome, never two. A hold that was claimed was not also released.
  constraint recovery_holds_one_ending check (claimed_at is null or released_at is null),
  -- One offer per person per queue position. A retried sweep re-offers nothing.
  constraint recovery_holds_once unique (source_system, demand_entry_id)
);

comment on table public.recovery_holds is
  'Close-out D2: one row per offer of a freed unit to one person on a waiting list, with the moment it runs out. The engine''s own record, holding foreign keys to the ledger and to nothing else.';
comment on column public.recovery_holds.demand_entry_id is
  'The waitlist_join demand row that authorised this offer. The engine may only offer a place on a slot somebody themselves asked about.';
comment on column public.recovery_holds.expires_at is
  'When the offer runs out and the unit passes down the list. Written once, at the moment of the offer, so an unclaimed hold expires by the clock rather than by a sweep remembering to.';

create index if not exists recovery_holds_slot_idx on public.recovery_holds (slot_id, offered_at desc);
create index if not exists recovery_holds_open_idx
  on public.recovery_holds (slot_id, expires_at)
  where claimed_at is null and released_at is null;

-- ---------------------------------------------------------------------------
-- A HOLD IS COMPLETED, NEVER REWRITTEN.
--
-- Everything except the two ending timestamps is immutable, and each of those
-- may go from null to a value exactly once. Without this the recovery rate the
-- proof panel reports would be a number anybody could edit, which is an
-- assertion rather than a measurement.
-- ---------------------------------------------------------------------------
create or replace function public.recovery_holds_complete_only()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.source_system is distinct from old.source_system
     or new.slot_id is distinct from old.slot_id
     or new.organisation_id is distinct from old.organisation_id
     or new.demand_entry_id is distinct from old.demand_entry_id
     or new.contact_email is distinct from old.contact_email
     or new.inventory_class is distinct from old.inventory_class
     or new.units is distinct from old.units
     or new.offered_at is distinct from old.offered_at
     or new.expires_at is distinct from old.expires_at then
    raise exception
      'public.recovery_holds row % may be completed but never rewritten: only claimed_at and released_at may change.',
      old.id
      using errcode = '42501';
  end if;
  if old.claimed_at is not null and new.claimed_at is distinct from old.claimed_at then
    raise exception 'public.recovery_holds row % was already claimed at %.', old.id, old.claimed_at
      using errcode = '42501';
  end if;
  if old.released_at is not null and new.released_at is distinct from old.released_at then
    raise exception 'public.recovery_holds row % was already released at %.', old.id, old.released_at
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists recovery_holds_no_rewrite on public.recovery_holds;
create trigger recovery_holds_no_rewrite
  before update on public.recovery_holds
  for each row execute function public.recovery_holds_complete_only();

create or replace function public.recovery_holds_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'public.recovery_holds is never deleted from: offer % was made and that does not stop being true.',
    old.id
    using errcode = '42501';
end;
$$;

drop trigger if exists recovery_holds_never_deleted on public.recovery_holds;
create trigger recovery_holds_never_deleted
  before delete on public.recovery_holds
  for each row execute function public.recovery_holds_no_delete();

alter table public.recovery_holds enable row level security;
revoke all on public.recovery_holds from anon, authenticated;
revoke delete on public.recovery_holds from service_role;

-- ---------------------------------------------------------------------------
-- THE PROBE GROWS TWO CLAUSES, so a build can ask a database whether the
-- waitlist half is really installed rather than reading a migration file and
-- assuming it ran.
-- ---------------------------------------------------------------------------
create or replace function public.recovery_guards()
returns table (name text, installed boolean, detail text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'sends_table'::text, to_regclass('public.recovery_sends') is not null,
         'the record of what was sent exists'::text
  union all
  select 'suppressions_table', to_regclass('public.recovery_suppressions') is not null,
         'the record of who must not be written to exists'
  union all
  select 'contacts_table', to_regclass('public.recovery_contacts') is not null,
         'the stable unsubscribe token exists'
  union all
  select 'holds_table', to_regclass('public.recovery_holds') is not null,
         'the time limited offer of a freed unit exists'
  union all
  select 'one_message_once',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.recovery_sends'::regclass
                    and conname = 'recovery_sends_once'),
         'the database refuses to send the same person the same message twice'
  union all
  select 'one_offer_once',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.recovery_holds'::regclass
                    and conname = 'recovery_holds_once'),
         'the database refuses to offer the same queue position twice'
  union all
  select 'every_send_names_its_authority',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.recovery_sends'::regclass
                    and contype = 'f'
                    and conname like '%demand_entry_id%'),
         'every send names the demand row that authorised it'
  union all
  select 'every_offer_names_its_authority',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.recovery_holds'::regclass
                    and contype = 'f'
                    and conname like '%demand_entry_id%'),
         'every offer names the demand row that authorised it'
  union all
  select 'sends_are_append_only',
         exists (select 1 from pg_trigger where tgname = 'recovery_sends_no_update' and not tgisinternal)
         and exists (select 1 from pg_trigger where tgname = 'recovery_sends_no_delete' and not tgisinternal),
         'what was sent cannot be unsent'
  union all
  select 'holds_are_completed_not_rewritten',
         exists (select 1 from pg_trigger where tgname = 'recovery_holds_no_rewrite' and not tgisinternal)
         and exists (select 1 from pg_trigger where tgname = 'recovery_holds_never_deleted' and not tgisinternal),
         'a hold may be completed but never rewritten, and never deleted'
  union all
  select 'service_role_cannot_edit_sends',
         not has_table_privilege('service_role', 'public.recovery_sends', 'UPDATE'),
         'the service role has no UPDATE grant on the send record'
  union all
  select 'anon_cannot_read',
         not has_table_privilege('anon', 'public.recovery_sends', 'SELECT')
         and not has_table_privilege('anon', 'public.recovery_holds', 'SELECT'),
         'anon cannot read who was emailed or who was offered a place'
  union all
  select 'one_suppression_per_address',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.recovery_suppressions'::regclass
                    and conname = 'recovery_suppressions_once'),
         'an address is suppressed once, platform wide'
  union all
  select 'organiser_switch',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ledger_slots'
                    and column_name = 'recovery_enabled'),
         'an organiser can switch it off for one slot';
$$;

revoke all on function public.recovery_guards() from public, anon, authenticated;
grant execute on function public.recovery_guards() to service_role;
