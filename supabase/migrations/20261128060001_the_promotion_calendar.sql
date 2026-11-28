-- THE PROMOTION CALENDAR (the PM's 15:58 and 16:05 of 27 November 2026, car O; the social operating model of 27 November,
-- version 2, sections 1 and 2). Every event still ahead is given a type, and each type has default days before the event
-- for its three stages: the initial promotion, the follow up and the final reminder. The days are defaults the Saturday
-- learning run tunes from EventLinqs' own results (within 25 per cent; a bigger change goes to Lawal), so they live here,
-- versioned, never in code:
--   promotion_lead_times  one row a type and stage and version: days before (or the season's or the recurring night's own
--                         rule), whether only a story, who set it and why. The newest version of a type and stage rules.
--   event_promotions      one row an event and stage: its type, the day it is due, late listing, an exclusion (sold out,
--                         cancelled, ended) with its reason, a flagged same day exception with its reason, and once
--                         posted its piece, when, and its results. The studio reads the due rows and writes back.
-- Service role only (the 21 October 2026 grant rule): the site's own run writes them, the studio's runs read them.

create table if not exists public.promotion_lead_times (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('major', 'theatre', 'comedy_nightlife', 'community', 'sport', 'free_local', 'season', 'recurring')),
  stage text not null check (stage in ('initial', 'follow_up', 'final')),
  days_before integer check (days_before between 0 and 120),
  rule text check (rule in ('opening_week', 'mid_run', 'final_week', 'fortnightly_discovery', 'weekend_preview', 'event_day')),
  story_only boolean not null default false,
  version integer not null default 1 check (version >= 1),
  set_at timestamptz not null default now(),
  set_by text not null check (length(trim(set_by)) >= 2),
  reason text not null check (length(trim(reason)) >= 10),
  unique (event_type, stage, version),
  check ((days_before is null) <> (rule is null))
);

insert into public.promotion_lead_times (event_type, stage, days_before, rule, story_only, set_by, reason) values
  ('major', 'initial', 42, null, false, 'operating model 27 Nov', 'Section 1 default: major concerts and festivals'),
  ('major', 'follow_up', 17, null, false, 'operating model 27 Nov', 'Section 1 default: major concerts and festivals'),
  ('major', 'final', 5, null, false, 'operating model 27 Nov', 'Section 1 default: major concerts and festivals'),
  ('theatre', 'initial', 21, null, false, 'operating model 27 Nov', 'Section 1 default: theatre and ticketed performances'),
  ('theatre', 'follow_up', 10, null, false, 'operating model 27 Nov', 'Section 1 default: theatre and ticketed performances'),
  ('theatre', 'final', 2, null, false, 'operating model 27 Nov', 'Section 1 default: theatre and ticketed performances'),
  ('comedy_nightlife', 'initial', 10, null, false, 'operating model 27 Nov', 'Section 1 default: comedy and nightlife'),
  ('comedy_nightlife', 'follow_up', 4, null, false, 'operating model 27 Nov', 'Section 1 default: comedy and nightlife'),
  ('comedy_nightlife', 'final', 0, null, true, 'operating model 27 Nov', 'Section 1 default: comedy and nightlife, event day story only, only if tickets remain'),
  ('community', 'initial', 21, null, false, 'operating model 27 Nov', 'Section 1 default: community, cultural and family events'),
  ('community', 'follow_up', 7, null, false, 'operating model 27 Nov', 'Section 1 default: community, cultural and family events'),
  ('community', 'final', 1, null, false, 'operating model 27 Nov', 'Section 1 default: community, cultural and family events'),
  ('sport', 'initial', 14, null, false, 'operating model 27 Nov', 'Section 1 default: ticketed sport'),
  ('sport', 'follow_up', 5, null, false, 'operating model 27 Nov', 'Section 1 default: ticketed sport'),
  ('sport', 'final', 1, null, false, 'operating model 27 Nov', 'Section 1 default: ticketed sport'),
  ('free_local', 'initial', 7, null, false, 'operating model 27 Nov', 'Section 1 default: free local activities'),
  ('free_local', 'follow_up', 2, null, false, 'operating model 27 Nov', 'Section 1 default: free local activities'),
  ('free_local', 'final', 0, null, true, 'operating model 27 Nov', 'Section 1 default: free local activities, event day story only, only where useful'),
  ('season', 'initial', null, 'opening_week', false, 'operating model 27 Nov', 'Section 1 default: long running seasons and exhibitions, before opening where possible'),
  ('season', 'follow_up', null, 'mid_run', false, 'operating model 27 Nov', 'Section 1 default: long running seasons and exhibitions'),
  ('season', 'final', null, 'final_week', false, 'operating model 27 Nov', 'Section 1 default: long running seasons and exhibitions, last chance'),
  ('recurring', 'initial', null, 'fortnightly_discovery', false, 'operating model 27 Nov', 'Section 1 default: recurring nights, in weekly discovery, how often by how they perform'),
  ('recurring', 'follow_up', null, 'weekend_preview', false, 'operating model 27 Nov', 'Section 1 default: recurring nights, the weekend preview when on a weekend'),
  ('recurring', 'final', null, 'event_day', true, 'operating model 27 Nov', 'Section 1 default: recurring nights, event day story only')
on conflict (event_type, stage, version) do nothing;

create table if not exists public.event_promotions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  event_type text not null check (event_type in ('major', 'theatre', 'comedy_nightlife', 'community', 'sport', 'free_local', 'season', 'recurring')),
  type_basis text not null check (length(trim(type_basis)) >= 3),
  stage text not null check (stage in ('initial', 'follow_up', 'final')),
  due_on date not null,
  story_only boolean not null default false,
  late_listing boolean not null default false,
  lead_version integer not null check (lead_version >= 1),
  state text not null default 'due' check (state in ('due', 'posted', 'excluded')),
  excluded_reason text check (state <> 'excluded' or length(trim(excluded_reason)) >= 3),
  exception boolean not null default false,
  exception_reason text check (not exception or length(trim(exception_reason)) >= 10),
  piece_id uuid,
  posted_at timestamptz,
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, stage)
);

create index if not exists event_promotions_due on public.event_promotions (due_on) where state = 'due';

alter table public.promotion_lead_times enable row level security;
alter table public.event_promotions enable row level security;
revoke all on public.promotion_lead_times, public.event_promotions from anon, authenticated, service_role;
grant select, insert on public.promotion_lead_times to service_role;
grant select, insert, update on public.event_promotions to service_role;
