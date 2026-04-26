-- Migration: Seed 8 culturally-relevant sample events
-- Purpose: Session 2 visual verification — real content for card/layout rebuild
-- Cover images: picsum.photos seed URLs — replaced by Unsplash API in Session 3
-- Ticket prices stored in cents (AUD). Events use explicit UUIDs for referential stability.

DO $$
BEGIN
  -- Skip on a fresh project that has no organisations or profiles yet.
  -- The hardcoded organisation_id / created_by lookups below assume Mumbai-era
  -- seed data; on Sydney the cultural breadth seed (20260426000001) provides
  -- the canonical seed instead, so this older 8-event seed becomes a no-op.
  IF NOT EXISTS (SELECT 1 FROM organisations LIMIT 1)
     OR NOT EXISTS (SELECT 1 FROM profiles LIMIT 1) THEN
    RAISE NOTICE 'Skipping 20260414 seed: no organisations or profiles present';
    RETURN;
  END IF;

  -- Only insert if these seed events don't already exist
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = '11111111-1111-4111-8111-111111111101') THEN

    WITH new_events AS (
      INSERT INTO events (
        id, title, slug, description, summary,
        organisation_id, created_by, category_id,
        start_date, end_date, timezone, event_type,
        venue_name, venue_city, venue_state, venue_country,
        cover_image_url, thumbnail_url,
        status, visibility, published_at,
        max_capacity, tags, fee_pass_type, is_age_restricted
      )
      SELECT
        e.id::uuid,
        e.title,
        e.slug,
        e.description,
        e.summary,
        (SELECT id FROM organisations LIMIT 1),
        (SELECT id FROM profiles LIMIT 1),
        e.category_id::uuid,
        e.start_date::timestamptz,
        e.end_date::timestamptz,
        e.timezone,
        'in_person'::event_type,
        e.venue_name,
        e.venue_city,
        e.venue_state,
        e.venue_country,
        e.cover_image_url,
        e.thumbnail_url,
        'published'::event_status,
        'public'::event_visibility,
        now(),
        e.max_capacity,
        e.tags::jsonb,
        'pass_to_buyer'::fee_pass_type,
        false
      FROM (VALUES
        -- 1. Afrobeats Melbourne Summer Sessions
        (
          '11111111-1111-4111-8111-111111111101',
          'Afrobeats Melbourne Summer Sessions',
          'afrobeats-melbourne-summer-sessions-2026',
          'The biggest Afrobeats event of the Melbourne summer. Three stages, international DJs, Nigerian street food, and a crowd that knows every word.',
          'Live Afrobeats, 3 stages, street food — Melbourne Showgrounds',
          'b62551e2-4010-45fa-be8c-f9353ba0f39d',
          '2026-04-26 18:00:00+10', '2026-04-27 02:00:00+10',
          'Australia/Melbourne',
          'Melbourne Showgrounds', 'Melbourne', 'VIC', 'Australia',
          'https://picsum.photos/seed/afrobeats1/1200/900',
          'https://picsum.photos/seed/afrobeats1/600/450',
          1500,
          '["afrobeats","music","culture","african"]'
        ),
        -- 2. Afrobeats All Night — London
        (
          '11111111-1111-4111-8111-111111111102',
          'Afrobeats All Night — London',
          'afrobeats-all-night-london-2026',
          'London''s premier monthly Afrobeats session returns for a special extended night. The freshest Afrobeats, Afropop, and Alte sounds from a world-class DJ lineup.',
          'London''s top Afrobeats night — extended session, world-class DJs',
          'b62551e2-4010-45fa-be8c-f9353ba0f39d',
          '2026-05-02 21:00:00+01', '2026-05-03 04:00:00+01',
          'Europe/London',
          'Fabric London', 'London', 'England', 'United Kingdom',
          'https://picsum.photos/seed/afrobeats2/1200/900',
          'https://picsum.photos/seed/afrobeats2/600/450',
          2000,
          '["afrobeats","afropop","alte","music","london"]'
        ),
        -- 3. Amapiano Takeover — Sydney
        (
          '11111111-1111-4111-8111-111111111103',
          'Amapiano Takeover — Sydney',
          'amapiano-takeover-sydney-2026',
          'Sydney''s wildest Amapiano party is back. Log drums, wailing piano, and a dancefloor that never stops. This is the sound of South Africa in the heart of the city.',
          'Sydney''s biggest Amapiano night — log drums, wailing piano, all night',
          '2443fb27-a02c-412c-b05c-06d1a8e070a6',
          '2026-05-03 20:00:00+10', '2026-05-04 03:00:00+10',
          'Australia/Sydney',
          'The Metro Theatre', 'Sydney', 'NSW', 'Australia',
          'https://picsum.photos/seed/amapiano/1200/900',
          'https://picsum.photos/seed/amapiano/600/450',
          800,
          '["amapiano","south-african","nightlife","music"]'
        ),
        -- 4. Highlife Heritage Night — Brisbane
        (
          '11111111-1111-4111-8111-111111111104',
          'Highlife Heritage Night — Brisbane',
          'highlife-heritage-night-brisbane-2026',
          'A celebration of West African Highlife music across the decades. Live band, traditional attire welcome, authentic Ghanaian and Nigerian cuisine.',
          'Live Highlife band, traditional attire, West African cuisine — Brisbane',
          'b62551e2-4010-45fa-be8c-f9353ba0f39d',
          '2026-05-10 17:00:00+10', '2026-05-10 23:00:00+10',
          'Australia/Brisbane',
          'Brisbane City Hall', 'Brisbane', 'QLD', 'Australia',
          'https://picsum.photos/seed/highlife/1200/900',
          'https://picsum.photos/seed/highlife/600/450',
          400,
          '["highlife","west-african","live-band","ghanaian","nigerian"]'
        ),
        -- 5. Gospel on the Hills — Melbourne
        (
          '11111111-1111-4111-8111-111111111105',
          'Gospel on the Hills — Melbourne',
          'gospel-on-the-hills-melbourne-2026',
          'An uplifting evening of Gospel music bringing together choirs and soloists from across Melbourne''s African and Pacific Islander communities. Family-friendly.',
          'Gospel night — choirs, soloists, African community, all welcome',
          '310ec098-563e-46cb-97d2-fea1eb048bb7',
          '2026-05-17 15:00:00+10', '2026-05-17 20:00:00+10',
          'Australia/Melbourne',
          'Hamer Hall', 'Melbourne', 'VIC', 'Australia',
          'https://picsum.photos/seed/gospel/1200/900',
          'https://picsum.photos/seed/gospel/600/450',
          600,
          '["gospel","christian","choir","family","community"]'
        ),
        -- 6. African Comedy Night — The Showcase
        (
          '11111111-1111-4111-8111-111111111106',
          'African Comedy Night — The Showcase',
          'african-comedy-night-the-showcase-2026',
          'Six of Australia''s funniest African comedians take the stage for a night of stories, cultural observations, and laughs that hit different. Doors open 7pm.',
          '6 African comedians, cultural humour, Melbourne — an unmissable night',
          '0fcd5166-fcba-4df3-95f8-26fa0e8ff1bc',
          '2026-05-09 19:00:00+10', '2026-05-09 23:00:00+10',
          'Australia/Melbourne',
          'The Comedy Theatre', 'Melbourne', 'VIC', 'Australia',
          'https://picsum.photos/seed/comedy1/1200/900',
          'https://picsum.photos/seed/comedy1/600/450',
          350,
          '["comedy","african","stand-up","culture"]'
        ),
        -- 7. Diaspora Business Summit 2026
        (
          '11111111-1111-4111-8111-111111111107',
          'Diaspora Business Summit 2026',
          'diaspora-business-summit-2026',
          'The annual gathering of African diaspora entrepreneurs, investors, and professionals. Keynotes, panels, pitch sessions, and a gala dinner. Network with 300+ leaders.',
          'Keynotes, panels, pitching, gala dinner — African diaspora entrepreneurs, Sydney',
          '8234412f-2a88-42d2-a9d2-406425f67ad9',
          '2026-05-23 08:00:00+10', '2026-05-23 22:00:00+10',
          'Australia/Sydney',
          'International Convention Centre Sydney', 'Sydney', 'NSW', 'Australia',
          'https://picsum.photos/seed/diaspora/1200/900',
          'https://picsum.photos/seed/diaspora/600/450',
          300,
          '["business","networking","diaspora","entrepreneurship","summit"]'
        ),
        -- 8. Owambe — The Gathering
        (
          '11111111-1111-4111-8111-111111111108',
          'Owambe — The Gathering',
          'owambe-the-gathering-2026',
          'Owambe is the Yoruba word for "it is there" — and this party will be there in every sense. Traditional wear, live band, jollof rice cook-off, West African culture.',
          'West African cultural celebration — live band, jollof cook-off, traditional attire',
          'db15a8f5-6aa2-40b7-b018-3d1087e3eb73',
          '2026-06-07 14:00:00+10', '2026-06-07 23:00:00+10',
          'Australia/Melbourne',
          'Royal Exhibition Building', 'Melbourne', 'VIC', 'Australia',
          'https://picsum.photos/seed/owambe/1200/900',
          'https://picsum.photos/seed/owambe/600/450',
          1200,
          '["owambe","yoruba","nigerian","cultural","celebration","west-african"]'
        )
      ) AS e(
        id, title, slug, description, summary, category_id,
        start_date, end_date, timezone,
        venue_name, venue_city, venue_state, venue_country,
        cover_image_url, thumbnail_url, max_capacity, tags
      )
      RETURNING id, slug
    )
    INSERT INTO ticket_tiers (event_id, name, description, tier_type, price, currency, total_capacity, sort_order)
    SELECT
      e.id,
      t.name,
      t.description,
      t.tier_type::ticket_tier_type,
      t.price,
      'AUD',
      t.capacity,
      0
    FROM new_events e
    JOIN (VALUES
      ('afrobeats-melbourne-summer-sessions-2026', 'General Admission', 'Entry to all stages',           'general_admission', 6500,  1200),
      ('afrobeats-all-night-london-2026',          'General Admission', 'Entry to all areas',            'general_admission', 7500,  1800),
      ('amapiano-takeover-sydney-2026',            'General Admission', 'Dance floor access',            'general_admission', 5500,  700),
      ('highlife-heritage-night-brisbane-2026',    'General Admission', 'Entry + dinner',                'general_admission', 4500,  350),
      ('gospel-on-the-hills-melbourne-2026',       'General Admission', 'Open seating',                  'general_admission', 3500,  500),
      ('african-comedy-night-the-showcase-2026',   'General Admission', 'Show entry',                    'general_admission', 4500,  300),
      ('diaspora-business-summit-2026',            'Standard Pass',     'Full day access + gala dinner', 'general_admission', 18000, 250),
      ('owambe-the-gathering-2026',                'General Admission', 'Full event access',             'general_admission', 5500,  1000)
    ) AS t(slug, name, description, tier_type, price, capacity) ON e.slug = t.slug;

  END IF;
END $$;
