-- Broadcast Layer: feature flags, DB backed so a stage switches on with a
-- config change and no deploy. SPEC: docs/EventLinqs-Broadcast-Layer-SPEC.md
-- section 0 (build-all, stage-the-switch) and section 6.
--
-- The platform had no feature-flag primitive; this follows the one-source
-- pricing_rules doctrine: the flag value lives in ONE table, read through ONE
-- resolver (src/lib/flags/), edited from the admin surface, cached briefly.
--
-- Seeded states per the spec: broadcast_share ON, broadcast_digest OFF,
-- broadcast_follow OFF, broadcast_artists OFF.
--
-- Additive only. Reversible by dropping the table. TEST database only,
-- applied with `supabase db push --linked` from PowerShell.

begin;

create table if not exists public.feature_flags (
  flag text primary key,
  enabled boolean not null default false,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.feature_flags is
  'DB-backed feature flags: one row per flag, switchable from the admin surface with no deploy. Read through the single resolver in src/lib/flags/.';

alter table public.feature_flags enable row level security;

-- Flags carry no secrets and gate public surfaces, so anyone may read them.
-- Writes are service role only (the role-gated admin surface).
drop policy if exists "feature_flags_public_read" on public.feature_flags;
create policy "feature_flags_public_read" on public.feature_flags
  for select using (true);

insert into public.feature_flags (flag, enabled, description) values
  ('broadcast_share', true,
   'Stage 1 share infrastructure: OG share cards, share actions, trackable short links, QR poster kit, reach panel.'),
  ('broadcast_digest', false,
   'Stage 2 weekly local digest: city-scoped email to consented recipients.'),
  ('broadcast_follow', false,
   'Stage 2 follow surfaces: follow prompts, follower push and email alerts, buyer feed prioritisation.'),
  ('broadcast_artists', false,
   'Stage 3 performer attribution: artist profiles, lineup tagging, per-artist links and dashboards.')
on conflict (flag) do nothing;

commit;
