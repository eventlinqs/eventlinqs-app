-- =============================================================================
-- 20260504000003_seed_pride_european_me_pacific_events.sql
--
-- Batch 5.5 task 8 | seed events for the four cultures whose bridges were
-- previously empty: Pride, European, Middle Eastern, Pacific.
--
-- Adds:
--   - 4 new event_categories (pride, european, middle-eastern, pacific) so the
--     CULTURE_TO_CATEGORY_SLUGS bridge has dedicated slugs to wire to each
--     culture page without colliding with existing category surfaces.
--   - 4 organisations (one per culture)
--   - 14 events with founder-specified titles, mixed pricing tiers
--   - Ticket tiers (free, standard, premium mix) per event
--
-- Pricing in cents AUD. All dates from 2026-05-09 forward.
-- Idempotent: skips on re-run when seed organisations already exist.
-- Style: hyphens, colons, pipes only | no em-dashes or en-dashes.
-- =============================================================================

DO $seed$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.organisations
    WHERE id = 'a2000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE NOTICE 'Pride/European/ME/Pacific seed already present | skipping.';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. New event_categories
  -- ---------------------------------------------------------------------------
  INSERT INTO public.event_categories (name, slug, icon, sort_order, is_active)
  VALUES
    ('Pride',          'pride',          'rainbow',   18, true),
    ('European',       'european',       'flag',      19, true),
    ('Middle Eastern', 'middle-eastern', 'moon-star', 20, true),
    ('Pacific',        'pacific',        'palmtree',  21, true)
  ON CONFLICT (slug) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 2. Four organisations (one per culture)
  -- ---------------------------------------------------------------------------
  INSERT INTO public.organisations (id, name, slug, description, email, status, owner_id)
  VALUES
    ('a2000000-0000-4000-8000-000000000001',
      'Sydney Pride Collective',
      'sydney-pride-collective',
      'Queer-led events across Sydney, Melbourne, and Brisbane | Mardi Gras afterparties, drag brunches, comedy nights, and community fundraisers all welcome.',
      'hello@sydneypridecollective.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a2000000-0000-4000-8000-000000000002',
      'Polonia Australia Events',
      'polonia-australia-events',
      'Polish, German, and pan-European cultural events across Australia | folk festivals, Oktoberfest, Eurovision watch parties, and language meetups.',
      'witaj@poloniaaustralia.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a2000000-0000-4000-8000-000000000003',
      'Mahrajan Sydney',
      'mahrajan-sydney',
      'Lebanese, Persian, Turkish, and Arab music and food festivals | dabke nights, Nowruz, Ramadan iftars, and Arabic live music showcases.',
      'ahlan@mahrajansydney.com.au',
      'active', '00000000-0000-4000-8000-000000000001'),

    ('a2000000-0000-4000-8000-000000000004',
      'Pasifika Collective',
      'pasifika-collective',
      'Pacific Islander cultural events | Samoan, Tongan, Fijian, Maori, and Niuean festivals, kava nights, traditional dance showcases, and family fun days.',
      'talofa@pasifikacollective.com.au',
      'active', '00000000-0000-4000-8000-000000000001');

  -- ---------------------------------------------------------------------------
  -- 3. Fourteen events (3-4 per culture)
  --    UUID pattern: e2<orgnum><eventnum>0000-0000-4000-8000-0000000000XX
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
      e.is_age_restricted::boolean
    FROM (VALUES
      -- 1. Sydney Pride Collective | 4 events
      ('e2010000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
        'Sydney Mardi Gras Afterparty',
        'sydney-mardi-gras-afterparty',
        'The official Sydney Pride Collective Mardi Gras after-hours party. Three rooms of pop, house, and hyperpop, drag headliners, full production, and the biggest queer crowd of the year. Strict over-18.',
        'Three rooms, drag headliners, hyperpop and house | over-18',
        'pride',
        '2026-06-13 22:00:00+10', '2026-06-14 06:00:00+10', 'Australia/Sydney',
        'Hordern Pavilion', '1 Driver Ave, Moore Park', 'Sydney', 'NSW',
        -33.8927, 151.2244,
        'https://picsum.photos/seed/pride-syd-1/1200/900',
        'https://picsum.photos/seed/pride-syd-1/600/450',
        2500, '["pride","mardi-gras","queer","afterparty","sydney"]', true),

      ('e2010000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001',
        'Pride Brunch Melbourne',
        'pride-brunch-melbourne',
        'Bottomless brunch with drag hosts, queer DJs, and a long-table feast in the heart of Fitzroy. All ages welcome before 4pm, family-friendly atmosphere, dress code: bring the colour.',
        'Bottomless brunch | drag hosts, queer DJs, all-ages',
        'pride',
        '2026-07-05 12:00:00+10', '2026-07-05 17:00:00+10', 'Australia/Melbourne',
        'Brunswick Mess Hall', '6 Florence St, Brunswick', 'Melbourne', 'VIC',
        -37.7676, 144.9590,
        'https://picsum.photos/seed/pride-mel-1/1200/900',
        'https://picsum.photos/seed/pride-mel-1/600/450',
        320, '["pride","brunch","drag","queer","melbourne"]', false),

      ('e2010000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001',
        'LGBTQ+ Comedy Night Brisbane',
        'lgbtq-comedy-night-brisbane',
        'Six queer comedians take the stage at the Powerhouse for one ticketed evening. Hosted, recorded, and broadcast to community partners. Donations support a local LGBTQ+ youth charity.',
        'Six queer comedians | recorded showcase, charity donation',
        'pride',
        '2026-08-22 19:30:00+10', '2026-08-22 22:30:00+10', 'Australia/Brisbane',
        'Brisbane Powerhouse', '119 Lamington St, New Farm', 'Brisbane', 'QLD',
        -27.4654, 153.0509,
        'https://picsum.photos/seed/pride-bne-1/1200/900',
        'https://picsum.photos/seed/pride-bne-1/600/450',
        450, '["pride","comedy","lgbtq","charity","brisbane"]', false),

      ('e2010000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001',
        'Rainbow Family Picnic Adelaide',
        'rainbow-family-picnic-adelaide',
        'Free family picnic in the parklands for queer families and allies. Face painting, story corner, kids zone, food trucks, and an afternoon stage with local performers. RSVP required.',
        'Free family picnic | kids zone, food trucks, RSVP required',
        'pride',
        '2026-09-12 11:00:00+09:30', '2026-09-12 16:00:00+09:30', 'Australia/Adelaide',
        'Adelaide Park Lands', 'Hutt St, Adelaide', 'Adelaide', 'SA',
        -34.9285, 138.6007,
        'https://picsum.photos/seed/pride-ade-1/1200/900',
        'https://picsum.photos/seed/pride-ade-1/600/450',
        1500, '["pride","family","free","picnic","adelaide"]', false),

      -- 2. Polonia Australia Events | 3 events
      ('e2020000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
        'Polish Folk Festival Sydney',
        'polish-folk-festival-sydney',
        'A weekend of Polish folk dance ensembles, accordion bands, pierogi cook-offs, and a polka stage that runs from noon to night. Family-friendly, all ages welcome.',
        'Polish folk dance, polka stage, pierogi cook-offs | family',
        'european',
        '2026-05-30 11:00:00+10', '2026-05-31 22:00:00+10', 'Australia/Sydney',
        'Tumbalong Park, Darling Harbour', '1-25 Harbour St, Sydney', 'Sydney', 'NSW',
        -33.8779, 151.2017,
        'https://picsum.photos/seed/euro-syd-1/1200/900',
        'https://picsum.photos/seed/euro-syd-1/600/450',
        3500, '["european","polish","folk","festival","family"]', false),

      ('e2020000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002',
        'Oktoberfest Melbourne',
        'oktoberfest-melbourne',
        'Bavarian beer halls take over the Royal Exhibition Building. Stein hoisting, oompah bands, schnitzel and bratwurst stalls, traditional dirndl and lederhosen encouraged.',
        'Bavarian beer hall | oompah bands, stein hoist | over-18',
        'european',
        '2026-10-03 16:00:00+10', '2026-10-03 23:30:00+10', 'Australia/Melbourne',
        'Royal Exhibition Building', '9 Nicholson St, Carlton', 'Melbourne', 'VIC',
        -37.8047, 144.9716,
        'https://picsum.photos/seed/euro-mel-1/1200/900',
        'https://picsum.photos/seed/euro-mel-1/600/450',
        2000, '["european","german","oktoberfest","beer","melbourne"]', true),

      ('e2020000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002',
        'Eurovision Watch Party Sydney',
        'eurovision-watch-party-sydney',
        'Live Eurovision broadcast on the big screen with European DJs between sets, themed cocktails by country, costume competition, and group sing-along leadership.',
        'Live Eurovision | DJs, costume comp, themed cocktails',
        'european',
        '2026-05-16 19:00:00+10', '2026-05-17 02:00:00+10', 'Australia/Sydney',
        'The Imperial Hotel', '35 Erskineville Rd, Erskineville', 'Sydney', 'NSW',
        -33.9009, 151.1860,
        'https://picsum.photos/seed/euro-syd-2/1200/900',
        'https://picsum.photos/seed/euro-syd-2/600/450',
        600, '["european","eurovision","watch-party","sydney"]', true),

      -- 3. Mahrajan Sydney | 4 events
      ('e2030000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003',
        'Lebanese Mahrajan Sydney',
        'lebanese-mahrajan-sydney',
        'Lebanese cultural festival in Bankstown | live tabla and oud bands, dabke dance circles, manakish and shawarma stalls, halal food court, and a kids zone with calligraphy stations.',
        'Lebanese mahrajan | live music, dabke, halal food, family',
        'middle-eastern',
        '2026-06-06 14:00:00+10', '2026-06-06 22:00:00+10', 'Australia/Sydney',
        'Paul Keating Park', 'The Mall, Bankstown', 'Sydney', 'NSW',
        -33.9173, 151.0349,
        'https://picsum.photos/seed/me-syd-1/1200/900',
        'https://picsum.photos/seed/me-syd-1/600/450',
        4500, '["middle-eastern","lebanese","mahrajan","dabke","family"]', false),

      ('e2030000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003',
        'Persian New Year Melbourne',
        'persian-new-year-melbourne',
        'Nowruz celebration with the Haft-sin table, live Persian classical music, traditional foods including sabzi polo and fish, and dance performances. Free entry, RSVP for catered seating.',
        'Nowruz | Haft-sin, Persian classical music, free entry',
        'middle-eastern',
        '2026-08-15 17:00:00+10', '2026-08-15 22:30:00+10', 'Australia/Melbourne',
        'Federation Square', 'Cnr Swanston and Flinders St, Melbourne', 'Melbourne', 'VIC',
        -37.8180, 144.9690,
        'https://picsum.photos/seed/me-mel-1/1200/900',
        'https://picsum.photos/seed/me-mel-1/600/450',
        2500, '["middle-eastern","persian","nowruz","free","melbourne"]', false),

      ('e2030000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003',
        'Arab Music Night Brisbane',
        'arab-music-night-brisbane',
        'A premium Arab music showcase featuring oud master, vocalist, and tabla ensemble flown in from Beirut. Reserved seating, mezze platters, and a late-night dabke after-set.',
        'Arab music showcase | Beirut headliner, mezze, late dabke',
        'middle-eastern',
        '2026-09-26 19:30:00+10', '2026-09-27 00:30:00+10', 'Australia/Brisbane',
        'Brisbane City Hall', '64 Adelaide St, Brisbane', 'Brisbane', 'QLD',
        -27.4682, 153.0235,
        'https://picsum.photos/seed/me-bne-1/1200/900',
        'https://picsum.photos/seed/me-bne-1/600/450',
        1200, '["middle-eastern","arab","oud","music","brisbane"]', true),

      ('e2030000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000003',
        'Turkish Coffee and Stories Sydney',
        'turkish-coffee-and-stories-sydney',
        'A free intimate evening of Turkish coffee, baklava, and storytelling with elders from Sydney''s Turkish community. Limited seating, RSVP only, all-ages welcome.',
        'Free Turkish coffee and storytelling | RSVP, all ages',
        'middle-eastern',
        '2026-07-26 18:00:00+10', '2026-07-26 21:00:00+10', 'Australia/Sydney',
        'Auburn Centre for Community', '44a Macquarie Rd, Auburn', 'Sydney', 'NSW',
        -33.8497, 151.0327,
        'https://picsum.photos/seed/me-syd-2/1200/900',
        'https://picsum.photos/seed/me-syd-2/600/450',
        80, '["middle-eastern","turkish","free","community","sydney"]', false),

      -- 4. Pasifika Collective | 3 events
      ('e2040000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004',
        'Pasifika Festival Sydney',
        'pasifika-festival-sydney',
        'A two-day Pasifika cultural festival with main stage performances from Samoan, Tongan, Fijian, Cook Islands, and Maori artists. Traditional food village, cultural workshops, weaving, and a kava tent.',
        'Two-day Pasifika festival | main stage, food village, kava',
        'pacific',
        '2026-07-18 10:00:00+10', '2026-07-19 21:00:00+10', 'Australia/Sydney',
        'Tempe Reserve', 'Holbeach Ave, Tempe', 'Sydney', 'NSW',
        -33.9239, 151.1581,
        'https://picsum.photos/seed/pac-syd-1/1200/900',
        'https://picsum.photos/seed/pac-syd-1/600/450',
        6000, '["pacific","pasifika","samoan","tongan","fijian","festival"]', false),

      ('e2040000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000004',
        'Maori Cultural Night Melbourne',
        'maori-cultural-night-melbourne',
        'An evening of Maori culture with kapa haka performances, Maori weaving demonstrations, hangi feast, and a panel discussion on Maori identity in Australia. Whanau-friendly.',
        'Kapa haka, hangi feast, weaving | whanau-friendly',
        'pacific',
        '2026-08-29 17:30:00+10', '2026-08-29 22:30:00+10', 'Australia/Melbourne',
        'Collingwood Town Hall', '140 Hoddle St, Abbotsford', 'Melbourne', 'VIC',
        -37.8077, 144.9961,
        'https://picsum.photos/seed/pac-mel-1/1200/900',
        'https://picsum.photos/seed/pac-mel-1/600/450',
        500, '["pacific","maori","kapa-haka","hangi","melbourne"]', false),

      ('e2040000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000004',
        'Pacific Islander Comedy Brisbane',
        'pacific-islander-comedy-brisbane',
        'Six Pasifika comedians from Australia and New Zealand take the stage. Hosted, full lineup, late-night kava bar afterwards. The funniest night you''ll have all year.',
        'Six Pasifika comedians | full lineup, kava bar afterwards',
        'pacific',
        '2026-10-17 19:30:00+10', '2026-10-17 23:00:00+10', 'Australia/Brisbane',
        'The Tivoli', '52 Costin St, Fortitude Valley', 'Brisbane', 'QLD',
        -27.4570, 153.0316,
        'https://picsum.photos/seed/pac-bne-1/1200/900',
        'https://picsum.photos/seed/pac-bne-1/600/450',
        700, '["pacific","comedy","pasifika","brisbane"]', true)
    ) AS e(
      id, organisation_id,
      title, slug, description, summary,
      category_slug,
      start_date, end_date, timezone,
      venue_name, venue_address, venue_city, venue_state,
      venue_latitude, venue_longitude,
      cover_image_url, thumbnail_url,
      max_capacity, tags, is_age_restricted
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
    -- Sydney Pride Collective
    ('sydney-mardi-gras-afterparty',                'Early Bird',          'Limited release, all rooms access',          'early_bird',         8500,  500,  0),
    ('sydney-mardi-gras-afterparty',                'General Admission',   'Standard release, all rooms access',         'general_admission',  12500, 1500, 1),
    ('sydney-mardi-gras-afterparty',                'VIP Mezzanine',       'Elevated viewing, fast lane, drinks included','vip',               24500, 200,  2),
    ('pride-brunch-melbourne',                      'Brunch Pass',         'Bottomless brunch, all-ages before 4pm',     'general_admission',  8500,  300,  0),
    ('lgbtq-comedy-night-brisbane',                 'Standard',            'Open seating, full lineup',                  'general_admission',  4500,  400,  0),
    ('lgbtq-comedy-night-brisbane',                 'Front Row',           'Reserved seat plus charity tote',            'vip',                8500,  50,   1),
    ('rainbow-family-picnic-adelaide',              'Free Admission',      'Free family picnic | RSVP required',         'free',               0,     1500, 0),

    -- Polonia Australia Events
    ('polish-folk-festival-sydney',                 'Free Admission',      'Free festival entry | RSVP for picnic spot', 'free',               0,     3000, 0),
    ('polish-folk-festival-sydney',                 'Family Picnic Zone',  'Reserved family picnic spot',                'general_admission',  3500,  400,  1),
    ('oktoberfest-melbourne',                       'General Admission',   'Beer hall entry, first stein included',      'general_admission',  6500,  1700, 0),
    ('oktoberfest-melbourne',                       'VIP Stein Pass',      'Reserved table, four steins, schnitzel plate','vip',               16500, 250,  1),
    ('eurovision-watch-party-sydney',               'Standard',            'Watch party entry, costume comp included',   'general_admission',  3500,  550,  0),
    ('eurovision-watch-party-sydney',               'Booth of Six',        'Reserved booth, drinks package',             'group',              22500, 12,   1),

    -- Mahrajan Sydney
    ('lebanese-mahrajan-sydney',                    'Free Admission',      'Free festival entry | RSVP for seating',     'free',               0,     4000, 0),
    ('lebanese-mahrajan-sydney',                    'Family Pass',         'Two adults plus three kids, food vouchers',  'group',              8500,  100,  1),
    ('persian-new-year-melbourne',                  'Free Admission',      'Free Nowruz celebration | RSVP',             'free',               0,     2200, 0),
    ('persian-new-year-melbourne',                  'Catered Seating',     'Reserved seat plus sabzi polo and fish',     'general_admission',  6500,  300,  1),
    ('arab-music-night-brisbane',                   'Reserved Seat',       'Reserved seating, full showcase',            'general_admission',  8500,  900,  0),
    ('arab-music-night-brisbane',                   'Premium Mezze',       'Front section, mezze platter, late dabke',   'vip',                16500, 250,  1),
    ('turkish-coffee-and-stories-sydney',           'Free Admission',      'Free intimate evening | RSVP, limited seats','free',               0,     80,   0),

    -- Pasifika Collective
    ('pasifika-festival-sydney',                    'Free Admission',      'Free two-day festival entry | RSVP',         'free',               0,     5500, 0),
    ('pasifika-festival-sydney',                    'Cultural Pass',       'Workshop access, food village voucher',      'general_admission',  4500,  500,  1),
    ('maori-cultural-night-melbourne',              'General Admission',   'Performance entry, hangi feast included',    'general_admission',  6500,  450,  0),
    ('maori-cultural-night-melbourne',              'Whanau Pass',         'Family of five, hangi feast, reserved seats','group',              25000, 30,   1),
    ('pacific-islander-comedy-brisbane',            'Standard',            'Open seating, full lineup',                  'general_admission',  4500,  600,  0),
    ('pacific-islander-comedy-brisbane',            'Premium plus Kava',   'Front section, kava bar voucher',            'vip',                9500,  100,  1)
  ) AS t(slug, name, description, tier_type, price, capacity, sort_order)
    ON e.slug = t.slug;

END $seed$;
