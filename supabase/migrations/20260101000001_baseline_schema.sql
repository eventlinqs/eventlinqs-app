-- =====================================================================
-- 20260101000001_baseline_schema.sql
-- =====================================================================
-- Combined M1/M2/M3/M4 schema baseline. The original SQL lives in
-- docs/modules/ (M1 in M1-foundation.md fenced blocks, M2/M3/M4 as .sql).
-- The Mumbai project was bootstrapped by hand-running those scripts in
-- Supabase Studio. This migration is the runnable baseline so future
-- environments (Sydney 2026-04-26) can apply the full schema via
-- supabase db push --linked instead of clicking through Studio.
-- =====================================================================

-- ============= M1 FOUNDATION (extensions, profiles, organisations) =============
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- User roles
CREATE TYPE public.user_role AS ENUM ('attendee', 'organiser', 'admin', 'super_admin');

-- Organisation status
CREATE TYPE public.org_status AS ENUM ('pending', 'active', 'suspended', 'deactivated');

-- Organisation member role
CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'manager', 'member');
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  role public.user_role NOT NULL DEFAULT 'attendee',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- Index for role-based queries
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  status public.org_status NOT NULL DEFAULT 'pending',
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  stripe_account_id TEXT,
  stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for slug lookups
CREATE INDEX idx_organisations_slug ON public.organisations(slug);

-- Index for owner lookups
CREATE INDEX idx_organisations_owner ON public.organisations(owner_id);

-- Enable RLS
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Organisations are viewable by everyone"
  ON public.organisations FOR SELECT
  USING (status = 'active');

CREATE POLICY "Owners can view their own organisations regardless of status"
  ON public.organisations FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can update their own organisations"
  ON public.organisations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create organisations"
  ON public.organisations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE TABLE public.organisation_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES public.profiles(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate memberships
  UNIQUE(organisation_id, user_id)
);

-- Index for user membership lookups
CREATE INDEX idx_org_members_user ON public.organisation_members(user_id);

-- Index for org membership lookups
CREATE INDEX idx_org_members_org ON public.organisation_members(organisation_id);

-- Enable RLS
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can view their own org memberships"
  ON public.organisation_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Org owners and admins can view all members"
  ON public.organisation_members FOR SELECT
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
    OR
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org owners and admins can manage members"
  ON public.organisation_members FOR ALL
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
    OR
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organisation_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============= M2 EVENT MANAGEMENT (categories, events, ticket_tiers) =============
-- ============================================
-- EventLinqs Module 2: Event Management Database Setup
-- Run this ENTIRE script in Supabase SQL Editor
-- Dashboard → SQL Editor → New query → Paste → Run
-- ============================================

-- 1.1 Event Categories
CREATE TABLE public.event_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.event_categories (name, slug, icon, sort_order) VALUES
  ('Music', 'music', 'music', 1),
  ('Sports', 'sports', 'trophy', 2),
  ('Arts & Culture', 'arts-culture', 'palette', 3),
  ('Food & Drink', 'food-drink', 'utensils', 4),
  ('Business & Networking', 'business-networking', 'briefcase', 5),
  ('Education', 'education', 'graduation-cap', 6),
  ('Charity', 'charity', 'heart', 7),
  ('Nightlife', 'nightlife', 'moon', 8),
  ('Family', 'family', 'users', 9),
  ('Technology', 'technology', 'cpu', 10),
  ('Religion', 'religion', 'church', 11),
  ('Fashion', 'fashion', 'shirt', 12),
  ('Health & Wellness', 'health-wellness', 'activity', 13),
  ('Community', 'community', 'home', 14),
  ('Festival', 'festival', 'sparkles', 15),
  ('Film', 'film', 'film', 16),
  ('Other', 'other', 'grid', 17);

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are viewable by everyone"
  ON public.event_categories FOR SELECT
  USING (is_active = true);

-- 1.2 Event Enums
CREATE TYPE public.event_status AS ENUM (
  'draft', 'scheduled', 'published', 'paused', 'postponed', 'cancelled', 'completed'
);

CREATE TYPE public.event_visibility AS ENUM ('public', 'private', 'unlisted');
CREATE TYPE public.event_type AS ENUM ('in_person', 'virtual', 'hybrid');

-- 1.2 Events Table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  category_id UUID REFERENCES public.event_categories(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  is_multi_day BOOLEAN NOT NULL DEFAULT FALSE,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,
  parent_event_id UUID REFERENCES public.events(id),
  event_type public.event_type NOT NULL DEFAULT 'in_person',
  venue_name TEXT,
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_country TEXT,
  venue_postal_code TEXT,
  venue_latitude DECIMAL(10, 8),
  venue_longitude DECIMAL(11, 8),
  venue_place_id TEXT,
  virtual_url TEXT,
  cover_image_url TEXT,
  thumbnail_url TEXT,
  gallery_urls JSONB DEFAULT '[]',
  status public.event_status NOT NULL DEFAULT 'draft',
  visibility public.event_visibility NOT NULL DEFAULT 'public',
  published_at TIMESTAMPTZ,
  scheduled_publish_at TIMESTAMPTZ,
  is_age_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  age_restriction_min INT DEFAULT 18,
  max_capacity INT,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organisation_id, slug),
  CHECK (end_date > start_date)
);

CREATE INDEX idx_events_org ON public.events(organisation_id);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_category ON public.events(category_id);
CREATE INDEX idx_events_start_date ON public.events(start_date);
CREATE INDEX idx_events_slug ON public.events(slug);
CREATE INDEX idx_events_visibility ON public.events(visibility);
CREATE INDEX idx_events_city ON public.events(venue_city);
CREATE INDEX idx_events_country ON public.events(venue_country);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published public events are viewable by everyone"
  ON public.events FOR SELECT
  USING (status = 'published' AND visibility = 'public');

CREATE POLICY "Unlisted published events are viewable"
  ON public.events FOR SELECT
  USING (status = 'published' AND visibility = 'unlisted');

CREATE POLICY "Org members can view their events"
  ON public.events FOR SELECT
  USING (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
    OR
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create events"
  ON public.events FOR INSERT
  WITH CHECK (
    organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
    OR
    organisation_id IN (
      SELECT organisation_id FROM public.organisation_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Org members can update events"
  ON public.events FOR UPDATE
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

CREATE POLICY "Org owners can delete draft events"
  ON public.events FOR DELETE
  USING (
    status = 'draft'
    AND organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
  );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 1.3 Ticket Tiers
CREATE TYPE public.ticket_tier_type AS ENUM (
  'general_admission', 'vip', 'vvip', 'early_bird', 'group', 'student', 'table_booth', 'donation', 'free'
);

CREATE TABLE public.ticket_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tier_type public.ticket_tier_type NOT NULL DEFAULT 'general_admission',
  price INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AUD',
  total_capacity INT NOT NULL,
  sold_count INT NOT NULL DEFAULT 0,
  reserved_count INT NOT NULL DEFAULT 0,
  sale_start TIMESTAMPTZ,
  sale_end TIMESTAMPTZ,
  min_per_order INT NOT NULL DEFAULT 1,
  max_per_order INT NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_tiers_event ON public.ticket_tiers(event_id);

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Visible tiers for published events are viewable"
  ON public.ticket_tiers FOR SELECT
  USING (
    is_visible = true
    AND is_active = true
    AND event_id IN (
      SELECT id FROM public.events WHERE status = 'published'
    )
  );

CREATE POLICY "Org members can view all tiers"
  ON public.ticket_tiers FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisations o ON e.organisation_id = o.id
      WHERE o.owner_id = auth.uid()
    )
    OR
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisation_members om ON e.organisation_id = om.organisation_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can manage tiers"
  ON public.ticket_tiers FOR ALL
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisations o ON e.organisation_id = o.id
      WHERE o.owner_id = auth.uid()
    )
    OR
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisation_members om ON e.organisation_id = om.organisation_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 1.4 Event Add-ons
CREATE TABLE public.event_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AUD',
  total_capacity INT,
  sold_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_addons_event ON public.event_addons(event_id);

ALTER TABLE public.event_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active addons for published events are viewable"
  ON public.event_addons FOR SELECT
  USING (
    is_active = true
    AND event_id IN (SELECT id FROM public.events WHERE status = 'published')
  );

CREATE POLICY "Org members can manage addons"
  ON public.event_addons FOR ALL
  USING (
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisations o ON e.organisation_id = o.id
      WHERE o.owner_id = auth.uid()
    )
    OR
    event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.organisation_members om ON e.organisation_id = om.organisation_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.event_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2.1 Storage Bucket for Event Images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

CREATE POLICY "Authenticated users can upload event images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Anyone can view event images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

CREATE POLICY "Users can delete their own event images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- DONE. All M2 tables, policies, and storage created.
-- ============================================

-- ============= M3 CHECKOUT and PAYMENTS (orders, payments, squads, reservations) =============
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
-- Note: pg_cron must be enabled in Supabase Dashboard, Database, Extensions.
-- This block is idempotent: it skips silently if pg_cron is not yet enabled.
-- Re-run the cron.schedule statement manually after enabling pg_cron.
DO $cron_wrap$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-stale-reservations',
      '* * * * *',
      $body$SELECT public.expire_stale_reservations()$body$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled; skipping cron schedule "expire-stale-reservations".';
  END IF;
END
$cron_wrap$;

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

-- ============= M4 TICKETING ENGINE (venues, seats, tickets) =============
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

-- Schedule M4 cron jobs — gated on pg_cron being enabled.
DO $cron_wrap$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-stale-squads',
      '* * * * *',
      $body$SELECT public.expire_stale_squads()$body$
    );
    PERFORM cron.schedule(
      'admit-queue-batch-all',
      '* * * * *',
      $body$
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
      $body$
    );
    PERFORM cron.schedule(
      'expire-stale-queue-admissions',
      '* * * * *',
      $body$SELECT public.expire_stale_queue_admissions()$body$
    );
    PERFORM cron.schedule(
      'expire-waitlist-notifications',
      '* * * * *',
      $body$SELECT public.expire_waitlist_notifications()$body$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled; skipping M4 cron schedules.';
  END IF;
END
$cron_wrap$;

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

-- ============= Festival and Film categories patch =============
-- Add Festival and Film categories (missing from initial seed)
-- Run in Supabase SQL Editor → New query → Paste → Run

INSERT INTO public.event_categories (name, slug, icon, sort_order)
VALUES
  ('Festival', 'festival', 'sparkles', 15),
  ('Film',     'film',     'film',      16)
ON CONFLICT (slug) DO NOTHING;

-- Shift 'Other' to the end
UPDATE public.event_categories SET sort_order = 17 WHERE slug = 'other';
