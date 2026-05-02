# EventLinqs Homepage - Live Data Wiring Checklist

> This is the authoritative list of every piece of dynamic data on the homepage and exactly how it must be wired. When Claude Code builds M4.5, this document is the acceptance test for "is every number real?"

---

## Rule 1 - No hardcoded numbers anywhere

Every integer, percentage, date, price, city count, or "sold today" figure on the homepage MUST come from a live query. If it can't be queried yet, the element hides rather than showing a placeholder.

## Rule 2 - Zero values hide the element

Never show "0 events live now", "0 tickets sold today", "0 upcoming events". Always hide the container entirely when the value is 0.

## Rule 3 - Every query lives server-side

No client-side data fetching for M4.5 homepage. All counts fetched in the server component `src/app/page.tsx` and passed as props. Fresh on every page load. No stale caches for counts.

---

## The five wiring tasks

### Task 1 - Live count strip in hero ("156 events live · 23 cities · This week")

**File:** `src/app/page.tsx`

**Add these queries** alongside the existing ones:

```ts
const nowIso = new Date().toISOString()

const { count: liveEventCount } = await supabase
  .from('events')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'published')
  .eq('visibility', 'public')
  .gte('start_date', nowIso)

const { data: cityRows } = await supabase
  .from('events')
  .select('venue_city')
  .eq('status', 'published')
  .eq('visibility', 'public')
  .gte('start_date', nowIso)
  .not('venue_city', 'is', null)

const uniqueCitiesCount = new Set(
  (cityRows ?? []).map(r => r.venue_city?.trim().toLowerCase()).filter(Boolean)
).size
```

**Pass to FeaturedEventHero:**

```tsx
<FeaturedEventHero
  slides={carouselSlides}
  liveEventCount={liveEventCount ?? 0}
  uniqueCitiesCount={uniqueCitiesCount}
/>
```

**Inside FeaturedEventHero - hide rule:**

```tsx
{liveEventCount >= 10 && (
  <div className="live-count">
    <span className="ring" />
    {liveEventCount} events live now
    <span className="divider" />
    {uniqueCitiesCount} {uniqueCitiesCount === 1 ? 'city' : 'cities'}
    <span className="divider" />
    This week
  </div>
)}
```

**Threshold:** hide entirely if `liveEventCount < 10`. Avoids embarrassing low-count states at launch.

---

### Task 2 - "X tickets sold today" on ribbon card

**File:** `src/app/page.tsx`

**Add query for each carousel slide's event:**

```ts
const todayStart = new Date()
todayStart.setUTCHours(0, 0, 0, 0)

async function getTicketsSoldToday(eventId: string): Promise<number> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'completed')
    .gte('created_at', todayStart.toISOString())
  return count ?? 0
}

// Enrich each carousel slide
const enrichedSlides = await Promise.all(
  carouselEvents.map(async (event) => ({
    ...event,
    ticketsSoldToday: await getTicketsSoldToday(event.id),
  }))
)
```

**Display rule inside the ribbon card:**

```tsx
{event.ticketsSoldToday > 0 && (
  <div className="hero-card-live">
    <span className="pulse-dot" />
    {event.ticketsSoldToday} tickets sold today
  </div>
)}
```

**Critical:** if `ticketsSoldToday === 0`, the entire row (including the coral pulse dot) must be absent from the DOM. Not hidden with CSS - not rendered at all.

---

### Task 3 - Hero carousel slides (3-5 slides, real events)

**File:** `src/app/page.tsx`

**Add query:**

```ts
// Qualifying events for hero carousel
const { data: carouselCandidates } = await supabase
  .from('events')
  .select(`
    id, slug, title, start_date, venue_name, venue_city, venue_country,
    cover_image_url, video_url,
    organisation:organisations(name, slug),
    ticket_tiers(price_cents, total_capacity, sold_count),
    category:event_categories(name, slug),
    is_homepage_featured, created_at
  `)
  .eq('status', 'published')
  .eq('visibility', 'public')
  .gte('start_date', nowIso)
  .or(`is_homepage_featured.eq.true,created_at.gte.${fortyEightHoursAgo}`)
  .order('start_date', { ascending: true })
  .limit(10)

// Score and rank: featured flag wins, then selling fast, then newest
const carouselSlides = (carouselCandidates ?? [])
  .map(e => ({
    ...e,
    score: scoreForCarousel(e), // custom function
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 5)

// If fewer than 3 events qualify, pad with category highlight slides
while (carouselSlides.length < 3) {
  carouselSlides.push(buildCategoryHighlightSlide(/* ... */))
}
```

**Source of truth:** the function `scoreForCarousel` weights: `is_homepage_featured` (+100), `percent_sold > 70` (+50), `created_at < 48h` (+25), `start_date < 7d` (+20).

**Padding rule:** if fewer than 3 qualifying real events exist, carousel pads with category highlight slides (hardcoded in `src/lib/content/category-highlights.ts`) like "This week in Afrobeats", "Free events this weekend". Never fewer than 3 slides.

---

### Task 4 - City photos via Pexels

**New file:** `src/lib/images/city-photo.ts`

Mirror `category-photo.ts` pattern exactly:

```ts
import { unstable_cache } from 'next/cache'

const CITY_QUERIES: Record<string, string> = {
  melbourne: 'Melbourne Australia skyline night',
  sydney: 'Sydney Australia harbour bridge',
  brisbane: 'Brisbane skyline Australia',
  perth: 'Perth Australia skyline',
  adelaide: 'Adelaide Australia',
  auckland: 'Auckland New Zealand skyline',
  london: 'London England skyline Big Ben',
  manchester: 'Manchester England city',
  toronto: 'Toronto Canada skyline CN Tower',
  'new-york': 'New York Manhattan skyline',
  houston: 'Houston Texas skyline',
  atlanta: 'Atlanta Georgia skyline',
  lagos: 'Lagos Nigeria Victoria Island',
  accra: 'Accra Ghana city',
}

async function fetchCityPhotoFromPexels(citySlug: string): Promise<string | null> {
  const query = CITY_QUERIES[citySlug] ?? citySlug
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return null

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`,
    { headers: { Authorization: apiKey } }
  )
  if (!res.ok) return null

  const data = await res.json()
  return data?.photos?.[0]?.src?.large ?? null
}

export const getCityPhoto = unstable_cache(
  fetchCityPhotoFromPexels,
  ['city-photo'],
  { revalidate: 86400 } // 24h cache
)
```

**Fallback:** when Pexels returns null (no API key or no match), the existing `/public/cities/[slug].svg` brand-coloured placeholder is used. The component accepts `imageSrc` and doesn't care about the source.

**Wire into `src/app/page.tsx`:**

```ts
const cityCounts = await Promise.all(
  CITY_TILES.map(async t => {
    const [{ count }, photo] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true })
        .eq('status', 'published').eq('visibility', 'public')
        .gte('start_date', nowIso).ilike('venue_city', `%${t.slug}%`),
      getCityPhoto(t.slug),
    ])
    return {
      ...t,
      count: count ?? 0,
      imageSrc: photo ?? `/cities/${t.slug}.svg`,
    }
  })
)
```

---

### Task 5 - Social proof organiser logos (real query, hide when < 6)

**File:** `src/app/page.tsx`

**Add query:**

```ts
const { data: featuredOrganisers } = await supabase
  .from('organisations')
  .select('id, slug, name, logo_url')
  .eq('status', 'active')
  .not('logo_url', 'is', null)
  .order('created_at', { ascending: false })
  .limit(12)

const showSocialProof = (featuredOrganisers?.length ?? 0) >= 6
```

**Pass to component:**

```tsx
{showSocialProof && (
  <SocialProofLogos organisers={featuredOrganisers} />
)}
```

**Critical:** if fewer than 6 organisers have logos, the ENTIRE social proof section does not render. Not hidden with CSS - not rendered at all. Empty social proof is worse than no social proof.

**Each logo renders as:**

```tsx
<Link href={`/organisers/${organiser.slug}`} className="proof-logo">
  {organiser.logo_url ? (
    <Image src={organiser.logo_url} alt={organiser.name} width={120} height={40} />
  ) : (
    // Wordmark fallback
    <span>{organiser.name.split(' ').join('\n')}</span>
  )}
</Link>
```

---

### Task 6 - Testimonial rotation

**New file:** `src/lib/content/testimonials.ts`

```ts
export type Testimonial = {
  quote: string
  organiser: string
  eventTitle: string
  eventSlug?: string
  initials: string
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'Sold 450 tickets for Afrobeats All Night in 48 hours. The squad booking feature alone converted 30% more group sales than our last platform.',
    organiser: 'Tasknora',
    eventTitle: 'Afrobeats Melbourne Summer Sessions',
    eventSlug: 'afrobeats-melbourne-summer-sessions',
    initials: 'TN',
  },
  // Additional testimonials as organisers share them
]

export function getRotatingTestimonial(): Testimonial | null {
  if (TESTIMONIALS.length === 0) return null
  const index = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % TESTIMONIALS.length
  return TESTIMONIALS[index]
}
```

**Usage in `src/app/page.tsx`:**

```ts
const testimonial = getRotatingTestimonial()
```

**Component hides if null:**

```tsx
{testimonial && <TestimonialCard testimonial={testimonial} />}
```

**Migration path:** when we move testimonials to Supabase (M6+), swap the constants import for a Supabase query. Component interface stays the same.

---

## Acceptance test for "every number is real"

Before M4.5 is merged, run this checklist against production:

1. Open homepage. View source. **Search for hardcoded numbers like "247", "156", "23", "412", "89"**. None should appear except in CSS (px values, rem, etc.).
2. Clear all events in a staging Supabase. Reload homepage. **Every section that depends on data must hide gracefully:**
   - Hero: if no qualifying events, falls back to 3 category highlight slides
   - Live count strip: hides (< 10 events)
   - Bento: shows empty state with "List your event" CTA
   - This Week rail: hides entirely
   - Cultural Picks: entire section hides if all tabs empty
   - Live Vibe marquee: shows fallback generic signals
   - By City: each city shows "Coming soon" instead of 0
   - Social proof: hides entirely (< 6 organisers)
   - For Organisers: unchanged (static content)
3. Create one published event in Supabase. Reload. **Verify the event appears in the correct sections and nowhere it shouldn't.**
4. Complete 5 orders on that event. Reload. **"5 tickets sold today" appears on the ribbon card.**
5. Set the clock forward 24 hours. Reload. **"5 tickets sold today" disappears** (back to 0 = hidden).

---

## Summary - what "live, linked, smart" means for M4.5

**Live:** every count, every price, every timestamp comes from Supabase or Redis on page load.

**Linked:** every clickable element has a real destination URL, not `href="#"`.

**Smart:**
- Zero states hide instead of showing zeros
- Empty sections hide entirely instead of rendering empty containers
- Thresholds prevent embarrassing low-count states at launch (< 10 events hides count strip, < 6 organisers hides proof section, < 3 carousel candidates pads with category slides)
- Every real data element has a hardcoded fallback for the graceful-degradation case

**When this checklist is complete, nothing on the homepage is fake.** Every "247 tickets sold today" is real. Every "156 events live" is real. Every city photo is real. Every organiser logo is real. Every testimonial is real.

That is the bar. That is what ships in M4.5.
