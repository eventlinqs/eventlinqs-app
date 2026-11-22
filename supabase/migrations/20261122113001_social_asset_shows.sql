-- WHAT A PHOTOGRAPH SHOWS, AS A PERSON WHO LOOKED RECORDED IT (the PM's 11:05 of 22 November 2026, one class; Lawal,
-- 10:52: "I don't like your photo selection ... use those better ones"). AMCF's final day feed carried bb4fd8a5 (three
-- women dancing, a close crop with a camera rig behind them) because it led by rank, while the organiser's own set held
-- the Fed Square crowd under the skyline and the main stage with AMCF's name on the screen. The planner now ranks the
-- photographs an organiser authorised by how strongly each shows the event (its crowd, its stage, its own name, its
-- setting) above close crops and details (src/lib/social/lifecycle.ts rankPhotos), from this column, written by the
-- person who looks (law 5; law 37 (k)).
--
-- Additive: one column with an empty default, so every row reads as before until someone records what it shows. The
-- words are a closed list. Forward recovery: the planner reads an empty list as 'not yet recorded' and ranks by lead
-- rank as it did.

alter table public.social_assets add column if not exists shows text[] not null default '{}';
alter table public.social_assets drop constraint if exists social_assets_shows_check;
alter table public.social_assets add constraint social_assets_shows_check
  check (shows <@ array['crowd', 'stage', 'name', 'setting', 'performers', 'food', 'close', 'detail', 'portrait']::text[]);

grant update (shows) on public.social_assets to service_role;
