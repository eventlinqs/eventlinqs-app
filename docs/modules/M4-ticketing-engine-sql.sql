-- ============================================================
-- EventLinqs Module 4: Ticketing Engine & Inventory — Combined SQL
-- ============================================================
-- Run this entire file in Supabase → SQL Editor → New query → Run
-- Prerequisites: M1, M2, M3 SQL must have been run first
-- ============================================================

-- ============================================================
-- 1. CUSTOM TYPES (ENUMS)
-- ============================================================

CREATE TYPE public.seat_status AS ENUM (
  'available',
  'reserved',
  'sold',
  'held',
  'blocked',
  'accessible'
);

CREATE TYPE public.seat_type AS ENUM (
  'standard',
  'premium',
  'accessible',
  'companion',
  'restricted_view',
  'obstructed'
);

CREATE TYPE public.squad_status AS ENUM (
  'forming',
  'completed',
  'expired',
  'cancelled'
);

CREATE TYPE public.squad_member_status AS ENUM (
  'invited',
  'paid',
  'declined',
  'timed_out'
);

CREATE TYPE public.waitlist_status AS ENUM (
  'waiting',
  'notified',
  'converted',
  'expired',
  'removed'
);

CREATE TYPE public.queue_status AS ENUM (
  'waiting',
  'admitted',
  'expired',
  'abandoned'
);

-- ============================================================
-- 2. EXTEND EXISTING TABLES
-- ============================================================

-- events table additions
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_high_demand BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS has_reserved_seating BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS squad_booking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS squad_timeout_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS venue_id UUID,
  ADD COLUMN IF NOT EXISTS seat_map_id UUID,
  ADD COLUMN IF NOT EXISTS queue_admission_window_minutes INT NOT NULL DEFAULT 10;

-- ticket_tiers table additions
ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS dynamic_pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sale_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requires_access_code BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seat_map_section_id UUID;

-- ============================================================
-- 3. VENUES TABLE
-- ============================================================

CREATE TABLE public.venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  capacity INT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venues_organisation ON public.venues(organisation_id);
CREATE INDEX idx_venues_country ON public.venues(country);
CREATE INDEX idx_venues_active ON public.venues(is_active) WHERE is_active = true;

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venues are viewable by everyone"
  ON public.venues FOR SELECT
  USING (is_active = true);

CREATE POLICY "Org members can manage venues"
  ON public.venues FOR ALL
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
    OR organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Service role manages venues"
  ON public.venues FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Now add FK from events to venues
ALTER TABLE public.events
  ADD CONSTRAINT events_venue_fk
  FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE SET NULL;

-- ============================================================
-- 4. SEAT MAPS TABLE
-- ============================================================

CREATE TABLE public.seat_maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  layout JSONB NOT NULL DEFAULT '{}',
  total_seats INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seat_maps_venue ON public.seat_maps(venue_id);
CREATE INDEX idx_seat_maps_active ON public.seat_maps(is_active) WHERE is_active = true;

ALTER TABLE public.seat_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seat maps are viewable by everyone"
  ON public.seat_maps FOR SELECT
  USING (is_active = true);

CREATE POLICY "Org members can manage seat maps"
  ON public.seat_maps FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM public.venues v
      WHERE v.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR v.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

CREATE POLICY "Service role manages seat maps"
  ON public.seat_maps FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.seat_maps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Now add FK from events to seat_maps
ALTER TABLE public.events
  ADD CONSTRAINT events_seat_map_fk
  FOREIGN KEY (seat_map_id) REFERENCES public.seat_maps(id) ON DELETE SET NULL;

-- ============================================================
-- 5. SEAT MAP SECTIONS TABLE
-- ============================================================

CREATE TABLE public.seat_map_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seat_map_id UUID NOT NULL REFERENCES public.seat_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#4A90E2',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seat_map_sections_map ON public.seat_map_sections(seat_map_id);

ALTER TABLE public.seat_map_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seat map sections are viewable by everyone"
  ON public.seat_map_sections FOR SELECT
  USING (true);

CREATE POLICY "Service role manages seat map sections"
  ON public.seat_map_sections FOR ALL
  USING (auth.role() = 'service_role');

-- Now add FK from ticket_tiers to seat_map_sections
ALTER TABLE public.ticket_tiers
  ADD CONSTRAINT ticket_tiers_seat_map_section_fk
  FOREIGN KEY (seat_map_section_id) REFERENCES public.seat_map_sections(id) ON DELETE SET NULL;

-- ============================================================
-- 6. SEATS TABLE (materialised per event)
-- ============================================================

CREATE TABLE public.seats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  seat_map_section_id UUID REFERENCES public.seat_map_sections(id) ON DELETE SET NULL,
  ticket_tier_id UUID REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  row_label TEXT NOT NULL,
  seat_number TEXT NOT NULL,
  seat_type public.seat_type NOT NULL DEFAULT 'standard',
  status public.seat_status NOT NULL DEFAULT 'available',
  x NUMERIC(10, 2),
  y NUMERIC(10, 2),
  price_cents INT,
  reservation_id UUID,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  held_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  held_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT seats_unique_per_event UNIQUE (event_id, row_label, seat_number)
);

CREATE INDEX idx_seats_event ON public.seats(event_id);
CREATE INDEX idx_seats_event_status ON public.seats(event_id, status);
CREATE INDEX idx_seats_section ON public.seats(seat_map_section_id);
CREATE INDEX idx_seats_tier ON public.seats(ticket_tier_id);
CREATE INDEX idx_seats_reservation ON public.seats(reservation_id) WHERE reservation_id IS NOT NULL;

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seats are viewable by everyone"
  ON public.seats FOR SELECT
  USING (true);

CREATE POLICY "Service role manages seats"
  ON public.seats FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.seats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 7. SEAT HOLDS TABLE (organiser-held seats)
-- ============================================================

CREATE TABLE public.seat_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  seat_id UUID NOT NULL REFERENCES public.seats(id) ON DELETE CASCADE,
  held_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seat_holds_event ON public.seat_holds(event_id);
CREATE INDEX idx_seat_holds_seat ON public.seat_holds(seat_id);

ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage seat holds"
  ON public.seat_holds FOR ALL
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      WHERE e.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR e.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

CREATE POLICY "Service role manages seat holds"
  ON public.seat_holds FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 8. DYNAMIC PRICING RULES TABLE
-- ============================================================

CREATE TABLE public.dynamic_pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  capacity_threshold_percent NUMERIC(5, 2) NOT NULL CHECK (capacity_threshold_percent > 0 AND capacity_threshold_percent <= 100),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT dynamic_pricing_rules_unique_step UNIQUE (ticket_tier_id, step_order)
);

CREATE INDEX idx_dynamic_pricing_tier ON public.dynamic_pricing_rules(ticket_tier_id);
CREATE INDEX idx_dynamic_pricing_tier_step ON public.dynamic_pricing_rules(ticket_tier_id, step_order);

ALTER TABLE public.dynamic_pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dynamic pricing rules are viewable by everyone"
  ON public.dynamic_pricing_rules FOR SELECT
  USING (true);

CREATE POLICY "Org members can manage dynamic pricing rules"
  ON public.dynamic_pricing_rules FOR ALL
  USING (
    ticket_tier_id IN (
      SELECT tt.id FROM public.ticket_tiers tt
      JOIN public.events e ON e.id = tt.event_id
      WHERE e.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR e.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

CREATE POLICY "Service role manages dynamic pricing rules"
  ON public.dynamic_pricing_rules FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dynamic_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 9. SQUADS TABLE
-- ============================================================

CREATE TABLE public.squads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  leader_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  reservation_id UUID,
  total_spots INT NOT NULL CHECK (total_spots >= 2 AND total_spots <= 20),
  status public.squad_status NOT NULL DEFAULT 'forming',
  share_token TEXT NOT NULL UNIQUE,
  extended_once BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_squads_event ON public.squads(event_id);
CREATE INDEX idx_squads_leader ON public.squads(leader_user_id);
CREATE INDEX idx_squads_share_token ON public.squads(share_token);
CREATE INDEX idx_squads_status ON public.squads(status);
CREATE INDEX idx_squads_expires ON public.squads(expires_at) WHERE status = 'forming';

ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Squads are viewable by anyone with the share token"
  ON public.squads FOR SELECT
  USING (true); -- Share token validation happens in app logic

CREATE POLICY "Service role manages squads"
  ON public.squads FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 10. SQUAD MEMBERS TABLE
-- ============================================================

CREATE TABLE public.squad_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_email TEXT,
  attendee_first_name TEXT,
  attendee_last_name TEXT,
  attendee_email TEXT,
  status public.squad_member_status NOT NULL DEFAULT 'invited',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  
  CONSTRAINT squad_members_unique_position UNIQUE (squad_id, position)
);

CREATE INDEX idx_squad_members_squad ON public.squad_members(squad_id);
CREATE INDEX idx_squad_members_user ON public.squad_members(user_id);
CREATE INDEX idx_squad_members_status ON public.squad_members(status);

ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Squad members are viewable by the squad leader and members"
  ON public.squad_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR squad_id IN (SELECT id FROM public.squads WHERE leader_user_id = auth.uid())
  );

CREATE POLICY "Service role manages squad members"
  ON public.squad_members FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 11. WAITLIST TABLE
-- ============================================================

CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_tier_id UUID REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity_requested INT NOT NULL DEFAULT 1 CHECK (quantity_requested > 0 AND quantity_requested <= 20),
  status public.waitlist_status NOT NULL DEFAULT 'waiting',
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  
  CONSTRAINT waitlist_unique_user_event UNIQUE (user_id, event_id, ticket_tier_id)
);

CREATE INDEX idx_waitlist_event ON public.waitlist(event_id);
CREATE INDEX idx_waitlist_tier ON public.waitlist(ticket_tier_id);
CREATE INDEX idx_waitlist_user ON public.waitlist(user_id);
CREATE INDEX idx_waitlist_status ON public.waitlist(status);
CREATE INDEX idx_waitlist_position ON public.waitlist(event_id, ticket_tier_id, position) WHERE status = 'waiting';

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own waitlist entries"
  ON public.waitlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Org members can view waitlist for their events"
  ON public.waitlist FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      WHERE e.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role manages waitlist"
  ON public.waitlist FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 12. WAITLIST NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE public.waitlist_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  waitlist_id UUID NOT NULL REFERENCES public.waitlist(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  converted BOOLEAN NOT NULL DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  email_sent BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_waitlist_notifications_waitlist ON public.waitlist_notifications(waitlist_id);
CREATE INDEX idx_waitlist_notifications_expires ON public.waitlist_notifications(expires_at) WHERE converted = false;

ALTER TABLE public.waitlist_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages waitlist notifications"
  ON public.waitlist_notifications FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 13. VIRTUAL QUEUE TABLE
-- ============================================================

CREATE TABLE public.virtual_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  ip_address INET,
  position INT NOT NULL,
  status public.queue_status NOT NULL DEFAULT 'waiting',
  position_token TEXT NOT NULL, -- HMAC-signed
  admitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT virtual_queue_has_identity CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX idx_virtual_queue_event ON public.virtual_queue(event_id);
CREATE INDEX idx_virtual_queue_user ON public.virtual_queue(user_id);
CREATE INDEX idx_virtual_queue_session ON public.virtual_queue(session_id);
CREATE INDEX idx_virtual_queue_event_position ON public.virtual_queue(event_id, position) WHERE status = 'waiting';
CREATE INDEX idx_virtual_queue_expires ON public.virtual_queue(expires_at) WHERE status = 'admitted';
CREATE INDEX idx_virtual_queue_ip ON public.virtual_queue(event_id, ip_address) WHERE ip_address IS NOT NULL;

ALTER TABLE public.virtual_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own queue entries"
  ON public.virtual_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages virtual queue"
  ON public.virtual_queue FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 14. TIER ACCESS CODES TABLE
-- ============================================================

CREATE TABLE public.tier_access_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  max_uses INT,
  current_uses INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT tier_access_codes_unique UNIQUE (ticket_tier_id, code)
);

CREATE INDEX idx_tier_access_codes_tier ON public.tier_access_codes(ticket_tier_id);
CREATE INDEX idx_tier_access_codes_active ON public.tier_access_codes(is_active) WHERE is_active = true;

ALTER TABLE public.tier_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage access codes"
  ON public.tier_access_codes FOR ALL
  USING (
    ticket_tier_id IN (
      SELECT tt.id FROM public.ticket_tiers tt
      JOIN public.events e ON e.id = tt.event_id
      WHERE e.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR e.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

CREATE POLICY "Service role manages access codes"
  ON public.tier_access_codes FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tier_access_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 15. RPC: get_current_tier_price
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_tier_price(p_tier_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier RECORD;
  v_percent_sold NUMERIC;
  v_price INT;
BEGIN
  -- Get tier data
  SELECT 
    tt.dynamic_pricing_enabled,
    tt.price AS base_price,
    tt.total_capacity,
    tt.sold_count,
    tt.reserved_count
  INTO v_tier
  FROM public.ticket_tiers tt
  WHERE tt.id = p_tier_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tier % not found', p_tier_id;
  END IF;
  
  -- If dynamic pricing not enabled, return base price
  IF NOT v_tier.dynamic_pricing_enabled THEN
    RETURN v_tier.base_price;
  END IF;
  
  -- Calculate percent sold (including reserved to prevent race conditions)
  IF v_tier.total_capacity = 0 THEN
    v_percent_sold := 0;
  ELSE
    v_percent_sold := ((v_tier.sold_count + v_tier.reserved_count)::NUMERIC / v_tier.total_capacity::NUMERIC) * 100;
  END IF;
  
  -- Find the matching step (lowest threshold >= current percent_sold)
  SELECT price_cents INTO v_price
  FROM public.dynamic_pricing_rules
  WHERE ticket_tier_id = p_tier_id
    AND capacity_threshold_percent >= v_percent_sold
  ORDER BY capacity_threshold_percent ASC
  LIMIT 1;
  
  -- If no rule matches (shouldn't happen but safety), return base price
  IF v_price IS NULL THEN
    RETURN v_tier.base_price;
  END IF;
  
  RETURN v_price;
END;
$$;

-- ============================================================
-- 16. RPC: materialize_seats
-- ============================================================

CREATE OR REPLACE FUNCTION public.materialize_seats(
  p_event_id UUID,
  p_seat_map_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_layout JSONB;
  v_section JSONB;
  v_row JSONB;
  v_seat JSONB;
  v_section_id UUID;
  v_row_label TEXT;
  v_seat_count INT := 0;
BEGIN
  -- Load the seat map layout
  SELECT layout INTO v_layout
  FROM public.seat_maps
  WHERE id = p_seat_map_id;
  
  IF v_layout IS NULL THEN
    RAISE EXCEPTION 'Seat map % not found', p_seat_map_id;
  END IF;
  
  -- Delete existing seats for this event (in case of re-materialisation)
  DELETE FROM public.seats WHERE event_id = p_event_id;
  
  -- Loop through sections
  FOR v_section IN SELECT * FROM jsonb_array_elements(v_layout->'sections')
  LOOP
    -- Create or find the section
    INSERT INTO public.seat_map_sections (seat_map_id, name, color, sort_order)
    VALUES (
      p_seat_map_id,
      v_section->>'name',
      COALESCE(v_section->>'color', '#4A90E2'),
      COALESCE((v_section->>'sort_order')::INT, 0)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_section_id;
    
    IF v_section_id IS NULL THEN
      SELECT id INTO v_section_id
      FROM public.seat_map_sections
      WHERE seat_map_id = p_seat_map_id AND name = v_section->>'name'
      LIMIT 1;
    END IF;
    
    -- Loop through rows
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_section->'rows')
    LOOP
      v_row_label := v_row->>'label';
      
      -- Loop through seats
      FOR v_seat IN SELECT * FROM jsonb_array_elements(v_row->'seats')
      LOOP
        INSERT INTO public.seats (
          event_id,
          seat_map_section_id,
          row_label,
          seat_number,
          seat_type,
          status,
          x,
          y
        ) VALUES (
          p_event_id,
          v_section_id,
          v_row_label,
          v_seat->>'number',
          COALESCE((v_seat->>'type')::public.seat_type, 'standard'),
          'available',
          COALESCE((v_seat->>'x')::NUMERIC, 0),
          COALESCE((v_seat->>'y')::NUMERIC, 0)
        );
        
        v_seat_count := v_seat_count + 1;
      END LOOP;
    END LOOP;
  END LOOP;
  
  -- Update seat_maps total_seats
  UPDATE public.seat_maps
  SET total_seats = v_seat_count
  WHERE id = p_seat_map_id;
  
  RETURN v_seat_count;
END;
$$;

-- ============================================================
-- 17. RPC: create_seat_reservation
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_seat_reservation(
  p_event_id UUID,
  p_user_id UUID,
  p_seat_ids UUID[],
  p_ttl_minutes INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_seat RECORD;
  v_items JSONB := '[]'::JSONB;
  v_tier_id UUID;
BEGIN
  IF array_length(p_seat_ids, 1) IS NULL OR array_length(p_seat_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No seats selected');
  END IF;
  
  -- Lock all seat rows and verify they're available
  FOR v_seat IN
    SELECT s.id, s.status, s.ticket_tier_id, s.seat_map_section_id
    FROM public.seats s
    WHERE s.id = ANY(p_seat_ids)
      AND s.event_id = p_event_id
    FOR UPDATE
  LOOP
    IF v_seat.status != 'available' THEN
      RETURN jsonb_build_object('success', false, 'error', 'One or more seats are no longer available');
    END IF;
  END LOOP;
  
  -- Verify we locked all requested seats
  IF (SELECT COUNT(*) FROM public.seats WHERE id = ANY(p_seat_ids) AND event_id = p_event_id) != array_length(p_seat_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Some seats not found for this event');
  END IF;
  
  -- Create the reservation
  INSERT INTO public.reservations (
    event_id, user_id, items, status, expires_at
  ) VALUES (
    p_event_id,
    p_user_id,
    jsonb_build_object('seat_ids', to_jsonb(p_seat_ids)),
    'active',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;
  
  -- Mark seats as reserved
  UPDATE public.seats
  SET 
    status = 'reserved',
    reservation_id = v_reservation_id,
    updated_at = NOW()
  WHERE id = ANY(p_seat_ids)
    AND event_id = p_event_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', (NOW() + (p_ttl_minutes || ' minutes')::INTERVAL),
    'seat_count', array_length(p_seat_ids, 1)
  );
END;
$$;

-- ============================================================
-- 18. RPC: join_waitlist
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_event_id UUID,
  p_ticket_tier_id UUID,
  p_user_id UUID,
  p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_position INT;
  v_waitlist_id UUID;
BEGIN
  -- Check if user already on waitlist for this event/tier combo
  IF EXISTS (
    SELECT 1 FROM public.waitlist
    WHERE event_id = p_event_id
      AND COALESCE(ticket_tier_id::text, '') = COALESCE(p_ticket_tier_id::text, '')
      AND user_id = p_user_id
      AND status IN ('waiting', 'notified')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already on waitlist');
  END IF;
  
  -- Get next position
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
  FROM public.waitlist
  WHERE event_id = p_event_id
    AND COALESCE(ticket_tier_id::text, '') = COALESCE(p_ticket_tier_id::text, '');
  
  -- Insert waitlist entry
  INSERT INTO public.waitlist (
    event_id, ticket_tier_id, user_id, quantity_requested, status, position
  ) VALUES (
    p_event_id, p_ticket_tier_id, p_user_id, p_quantity, 'waiting', v_position
  )
  RETURNING id INTO v_waitlist_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'waitlist_id', v_waitlist_id,
    'position', v_position
  );
END;
$$;

-- ============================================================
-- 19. RPC: promote_waitlist
-- ============================================================

CREATE OR REPLACE FUNCTION public.promote_waitlist(
  p_event_id UUID,
  p_ticket_tier_id UUID,
  p_quantity_available INT,
  p_notification_window_minutes INT DEFAULT 15
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_waitlist RECORD;
  v_remaining INT := p_quantity_available;
  v_promoted_count INT := 0;
BEGIN
  -- Find eligible waitlist entries in FIFO order
  FOR v_waitlist IN
    SELECT id, quantity_requested
    FROM public.waitlist
    WHERE event_id = p_event_id
      AND COALESCE(ticket_tier_id::text, '') = COALESCE(p_ticket_tier_id::text, '')
      AND status = 'waiting'
      AND quantity_requested <= v_remaining
    ORDER BY position ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark as notified
    UPDATE public.waitlist
    SET 
      status = 'notified',
      notified_at = NOW()
    WHERE id = v_waitlist.id;
    
    -- Create notification record
    INSERT INTO public.waitlist_notifications (
      waitlist_id, expires_at
    ) VALUES (
      v_waitlist.id,
      NOW() + (p_notification_window_minutes || ' minutes')::INTERVAL
    );
    
    v_remaining := v_remaining - v_waitlist.quantity_requested;
    v_promoted_count := v_promoted_count + 1;
    
    EXIT WHEN v_remaining <= 0;
  END LOOP;
  
  RETURN v_promoted_count;
END;
$$;

-- ============================================================
-- 20. RPC: enter_queue
-- ============================================================

CREATE OR REPLACE FUNCTION public.enter_queue(
  p_event_id UUID,
  p_user_id UUID,
  p_session_id TEXT,
  p_ip_address INET,
  p_position_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_position INT;
  v_queue_id UUID;
BEGIN
  -- Check if IP already has an entry
  IF p_ip_address IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.virtual_queue
    WHERE event_id = p_event_id
      AND ip_address = p_ip_address
      AND status IN ('waiting', 'admitted')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This IP already has a queue entry');
  END IF;
  
  -- Get next position atomically
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
  FROM public.virtual_queue
  WHERE event_id = p_event_id;
  
  -- Insert queue entry
  INSERT INTO public.virtual_queue (
    event_id, user_id, session_id, ip_address, position, status, position_token
  ) VALUES (
    p_event_id, p_user_id, p_session_id, p_ip_address, v_position, 'waiting', p_position_token
  )
  RETURNING id INTO v_queue_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'position', v_position
  );
END;
$$;

-- ============================================================
-- 21. RPC: admit_queue_batch
-- ============================================================

CREATE OR REPLACE FUNCTION public.admit_queue_batch(
  p_event_id UUID,
  p_batch_size INT DEFAULT 50,
  p_admission_window_minutes INT DEFAULT 10
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admitted_count INT;
BEGIN
  WITH next_batch AS (
    SELECT id
    FROM public.virtual_queue
    WHERE event_id = p_event_id
      AND status = 'waiting'
    ORDER BY position ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.virtual_queue vq
  SET 
    status = 'admitted',
    admitted_at = NOW(),
    expires_at = NOW() + (p_admission_window_minutes || ' minutes')::INTERVAL
  FROM next_batch
  WHERE vq.id = next_batch.id;
  
  GET DIAGNOSTICS v_admitted_count = ROW_COUNT;
  
  RETURN v_admitted_count;
END;
$$;

-- ============================================================
-- 22. RPC: expire_stale_squads
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_stale_squads()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  v_squad RECORD;
BEGIN
  FOR v_squad IN
    SELECT id, reservation_id
    FROM public.squads
    WHERE status = 'forming'
      AND expires_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark squad as expired
    UPDATE public.squads
    SET status = 'expired'
    WHERE id = v_squad.id;
    
    -- Mark any unpaid members as timed_out
    UPDATE public.squad_members
    SET status = 'timed_out'
    WHERE squad_id = v_squad.id
      AND status = 'invited';
    
    -- Release the reservation (will trigger reserved_count decrement)
    IF v_squad.reservation_id IS NOT NULL THEN
      UPDATE public.reservations
      SET status = 'cancelled'
      WHERE id = v_squad.reservation_id
        AND status = 'active';
    END IF;
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- ============================================================
-- 23. RPC: expire_stale_queue_admissions
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_stale_queue_admissions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.virtual_queue
  SET status = 'expired'
  WHERE status = 'admitted'
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 24. RPC: expire_waitlist_notifications
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_waitlist_notifications()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  v_notification RECORD;
BEGIN
  FOR v_notification IN
    SELECT wn.id, wn.waitlist_id
    FROM public.waitlist_notifications wn
    WHERE wn.converted = FALSE
      AND wn.expires_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark the waitlist entry as expired
    UPDATE public.waitlist
    SET status = 'expired', expired_at = NOW()
    WHERE id = v_notification.waitlist_id;
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- ============================================================
-- 25. SCHEDULE CRON JOBS
-- ============================================================

-- Expire stale squads every minute
SELECT cron.schedule(
  'expire-stale-squads',
  '* * * * *',
  $$SELECT public.expire_stale_squads()$$
);

-- Admit queue batch every 30 seconds (via minute cron, will run once per minute)
SELECT cron.schedule(
  'admit-queue-batch-all',
  '* * * * *',
  $$
  DO $INNER$
  DECLARE
    v_event RECORD;
  BEGIN
    FOR v_event IN
      SELECT DISTINCT event_id FROM public.virtual_queue WHERE status = 'waiting'
    LOOP
      PERFORM public.admit_queue_batch(v_event.event_id, 50, 10);
    END LOOP;
  END;
  $INNER$;
  $$
);

-- Expire stale queue admissions every minute
SELECT cron.schedule(
  'expire-stale-queue-admissions',
  '* * * * *',
  $$SELECT public.expire_stale_queue_admissions()$$
);

-- Expire waitlist notifications every minute
SELECT cron.schedule(
  'expire-waitlist-notifications',
  '* * * * *',
  $$SELECT public.expire_waitlist_notifications()$$
);

-- ============================================================
-- 26. GRANT EXECUTE PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_current_tier_price TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_tier_price TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_seats TO service_role;
GRANT EXECUTE ON FUNCTION public.create_seat_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_seat_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.join_waitlist TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_waitlist TO service_role;
GRANT EXECUTE ON FUNCTION public.enter_queue TO authenticated;
GRANT EXECUTE ON FUNCTION public.enter_queue TO service_role;
GRANT EXECUTE ON FUNCTION public.admit_queue_batch TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_squads TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_queue_admissions TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_notifications TO service_role;

-- ============================================================
-- DONE. Module 4 database setup complete.
-- ============================================================
