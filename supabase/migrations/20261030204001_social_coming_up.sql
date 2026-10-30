-- D2 AND D5, COMING UP (Lawal's final blueprint, section 4 and 'Sunday/Monday: next week's highlights'; window 3).
--
-- The week's campaign may now hold one more edition per city: 'coming_up', the consideration stage, nights 8 to 20 days
-- from the week's Monday. One of its kind per city in a campaign, the rule every city piece keeps (social_pieces_once,
-- F7), so that index needs no change; it carries no share link of its own.
--
-- Additive in effect: the kind list widened by one, every existing row keeps its meaning exactly. No table is created,
-- so no grant is written. Apply after 20261030180401_social_editions, whose list this extends.
-- Proved on TEST by scripts/verify/social-coming-up-proof.sql, rolled back.

alter table public.social_pieces drop constraint if exists social_pieces_kind_check;
alter table public.social_pieces add constraint social_pieces_kind_check
  check (kind in ('week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit',
                  'brand_campaign', 'daily_poster', 'tonight_tomorrow', 'category_spotlight', 'coming_up'));
