-- CAR C, MEASURE (the PM's 21:00 of 18 November 2026; law 29, the operating model's sections 1 and 8; law 21 (h): measure
-- what is real). A platform's own figures for a piece that went are read once a day from Blotato's published analytics
-- (GET /v2/analytics: https://backend.blotato.com/openapi.json, read 18 November 2026, 23:04), as well as typed by a person
-- from the app's insights (J16, 20261028151001). They are the same ENTERED kind of figure: a platform's report, kept apart
-- from what EventLinqs counted (K14; scripts/guards/social-measured-apart.mjs), written only by
-- src/lib/growth/social-report.ts.
--
-- 1. A figure says where it came from: 'person' (typed, with who) or 'blotato' (read by the daily run, with no person).
-- 2. The metrics take Blotato's: impressions, views, likes, comments and clicks beside reach, saves, shares and watch time.
-- 3. A figure read from Blotato keeps the post's own Blotato id and its public address, so a post Blotato published whose
--    id our run lost (the five of 18 November) is found and kept in the database.
-- 4. THE FIGURE RULE IN FORCE IS CHANGED IN PLACE (law 14 (z)): today it accepts a figure only for a piece recorded by
--    hand (social_piece_postings), and every piece the hourly run publishes is recorded in social_piece_schedules (state
--    published), so every automatic post's figure would be refused. It now takes the piece's first published schedule
--    when no posting was recorded by hand, and else the first held schedule Blotato accepted while our database refused
--    its reference (read on production at 23:07:12: the five of 18 November, held with the published_ref_check's
--    refusal, none with a published sibling). The rest of the rule is as it was.
--
-- Additive: three columns and one check added, one check widened, one function changed in place; no row changes (the
-- table held 0 rows on production at 23:04:38 on 18 November). Reversal: drop the three columns and the source check,
-- restore the metric check to its four, and replace the one fragment back.

-- 1 and 3: where a figure came from, and a Blotato figure's post
alter table public.social_piece_figures add column if not exists source text not null default 'person';
alter table public.social_piece_figures add column if not exists platform_post_id text;
alter table public.social_piece_figures add column if not exists post_url text;
alter table public.social_piece_figures alter column entered_by drop not null;

do $cols$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_piece_figures_source_check') then
    alter table public.social_piece_figures add constraint social_piece_figures_source_check
      check (source in ('person', 'blotato'));
  end if;
  -- A person's figure names who typed it; a figure read from Blotato names no person and carries its post.
  if not exists (select 1 from pg_constraint where conname = 'social_piece_figures_who_check') then
    alter table public.social_piece_figures add constraint social_piece_figures_who_check
      check ((source = 'person' and entered_by is not null) or (source = 'blotato' and entered_by is null and platform_post_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_piece_figures_post_check') then
    alter table public.social_piece_figures add constraint social_piece_figures_post_check
      check ((platform_post_id is null or platform_post_id ~ '^[A-Za-z0-9_-]{1,200}$')
         and (post_url is null or post_url ~* '^https://(www\.)?(instagram\.com|facebook\.com|fb\.com)/[^[:space:]]+$'));
  end if;
end
$cols$;

-- 2: the metrics, widened to Blotato's own
alter table public.social_piece_figures drop constraint if exists social_piece_figures_metric_check;
alter table public.social_piece_figures add constraint social_piece_figures_metric_check
  check (metric in ('reach', 'watch_time_seconds', 'saves', 'shares', 'impressions', 'views', 'likes', 'comments', 'clicks'));

create index if not exists social_piece_figures_by_post on public.social_piece_figures (platform_post_id, metric, read_at desc) where platform_post_id is not null;

-- 4: the figure rule in force, changed in place (law 14 (z)): found by its name and arguments, read from
-- pg_get_functiondef, each exact text counted before it is replaced.
do $migrate$
declare
  v_def text;
  v_old text := 'select p.kind, g.posted_at into v_kind, v_posted';
  -- A piece went when it was recorded by hand, when the run published it, or when Blotato accepted it and our database
  -- refused its reference (held 'Sent as blotato:' since #303, and the five of 18 November held with the check's refusal).
  v_new text := 'select p.kind, coalesce(g.posted_at, (select min(s.published_at) from public.social_piece_schedules s where s.piece_id = p.id and s.state = ''published''), (select min(s.go_at) from public.social_piece_schedules s where s.piece_id = p.id and s.state = ''held'' and (s.held_reason like ''Sent as blotato:%'' or s.held_reason like ''%social_piece_schedules_published_ref_check%''))) into v_kind, v_posted';
  v_count int;
begin
  v_def := pg_get_functiondef('public.social_piece_figure_is_due()'::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then
    raise exception 'the figure rule in force holds its posted-at read % times, not once; nothing changed', v_count;
  end if;
  execute replace(v_def, v_old, v_new);
end
$migrate$;

comment on column public.social_piece_figures.source is
  'Where the figure came from: person (typed from the app''s insights, with entered_by) or blotato (read by the daily run from GET /v2/analytics, with the post''s own id).';

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_def text := pg_get_functiondef('public.social_piece_figure_is_due()'::regprocedure);
begin
  if position('social_piece_schedules' in v_def) = 0 then
    v_missing := v_missing || ' rule.reads_published_schedules';
  end if;
  if position('refused: watch time is entered only for the Discovery Reel' in v_def) = 0 then
    v_missing := v_missing || ' rule.kept_its_other_refusals';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_piece_figures_who_check') then
    v_missing := v_missing || ' check.who';
  end if;
  if position('clicks' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_piece_figures_metric_check')) = 0 then
    v_missing := v_missing || ' check.metric_widened';
  end if;
  if has_table_privilege('anon', 'public.social_piece_figures', 'SELECT') or has_table_privilege('authenticated', 'public.social_piece_figures', 'SELECT') then
    v_missing := v_missing || ' grants.still_staff_only';
  end if;
  if v_missing <> '' then
    raise exception 'Social figures from Blotato migration post-condition failed:%', v_missing;
  end if;
end
$post$;
