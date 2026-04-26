-- =============================================================================
-- 20260426000001_cultural_breadth_seed.sql
--
-- Cultural breadth seed for fresh Sydney project (Path B: fresh start).
-- 12 organisations across 5 diaspora categories | 27 events | mixed AUD pricing.
--
--   AFRICAN DIASPORA (5): Owambe Sydney, Afrobeats Melbourne, Gospel Brisbane,
--                         Amapiano Adelaide, Lagos Comedy Tour
--   CARIBBEAN (2):        Caribbean Carnival Melbourne, Island Vibes Sydney
--   SOUTH ASIAN (2):      Bollywood Nights Sydney, Diwali Festival Melbourne
--   SOUTHEAST ASIAN (2):  Filipino Fiesta Brisbane, Lunar Nights Melbourne
--   LATIN (1):            Latin Sabor Sydney
--
-- Pricing mix: free events, $25-$45 standard, $80-$150 premium (cents AUD).
-- All dates from 2026-04-30 forward.
-- Idempotent: skips on re-run when seed organisations already exist.
-- Style: hyphens, colons, pipes only | no em-dashes or en-dashes.
-- =============================================================================

DO $seed$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.organisations
    WHERE id = 'a1000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE NOTICE 'Cultural breadth seed already present | skipping.';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. System seed user | auth.users + profile
  --    The handle_new_user() trigger normally creates the profile row, but we
  --    insert defensively with ON CONFLICT DO NOTHING in case the trigger ever
  --    becomes disabled or this seed is replayed against an inconsistent state.
  -- ---------------------------------------------------------------------------
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'seed@eventlinqs.app',
    '', NOW(),
    NOW(), NOW(),
    '{"provider":"seed","providers":["seed"]}'::jsonb,
    '{"full_name":"EventLinqs Seed","seed":true}'::jsonb,
    false, '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, role, is_verified, onboarding_completed)
  VALUES (
    '00000000-0000-4000-8000-000000000001',
    'seed@eventlinqs.app',
    'EventLinqs Seed',
    'organiser',
    true,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 2. Twelve organisations
  -- ---------------------------------------------------------------------------
  INSERT INTO public.organisations (id, name, slug, description, email, status, owner_id)
  VALUES
    ('a1000000-0000-4000-8000-000000000001',
      'Owambe Sydney',
      'owambe-sydney',
      'Sydney''s home for Yoruba weddings, naming ceremonies, and West African celebration nights | live bands, jollof, traditional attire welcome.',
      'hello@owambesydney.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000002',
      'Afrobeats Melbourne',
      'afrobeats-melbourne',
      'The biggest Afrobeats events in Melbourne | international DJs, live performances, and dance floors that go all night.',
      'bookings@afrobeatsmelbourne.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000003',
      'Gospel Brisbane',
      'gospel-brisbane',
      'Uplifting gospel concerts and worship nights bringing together Brisbane''s African and Pacific Islander Christian communities.',
      'team@gospelbrisbane.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000004',
      'Amapiano Adelaide',
      'amapiano-adelaide',
      'Adelaide''s premier Amapiano collective | log drums, wailing piano, and the best of South African house music every month.',
      'crew@amapianoadelaide.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000005',
      'Lagos Comedy Tour',
      'lagos-comedy-tour',
      'Australia''s touring stand-up showcase featuring Nigerian and West African comedians | cultural humour that hits different.',
      'tour@lagoscomedy.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000006',
      'Caribbean Carnival Melbourne',
      'caribbean-carnival-melbourne',
      'Soca, dancehall, and reggae carnival nights bringing the spirit of Trinidad, Jamaica, and Barbados to Melbourne.',
      'mas@caribbeancarnivalmelbourne.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000007',
      'Island Vibes Sydney',
      'island-vibes-sydney',
      'Sydney''s Caribbean roots party | reggae, dancehall, soca, and afrobeats fusion every season.',
      'vibes@islandvibessydney.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000008',
      'Bollywood Nights Sydney',
      'bollywood-nights-sydney',
      'Sydney''s biggest Bollywood and Bhangra dance nights | Hindi cinema soundtracks, Punjabi beats, dhol drummers, dress to impress.',
      'connect@bollywoodnightssydney.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000009',
      'Diwali Festival Melbourne',
      'diwali-festival-melbourne',
      'Melbourne''s annual Diwali festival of lights | fireworks, classical dance, regional food stalls, family stage.',
      'festival@diwalimelbourne.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000010',
      'Filipino Fiesta Brisbane',
      'filipino-fiesta-brisbane',
      'Brisbane''s Filipino community fiesta | adobo cook-offs, OPM live music, lechon, traditional dance, and family fun days.',
      'kumusta@filipinofiestabrisbane.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000011',
      'Lunar Nights Melbourne',
      'lunar-nights-melbourne',
      'Lunar New Year celebrations across Melbourne | lion dance, lantern walks, Vietnamese, Chinese, Korean food, and red envelope giveaways.',
      'team@lunarnightsmelbourne.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a1000000-0000-4000-8000-000000000012',
      'Latin Sabor Sydney',
      'latin-sabor-sydney',
      'Sydney''s salsa, reggaeton, bachata, and Latin music nights | live bands, dance lessons, and authentic Latin American food.',
      'hola@latinsaborsydney.com.au',
      'active', '00000000-0000-4000-8000-000000000001');

  -- ---------------------------------------------------------------------------
  -- 3. Twenty-seven events with deterministic UUIDs
  --    Pattern: e<orgnum><eventnum>00000-0000-4000-8000-0000000000XX
  --    All published, public, in_person, AUD, fees passed to buyer.
  --    is_free is auto-maintained by update_event_is_free() trigger
  --    (fires when ticket_tiers are inserted below).
  -- ---------------------------------------------------------------------------
  WITH new_events AS (
    INSERT INTO public.events (
      id, title, slug, description, summary,
      organisation_id, created_by, category_id,
      start_date, end_date, timezone, event_type,
      venue_name, venue_address, venue_city, venue_state, venue_country,
      venue_latitude, venue_longitude,
      cover_image_url, thumbnail_url,
      status, visibility, published_at,
      max_capacity, tags,
      fee_pass_type, is_age_restricted
    )
    SELECT
      e.id::uuid,
      e.title,
      e.slug,
      e.description,
      e.summary,
      e.organisation_id::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid,
      (SELECT id FROM public.event_categories WHERE slug = e.category_slug),
      e.start_date::timestamptz,
      e.end_date::timestamptz,
      e.timezone,
      'in_person'::public.event_type,
      e.venue_name, e.venue_address, e.venue_city, e.venue_state, 'Australia',
      e.venue_latitude::numeric, e.venue_longitude::numeric,
      e.cover_image_url, e.thumbnail_url,
      'published'::public.event_status,
      'public'::public.event_visibility,
      NOW(),
      e.max_capacity,
      e.tags::jsonb,
      'pass_to_buyer'::public.fee_pass_type,
      false
    FROM (VALUES
      -- 1. Owambe Sydney | 3 events
      ('e1010000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'Owambe Sydney: Lagos to Sydney Wedding After-Party',
        'owambe-sydney-lagos-to-sydney-wedding-after-party',
        'Sydney''s biggest Owambe of the year. Live highlife and Afrobeats band, jollof rice cook-off, traditional attire encouraged. Bring the family, bring the friends, bring the energy.',
        'Live band, jollof cook-off, Yoruba celebration | Sydney',
        'nightlife',
        '2026-05-09 18:00:00+10', '2026-05-10 02:00:00+10', 'Australia/Sydney',
        'Hordern Pavilion', '1 Driver Ave, Moore Park', 'Sydney', 'NSW',
        -33.8927, 151.2244,
        'https://picsum.photos/seed/owambe-sydney-1/1200/900',
        'https://picsum.photos/seed/owambe-sydney-1/600/450',
        1500, '["owambe","yoruba","nigerian","west-african","celebration","afrobeats"]'),

      ('e1010000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
        'Aso Ebi Affair: Owambe Garden Party',
        'aso-ebi-affair-owambe-garden-party',
        'A daytime Owambe in Centennial Parklands | live band, gele tying station, food stalls, photography booth, and kids zone. Aso ebi colours: gold and burgundy.',
        'Daytime Owambe garden party with live band and gele station',
        'community',
        '2026-06-13 12:00:00+10', '2026-06-13 19:00:00+10', 'Australia/Sydney',
        'Centennial Park Pavilion', 'Grand Drive, Centennial Park', 'Sydney', 'NSW',
        -33.8975, 151.2336,
        'https://picsum.photos/seed/owambe-sydney-2/1200/900',
        'https://picsum.photos/seed/owambe-sydney-2/600/450',
        600, '["owambe","garden-party","aso-ebi","family","yoruba"]'),

      ('e1010000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001',
        'Naming Ceremony Showcase: Yoruba Traditions Night',
        'naming-ceremony-showcase-yoruba-traditions-night',
        'A free cultural showcase celebrating Yoruba naming traditions. Live drumming, kola nut ceremony demonstration, storytelling, and traditional foods to share.',
        'Free cultural showcase | Yoruba naming traditions and live drumming',
        'arts-culture',
        '2026-07-04 16:00:00+10', '2026-07-04 21:00:00+10', 'Australia/Sydney',
        'Marrickville Town Hall', '303 Marrickville Rd, Marrickville', 'Sydney', 'NSW',
        -33.9112, 151.1571,
        'https://picsum.photos/seed/owambe-sydney-3/1200/900',
        'https://picsum.photos/seed/owambe-sydney-3/600/450',
        300, '["yoruba","cultural","free","family","heritage"]'),

      -- 2. Afrobeats Melbourne | 3 events
      ('e1020000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
        'Afrobeats Melbourne: Summer Sessions',
        'afrobeats-melbourne-summer-sessions',
        'Three stages of Afrobeats, Afropop, and Alte | rotating international DJs, food trucks, full bar, and a crowd that knows every word.',
        'Three stages, international DJs, all-night Afrobeats | Melbourne',
        'music',
        '2026-04-30 19:00:00+10', '2026-05-01 02:00:00+10', 'Australia/Melbourne',
        'Melbourne Showgrounds', 'Epsom Rd, Ascot Vale', 'Melbourne', 'VIC',
        -37.7787, 144.9068,
        'https://picsum.photos/seed/afrobeats-mel-1/1200/900',
        'https://picsum.photos/seed/afrobeats-mel-1/600/450',
        2000, '["afrobeats","afropop","alte","music","summer"]'),

      ('e1020000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002',
        'Afrobeats Live: Headline Concert',
        'afrobeats-live-headline-concert',
        'A premium seated and standing concert with one of West Africa''s biggest Afrobeats headliners. Pre-show DJ set, full production, all-in pricing.',
        'Premium concert | Afrobeats headliner from West Africa',
        'music',
        '2026-06-20 20:00:00+10', '2026-06-21 00:00:00+10', 'Australia/Melbourne',
        'Margaret Court Arena', 'Olympic Blvd, Melbourne', 'Melbourne', 'VIC',
        -37.8230, 144.9788,
        'https://picsum.photos/seed/afrobeats-mel-2/1200/900',
        'https://picsum.photos/seed/afrobeats-mel-2/600/450',
        7500, '["afrobeats","headline-concert","premium","music"]'),

      ('e1020000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002',
        'Afrobeats and Brunch: Sunday Sessions',
        'afrobeats-and-brunch-sunday-sessions',
        'A weekend afternoon party with bottomless brunch, Afrobeats DJs, and a relaxed dance-floor. Stylish, fan-friendly, and over by sundown.',
        'Sunday afternoon Afrobeats brunch party | Melbourne',
        'food-drink',
        '2026-08-09 12:00:00+10', '2026-08-09 18:00:00+10', 'Australia/Melbourne',
        'The Forum Melbourne', '154 Flinders St, Melbourne', 'Melbourne', 'VIC',
        -37.8167, 144.9686,
        'https://picsum.photos/seed/afrobeats-mel-3/1200/900',
        'https://picsum.photos/seed/afrobeats-mel-3/600/450',
        450, '["afrobeats","brunch","sunday","food","dayparty"]'),

      -- 3. Gospel Brisbane | 2 events
      ('e1030000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003',
        'Gospel on the River: Brisbane Worship Night',
        'gospel-on-the-river-brisbane-worship-night',
        'An open-air gospel concert on the riverbanks. Massed choir, soloists from across Brisbane''s African and Pacific Islander churches, family-friendly, all welcome.',
        'Open-air gospel concert | massed choir, family-friendly',
        'religion',
        '2026-05-23 17:00:00+10', '2026-05-23 21:00:00+10', 'Australia/Brisbane',
        'Riverstage', 'City Botanic Gardens, Brisbane', 'Brisbane', 'QLD',
        -27.4736, 153.0299,
        'https://picsum.photos/seed/gospel-bne-1/1200/900',
        'https://picsum.photos/seed/gospel-bne-1/600/450',
        4000, '["gospel","worship","christian","family","community"]'),

      ('e1030000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003',
        'Brisbane Gospel Choir Showcase',
        'brisbane-gospel-choir-showcase',
        'Six gospel choirs from Brisbane''s diaspora communities perform in one ticketed evening. Hosted, recorded, and broadcast to the community.',
        'Six gospel choirs | one ticketed showcase evening',
        'religion',
        '2026-07-19 18:00:00+10', '2026-07-19 22:00:00+10', 'Australia/Brisbane',
        'Brisbane City Hall', '64 Adelaide St, Brisbane', 'Brisbane', 'QLD',
        -27.4690, 153.0235,
        'https://picsum.photos/seed/gospel-bne-2/1200/900',
        'https://picsum.photos/seed/gospel-bne-2/600/450',
        700, '["gospel","choir","community","showcase"]'),

      -- 4. Amapiano Adelaide | 2 events
      ('e1040000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004',
        'Amapiano Adelaide: Log Drum Sessions',
        'amapiano-adelaide-log-drum-sessions',
        'Adelaide''s wildest Amapiano night | local and Sydney-based DJs, smoke machines, and South African house music until late. Strict over-18.',
        'Adelaide''s biggest Amapiano night | DJ-led, late, over-18',
        'nightlife',
        '2026-05-16 21:00:00+09:30', '2026-05-17 04:00:00+09:30', 'Australia/Adelaide',
        'The Gov', '59 Port Rd, Hindmarsh', 'Adelaide', 'SA',
        -34.9067, 138.5689,
        'https://picsum.photos/seed/amapiano-adl-1/1200/900',
        'https://picsum.photos/seed/amapiano-adl-1/600/450',
        700, '["amapiano","south-african","house","nightlife","late"]'),

      ('e1040000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000004',
        'Amapiano Day Party: Adelaide Hills',
        'amapiano-day-party-adelaide-hills',
        'A summer day party in the Adelaide Hills | log drums, sunshine, picnic baskets, BYO blanket. Family-friendly until 8pm.',
        'Summer day party in the Adelaide Hills | family-friendly Amapiano',
        'festival',
        '2026-09-12 13:00:00+09:30', '2026-09-12 22:00:00+09:30', 'Australia/Adelaide',
        'Adelaide Botanic Park', 'Hackney Rd, North Adelaide', 'Adelaide', 'SA',
        -34.9166, 138.6098,
        'https://picsum.photos/seed/amapiano-adl-2/1200/900',
        'https://picsum.photos/seed/amapiano-adl-2/600/450',
        1200, '["amapiano","day-party","family","outdoor","festival"]'),

      -- 5. Lagos Comedy Tour | 3 events
      ('e1050000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005',
        'Lagos Comedy Tour: Sydney Showcase',
        'lagos-comedy-tour-sydney-showcase',
        'Six of Australia''s funniest African comedians take the stage for stories, cultural observations, and laughs that hit home. Doors 7pm.',
        'Six African comedians | stand-up showcase | Sydney',
        'arts-culture',
        '2026-05-30 19:30:00+10', '2026-05-30 22:30:00+10', 'Australia/Sydney',
        'Enmore Theatre', '118-132 Enmore Rd, Newtown', 'Sydney', 'NSW',
        -33.8979, 151.1747,
        'https://picsum.photos/seed/lagos-comedy-1/1200/900',
        'https://picsum.photos/seed/lagos-comedy-1/600/450',
        1500, '["comedy","african","stand-up","cultural"]'),

      ('e1050000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000005',
        'Lagos Comedy Tour: Melbourne Night',
        'lagos-comedy-tour-melbourne-night',
        'The Melbourne leg of the national tour | rotating headliner, three opening sets, and a late-night Q&A with the comedians.',
        'Melbourne leg of the national African comedy tour',
        'arts-culture',
        '2026-06-06 20:00:00+10', '2026-06-06 23:00:00+10', 'Australia/Melbourne',
        'The Comedy Theatre', '240 Exhibition St, Melbourne', 'Melbourne', 'VIC',
        -37.8108, 144.9698,
        'https://picsum.photos/seed/lagos-comedy-2/1200/900',
        'https://picsum.photos/seed/lagos-comedy-2/600/450',
        1000, '["comedy","african","stand-up","melbourne"]'),

      ('e1050000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000005',
        'Lagos Comedy Tour: Brisbane Closer',
        'lagos-comedy-tour-brisbane-closer',
        'The closing show of the national tour. Recorded for special-edition release | full lineup, surprise guests, late drinks reception.',
        'National tour closer | recorded show, surprise guests | Brisbane',
        'arts-culture',
        '2026-06-14 19:00:00+10', '2026-06-14 22:30:00+10', 'Australia/Brisbane',
        'The Tivoli', '52 Costin St, Fortitude Valley', 'Brisbane', 'QLD',
        -27.4574, 153.0337,
        'https://picsum.photos/seed/lagos-comedy-3/1200/900',
        'https://picsum.photos/seed/lagos-comedy-3/600/450',
        950, '["comedy","african","stand-up","brisbane","closing"]'),

      -- 6. Caribbean Carnival Melbourne | 2 events
      ('e1060000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006',
        'Caribbean Carnival Melbourne: Soca Saturday',
        'caribbean-carnival-melbourne-soca-saturday',
        'Soca, dancehall, and reggae carnival vibes | live steel pan band, jerk chicken stalls, rum punch, costume contest, all-night party.',
        'Soca, dancehall, reggae | live steel pan, jerk food, rum punch',
        'festival',
        '2026-05-02 18:00:00+10', '2026-05-03 02:00:00+10', 'Australia/Melbourne',
        '170 Russell', '170 Russell St, Melbourne', 'Melbourne', 'VIC',
        -37.8121, 144.9676,
        'https://picsum.photos/seed/caribbean-mel-1/1200/900',
        'https://picsum.photos/seed/caribbean-mel-1/600/450',
        900, '["caribbean","soca","dancehall","reggae","carnival"]'),

      ('e1060000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000006',
        'Reggae on the Lawn: Family Carnival Day',
        'reggae-on-the-lawn-family-carnival-day',
        'A free family-friendly outdoor reggae and soca afternoon | live bands, kids face-painting, Caribbean food trucks, and a community parade.',
        'Free family reggae and soca afternoon | community parade',
        'community',
        '2026-08-23 12:00:00+10', '2026-08-23 18:00:00+10', 'Australia/Melbourne',
        'Carlton Gardens', '1-111 Carlton St, Carlton', 'Melbourne', 'VIC',
        -37.8053, 144.9716,
        'https://picsum.photos/seed/caribbean-mel-2/1200/900',
        'https://picsum.photos/seed/caribbean-mel-2/600/450',
        2500, '["reggae","caribbean","family","free","community","soca"]'),

      -- 7. Island Vibes Sydney | 2 events
      ('e1070000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000007',
        'Island Vibes Sydney: Roots and Culture Night',
        'island-vibes-sydney-roots-and-culture-night',
        'A roots reggae and dancehall takeover at the Metro | classic riddims, vintage selectors, irie food, and good vibes only.',
        'Roots reggae and dancehall night with vintage selectors',
        'nightlife',
        '2026-05-17 20:00:00+10', '2026-05-18 02:00:00+10', 'Australia/Sydney',
        'The Metro Theatre', '624 George St, Sydney', 'Sydney', 'NSW',
        -33.8762, 151.2057,
        'https://picsum.photos/seed/island-vibes-1/1200/900',
        'https://picsum.photos/seed/island-vibes-1/600/450',
        850, '["caribbean","reggae","dancehall","roots","nightlife"]'),

      ('e1070000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000007',
        'Caribbean Sunset Cruise: Sydney Harbour',
        'caribbean-sunset-cruise-sydney-harbour',
        'Premium sunset cruise around the harbour with Caribbean DJs, rum tasting, dinner buffet, and a sunset photo wall. Strict over-18.',
        'Premium harbour cruise | Caribbean DJs, rum tasting, sunset',
        'food-drink',
        '2026-07-25 17:00:00+10', '2026-07-25 22:00:00+10', 'Australia/Sydney',
        'Darling Harbour Wharf 8', '23 Wheat Rd, Sydney', 'Sydney', 'NSW',
        -33.8714, 151.1996,
        'https://picsum.photos/seed/island-vibes-2/1200/900',
        'https://picsum.photos/seed/island-vibes-2/600/450',
        220, '["caribbean","cruise","premium","rum","sunset"]'),

      -- 8. Bollywood Nights Sydney | 2 events
      ('e1080000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000008',
        'Bollywood Nights Sydney: Dhol and Dance',
        'bollywood-nights-sydney-dhol-and-dance',
        'Sydney''s biggest Bollywood and Bhangra dance night | live dhol drummers, choreographed dance breaks, photo wall, dress to impress.',
        'Live dhol drummers, choreographed dance breaks | Sydney',
        'music',
        '2026-05-09 20:00:00+10', '2026-05-10 02:00:00+10', 'Australia/Sydney',
        'Luna Park Big Top', '1 Olympic Dr, Milsons Point', 'Sydney', 'NSW',
        -33.8473, 151.2106,
        'https://picsum.photos/seed/bollywood-syd-1/1200/900',
        'https://picsum.photos/seed/bollywood-syd-1/600/450',
        1200, '["bollywood","bhangra","dhol","south-asian","dance"]'),

      ('e1080000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000008',
        'Bollywood Brunch: Sangeet Sundays',
        'bollywood-brunch-sangeet-sundays',
        'A daytime Bollywood brunch | classic Hindi tracks, light Indian buffet, mehndi station, and a sangeet dance segment for the floor.',
        'Daytime Bollywood brunch | mehndi station, sangeet dance segment',
        'food-drink',
        '2026-08-02 12:00:00+10', '2026-08-02 17:00:00+10', 'Australia/Sydney',
        'The Star Sydney', '80 Pyrmont St, Pyrmont', 'Sydney', 'NSW',
        -33.8678, 151.1953,
        'https://picsum.photos/seed/bollywood-syd-2/1200/900',
        'https://picsum.photos/seed/bollywood-syd-2/600/450',
        300, '["bollywood","brunch","sangeet","mehndi","south-asian"]'),

      -- 9. Diwali Festival Melbourne | 2 events
      ('e1090000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000009',
        'Diwali Festival Melbourne: Festival of Lights',
        'diwali-festival-melbourne-festival-of-lights',
        'Melbourne''s annual free Diwali festival | fireworks finale, classical dance stages, regional food stalls, family rides, and a lantern walk.',
        'Free Diwali festival | fireworks, dance stages, food, lanterns',
        'festival',
        '2026-11-07 14:00:00+11', '2026-11-07 22:00:00+11', 'Australia/Melbourne',
        'Federation Square', 'Cnr Swanston and Flinders St, Melbourne', 'Melbourne', 'VIC',
        -37.8179, 144.9690,
        'https://picsum.photos/seed/diwali-mel-1/1200/900',
        'https://picsum.photos/seed/diwali-mel-1/600/450',
        15000, '["diwali","festival","family","free","south-asian","lights"]'),

      ('e1090000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000009',
        'Diwali Gala Dinner: An Evening in Jaipur',
        'diwali-gala-dinner-an-evening-in-jaipur',
        'Premium five-course Diwali gala dinner | classical Indian dance performances, ghazal trio, bespoke menu by guest chef. Black-tie or traditional attire.',
        'Premium gala dinner | classical dance, ghazal trio, bespoke menu',
        'food-drink',
        '2026-10-31 19:00:00+11', '2026-10-31 23:30:00+11', 'Australia/Melbourne',
        'Plaza Ballroom', '191 Collins St, Melbourne', 'Melbourne', 'VIC',
        -37.8157, 144.9670,
        'https://picsum.photos/seed/diwali-mel-2/1200/900',
        'https://picsum.photos/seed/diwali-mel-2/600/450',
        280, '["diwali","gala","premium","dinner","south-asian"]'),

      -- 10. Filipino Fiesta Brisbane | 2 events
      ('e1100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000010',
        'Filipino Fiesta Brisbane: Sariwa Sunday',
        'filipino-fiesta-brisbane-sariwa-sunday',
        'A free family Filipino fiesta | adobo cook-off, lechon, OPM live band, traditional dance, kids zone, photo booth, and pasalubong stalls.',
        'Free Filipino family fiesta | adobo cook-off, OPM live band',
        'community',
        '2026-06-21 11:00:00+10', '2026-06-21 18:00:00+10', 'Australia/Brisbane',
        'Roma Street Parkland', '1 Parkland Blvd, Brisbane', 'Brisbane', 'QLD',
        -27.4646, 153.0211,
        'https://picsum.photos/seed/filipino-bne-1/1200/900',
        'https://picsum.photos/seed/filipino-bne-1/600/450',
        4500, '["filipino","fiesta","family","free","food","community"]'),

      ('e1100000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000010',
        'OPM Night: Filipino Live Music Showcase',
        'opm-night-filipino-live-music-showcase',
        'A ticketed OPM (Original Pilipino Music) showcase | three live bands, acoustic sets, karaoke after-party, Filipino food and drinks.',
        'Three live OPM bands, karaoke after-party | Brisbane',
        'music',
        '2026-08-15 19:00:00+10', '2026-08-15 23:30:00+10', 'Australia/Brisbane',
        'Brisbane Powerhouse', '119 Lamington St, New Farm', 'Brisbane', 'QLD',
        -27.4691, 153.0507,
        'https://picsum.photos/seed/filipino-bne-2/1200/900',
        'https://picsum.photos/seed/filipino-bne-2/600/450',
        500, '["filipino","opm","music","live-band","showcase"]'),

      -- 11. Lunar Nights Melbourne | 2 events
      ('e1110000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000011',
        'Lunar Nights Melbourne: Year of the Horse',
        'lunar-nights-melbourne-year-of-the-horse',
        'Free Lunar New Year street festival | lion dance procession, dragon dance, Vietnamese, Chinese, Korean food stalls, lantern walk and red envelope giveaways.',
        'Free Lunar New Year festival | lion dance, lantern walk, food',
        'festival',
        '2027-02-13 16:00:00+11', '2027-02-13 22:00:00+11', 'Australia/Melbourne',
        'Queen Victoria Market', 'Queen St, Melbourne', 'Melbourne', 'VIC',
        -37.8076, 144.9568,
        'https://picsum.photos/seed/lunar-mel-1/1200/900',
        'https://picsum.photos/seed/lunar-mel-1/600/450',
        12000, '["lunar-new-year","chinese","vietnamese","korean","family","free"]'),

      ('e1110000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000011',
        'Lunar Banquet: Eight Course Dinner Show',
        'lunar-banquet-eight-course-dinner-show',
        'A premium eight-course Lunar New Year banquet | Cantonese chef-led menu, lion dance opening, traditional erhu performance, and a tea ceremony.',
        'Premium eight-course banquet | lion dance, erhu, tea ceremony',
        'food-drink',
        '2027-02-06 18:30:00+11', '2027-02-06 22:30:00+11', 'Australia/Melbourne',
        'Crown Palladium', '8 Whiteman St, Southbank', 'Melbourne', 'VIC',
        -37.8233, 144.9586,
        'https://picsum.photos/seed/lunar-mel-2/1200/900',
        'https://picsum.photos/seed/lunar-mel-2/600/450',
        450, '["lunar-new-year","banquet","premium","chinese","cultural"]'),

      -- 12. Latin Sabor Sydney | 2 events
      ('e1120000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000012',
        'Latin Sabor Sydney: Salsa Saturdays',
        'latin-sabor-sydney-salsa-saturdays',
        'A free salsa social with a one-hour beginner lesson, live Cuban band, and open dance floor until midnight. Bring a partner or come solo.',
        'Free salsa social | beginner lesson, live Cuban band',
        'community',
        '2026-05-02 19:00:00+10', '2026-05-03 00:00:00+10', 'Australia/Sydney',
        'Bondi Pavilion', 'Queen Elizabeth Dr, Bondi Beach', 'Sydney', 'NSW',
        -33.8908, 151.2776,
        'https://picsum.photos/seed/latin-syd-1/1200/900',
        'https://picsum.photos/seed/latin-syd-1/600/450',
        400, '["latin","salsa","cuban","free","dance","community"]'),

      ('e1120000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000012',
        'Reggaeton and Bachata: Latin Heat',
        'reggaeton-and-bachata-latin-heat',
        'A premium Latin night at the Enmore | reggaeton headliner DJ, bachata performances, mojitos, late-night dance floor. Strict over-18, dress code enforced.',
        'Premium reggaeton and bachata night | over-18, dress code',
        'nightlife',
        '2026-07-11 21:00:00+10', '2026-07-12 04:00:00+10', 'Australia/Sydney',
        'Enmore Theatre', '118-132 Enmore Rd, Newtown', 'Sydney', 'NSW',
        -33.8979, 151.1747,
        'https://picsum.photos/seed/latin-syd-2/1200/900',
        'https://picsum.photos/seed/latin-syd-2/600/450',
        1100, '["latin","reggaeton","bachata","premium","nightlife"]')
    ) AS e(
      id, organisation_id,
      title, slug, description, summary,
      category_slug,
      start_date, end_date, timezone,
      venue_name, venue_address, venue_city, venue_state,
      venue_latitude, venue_longitude,
      cover_image_url, thumbnail_url,
      max_capacity, tags
    )
    RETURNING id, slug
  )

  -- ---------------------------------------------------------------------------
  -- 4. Ticket tiers (mix of free, standard, premium)
  -- ---------------------------------------------------------------------------
  INSERT INTO public.ticket_tiers (
    event_id, name, description, tier_type,
    price, currency, total_capacity, sort_order
  )
  SELECT e.id, t.name, t.description, t.tier_type::public.ticket_tier_type,
    t.price, 'AUD', t.capacity, t.sort_order
  FROM new_events e
  JOIN (VALUES
    -- Owambe Sydney
    ('owambe-sydney-lagos-to-sydney-wedding-after-party', 'General Admission',  'Entry plus welcome drink',           'general_admission',  6500,  1200, 0),
    ('owambe-sydney-lagos-to-sydney-wedding-after-party', 'VIP Table',           'Reserved table for six | bottle service', 'vip',           28000, 50,    1),
    ('aso-ebi-affair-owambe-garden-party',                'General Admission',  'Entry, food, kids zone access',      'general_admission',  4500,  500,  0),
    ('aso-ebi-affair-owambe-garden-party',                'Family Pass',         'Two adults plus three kids',         'group',              12000, 50,    1),
    ('naming-ceremony-showcase-yoruba-traditions-night',  'Free Admission',     'Free cultural showcase | RSVP required', 'free',           0,     300,  0),

    -- Afrobeats Melbourne
    ('afrobeats-melbourne-summer-sessions',               'Early Bird',         'Limited release, all stages access', 'early_bird',         5500,  500,  0),
    ('afrobeats-melbourne-summer-sessions',               'General Admission',  'Standard release, all stages access','general_admission',  7500,  1200, 1),
    ('afrobeats-melbourne-summer-sessions',               'VIP',                 'Fast lane, viewing platform, drinks','vip',               15000, 200,  2),
    ('afrobeats-live-headline-concert',                   'Standing',           'General standing, floor access',     'general_admission',  9500,  4500, 0),
    ('afrobeats-live-headline-concert',                   'Premium Seated',     'Reserved seat, premium tier',        'vip',                14500, 2500, 1),
    ('afrobeats-and-brunch-sunday-sessions',              'Brunch Pass',        'Bottomless brunch, dance floor entry','general_admission',  8500,  400,  0),

    -- Gospel Brisbane
    ('gospel-on-the-river-brisbane-worship-night',        'Free Admission',     'Open-air gospel concert | RSVP for seat','free',           0,     3500, 0),
    ('gospel-on-the-river-brisbane-worship-night',        'Reserved Seat',      'Front-section reserved seat',        'general_admission',  3500,  400,  1),
    ('brisbane-gospel-choir-showcase',                    'General Admission',  'Open seating',                       'general_admission',  3500,  600,  0),
    ('brisbane-gospel-choir-showcase',                    'Front Row',          'Front row reserved with programme',  'vip',                8500,  60,   1),

    -- Amapiano Adelaide
    ('amapiano-adelaide-log-drum-sessions',               'General Admission',  'Dance floor entry, over-18',         'general_admission',  4500,  600,  0),
    ('amapiano-adelaide-log-drum-sessions',               'VIP Booth',           'Reserved booth for four',            'vip',                14000, 25,   1),
    ('amapiano-day-party-adelaide-hills',                 'General Admission',  'Day party entry, BYO blanket',       'general_admission',  4500,  1100, 0),
    ('amapiano-day-party-adelaide-hills',                 'Cabana Group',       'Reserved cabana for six',            'group',              28000, 20,   1),

    -- Lagos Comedy Tour
    ('lagos-comedy-tour-sydney-showcase',                 'Standard',           'Open seating, full lineup',          'general_admission',  4500,  1200, 0),
    ('lagos-comedy-tour-sydney-showcase',                 'Front Section',      'Reserved seat in first ten rows',    'vip',                8500,  250,  1),
    ('lagos-comedy-tour-melbourne-night',                 'Standard',           'Open seating, full lineup',          'general_admission',  4500,  800,  0),
    ('lagos-comedy-tour-melbourne-night',                 'Premium',             'Front section plus meet and greet', 'vip',                12500, 100,  1),
    ('lagos-comedy-tour-brisbane-closer',                 'Standard',           'Open seating, full lineup',          'general_admission',  4500,  800,  0),
    ('lagos-comedy-tour-brisbane-closer',                 'Recording Gala',     'Reserved seat plus after-party',     'vip',                14500, 120,  1),

    -- Caribbean Carnival Melbourne
    ('caribbean-carnival-melbourne-soca-saturday',        'General Admission',  'Carnival night entry',               'general_admission',  4500,  750,  0),
    ('caribbean-carnival-melbourne-soca-saturday',        'VIP Riser',           'Elevated viewing area plus rum bar', 'vip',                12500, 80,   1),
    ('reggae-on-the-lawn-family-carnival-day',            'Free Admission',     'Free family afternoon | RSVP',       'free',               0,     2500, 0),

    -- Island Vibes Sydney
    ('island-vibes-sydney-roots-and-culture-night',       'General Admission',  'Roots reggae night entry',           'general_admission',  3500,  700,  0),
    ('island-vibes-sydney-roots-and-culture-night',       'Soundsystem Booth',  'Reserved booth near soundsystem',    'vip',                9500,  60,   1),
    ('caribbean-sunset-cruise-sydney-harbour',            'Premium',             'Cruise, dinner buffet, rum tasting','vip',                14500, 200,  0),

    -- Bollywood Nights Sydney
    ('bollywood-nights-sydney-dhol-and-dance',            'General Admission',  'Dance floor entry',                  'general_admission',  4500,  1000, 0),
    ('bollywood-nights-sydney-dhol-and-dance',            'VIP Group of Six',   'Reserved table plus bottle',         'group',              25000, 30,   1),
    ('bollywood-brunch-sangeet-sundays',                  'Brunch Pass',        'Brunch buffet, mehndi station',      'general_admission',  8500,  280,  0),

    -- Diwali Festival Melbourne
    ('diwali-festival-melbourne-festival-of-lights',      'Free Admission',     'Free festival entry | RSVP',         'free',               0,     14000, 0),
    ('diwali-festival-melbourne-festival-of-lights',      'Family Picnic Zone', 'Reserved family picnic spot',        'general_admission',  3500,  300,  1),
    ('diwali-gala-dinner-an-evening-in-jaipur',           'Standard',           'Five-course dinner, dance floor',    'general_admission',  14500, 200,  0),
    ('diwali-gala-dinner-an-evening-in-jaipur',           'VIP Table of Eight', 'Premium reserved table',             'group',              80000, 10,   1),

    -- Filipino Fiesta Brisbane
    ('filipino-fiesta-brisbane-sariwa-sunday',            'Free Admission',     'Free fiesta entry | RSVP',           'free',               0,     4000, 0),
    ('filipino-fiesta-brisbane-sariwa-sunday',            'VIP Lechon Pass',    'Lechon plate, drink, reserved seat', 'vip',                4500,  150,  1),
    ('opm-night-filipino-live-music-showcase',            'General Admission',  'OPM showcase entry',                 'general_admission',  4500,  450,  0),
    ('opm-night-filipino-live-music-showcase',            'VIP Front Row',      'Front row plus meet and greet',      'vip',                9500,  50,   1),

    -- Lunar Nights Melbourne
    ('lunar-nights-melbourne-year-of-the-horse',          'Free Admission',     'Free street festival entry',         'free',               0,     11000, 0),
    ('lunar-nights-melbourne-year-of-the-horse',          'Lantern Pass',       'Lantern plus red envelope and food voucher', 'general_admission', 3500, 800, 1),
    ('lunar-banquet-eight-course-dinner-show',            'Standard',           'Eight-course banquet, lion dance opening', 'general_admission', 14500, 380, 0),
    ('lunar-banquet-eight-course-dinner-show',            'VIP Table of Ten',   'Reserved premium table for ten',     'group',              125000, 6,   1),

    -- Latin Sabor Sydney
    ('latin-sabor-sydney-salsa-saturdays',                'Free Admission',     'Free salsa social | beginner lesson included', 'free',     0,     400, 0),
    ('reggaeton-and-bachata-latin-heat',                  'General Admission',  'Dance floor entry, over-18',         'general_admission',  4500,  900,  0),
    ('reggaeton-and-bachata-latin-heat',                  'Premium VIP',         'Booth plus bottle service',          'vip',                14500, 80,   1)
  ) AS t(slug, name, description, tier_type, price, capacity, sort_order)
    ON e.slug = t.slug;

END $seed$;
