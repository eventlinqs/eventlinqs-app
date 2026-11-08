-- A HOLD IS NEVER LEFT HANGING (Lawal, 7 November 2026: 'You should always know the state of an event ... and not just leave
-- the system hanging'; the CONTROLLER's 16:55, (1)). Every open hold carries its next action: the next source to read and when
-- it is read, with the sources already tried. What each answer does is the resolver's fixed rule (scripts/verify/resolve-run.mts):
-- the source states the night, the hold is released; it states the night cancelled or ended, the night is cancelled, never left
-- held; it states nothing, the next source, and when the sources run out the hold is 'unconfirmed' and read again weekly.
-- Additive: four columns and two rules on public.listing_holds (20261107120001); no row is changed.

alter table public.listing_holds
  add column if not exists state text not null default 'held',
  add column if not exists next_source text,
  add column if not exists next_check_at timestamptz,
  add column if not exists sources_tried jsonb not null default '[]'::jsonb;

alter table public.listing_holds drop constraint if exists listing_holds_state_known;
alter table public.listing_holds
  add constraint listing_holds_state_known check (state in ('held', 'unconfirmed'));

-- An open hold names its next source and when it is read. NOT VALID: the holds already open when this lands are checked by
-- the verifier (a hold with no next action reads red there) and given theirs by a reviewed write; every row written or
-- changed from now on must carry it.
alter table public.listing_holds drop constraint if exists listing_holds_open_carries_its_next_action;
alter table public.listing_holds
  add constraint listing_holds_open_carries_its_next_action
  check (released_at is not null or (next_source is not null and next_check_at is not null)) not valid;

create index if not exists listing_holds_due on public.listing_holds (next_check_at) where released_at is null;

comment on column public.listing_holds.state is 'held while a source is still to be read; unconfirmed once every source is read and none states the night (read again weekly).';
comment on column public.listing_holds.next_source is 'The next page the resolver reads for this hold (an official page: the organiser''s, the venue''s, the seller''s).';
comment on column public.listing_holds.next_check_at is 'When the resolver next reads next_source.';
comment on column public.listing_holds.sources_tried is 'Every source read for this hold, with when and what it stated.';
