-- Attendee marketing consent (Australian Spam Act 2003 / ACMA compliance).
--
-- The growth-plan data-ownership wedge lets organisers email their attendees.
-- Under the Spam Act a marketing message may only be sent with EXPRESS consent;
-- a purchase does NOT imply consent, and consent must be recorded with who gave
-- it, when, the exact wording shown, and the source. This table is that record.
--
-- Design (per ACMA 2024 consent statement):
--   - Per-ORGANISER scope: consenting to one organiser is never consent to all.
--     One row per (organisation_id, email); re-purchase upserts the same row.
--   - Withdrawable: an unsubscribe sets status='withdrawn' and stamps
--     withdrawn_at; the export and any send path must honour that state.
--   - Auditable: the exact wording shown (consent_text) and a wording version
--     are stored so a wording change is provable, plus the timestamp and source.
--   - A per-row unsubscribe_token backs a no-login unsubscribe link.
--
-- The separate, OPTIONAL EventLinqs platform-updates opt-in is kept DISTINCT in
-- the existing public.email_subscribers table (source='checkout'); it is never
-- mixed with organiser marketing here.
--
-- Additive only: no payment columns touched. Apply with `supabase db push
-- --linked` from PowerShell, TEST project only. NEVER the Dashboard or MCP.

begin;

create table if not exists public.organiser_marketing_consents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- The attendee email the consent applies to (stored lowercased by the app).
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  status text not null default 'granted' check (status in ('granted', 'withdrawn')),
  -- The exact opt-in wording shown at the moment of consent, plus its version,
  -- so the evidence is provable even after the copy changes.
  consent_text text not null,
  consent_version text not null default 'v1',
  source text not null default 'checkout',
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  -- One consent state per attendee per organiser.
  unique (organisation_id, email),
  unique (unsubscribe_token)
);

comment on table public.organiser_marketing_consents is
  'Express attendee consent for an organiser to send marketing email (Spam Act 2003). Per-organiser, withdrawable, audited (wording + version + timestamp + source).';

create index if not exists organiser_marketing_consents_org_idx
  on public.organiser_marketing_consents (organisation_id);
create index if not exists organiser_marketing_consents_email_idx
  on public.organiser_marketing_consents (lower(email));

alter table public.organiser_marketing_consents enable row level security;

-- The organiser who owns the organisation may read its consent records (the
-- attendee export reads via the service role after the ownership gate, so this
-- session-scoped policy is defence in depth). Inserts, upserts and withdrawals
-- are performed by the service role (checkout + the token-based unsubscribe),
-- which bypasses RLS, so no anon/authenticated write policy is exposed.
drop policy if exists "org_marketing_consents_owner_select" on public.organiser_marketing_consents;
create policy "org_marketing_consents_owner_select" on public.organiser_marketing_consents
  for select using (
    organisation_id in (
      select id from public.organisations where owner_id = auth.uid()
    )
  );

commit;
