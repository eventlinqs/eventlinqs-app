-- WHERE AN ORGANISER CAME FROM (Lawal's rulings of 26 November 2026, 22:52 and 23:01; EVENTLINQS-SOCIAL-ORGANISER-ENGINE-
-- LOCKED-26NOV.md version 2, section 3: "the form records no source. Capture of the source channel is the first fix";
-- the PM's car K lean, item K1). Two additions, nothing removed:
--   1. the listing form's four answers on each submission: where they found us (pre-filled from the channel link's ?src),
--      where else they list or sell, their main social account, and how often they run events;
--   2. every organiser record carries its source channel. Every row on production today was found by discovery (the
--      scout, the discovery run or a person's CRM entry: read in the code on 26 November 2026, the only three writers),
--      so 'discovery' is each existing row's channel and the default; a writer from another channel names its own.

alter table public.listing_submissions add column if not exists found_us text;
alter table public.listing_submissions add column if not exists found_us_src text;
alter table public.listing_submissions add column if not exists also_listed_on text;
alter table public.listing_submissions add column if not exists social_account text;
alter table public.listing_submissions add column if not exists event_frequency text;

alter table public.listing_submissions drop constraint if exists listing_submissions_found_us_known;
alter table public.listing_submissions add constraint listing_submissions_found_us_known
  check (found_us is null or found_us in ('instagram', 'facebook', 'email', 'qr', 'referral', 'search', 'other'));
alter table public.listing_submissions drop constraint if exists listing_submissions_found_us_src_known;
alter table public.listing_submissions add constraint listing_submissions_found_us_src_known
  check (found_us_src is null or found_us_src in ('ig', 'fb', 'email', 'qr', 'ref'));
alter table public.listing_submissions drop constraint if exists listing_submissions_event_frequency_known;
alter table public.listing_submissions add constraint listing_submissions_event_frequency_known
  check (event_frequency is null or event_frequency in ('once', 'monthly', 'fortnightly', 'weekly', 'more_than_weekly'));
alter table public.listing_submissions drop constraint if exists listing_submissions_source_answers_short;
alter table public.listing_submissions add constraint listing_submissions_source_answers_short
  check (coalesce(length(also_listed_on), 0) <= 200 and coalesce(length(social_account), 0) <= 200);

alter table public.organisers add column if not exists source_channel text not null default 'discovery';
alter table public.organisers drop constraint if exists organisers_source_channel_known;
alter table public.organisers add constraint organisers_source_channel_known
  check (source_channel in ('discovery', 'form', 'instagram', 'facebook', 'email', 'qr', 'referral', 'inbound'));

comment on column public.listing_submissions.found_us is 'Where the organiser says they found us (the listing form, pre-filled from ?src).';
comment on column public.listing_submissions.found_us_src is 'The channel link they arrived by: /list?src=ig, fb, email, qr or ref.';
comment on column public.organisers.source_channel is 'Where this organiser came from; discovery for every row found by the scout, the discovery run or a person.';
