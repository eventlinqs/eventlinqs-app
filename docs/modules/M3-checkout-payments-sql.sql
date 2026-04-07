-- ============================================================
-- EventLinqs Module 3: Checkout & Payments — Combined SQL
-- ============================================================
-- Run this entire file in Supabase → SQL Editor → New query → Run
-- Prerequisites: M1 and M2 SQL must have been run first
-- ============================================================

-- ============================================================
-- 1. CUSTOM TYPES (ENUMS)
-- ============================================================

-- Order status
CREATE TYPE public.order_status AS ENUM (
  'pending',
  'confirmed',
  'partially_refunded',
  'refunded',
  'cancelled',
  'expired'
);

-- Payment status (full state machine from Scope v5)
CREATE TYPE public.payment_status AS ENUM (
  'initiated',
  'processing',
  'requires_action',
  'completed',
  'failed',
  'expired',
  'cancelled',
  'refund_pending',
  'refunded',
  'refund_failed'
);

-- Payment gateway
CREATE TYPE public.payment_gateway AS ENUM (
  'stripe',
  'paystack',
  'flutterwave',
  'paypal'
);

-- Reservation status
CREATE TYPE public.reservation_status AS ENUM (
  'active',
  'converted',
  'expired',
  'cancelled'
);

-- Discount type
CREATE TYPE public.discount_type AS ENUM (
  'percentage',
  'fixed_amount'
);

-- Fee pass type (organiser choice)
CREATE TYPE public.fee_pass_type AS ENUM (
  'absorb',
  'pass_to_buyer'
);

-- ============================================================
-- 2. ADD fee_pass_type TO EVENTS TABLE
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS fee_pass_type public.fee_pass_type NOT NULL DEFAULT 'pass_to_buyer';

-- ============================================================
-- 3. ORDERS TABLE
-- ============================================================

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Order identification
  order_number TEXT NOT NULL UNIQUE, -- Format: EL-XXXXXXXX

  -- Relationships
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for guest orders
  reservation_id UUID, -- Set after reservation is created

  -- Guest checkout fields
  guest_email TEXT, -- Email for guest orders
  guest_name TEXT,  -- Name for guest orders

  -- Status
  status public.order_status NOT NULL DEFAULT 'pending',

  -- Financial
  subtotal_cents INT NOT NULL DEFAULT 0,         -- Ticket prices total
  addon_total_cents INT NOT NULL DEFAULT 0,      -- Addon prices total
  platform_fee_cents INT NOT NULL DEFAULT 0,     -- EventLinqs fee
  processing_fee_cents INT NOT NULL DEFAULT 0,   -- Stripe/gateway fee
  tax_cents INT NOT NULL DEFAULT 0,              -- GST/VAT
  discount_cents INT NOT NULL DEFAULT 0,         -- Discount reduction
  total_cents INT NOT NULL DEFAULT 0,            -- What buyer pays
  currency TEXT NOT NULL DEFAULT 'AUD',
  fee_pass_type public.fee_pass_type NOT NULL DEFAULT 'pass_to_buyer',

  -- Discount
  discount_code_id UUID, -- FK added after discount_codes table

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- For pending orders that should auto-expire

  -- Constraints
  CONSTRAINT orders_must_have_buyer CHECK (
    user_id IS NOT NULL OR guest_email IS NOT NULL
  )
);

-- Indexes
CREATE INDEX idx_orders_event ON public.orders(event_id);
CREATE INDEX idx_orders_organisation ON public.orders(organisation_id);
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_order_number ON public.orders(order_number);
CREATE INDEX idx_orders_guest_email ON public.orders(guest_email) WHERE guest_email IS NOT NULL;
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Buyers can view their own orders
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

-- Guest orders are viewable by order_number (handled in app logic via secure token)
-- No RLS policy for guests — accessed via server-side query with order_id

-- Org owners/admins can view orders for their events
CREATE POLICY "Org members can view event orders"
  ON public.orders FOR SELECT
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
    OR
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Only system (service role) creates/updates orders
CREATE POLICY "Service role manages orders"
  ON public.orders FOR ALL
  USING (auth.role() = 'service_role');

-- Updated at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 4. ORDER ITEMS TABLE
-- ============================================================

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- What was purchased
  ticket_tier_id UUID REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  addon_id UUID REFERENCES public.event_addons(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('ticket', 'addon')),
  item_name TEXT NOT NULL, -- Snapshot of tier/addon name at purchase time

  -- Quantity and pricing (snapshot at purchase time)
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,

  -- Attendee info (one row per ticket, not per quantity)
  attendee_first_name TEXT,
  attendee_last_name TEXT,
  attendee_email TEXT,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT order_items_type_check CHECK (
    (item_type = 'ticket' AND ticket_tier_id IS NOT NULL AND addon_id IS NULL)
    OR
    (item_type = 'addon' AND addon_id IS NOT NULL AND ticket_tier_id IS NULL)
  )
);

-- Indexes
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_tier ON public.order_items(ticket_tier_id);
CREATE INDEX idx_order_items_addon ON public.order_items(addon_id);

-- RLS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Same access as orders — buyers see their own, org members see their events'
CREATE POLICY "Users can view their own order items"
  ON public.order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view event order items"
  ON public.order_items FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR o.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

CREATE POLICY "Service role manages order items"
  ON public.order_items FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 5. PAYMENTS TABLE
-- ============================================================

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,

  -- Gateway info
  gateway public.payment_gateway NOT NULL DEFAULT 'stripe',
  gateway_payment_id TEXT, -- Stripe's pi_xxx ID
  gateway_customer_id TEXT, -- Stripe's cus_xxx if applicable

  -- State machine
  status public.payment_status NOT NULL DEFAULT 'initiated',

  -- Financial
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD',

  -- Stripe-specific
  client_secret TEXT, -- For frontend confirmation
  receipt_url TEXT,

  -- Error handling
  failure_reason TEXT,
  failure_code TEXT,

  -- Gateway raw response (for debugging)
  gateway_response JSONB NOT NULL DEFAULT '{}',

  -- Idempotency
  idempotency_key TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT payments_amount_positive CHECK (amount_cents >= 0)
);

-- Indexes
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_gateway_id ON public.payments(gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_idempotency ON public.payments(idempotency_key);

-- RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payments"
  ON public.payments FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view event payments"
  ON public.payments FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.organisation_id IN (
        SELECT id FROM public.organisations WHERE owner_id = auth.uid()
      )
      OR o.organisation_id IN (
        SELECT organisation_id FROM public.organisation_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
      )
    )
  );

CREATE POLICY "Service role manages payments"
  ON public.payments FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 6. RESERVATIONS TABLE
-- ============================================================

CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Who made the reservation
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT, -- For guest users (browser session ID)

  -- Status
  status public.reservation_status NOT NULL DEFAULT 'active',

  -- What is reserved (JSONB array of items)
  items JSONB NOT NULL DEFAULT '[]',
  -- Structure: [{ "ticket_tier_id": "uuid", "quantity": 2 }, { "addon_id": "uuid", "quantity": 1 }]

  -- Timing
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT reservations_has_owner CHECK (
    user_id IS NOT NULL OR session_id IS NOT NULL
  )
);

-- Indexes
CREATE INDEX idx_reservations_event ON public.reservations(event_id);
CREATE INDEX idx_reservations_user ON public.reservations(user_id);
CREATE INDEX idx_reservations_status ON public.reservations(status);
CREATE INDEX idx_reservations_expires ON public.reservations(expires_at) WHERE status = 'active';
CREATE INDEX idx_reservations_session ON public.reservations(session_id) WHERE session_id IS NOT NULL;

-- RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reservations"
  ON public.reservations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages reservations"
  ON public.reservations FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 7. DISCOUNT CODES TABLE
-- ============================================================

CREATE TABLE public.discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  -- Code
  code TEXT NOT NULL, -- Uppercase, alphanumeric + hyphens
  discount_type public.discount_type NOT NULL,
  discount_value NUMERIC(10, 2) NOT NULL, -- Percentage (1-100) or fixed amount in cents

  -- Currency (required for fixed_amount)
  currency TEXT, -- NULL for percentage type

  -- Usage limits
  max_uses INT, -- NULL = unlimited
  max_uses_per_user INT NOT NULL DEFAULT 1,
  current_uses INT NOT NULL DEFAULT 0,

  -- Minimum order value
  min_order_amount_cents INT, -- NULL = no minimum

  -- Tier restrictions
  applicable_tier_ids UUID[], -- NULL = applies to all tiers

  -- Validity period
  valid_from TIMESTAMPTZ,  -- NULL = immediately active
  valid_until TIMESTAMPTZ, -- NULL = no expiry

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique code per event
  CONSTRAINT discount_codes_unique_per_event UNIQUE (event_id, code),

  -- Validate discount value ranges
  CONSTRAINT discount_codes_value_check CHECK (
    (discount_type = 'percentage' AND discount_value > 0 AND discount_value <= 100)
    OR
    (discount_type = 'fixed_amount' AND discount_value > 0)
  ),

  -- Currency required for fixed amount
  CONSTRAINT discount_codes_currency_check CHECK (
    discount_type = 'percentage' OR currency IS NOT NULL
  )
);

-- Indexes
CREATE INDEX idx_discount_codes_event ON public.discount_codes(event_id);
CREATE INDEX idx_discount_codes_org ON public.discount_codes(organisation_id);
CREATE INDEX idx_discount_codes_code ON public.discount_codes(code);
CREATE INDEX idx_discount_codes_active ON public.discount_codes(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Org members can manage discount codes
CREATE POLICY "Org members can manage discount codes"
  ON public.discount_codes FOR ALL
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
    OR
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Service role for checkout validation
CREATE POLICY "Service role manages discount codes"
  ON public.discount_codes FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Now add FK from orders to discount_codes
ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_code_fk
  FOREIGN KEY (discount_code_id) REFERENCES public.discount_codes(id) ON DELETE SET NULL;

-- ============================================================
-- 8. DISCOUNT CODE USAGES TABLE
-- ============================================================

CREATE TABLE public.discount_code_usages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discount_code_id UUID NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_email TEXT,
  discount_applied_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One usage record per order
  CONSTRAINT discount_usages_unique_order UNIQUE (discount_code_id, order_id)
);

-- Indexes
CREATE INDEX idx_discount_usages_code ON public.discount_code_usages(discount_code_id);
CREATE INDEX idx_discount_usages_user ON public.discount_code_usages(user_id);
CREATE INDEX idx_discount_usages_order ON public.discount_code_usages(order_id);

-- RLS
ALTER TABLE public.discount_code_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages discount usages"
  ON public.discount_code_usages FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 9. PRICING RULES TABLE
-- ============================================================

CREATE TABLE public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Rule identification
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'platform_fee_percentage',
    'platform_fee_fixed',
    'instant_payout_fee',
    'resale_fee',
    'featured_listing',
    'subscription_price'
  )),

  -- Scope (most specific match wins)
  country_code TEXT NOT NULL DEFAULT 'GLOBAL', -- ISO 3166-1 alpha-2 or 'GLOBAL'
  currency TEXT NOT NULL DEFAULT 'AUD',
  event_type TEXT NOT NULL DEFAULT 'ALL', -- or specific event_type enum value
  organiser_tier TEXT NOT NULL DEFAULT 'ALL', -- 'standard', 'premium', or 'ALL'

  -- Value
  value NUMERIC(10, 4) NOT NULL, -- Percentage (e.g. 2.5) or fixed amount in cents
  value_type TEXT NOT NULL CHECK (value_type IN ('percentage', 'fixed')),

  -- Versioning
  version INT NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ, -- NULL = currently active

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate active rules for same scope
  CONSTRAINT pricing_rules_no_active_duplicates UNIQUE (
    rule_type, country_code, event_type, organiser_tier, version
  )
);

-- Indexes
CREATE INDEX idx_pricing_rules_type ON public.pricing_rules(rule_type);
CREATE INDEX idx_pricing_rules_country ON public.pricing_rules(country_code);
CREATE INDEX idx_pricing_rules_active ON public.pricing_rules(effective_from, effective_until);

-- RLS
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

-- Everyone can read pricing rules (needed for fee calculation)
CREATE POLICY "Pricing rules are readable by everyone"
  ON public.pricing_rules FOR SELECT
  USING (true);

-- Only admins/service role can modify
CREATE POLICY "Service role manages pricing rules"
  ON public.pricing_rules FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 10. TAX RULES TABLE
-- ============================================================

CREATE TABLE public.tax_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Scope
  country_code TEXT NOT NULL, -- ISO 3166-1 alpha-2
  state_code TEXT, -- For countries with state-level tax (e.g., US states)
  tax_name TEXT NOT NULL, -- 'GST', 'VAT', 'Sales Tax'
  tax_rate NUMERIC(5, 4) NOT NULL, -- e.g., 0.1000 for 10% GST

  -- Applicability
  applies_to_platform_fees BOOLEAN NOT NULL DEFAULT FALSE, -- Does tax apply to our fees?
  applies_to_ticket_price BOOLEAN NOT NULL DEFAULT TRUE,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tax rules are readable by everyone"
  ON public.tax_rules FOR SELECT
  USING (true);

CREATE POLICY "Service role manages tax rules"
  ON public.tax_rules FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 11. SEED DATA: PRICING RULES
-- ============================================================
-- All fees are database-driven. NO HARDCODED VALUES IN CODE.
-- These are the launch defaults. Admin panel (M12) can change them.

-- Platform fee: percentage per ticket
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type) VALUES
  -- GLOBAL default
  ('platform_fee_percentage', 'GLOBAL', 'AUD', 2.5000, 'percentage'),
  -- Australia
  ('platform_fee_percentage', 'AU', 'AUD', 2.5000, 'percentage'),
  -- United Kingdom
  ('platform_fee_percentage', 'GB', 'GBP', 2.5000, 'percentage'),
  -- United States
  ('platform_fee_percentage', 'US', 'USD', 2.5000, 'percentage'),
  -- Nigeria
  ('platform_fee_percentage', 'NG', 'NGN', 2.5000, 'percentage'),
  -- Ghana
  ('platform_fee_percentage', 'GH', 'GHS', 2.5000, 'percentage'),
  -- Kenya
  ('platform_fee_percentage', 'KE', 'KES', 2.5000, 'percentage'),
  -- South Africa
  ('platform_fee_percentage', 'ZA', 'ZAR', 2.5000, 'percentage');

-- Platform fee: fixed per ticket (in cents of local currency)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type) VALUES
  ('platform_fee_fixed', 'GLOBAL', 'AUD', 50, 'fixed'), -- $0.50 AUD
  ('platform_fee_fixed', 'AU', 'AUD', 50, 'fixed'),     -- $0.50 AUD
  ('platform_fee_fixed', 'GB', 'GBP', 40, 'fixed'),     -- £0.40 GBP
  ('platform_fee_fixed', 'US', 'USD', 50, 'fixed'),     -- $0.50 USD
  ('platform_fee_fixed', 'NG', 'NGN', 10000, 'fixed'),  -- ₦100 NGN
  ('platform_fee_fixed', 'GH', 'GHS', 500, 'fixed'),    -- GHS 5.00
  ('platform_fee_fixed', 'KE', 'KES', 5000, 'fixed'),   -- KES 50.00
  ('platform_fee_fixed', 'ZA', 'ZAR', 1000, 'fixed');   -- R10.00 ZAR

-- Instant payout fee (percentage on top of payout amount)
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type) VALUES
  ('instant_payout_fee', 'GLOBAL', 'AUD', 1.0000, 'percentage');

-- Resale market fee
INSERT INTO public.pricing_rules (rule_type, country_code, currency, value, value_type) VALUES
  ('resale_fee', 'GLOBAL', 'AUD', 5.0000, 'percentage');

-- ============================================================
-- 12. SEED DATA: TAX RULES
-- ============================================================

INSERT INTO public.tax_rules (country_code, tax_name, tax_rate, applies_to_platform_fees, applies_to_ticket_price) VALUES
  ('AU', 'GST', 0.1000, TRUE, TRUE),   -- 10% GST on everything
  ('GB', 'VAT', 0.2000, TRUE, TRUE),   -- 20% VAT
  ('ZA', 'VAT', 0.1500, TRUE, TRUE),   -- 15% VAT
  ('KE', 'VAT', 0.1600, TRUE, TRUE),   -- 16% VAT
  ('GH', 'VAT', 0.1500, TRUE, TRUE),   -- 15% VAT (simplified, Ghana has tiers)
  ('NG', 'VAT', 0.0750, TRUE, TRUE);   -- 7.5% VAT

-- US has state-level sales tax — not seeded here, handled per-state in Module 5
-- For M3, US orders have zero tax until state-level tax engine is built

-- ============================================================
-- 13. ORDER NUMBER GENERATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- No I, O, 0, 1 (avoid confusion)
  result TEXT := 'EL-';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;

  -- Check uniqueness
  WHILE EXISTS (SELECT 1 FROM public.orders WHERE order_number = result) LOOP
    result := 'EL-';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- 14. RESERVATION CREATION FUNCTION (CONCURRENCY-SAFE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_event_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]',
  p_ttl_minutes INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
  v_available INT;
  v_tier_record RECORD;
BEGIN
  -- Validate at least one item
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items in reservation');
  END IF;

  -- Cancel any existing active reservations for this user/session on this event
  UPDATE public.reservations
  SET status = 'cancelled'
  WHERE event_id = p_event_id
    AND status = 'active'
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_session_id IS NOT NULL AND session_id = p_session_id)
    );

  -- Release reserved counts from cancelled reservations
  -- (handled by the trigger below)

  -- Check availability for each ticket tier item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Only process ticket items (not addons)
    IF v_item ? 'ticket_tier_id' THEN
      v_tier_id := (v_item->>'ticket_tier_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;

      -- Lock the tier row and check availability
      SELECT
        tt.total_capacity - tt.sold_count - tt.reserved_count AS available
      INTO v_available
      FROM public.ticket_tiers tt
      WHERE tt.id = v_tier_id
        AND tt.is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket tier not found or inactive');
      END IF;

      IF v_available < v_quantity THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Only %s tickets available for this tier', v_available)
        );
      END IF;

      -- Increment reserved count
      UPDATE public.ticket_tiers
      SET reserved_count = reserved_count + v_quantity
      WHERE id = v_tier_id;
    END IF;
  END LOOP;

  -- Create the reservation
  INSERT INTO public.reservations (
    event_id, user_id, session_id, items, status, expires_at
  ) VALUES (
    p_event_id,
    p_user_id,
    p_session_id,
    p_items,
    'active',
    NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', (NOW() + (p_ttl_minutes || ' minutes')::INTERVAL)
  );
END;
$$;

-- ============================================================
-- 15. RESERVATION EXPIRY FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_stale_reservations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count INT := 0;
  v_reservation RECORD;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
BEGIN
  -- Find and expire stale reservations
  FOR v_reservation IN
    SELECT id, items
    FROM public.reservations
    WHERE status = 'active'
      AND expires_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Release reserved counts
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_reservation.items)
    LOOP
      IF v_item ? 'ticket_tier_id' THEN
        v_tier_id := (v_item->>'ticket_tier_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        UPDATE public.ticket_tiers
        SET reserved_count = GREATEST(reserved_count - v_quantity, 0)
        WHERE id = v_tier_id;
      END IF;
    END LOOP;

    -- Mark as expired
    UPDATE public.reservations
    SET status = 'expired'
    WHERE id = v_reservation.id;

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

-- Schedule the cleanup cron job (runs every minute)
-- Note: pg_cron must be enabled in Supabase Dashboard → Database → Extensions
SELECT cron.schedule(
  'expire-stale-reservations',
  '* * * * *',
  $$SELECT public.expire_stale_reservations()$$
);

-- ============================================================
-- 16. RESERVATION CANCELLATION TRIGGER
-- ============================================================
-- When a reservation is cancelled, release the reserved inventory

CREATE OR REPLACE FUNCTION public.on_reservation_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
BEGIN
  -- Only fire when status changes to 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status = 'active' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(OLD.items)
    LOOP
      IF v_item ? 'ticket_tier_id' THEN
        v_tier_id := (v_item->>'ticket_tier_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;

        UPDATE public.ticket_tiers
        SET reserved_count = GREATEST(reserved_count - v_quantity, 0)
        WHERE id = v_tier_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reservation_cancelled_trigger
  AFTER UPDATE ON public.reservations
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status = 'active')
  EXECUTE FUNCTION public.on_reservation_cancelled();

-- ============================================================
-- 17. PAYMENT STATE MACHINE TRANSITION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.transition_payment_status(
  p_payment_id UUID,
  p_new_status public.payment_status,
  p_gateway_data JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status public.payment_status;
  v_valid BOOLEAN := FALSE;
BEGIN
  -- Get current status with lock
  SELECT status INTO v_current_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  -- Validate transition
  v_valid := CASE v_current_status
    WHEN 'initiated' THEN p_new_status IN ('processing', 'expired', 'cancelled')
    WHEN 'processing' THEN p_new_status IN ('completed', 'failed', 'requires_action')
    WHEN 'requires_action' THEN p_new_status IN ('completed', 'failed', 'expired')
    WHEN 'completed' THEN p_new_status IN ('refund_pending')
    WHEN 'failed' THEN p_new_status IN ('initiated') -- retry
    WHEN 'refund_pending' THEN p_new_status IN ('refunded', 'refund_failed')
    WHEN 'refund_failed' THEN p_new_status IN ('refund_pending') -- retry
    ELSE FALSE -- expired, cancelled, refunded are terminal
  END;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid payment transition: % → %', v_current_status, p_new_status;
  END IF;

  -- Perform the transition
  UPDATE public.payments
  SET
    status = p_new_status,
    gateway_response = COALESCE(p_gateway_data, gateway_response),
    completed_at = CASE WHEN p_new_status = 'completed' THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE id = p_payment_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 18. ORDER CONFIRMATION FUNCTION
-- ============================================================
-- Called when payment succeeds: confirms order, converts reservation, updates inventory

CREATE OR REPLACE FUNCTION public.confirm_order(
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_reservation RECORD;
  v_item JSONB;
  v_tier_id UUID;
  v_quantity INT;
BEGIN
  -- Lock and get the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Skip if already confirmed
  IF v_order.status = 'confirmed' THEN
    RETURN TRUE;
  END IF;

  -- Confirm the order
  UPDATE public.orders
  SET
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Convert the reservation if one exists
  IF v_order.reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE id = v_order.reservation_id
    FOR UPDATE;

    IF FOUND AND v_reservation.status = 'active' THEN
      -- Move from reserved to sold
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_reservation.items)
      LOOP
        IF v_item ? 'ticket_tier_id' THEN
          v_tier_id := (v_item->>'ticket_tier_id')::UUID;
          v_quantity := (v_item->>'quantity')::INT;

          UPDATE public.ticket_tiers
          SET
            sold_count = sold_count + v_quantity,
            reserved_count = GREATEST(reserved_count - v_quantity, 0)
          WHERE id = v_tier_id;
        END IF;
      END LOOP;

      -- Mark reservation as converted
      UPDATE public.reservations
      SET
        status = 'converted',
        converted_at = NOW()
      WHERE id = v_order.reservation_id;
    END IF;
  END IF;

  -- Update discount code usage count
  IF v_order.discount_code_id IS NOT NULL THEN
    UPDATE public.discount_codes
    SET current_uses = current_uses + 1
    WHERE id = v_order.discount_code_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 19. GRANT EXECUTE PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION public.create_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_reservations TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_payment_status TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_order TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_order_number TO service_role;

-- ============================================================
-- DONE. Module 3 database setup complete.
-- ============================================================
