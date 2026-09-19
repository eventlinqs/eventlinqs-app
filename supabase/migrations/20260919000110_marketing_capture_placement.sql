-- ===========================================================================
-- AQ1. WHERE THE DISCOVERY QUESTION IS ASKED, AND THE CARRIER THAT MOVES IT.
--
-- AQ1 asks for express consent to hear about other events, captured at
-- checkout, and then says what happens if it costs the organiser sales:
--
--   "checkout conversion measured before and after, and if it falls more than
--    two percent the surface moves to the ticket page instead"
--   "Reversal condition: a conversion fall greater than two percent moves the
--    capture off checkout, it does not remove it"
--
-- A reversal condition written only as a sentence is not a reversal condition.
-- Both halves of that instruction need something in the schema:
--
--   the MEASUREMENT needs a recorded moment. "Before and after" is meaningless
--   until the platform can say when the question started being asked, and
--   nothing anywhere recorded that. public.reservations already carries
--   created_at and converted_at, so the rate itself needs no new column; what
--   was missing was the line in time to measure either side of.
--
--   the MOVE needs somewhere for the answer to wait. On the ticket page the
--   buyer has not given an address yet, so the consent cannot be written when
--   it is given. It is carried against the reservation and written into the
--   ledger at checkout, under the wording that was actually on screen when the
--   buyer read it, never the wording in force at the later moment.
--
-- WHAT THIS FILE ADDS.
--
--   marketing_capture_placement  append only. Where the question is asked, from
--                                when, and why the decision was taken. Seeded
--                                with one row whose effective_from is DERIVED
--                                from the ledger rather than invented, so the
--                                before-and-after split is a fact the database
--                                already held rather than a date typed in here.
--   marketing_capture_answer     the answer given on the ticket page, waiting
--                                for the address. NOT evidence and never
--                                offered as evidence: the evidence is the
--                                consent_events row written at checkout. This
--                                row is a carrier and dies with its reservation.
--
-- NOTHING SENDS. This migration creates no sender, no queue and no schedule,
-- and it does not widen any consent: an answer carried from the ticket page is
-- recorded under the same purpose, the same scopes and the same wording record
-- the buyer read.
--
-- Additive and reversible: drop the two tables and the platform asks the
-- question exactly where it asks it today.
-- TEST database only, applied with `supabase db push --linked` from PowerShell.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE PLACEMENT DECISION LOG. APPEND ONLY.
--
-- A placement is a decision taken at a moment, not a setting. It is append only
-- for the same reason the consent ledger is: the conversion measurement reads
-- the history to decide what "before" and "after" mean, so a row that could be
-- edited afterwards would let somebody move the line the measurement is taken
-- from. Reversing the decision is a NEW ROW, which is also exactly what the
-- reversal condition asks for.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_capture_placement (
  id uuid primary key default gen_random_uuid(),
  placement text not null,
  effective_from timestamptz not null default now(),
  reason text not null,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint marketing_capture_placement_known
    check (placement in ('checkout', 'ticket_page')),
  constraint marketing_capture_placement_reason_present
    check (length(btrim(reason)) > 0),
  -- Two decisions at the same instant would leave "which one is in force"
  -- undecidable, and the resolver would answer differently on two reads.
  constraint marketing_capture_placement_one_per_instant
    unique (effective_from)
);

comment on table public.marketing_capture_placement is
  'AQ1. Append only. Where the discovery consent question is asked, from when, and why. The reversal condition (a conversion fall greater than two percent moves the capture off checkout) is a new row here, never an edit. Update, delete and truncate are refused by the database.';
comment on column public.marketing_capture_placement.effective_from is
  'AQ1. The line the conversion measurement is taken either side of. Seeded from the earliest checkout consent event the ledger holds, so the split is derived rather than asserted.';
comment on column public.marketing_capture_placement.reason is
  'AQ1. Why this placement was chosen. A placement with no stated reason cannot be argued with six months later, which is the whole point of writing the decision down.';

create index if not exists idx_marketing_capture_placement_effective
  on public.marketing_capture_placement(effective_from desc);

alter table public.marketing_capture_placement enable row level security;

-- ---------------------------------------------------------------------------
-- 2. THE CARRIER. The answer given before the address is known.
--
-- Only written while the placement is ticket_page. It holds the verbatim
-- wording so that a wording version published between the ticket page and the
-- payment step cannot rewrite what the buyer agreed to: the sentence recorded
-- in the ledger is the sentence that was on screen.
--
-- DELETE IS ALLOWED HERE AND REFUSED ON THE LEDGER, deliberately. This row is
-- not evidence. It is a note in a pocket between two screens, and it follows
-- its reservation out of the database. The evidence is public.consent_events,
-- which is append only and is what an ACMA complaint is answered from.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_capture_answer (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  ticked boolean not null,
  placement text not null,
  wording_purpose text not null references public.consent_purposes(purpose),
  wording_version text not null,
  wording text not null,
  created_at timestamptz not null default now(),

  constraint marketing_capture_answer_placement_known
    check (placement in ('checkout', 'ticket_page')),
  constraint marketing_capture_answer_wording_present
    check (length(btrim(wording)) > 0),
  constraint marketing_capture_answer_wording_version_present
    check (length(btrim(wording_version)) > 0)
);

comment on table public.marketing_capture_answer is
  'AQ1. The discovery consent answer given on the ticket page, waiting for the address the buyer gives at checkout. A carrier, never evidence: the evidence is public.consent_events. It is removed with its reservation.';
comment on column public.marketing_capture_answer.wording is
  'AQ1. The verbatim sentence that was on screen when the buyer answered. Carried rather than re-read, so a wording published between the two screens cannot rewrite what was agreed to.';

alter table public.marketing_capture_answer enable row level security;

-- ---------------------------------------------------------------------------
-- 3. APPEND ONLY, ENFORCED BY THE DATABASE.
--
-- public.refuse_ledger_mutation() already exists (GA1) and already says the
-- right thing in its message. Reused rather than re-spelled, so there is one
-- refusal on this platform instead of two that can drift.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_marketing_capture_placement_no_update on public.marketing_capture_placement;
create trigger trg_marketing_capture_placement_no_update
  before update on public.marketing_capture_placement
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_marketing_capture_placement_no_delete on public.marketing_capture_placement;
create trigger trg_marketing_capture_placement_no_delete
  before delete on public.marketing_capture_placement
  for each statement execute function public.refuse_ledger_mutation();

drop trigger if exists trg_marketing_capture_placement_no_truncate on public.marketing_capture_placement;
create trigger trg_marketing_capture_placement_no_truncate
  before truncate on public.marketing_capture_placement
  for each statement execute function public.refuse_ledger_mutation();

-- The carrier is written once and read once. An UPDATE would mean the answer
-- shown to the recorder is not the answer the buyer gave.
drop trigger if exists trg_marketing_capture_answer_no_update on public.marketing_capture_answer;
create trigger trg_marketing_capture_answer_no_update
  before update on public.marketing_capture_answer
  for each statement execute function public.refuse_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 4. THE FIRST PLACEMENT, DERIVED RATHER THAN ASSERTED.
--
-- The question has been asked at checkout since GA1. Typing that date in here
-- would be a claim about history made by somebody who was not there. The
-- ledger already knows: the earliest facilitated-marketing consent event
-- captured on a checkout surface is the earliest moment the platform can PROVE
-- the question was put to somebody. Where there is no such event, the platform
-- has never been observed asking, so the placement begins now.
-- ---------------------------------------------------------------------------
insert into public.marketing_capture_placement (placement, effective_from, reason)
select
  'checkout',
  coalesce(
    (
      select min(occurred_at)
      from public.consent_events
      where purpose = 'facilitated_event_marketing'
        and capture_surface in ('checkout', 'squad-checkout')
    ),
    now()
  ),
  'AQ1 seed. The question has been asked at the payment step since GA1; this row records that placement so the conversion measurement has a line to be taken either side of. The moment is the earliest checkout consent event in the ledger, not a date typed into a migration.'
where not exists (select 1 from public.marketing_capture_placement);

commit;
