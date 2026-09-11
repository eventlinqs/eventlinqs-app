-- ============================================================================
-- THE RECOVERY ENGINE. Close-out D2. Fillrate v0.
--
-- WHY IT EXISTS. Between 60 and 80 percent of people who start a checkout do not
-- finish, over 85 percent on mobile. Up to 20 percent of those are recoverable by
-- an automated sequence, and it needs no forecast, no model and no history: it
-- works on the first slot. The slot ledger (D1) already records the one thing
-- that makes it possible, which nothing on this platform recorded before: a
-- demand row that carries an address, written the moment somebody entered it and
-- did not then buy.
--
-- WHY IT SPEAKS NO INDUSTRY EITHER. The close-out is explicit: "The engine reads
-- the ledger and nothing else. It must never import from, query, or reference an
-- EventLinqs table, model or type. If it cannot be pointed at a gym's ledger rows
-- tomorrow with only a new adapter, it is built wrong." So these tables name
-- slots and inventory classes, never events and tiers, and they hold foreign keys
-- to the LEDGER and to nothing else.
--
-- WHAT IS HERE, AND WHY EACH TABLE IS SEPARATE FROM THE LEDGER.
--
--   recovery_sends         one row per message actually sent. The ledger is a
--                          record of what the WORLD did; this is a record of what
--                          WE did, and mixing the two would make "what happened"
--                          depend on what we chose to send.
--   recovery_suppressions  who must never be written to again, and why. Append
--                          only in effect: a suppression is never deleted,
--                          because the reason somebody unsubscribed does not stop
--                          being true.
--   ledger_slots.recovery_enabled  the organiser's per-slot switch, on the slot
--                          itself rather than in a second table, because it is a
--                          property of the slot and the engine already reads it.
--
-- WHAT IS DELIBERATELY NOT HERE. No template text, no schedule table, no queue.
-- The three delays (2, 24 and 72 hours) live in code where a test can execute
-- them; a schedule in a table is a schedule nobody has ever run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The organiser's switch. Default ON, which the close-out states.
-- ---------------------------------------------------------------------------
alter table public.ledger_slots
  add column if not exists recovery_enabled boolean not null default true;

comment on column public.ledger_slots.recovery_enabled is
  'Close-out D2: the organiser''s per-slot switch for the recovery engine. Default on. Lives on the slot rather than in a second table because it is a property of the slot, and because the engine reads the slot already.';

-- ---------------------------------------------------------------------------
-- 2. WHAT WE SENT.
--
--    UNIQUE on (slot, address, message number) is the whole safety story. It is
--    not an optimisation: it is the database refusing to send somebody the same
--    message twice however many times a sweep runs, however many times a cron is
--    retried, and however many workers run at once.
-- ---------------------------------------------------------------------------
create table if not exists public.recovery_sends (
  id bigint generated always as identity primary key,

  source_system text not null default 'eventlinqs',
  slot_id uuid not null references public.ledger_slots(id),
  organisation_id uuid not null,

  -- The address is stored in the clear, unlike everything else about a person in
  -- the ledger, for the same reason the demand row's is: you cannot email a hash,
  -- and this table exists to prove who was emailed.
  contact_email text not null,

  -- 1, 2 or 3. Named as a number rather than an enum because the sequence length
  -- is a product decision that the reversal condition can change (a complaint
  -- rate over 2 percent cuts it to one message), and an enum makes that a
  -- migration.
  message_number smallint not null,

  -- What the person was looking at, so the panel can say what was recovered and
  -- a reader can see the message was about the right thing.
  inventory_class text,
  unit_amount_cents integer,

  -- The demand row this message answers. The engine may only ever write to
  -- somebody about a slot they themselves engaged with, and this is the receipt
  -- for that: every send names the exact row that authorised it.
  demand_entry_id bigint not null references public.ledger_entries(id),

  sent_at timestamptz not null default now(),

  constraint recovery_sends_message_number_range check (message_number between 1 and 3),
  constraint recovery_sends_once
    unique (source_system, slot_id, contact_email, message_number)
);

comment on table public.recovery_sends is
  'Close-out D2: one row per recovery message actually sent. The UNIQUE is the safety story: the database refuses to send the same person the same message twice, whatever a retried cron does.';
comment on column public.recovery_sends.demand_entry_id is
  'The demand row that authorised this message. The engine may only contact a person about a slot they themselves started buying, and this is the receipt for it.';

create index if not exists recovery_sends_slot_idx on public.recovery_sends (slot_id, sent_at desc);
create index if not exists recovery_sends_email_idx on public.recovery_sends (contact_email, sent_at desc);

-- ---------------------------------------------------------------------------
-- 3. WHO MUST NEVER BE WRITTEN TO.
--
--    One row per address, platform wide, not per slot. An unsubscribe means
--    "stop", and honouring it only for the slot somebody happened to be looking
--    at when they pressed it is the kind of reading that gets a sending domain
--    blocked. The Spam Act 2003 (Cth) requires a functional unsubscribe that is
--    honoured within 5 working days; this honours it on the next sweep.
-- ---------------------------------------------------------------------------
do $reason$
begin
  if not exists (select 1 from pg_type where typname = 'recovery_suppression_reason') then
    create type public.recovery_suppression_reason as enum (
      'unsubscribed',
      'complained',
      'bounced',
      'organiser_disabled'
    );
  end if;
end
$reason$;

create table if not exists public.recovery_suppressions (
  id bigint generated always as identity primary key,
  source_system text not null default 'eventlinqs',
  contact_email text not null,
  reason public.recovery_suppression_reason not null,
  -- The link somebody clicked. Single use in effect: the row it creates is what
  -- stops the sending, and the token is never reissued for that address.
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),

  constraint recovery_suppressions_once unique (source_system, contact_email),
  constraint recovery_suppressions_token_unique unique (token)
);

comment on table public.recovery_suppressions is
  'Close-out D2: who the recovery engine must never write to again. Platform wide rather than per slot: an unsubscribe means stop, and reading it narrowly is how a sending domain gets blocked.';

create index if not exists recovery_suppressions_email_idx on public.recovery_suppressions (source_system, contact_email);

-- ---------------------------------------------------------------------------
-- 4. THE UNSUBSCRIBE TOKEN, minted per address rather than per message.
--
--    A token that is only good for one message means a person who unsubscribes
--    from message 1 still gets message 2 while their click is in flight. One
--    token per address, minted on first send, is both simpler and safer.
-- ---------------------------------------------------------------------------
create table if not exists public.recovery_contacts (
  id bigint generated always as identity primary key,
  source_system text not null default 'eventlinqs',
  contact_email text not null,
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint recovery_contacts_once unique (source_system, contact_email),
  constraint recovery_contacts_token_unique unique (token)
);

comment on table public.recovery_contacts is
  'Close-out D2: the stable unsubscribe token for one address. Per address rather than per message, so a person who unsubscribes from the first message is not sent the second while their click is in flight.';

create index if not exists recovery_contacts_token_idx on public.recovery_contacts (token);

-- ---------------------------------------------------------------------------
-- 5. THE GRANTS. Same posture as the ledger: RLS on, no policies, service role
--    only. Every reader is a server component that has already proved the
--    caller may act for the organisation.
--
--    recovery_sends is APPEND ONLY for the same reason the ledger is: the panel
--    reports a recovery rate out of it, and a number derived from an editable
--    table is an assertion.
-- ---------------------------------------------------------------------------
create or replace function public.recovery_sends_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'public.recovery_sends is append only: a % was attempted on row %. What was sent cannot be unsent.',
    tg_op, coalesce(old.id::text, '(unknown)')
    using errcode = '42501';
end;
$$;

drop trigger if exists recovery_sends_no_update on public.recovery_sends;
create trigger recovery_sends_no_update
  before update on public.recovery_sends
  for each row execute function public.recovery_sends_are_append_only();

drop trigger if exists recovery_sends_no_delete on public.recovery_sends;
create trigger recovery_sends_no_delete
  before delete on public.recovery_sends
  for each row execute function public.recovery_sends_are_append_only();

alter table public.recovery_sends enable row level security;
alter table public.recovery_suppressions enable row level security;
alter table public.recovery_contacts enable row level security;

revoke all on public.recovery_sends from anon, authenticated;
revoke all on public.recovery_suppressions from anon, authenticated;
revoke all on public.recovery_contacts from anon, authenticated;
revoke update, delete on public.recovery_sends from service_role;

-- ---------------------------------------------------------------------------
-- 6. THE PROBE, so a build can ask a database whether the engine is really
--    installed, exactly as ledger_guards() does for the ledger.
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
  select 'one_message_once',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.recovery_sends'::regclass
                    and conname = 'recovery_sends_once'),
         'the database refuses to send the same person the same message twice'
  union all
  select 'every_send_names_its_authority',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.recovery_sends'::regclass
                    and contype = 'f'
                    and conname like '%demand_entry_id%'),
         'every send names the demand row that authorised it'
  union all
  select 'sends_are_append_only',
         exists (select 1 from pg_trigger where tgname = 'recovery_sends_no_update' and not tgisinternal)
         and exists (select 1 from pg_trigger where tgname = 'recovery_sends_no_delete' and not tgisinternal),
         'what was sent cannot be unsent'
  union all
  select 'service_role_cannot_edit_sends',
         not has_table_privilege('service_role', 'public.recovery_sends', 'UPDATE'),
         'the service role has no UPDATE grant on the send record'
  union all
  select 'anon_cannot_read',
         not has_table_privilege('anon', 'public.recovery_sends', 'SELECT'),
         'anon cannot read who was emailed'
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
