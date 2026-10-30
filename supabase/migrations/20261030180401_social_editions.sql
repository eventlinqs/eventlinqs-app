-- D5, THE OWNED EDITIONS (Lawal's final directive of 30 October 2026, section 5; window 3).
--
-- The week's campaign may now hold two more editions per city: Friday's 'tonight_tomorrow' (the city's Friday and
-- Saturday nights) and a 'category_spotlight' (the city's strongest category of the week). Each is one piece of its
-- kind per city in a campaign, the rule every city piece already keeps (social_pieces_once, F7), so the once-only
-- index needs no change; neither carries a share link of its own, so social_pieces_partner_link stays as it is.
--
-- Additive in effect: the kind list widened by two, every existing row keeps its meaning exactly. No table is created,
-- so no grant is written (the 21 October 2026 rule binds a migration that creates a public table).
-- Proved on TEST by scripts/verify/social-editions-proof.sql, rolled back.

alter table public.social_pieces drop constraint if exists social_pieces_kind_check;
alter table public.social_pieces add constraint social_pieces_kind_check
  check (kind in ('week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit',
                  'brand_campaign', 'daily_poster', 'tonight_tomorrow', 'category_spotlight'));
