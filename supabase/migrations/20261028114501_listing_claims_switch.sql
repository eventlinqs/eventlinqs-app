-- The claim switch's row (the project manager's 01:13 (1) and 11:30 of 28 October 2026): its own migration, because
-- 20261027150001_listing_claims.sql was applied to production and TEST at 21:40 of 27 October 2026 and runs nowhere
-- again. One row, the switch, OFF on every database this file reaches; with no row the switch already reads OFF, and
-- the row lets the governed switch turn claims on later, only after Lawal approves the privacy version that names
-- claims, by a row change, never by a deploy.
insert into public.feature_flags (flag, enabled, description)
values (
  'listing_claims',
  false,
  'WI2 Part 3b, claim this venue and claim this event. OFF until Lawal approves the privacy policy version that names claims (the project manager, 27 October 2026).'
)
on conflict (flag) do nothing;
