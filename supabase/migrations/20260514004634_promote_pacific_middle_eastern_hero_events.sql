-- Migration: 20260514004634_promote_pacific_middle_eastern_hero_events.sql
-- Purpose: seed all 5 friends-launch hero events behind the homepage
--   HeroCarousel slots with the founder-locked Batch 11.0 Round 3 lineup.
--
-- Context:
--   The locked Batch 11.0 friends-launch hero lineup is:
--     1. African - Africultures Festival (Wyatt Park Auburn, Sydney, 12 Mar 2027)
--     2. Pacific - Pasifika Festival 2027 (Federation Square, Melbourne, 21 Feb 2027)
--     3. South Asian - Diwali Mela Brisbane (Brisbane Powerhouse, Brisbane, 24 Oct 2026)
--     4. Middle Eastern - Lebanese Eid Festival (Sydney Olympic Park, Sydney, 19 Apr 2027)
--     5. Caribbean - Caribbean Carnival Melbourne (Birrarung Marr, Melbourne, 14 Feb 2027)
--
--   None of the existing seed events match this lineup exactly. The
--   nearest matches (afrobeats-live-headline-concert, pasifika-festival-
--   sydney, diwali-festival-melbourne-festival-of-lights, lebanese-mahrajan-
--   sydney, caribbean-carnival-melbourne-soca-saturday) either point at
--   different venues / cities / dates or remain status='draft' because
--   their cover_image_url is a picsum.photos placeholder which the
--   events_published_real_cover constraint rejects for status='published'.
--
--   This migration inserts 5 NEW events with the founder-locked details
--   and real Pexels cover imagery (same Pexels CDN already used across
--   the existing published seeds, guaranteed to resolve). All 5 are
--   created status='published' AND visibility='public' so the homepage
--   hero CTAs resolve cleanly on first load.
--
-- Idempotency: ON CONFLICT (organisation_id, slug) DO UPDATE upserts the
-- rows. Safe to re-run after edits to title / venue / date / cover.
--
-- Author: Batch 11.0 Round 3
-- Date: 2026-05-14

BEGIN;

-- =============================================================
-- 1. Hero events (UPSERT - all 5 friends-launch slots)
-- =============================================================

INSERT INTO public.events (
  id, organisation_id, created_by, category_id,
  title, slug, description, summary,
  start_date, end_date, timezone,
  is_multi_day,
  event_type,
  venue_name, venue_address, venue_city, venue_state, venue_country,
  venue_latitude, venue_longitude,
  cover_image_url, thumbnail_url,
  status, visibility, published_at,
  max_capacity,
  tags
) VALUES
  -- Slot 1: African - Africultures Festival
  (
    'e2110000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002', -- existing African organiser
    '00000000-0000-4000-8000-000000000001',
    NULL,
    'Africultures Festival',
    'africultures-festival-sydney-2027',
    'A whole-day celebration of African culture at Wyatt Park Auburn. Three stages of Afrobeats, Amapiano, Highlife, Soukous, Coupé-Décalé, and West African live drumming. Aso-ebi parade, Yoruba and Igbo language workshops, a kids village with adire fabric painting and folktale storytelling, a continental food court representing Nigeria, Ghana, Senegal, DRC, Kenya, and Ethiopia, plus a sundown afro-fusion DJ set to close. Family-friendly, halal options, accessible.',
    'Wyatt Park, Auburn | three stages, food court, kids village | Sydney',
    '2027-03-12 10:00:00+11',
    '2027-03-12 22:00:00+11',
    'Australia/Sydney',
    false,
    'in_person',
    'Wyatt Park',
    'Auburn Park, Auburn',
    'Sydney',
    'NSW',
    'Australia',
    -33.8493,
    151.0339,
    'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    'published',
    'public',
    NOW(),
    15000,
    '["african","africultures","afrobeats","amapiano","festival","sydney","2027"]'::jsonb
  ),
  -- Slot 2: Pacific - Pasifika Festival 2027
  (
    'e2110000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000004', -- Pasifika Collective
    '00000000-0000-4000-8000-000000000001',
    NULL,
    'Pasifika Festival 2027',
    'pasifika-festival-melbourne-2027',
    'The flagship Pasifika Festival of 2027 lands at Federation Square. Two stages of Samoan, Tongan, Fijian, Cook Islands, and Maori performances, a food village representing every Pacific nation, weaving and tapa demonstrations, a kava tent, and a closing fire-knife showcase. Whanau-friendly, free entry to most of the festival, ticketed access to the closing show and seated dinner.',
    'Federation Square, Melbourne | Pacific main stage, food village, fire-knife closing show',
    '2027-02-21 10:00:00+11',
    '2027-02-21 21:00:00+11',
    'Australia/Melbourne',
    false,
    'in_person',
    'Federation Square',
    'Cnr Swanston and Flinders St',
    'Melbourne',
    'VIC',
    'Australia',
    -37.8180,
    144.9690,
    'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    'published',
    'public',
    NOW(),
    8000,
    '["pacific","pasifika","samoan","tongan","fijian","maori","festival","melbourne","2027"]'::jsonb
  ),
  -- Slot 3: South Asian - Diwali Mela Brisbane
  (
    'e2110000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000009', -- existing South Asian organiser
    '00000000-0000-4000-8000-000000000001',
    NULL,
    'Diwali Mela Brisbane',
    'diwali-mela-brisbane-2026',
    'Brisbane''s biggest Diwali Mela of 2026 lights up Brisbane Powerhouse. Live Bollywood, Bhangra, and Carnatic music sets across two stages, a diya-lighting ceremony at sundown, a fireworks finale on the river, a vegetarian and Jain-friendly food court with chaat, dosa, and mithai, plus a kids zone with rangoli and mehndi stations. Family-friendly, accessible, vegetarian options throughout.',
    'Brisbane Powerhouse | Bollywood and Bhangra stages, diya ceremony, fireworks',
    '2026-10-24 16:00:00+10',
    '2026-10-24 23:00:00+10',
    'Australia/Brisbane',
    false,
    'in_person',
    'Brisbane Powerhouse',
    '119 Lamington St, New Farm',
    'Brisbane',
    'QLD',
    'Australia',
    -27.4661,
    153.0479,
    'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    'published',
    'public',
    NOW(),
    6500,
    '["south-asian","diwali","mela","bollywood","bhangra","brisbane","2026"]'::jsonb
  ),
  -- Slot 4: Middle Eastern - Lebanese Eid Festival
  (
    'e2110000-0000-4000-8000-000000000004',
    'a2000000-0000-4000-8000-000000000003', -- Mahrajan Sydney organiser
    '00000000-0000-4000-8000-000000000001',
    NULL,
    'Lebanese Eid Festival',
    'lebanese-eid-festival-sydney-2027',
    'Sydney''s biggest Lebanese Eid celebration. Live tabla and oud bands rotating across two stages, dabke dance circles, halal food court with manakish, shawarma, and knafeh, calligraphy workshops, a kids village with face painting and storytelling, and a closing fireworks show at sundown. Halal, family-friendly, accessible.',
    'Sydney Olympic Park, Sydney | tabla and oud bands, dabke circles, halal food court, fireworks',
    '2027-04-19 14:00:00+10',
    '2027-04-19 22:00:00+10',
    'Australia/Sydney',
    false,
    'in_person',
    'Sydney Olympic Park',
    'Olympic Boulevard, Sydney Olympic Park',
    'Sydney',
    'NSW',
    'Australia',
    -33.8480,
    151.0686,
    'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    'published',
    'public',
    NOW(),
    12000,
    '["middle-eastern","lebanese","eid","dabke","family","sydney","2027"]'::jsonb
  ),
  -- Slot 5: Caribbean - Caribbean Carnival Melbourne
  (
    'e2110000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000006', -- Caribbean Carnival organiser
    '00000000-0000-4000-8000-000000000001',
    NULL,
    'Caribbean Carnival Melbourne',
    'caribbean-carnival-melbourne-2027',
    'Melbourne''s biggest Caribbean Carnival of 2027 takes over Birrarung Marr. Live steel pan, soca, calypso, and dancehall sets across three stages, a parade of mas troupes in full costume, a jerk food court, rum punch bars, a kids zone with steel pan workshops, and a closing j''ouvert party. Family-friendly until 8pm, 18+ for the late-night j''ouvert.',
    'Birrarung Marr, Melbourne | steel pan, soca, dancehall, mas troupes, j''ouvert',
    '2027-02-14 11:00:00+11',
    '2027-02-15 02:00:00+11',
    'Australia/Melbourne',
    false,
    'in_person',
    'Birrarung Marr',
    'Birrarung Marr, Batman Ave, Melbourne',
    'Melbourne',
    'VIC',
    'Australia',
    -37.8174,
    144.9737,
    'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    'published',
    'public',
    NOW(),
    10000,
    '["caribbean","carnival","soca","steel-pan","mas","melbourne","2027"]'::jsonb
  )
ON CONFLICT (organisation_id, slug) DO UPDATE SET
  title              = EXCLUDED.title,
  description        = EXCLUDED.description,
  summary            = EXCLUDED.summary,
  start_date         = EXCLUDED.start_date,
  end_date           = EXCLUDED.end_date,
  timezone           = EXCLUDED.timezone,
  venue_name         = EXCLUDED.venue_name,
  venue_address      = EXCLUDED.venue_address,
  venue_city         = EXCLUDED.venue_city,
  venue_state        = EXCLUDED.venue_state,
  venue_country      = EXCLUDED.venue_country,
  venue_latitude     = EXCLUDED.venue_latitude,
  venue_longitude    = EXCLUDED.venue_longitude,
  cover_image_url    = EXCLUDED.cover_image_url,
  thumbnail_url      = EXCLUDED.thumbnail_url,
  status             = EXCLUDED.status,
  visibility         = EXCLUDED.visibility,
  published_at       = COALESCE(public.events.published_at, EXCLUDED.published_at),
  max_capacity       = EXCLUDED.max_capacity,
  tags               = EXCLUDED.tags,
  updated_at         = NOW();

-- =============================================================
-- 2. Ticket tiers (general admission + premium per event)
-- =============================================================
-- Required by the public-surface RLS policy "Visible tiers for
-- published events are viewable" which demands at least one
-- is_visible + is_active row.

-- Ensure (event_id, name) unique constraint exists for ON CONFLICT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ticket_tiers_event_id_name_key'
      AND conrelid = 'public.ticket_tiers'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.ticket_tiers
        ADD CONSTRAINT ticket_tiers_event_id_name_key UNIQUE (event_id, name);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

INSERT INTO public.ticket_tiers (
  id, event_id, name, description,
  tier_type, price, currency, total_capacity,
  is_visible, is_active, sort_order
) VALUES
  -- Slot 1 Africultures - GA
  ('f2110000-0000-4000-8000-000000000101', 'e2110000-0000-4000-8000-000000000001',
   'General Admission', 'Day-pass access to all three stages, food court, kids village, and the sundown DJ set.',
   'general_admission', 4500, 'AUD', 12000, true, true, 1),
  -- Slot 1 Africultures - VIP
  ('f2110000-0000-4000-8000-000000000102', 'e2110000-0000-4000-8000-000000000001',
   'VIP + Backstage', 'Front-of-stage access, complimentary food and drinks, backstage meet-and-greet with two headline artists.',
   'general_admission', 18500, 'AUD', 500, true, true, 2),

  -- Slot 2 Pasifika - GA (free)
  ('f2110000-0000-4000-8000-000000000201', 'e2110000-0000-4000-8000-000000000002',
   'General Admission', 'Free entry to the festival village, main stages, food village, and weaving demonstrations.',
   'general_admission', 0, 'AUD', 6000, true, true, 1),
  -- Slot 2 Pasifika - Closing show
  ('f2110000-0000-4000-8000-000000000202', 'e2110000-0000-4000-8000-000000000002',
   'Closing Show + Dinner', 'Reserved seating at the closing fire-knife showcase plus a Pacific feast dinner.',
   'general_admission', 9500, 'AUD', 2000, true, true, 2),

  -- Slot 3 Diwali Mela - GA
  ('f2110000-0000-4000-8000-000000000301', 'e2110000-0000-4000-8000-000000000003',
   'General Admission', 'All-day access to both stages, food court, kids zone, and the fireworks finale.',
   'general_admission', 3500, 'AUD', 5500, true, true, 1),
  -- Slot 3 Diwali Mela - Family
  ('f2110000-0000-4000-8000-000000000302', 'e2110000-0000-4000-8000-000000000003',
   'Family Pass (2 adults + 3 kids)', 'Discounted family pass for two adults and up to three children under 12.',
   'general_admission', 9500, 'AUD', 1000, true, true, 2),

  -- Slot 4 Lebanese Eid - GA
  ('f2110000-0000-4000-8000-000000000401', 'e2110000-0000-4000-8000-000000000004',
   'General Admission', 'All-day access to the festival grounds, dance stages, food court, kids village, and fireworks.',
   'general_admission', 2500, 'AUD', 10000, true, true, 1),
  -- Slot 4 Lebanese Eid - Family
  ('f2110000-0000-4000-8000-000000000402', 'e2110000-0000-4000-8000-000000000004',
   'Family Pass (2 adults + 3 kids)', 'Discounted family pass for two adults and up to three children under 12.',
   'general_admission', 7500, 'AUD', 2000, true, true, 2),

  -- Slot 5 Caribbean Carnival - GA
  ('f2110000-0000-4000-8000-000000000501', 'e2110000-0000-4000-8000-000000000005',
   'General Admission', 'Day-pass access to all three stages, mas troupe parade, jerk food court, and rum punch bars.',
   'general_admission', 5500, 'AUD', 8000, true, true, 1),
  -- Slot 5 Caribbean Carnival - J'ouvert (18+)
  ('f2110000-0000-4000-8000-000000000502', 'e2110000-0000-4000-8000-000000000005',
   'J''ouvert After-Party (18+)', 'Late-night j''ouvert party with steel pan and soca sets through to 2am. 18+ only.',
   'general_admission', 4500, 'AUD', 2000, true, true, 2)
ON CONFLICT (event_id, name) DO UPDATE SET
  description    = EXCLUDED.description,
  tier_type      = EXCLUDED.tier_type,
  price          = EXCLUDED.price,
  currency       = EXCLUDED.currency,
  total_capacity = EXCLUDED.total_capacity,
  is_visible     = EXCLUDED.is_visible,
  is_active      = EXCLUDED.is_active,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = NOW();

COMMIT;

-- =============================================================
-- Post-migration verification (run manually after `supabase db push --linked`):
--
--   SELECT slug, status, visibility, venue_name, venue_city, start_date
--   FROM public.events
--   WHERE slug IN (
--     'africultures-festival-sydney-2027',
--     'pasifika-festival-melbourne-2027',
--     'diwali-mela-brisbane-2026',
--     'lebanese-eid-festival-sydney-2027',
--     'caribbean-carnival-melbourne-2027'
--   )
--   ORDER BY start_date;
--
--   SELECT e.slug, t.name, t.price, t.total_capacity
--   FROM public.events e
--   JOIN public.ticket_tiers t ON t.event_id = e.id
--   WHERE e.slug IN (
--     'africultures-festival-sydney-2027',
--     'pasifika-festival-melbourne-2027',
--     'diwali-mela-brisbane-2026',
--     'lebanese-eid-festival-sydney-2027',
--     'caribbean-carnival-melbourne-2027'
--   )
--   ORDER BY e.slug, t.sort_order;
-- =============================================================
