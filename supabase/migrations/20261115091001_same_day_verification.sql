-- THE SAME DAY CHECK, VERSION 2: PART OF THE DISCOVERY ENGINE (Lawal, 15 November 2026, 06:03: "anything that goes online
-- must be verified on that day on the real source ... This is the last time this engine will make this mistake", his
-- written approval of the gate change, law 19 (e); and his 06:50, relayed by the PM at 07:00, item 4: "the same day check is
-- PART of the Discovery engine ... the engine keeps every city filled 90 days ahead and refreshes itself independently; the
-- same day check enforces accuracy on the day and informs the engine"). Plan: C:\dev\START-16OCT\EL-SAME-DAY-15NOV\plan.md;
-- research: leaders-same-day.md beside it. Version 1 (a flat 24 hours) was applied nowhere and is replaced by this file.
--
-- WHAT WAS WRONG (read on production 15 November 2026, 06:23): a listing check moved every night of its series to 'fresh
-- until the end of day + 21' (listing_fresh_until_for, 20261023000010), whatever the check's outcome, so a night that left
-- its source stayed public for up to 22 days (BRAZJAZ, held 05:14). Every public surface already hides a listed night whose
-- listing_fresh_until has passed (src/lib/events/public-visibility.ts, clause 5).
--
-- WHAT CHANGES, in place from the functions in force (law 14 (z): a DO block reads pg_get_functiondef, counts each exact
-- text, replaces; read back at the end):
--   1. FRESHNESS BY DISTANCE (the PM's 07:00 item 4 (c)): listing_fresh_from_reads(series, zone, start). A night is fresh
--      from its series' newest AGREEING read (an outcome 'confirmed' check, timed at its read: checked_at, never later than
--      the end of the day the check says it read the source) for as long as its distance allows: more than 30 days out, 30
--      days; 8 to 30 days out, 7 days; 2 to 7 days out, 2 days; inside its last 2 days, 2 days but never past 06:00 on its
--      own day unless that read was made on its own day (the day of check, 00:00 to 06:00 Melbourne, item 4 (d)). A night
--      with no agreeing read is fresh until 1970: never shown. Nothing is deleted; the next agreeing read shows it again.
--      A list read that still carries the night unchanged writes a 'confirmed' check (src/lib/listings/collect-run.ts), so it
--      counts for these tiers (item 4 (c)).
--   2. The check trigger and the new night trigger take their freshness from it, each night by its own start, so a
--      'changed' or 'removed' check no longer refreshes a night.
--   3. A NIGHT IS PUBLISHED FROM THE READ IT RESTS ON (item 4 (a), Lawal's rule 1): a candidate keeps its last read
--      (last_read_at, moved by every run that finds it again, src/lib/listings/collect-store.ts land), and both publish
--      functions date the check, and time it, from that read, never from the day they publish.
--   4. A PARTNER NIGHT READ WITH NO LINK books on its own page, no price claimed, never walk in (the PM's 07:55 of
--      15 November 2026, the JazzLab nights: a night with no link was made walk in, which the database holds free).
--   5. TWO HOLD REASONS (item 4 (b); law 19 (d)): 'left_source', a night that has left its source's list (hidden, never
--      deleted; released when the source carries it again), and 'duplicate', a night that duplicates a published event
--      (hidden until a person decides; the walk never releases it).
--   6. Every listed night's freshness is recounted now. Read on production 15 November 2026, 08:19 (read only, the same
--      arithmetic): of 759 public listed upcoming nights, 0 would be hidden at once and 18 lapse within 24 hours unless read
--      again, which the engine's re-read does (src/lib/listings/reverify-run.ts).
-- Organisers' own events carry no listing series, so none of this touches them.

create or replace function public.listing_fresh_from_reads(p_series uuid, p_timezone text, p_start timestamptz)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  with r as (
    select max(least(c.checked_at, ((c.source_date + 1)::timestamp at time zone coalesce(p_timezone, 'Australia/Melbourne')))) as rd,
           (date_trunc('day', p_start at time zone coalesce(p_timezone, 'Australia/Melbourne')) at time zone coalesce(p_timezone, 'Australia/Melbourne')) as daystart
      from public.listing_checks c
     where c.series_id = p_series and c.outcome = 'confirmed'
  )
  select case
           when rd is null or p_start is null then timestamptz '1970-01-01 00:00:00+00'
           when rd + interval '30 days' < p_start - interval '30 days' then rd + interval '30 days'
           when greatest(rd + interval '7 days', p_start - interval '30 days') < p_start - interval '7 days'
             then greatest(rd + interval '7 days', p_start - interval '30 days')
           when greatest(rd + interval '2 days', p_start - interval '7 days') < p_start - interval '2 days'
             then greatest(rd + interval '2 days', p_start - interval '7 days')
           when rd < daystart then least(greatest(rd + interval '2 days', p_start - interval '2 days'), daystart + interval '6 hours')
           else greatest(rd + interval '2 days', p_start + interval '1 day')
         end
    from r
$$;

comment on function public.listing_fresh_from_reads(uuid, text, timestamptz) is
  'Lawal 15 November 2026 06:03 and 06:50: a listed night is fresh from its newest agreeing read (an outcome confirmed listing check, at its read time) by its distance: over 30 days out 30 days, 8 to 30 days 7 days, 2 to 7 days 2 days, its last 2 days until 06:00 on its own day unless read that day; with none it is never fresh. Public surfaces hide a listed night whose listing_fresh_until has passed.';

revoke all on function public.listing_fresh_from_reads(uuid, text, timestamptz) from public, anon, authenticated;

do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- 2a. The check trigger: each night of the series takes its own freshness, by its own start, from the agreeing reads.
  v_def := pg_get_functiondef('public.listing_check_keeps_freshness()'::regprocedure);
  v_old := 'set listing_fresh_until = public.listing_fresh_until_for(v_on, v_tz)';
  v_new := 'set listing_fresh_until = public.listing_fresh_from_reads(new.series_id, v_tz, start_date)';
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'listing_check_keeps_freshness: the text to change is not there exactly once';
  end if;
  execute replace(v_def, v_old, v_new);

  -- 2b. A new night of a series takes the same freshness the moment it is written.
  v_def := pg_get_functiondef('public.event_takes_its_series_freshness()'::regprocedure);
  v_old := 'select public.listing_fresh_until_for(s.last_checked_on, s.timezone)';
  v_new := 'select public.listing_fresh_from_reads(s.id, s.timezone, new.start_date)';
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'event_takes_its_series_freshness: the text to change is not there exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- A night whose start moves (a time a person corrected) takes its freshness again: the trigger also fires on start_date.
drop trigger if exists trg_event_takes_its_series_freshness on public.events;
create trigger trg_event_takes_its_series_freshness
  before insert or update of listing_series_id, start_date on public.events
  for each row execute function public.event_takes_its_series_freshness();

-- 3. A night is published from the read it rests on.
alter table public.listing_candidates add column if not exists last_read_at timestamptz;
update public.listing_candidates set last_read_at = found_at where last_read_at is null;
comment on column public.listing_candidates.last_read_at is
  'Lawal 15 November 2026 06:03: when a run last read this night on its source (found_at keeps the first sighting). A publish dates its listing check from this read, never from the day it publishes.';

do $$
declare
  v_fn text;
  v_def text;
  v_pair text[];
  v_pairs text[][];
begin
  foreach v_fn in array array['listing_publish_partner_night', 'listing_publish_accepted_night'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_def is null then
      raise exception '%: not in force', v_fn;
    end if;
    v_pairs := array[
      array[', c.found_at,', ', c.found_at, coalesce(c.last_read_at, c.found_at) as read_at,'],
      array['insert into public.listing_checks (series_id, source_url, source_date, import_file, outcome, reuse_basis)',
            'insert into public.listing_checks (series_id, source_url, source_date, import_file, outcome, reuse_basis, checked_at)'],
      array['(now() at time zone v_tz)::date', '(v_c.read_at at time zone v_tz)::date'],
      case when v_fn = 'listing_publish_partner_night'
           then array['''organiser_submission'');', '''organiser_submission'', v_c.read_at);']
           else array['''manual_research_facts_only'');', '''manual_research_facts_only'', v_c.read_at);'] end
    ];
    -- 4. A partner night read with no link books on its own page, no price claimed (the PM's 07:55, the JazzLab nights).
    if v_fn = 'listing_publish_partner_night' then
      v_pairs := v_pairs || array[array[
        'from jsonb_array_elements(v_c.links) l), ''[]''::jsonb),',
        'from jsonb_array_elements(v_c.links) l), jsonb_build_array(jsonb_build_object(''url'', v_c.page_url, ''kind'', ''tickets'', ''price_from_cents'', null, ''price_checked_on'', null))),'
      ]];
    end if;
    foreach v_pair slice 1 in array v_pairs loop
      if (length(v_def) - length(replace(v_def, v_pair[1], ''))) / length(v_pair[1]) <> 1 then
        raise exception '%: % is not there exactly once', v_fn, v_pair[1];
      end if;
      v_def := replace(v_def, v_pair[1], v_pair[2]);
    end loop;
    execute v_def;
  end loop;
end $$;

-- 5. Two hold reasons: a night that left its source's list, and a duplicate of a published event.
alter table public.listing_holds drop constraint if exists listing_holds_reason_check;
alter table public.listing_holds add constraint listing_holds_reason_check
  check (reason = any (array['officials_disagree'::text, 'no_official_page'::text, 'left_source'::text, 'duplicate'::text]));
comment on column public.listing_holds.reason is
  'officials_disagree: official pages state different values. no_official_page: no official page states it. left_source (15 November 2026): the night has left its source''s list; released when the source carries it again. duplicate (15 November 2026): it duplicates a published event; a person decides, the walk never releases it.';

-- 6. Every listed night, recounted now, each by its own start.
update public.events e
   set listing_fresh_until = public.listing_fresh_from_reads(e.listing_series_id, s.timezone, e.start_date)
  from public.event_series s
 where s.id = e.listing_series_id
   and e.listing_fresh_until is distinct from public.listing_fresh_from_reads(e.listing_series_id, s.timezone, e.start_date);

-- Read back: both triggers and both publish functions changed, the reasons in force, and no listed night fresh for longer
-- than its tier allows (30 days from now at most).
do $$
begin
  if position('listing_fresh_from_reads' in pg_get_functiondef('public.listing_check_keeps_freshness()'::regprocedure)) = 0 then
    raise exception 'read back: the check trigger does not take freshness from the agreeing reads';
  end if;
  if position('listing_fresh_from_reads' in pg_get_functiondef('public.event_takes_its_series_freshness()'::regprocedure)) = 0 then
    raise exception 'read back: the night trigger does not take freshness from the agreeing reads';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('listing_publish_partner_night', 'listing_publish_accepted_night')
                and position('(now() at time zone v_tz)::date' in pg_get_functiondef(p.oid)) > 0) then
    raise exception 'read back: a publish function still dates its check today';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'listing_publish_partner_night'
                and position('jsonb_array_elements(v_c.links) l), ''[]''::jsonb)' in pg_get_functiondef(p.oid)) > 0) then
    raise exception 'read back: a partner night with no link is still written with none';
  end if;
  if position('left_source' in (select pg_get_constraintdef(c.oid) from pg_constraint c
                                  where c.conrelid = 'public.listing_holds'::regclass and c.conname = 'listing_holds_reason_check')) = 0 then
    raise exception 'read back: the hold reasons do not name left_source';
  end if;
  if exists (select 1 from public.events where listing_series_id is not null and listing_fresh_until > now() + interval '30 days 5 minutes') then
    raise exception 'read back: a listed night is fresh beyond its tier';
  end if;
end $$;
