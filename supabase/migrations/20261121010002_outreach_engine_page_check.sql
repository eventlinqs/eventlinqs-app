-- THE ENGINE CHECKS THE PAGE, AND KEEPS A COPY (Lawal, 21 November 2026, through the PM's 01:05 of that day, quoted:
-- "my answer is number one: the engine checks. The engine reads each organizer's page and saves a copy as evidence. You
-- see each one in the morning ... report and can stop any ... This engine is meant to run by itself.")
--
-- Spam Act 2003 Schedule 2 clause 4, as 20261028201001 and 20261031053501 record it: a conspicuously published
-- business address is a basis only when the publication carries no statement that they do not want messages. Until now
-- only a person's tick recorded that check (20261031053501: nothing leaves held unchecked). Now the engine may record it
-- too, and only with its evidence:
--   1. organiser_page_checks keeps each engine check whole: the page's URL, a saved copy of the page as read, the
--      copy's sha256 (the database recomputes it, so a check with no copy, or a copy that is not the one hashed, is
--      refused), the time, and each condition's verdict (the address on the organiser's own site; no statement against
--      messages on the page; the organiser runs events in its city). A person can stop a check; a stopped check is kept.
--   2. organiser_contacts.page_checked_by says who ticked: 'person' or 'engine' (null on every earlier tick: a person's).
--   3. The trigger in force (outreach_touch_page_checked, as 20261031080001 left it, read from production on 21 November
--      2026) gains two refusals, changed in place: a letter leaves held on an engine tick only while that contact has an
--      unstopped engine check with its copy; and never while any check of that contact was stopped by a person.
-- Grants (the 21 October 2026 rule): the table is reached by the service role only; no visitor or signed in user reads
-- it. Reversal: drop the two refusals (the trigger as 20261031080001 wrote it), the column and the table.

create table public.organiser_page_checks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.organiser_contacts(id) on delete restrict,
  page_url text not null check (page_url ~* '^https://[^[:space:]]+$'),
  page_html text not null check (length(page_html) > 0),
  page_sha256 text not null,
  checked_by text not null check (checked_by = 'engine'),
  checked_at timestamptz not null default now(),
  verdict jsonb not null check (
    (verdict ->> 'address_on_own_site') = 'true'
    and (verdict ->> 'no_statement_against_messages') = 'true'
    and (verdict ->> 'runs_events_in_its_city') = 'true'
  ),
  stopped_at timestamptz,
  stopped_by uuid,
  stopped_reason text,
  constraint organiser_page_checks_copy_is_what_was_hashed check (page_sha256 = encode(sha256(convert_to(page_html, 'UTF8')), 'hex')),
  constraint organiser_page_checks_stop_is_whole check ((stopped_at is null) = (stopped_by is null))
);

create index organiser_page_checks_contact on public.organiser_page_checks (contact_id);
create index organiser_page_checks_checked_at on public.organiser_page_checks (checked_at desc);

alter table public.organiser_page_checks enable row level security;
revoke all on public.organiser_page_checks from anon, authenticated, service_role;
grant select, insert on public.organiser_page_checks to service_role;
grant update (stopped_at, stopped_by, stopped_reason) on public.organiser_page_checks to service_role;

comment on table public.organiser_page_checks is
  'The engine''s page checks (Lawal, 21 November 2026: the engine checks and saves a copy as evidence): the page as read, its sha256 recomputed by the database, the three conditions, and a person''s stop.';

alter table public.organiser_contacts add column if not exists page_checked_by text
  check (page_checked_by is null or page_checked_by in ('person', 'engine'));

-- The trigger function changed IN PLACE from the text in force (law 14 (z)): each exact text counted before replacing.
do $go$
declare
  v_def text := pg_get_functiondef('public.outreach_touch_page_checked()'::regprocedure);
  v_anchor constant text := $a$  if c.basis = 'conspicuous_publication' and not c.no_marketing_statement_checked then
    raise exception 'refused: % has not been checked for a statement against messages; open the page, check it, then tick it before Sent.', c.published_on_url
      using errcode = '23514';
  end if;
$a$;
  v_added constant text := $b$  if c.basis = 'conspicuous_publication' and c.page_checked_by = 'engine'
     and not exists (select 1 from public.organiser_page_checks k where k.contact_id = c.id and k.stopped_at is null) then
    raise exception 'refused: the engine''s page check of % keeps no saved copy, or it was stopped; nothing leaves on it.', c.published_on_url
      using errcode = '23514';
  end if;
  if exists (select 1 from public.organiser_page_checks k where k.contact_id = c.id and k.stopped_at is not null) then
    raise exception 'refused: the page check of % was stopped by a person; the letter stays held.', c.published_on_url
      using errcode = '23514';
  end if;
$b$;
  v_count int;
begin
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception 'REFUSED: the page check trigger in force does not read as 20261031080001 left it (% match(es))', v_count;
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_added);
end
$go$;
