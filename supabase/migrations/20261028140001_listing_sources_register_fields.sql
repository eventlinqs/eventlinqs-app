-- ============================================================================
-- THE SOURCE REGISTER, EVERY FIELD THE RELEASE CHECKLIST NAMES, HELD BY THE
-- DATABASE (START-16OCT/EVENTLINQS-RELEASE-CHECKLIST-28OCT.md, rows D2 to D5;
-- docs/walk-in/COLLECTION-RUN.md).
--
-- D3: "Register fields: name and URL, type, reuse permission with evidence,
-- permitted content, update frequency, last successful collection, verification
-- status, contact or licence owner." name, page_url, terms_url, terms_quote,
-- terms_read_on and changes exist (20261027140001). This file adds the rest.
--
-- D2: "Five separate permission answers per source: scraping allowed, licensed
-- API or dataset, subscription feed, redistribution of facts, reuse of photos,
-- posters and descriptions." Each is yes, no or unknown, and a yes or a no
-- carries its own quoted line, the address it was read at and the day it was
-- read. A source is 'read' only when scraping, a feed or a dataset is answered
-- yes, its facts are not forbidden, and it has been verified.
--
-- D4: "Permitted content is machine readable and enforced: facts only means the
-- image stays blank, never copied." permits_facts, permits_descriptions,
-- permits_images and permits_links; descriptions and images only where reuse of
-- photos, posters and descriptions is answered yes. A trigger on
-- listing_candidates refuses an image, a description or a link its source does
-- not permit, so the run's own rule (src/lib/listings/collect-run.ts) is not the
-- only lock.
--
-- D5: "Acquisition order: 1 organiser submissions, 2 licensed datasets and
-- feeds, 3 venue partnerships, 4 manual editorial discovery." source_type names
-- the path and acquisition_order is computed from it, never typed.
--
-- EXISTING ROWS. Every new answer defaults to 'unknown', every source to
-- 'manual_research' and 'unverified', content to facts only. A row that was
-- 'read' holds no permission answer yet, so it is set to 'ask' with a note: the
-- run reads nothing there until its answers are recorded and verified (the
-- reversal the collection run already states). TEST held no source on
-- 28 October 2026.
--
-- GRANTS UNCHANGED: both tables stay staff only, the service role alone (the
-- 21 October grant rule, as 20261027140001 wrote them). The trigger function is
-- executable by no API role.
--
-- REVERSIBLE? Drop the trigger, the function, the constraints and the columns;
-- the run then reads the register as 20261027140001 left it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- D5: the source's type, and the acquisition order computed from it.
-- ---------------------------------------------------------------------------
alter table public.listing_sources
  add column if not exists source_type text not null default 'manual_research'
    constraint listing_sources_source_type check (source_type in (
      'organiser_submission', 'licensed_dataset', 'subscription_feed', 'venue_partnership', 'manual_research'));

alter table public.listing_sources
  add column if not exists acquisition_order smallint generated always as (
    case source_type
      when 'organiser_submission' then 1
      when 'licensed_dataset' then 2
      when 'subscription_feed' then 2
      when 'venue_partnership' then 3
      else 4
    end
  ) stored
    constraint listing_sources_acquisition_order check (acquisition_order between 1 and 4);

-- ---------------------------------------------------------------------------
-- D2: five permission answers, each with its own evidence.
-- ---------------------------------------------------------------------------
alter table public.listing_sources
  add column if not exists may_scrape text not null default 'unknown'
    constraint listing_sources_may_scrape check (may_scrape in ('yes', 'no', 'unknown')),
  add column if not exists may_scrape_quote text
    constraint listing_sources_may_scrape_quote check (may_scrape_quote is null or length(btrim(may_scrape_quote)) between 1 and 2000),
  add column if not exists may_scrape_url text
    constraint listing_sources_may_scrape_url check (may_scrape_url is null or may_scrape_url ~* '^https://[^[:space:]]+$'),
  add column if not exists may_scrape_read_on date
    constraint listing_sources_may_scrape_read_on check (may_scrape_read_on is null or may_scrape_read_on >= date '2026-01-01'),

  add column if not exists may_use_dataset text not null default 'unknown'
    constraint listing_sources_may_use_dataset check (may_use_dataset in ('yes', 'no', 'unknown')),
  add column if not exists may_use_dataset_quote text
    constraint listing_sources_may_use_dataset_quote check (may_use_dataset_quote is null or length(btrim(may_use_dataset_quote)) between 1 and 2000),
  add column if not exists may_use_dataset_url text
    constraint listing_sources_may_use_dataset_url check (may_use_dataset_url is null or may_use_dataset_url ~* '^https://[^[:space:]]+$'),
  add column if not exists may_use_dataset_read_on date
    constraint listing_sources_may_use_dataset_read_on check (may_use_dataset_read_on is null or may_use_dataset_read_on >= date '2026-01-01'),

  add column if not exists may_subscribe text not null default 'unknown'
    constraint listing_sources_may_subscribe check (may_subscribe in ('yes', 'no', 'unknown')),
  add column if not exists may_subscribe_quote text
    constraint listing_sources_may_subscribe_quote check (may_subscribe_quote is null or length(btrim(may_subscribe_quote)) between 1 and 2000),
  add column if not exists may_subscribe_url text
    constraint listing_sources_may_subscribe_url check (may_subscribe_url is null or may_subscribe_url ~* '^https://[^[:space:]]+$'),
  add column if not exists may_subscribe_read_on date
    constraint listing_sources_may_subscribe_read_on check (may_subscribe_read_on is null or may_subscribe_read_on >= date '2026-01-01'),

  add column if not exists may_redistribute_facts text not null default 'unknown'
    constraint listing_sources_may_redistribute_facts check (may_redistribute_facts in ('yes', 'no', 'unknown')),
  add column if not exists may_redistribute_facts_quote text
    constraint listing_sources_may_redistribute_facts_quote check (may_redistribute_facts_quote is null or length(btrim(may_redistribute_facts_quote)) between 1 and 2000),
  add column if not exists may_redistribute_facts_url text
    constraint listing_sources_may_redistribute_facts_url check (may_redistribute_facts_url is null or may_redistribute_facts_url ~* '^https://[^[:space:]]+$'),
  add column if not exists may_redistribute_facts_read_on date
    constraint listing_sources_may_redistribute_facts_read_on check (may_redistribute_facts_read_on is null or may_redistribute_facts_read_on >= date '2026-01-01'),

  add column if not exists may_reuse_media text not null default 'unknown'
    constraint listing_sources_may_reuse_media check (may_reuse_media in ('yes', 'no', 'unknown')),
  add column if not exists may_reuse_media_quote text
    constraint listing_sources_may_reuse_media_quote check (may_reuse_media_quote is null or length(btrim(may_reuse_media_quote)) between 1 and 2000),
  add column if not exists may_reuse_media_url text
    constraint listing_sources_may_reuse_media_url check (may_reuse_media_url is null or may_reuse_media_url ~* '^https://[^[:space:]]+$'),
  add column if not exists may_reuse_media_read_on date
    constraint listing_sources_may_reuse_media_read_on check (may_reuse_media_read_on is null or may_reuse_media_read_on >= date '2026-01-01');

-- ---------------------------------------------------------------------------
-- D4: permitted content, each yes or no.
-- ---------------------------------------------------------------------------
alter table public.listing_sources
  add column if not exists permits_facts boolean not null default true,
  add column if not exists permits_descriptions boolean not null default false,
  add column if not exists permits_images boolean not null default false,
  add column if not exists permits_links boolean not null default false;

-- ---------------------------------------------------------------------------
-- D3: verification status, last successful collection, contact or licence owner.
-- ---------------------------------------------------------------------------
alter table public.listing_sources
  add column if not exists verification text not null default 'unverified'
    constraint listing_sources_verification check (verification in ('unverified', 'verified', 'needs_recheck')),
  add column if not exists verified_on date
    constraint listing_sources_verified_on check (verified_on is null or verified_on >= date '2026-01-01'),
  add column if not exists last_success_at timestamptz
    constraint listing_sources_last_success_at check (last_success_at is null or (last_checked_at is not null and last_success_at <= last_checked_at)),
  add column if not exists licence_owner text
    constraint listing_sources_licence_owner check (licence_owner is null or length(btrim(licence_owner)) between 1 and 200),
  add column if not exists contact text
    constraint listing_sources_contact check (contact is null or length(btrim(contact)) between 1 and 300);

-- ---------------------------------------------------------------------------
-- EXISTING ROWS: a 'read' source with no permission answer reads nothing until
-- its answers are recorded.
-- ---------------------------------------------------------------------------
update public.listing_sources
   set collection = 'ask',
       notes = btrim(coalesce(notes, '') || ' Set to ask on 28 October 2026 (20261028140001): no permission answer was recorded; record the five answers and verify the source to read it again.'),
       updated_at = now()
 where collection = 'read'
   and not (may_scrape = 'yes' or may_subscribe = 'yes' or may_use_dataset = 'yes');

-- ---------------------------------------------------------------------------
-- THE RULES ACROSS COLUMNS
-- ---------------------------------------------------------------------------
alter table public.listing_sources drop constraint if exists listing_sources_answers_carry_evidence;
alter table public.listing_sources add constraint listing_sources_answers_carry_evidence check (
  (may_scrape = 'unknown' or (length(btrim(coalesce(may_scrape_quote, ''))) > 0 and may_scrape_url is not null and may_scrape_read_on is not null))
  and (may_use_dataset = 'unknown' or (length(btrim(coalesce(may_use_dataset_quote, ''))) > 0 and may_use_dataset_url is not null and may_use_dataset_read_on is not null))
  and (may_subscribe = 'unknown' or (length(btrim(coalesce(may_subscribe_quote, ''))) > 0 and may_subscribe_url is not null and may_subscribe_read_on is not null))
  and (may_redistribute_facts = 'unknown' or (length(btrim(coalesce(may_redistribute_facts_quote, ''))) > 0 and may_redistribute_facts_url is not null and may_redistribute_facts_read_on is not null))
  and (may_reuse_media = 'unknown' or (length(btrim(coalesce(may_reuse_media_quote, ''))) > 0 and may_reuse_media_url is not null and may_reuse_media_read_on is not null))
);

-- A source is read only where scraping, a feed or a dataset is answered yes, its
-- facts are not forbidden, its facts are what it gives, and it has been verified.
alter table public.listing_sources drop constraint if exists listing_sources_read_needs_permission;
alter table public.listing_sources add constraint listing_sources_read_needs_permission check (
  collection <> 'read'
  or (
    (may_scrape = 'yes' or may_subscribe = 'yes' or may_use_dataset = 'yes')
    and may_redistribute_facts <> 'no'
    and permits_facts
    and verification = 'verified'
  )
);

-- Photos, posters and descriptions only where their reuse is answered yes.
alter table public.listing_sources drop constraint if exists listing_sources_media_needs_permission;
alter table public.listing_sources add constraint listing_sources_media_needs_permission check (
  (not permits_descriptions and not permits_images) or may_reuse_media = 'yes'
);

-- A link points at a fact: no links without the facts.
alter table public.listing_sources drop constraint if exists listing_sources_links_need_facts;
alter table public.listing_sources add constraint listing_sources_links_need_facts check (not permits_links or permits_facts);

alter table public.listing_sources drop constraint if exists listing_sources_verified_is_dated;
alter table public.listing_sources add constraint listing_sources_verified_is_dated check (verification <> 'verified' or verified_on is not null);

comment on column public.listing_sources.source_type is
  'The acquisition path (D5): organiser_submission, licensed_dataset, subscription_feed, venue_partnership or manual_research.';
comment on column public.listing_sources.acquisition_order is
  'Computed from source_type: 1 organiser submissions, 2 licensed datasets and feeds, 3 venue partnerships, 4 manual editorial discovery.';
comment on column public.listing_sources.last_success_at is
  'The last moment a read of this source succeeded (its page or feed answered 2xx and was read). Written by the run only on success.';

-- ---------------------------------------------------------------------------
-- THE CANDIDATE'S DESCRIPTION, AND THE CONTENT ITS SOURCE PERMITS.
-- ---------------------------------------------------------------------------
alter table public.listing_candidates
  add column if not exists description text
    constraint listing_candidates_description check (description is null or length(btrim(description)) between 1 and 2000);

create or replace function public.listing_candidates_hold_permitted_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_source record;
begin
  select permits_facts, permits_descriptions, permits_images, permits_links
    into v_source
    from public.listing_sources
   where id = new.source_id;
  if not found then
    return new; -- the foreign key refuses it
  end if;
  if not v_source.permits_facts then
    raise exception 'listing_candidates: the source permits no facts, so nothing of it lands' using errcode = '23514';
  end if;
  if new.image_url is not null and not v_source.permits_images then
    raise exception 'listing_candidates: the source does not permit its images to be used' using errcode = '23514';
  end if;
  if new.description is not null and not v_source.permits_descriptions then
    raise exception 'listing_candidates: the source does not permit its descriptions to be used' using errcode = '23514';
  end if;
  if jsonb_array_length(new.links) > 0 and not v_source.permits_links then
    raise exception 'listing_candidates: the source does not permit its links to be used' using errcode = '23514';
  end if;
  return new;
end
$fn$;

comment on function public.listing_candidates_hold_permitted_content() is
  'D4: a candidate carries an image, a description or links only where its source permits them, and nothing lands from a source that permits no facts.';

revoke all on function public.listing_candidates_hold_permitted_content() from public, anon, authenticated;

drop trigger if exists trg_listing_candidates_hold_permitted_content on public.listing_candidates;
create trigger trg_listing_candidates_hold_permitted_content
  before insert or update of source_id, image_url, description, links on public.listing_candidates
  for each row execute function public.listing_candidates_hold_permitted_content();

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS: the columns, the rules and the grants as 20261027140001 left them.
-- ---------------------------------------------------------------------------
do $post$
declare
  v_missing text := '';
  v_col text;
  v_con text;
  v_cell record;
begin
  foreach v_col in array array[
    'source_type', 'acquisition_order', 'may_scrape', 'may_scrape_quote', 'may_scrape_url', 'may_scrape_read_on',
    'may_use_dataset', 'may_use_dataset_quote', 'may_use_dataset_url', 'may_use_dataset_read_on',
    'may_subscribe', 'may_subscribe_quote', 'may_subscribe_url', 'may_subscribe_read_on',
    'may_redistribute_facts', 'may_redistribute_facts_quote', 'may_redistribute_facts_url', 'may_redistribute_facts_read_on',
    'may_reuse_media', 'may_reuse_media_quote', 'may_reuse_media_url', 'may_reuse_media_read_on',
    'permits_facts', 'permits_descriptions', 'permits_images', 'permits_links',
    'verification', 'verified_on', 'last_success_at', 'licence_owner', 'contact'
  ] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'listing_sources' and column_name = v_col) then
      v_missing := v_missing || ' listing_sources.' || v_col;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'listing_candidates' and column_name = 'description') then
    v_missing := v_missing || ' listing_candidates.description';
  end if;
  foreach v_con in array array[
    'listing_sources_answers_carry_evidence', 'listing_sources_read_needs_permission',
    'listing_sources_media_needs_permission', 'listing_sources_links_need_facts', 'listing_sources_verified_is_dated'
  ] loop
    if not exists (select 1 from pg_constraint where conname = v_con and conrelid = 'public.listing_sources'::regclass) then
      v_missing := v_missing || ' constraint.' || v_con;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'trg_listing_candidates_hold_permitted_content'
                  and tgrelid = 'public.listing_candidates'::regclass) then
    v_missing := v_missing || ' trigger.trg_listing_candidates_hold_permitted_content';
  end if;
  for v_cell in
    select t.tbl, r.role, p.priv, (r.role = 'service_role' and p.priv in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) as expected
      from (values ('public.listing_sources'), ('public.listing_candidates')) as t(tbl)
     cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  loop
    if has_table_privilege(v_cell.role, v_cell.tbl, v_cell.priv) is distinct from v_cell.expected then
      v_missing := v_missing || ' ' || v_cell.tbl || '.' || v_cell.role || '.' || v_cell.priv
                   || case when v_cell.expected then '_must_be_granted' else '_must_not_be_granted' end;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.listing_candidates_hold_permitted_content()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.listing_candidates_hold_permitted_content()', 'EXECUTE') then
    v_missing := v_missing || ' function.listing_candidates_hold_permitted_content.api_role_can_execute';
  end if;

  if v_missing <> '' then
    raise exception 'Source register fields migration post-condition failed:%', v_missing;
  end if;
end
$post$;
