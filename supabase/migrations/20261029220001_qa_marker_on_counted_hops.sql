-- A QA PRESS IS RECORDED AS A TEST AND COUNTED NOWHERE (the master mandate of 29 October 2026, sections 10, 13 and 16;
-- the project manager's 21:42 ruling R3).
--
-- The counted hops (/out to an organiser's booking site, /go from a profile link, /e and /s share links) can only be
-- proved on production by pressing them, and a QA press must never be counted as a person. Until now a drive could
-- only stay uncounted by naming itself a crawler, which also skips the write it was meant to prove. Now a request that
-- carries a server-held QA secret is RECORDED, through the real writer, with is_test true, and every figure leaves it
-- out (scripts/guards/counted-rows-exclude-tests.mjs fails the build on a read that does not).
--
-- qa_markers holds only the sha256 of each secret, with its expiry; the secret itself is never stored, logged or put in
-- the repository. A row is written per QA session by a logged production apply and expires within a day.
--
-- Additive: two boolean columns defaulting to false on existing rows, one new staff-only table. No row changes meaning.
-- Reversal: drop qa_markers and the two columns (nothing else reads them).

alter table public.share_link_events add column if not exists is_test boolean not null default false;
alter table public.go_presses add column if not exists is_test boolean not null default false;

comment on column public.share_link_events.is_test is
  'True for a press made by a QA drive carrying a qa_markers secret (src/lib/broadcast/qa-marker.ts). Every figure leaves it out.';
comment on column public.go_presses.is_test is
  'True for a press made by a QA drive carrying a qa_markers secret (src/lib/broadcast/qa-marker.ts). Every figure leaves it out.';

create table if not exists public.qa_markers (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  label text not null check (length(label) between 3 and 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by text not null check (length(created_by) between 2 and 120),
  constraint qa_markers_expire_within_a_day check (expires_at > created_at and expires_at <= created_at + interval '25 hours')
);

comment on table public.qa_markers is
  'The sha256 of each QA secret, with its expiry. A request whose x-eventlinqs-qa header hashes to an unexpired row is a QA press: recorded with is_test true, counted nowhere. Staff only.';

alter table public.qa_markers enable row level security;

-- The 21 October 2026 grant rule: the service role reads markers for the hops; nobody else reaches the table.
revoke all on public.qa_markers from public, anon, authenticated, service_role;
grant select on public.qa_markers to service_role;
