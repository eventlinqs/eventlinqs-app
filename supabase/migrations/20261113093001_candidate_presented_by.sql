-- WHO PRESENTS A FOUND NIGHT, KEPT ON ITS CANDIDATE (WINDOW 5A, 13 November 2026; the PM's 09:05 (3): "each captured
-- night carries its organiser; the outreach pool grows from those organisers"; Lawal's 06:55).
--
-- Read on production that morning: of 521 listed nights in the next 30 days, 139 at 22 venues carried no organiser, and a
-- found night kept none at all. Two live sources name the presenter on the night's own page, in a line of its own
-- ('Presented by ...': Geelong Arts Centre's hirers, Melbourne Recital Centre's companies); their rules now read it
-- (src/lib/listings/presenter.ts) and the collection run keeps it here. A fact about the night, like its title: no
-- address, no person. Nothing is backfilled; each night gains it on its next read.
--
-- An existing table gains a column, so its grants stand as they are (listing_candidates: service_role only).
alter table public.listing_candidates add column if not exists presented_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listing_candidates_presented_by_check') then
    alter table public.listing_candidates
      add constraint listing_candidates_presented_by_check
      check (presented_by is null or length(btrim(presented_by)) between 2 and 120);
  end if;
end
$$;

comment on column public.listing_candidates.presented_by is
  'Who presents the night, where its own page names them in a line of its own (src/lib/listings/presenter.ts); null when it names no one.';
