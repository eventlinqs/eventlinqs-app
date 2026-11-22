-- THE PUBLISHING REVERSAL'S SWITCH (the PM's 17:20 of 22 November 2026): /api/cron/social-publish runs every ten minutes;
-- if the watchdog (src/lib/social/publish-run.ts socialWatchdog) finds two publishing runs overlapping, or a piece with two
-- posting rows on one network, it turns this on, and only the hour's own run (40 to 49 minutes past) publishes, as the
-- hourly cron did, until a person turns it off. Off by default. One row in an existing table: no grant changes.
insert into public.feature_flags (flag, enabled, description)
values ('social_publish_hourly', false,
  'The publishing reversal: while on, only the hour''s own social publish run (40 to 49 minutes past) publishes. The watchdog turns it on when two runs overlap or a piece has two posting rows on one network; a person turns it off.')
on conflict (flag) do nothing;
