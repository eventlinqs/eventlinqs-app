-- SEO SETTINGS: the owner-editable numbers that govern what search engines index.
--
-- WHY THIS TABLE EXISTS (close-out SEO3, step 2).
--
-- The owner's instruction: "Make indexability conditional on substance, as
-- configuration and not a literal ... The threshold is a single configuration
-- value the owner can change WITHOUT A DEPLOY."
--
-- The rule was already conditional and already a single named constant
-- (DISCOVERY_INDEXING_THRESHOLD in src/lib/seo/indexing-policy.ts, built for
-- close-out C19 on 8 September 2026). What it was NOT is changeable without a
-- deploy: a TypeScript constant needs a build, a push and a deployment before
-- the number moves, which is the wrong shape for a dial the owner is expected
-- to turn when Search Console tells him to.
--
-- SEO3's reversal condition depends on it being same-day: "Setting the
-- substance threshold to a very high number returns every discovery page to
-- noindex without deleting any page or content. If Search Console reports thin
-- content or soft 404s on more than ten percent of discovery pages sixty days
-- after launch, the threshold rises rather than the pages being deleted." A
-- reversal that needs a deploy is a reversal that happens tomorrow.
--
-- WHY A TABLE RATHER THAN AN ENVIRONMENT VARIABLE. Law 9 clause 3: "a setting
-- nobody can diff is a setting nobody can review." An environment variable
-- lives in a dashboard, cannot be read back by a test, and on Vercel needs a
-- redeploy to take effect anyway, so it fails the one requirement it was being
-- considered for. A row is readable by the page, by the sitemap, by a test and
-- by the founder, and every change is stamped with who and when.
--
-- WHY KEY/VALUE RATHER THAN ONE COLUMN PER SETTING. The same shape serves the
-- rest of the SEO block without another migration each: SEO2 needs an indexing
-- check cadence and PARITY1 needs a parity-run interval. A new setting is an
-- INSERT, not a schema change, which is the difference between the owner
-- waiting for this build and the owner waiting for nobody.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It does not hold booleans and it does not
-- hold fees. Feature switches live in public.feature_flags with their own
-- resolver and their own admin screen; the platform fee lives in
-- public.pricing_rules and the constitution names that the ONLY place a fee
-- value may live. This table holds integers that govern indexing and nothing
-- else, and the CHECK constraint below says so in a way a future INSERT cannot
-- argue with.

create table if not exists public.seo_settings (
  key          text primary key,
  value_int    integer not null,
  description  text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,

  -- A threshold below zero is meaningless and a threshold above 1000 is a
  -- typo, not an intention. The reversal condition wants "a very high number",
  -- and 1000 is high enough to switch every discovery page off (the fullest
  -- city page on the platform will not hold a thousand events) while still
  -- being low enough that a stray keystroke is caught here rather than
  -- silently de-indexing the site.
  constraint seo_settings_value_sane check (value_int >= 0 and value_int <= 1000)
);

comment on table public.seo_settings is
  'Owner-editable integers governing what search engines index. Read by src/lib/seo/indexing-policy.ts and src/app/sitemap.ts through one resolver, which falls back to the code constant when this table cannot be read.';

-- THE ONE SETTING THIS MIGRATION CREATES, seeded at the value SEO3 names.
--
-- "Seed the minimum at one." The code constant is seeded at the same number, so
-- the platform behaves identically before and after this migration is applied,
-- and applying it changes nothing until the owner changes the row. That is
-- deliberate: a migration that alters behaviour on the day it lands is a
-- migration whose effect nobody observed.
insert into public.seo_settings (key, value_int, description)
values (
  'discovery_indexing_threshold',
  1,
  'How many publicly visible upcoming events a templated discovery page (city, community, faith, category, suburb, browse-city) must hold before it is offered to search engines and published in the sitemap. Below it the page renders exactly as it does now and carries noindex, follow. Raising this number is the SEO3 reversal condition.'
)
on conflict (key) do nothing;

-- READ BY EVERY VISITOR'S PAGE RENDER, WRITTEN BY NOBODY THROUGH THE API.
--
-- The value decides a robots directive on a public page, so the server render
-- must be able to read it. It is not secret: it is a small integer already
-- observable by fetching any city page and reading the meta tag. So anon and
-- authenticated may SELECT.
--
-- Nothing may INSERT, UPDATE or DELETE through PostgREST. The only writer is
-- the service role (which bypasses RLS) via scripts/ops/set-seo-threshold.mjs,
-- so a change is always a deliberate, logged act by the owner rather than
-- anything reachable from a browser session.
alter table public.seo_settings enable row level security;

drop policy if exists "seo_settings are publicly readable" on public.seo_settings;
create policy "seo_settings are publicly readable"
  on public.seo_settings
  for select
  using (true);

grant select on public.seo_settings to anon, authenticated;
