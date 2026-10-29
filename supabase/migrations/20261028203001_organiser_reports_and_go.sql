-- THE ORGANISER'S REPORT AFTER EACH NIGHT, AND THE PRESSES ON /go (the EventLinqs engine plan of 28 October 2026, part H,
-- and Lawal's final directive of that day: "Build eventlinqs.com.au/go: a fast link page listing each live post's
-- tracked link (window 5). Outbound clicks are never called sales."; window 5's plan line in BP-STATE.md, 20:05).
--
-- organiser_night_reports: once a night has ended, the factual figures EventLinqs counted for it, written once by the
--   hourly sweep (src/app/api/cron/organiser-reports/route.ts) and never rewritten, so the organiser and Lawal read the
--   same numbers as of the same moment. COUNTED only (page visitors and views, presses out to booking sites, orders on
--   EventLinqs, saves, the social pieces that named it); a press out is never called a sale (K14). Nothing here sends
--   an email: the report is held for Lawal, and a person records when it was sent, once.
-- go_presses: each press on a /go link, one per visitor per piece per Melbourne day, never for a crawler. A link in an
--   Instagram bio arrives with Instagram as its referrer and then our own page, so without this hop the piece that
--   brought the visit is lost; the hop counts the press, then lands the visitor on the piece's own stored link.
--
-- Staff only, through the service role (the 21 October grant rule, as 20261028151001). The organiser reads their own
-- report through the dashboard's ownership gate (getOrganiserEvent), as the reach panel reads share_link_events.
-- Additive: two new tables, one trigger, no change to any existing row.
--
-- Reversal: drop the two tables and the trigger function. Nothing else writes them.

-- ---------------------------------------------------------------------------
-- The organiser's report, one per ended night
-- ---------------------------------------------------------------------------
create table if not exists public.organiser_night_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- The figures as the sweep read them (src/lib/growth/organiser-report-math.ts), each counted, never entered.
  figures jsonb not null check (jsonb_typeof(figures) = 'object'),
  -- When the night ended and when its figures were read: a figure is true only as of a moment.
  night_ended_at timestamptz not null,
  read_at timestamptz not null default now(),
  -- Held for Lawal. A person records that it was sent, once; code never sends it.
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete restrict,
  constraint organiser_night_reports_read_after_the_night check (read_at >= night_ended_at),
  constraint organiser_night_reports_sent_whole check ((sent_at is null) = (sent_by is null))
);

create index if not exists organiser_night_reports_by_organisation on public.organiser_night_reports (organisation_id, night_ended_at desc);
create index if not exists organiser_night_reports_held on public.organiser_night_reports (night_ended_at desc) where sent_at is null;

comment on table public.organiser_night_reports is
  'Engine plan part H: the counted figures for one ended night, written once, held for Lawal; sent_at and sent_by are recorded by a person, once. A press out is never a sale.';

-- Written once: the figures never change, and a sending is recorded once and never undone.
create or replace function public.organiser_night_report_is_kept()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $kept$
begin
  if tg_op = 'INSERT' then
    if new.night_ended_at > now() then
      raise exception 'refused: a night is reported once it has ended, not before.' using errcode = '23514';
    end if;
    if new.sent_at is not null then
      raise exception 'refused: a report is written held; its sending is recorded afterwards by a person.' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.event_id is distinct from old.event_id or new.organisation_id is distinct from old.organisation_id
     or new.figures is distinct from old.figures or new.night_ended_at is distinct from old.night_ended_at
     or new.read_at is distinct from old.read_at then
    raise exception 'refused: a report''s figures are kept as they were read.' using errcode = '23514';
  end if;
  if old.sent_at is not null then
    raise exception 'refused: this report''s sending is already recorded.' using errcode = '23514';
  end if;
  return new;
end;
$kept$;

drop trigger if exists organiser_night_reports_are_kept on public.organiser_night_reports;
create trigger organiser_night_reports_are_kept
  before insert or update on public.organiser_night_reports
  for each row execute function public.organiser_night_report_is_kept();

-- ---------------------------------------------------------------------------
-- A press on /go
-- ---------------------------------------------------------------------------
create table if not exists public.go_presses (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.social_pieces(id) on delete cascade,
  -- Which profile the /go page was opened from, as its link named it; never read from a referrer.
  via text not null check (via in ('instagram', 'facebook', 'other')),
  -- The salted visitor key the share links use (src/lib/broadcast/share-links.ts visitorHash), never an identity.
  visitor text not null check (length(visitor) between 8 and 128),
  -- The Melbourne day of the press: one per visitor per piece per day.
  day date not null,
  pressed_at timestamptz not null default now(),
  unique (piece_id, visitor, day)
);

create index if not exists go_presses_by_piece on public.go_presses (piece_id, pressed_at);

comment on table public.go_presses is
  'Engine plan part H: a press on a /go link, one per visitor per piece per Melbourne day, never a crawler; a press is an arrival, never a sale.';

-- ---------------------------------------------------------------------------
-- ROW SECURITY AND GRANTS: staff only, through the service role.
-- ---------------------------------------------------------------------------
alter table public.organiser_night_reports enable row level security;
alter table public.go_presses enable row level security;

revoke all on public.organiser_night_reports from public, anon, authenticated, service_role;
revoke all on public.go_presses from public, anon, authenticated, service_role;
grant select, insert on public.organiser_night_reports to service_role;
grant update (sent_at, sent_by) on public.organiser_night_reports to service_role;
grant select, insert on public.go_presses to service_role;

revoke all on function public.organiser_night_report_is_kept() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_cell record;
  v_t text;
begin
  foreach v_t in array array['organiser_night_reports', 'go_presses'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity) then
      v_missing := v_missing || ' ' || v_t || '.rls';
    end if;
  end loop;
  for v_cell in
    select t.tbl, r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT')) as expected
      from (values ('public.organiser_night_reports'), ('public.go_presses')) as t(tbl)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, v_cell.tbl, v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;
  for v_cell in
    select c.col, r.role, (r.role = 'service_role' and c.col in ('sent_at', 'sent_by')) as expected
      from (values ('figures'), ('sent_at'), ('sent_by'), ('read_at'), ('event_id')) as c(col)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
  loop
    if has_column_privilege(v_cell.role, 'public.organiser_night_reports', v_cell.col, 'UPDATE') is distinct from v_cell.expected then
      v_missing := v_missing || ' organiser_night_reports.' || v_cell.col || '.' || v_cell.role || '.UPDATE'
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'organiser_night_reports_are_kept' and not tgisinternal) then
    v_missing := v_missing || ' trigger.organiser_night_reports_are_kept';
  end if;

  if v_missing <> '' then
    raise exception 'Organiser reports and /go migration post-condition failed:%', v_missing;
  end if;
end
$post$;
