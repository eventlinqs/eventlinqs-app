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
  ('Other', 'other', 'grid', 15);

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
