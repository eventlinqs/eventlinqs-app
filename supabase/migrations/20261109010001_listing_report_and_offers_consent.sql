-- THE SELL-THROUGH REPORT AND THE ORGANISER'S YES TO HEAR ABOUT SELLING (Lawal's ruling of 8 November 2026, 16:13, build 3).
-- The day after a listed event ends, its organiser gets a short report of what EventLinqs counted for it (people who opened
-- its page, saved it, asked to be reminded, went on to the booking page), sent once and recorded here. The report is about
-- the organiser's own listing, which the form's notice covers ('to contact you about its listing').
--
-- The line inviting them to sell their next event on EventLinqs makes a message commercial under the Spam Act 2003, which
-- needs consent; ACMA's guidance prefers express consent and puts the proof on the sender. So the listing form now asks,
-- unticked, and a yes is kept with the exact words the organiser ticked and the moment they did (the operating rule of
-- 25 September 2026: consent wording is versioned, never edited; each consent keeps the words that were agreed to).
--
-- Additive, and no existing row changes. Both pairs are whole or empty. A report is recorded once and never undone.

alter table public.listing_submissions add column if not exists offers_consent_words text;
alter table public.listing_submissions add column if not exists offers_consent_at timestamptz;
alter table public.listing_submissions drop constraint if exists listing_submissions_offers_consent_whole;
alter table public.listing_submissions
  add constraint listing_submissions_offers_consent_whole check (
    (offers_consent_words is null) = (offers_consent_at is null)
    and (offers_consent_words is null or char_length(offers_consent_words) between 10 and 300)
  );

alter table public.listing_submissions add column if not exists report_sent_at timestamptz;
alter table public.listing_submissions add column if not exists report_outcome text;
alter table public.listing_submissions drop constraint if exists listing_submissions_report_whole;
alter table public.listing_submissions
  add constraint listing_submissions_report_whole check (
    (report_sent_at is null) = (report_outcome is null)
    and (report_outcome is null or char_length(report_outcome) between 4 and 300)
  );

comment on column public.listing_submissions.offers_consent_words is
  'The exact words the organiser ticked to hear about selling tickets on EventLinqs, kept as agreed; null when not ticked.';
comment on column public.listing_submissions.report_sent_at is
  'When the sell-through report for this listing was settled (sent, or recorded as not sent with its reason), once.';

-- Recorded once, and sent at most once: the hourly run first CLAIMS a listing's report (report_outcome 'claimed', written
-- only where report_sent_at is still empty, so two runs cannot both claim it), then sends, then writes the one outcome.
-- A claim is the only outcome that may be replaced, and only by the final outcome with the same moment; a run that dies
-- after its claim leaves 'claimed', and the report is never sent twice.
create or replace function public.listing_report_is_recorded_once()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $once$
begin
  if old.report_sent_at is not null and old.report_outcome = 'claimed'
     and new.report_sent_at is not distinct from old.report_sent_at and new.report_outcome is distinct from 'claimed' then
    null; -- the claim settles to its final outcome, once
  elsif old.report_sent_at is not null
     and (new.report_sent_at is distinct from old.report_sent_at or new.report_outcome is distinct from old.report_outcome) then
    raise exception 'refused: this listing''s report is already recorded.' using errcode = '23514';
  end if;
  if old.offers_consent_at is not null
     and (new.offers_consent_at is distinct from old.offers_consent_at or new.offers_consent_words is distinct from old.offers_consent_words) then
    raise exception 'refused: a consent keeps the words and the moment it was given.' using errcode = '23514';
  end if;
  return new;
end;
$once$;

-- Only an update of the four columns it judges fires it (scripts/guards/a-referential-null-is-not-an-edit.mjs: a trigger on
-- every update would re-judge the whole row when a parent delete sets published_event_id, published_series_id or
-- reviewed_by to null, and could refuse that delete; the shape organisations.trg_founding_waiver_cap uses).
drop trigger if exists listing_report_is_recorded_once on public.listing_submissions;
create trigger listing_report_is_recorded_once
  before update of report_sent_at, report_outcome, offers_consent_at, offers_consent_words on public.listing_submissions
  for each row execute function public.listing_report_is_recorded_once();
