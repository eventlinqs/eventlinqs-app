-- THE WEEKLY CAMPAIGN MEASURED, AND ITS REPORT (the release checklist of 28 October 2026: J16, J17, G1 to G5 and K14;
-- the project manager's 13:54 and 15:00 of that day; window 5, names agreed with window 3 in BP-STATE.md at 15:01).
--
-- What each piece of a weekly campaign (20261028141001) did is read from two places that never mix:
--   ENTERED  what Instagram and Facebook report about a piece (reach, watch time on a Reel, saves, shares), typed in by
--            a person from the app's own insights, because the platforms' numbers need Meta's API and its app review
--            (the checklist's PM note 1). Kept here, each entry with when it was read and who typed it.
--   COUNTED  what EventLinqs itself recorded: visits, event views, presses out to an organiser's booking page, orders on
--            EventLinqs, confirmed subscribers and organiser enquiries, read from the rows the platform already keeps
--            (share_link_events, ledger_entries, orders, email_subscribers, partner_enquiries). Nothing new is stored
--            for them, so nothing here can be edited into a better week.
-- K14: an entered figure is never added to a counted one, and a press out to another site is never called a sale. The
-- report (src/lib/growth/social-report-math.ts) shows the two apart, and scripts/guards/social-measured-apart.mjs
-- holds that in the code.
--
-- J17 and G4: the report proposes at most three changes, each with the data behind it; none changes the planner. A
-- person's answer to each is kept here as history: approved or declined, by whom and when, with the words and the
-- evidence as they were shown. Nothing reads an approval automatically; the planner's rules change only by a person.
--
-- Staff only, through the service role, added to and never rewritten (the 21 October grant rule, as 20261028141001).
-- Additive: two new tables, two triggers, no change to any existing row.
--
-- Reversal: drop the two tables and the two trigger functions. Nothing else reads them.

-- ---------------------------------------------------------------------------
-- J16: the platforms' own figures for a piece that went, as a person read them
-- ---------------------------------------------------------------------------
create table if not exists public.social_piece_figures (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.social_pieces(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  -- Only what the platforms report. Watch time is taken only for the Discovery Reel, the campaign's one video piece.
  metric text not null check (metric in ('reach', 'watch_time_seconds', 'saves', 'shares')),
  value bigint not null check (value between 0 and 1000000000),
  -- When the figure was read in the app: insights keep growing, so a figure is true only as of a moment.
  read_at timestamptz not null,
  entered_by uuid not null references auth.users(id) on delete restrict,
  entered_at timestamptz not null default now()
);

create index if not exists social_piece_figures_by_piece on public.social_piece_figures (piece_id, platform, metric, read_at desc);

comment on table public.social_piece_figures is
  'J16, K14: what Instagram or Facebook reported for a piece, ENTERED by a person from the app; the newest read per piece, platform and metric is the figure. Never added to EventLinqs'' counted figures.';

-- A figure belongs to a piece that went, read after it went and not in the future; watch time only for the Reel.
create or replace function public.social_piece_figure_is_due()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $due$
declare
  v_kind text;
  v_posted timestamptz;
begin
  select p.kind, g.posted_at into v_kind, v_posted
    from public.social_pieces p
    left join public.social_piece_postings g on g.piece_id = p.id
   where p.id = new.piece_id;
  if v_kind is null then
    raise exception 'refused: no such piece.' using errcode = '23503';
  end if;
  if v_posted is null then
    raise exception 'refused: this piece has not gone, so no platform has a figure for it.' using errcode = '23514';
  end if;
  if new.read_at < v_posted then
    raise exception 'refused: a figure is read after the piece went, never before.' using errcode = '23514';
  end if;
  if new.read_at > now() + interval '5 minutes' then
    raise exception 'refused: a figure is entered once it has been read, not before.' using errcode = '23514';
  end if;
  if new.metric = 'watch_time_seconds' and v_kind <> 'discovery_reel' then
    raise exception 'refused: watch time is entered only for the Discovery Reel, the campaign''s one video piece.' using errcode = '23514';
  end if;
  return new;
end;
$due$;

drop trigger if exists social_piece_figures_are_due on public.social_piece_figures;
create trigger social_piece_figures_are_due
  before insert on public.social_piece_figures
  for each row execute function public.social_piece_figure_is_due();

-- ---------------------------------------------------------------------------
-- J17, G3, G4: a person's answer to each recommendation of a week's report
-- ---------------------------------------------------------------------------
create table if not exists public.social_report_decisions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.social_campaigns(id) on delete cascade,
  -- The rule that proposed it (src/lib/growth/social-report-math.ts), one answer per rule per week.
  rule text not null check (rule ~ '^[a-z][a-z_]{2,59}$'),
  -- The words and the data as they were shown when the person answered.
  recommendation text not null check (length(btrim(recommendation)) between 10 and 600 and recommendation !~ ('[' || chr(8211) || chr(8212) || '!]')),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  decision text not null check (decision in ('approved', 'declined')),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (campaign_id, rule)
);

comment on table public.social_report_decisions is
  'J17, G4: the founder''s approval or refusal of one recommendation of a weekly report, with the words and data shown; no rule changes by itself.';

-- ---------------------------------------------------------------------------
-- ROW SECURITY AND GRANTS: staff only, through the service role, added to and never rewritten.
-- ---------------------------------------------------------------------------
alter table public.social_piece_figures enable row level security;
alter table public.social_report_decisions enable row level security;

revoke all on public.social_piece_figures from public, anon, authenticated, service_role;
revoke all on public.social_report_decisions from public, anon, authenticated, service_role;
grant select, insert on public.social_piece_figures to service_role;
grant select, insert on public.social_report_decisions to service_role;

revoke all on function public.social_piece_figure_is_due() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
  v_t text;
begin
  foreach v_t in array array['social_piece_figures', 'social_report_decisions'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity) then
      v_missing := v_missing || ' ' || v_t || '.rls';
    end if;
  end loop;
  for v_cell in
    select t.tbl, r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT')) as expected
      from (values ('public.social_piece_figures'), ('public.social_report_decisions')) as t(tbl)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, v_cell.tbl, v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'social_piece_figures_are_due' and not tgisinternal) then
    v_missing := v_missing || ' trigger.social_piece_figures_are_due';
  end if;

  if v_missing <> '' then
    raise exception 'Social measurement migration post-condition failed:%', v_missing;
  end if;
end
$post$;
