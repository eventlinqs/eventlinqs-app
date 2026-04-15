# EventLinqs — Session 4 Scope Lock: Event Rails

**Session name:** Event Rails (Trending Now + Culture Picks)
**Pre-reqs:** Production Readiness charter live, Button & Rhythm system deployed, Mini-Rail component built (from this session)
**Estimated duration:** 3-4 hours
**Deliverable:** homepage has 3 horizontal scroll-snap rails driven by real data

---

## 1. What Ships in Session 4

The MiniRail component is already built (this session). Session 4 extends it into two new contexts and adds the data/ranking logic.

### Rail 1 — Featured This Week
Already built this session. Leave as-is.

### Rail 2 — Trending Now
- Data source: events sorted by ticket velocity over last 7 days
- Ranking: `(tickets_sold_last_7d / hours_since_published) DESC`, tie-break by social share count
- Minimum threshold: event must have ≥ 5 tickets sold in last 7 days to qualify
- Fallback when not enough events qualify: show "newest published in last 30 days"
- Section surface: `alt` (off-white)
- Title: "Trending now"
- Subcopy: "Moving fast this week"

### Rail 3 — Culture Picks
- Data source: editorially tagged events (add `is_culture_pick` boolean to events table)
- Admin-curated only — no algorithm
- Section surface: `base` (white) — sits between Trending (alt) and City Guide (alt)
- Title: "Culture picks"
- Subcopy: "Editor's selection"

### Optional if time permits
- Rail 4 — "In your city" (location-based, uses user's geolocation with consent)

---

## 2. Data Model Additions

```sql
-- Add ranking-support columns to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS tickets_sold_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_culture_pick BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS culture_pick_sort_order INTEGER DEFAULT 0;

-- Denormalised ticket count — updated by trigger on ticket purchase
CREATE INDEX IF NOT EXISTS idx_events_trending ON events (tickets_sold_count DESC, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_events_culture_picks ON events (culture_pick_sort_order)
  WHERE is_culture_pick = true AND status = 'published';
```

Trigger (on successful ticket purchase in M3 flow): increment `events.tickets_sold_count`.

---

## 3. Ranking RPC

```sql
CREATE OR REPLACE FUNCTION get_trending_events(p_limit INTEGER DEFAULT 8)
RETURNS SETOF events
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM events
  WHERE status = 'published'
    AND published_at > now() - interval '30 days'
    AND event_start > now()
  ORDER BY
    (tickets_sold_count::float / GREATEST(EXTRACT(EPOCH FROM (now() - published_at)) / 3600, 1)) DESC,
    published_at DESC
  LIMIT p_limit;
$$;
```

---

## 4. Session 4 Claude Code Command

```
Read docs/epics/SESSION-4-EVENT-RAILS.md and docs/design/FEATURED-MINI-RAIL-SPEC.md.

Build the Trending Now and Culture Picks rails on the homepage:

1. Create a Supabase migration adding the columns in Section 2 of the Session 4 doc.
2. Create the get_trending_events RPC per Section 3.
3. Add a trigger that increments events.tickets_sold_count on ticket purchase (look at M3 checkout success handler).
4. In app/page.tsx, add two new rails below the existing Featured rail:
   - <Section surface="alt"><MiniRail title="Trending now" subtitle="Moving fast this week" items={trendingItems} viewAllHref="/events?sort=trending" /></Section>
   - <Section surface="base"><MiniRail title="Culture picks" subtitle="Editor's selection" items={culturePickItems} viewAllHref="/events?filter=culture-picks" /></Section>
5. Fetch trending data via the RPC, culture picks via a simple filter on is_culture_pick = true.
6. Add an admin toggle on the event edit page for is_culture_pick (gated to admin users only).
7. Update /events page to honour ?sort=trending and ?filter=culture-picks query params.
8. Run npm run build. Commit: "feat(homepage): trending + culture picks rails".

Do not break the Featured mini-rail or the Stripe Test Event flow.
```

---

## 5. Session 4 Success Criteria

- [ ] Homepage shows 3 rails, all with 4+ cards visible on desktop
- [ ] Rails scroll-snap on mobile with momentum
- [ ] Trending logic verifiable — buy 3 tickets on an event, refresh homepage, it moves up
- [ ] Admin can mark an event as "culture pick" and it appears in that rail
- [ ] `/events?sort=trending` works
- [ ] All Production Readiness charter items still pass

---

# First-Party Media Pipeline Epic

**Separate deliverable — scoping document only. Build starts after Session 4.**

---

## 1. The Problem

Right now, announcement card images, stock photos on marketing pages, and any placeholder imagery come from third-party URLs (press photos, Unsplash, etc.). In production that's unacceptable:

- **Legal:** hotlinking copyrighted press photos is infringement even if public
- **Reliability:** external URLs 404 without warning, break page layouts
- **Performance:** external CDNs don't respect our caching
- **Brand:** stock photography makes the platform look generic

Every image on the platform must be a first-party hosted asset with a clear license trail.

---

## 2. Scope of the Epic

### 2.1 Asset categories

| Category | Volume | License | Source |
|---|---|---|---|
| Marketing imagery (homepage hero, about page, city landing pages) | ~50 images | EventLinqs-owned | Commissioned photoshoots OR paid stock (Shutterstock/Adobe) |
| Announcement cards (aspirational festivals pre-launch) | 3-10 images | Licensed or commissioned illustration | NOT hotlinked press photos |
| Organiser default avatars | ~20 pattern variants | EventLinqs-owned | Procedurally generated SVG patterns |
| City imagery (`/melbourne`, `/sydney`) | ~10 images | Licensed from local photographers or paid stock | |
| Event covers | User-generated | Organiser-uploaded | Already handled by MEDIA-UPLOAD-SPEC |
| Category illustrations | ~15 SVGs | EventLinqs-owned | Commission a set |

### 2.2 Storage and delivery

- **Primary storage:** Supabase Storage bucket `brand-assets` (private bucket, signed URLs for admin management)
- **Public delivery:** Supabase Storage public bucket `public-media` for anything user-facing
- **CDN:** rely on Supabase's edge cache + Vercel's Image Optimization
- **Naming convention:** `{category}/{descriptor}-{YYYY-MM-DD}.{ext}` e.g. `marketing/homepage-hero-2026-04-15.webp`

### 2.3 License tracking

Every non-user-generated asset gets a row in a new `brand_assets` table:

```sql
CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,                -- "commissioned", "adobe_stock", "shutterstock", "unsplash_plus"
  license_type TEXT NOT NULL,          -- "owned", "royalty_free", "editorial_only", "cc_by"
  license_reference TEXT,              -- invoice number, Unsplash asset ID, photographer contract ref
  usage_rights TEXT,                   -- "all commercial", "web only", "no modification"
  purchased_at DATE,
  expires_at DATE,                     -- for time-limited licenses
  created_at TIMESTAMPTZ DEFAULT now()
);
```

If an asset isn't in this table, it does not go on the platform.

---

## 3. Commissioning Plan (concrete next steps)

### Phase 1 — Pre-launch essentials (budget: AUD 500-1,500)
- 5 high-quality Afrobeats/diaspora-scene photos (paid stock or commissioned local Melbourne photographer)
- 3 illustrated announcement card designs for Afro Nation / Homecoming / Promiseland replacements
- 1 hero video (already live, but verify license — is the current video first-party or stock?)

### Phase 2 — Post-launch polish (budget: AUD 2,000-5,000)
- Custom illustration set for event categories (Nightlife, Culture, Community, Wedding, Comedy, Concert)
- City photography for Melbourne, Sydney, London (starting markets)
- Organiser branding toolkit (social share templates)

### Phase 3 — Scale (ongoing)
- Per-city photography as we expand
- Updated category and marketing imagery each year
- Photographer partnership programme (organiser events get shot by approved photographers, images flow into our asset library with consent)

---

## 4. Process for Replacing Existing Third-Party Images

1. Audit every `<Image>` and `<img>` in the codebase
2. For each, classify: user-generated OR first-party needed OR acceptable (CSS gradient, SVG icon, etc.)
3. For "first-party needed," queue in Phase 1 or Phase 2
4. Replace in bulk: upload to `public-media`, update references, add to `brand_assets` table
5. Delete old references; deploy

---

## 5. Definition of Done for This Epic

- [ ] `brand_assets` table exists and is populated for every non-user image on the platform
- [ ] No `<img>` tag anywhere in the codebase points to a domain other than `{supabase-project}.supabase.co` or an approved CDN
- [ ] License documentation is retrievable for every asset within 60 seconds (via admin panel)
- [ ] The 3 announcement cards use commissioned illustrations, not press photos
- [ ] Homepage hero video has a verifiable license
- [ ] Every marketing page loads only from first-party or licensed sources

---

## 6. When This Epic Starts

**Not this session. Not Session 4.** This is a ~AUD 1,500 cash outlay and 2-3 weeks of sourcing/integration work. It starts **after** Session 4 ships *and* before any public marketing push.

Target window: **early May 2026** — which means starting asset sourcing the week friends get the invite (so real media lands before any wider announcement).
