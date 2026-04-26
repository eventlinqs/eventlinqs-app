# Module 2: Event Management

**Status:** Not Started  
**Depends on:** Module 1 (Foundation) - must be complete  
**Priority:** Critical - this is the core product  
**Estimated Sessions:** 4-6 (with Claude Code)

---

## Overview

Module 2 turns EventLinqs from a login page into an event platform. This module delivers: event creation with a rich builder, event categories, venue/location handling with Google Maps, the full event lifecycle state machine (Draft → Published → Completed/Cancelled), ticket tier management, event visibility controls, the organiser's event management dashboard, and the public-facing event discovery and detail pages.

No payment processing in this module - that comes in Module 3 (Checkout & Payments). Here we build the event data layer, the creation experience, and the browsing experience.

---

## Part 1: Database Schema (SQL - run in Supabase SQL Editor)

### 1.1 Event Categories Seed Table

```sql
-- Event categories
CREATE TABLE public.event_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT, -- Lucide icon name
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed categories from Scope v5
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
```

### 1.2 Events Table

```sql
-- Event status enum
CREATE TYPE public.event_status AS ENUM (
  'draft', 'scheduled', 'published', 'paused', 'postponed', 'cancelled', 'completed'
);

-- Event visibility enum
CREATE TYPE public.event_visibility AS ENUM ('public', 'private', 'unlisted');

-- Event type enum
CREATE TYPE public.event_type AS ENUM ('in_person', 'virtual', 'hybrid');

-- Events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core details
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT, -- Rich text (HTML)
  summary TEXT, -- Short plain text summary for cards
  
  -- Organisation & ownership
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  
  -- Category
  category_id UUID REFERENCES public.event_categories(id),
  
  -- Date & time
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  is_multi_day BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Recurring events (null if not recurring)
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT, -- iCal RRULE format
  parent_event_id UUID REFERENCES public.events(id), -- links recurring instances to parent
  
  -- Location
  event_type public.event_type NOT NULL DEFAULT 'in_person',
  venue_name TEXT,
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_country TEXT,
  venue_postal_code TEXT,
  venue_latitude DECIMAL(10, 8),
  venue_longitude DECIMAL(11, 8),
  venue_place_id TEXT, -- Google Maps place ID
  virtual_url TEXT, -- streaming link (revealed after purchase)
  
  -- Media
  cover_image_url TEXT,
  thumbnail_url TEXT, -- auto-generated smaller version
  gallery_urls JSONB DEFAULT '[]', -- array of image URLs
  
  -- Status & visibility
  status public.event_status NOT NULL DEFAULT 'draft',
  visibility public.event_visibility NOT NULL DEFAULT 'public',
  published_at TIMESTAMPTZ,
  scheduled_publish_at TIMESTAMPTZ, -- for scheduled publishing
  
  -- Settings
  is_age_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  age_restriction_min INT DEFAULT 18,
  max_capacity INT, -- total event capacity (null = unlimited)
  
  -- Metadata
  tags JSONB DEFAULT '[]', -- array of tag strings
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(organisation_id, slug),
  CHECK (end_date > start_date)
);

-- Indexes
CREATE INDEX idx_events_org ON public.events(organisation_id);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_category ON public.events(category_id);
CREATE INDEX idx_events_start_date ON public.events(start_date);
CREATE INDEX idx_events_slug ON public.events(slug);
CREATE INDEX idx_events_visibility ON public.events(visibility);
CREATE INDEX idx_events_city ON public.events(venue_city);
CREATE INDEX idx_events_country ON public.events(venue_country);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Public can view published public events
CREATE POLICY "Published public events are viewable by everyone"
  ON public.events FOR SELECT
  USING (status = 'published' AND visibility = 'public');

-- Unlisted events viewable by anyone with the link (they know the slug)
CREATE POLICY "Unlisted published events are viewable"
  ON public.events FOR SELECT
  USING (status = 'published' AND visibility = 'unlisted');

-- Org owners/members can view all their org's events (any status)
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

-- Org owners/members can create events
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

-- Org owners/members can update events
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

-- Org owners can delete draft events only
CREATE POLICY "Org owners can delete draft events"
  ON public.events FOR DELETE
  USING (
    status = 'draft'
    AND organisation_id IN (
      SELECT id FROM public.organisations WHERE owner_id = auth.uid()
    )
  );

-- Apply updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

### 1.3 Ticket Tiers Table

```sql
-- Ticket tier type enum
CREATE TYPE public.ticket_tier_type AS ENUM (
  'general_admission', 'vip', 'vvip', 'early_bird', 'group', 'student', 'table_booth', 'donation', 'free'
);

CREATE TABLE public.ticket_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  
  -- Tier details
  name TEXT NOT NULL,
  description TEXT,
  tier_type public.ticket_tier_type NOT NULL DEFAULT 'general_admission',
  
  -- Pricing (in smallest currency unit - cents)
  price INT NOT NULL DEFAULT 0, -- 0 = free
  currency TEXT NOT NULL DEFAULT 'AUD',
  
  -- Capacity
  total_capacity INT NOT NULL,
  sold_count INT NOT NULL DEFAULT 0,
  reserved_count INT NOT NULL DEFAULT 0,
  
  -- Scheduling
  sale_start TIMESTAMPTZ, -- null = available immediately when event published
  sale_end TIMESTAMPTZ, -- null = available until event starts
  
  -- Settings
  min_per_order INT NOT NULL DEFAULT 1,
  max_per_order INT NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_tiers_event ON public.ticket_tiers(event_id);

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

-- Public can view active tiers for published events
CREATE POLICY "Visible tiers for published events are viewable"
  ON public.ticket_tiers FOR SELECT
  USING (
    is_visible = true
    AND is_active = true
    AND event_id IN (
      SELECT id FROM public.events WHERE status = 'published'
    )
  );

-- Org members can view all tiers for their events
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

-- Org members can manage tiers
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
```

### 1.4 Event Add-ons Table

```sql
CREATE TABLE public.event_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL DEFAULT 0, -- cents
  currency TEXT NOT NULL DEFAULT 'AUD',
  total_capacity INT, -- null = unlimited
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
```

---

## Part 2: Image Upload (Supabase Storage)

### 2.1 Create Storage Bucket (run in SQL Editor)

```sql
-- Create storage bucket for event images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880, -- 5MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload event images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-images'
    AND auth.role() = 'authenticated'
  );

-- Allow public to view event images
CREATE POLICY "Anyone can view event images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

-- Allow uploaders to delete their own images
CREATE POLICY "Users can delete their own event images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## Part 3: Organisation Setup Flow (Claude Code builds this)

Before an organiser can create events, they need an organisation. This is a simple setup flow for users who don't have one yet.

### 3.1 Create Organisation Page

Create `src/app/(dashboard)/dashboard/organisation/create/page.tsx`:

A form with fields:
- Organisation name (required)
- Slug (auto-generated from name, editable)
- Description (optional textarea)
- Website (optional)
- Email (optional, defaults to user email)
- Phone (optional)

On submit:
1. Validate slug is unique (query organisations table)
2. Insert into `organisations` table with `owner_id = current user`
3. Insert into `organisation_members` with role = 'owner'
4. Update current user's profile `role` to 'organiser'
5. Redirect to `/dashboard/organisation`

### 3.2 Organisation Dashboard

Update `src/app/(dashboard)/dashboard/organisation/page.tsx`:

- If user has no organisation → show "Create Organisation" CTA
- If user has organisation → show org details, member count, event count
- Link to "Create Event" button

---

## Part 4: Event Builder (Claude Code builds this)

### 4.1 Create Event Page

Create `src/app/(dashboard)/dashboard/events/create/page.tsx`

This is a multi-step form (tabbed or stepped layout):

**Step 1 - Basic Details:**
- Title (required, text input)
- Summary (short text, max 200 chars)
- Description (rich text editor - use a textarea with markdown support for now, rich text editor can be enhanced later)
- Category (dropdown from event_categories table)
- Tags (comma-separated input, stored as JSON array)

**Step 2 - Date & Time:**
- Start date + time (datetime picker)
- End date + time (datetime picker)
- Timezone (dropdown, default to user's timezone)
- Multi-day toggle
- Recurring toggle (if checked, show recurrence options: daily, weekly, monthly)

**Step 3 - Location:**
- Event type toggle: In Person / Virtual / Hybrid
- If In Person or Hybrid:
  - Venue name (text input)
  - Address (Google Maps autocomplete - use a text input for now, Google Maps integration can be enhanced later with API key)
  - City, State, Country, Postal Code (auto-filled from address or manual entry)
  - Latitude/Longitude (auto-filled from address)
- If Virtual or Hybrid:
  - Virtual URL (text input - note: this is hidden from attendees until after purchase)

**Step 4 - Cover Image:**
- Image upload dropzone (drag & drop or click to browse)
- Upload to Supabase Storage bucket `event-images`
- Store path as `{user_id}/{event_id}/{filename}`
- Preview after upload
- Max 5MB, accepts JPEG/PNG/WebP

**Step 5 - Tickets:**
- "Add Ticket Tier" button
- For each tier:
  - Name (e.g., "General Admission", "VIP")
  - Type (dropdown from ticket_tier_type enum)
  - Price (number input in dollars - convert to cents on save)
  - Currency (dropdown, default AUD)
  - Total Capacity (number input)
  - Sale Start date (optional)
  - Sale End date (optional)
  - Min per order (default 1)
  - Max per order (default 10)
- Can add multiple tiers
- Can reorder tiers (drag or up/down buttons)
- Can delete tiers

**Step 6 - Settings:**
- Visibility: Public / Private / Unlisted (radio buttons)
- Age restriction toggle (if on, show min age input, default 18)
- Max event capacity (optional - overrides sum of tier capacities)

**Step 7 - Review & Publish:**
- Summary of all entered data
- Two buttons:
  - "Save as Draft" → saves with status 'draft'
  - "Publish Now" → saves with status 'published' and sets `published_at = NOW()`
  - "Schedule" → saves with status 'scheduled' and sets `scheduled_publish_at`

### 4.2 Slug Generation

Auto-generate slug from title using:
- Lowercase
- Replace spaces with hyphens
- Remove special characters
- Append random 6-char string for uniqueness (e.g., `summer-music-fest-a3b2c1`)

### 4.3 Image Upload Utility

Create `src/lib/upload.ts`:

```typescript
import { createClient } from '@/lib/supabase/client'

export async function uploadEventImage(
  file: File,
  userId: string,
  eventId: string
): Promise<string | null> {
  const supabase = createClient()
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${eventId}/${Date.now()}.${fileExt}`

  const { error } = await supabase.storage
    .from('event-images')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  const { data } = supabase.storage
    .from('event-images')
    .getPublicUrl(fileName)

  return data.publicUrl
}
```

---

## Part 5: Event Lifecycle State Machine (Claude Code builds this)

### 5.1 State Transitions

Create `src/lib/event-lifecycle.ts`:

Implement allowed transitions:

| Current State | Allowed Next States |
|---|---|
| draft | scheduled, published, deleted |
| scheduled | published, draft, deleted |
| published | paused, postponed, cancelled, completed |
| paused | published, cancelled |
| postponed | published (with new date), cancelled |
| cancelled | (terminal) |
| completed | (terminal) |

The function should:
- Validate the transition is allowed
- Update the event status
- Set `published_at` when transitioning to 'published'
- Return success/error

### 5.2 Server Actions for Event Management

Create `src/app/(dashboard)/dashboard/events/actions.ts`:

Server actions for:
- `createEvent(formData)` - insert event + ticket tiers + addons
- `updateEvent(eventId, formData)` - update event details
- `publishEvent(eventId)` - transition to published
- `pauseEvent(eventId)` - transition to paused
- `cancelEvent(eventId)` - transition to cancelled
- `duplicateEvent(eventId)` - clone event with new slug, status = draft
- `deleteEvent(eventId)` - soft delete (only drafts)

---

## Part 6: Organiser Event List (Claude Code builds this)

### 6.1 My Events Page

Update `src/app/(dashboard)/dashboard/events/page.tsx`:

- Fetch all events for the user's organisation
- Display as a table/list with columns: Title, Date, Status, Tickets Sold, Actions
- Status shown as colored badges (Draft = grey, Published = green, Cancelled = red, etc.)
- Filter tabs: All | Draft | Published | Past | Cancelled
- "Create Event" button in the header
- Each row has actions: Edit | Duplicate | View | Publish/Pause/Cancel (context-dependent)

### 6.2 Edit Event Page

Create `src/app/(dashboard)/dashboard/events/[id]/edit/page.tsx`:

- Same form as create, but pre-populated with existing event data
- Fetch event by ID, verify ownership
- Save updates via `updateEvent` server action
- If event is published, show warning that changes are live immediately

---

## Part 7: Public Event Pages (Claude Code builds this)

### 7.1 Event Discovery / Listing Page

Create `src/app/events/page.tsx`:

- Server-side rendered page
- Fetch published, public events ordered by start_date
- Display as responsive card grid (2 cols on tablet, 3 on desktop)
- Each card shows: cover image, title, date, venue/city, price range (min ticket price), category badge
- Filter sidebar or top bar:
  - Category filter (from event_categories)
  - Date filter (Today, This Week, This Month, Custom range)
  - Location/City filter
  - Free events only toggle
- Search bar at top (search by title)
- Pagination (12 events per page)

### 7.2 Event Detail Page

Create `src/app/events/[slug]/page.tsx`:

- Server-side rendered with dynamic metadata for SEO
- Fetch event by slug (must be published)
- Display:
  - Cover image (full width hero)
  - Title, date/time (formatted nicely with timezone)
  - Venue name and address (with static map image or text for now)
  - Category badge
  - Age restriction notice (if applicable)
  - Description (rendered HTML/markdown)
  - Tags
  - Organisation name with link
- Ticket section:
  - List all visible, active ticket tiers
  - Show name, price, availability status
  - "Sold Out" badge if sold_count >= total_capacity
  - "Select Tickets" button (links to checkout - placeholder for now, Module 3)
- Share buttons (copy link)
- If event is private → show "This is a private event" if user doesn't have access
- If event is cancelled → show cancellation notice
- If event is completed → show "This event has ended"

### 7.3 SEO Metadata

The event detail page should generate dynamic metadata:

```typescript
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  // Fetch event and return title, description, og:image
}
```

---

## Part 8: TypeScript Types (Claude Code builds this)

Add to `src/types/database.ts`:

```typescript
export type EventStatus = 'draft' | 'scheduled' | 'published' | 'paused' | 'postponed' | 'cancelled' | 'completed'
export type EventVisibility = 'public' | 'private' | 'unlisted'
export type EventType = 'in_person' | 'virtual' | 'hybrid'
export type TicketTierType = 'general_admission' | 'vip' | 'vvip' | 'early_bird' | 'group' | 'student' | 'table_booth' | 'donation' | 'free'

export interface EventCategory {
  id: string
  name: string
  slug: string
  icon: string | null
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface Event {
  id: string
  title: string
  slug: string
  description: string | null
  summary: string | null
  organisation_id: string
  created_by: string
  category_id: string | null
  start_date: string
  end_date: string
  timezone: string
  is_multi_day: boolean
  is_recurring: boolean
  recurrence_rule: string | null
  parent_event_id: string | null
  event_type: EventType
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  venue_postal_code: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  venue_place_id: string | null
  virtual_url: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[]
  status: EventStatus
  visibility: EventVisibility
  published_at: string | null
  scheduled_publish_at: string | null
  is_age_restricted: boolean
  age_restriction_min: number | null
  max_capacity: number | null
  tags: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined data
  category?: EventCategory
  organisation?: Organisation
  ticket_tiers?: TicketTier[]
}

export interface TicketTier {
  id: string
  event_id: string
  name: string
  description: string | null
  tier_type: TicketTierType
  price: number
  currency: string
  total_capacity: number
  sold_count: number
  reserved_count: number
  sale_start: string | null
  sale_end: string | null
  min_per_order: number
  max_per_order: number
  sort_order: number
  is_visible: boolean
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EventAddon {
  id: string
  event_id: string
  name: string
  description: string | null
  price: number
  currency: string
  total_capacity: number | null
  sold_count: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
```

---

## Completion Checklist

When Module 2 is complete, every item below must be true:

- [ ] Event categories seeded in database (15 categories)
- [ ] Events table with all columns, indexes, and RLS policies
- [ ] Ticket tiers table with RLS policies
- [ ] Event addons table with RLS policies
- [ ] Supabase Storage bucket `event-images` created with upload policies
- [ ] Organisation creation flow works (name, slug, auto-assigns owner role)
- [ ] Event builder creates events with all fields (7-step form)
- [ ] Slug auto-generated from title with uniqueness
- [ ] Image upload works to Supabase Storage
- [ ] Ticket tiers can be added/removed during event creation
- [ ] Event saves as draft or publishes immediately
- [ ] Event lifecycle transitions work (publish, pause, cancel)
- [ ] Organiser event list shows all their events with status filters
- [ ] Edit event page pre-populates and saves changes
- [ ] Duplicate event creates a draft copy
- [ ] Public event listing page shows published events with filters
- [ ] Event detail page shows all event info and ticket tiers
- [ ] SEO metadata generated dynamically for event pages
- [ ] TypeScript types match database schema
- [ ] `npm run build` passes with zero errors

---

## How To Execute This Module

### Step 1: Run the SQL

Download the combined SQL file (provided separately). Open Supabase → SQL Editor → New query → paste → Run. This creates the event_categories, events, ticket_tiers, event_addons tables and the storage bucket.

### Step 2: Open Claude Code

In PowerShell:

```powershell
cd ~\OneDrive\Desktop\EventLinqs\eventlinqs-app
claude
```

This opens Claude Code. It reads CLAUDE.md automatically.

### Step 3: Give Claude Code the command

Paste this:

```
Read docs/modules/M2-event-management.md and build everything in Parts 3, 4, 5, 6, 7, and 8. The database SQL and storage bucket have already been created manually in Supabase. Start with Part 3 (organisation setup) and work through each part in order. Use server actions for all mutations. Build the event creation as a multi-step form.
```

### Step 4: Test

After Claude Code finishes:
1. Run `npm run dev`
2. Log in at `/login`
3. Go to `/dashboard/organisation/create` - create an organisation
4. Go to `/dashboard/events/create` - create a test event with a cover image and ticket tiers
5. Publish the event
6. Visit `/events` - your event should appear in the listing
7. Click the event - full detail page should load

### Step 5: Commit

```powershell
git add .
git commit -m "M2: Event Management - builder, lifecycle, listings, detail pages"
git push
```

---

## To Return to Claude Code Later

Any time you need to open Claude Code again:

1. Open PowerShell
2. Navigate to the project: `cd ~\OneDrive\Desktop\EventLinqs\eventlinqs-app`
3. Type `claude` and press Enter
4. It opens, reads CLAUDE.md, and you're ready to give it commands
5. To exit Claude Code, type `/exit` and press Enter
6. You're back in PowerShell

---

## What Comes After Module 2

**Module 3: Checkout & Payments** - Stripe integration, cart system, checkout flow, order processing, payment confirmation, ticket issuance with QR codes, and the organiser payout dashboard.
