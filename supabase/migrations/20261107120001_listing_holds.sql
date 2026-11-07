-- THE RESOLVER'S HOLDS (the CONTROLLER's 10:50 of 7 November 2026, ruling (5): 'The hold's storage migration rides in car 53';
-- Lawal's 06:21 rule, src/lib/listings/resolver.ts). Every hold the resolver places is a row here: which night, which fact,
-- whether it holds the FACT (a price or a status: the price withheld, the night stays) or the NIGHT (a start, venue or session
-- in doubt: the dated night hidden from every public surface by its visibility, never deleted), why (official pages disagree,
-- or no official page readable), the pages read and what each stated, when it was placed and when, and by what, it was
-- released. A hold is released, never deleted; this table keeps the history.

create table if not exists public.listing_holds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  series_id uuid references public.event_series(id) on delete set null,
  field text not null check (field in ('start', 'session', 'venue', 'price', 'status')),
  scope text not null check (scope in ('fact', 'night')),
  reason text not null check (reason in ('officials_disagree', 'no_official_page')),
  readings jsonb not null default '[]'::jsonb,
  held_at timestamptz not null default now(),
  released_at timestamptz,
  released_by text,
  check ((released_at is null) = (released_by is null))
);

create index if not exists listing_holds_open_event on public.listing_holds (event_id) where released_at is null;

-- Grants (the 21 October 2026 rule): revoke everything, then give the service role exactly what the resolver does. No public
-- surface reads a hold: a night hold is the event's own visibility, a price hold its link's unchecked price.
alter table public.listing_holds enable row level security;
revoke all on public.listing_holds from anon, authenticated, service_role;
grant select, insert, update on public.listing_holds to service_role;

comment on table public.listing_holds is
  'The resolver''s holds (CONTROLLER 10:50, 7 November 2026): a fact or a night held while its official pages disagree or none can be read, with the readings; released, never deleted. Service role only.';
