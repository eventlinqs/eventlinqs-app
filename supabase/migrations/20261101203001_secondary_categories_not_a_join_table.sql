-- ONE RELATIONSHIP BETWEEN events AND event_categories (CONTROLLER 20:20, 1 November 2026: WINDOW 5's gate stopped on
-- PGRST201 "Could not embed because more than one relationship was found for 'events' and 'event_categories'").
--
-- Cause, from PostgREST's own reference (https://docs.postgrest.org/en/v12/references/api/resource_embedding.html,
-- fetched 1 November 2026): a table is read as a many-to-many JOIN TABLE when it "must contain foreign keys to other two
-- tables and they must be part of its composite key". 20261101161001 gave public.event_secondary_categories the
-- primary key (event_id, category_id), so PostgREST saw a second path from events to event_categories beside
-- events_category_id_fkey, and every existing embed 'category:event_categories(...)' became ambiguous.
--
-- Fix: the table keeps its own surrogate key, and the pair stays unique by a UNIQUE constraint, not by the primary key.
-- The same rows, the same one-pair-once rule, the same trigger; the only change is that PostgREST no longer reads it as
-- a join table, so events_category_id_fkey is again the one relationship and no embed needs renaming. Secondary
-- categories are still read through the table itself (event_secondary_categories(category_id, event_categories(...))).
-- Proof: scripts/verify/secondary-categories-not-a-join-proof.sql (catalogue, rolled back) and, once on TEST, the embed
-- test tests/integration/one-relationship-events-categories.test.ts against TEST's REST API.

alter table public.event_secondary_categories add column if not exists id uuid not null default gen_random_uuid();

alter table public.event_secondary_categories drop constraint if exists event_secondary_categories_pkey;
alter table public.event_secondary_categories add constraint event_secondary_categories_pkey primary key (id);

alter table public.event_secondary_categories drop constraint if exists event_secondary_categories_pair_unique;
alter table public.event_secondary_categories
  add constraint event_secondary_categories_pair_unique unique (event_id, category_id);

comment on table public.event_secondary_categories is
  'Up to three secondary guide categories per event. Its primary key is its own id and the pair (event_id, category_id) is unique by constraint, never by the primary key, so PostgREST does not read it as a join table and events_category_id_fkey stays the one relationship between events and event_categories (20261101203001).';

notify pgrst, 'reload schema';
