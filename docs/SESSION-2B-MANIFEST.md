# SESSION 2B - DIAGNOSTIC REPORT + SCOPE MANIFEST

**Project:** EventLinqs
**Executor:** Claude Code (Opus 4.7, xhigh effort) across 3 parallel terminal tabs
**Repo:** github.com/eventlinqs/eventlinqs-app
**Branch:** main (review locally before push, no auto-commits)
**Standard:** Silicon Valley grade. Benchmark: Stripe Dashboard, Linear, Airbnb, DICE, Ticketmaster.

---

## HOW TO EXECUTE

Three parallel streams, different files, no collisions. Open three PowerShell tabs with Claude Code in each, paste the matching stream prompt per tab, they run simultaneously. Lawal reviews outputs, runs local smoke test, commits and pushes as three commits (or one - his call).

- **Stream A** - Backend & Data
- **Stream B** - Auth & Dashboard
- **Stream C** - Public Site Polish

---

# PART 1 - DIAGNOSTIC REPORT

Every finding below is confirmed from a direct read of the main branch.

## 1.1 Dashboard is not production-quality
**File:** `src/app/(dashboard)/dashboard/page.tsx`
Three grey cards on grey background, no identity. Needs complete rebuild to Stripe/Linear/Notion standard.

## 1.2 Dashboard logo does not link home
**File:** `src/components/dashboard/dashboard-nav.tsx` line 32
`href="/dashboard"` should be `href="/"`. Colour is blue, should be ink-900 with gold hover.

## 1.3 Dashboard nav has no gold hover
Same file, lines 37-55. Uses `text-gray-700 hover:text-gray-900`. Breaks brand consistency with public site.

## 1.4 Category filter broken - UUID vs slug mismatch (ROOT CAUSE)
**File:** `src/app/events/page.tsx` line 57
```ts
if (params.category) {
  query = query.eq('category_id', params.category)
}
```
Code compares UUID column to slug string. Footer and homepage pass slugs (`?category=comedy`). Filter sidebar passes UUIDs. Supabase returns zero rows silently when types mismatch. This is why Comedy, Business-Networking, and others show "0 events available."

## 1.5 Footer Comedy link points to wrong category
**File:** `src/components/layout/site-footer.tsx` line 21
`{ label: 'Comedy', href: '/events?category=arts-culture' }` - comedy is its own category slug, not arts-culture. Also `Cultural Celebrations` points to `community` which doesn't exist in hero-categories or seed data.

## 1.6 Price filter half-built
**File:** `src/components/features/events/filter-sidebar.tsx` lines 183-193
Only offers "Free events only" toggle. No Free/Paid/All control. Query syntax `query.eq('ticket_tiers.price', 0)` is also unreliable across joined tables.

## 1.7 "Culture / Language" filter is awkward and off-brand
Same file, lines 47-55 and 197-213. Forces users to self-identify their culture before browsing. No modern competitor does this. Cultural soul lives in Cultural Picks landing pages, not in a forced sidebar attribute. **Remove entirely, replace with "Distance" radius filter.**

## 1.8 No geo-detection
Every user globally sees the same list. Airbnb, Uber, Eventbrite, DICE all geo-detect on page load. We don't.

## 1.9 Auth flow incomplete
Login/signup pages exist. Auth callback/confirm routes exist. Missing: Google OAuth button, forgot-password page, reset-password page, verify-email-sent informational page.

## 1.10 Stripe webhook returns 307
**File:** `src/app/api/webhooks/stripe/route.ts`
Middleware correctly exempts `/api/*`. Likely cause: Next.js trailing-slash redirect or Stripe dashboard URL mismatch.

## 1.11 Revenue card rounding
Math.round truncates cents somewhere in dashboard. Needs locating and replacing with `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })`.

## 1.12 Supabase auth-token lock console noise
LockManager race warnings in dev console. Add unhandledrejection handler in `src/lib/supabase/client.ts`.

## 1.13 No dashboard left sidebar
Top-nav-only layout can't scale as features grow. Every modern SaaS uses top + left sidebar.

---

# PART 2 - NORTH STAR PRINCIPLES

Applies to every change in every stream:

1. Production-quality on every page. No placeholder panels.
2. Brand consistency: gold accent, ink-900 text, Australian English, no em/en-dashes, no exclamation marks.
3. EVENTLINQS logo routes to `/` from every surface.
4. Empty states have headline + sub-copy + CTA. Never a blank box.
5. Hover states on every interactive element. Gold pattern matches public header.
6. Mobile-first responsive. Tested at 375px, 768px, 1280px.
7. Geo-aware by default. Users never manually select region.
8. Accessibility: keyboard nav, ARIA labels, visible focus, WCAG AA.
9. No mojibake. UTF-8 without BOM.
10. `npm run build` and `npm run lint` pass before marking complete.

---

# PART 3 - STREAM A: BACKEND & DATA

**Tab 1.** Files: `src/app/events/page.tsx`, `src/components/features/events/filter-sidebar.tsx`, `supabase/migrations/*`, `src/lib/geo/*` (new), `src/app/api/webhooks/stripe/route.ts`, `src/lib/supabase/client.ts`, `next.config.ts`, `src/app/api/location/set/route.ts` (new).

## A.1 Fix category filter UUID/slug mismatch

**File:** `src/app/events/page.tsx` lines 54-57

Replace with slug lookup:

```ts
if (params.category) {
  const { data: cat } = await supabase
    .from('event_categories')
    .select('id')
    .eq('slug', params.category)
    .maybeSingle()

  if (cat) {
    query = query.eq('category_id', cat.id)
  } else {
    query = query.eq('category_id', '00000000-0000-0000-0000-000000000000')
  }
}
```

**File:** `src/components/features/events/filter-sidebar.tsx`

Change category FilterLink map (around line 167) to use slugs:

```ts
{visibleCategories.map(c => (
  <FilterLink
    key={c.id}
    href={buildUrl(params, { category: c.slug, page: '1' })}
    active={params.category === c.slug}
  >
    {c.name}
  </FilterLink>
))}
```

## A.2 Fix price filter - Free / Paid / All

**File:** `src/components/features/events/filter-sidebar.tsx` lines 183-193

```ts
<SidebarGroup title="Price" defaultOpen={false}>
  <div className="space-y-0.5">
    <FilterLink
      href={buildUrl(params, { free: undefined, paid: undefined, page: '1' })}
      active={!params.free && !params.paid}
    >
      All prices
    </FilterLink>
    <FilterLink
      href={buildUrl(params, { free: '1', paid: undefined, page: '1' })}
      active={params.free === '1'}
    >
      Free only
    </FilterLink>
    <FilterLink
      href={buildUrl(params, { free: undefined, paid: '1', page: '1' })}
      active={params.paid === '1'}
    >
      Paid only
    </FilterLink>
  </div>
</SidebarGroup>
```

**File:** `src/app/events/page.tsx`

```ts
if (params.free === '1') {
  query = query.eq('is_free', true)
}
if (params.paid === '1') {
  query = query.eq('is_free', false)
}
```

(Relies on `is_free` column added in A.5.)

## A.3 Remove Culture/Language, add Distance

**File:** `src/components/features/events/filter-sidebar.tsx`

1. Delete CULTURE_TAGS constant (lines 47-55).
2. Delete the Culture/Language SidebarGroup block (197-213).
3. Remove `culture` from FilterParams type.
4. Add Distance group:

```ts
const DISTANCE_OPTIONS = [
  { key: undefined, label: 'Any distance' },
  { key: '5',   label: 'Within 5km' },
  { key: '10',  label: 'Within 10km' },
  { key: '25',  label: 'Within 25km' },
  { key: '50',  label: 'Within 50km' },
  { key: '100', label: 'Within 100km' },
]
```

Render the group in the sidebar. Also add `distance` to FilterParams type and pass through buildUrl.

**File:** `src/app/events/page.tsx`

Remove culture param from searchParams type and from the query block (lines 63-65).

Distance filtering requires the user's current coords from geo-detect (A.4). When `params.distance` is set and user's lat/lng is known, filter events by Haversine distance. For simplicity in 2b, implement a Postgres RPC `events_within_distance(lat, lng, radius_km)` - Claude Code writes the SQL function in migration A.5 and calls it from events page when distance param is present.

## A.4 Geo-detection utility

**New file:** `src/lib/geo/detect.ts`

```ts
import { headers } from 'next/headers'
import { cookies } from 'next/headers'

export type DetectedLocation = {
  city: string
  country: string
  countryCode: string
  latitude: number | null
  longitude: number | null
  source: 'cookie' | 'vercel' | 'fallback'
}

export const MELBOURNE_FALLBACK: DetectedLocation = {
  city: 'Melbourne',
  country: 'Australia',
  countryCode: 'AU',
  latitude: -37.8136,
  longitude: 144.9631,
  source: 'fallback',
}

export async function detectLocation(): Promise<DetectedLocation> {
  const cookieStore = await cookies()
  const elCity = cookieStore.get('el_city')?.value
  if (elCity) {
    try {
      return { ...JSON.parse(elCity), source: 'cookie' }
    } catch { /* fall through */ }
  }

  const headerStore = await headers()
  const city = headerStore.get('x-vercel-ip-city')
  const country = headerStore.get('x-vercel-ip-country')
  const lat = headerStore.get('x-vercel-ip-latitude')
  const lng = headerStore.get('x-vercel-ip-longitude')

  if (city && country) {
    return {
      city: decodeURIComponent(city),
      country: countryName(country),
      countryCode: country,
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
      source: 'vercel',
    }
  }

  return MELBOURNE_FALLBACK
}

function countryName(code: string): string {
  const m: Record<string, string> = {
    AU: 'Australia', GB: 'United Kingdom', CA: 'Canada', US: 'United States',
    NG: 'Nigeria', ZA: 'South Africa', GH: 'Ghana', KE: 'Kenya',
    DE: 'Germany', FR: 'France', IE: 'Ireland', NZ: 'New Zealand',
  }
  return m[code] ?? code
}
```

**New file:** `src/app/api/location/set/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const res = NextResponse.json({ ok: true })
  res.cookies.set('el_city', JSON.stringify({
    city: body.city,
    country: body.country,
    countryCode: body.countryCode,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
  }), {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  })
  return res
}
```

## A.5 Migration: is_free, preferred_city, venue coords, distance RPC

**New file:** `supabase/migrations/20260418000001_add_geo_and_pricing_columns.sql`

```sql
-- is_free boolean for efficient filter
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;

UPDATE events SET is_free = true
WHERE id IN (
  SELECT event_id FROM ticket_tiers
  GROUP BY event_id
  HAVING MAX(price) = 0
);

CREATE OR REPLACE FUNCTION update_event_is_free()
RETURNS TRIGGER AS $$
DECLARE target_event uuid;
BEGIN
  target_event := COALESCE(NEW.event_id, OLD.event_id);
  UPDATE events SET is_free = (
    SELECT COALESCE(MAX(price), 0) = 0 FROM ticket_tiers WHERE event_id = target_event
  ) WHERE id = target_event;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_event_is_free ON ticket_tiers;
CREATE TRIGGER trg_update_event_is_free
AFTER INSERT OR UPDATE OR DELETE ON ticket_tiers
FOR EACH ROW EXECUTE FUNCTION update_event_is_free();

-- Venue coords for distance
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_latitude NUMERIC(10,7);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_longitude NUMERIC(10,7);

CREATE INDEX IF NOT EXISTS idx_events_venue_coords ON events(venue_latitude, venue_longitude)
  WHERE venue_latitude IS NOT NULL;

-- Haversine distance RPC
CREATE OR REPLACE FUNCTION events_within_distance(
  p_lat NUMERIC, p_lng NUMERIC, p_radius_km NUMERIC
) RETURNS SETOF events AS $$
  SELECT * FROM events
  WHERE venue_latitude IS NOT NULL AND venue_longitude IS NOT NULL
  AND 6371 * acos(
    cos(radians(p_lat)) * cos(radians(venue_latitude)) *
    cos(radians(venue_longitude) - radians(p_lng)) +
    sin(radians(p_lat)) * sin(radians(venue_latitude))
  ) <= p_radius_km;
$$ LANGUAGE sql STABLE;

-- preferred_city on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_city JSONB;
COMMENT ON COLUMN profiles.preferred_city IS
  'User-selected city. Shape: {city, country, countryCode, latitude, longitude}';
```

Also backfill venue coords for seeded events - Claude Code writes a follow-up seed update with approximate coords for Melbourne (-37.8136, 144.9631), Sydney (-33.8688, 151.2093), Brisbane (-27.4698, 153.0251), Perth (-31.9523, 115.8613) etc., applied based on `venue_city` match.

## A.6 Fix Stripe webhook 307

**File:** `next.config.ts`

```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  trailingSlash: false,
  async redirects() { return [] },
}
export default nextConfig
```

**File:** `src/lib/supabase/middleware.ts`

Add near top of updateSession:
```ts
if (request.nextUrl.pathname === '/api/webhooks/stripe') {
  return NextResponse.next({ request })
}
```

Lawal verifies the Stripe dashboard webhook URL: `https://eventlinqs.com/api/webhooks/stripe` (no trailing slash).

## A.7 Suppress Supabase lock warnings

**File:** `src/lib/supabase/client.ts`

Append:
```ts
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message ?? ''
    if (msg.includes('lock') || event.reason?.name === 'NavigatorLockAcquireTimeoutError') {
      event.preventDefault()
    }
  })
}
```

## A.8 Revenue card rounding

Run:
```
grep -rn "Math.round" src/app/\(dashboard\) | grep -iE "revenue|amount|price"
```

Replace `Math.round(value / 100)` displays with:
```ts
new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value / 100)
```

## A.9 Stream A verification

```
npm run build && npm run lint
```
Manual tests:
- `/events?category=comedy` → African Comedy Night visible
- `/events?category=music` → seeded music events visible
- `/events?free=1` → free events only
- `/events?paid=1` → paid events only
- `/events?distance=50` (after A.5 seeds coords) → events within 50km of detected location

---

# PART 4 - STREAM B: AUTH & DASHBOARD REBUILD

**Tab 2.** Files: `src/app/(auth)/*`, `src/app/(dashboard)/*`, `src/components/dashboard/*`, `src/components/auth/*`, `src/lib/supabase/middleware.ts`.

## B.1 Audit existing auth

Claude Code reads and reports on:
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/signup/page.tsx`
- `src/app/(auth)/logout/page.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/auth/confirm/route.ts`
- `src/components/auth/*`

Reports what works, what's missing. Then proceeds with B.2 onward.

## B.2 Google OAuth button

In login and signup pages, add above the email form:

```tsx
<button
  type="button"
  onClick={async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
  }}
  className="w-full flex items-center justify-center gap-3 h-11 rounded-lg border border-ink-200 bg-white hover:bg-ink-50 transition-colors text-sm font-medium"
>
  <GoogleIcon />
  Continue with Google
</button>
<div className="my-4 flex items-center gap-3">
  <div className="flex-1 h-px bg-ink-100" />
  <span className="text-xs text-ink-400">or</span>
  <div className="flex-1 h-px bg-ink-100" />
</div>
```

GoogleIcon component: inline SVG of Google "G" logo (provide standard Google brand SVG).

Claude Code provides Lawal step-by-step instructions to enable Google OAuth in Supabase dashboard (Authentication → Providers → Google → toggle on, paste Client ID and Secret from Google Cloud Console). Does not try to enable programmatically.

## B.3 Forgot password flow

**New file:** `src/app/(auth)/forgot-password/page.tsx`

Email input, "Send reset link" button. On submit:
```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/reset-password`
})
```
Success state: "Check your inbox."

**New file:** `src/app/auth/reset-password/page.tsx`

New password + confirm. Uses session from Supabase reset link. On submit:
```ts
await supabase.auth.updateUser({ password: newPassword })
```
Redirect to `/login?reset=success`.

## B.4 Verify-email-sent page

**New file:** `src/app/(auth)/verify-email-sent/page.tsx`

Informational: "Check your inbox. We've sent a verification link to [email]." Resend button (60s cooldown in sessionStorage). Change-email link back to signup.

Update signup page to redirect here after successful signup.

## B.5 Dashboard complete rebuild

### B.5.1 New layout

**File:** `src/app/(dashboard)/layout.tsx` - rewrite

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardTopbar } from '@/components/dashboard/dashboard-topbar'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  return (
    <div className="min-h-screen bg-canvas">
      <DashboardTopbar user={user} profile={profile} />
      <div className="flex">
        <DashboardSidebar profile={profile} />
        <main className="flex-1 px-6 py-8 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
```

### B.5.2 Topbar component

**New file:** `src/components/dashboard/dashboard-topbar.tsx` (replaces dashboard-nav.tsx)

Top bar 64px tall, white background, 1px bottom border:
- Left: EVENTLINQS wordmark - **`href="/"` CRITICAL** - `font-display font-extrabold tracking-tight text-ink-900 hover:text-gold-500 transition-colors`
- Middle: global search input (ghost border, Search icon, placeholder "Search events, orders, tickets…") - non-functional visual for now, can wire up in 2c
- Right: notifications Bell icon button, then user avatar (40px circle with initials if no avatar_url) + first name, opens dropdown on click
- Dropdown menu: Account settings, Billing, Help centre (target="_blank" to /help), divider, Sign out

Delete old `dashboard-nav.tsx` after migrating consumers.

### B.5.3 Sidebar component

**New file:** `src/components/dashboard/dashboard-sidebar.tsx`

- Width 240px expanded, 64px collapsed
- Collapse state stored in cookie `el_sidebar_collapsed`
- Active item: `border-l-4 border-gold-500 bg-ink-50 font-semibold`
- Hover: `bg-ink-100 transition-colors`
- Icons from `lucide-react`: LayoutDashboard, Calendar, PlusCircle, Ticket, Hourglass, Users, BarChart3, Wallet, Settings, HelpCircle
- Create Event item is visually distinguished: gold background tint even when not active, to draw the eye as the primary organiser action

Items list per diagnostic section 1.13 above.

### B.5.4 Dashboard home rewrite

**File:** `src/app/(dashboard)/dashboard/page.tsx` - complete rewrite

```tsx
import { createClient } from '@/lib/supabase/server'
import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { UpcomingEventsPanel } from '@/components/dashboard/upcoming-events-panel'
import { RecentActivityPanel } from '@/components/dashboard/recent-activity-panel'
import { GetStartedChecklist } from '@/components/dashboard/get-started-checklist'
import { QuickActionsPanel } from '@/components/dashboard/quick-actions-panel'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // ... fetch profile, org, KPIs, upcoming events, recent activity, checklist status

  return (
    <div className="space-y-8">
      <DashboardHero firstName={profile?.full_name?.split(' ')[0] ?? 'there'} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tickets sold" value={ticketsSold30d} delta={ticketsDelta} sparkline={ticketsSparkline} />
        <KpiCard label="Revenue" value={revenueFormatted} delta={revenueDelta} sparkline={revenueSparkline} />
        <KpiCard label="Upcoming events" value={upcomingCount} />
        <KpiCard label="Conversion rate" value={conversionPct} delta={conversionDelta} sparkline={conversionSparkline} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <UpcomingEventsPanel events={upcomingEvents} />
          <RecentActivityPanel activity={recentActivity} />
        </div>
        <div className="space-y-6">
          {showChecklist && <GetStartedChecklist status={checklistStatus} />}
          <QuickActionsPanel />
        </div>
      </div>
    </div>
  )
}
```

### B.5.5 Individual component specs

**`src/components/dashboard/dashboard-hero.tsx`**
- Greeting with dynamic time-of-day
- Right-aligned gold primary button "Create event" → `/dashboard/events/create`

**`src/components/dashboard/kpi-card.tsx`**
- Uppercase label, big tabular-nums number, delta pill, inline SVG sparkline (30 points, gold stroke, no fill, subtle grid)
- Props: `label`, `value`, `delta?` (percent change), `sparkline?` (number[])
- Empty state when no data: "No data yet" + small "Create your first event to see analytics"

**`src/components/dashboard/upcoming-events-panel.tsx`**
- Card with header "Upcoming events" + "View all →" link to /dashboard/events
- List of 5 events, each as a row: thumbnail + title + date + venue_city + tickets sold progress bar + action menu
- Empty state with SVG illustration, "No upcoming events yet", gold CTA

**`src/components/dashboard/recent-activity-panel.tsx`**
- Header "Recent activity"
- Timeline of 10 items, each with icon + one-line copy + relative time
- Empty state: "Activity will appear here once your events go live."

**`src/components/dashboard/get-started-checklist.tsx`**
- Only renders when organiser has no events
- Title "Set up your account"
- 4 checkboxes: verify email, create organisation, connect payouts, publish first event
- Each has link to the relevant action

**`src/components/dashboard/quick-actions-panel.tsx`**
- 3 link cards: Create event, Customise organiser page, Invite team member (disabled with "coming soon" badge is fine)

### B.5.6 Empty states on other dashboard pages

Audit and improve:
- `/dashboard/events` - when no events, show illustration + "Host your first event" + CTA
- `/dashboard/tickets` - when no tickets, "You haven't bought any tickets yet" + "Browse events" CTA
- `/dashboard/my-waitlists` - "You're not on any waitlists" + "Browse sold-out events" link
- `/dashboard/my-squads` - "No squads yet" + explanation of squads + "Join or create a squad"

## B.6 Middleware updates

**File:** `src/lib/supabase/middleware.ts`

Add to `publicRoutes` array:
- `/forgot-password`
- `/verify-email-sent`
- `/auth/reset-password`

Keep `/auth/*` callback routes public.

## B.7 Stream B verification

```
npm run build && npm run lint
```
Manual tests:
- Signup new email → lands on verify-email-sent
- Signin existing account → lands on new dashboard
- Click EVENTLINQS in dashboard topbar → routes to `/`
- Sidebar collapse/expand works
- Forgot password → email sent → reset link → new password → login works

---

# PART 5 - STREAM C: PUBLIC SITE POLISH

**Tab 3.** Files: `src/components/layout/site-header.tsx`, `src/components/layout/site-footer.tsx`, `src/components/ui/location-picker.tsx` (new), `src/app/page.tsx` (minor), `public/logos/*` (new), `src/app/dev/logo-preview/page.tsx` (new).

## C.1 Fix footer links

**File:** `src/components/layout/site-footer.tsx`

Replace `FOOTER_LINKS.discover`:

```ts
discover: [
  { label: 'Browse all events',  href: '/events' },
  { label: 'Afrobeats',          href: '/categories/afrobeats' },
  { label: 'Amapiano',           href: '/categories/amapiano' },
  { label: 'Gospel',             href: '/categories/gospel' },
  { label: 'Comedy',             href: '/events?category=comedy' },
  { label: 'Owambe',             href: '/categories/owambe' },
  { label: 'Business & Summits', href: '/categories/networking' },
],
```

## C.2 Location picker in header

**New file:** `src/components/ui/location-picker.tsx`

Client component, takes `currentLocation: DetectedLocation` prop.

Display: small ghost button with MapPin icon + city name ("📍 Melbourne"). Desktop-only visible in the main bar; mobile version slots into the hamburger sheet.

Click opens a modal (use native `<dialog>` or a simple overlay):
- Search input "Search for a city"
- Suggested cities grid: Melbourne, Sydney, Brisbane, Perth, Adelaide, Auckland, London, Manchester, Toronto, New York, Houston, Atlanta, Lagos, Accra
- "Use my current location" button that calls `navigator.geolocation.getCurrentPosition()` then finds nearest city by lat/lng from the hardcoded list
- On selection: POST to `/api/location/set` with city data, then `router.refresh()` to pick up the new cookie

City list as constant:
```ts
const CITIES = [
  { city: 'Melbourne', country: 'Australia', countryCode: 'AU', latitude: -37.8136, longitude: 144.9631 },
  { city: 'Sydney', country: 'Australia', countryCode: 'AU', latitude: -33.8688, longitude: 151.2093 },
  // ... etc
]
```

**File:** `src/components/layout/site-header.tsx`

Convert to server component wrapper that passes `detectLocation()` result to a client sub-component, or keep client and pass location as prop from a parent server component. Add `<LocationPicker currentLocation={location} />` between nav links and CTAs. Hidden on mobile main bar, shown in mobile sheet.

## C.3 Gold-hover on all public nav links

**File:** `src/components/layout/site-header.tsx` lines 119-131

Change nav link className from `hover:text-ink-900` to `hover:text-gold-600 transition-colors`. Sign in ghost button also gets `hover:text-gold-600` via the Button variant - verify the Button component's ghost variant supports gold hover or add a new variant `gold-ghost`.

## C.4 Pillar card coupled hover

Find all pillar card sections on homepage, `/organisers`, `/pricing`. Ensure each group uses:
- Parent: `group/cards` (Tailwind v4 named groups, or plain `group`)
- Each card: default state neutral, on own hover: `hover:border-gold-500 hover:-translate-y-0.5 transition-all`, when sibling hovered: stays ghost

Quickest implementation: wrap grid in `<div class="group/cards grid …">`. Each card gets:
```
border border-ink-100 transition-all duration-200
group-hover/cards:opacity-60
hover:!opacity-100 hover:border-gold-500 hover:-translate-y-0.5
```

## C.5 Logo exploration - 3 SVG concepts

Create `public/logos/` directory with three SVG files:

**`eventlinqs-concept-a.svg`** - current wordmark + a single gold dot after the last S (like a full stop that doubles as a brand mark):
```
EVENTLINQS.
```

**`eventlinqs-concept-b.svg`** - wordmark with the Q's tail extending into a gold underscore beneath the next 2 letters:
```
EVENTLIN[Q̲S]
```

**`eventlinqs-concept-c.svg`** - wordmark with sharper, geometric E and S custom letterforms while keeping the overall feel - look at how Linear or Stripe refined their wordmarks by just tweaking 1-2 letters.

Each SVG uses `currentColor` for the text so it works on light or dark backgrounds.

**New file:** `src/app/dev/logo-preview/page.tsx`

Preview page showing all 3 concepts at header size (20px), hero size (64px), and favicon size (32px), on both white and ink-900 backgrounds, so Lawal can pick in one glance.

## C.6 Category landing page audit

**File:** `src/app/categories/[slug]/page.tsx`

Already well-built. Verify in local dev:
- `/categories/afrobeats` renders
- `/categories/amapiano` renders
- `/categories/gospel` renders
- `/categories/owambe` renders
- `/categories/caribbean` renders
- `/categories/heritage-and-independence` renders
- `/categories/networking` renders

If any fail, Claude Code investigates and fixes.

## C.7 Stream C verification

```
npm run build && npm run lint
```
Manual tests:
- Footer Comedy link → events page shows African Comedy Night event
- Footer Business & Summits → `/categories/networking` page
- Hover any top nav link → goes gold smoothly
- Click location pill in header → modal opens → select Sydney → page refreshes with Sydney context
- Visit `/dev/logo-preview` → 3 concepts render on both backgrounds, at all sizes

---

# PART 6 - INTEGRATION CHECKLIST

After all three streams complete, Lawal:

1. Checks `git status` in each tab - expects non-overlapping changed files (should be the case given the file split above)
2. Runs `npm run build` at repo root - must succeed
3. Runs `npm run lint` - must succeed
4. Runs `npm run dev` - clean startup, no unhandledrejection noise
5. Smoke tests in browser:
   - Home: location pill shows "Melbourne", nav hover goes gold, footer links all return events
   - Events page: filter sidebar works for category, price, distance (no Culture/Language group visible)
   - Signup: new test email → verify-email-sent → reset password flow → login
   - Dashboard: logo links to `/`, sidebar renders and collapses, KPI cards show data or proper empty states
6. Commits:
   - `Stream A: fix category and price filters, add geo utility, fix webhook 307, rounding`
   - `Stream B: complete auth flow (Google OAuth, forgot password), full dashboard rebuild`
   - `Stream C: footer links, location picker, gold nav hover, logo concepts, /dev preview`
7. Push to main, verify Vercel deploy, verify `eventlinqs.com` surfaces work as expected

---

# PART 7 - OUT OF SCOPE FOR 2B

Deliberately deferred to future sessions:

- Seat selector rebuild (2c - its own deep surface)
- Upstash Redis Sydney migration (M5 or 2c)
- Image upload 10MB + WEBP (M4 polish follow-up)
- Stripe Connect full onboarding UI (M5)
- Real /dashboard/insights and /dashboard/payouts content (placeholder routes OK for now)
- Full logo implementation - 2b produces concepts only; Lawal picks, 2c implements

---

# PART 8 - FINAL WORD

Every surface touched in 2b must hold up to a walkthrough with a senior Silicon Valley engineer or product designer. Every empty state is designed. Every hover has intent. Every link resolves. Every flow completes.

The benchmark is ahead of Ticketmaster, DICE, Eventbrite, Airbnb. The changes above put us there on the surfaces we're touching. Future sessions extend the same standard to every remaining surface.

End of manifest.
