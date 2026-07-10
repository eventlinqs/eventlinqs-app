-- Broadcast Layer Stage 2: platform marketing consent and the weekly local
-- digest audit trail. SPEC: docs/EventLinqs-Broadcast-Layer-SPEC.md
-- sections 3.1, 3.2 and 5.
--
-- marketing_consents - express platform-level consent ("Keep me posted on
--                      events in my area"), city scoped, one row per email,
--                      with the exact wording shown, a timestamp, a source,
--                      and a no-login unsubscribe token. Spam Act 2003:
--                      no consent row, no digest, ever.
-- digest_sends       - an append-only audit row per digest send per city:
--                      period covered, events carried, recipients counted.
--
-- This is DISTINCT from public.organiser_marketing_consents (per-organiser
-- consent, 20260624000002) and from public.email_subscribers (the legacy
-- homepage capture): platform digest sends read THIS table only.
--
-- Additive only. Reversible by dropping the two tables. TEST database only,
-- applied with `supabase db push --linked` from PowerShell.

begin;

-- ---------------------------------------------------------------------------
-- marketing_consents: one platform consent state per email, city scoped.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_consents (
  id uuid primary key default gen_random_uuid(),
  -- The consenting email, stored lowercased by the app.
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  -- The locality the digest is scoped to. References the existing city
  -- taxonomy, the single source of geography truth.
  city_slug text references public.cities(slug) on delete set null,
  status text not null default 'granted' check (status in ('granted', 'withdrawn')),
  -- The exact opt-in wording shown at the moment of consent, plus its
  -- version, so the evidence is provable even after the copy changes.
  consent_text text not null,
  consent_version text not null default 'v1',
  source text not null default 'checkout',
  unsubscribe_token uuid not null default gen_random_uuid(),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (email),
  unique (unsubscribe_token)
);

comment on table public.marketing_consents is
  'Express platform-level marketing consent for the weekly local digest (Spam Act 2003). City scoped, withdrawable, audited: wording, version, timestamp, source.';

create index if not exists marketing_consents_city_idx
  on public.marketing_consents (city_slug)
  where status = 'granted';
create index if not exists marketing_consents_email_idx
  on public.marketing_consents (lower(email));

alter table public.marketing_consents enable row level security;

-- A signed-in user may read their own consent state (preference centre).
-- All writes, and the digest fan-out reads, are service role only: the
-- checkout, registration, and token-based unsubscribe paths run server side.
drop policy if exists "marketing_consents_own_select" on public.marketing_consents;
create policy "marketing_consents_own_select" on public.marketing_consents
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- digest_sends: append-only audit of every digest send, per city per period.
-- The unique (city_slug, period_start) key makes a re-running cron
-- idempotent: one send per city per week, never a double send.
-- ---------------------------------------------------------------------------
create table if not exists public.digest_sends (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null references public.cities(slug) on delete cascade,
  period_start date not null,
  period_end date not null,
  event_count integer not null default 0,
  recipient_count integer not null default 0,
  sent_at timestamptz not null default now(),
  unique (city_slug, period_start)
);

comment on table public.digest_sends is
  'Append-only audit of weekly local digest sends: one row per city per period with event and recipient counts. Idempotence key for the digest cron.';

create index if not exists digest_sends_city_idx
  on public.digest_sends (city_slug, period_start desc);

alter table public.digest_sends enable row level security;

-- Service role only: no anon or authenticated policies. The admin surface
-- reads via the privileged client.

commit;
