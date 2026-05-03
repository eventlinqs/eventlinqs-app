# EventLinqs - Featured Mini-Rail Spec

**Requirement solved:** the homepage currently shows only one event card (Stripe Test Event). That makes the platform look empty. Competitors show rails of 4-8 events immediately.
**Approach:** populate with 4 cards (1 real test event + 3 "announcement" cards for aspirational festivals), styled as a horizontal mini-rail that previews the scroll-snap rails coming in Session 4.

---

## 1. The Four Seed Cards

| Slot | Event | Type | Status label | Cover image source |
|---|---|---|---|---|
| 1 | Stripe Test Event | Real event, Stripe test mode | `Test Mode` | Your existing upload |
| 2 | Afro Nation Portugal 2026 | Announcement card | `Coming Soon` | Public press photo (hotlinked for dev only, replaced pre-launch) |
| 3 | Homecoming Lagos 2026 | Announcement card | `Coming Soon` | Public press photo (hotlinked for dev only) |
| 4 | Promiseland Festival | Announcement card | `Coming Soon` | Public press photo (hotlinked for dev only) |

### Legal framing for announcement cards

These are NOT ticket listings. They are "we expect this energy on our platform" editorial cards. No tickets sold. No affiliation implied. Card links to a generic `/announcements/coming-soon` page that says something like:

> "EventLinqs is built for this. We're in conversations with diaspora festival organisers now. Want your event here? [Get in touch.]"

This is defensible, honest, and doubles as an organiser-acquisition funnel.

**CRITICAL:** the `CONTENT-PIPELINE-EPIC.md` epic exists precisely to move us off hotlinked images to first-party hosted assets before any public launch. These seed images are dev-only.

---

## 2. Data Model

Announcement cards don't belong in the `events` table - they're not events. Two options:

**Option A (recommended):** add an `announcements` table.
```sql
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  location TEXT,
  expected_date TEXT,               -- freeform, e.g. "July 2026"
  cover_image_url TEXT NOT NULL,
  accent_color TEXT DEFAULT '#FF5E3A',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: anyone can read active announcements, only admin can write
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active announcements" ON announcements
  FOR SELECT USING (is_active = true);
```

**Option B:** hardcode in `lib/seed/announcements.ts` as a typed array. Faster for now, refactor later. For a 7-day "send to friends" timeline, B is acceptable - but leave a `TODO(M11): move to announcements table` comment.

---

## 3. Visual Treatment

The mini-rail is a **preview of Session 4's scroll-snap rail**. Build the component now, reuse in Session 4.

### Layout

- Horizontal strip, 4 cards visible on desktop (≥1280px), 2.5 visible on tablet, 1.5 visible on mobile (scroll-snap)
- Cards are uniform aspect ratio - **3:4 portrait** on mobile, **16:9 landscape** on desktop, matching DICE's responsive card behaviour
- Section header: "Featured this week" (H2) + subcopy "Where the culture's heading" + "View all →" link on the right
- Section surface: `base` (white) - sits between dark hero and alt-surface Trending rail

### Announcement card treatment

Visually differentiate announcement cards from real event cards so users understand what they're seeing:

- Corner badge: `Coming Soon` (on accent background) instead of price
- CTA: `Notify me` (ghost button) instead of `Get tickets`
- Subtle gradient overlay with a small "EventLinqs Coming Soon" watermark in the bottom-right corner
- On click → `/announcements/[slug]` page, not a ticketing flow

### Real event card (Stripe Test Event)

- Price badge: `From AUD 2.00` (reuses existing logic)
- CTA: `Get tickets`
- Corner: `Test Mode` pill (yellow, so you never forget which environment)

---

## 4. Component Spec

```tsx
// components/rails/MiniRail.tsx
// Horizontal scroll-snap rail, 4 cards. Reusable for Trending Now / Culture Picks in Session 4.

import { EventCard } from '@/components/cards/EventCard';
import { AnnouncementCard } from '@/components/cards/AnnouncementCard';

type RailItem =
  | { kind: 'event'; data: Event }
  | { kind: 'announcement'; data: Announcement };

export function MiniRail({
  title,
  subtitle,
  viewAllHref,
  items,
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  items: RailItem[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold">{title}</h2>
          {subtitle && <p className="text-[var(--text-secondary)] mt-1">{subtitle}</p>}
        </div>
        {viewAllHref && (
          <a href={viewAllHref} className="text-[var(--brand-accent)] hover:underline">
            View all →
          </a>
        )}
      </div>

      <div className="
        flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory
        scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0
        pb-4
      ">
        {items.map((item, i) => (
          <div key={i} className="
            snap-start shrink-0
            w-[70%] sm:w-[45%] md:w-[32%] lg:w-[24%]
          ">
            {item.kind === 'event'
              ? <EventCard event={item.data} />
              : <AnnouncementCard announcement={item.data} />
            }
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 5. Claude Code Command - Implement the Mini-Rail

```
Read docs/design/FEATURED-MINI-RAIL-SPEC.md.

Build the featured mini-rail for the homepage:

1. Create an announcements table via Supabase migration (see Section 2 Option A of the spec). Seed it with 3 rows: Afro Nation Portugal 2026, Homecoming Lagos 2026, Promiseland Festival. Use plausible press photo URLs for cover_image_url - mark these as dev placeholders in comments. Each row gets expected_date, location, and a slug.
2. Create /announcements/[slug]/page.tsx - a simple landing page showing the announcement details with a "Get in touch" CTA linking to mailto:hello@eventlinqs.com?subject=EventLinqs%20-%20[slug].
3. Create components/cards/AnnouncementCard.tsx following the visual treatment in Section 3 of the spec. Corner badge "Coming Soon", ghost CTA "Notify me", small "EventLinqs Coming Soon" watermark bottom-right.
4. Create components/rails/MiniRail.tsx per Section 4 of the spec. Horizontal scroll-snap, responsive widths.
5. Update app/page.tsx: replace the current single Featured Event card with <MiniRail title="Featured this week" subtitle="Where the culture's heading" viewAllHref="/events" items={...} />. Fetch the real Stripe Test Event + the 3 announcements and pass them as RailItems.
6. Wrap the mini-rail in <Section surface="base"> from the rhythm system.
7. Run npm run build. Commit: "feat(homepage): featured mini-rail with 4 cards + announcements model".

Do not break the existing Stripe Test Event flow - it must still be purchasable.
```

---

## 6. Session 4 Ties In

The MiniRail component built here becomes the component used for **Trending Now** and **Culture Picks** in Session 4. Same scroll-snap, same responsive widths, different data source and section surface. That's the payoff - we build once, use three times.
