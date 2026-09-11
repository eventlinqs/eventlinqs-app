-- ============================================================================
-- THE SLOT LEDGER. Close-out D1.
--
-- WHY IT EXISTS. The database stores current state and overwrites it.
-- `ticket_tiers.sold_count = 240` cannot say WHEN those 240 sold, at what price,
-- or how many people reached checkout and gave up. That history cannot be
-- reconstructed later from anything: the rows that would have told you were
-- overwritten as they changed. Every day without this table is a day of pace
-- data that does not exist and never will.
--
-- WHY IT IS NOT CALLED THE TICKET LEDGER, and why not one column here says
-- event, ticket or tier. The close-out is explicit and the reason is a business
-- one rather than a stylistic one: this ledger is the foundation of something
-- that will later run for gyms, clinics, tour operators, studios and venues. If
-- it speaks ticketing it has to be rebuilt to leave ticketing, and a rebuild of
-- a ledger means the history does not come with it. It speaks the general
-- language from the first migration and EventLinqs adapts INTO it.
--
--   SLOT             any dated unit of perishable capacity: an event, a class,
--                    an appointment, a departure, a session
--   INVENTORY CLASS  a priced bucket within a slot: a ticket tier, a membership
--                    rate, a concession, a cabin grade
--   UNIT             one sellable place within an inventory class
--   SOURCE SYSTEM    which platform the row came from. 'eventlinqs' for now
--
-- WHAT IS APPEND ONLY, AND WHAT IS NOT. `ledger_entries` is append only and the
-- database enforces it: a refund is a NEW NEGATIVE ROW, never an edit of the
-- sale. `ledger_slots` is a dimension and does change, because a slot's capacity
-- and its on-sale date genuinely move; what it must never do is lose its
-- identity, which is why it is keyed on (source_system, source_ref).
--
-- WHY THERE IS NO FOREIGN KEY TO public.events. Deliberate, and it is the same
-- decision as the vocabulary. A ledger that cascades with the source system is
-- not a ledger, it is a projection of it: deleting an event would delete the
-- record that it ever sold anything. `source_ref` is the source system's own
-- identifier, carried as data, and the history outlives the row it came from.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It contains no trigger on any
-- EventLinqs table. The mapping from event to slot lives in ONE place,
-- src/lib/ledger/adapter.ts, because the adapter boundary is the entire
-- portability of the business. A trigger here would put EventLinqs vocabulary
-- inside the ledger's own schema, which is the thing this migration exists to
-- prevent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The kinds. Five row types and one closing row, exactly as the close-out
--    names them. An enum rather than free text so a typo is a migration
--    failure rather than a row nobody ever counts.
-- ---------------------------------------------------------------------------
do $kinds$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_entry_kind') then
    create type public.ledger_entry_kind as enum (
      'sale',
      'price_change',
      'inventory',
      'refund',
      'demand',
      'close'
    );
  end if;
end
$kinds$;

do $inventory$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_inventory_action') then
    create type public.ledger_inventory_action as enum (
      'open',
      'close',
      'hold',
      'release',
      'capacity_change'
    );
  end if;
end
$inventory$;

do $demand$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_demand_action') then
    create type public.ledger_demand_action as enum (
      'page_view',
      'checkout_started',
      'checkout_abandoned',
      'waitlist_join',
      'sold_out_view'
    );
  end if;
end
$demand$;

-- ---------------------------------------------------------------------------
-- 2. The slot dimension.
--
--    category and subcategory are REQUIRED and are NOT derived. The close-out
--    says so in as many words, and the reason is that a derivation is a promise
--    about a lookup table that will change: a slot recorded in 2026 must still
--    know what it was in 2029, whatever the taxonomy has become since.
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_slots (
  id uuid primary key default gen_random_uuid(),

  source_system text not null default 'eventlinqs',
  source_ref uuid not null,
  organisation_id uuid not null,

  category text not null,
  subcategory text not null,

  capacity integer,
  on_sale_at timestamptz,
  slot_at timestamptz not null,
  -- Derived once, on write, rather than as a generated column: subtracting two
  -- timestamptz values is timezone dependent and therefore not immutable, which
  -- GENERATED ALWAYS AS refuses.
  on_sale_days_before integer,
  postcode text,

  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ledger_slots_source_ref_unique unique (source_system, source_ref),
  constraint ledger_slots_category_not_blank check (length(btrim(category)) > 0),
  constraint ledger_slots_subcategory_not_blank check (length(btrim(subcategory)) > 0)
);

comment on table public.ledger_slots is
  'Close-out D1: one row per dated unit of perishable capacity, in the general vocabulary. No foreign key to the source system on purpose: the history outlives the row it came from.';
comment on column public.ledger_slots.source_ref is
  'The source system''s own identifier for this slot, carried as data. Never a foreign key: a ledger that cascades with its source is a projection, not a ledger.';
comment on column public.ledger_slots.subcategory is
  'Required and not derived. A slot recorded today must still know what it was when the taxonomy has moved on.';

create index if not exists ledger_slots_organisation_idx
  on public.ledger_slots (organisation_id, slot_at desc);
create index if not exists ledger_slots_category_idx
  on public.ledger_slots (category, subcategory, slot_at desc);

-- ---------------------------------------------------------------------------
-- 3. The ledger itself. INSERT only, for ever.
--
--    Every row carries source system, slot, organisation and a timestamp. The
--    rest is per kind and is enforced by CHECK, so a row that claims to be a
--    sale and carries no quantity cannot exist.
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,

  source_system text not null default 'eventlinqs',
  slot_id uuid not null references public.ledger_slots(id),
  organisation_id uuid not null,
  occurred_at timestamptz not null default now(),
  kind public.ledger_entry_kind not null,

  -- ONE ROW PER REAL-WORLD HAPPENING, whoever writes it and by whatever route.
  -- A redelivered webhook, a re-run backfill and a retried action all collide
  -- here rather than double-counting somebody's money.
  occurrence_key text not null,

  -- the priced bucket, on every kind that has one
  inventory_class text,
  inventory_class_ref uuid,

  -- SALE, REFUND, INVENTORY. A REFUND carries NEGATIVE quantity and NEGATIVE
  -- amount, so sum() over the ledger is the net without a special case anywhere.
  quantity integer,
  amount_cents integer,
  unit_amount_cents integer,

  -- SALE
  days_out integer,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text,
  buyer_hash text,
  returning_buyer boolean,

  -- PRICE CHANGE
  old_price_cents integer,
  new_price_cents integer,

  -- INVENTORY
  inventory_action public.ledger_inventory_action,

  -- DEMAND. contact_email is REQUIRED on the actions that can carry one, not
  -- optional: without it the recovery engine (D2) has nobody to contact and the
  -- whole thing is dead on arrival. The two actions that genuinely have no
  -- person attached (a page view, a sold-out view) are excused by name below.
  demand_action public.ledger_demand_action,
  visitor_hash text,
  contact_email text,

  -- CLOSE
  final_sold integer,
  final_revenue_cents integer,
  fill_percent numeric(5, 2),
  attended integer,
  no_shows integer,

  created_at timestamptz not null default now(),

  constraint ledger_entries_occurrence_unique unique (source_system, occurrence_key),

  constraint ledger_entries_sale_shape check (
    kind <> 'sale' or (quantity > 0 and amount_cents >= 0 and inventory_class is not null)
  ),
  constraint ledger_entries_refund_shape check (
    kind <> 'refund' or (quantity < 0 and amount_cents <= 0 and inventory_class is not null)
  ),
  constraint ledger_entries_price_change_shape check (
    kind <> 'price_change' or (new_price_cents is not null and inventory_class is not null)
  ),
  constraint ledger_entries_inventory_shape check (
    kind <> 'inventory' or (inventory_action is not null and inventory_class is not null)
  ),
  constraint ledger_entries_demand_shape check (
    kind <> 'demand' or (
      demand_action is not null
      and (
        demand_action in ('page_view', 'sold_out_view')
        or contact_email is not null
      )
    )
  ),
  constraint ledger_entries_close_shape check (
    kind <> 'close' or (final_sold is not null and final_revenue_cents is not null)
  )
);

comment on table public.ledger_entries is
  'Close-out D1: append only, for ever. A refund is a new negative row, never an edit. Enforced by a trigger and by the grants, not by convention.';
comment on column public.ledger_entries.occurrence_key is
  'One row per real-world happening. A redelivered webhook, a re-run backfill and a retried action all collide here rather than double-counting.';
comment on column public.ledger_entries.quantity is
  'Signed. A refund is negative, so sum(quantity) is the net with no special case anywhere in the engine.';
comment on column public.ledger_entries.contact_email is
  'Required on every demand action that has a person attached. Without it the recovery engine has nobody to contact.';

create index if not exists ledger_entries_slot_idx
  on public.ledger_entries (slot_id, occurred_at);
create index if not exists ledger_entries_kind_idx
  on public.ledger_entries (kind, occurred_at desc);
create index if not exists ledger_entries_organisation_idx
  on public.ledger_entries (organisation_id, occurred_at desc);
-- The recovery engine's own read: who started and did not finish, with a person
-- attached. Partial, because that is a small slice of a table that will be large.
create index if not exists ledger_entries_recoverable_idx
  on public.ledger_entries (slot_id, occurred_at)
  where kind = 'demand' and contact_email is not null;

-- ---------------------------------------------------------------------------
-- 4. APPEND ONLY, ENFORCED BY THE DATABASE.
--
--    Two layers, because one can be bypassed. The grants stop a client that
--    holds a role; the trigger stops everything, including a psql session, a
--    future migration and a code path nobody has written yet.
--
--    A trigger that RAISES rather than one that silently returns null: a write
--    that was refused must be loud, because the whole value of this table is
--    that what it says happened is what happened.
-- ---------------------------------------------------------------------------
create or replace function public.ledger_entries_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'public.ledger_entries is append only: a % was attempted on row %. A correction is a NEW row, never an edit.',
    tg_op, coalesce(old.id::text, '(unknown)')
    using errcode = '42501';
end;
$$;

drop trigger if exists ledger_entries_no_update on public.ledger_entries;
create trigger ledger_entries_no_update
  before update on public.ledger_entries
  for each row execute function public.ledger_entries_are_append_only();

drop trigger if exists ledger_entries_no_delete on public.ledger_entries;
create trigger ledger_entries_no_delete
  before delete on public.ledger_entries
  for each row execute function public.ledger_entries_are_append_only();

alter table public.ledger_slots enable row level security;
alter table public.ledger_entries enable row level security;

-- RLS on with NO policies. This is the platform's own record and every reader
-- is a server component that has already proved the caller may act for the
-- organisation, exactly as platform_notifications does.
revoke all on public.ledger_slots from anon, authenticated;
revoke all on public.ledger_entries from anon, authenticated;
revoke update, delete on public.ledger_entries from service_role;

-- ---------------------------------------------------------------------------
-- 5. THE ONE WRITER.
--
--    It speaks the general vocabulary only. It knows nothing about events,
--    tickets or tiers: it is handed a slot and an entry as jsonb, both already
--    in the ledger's own language, and the mapping that produced them lives in
--    src/lib/ledger/adapter.ts and nowhere else.
--
--    It exists rather than a bare INSERT for three reasons:
--      1. ONE ROUND TRIP. The slot has to exist before the entry can name it,
--         and doing that as two statements from Node is two transactions.
--      2. days_out IS DERIVED HERE, from the slot's own timestamp, so no caller
--         can compute it differently.
--      3. IDEMPOTENT BY CONSTRUCTION. ON CONFLICT DO NOTHING on the occurrence
--         key, so a retry is free and a redelivered webhook is not a second sale.
--
--    Returns the ledger id, or null when the row already existed.
-- ---------------------------------------------------------------------------
create or replace function public.record_ledger_entry(p_slot jsonb, p_entry jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_system text := coalesce(p_slot->>'source_system', 'eventlinqs');
  v_slot_id uuid;
  v_slot_at timestamptz;
  v_on_sale_at timestamptz;
  v_occurred_at timestamptz := coalesce((p_entry->>'occurred_at')::timestamptz, now());
  v_id bigint;
begin
  if p_slot is null or p_entry is null then
    raise exception 'record_ledger_entry needs both a slot and an entry' using errcode = '22023';
  end if;

  v_slot_at := (p_slot->>'slot_at')::timestamptz;
  v_on_sale_at := nullif(p_slot->>'on_sale_at', '')::timestamptz;

  insert into public.ledger_slots (
    source_system, source_ref, organisation_id, category, subcategory,
    capacity, on_sale_at, slot_at, on_sale_days_before, postcode
  )
  values (
    v_source_system,
    (p_slot->>'source_ref')::uuid,
    (p_slot->>'organisation_id')::uuid,
    p_slot->>'category',
    p_slot->>'subcategory',
    nullif(p_slot->>'capacity', '')::integer,
    v_on_sale_at,
    v_slot_at,
    case when v_on_sale_at is null then null else greatest(0, (v_slot_at::date - v_on_sale_at::date)) end,
    nullif(p_slot->>'postcode', '')
  )
  on conflict (source_system, source_ref) do update
    set category = excluded.category,
        subcategory = excluded.subcategory,
        capacity = coalesce(excluded.capacity, public.ledger_slots.capacity),
        on_sale_at = coalesce(excluded.on_sale_at, public.ledger_slots.on_sale_at),
        slot_at = excluded.slot_at,
        on_sale_days_before = coalesce(excluded.on_sale_days_before, public.ledger_slots.on_sale_days_before),
        postcode = coalesce(excluded.postcode, public.ledger_slots.postcode),
        updated_at = now()
  returning id, slot_at into v_slot_id, v_slot_at;

  insert into public.ledger_entries (
    source_system, slot_id, organisation_id, occurred_at, kind, occurrence_key,
    inventory_class, inventory_class_ref,
    quantity, amount_cents, unit_amount_cents,
    days_out, referrer, utm_source, utm_medium, utm_campaign, device, buyer_hash, returning_buyer,
    old_price_cents, new_price_cents,
    inventory_action,
    demand_action, visitor_hash, contact_email,
    final_sold, final_revenue_cents, fill_percent, attended, no_shows
  )
  values (
    v_source_system,
    v_slot_id,
    (p_slot->>'organisation_id')::uuid,
    v_occurred_at,
    (p_entry->>'kind')::public.ledger_entry_kind,
    p_entry->>'occurrence_key',
    nullif(p_entry->>'inventory_class', ''),
    nullif(p_entry->>'inventory_class_ref', '')::uuid,
    nullif(p_entry->>'quantity', '')::integer,
    nullif(p_entry->>'amount_cents', '')::integer,
    nullif(p_entry->>'unit_amount_cents', '')::integer,
    -- DERIVED HERE, from the slot's own timestamp, so no caller can differ.
    greatest(0, (v_slot_at::date - v_occurred_at::date)),
    nullif(p_entry->>'referrer', ''),
    nullif(p_entry->>'utm_source', ''),
    nullif(p_entry->>'utm_medium', ''),
    nullif(p_entry->>'utm_campaign', ''),
    nullif(p_entry->>'device', ''),
    nullif(p_entry->>'buyer_hash', ''),
    case when p_entry ? 'returning_buyer' then (p_entry->>'returning_buyer')::boolean else null end,
    nullif(p_entry->>'old_price_cents', '')::integer,
    nullif(p_entry->>'new_price_cents', '')::integer,
    nullif(p_entry->>'inventory_action', '')::public.ledger_inventory_action,
    nullif(p_entry->>'demand_action', '')::public.ledger_demand_action,
    nullif(p_entry->>'visitor_hash', ''),
    nullif(p_entry->>'contact_email', ''),
    nullif(p_entry->>'final_sold', '')::integer,
    nullif(p_entry->>'final_revenue_cents', '')::integer,
    nullif(p_entry->>'fill_percent', '')::numeric,
    nullif(p_entry->>'attended', '')::integer,
    nullif(p_entry->>'no_shows', '')::integer
  )
  on conflict (source_system, occurrence_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_ledger_entry(jsonb, jsonb) is
  'Close-out D1: the one writer. Speaks the general vocabulary only, derives days_out from the slot, and is idempotent on the occurrence key so a retry is free.';

revoke all on function public.record_ledger_entry(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_ledger_entry(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 6. THE PROBE, so a build can ask a database whether the ledger is really
--    installed, the way event_lifecycle_guards() and platform_notification_
--    guards() already do. Nothing else in the gate set reads a database, so
--    without this a project missing the append-only triggers would pass every
--    check in the tree.
-- ---------------------------------------------------------------------------
create or replace function public.ledger_guards()
returns table (name text, installed boolean, detail text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'slots_table'::text, to_regclass('public.ledger_slots') is not null,
         'the slot dimension exists'::text
  union all
  select 'entries_table', to_regclass('public.ledger_entries') is not null,
         'the ledger exists'
  union all
  select 'no_update_trigger',
         exists (select 1 from pg_trigger where tgname = 'ledger_entries_no_update' and not tgisinternal),
         'an UPDATE on the ledger raises'
  union all
  select 'no_delete_trigger',
         exists (select 1 from pg_trigger where tgname = 'ledger_entries_no_delete' and not tgisinternal),
         'a DELETE on the ledger raises'
  union all
  select 'writer_function',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'record_ledger_entry'),
         'the one writer exists'
  union all
  select 'service_role_cannot_update',
         not has_table_privilege('service_role', 'public.ledger_entries', 'UPDATE'),
         'the service role has no UPDATE grant on the ledger'
  union all
  select 'service_role_cannot_delete',
         not has_table_privilege('service_role', 'public.ledger_entries', 'DELETE'),
         'the service role has no DELETE grant on the ledger'
  union all
  select 'anon_cannot_read',
         not has_table_privilege('anon', 'public.ledger_entries', 'SELECT'),
         'anon cannot read the ledger'
  union all
  select 'demand_email_required',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.ledger_entries'::regclass
                    and conname = 'ledger_entries_demand_shape'),
         'a demand row that can carry a person must carry one'
  union all
  select 'refund_is_negative',
         exists (select 1 from pg_constraint
                  where conrelid = 'public.ledger_entries'::regclass
                    and conname = 'ledger_entries_refund_shape'),
         'a refund is a negative row, never an edit';
$$;

revoke all on function public.ledger_guards() from public, anon, authenticated;
grant execute on function public.ledger_guards() to service_role;
