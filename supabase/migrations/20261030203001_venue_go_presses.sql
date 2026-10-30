-- EACH PARTNER VENUE'S OWN TRACKED CODE (the project manager's 17:25 of 30 October 2026, D3: "each partner venue gets its
-- own tracked /go code and a printable QR for its bar or door (offline distribution, counted)").
--
-- venue_go_presses: each press on /go/v/<venue>, one per visitor per venue per Melbourne day, the go_presses pattern
-- (20261028203001, 20261029220001). A press is an arrival, never a sale. The visitor is the salted key the share links
-- use, never an identity.
--
-- Additive: one new table, granted in this file (the 21 October 2026 grant rule). Proved on TEST by
-- scripts/verify/venue-go-proof.sql, red without this file, rolled back.

create table if not exists public.venue_go_presses (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- qr: scanned from the printed sheet; link: the same address opened any other way.
  via text not null check (via in ('qr', 'link')),
  visitor text not null check (length(visitor) between 8 and 128),
  day date not null,
  pressed_at timestamptz not null default now(),
  -- A verified QA press (src/lib/broadcast/qa-marker.ts), kept apart from every count of people.
  is_test boolean not null default false,
  unique (venue_id, visitor, day)
);

create index if not exists venue_go_presses_by_venue on public.venue_go_presses (venue_id, pressed_at);

comment on table public.venue_go_presses is
  'D3: a press on a venue''s own /go code, one per visitor per venue per Melbourne day, never a crawler; a press is an arrival, never a sale.';

alter table public.venue_go_presses enable row level security;

revoke all on table public.venue_go_presses from public, anon, authenticated, service_role;
grant select, insert on table public.venue_go_presses to service_role;
