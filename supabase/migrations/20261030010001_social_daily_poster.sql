-- FAMILY F, THE DAILY POSTER (Lawal, 00:20 on 30 October 2026; C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-DIRECTIVE-30OCT.md).
--
-- A week's campaign may now hold a daily poster: one night per city per day. A piece has always been one of its kind
-- per city and partner in a campaign (social_pieces_once, F7: a second press of Plan this week makes nothing); a daily
-- poster is one per city per DAY, so the piece carries its day and the rule counts it.
--
-- Its photograph is held by the rules already in place: every slide's 'photo' is checked against the asset register
-- for its 'eventId' when the piece is approved, posted and published (social_asset_usable), whatever the slide's type.
--
-- Additive in effect: one nullable column, the kind list widened by one, a rule tying the column to the kind, and the
-- once-only index rebuilt with the day in it (every existing piece has no day, so it keeps its meaning exactly).
-- Proved on TEST by scripts/verify/social-daily-poster-proof.sql, rolled back.

alter table public.social_pieces add column if not exists poster_day date;
comment on column public.social_pieces.poster_day is 'The day a daily poster is for (Melbourne''s calendar); set for a daily_poster and for no other kind.';

alter table public.social_pieces drop constraint if exists social_pieces_kind_check;
alter table public.social_pieces add constraint social_pieces_kind_check
  check (kind in ('week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit', 'brand_campaign', 'daily_poster'));

alter table public.social_pieces drop constraint if exists social_pieces_poster_day_is_its_kind;
alter table public.social_pieces add constraint social_pieces_poster_day_is_its_kind
  check ((kind = 'daily_poster') = (poster_day is not null));

-- A daily poster carries the night's own /e/ link on its story and square (the directive's correction 3), so it may
-- hold a share link of its own, as a partner kit does; no other kind may.
alter table public.social_pieces drop constraint if exists social_pieces_partner_link;
alter table public.social_pieces add constraint social_pieces_partner_link
  check (share_link_id is null or kind in ('partner_kit', 'daily_poster'));

drop index if exists public.social_pieces_once;
create unique index social_pieces_once
  on public.social_pieces (campaign_id, kind, city, coalesce(partner_name, ''), coalesce(poster_day, '0001-01-01'::date));
