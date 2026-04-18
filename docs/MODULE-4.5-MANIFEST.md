# EventLinqs Module 4.5 — Close-Out Manifest

> **Purpose:** this is the paste-into-Claude-Code document. Work through streams A → B → C → D in order. Each prompt is self-contained. Paste the prompt, let Claude Code execute, verify against the acceptance test, commit, move on.
>
> **Reference files to keep open alongside this manifest:**
> - `EVENTLINQS-HOMEPAGE-TARGET-V3.html` — visual acceptance test
> - `EVENTLINQS-INTERACTION-MAP.md` — behavioural acceptance test
> - `EVENTLINQS-DATA-WIRING-CHECKLIST.md` — data acceptance test
>
> **Repo:** `github.com/eventlinqs/eventlinqs-app`
> **Working branch:** create `m4.5-close-out` from `main`. Commit after each task. Merge to `main` and tag `m4.5-close-out` when Stream D completes.
>
> **Rule:** do not skip a task. Do not reorder streams. If a prompt fails, stop, fix the underlying issue, then re-run the prompt. Do not move to the next task with broken or partial work.

---

## Pre-flight (5 minutes)

Before starting Stream A, run these in your terminal:

```bash
cd C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app
git fetch origin
git checkout main
git pull origin main
git checkout -b m4.5-close-out
git merge review/m4.5-local --no-ff -m "merge: m4.5 local work into close-out branch"
npm install
npm run build
```

If `npm run build` fails, stop. Do not start the manifest until a clean build passes. Fix build errors first.

---

# STREAM A — Foundation fixes

Four tasks. Estimated time: 60-90 minutes. Each fix is small, surgical, and has no dependency on the others.

---

## Task A1 — Fix GlassCard opacity

**File:** `src/components/ui/glass-card.tsx`
**Reference:** V3 mockup annotation panel "V3 — Hero"; Interaction Map §2.7

**Paste this prompt into Claude Code:**

```
Open src/components/ui/glass-card.tsx. Find the dark variant. The current implementation uses bg-ink-900/30 which is too transparent against dark video backgrounds — the "Happening Soon" ribbon card on the homepage hero becomes unreadable.

Change the dark variant's opacity and border to match the production-grade ribbon card pattern:

- Background: bg-ink-900/85 (raised from /30)
- Backdrop blur: backdrop-blur-xl (raised from md)
- Border: border border-gold-500/35 (instead of white/10)
- Shadow: shadow-[0_24px_48px_rgba(0,0,0,0.3)]

The light variant stays unchanged. Do not touch it.

Run npm run build and verify no type errors. Commit with message: "fix: raise GlassCard dark variant opacity for hero ribbon readability"
```

**Acceptance test:** open the homepage locally. The HAPPENING SOON ribbon card on the hero must be clearly readable — solid dark navy, gold border glint, never fading into the video background.

---

## Task A2 — Sweep unicode escape literals across the codebase

**Files:** entire `src/` directory
**Reference:** Interaction Map §14 acceptance criteria item 6

**Paste this prompt into Claude Code:**

```
Search the entire src/ directory for literal unicode escape sequences that are rendering as text instead of their intended characters. The patterns to find and fix:

- \u2026 → replace with literal "…" (ellipsis) OR rewrite the sentence to not need it
- \u00B7 → replace with literal "·" (middle dot)
- \u2014 → REWRITE THE SENTENCE. Em-dashes are forbidden in EventLinqs copy as per Australian English brand rules. Split into two sentences or restructure.
- \u2013 → same — rewrite, never en-dash
- \u2022 → replace with literal "•" only if the bullet is visual; otherwise remove

Use ripgrep or grep -rn across src/. Do not edit .next/, node_modules/, or any build output.

For each file edited, show me the before/after of the line. Do not batch-replace em-dashes blindly — each sentence containing \u2014 needs a human-appropriate rewrite. Examples:

- "Afrobeats nights, Amapiano fests, Comedy rooms \u2014 tickets with no hidden fees"
  → "Afrobeats nights, Amapiano fests, Comedy rooms. Tickets with no hidden fees."

- "${raw.title} \u2014 ${pct}% sold"
  → "${raw.title}: ${pct}% sold"

Also remove any exclamation marks you find in user-facing copy. Brand rule: no exclamation marks. Keep JSX negations (!isLoading) and CSS !important untouched.

Commit with message: "chore: sweep unicode escapes and em-dashes, enforce Australian English punctuation"
```

**Acceptance test:** `grep -rn "\\\\u20" src/` returns zero results. No em-dashes or en-dashes visible in user-facing copy sitewide.

---

## Task A3 — AuthShell must use canonical EventlinqsLogo

**File:** `src/components/auth/auth-shell.tsx`
**Reference:** V3 mockup nav annotation; Interaction Map §1.1

**Paste this prompt into Claude Code:**

```
Open src/components/auth/auth-shell.tsx. Lines 15-22 currently inline the EVENTLINQS wordmark as a raw Link with font classes, which breaks the single-source-of-truth principle — the canonical EventlinqsLogo component exists at src/components/ui/eventlinqs-logo.tsx with the correct 0.05em gold dot margin and brand-accurate styling.

Replace the inline wordmark with:

  <EventlinqsLogo asLink size="md" />

Import: add "import { EventlinqsLogo } from '@/components/ui/eventlinqs-logo'" at the top.

Verify the header still renders correctly by visiting /login, /signup, /forgot-password, and /auth/reset-password locally. All four pages must render the same canonical logo with the gold dot.

Commit with message: "fix: AuthShell uses canonical EventlinqsLogo component"
```

**Acceptance test:** visit all 4 auth pages. Each shows the EVENTLINQS wordmark with the gold dot, pixel-identical to the header on the homepage.

---

## Task A4 — Add mobile bottom variant to StickyActionBar

**File:** `src/components/features/events/sticky-action-bar.tsx`
**Reference:** Interaction Map §2 event detail; V3 mockup Organisers section

**Paste this prompt into Claude Code:**

```
Open src/components/features/events/sticky-action-bar.tsx. The current implementation is top-anchored (fixed top-0) which is correct for desktop. On mobile (< 768px), the Ticketmaster and DICE pattern is to pin the primary CTA to the BOTTOM of the viewport — thumb reach territory.

Add a mobile bottom variant. Approach:

1. Keep the existing top-anchored desktop bar. Wrap its classes in `hidden md:block` so it only shows on md+.

2. Add a second bar for mobile:
   - Classes: `fixed bottom-0 inset-x-0 z-40 md:hidden`
   - Uses env(safe-area-inset-bottom) for iPhone home-indicator padding
   - Content is compact: event title (truncated one line), price (if available), and a full-width "Get tickets" gold button
   - Same visibility trigger (scroll past threshold)
   - Same glassmorphism treatment but with bg-white/95 backdrop-blur-md border-t border-ink-100

3. Both variants share the same `visible` state logic and the same handleTicketsClick handler.

4. Both must respect prefers-reduced-motion (skip the translate animation).

Verify on a real phone viewport (DevTools at 375px) that:
- Scrolling down past the hero reveals the bottom bar
- The bar does not obstruct the existing page content (safe-area padding respected)
- Tapping "Get tickets" scrolls smoothly to #tickets anchor
- The top bar is hidden on mobile
- The bottom bar is hidden on desktop

Commit with message: "feat: add mobile bottom variant to StickyActionBar for thumb-reach CTA"
```

**Acceptance test:** on DevTools mobile viewport (375px), scroll past the event hero. A bottom bar appears with gold "Get tickets" CTA. On desktop (1440px) the top bar behaves as before. No double-bar rendering at any viewport.

---

# STREAM B — Homepage synchronisation

Seven tasks. Estimated time: 3-4 hours. This stream delivers the V3 mockup homepage. Paste prompts in order — each depends on the previous.

---

## Task B1 — Hide empty Cultural Picks tabs and empty section entirely

**File:** `src/app/page.tsx`
**Reference:** V3 mockup "V3 — Culture" annotation; Interaction Map §6.2

**Paste this prompt into Claude Code:**

```
Open src/app/page.tsx. Line ~362-379 currently renders a dashed-border empty state box ("Be the first to host a [Tab] event") per cultural tab when events are zero. This is the bug creating dashed grey boxes on the deployed homepage.

Change the logic:

1. Filter out empty tabs BEFORE rendering. After fetching culturalQueries (around line 130-150), add:

  const populatedCulturalQueries = culturalQueries.filter(q => q.events.length > 0)

2. Use populatedCulturalQueries everywhere downstream instead of culturalQueries.

3. Wrap the entire Cultural Picks section in a conditional:

  {populatedCulturalQueries.length > 0 && (
    <section aria-labelledby="culture-heading" ...>
      ...
    </section>
  )}

4. Delete the empty state div entirely (the one with border-dashed border-ink-200). It does not render under any circumstance now.

5. The tab strip should only render tabs that have events. The active tab defaults to the first populated tab.

Commit with message: "fix: hide empty Cultural Picks tabs and section entirely when zero events"
```

**Acceptance test:** on a staging DB with zero cultural-tagged events, the entire Cultural picks section does not render. With 2 out of 6 tabs having events, only those 2 tabs appear in the strip. Never a dashed empty box.

---

## Task B2 — Build city-photo.ts Pexels pipeline

**New file:** `src/lib/images/city-photo.ts`
**Reference:** Data Wiring Checklist Task 4; V3 mockup "V3 — Cities" annotation

**Paste this prompt into Claude Code:**

```
Create a new file at src/lib/images/city-photo.ts. It must mirror the pattern in src/lib/images/category-photo.ts exactly — same unstable_cache usage, same fallback pattern, same Pexels API integration.

Read src/lib/images/category-photo.ts first to understand the pattern, then build city-photo.ts with these 14 city queries:

  const CITY_QUERIES: Record<string, string> = {
    melbourne: 'Melbourne Australia skyline night',
    sydney: 'Sydney Australia harbour bridge',
    brisbane: 'Brisbane skyline Australia',
    perth: 'Perth Australia skyline',
    adelaide: 'Adelaide Australia city',
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

Request orientation=portrait (cities are rendered in 4:5 aspect tiles).
Cache 24h via unstable_cache with key 'city-photo' and tag 'city-photo'.
Fall back to null when Pexels returns no result or API key missing.

Export: getCityPhoto(slug: string): Promise<string | null>

Commit with message: "feat: add Pexels-backed city photo pipeline mirroring category-photo.ts"
```

**Acceptance test:** `npm run build` passes. Add a temporary log line in page.tsx that calls `getCityPhoto('melbourne')` and confirm it returns a Pexels URL (or `null` if PEXELS_API_KEY unset locally).

---

## Task B3 — Wire city photos and event counts into homepage city rail

**File:** `src/app/page.tsx`
**Reference:** Data Wiring Checklist Task 4

**Paste this prompt into Claude Code:**

```
Open src/app/page.tsx. Find the cityCounts block (around line 156). Update it to parallel-fetch both the count AND the city photo for each city:

Replace the existing cityCounts block with:

  import { getCityPhoto } from '@/lib/images/city-photo'

  const cityCounts = await Promise.all(
    CITY_TILES.map(async t => {
      const [countResult, photo] = await Promise.all([
        supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published')
          .eq('visibility', 'public')
          .gte('start_date', nowIso)
          .ilike('venue_city', `%${t.slug}%`),
        getCityPhoto(t.slug),
      ])
      return {
        ...t,
        count: countResult.count ?? 0,
        imageSrc: photo ?? `/cities/${t.slug}.svg`,
      }
    })
  )

Ensure the CityTile component receives imageSrc from this new field. Verify that the CityTile JSX in page.tsx passes imageSrc correctly — the component already accepts this prop.

Commit with message: "feat: wire real Pexels city photos into homepage By City rail"
```

**Acceptance test:** reload homepage. City tiles must show real city photography (Melbourne skyline, Sydney harbour, etc.), not SVG silhouettes. If PEXELS_API_KEY is missing, SVG fallback renders cleanly.

---

## Task B4 — Wire live count strip in hero

**File:** `src/app/page.tsx` + `src/components/features/events/featured-event-hero.tsx`
**Reference:** Data Wiring Checklist Task 1; V3 mockup hero annotation

**Paste this prompt into Claude Code:**

```
Open src/app/page.tsx. Add live count queries alongside the existing fetches:

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

Pass these two counts as props to FeaturedEventHero.

Open src/components/features/events/featured-event-hero.tsx. Accept the new props:

  liveEventCount?: number
  uniqueCitiesCount?: number

Render the live count strip between the subcopy and the CTAs, ONLY when liveEventCount >= 10:

  {liveEventCount >= 10 && (
    <div className="mt-4 inline-flex items-center gap-2.5 text-[13px] text-white/75 font-medium">
      <span className="relative h-2 w-2 rounded-full bg-gold-400">
        <span className="absolute inset-0 rounded-full bg-gold-400 opacity-60 animate-ping" />
      </span>
      {liveEventCount} events live now
      <span className="h-3 w-px bg-white/30" />
      {uniqueCitiesCount} {uniqueCitiesCount === 1 ? 'city' : 'cities'}
      <span className="h-3 w-px bg-white/30" />
      This week
    </div>
  )}

If liveEventCount < 10 the strip is not rendered at all — not hidden with CSS.

Commit with message: "feat: wire live event/city count strip into hero with zero-state hiding"
```

**Acceptance test:** with 15+ published future events in Supabase, the strip renders. With 5 events, nothing renders. With 12 events across 8 cities, strip reads "12 events live now · 8 cities · This week".

---

## Task B5 — Fix hero using Pexels video, never organiser cover image as background

**File:** `src/lib/images/event-media.ts` + `src/components/features/events/featured-event-hero.tsx`
**Reference:** V3 mockup "V3 — Hero" annotation; this was the Stripe-Test-Event bug

**Paste this prompt into Claude Code:**

```
Critical bug: the homepage hero currently shows the featured event's cover_image_url as the background. This is why "Stripe Test Event" briefly became the hero image in production.

The fix: the hero BACKGROUND must always be a cinematic Pexels video (or curated crowd still), regardless of whether the featured event has a cover_image_url. The featured event's identity lives in the ribbon card on the right, not in the background.

Open src/lib/images/event-media.ts. Find getFeaturedEventMedia. It currently prefers the event's video_url, then cover_image_url, then Pexels fallback.

Change the logic: for the hero BACKGROUND only, NEVER use cover_image_url as a source. The priority becomes:

  1. event.video_url (if the organiser explicitly uploaded a video)
  2. Pexels category video for event.category?.slug (via getCategoryVideo)
  3. Pexels category photo for event.category?.slug (via getCategoryPhoto) with Ken Burns
  4. Curated crowd still from /public/hero/hero-crowd.mp4 (which exists in the repo)

Rename getFeaturedEventMedia to getFeaturedHeroBackground and have it return the same shape but explicitly exclude cover_image_url. The existing getFeaturedEventMedia signature can be kept but the cover_image_url branch should only fire for tile contexts, not hero contexts.

Inside FeaturedEventHero, use getFeaturedHeroBackground for the full-bleed background. The ribbon card (the floating panel on the right) continues to use the event's own data including cover_image_url as a small thumbnail if desired.

Commit with message: "fix: hero background always uses Pexels/video, never organiser cover image"
```

**Acceptance test:** create a test event in staging with a distinctive cover_image_url (e.g. a plain blue square). Mark it as upcoming and published. Reload homepage. The hero BACKGROUND must NOT be the plain blue square. It must be a crowd video or Pexels category video. The ribbon card may reference the event by title, date, price.

---

## Task B6 — Wire tickets-sold-today on ribbon card

**File:** `src/app/page.tsx` + `src/components/features/events/featured-event-hero.tsx`
**Reference:** Data Wiring Checklist Task 2; V3 mockup hero annotation

**Paste this prompt into Claude Code:**

```
Open src/app/page.tsx. Add a helper to count tickets sold today for a given event:

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

If the orders table column for status is different (e.g. 'paid' or 'succeeded'), adjust to match the actual enum. Check src/types/database.ts for the correct column name and value.

For the current featured event, compute:

  const featuredTicketsSoldToday = featuredHero ? await getTicketsSoldToday(featuredHero.id) : 0

Pass ticketsSoldToday as a prop to FeaturedEventHero.

Inside FeaturedEventHero, on the ribbon card, render the live signal ONLY when ticketsSoldToday > 0:

  {ticketsSoldToday > 0 && (
    <div className="mt-3.5 flex items-center gap-2 text-[11px] font-semibold text-white/85">
      <span className="relative h-2 w-2 rounded-full bg-coral-500">
        <span className="absolute inset-0 rounded-full bg-coral-500 opacity-70 animate-ping" />
      </span>
      {ticketsSoldToday} tickets sold today
    </div>
  )}

If zero, the entire row including the pulse dot is absent from the DOM. Not hidden — not rendered.

Commit with message: "feat: wire real tickets-sold-today signal on hero ribbon card"
```

**Acceptance test:** complete 3 test orders on the featured event today. Reload homepage. Ribbon card reads "3 tickets sold today". Delete those orders (or test tomorrow). Ribbon card has no line and no pulse dot.

---

## Task B7 — Add heart save button to every bento tile and rail card

**Files:** `src/components/features/events/event-bento-tile.tsx`, `src/components/features/events/event-card.tsx`, new `src/components/features/events/save-event-button.tsx`
**Reference:** V3 mockup "V3 — Bento" annotation; Interaction Map §3.5

**Paste this prompt into Claude Code:**

```
Create a new reusable save button at src/components/features/events/save-event-button.tsx:

'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Variant = 'dark' | 'light'

export function SaveEventButton({
  eventId,
  initiallySaved = false,
  variant = 'dark',
  className = '',
}: {
  eventId: string
  initiallySaved?: boolean
  variant?: Variant
  className?: string
}) {
  const [saved, setSaved] = useState(initiallySaved)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const base = variant === 'dark'
    ? 'bg-white/18 backdrop-blur-md border border-white/30 text-white hover:bg-white/30'
    : 'bg-white/95 text-ink-700 hover:text-coral-500'

  const savedState = saved
    ? 'bg-gold-500 border-gold-500 text-ink-900'
    : ''

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    const nextSaved = !saved
    setSaved(nextSaved) // optimistic

    startTransition(async () => {
      const { error } = nextSaved
        ? await supabase.from('saved_events').insert({ event_id: eventId, user_id: session.user.id })
        : await supabase.from('saved_events').delete().eq('event_id', eventId).eq('user_id', session.user.id)
      if (error) setSaved(!nextSaved) // revert on failure
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={saved ? 'Remove from saved' : 'Save event'}
      aria-pressed={saved}
      disabled={isPending}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:scale-108 ${base} ${savedState} ${className}`}
    >
      <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
    </button>
  )
}

Before using: verify a 'saved_events' table exists in Supabase with columns (id uuid, user_id uuid, event_id uuid, created_at timestamptz). If not, create the migration:

  supabase/migrations/20260419000001_add_saved_events.sql

With:

  CREATE TABLE IF NOT EXISTS saved_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, event_id)
  );
  ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "users read own saves" ON saved_events FOR SELECT USING (user_id = auth.uid());
  CREATE POLICY "users insert own saves" ON saved_events FOR INSERT WITH CHECK (user_id = auth.uid());
  CREATE POLICY "users delete own saves" ON saved_events FOR DELETE USING (user_id = auth.uid());

Apply migration: npx supabase db push

Now integrate SaveEventButton:

1. In src/components/features/events/event-bento-tile.tsx: add SaveEventButton (variant="dark") to the top-right of every tile.
2. In src/components/features/events/event-card.tsx: add SaveEventButton (variant="light") positioned absolute top-3 right-3 over the image.
3. Pass initiallySaved by fetching the user's saved list in src/app/page.tsx (if session exists) and mapping eventIds -> boolean. If no session, all buttons render initiallySaved=false.

Commit with message: "feat: add heart save button to every event tile and card with optimistic UI"
```

**Acceptance test:** logged out, click heart → redirects to login. Logged in, click heart → fills gold with pop animation, persists on refresh. Click again → empty. Click propagation: heart click does NOT navigate to event.

---

# STREAM C — Event detail, auth, and dashboard synchronisation

Four tasks. Estimated time: 3-4 hours. This stream ensures the rest of the platform matches the homepage's visual language.

---

## Task C1 — Event detail page full audit

**File:** `src/app/events/[slug]/page.tsx` + subcomponents

**Paste this prompt into Claude Code:**

```
Open src/app/events/[slug]/page.tsx (665 lines). Read the entire file. Then audit against these rules:

1. Zero stale Tailwind colour tokens. Find and replace:
   - Any bg-gray-* → bg-ink-* equivalent (gray-50 → ink-50 or canvas, etc.)
   - Any bg-blue-* → likely a token mistake; replace with gold-* or ink-* based on semantic intent
   - Any text-gray-* → text-ink-* equivalent
   - Any border-gray-* → border-ink-* equivalent

2. All sections use the SectionHeader pattern (gold left-bar + eyebrow + H2). Check:
   - Hero section
   - About/description
   - When & where (venue map)
   - Organiser card
   - Share section
   - Related events
   If any section lacks the pattern, add it.

3. Verify imports use canonical components:
   - EventlinqsLogo (not inline wordmark)
   - GlassCard (with fix from Task A1 applied)
   - SmartMedia (for hero background)
   - VenueMap (with gold pin)
   - StickyActionBar (with mobile bottom variant from Task A4)
   - RelatedEventsGrid OR upgrade to horizontal snap rail matching V3 mockup pattern

4. Check the hero: it must use SmartMedia, not a raw Next Image. The background should be cinematic (video preferred, crossfade, Ken Burns), never a flat object-contain still.

5. Social proof badge (SocialProofBadge) renders inline near the ticket selector.

6. The ticket selector or sold-out UX (EventSoldOut) renders based on inventory status.

Report back with a list of findings (file + line number + what to change). Do not make sweeping changes in one pass. I want to review the audit first.

Do not commit anything yet. Create an AUDIT-EVENT-DETAIL.md file in the repo root with your findings.
```

**Then paste this follow-up:**

```
I've reviewed AUDIT-EVENT-DETAIL.md. Now apply all the fixes you identified. One commit per logical group of changes:

- "refactor: replace stale gray tokens with ink scale on event detail"
- "refactor: unify section headers across event detail page"
- "refactor: ensure canonical component imports in event detail"

After all commits, delete AUDIT-EVENT-DETAIL.md.
```

**Acceptance test:** visit 3 real event URLs. Each renders: cinematic hero with video/crossfade, gold section bars, consistent ink-scale tokens, sticky action bar on scroll (top desktop, bottom mobile), related events below, venue map with gold pin.

---

## Task C2 — Auth pages visual audit and AuthShell integration

**Files:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/auth/reset-password/page.tsx`, `src/app/(auth)/verify-email-sent/page.tsx`

**Paste this prompt into Claude Code:**

```
Open each of these auth pages in sequence. For each, verify:

1. Uses AuthShell wrapper (not a custom layout)
2. AuthShell now uses EventlinqsLogo (Task A3 applied)
3. Form fields use FormField from src/components/ui/FormField.tsx
4. Primary CTA is gold-500 solid, secondary is outline
5. Google OAuth button (GoogleButton component) is present and placed consistently above the email form
6. Error states use text-error not generic red
7. Success states use text-success
8. No unicode escape literals anywhere
9. No exclamation marks
10. Australian English (favourite, colour, organiser)
11. Links between auth pages work ("Don't have an account? Sign up" etc.)

For each page that deviates, fix it to match the pattern. Also verify:
- /login has Google OAuth + email/password + "Forgot password?" link + "Don't have an account? Sign up" link
- /signup has Google OAuth + email/password + password strength indicator + "Already have an account? Sign in" link
- /forgot-password has email input + "Send reset link" CTA + back to login link
- /auth/reset-password has password + confirm password + "Update password" CTA
- /verify-email-sent has a confirmation message + "Resend email" button + back to login

Commit each page's fixes as its own commit:
- "fix: login page visual consistency with design system"
- "fix: signup page visual consistency with design system"
(etc)
```

**Acceptance test:** walk through the full auth flow (signup → verify email → login → forgot password → reset password) in the browser. Every screen uses the same shell, same logo, same typography, same button styles.

---

## Task C3 — Dashboard pages visual audit + confirm no seat-config UI

**Files:** `src/app/(dashboard)/**`, `src/components/dashboard/**`

**Paste this prompt into Claude Code:**

```
The dashboard already uses DashboardSidebar, DashboardTopbar, and DashboardHero. Verify these components render consistently across all dashboard routes:

- /dashboard (home)
- /dashboard/events
- /dashboard/events/create
- /dashboard/events/[id] (organiser-side event detail)
- /dashboard/tickets (fan-side tickets)
- /dashboard/my-waitlists
- /dashboard/my-squads
- /dashboard/organisation
- /dashboard/settings (if exists)

For each route, verify:

1. Uses DashboardSidebar (collapsible, role-gated)
2. Uses DashboardTopbar (uses canonical EventlinqsLogo)
3. Uses DashboardHero pattern for page greeting (where applicable)
4. Uses KpiCard, QuickActionsPanel, RecentActivityPanel, UpcomingEventsPanel as appropriate (inspect src/components/dashboard/*)
5. No stale bg-gray-* or bg-blue-* tokens
6. No unicode escape literals
7. No exclamation marks
8. Australian English
9. Empty states use EmptyState component (from src/components/ui/EmptyState.tsx)
10. Loading states use LoadingState (from src/components/ui/LoadingState.tsx)

CRITICAL check on /dashboard/events/create: confirm the event creation form does NOT contain any of these:
- CSV file upload for seat data
- JSON textarea for seat config
- Spreadsheet-style seat editor
- ACCESS file or access.csv import
- Any config-file-based seat definition surface whatsoever

For M4.5 close-out, only simple tier-based ticketing input is acceptable (Name + Price + Capacity + Description rows). Reserved seating with a proper visual drag-and-drop seat-map builder belongs to M4 Phase 2 and will be built separately — it is NOT included in M4.5.

If any CSV/JSON/config-based seat UI is found, REMOVE IT. Leave a TODO comment: "// M4 Phase 2: visual seat builder goes here" at the location where it was removed.

Report findings. Apply fixes. Commit grouped by page:
- "fix: remove legacy seat-config upload UI from event create (belongs to M4 Phase 2)"
- "fix: dashboard event create consistency pass"
- "fix: dashboard my-tickets consistency pass"
(etc)
```

**Acceptance test:** log in as an organiser role. Visit every dashboard page. Consistent sidebar, consistent topbar, consistent typography. No visual surprises. Event create form has zero CSV/JSON upload surface — only tier rows with Name, Price, Capacity.

---

## Task C4 — Cross-platform verification

**Paste this prompt into Claude Code:**

```
Run a full platform walk-through and produce a report. Use npm run dev and visit every route listed below at three viewports: mobile (375px), tablet (768px), desktop (1440px).

Routes to visit:
- / (homepage)
- /events (browse)
- /events/[any-slug] (event detail)
- /organisers (landing)
- /organisers/signup
- /pricing
- /login
- /signup
- /forgot-password
- /auth/reset-password
- /verify-email-sent
- /dashboard (as organiser)
- /dashboard/events/create
- /dashboard/tickets (as fan)
- /help (if exists)
- /404 (visit a deliberately invalid URL)

For each route at each viewport, check:
1. No layout overflow or horizontal scroll
2. Logo renders with gold dot
3. All text uses Manrope for display, Inter for body
4. All gold accents use --gold-500 tokens (not arbitrary hexes)
5. No dashed empty state boxes
6. No stale Tailwind tokens
7. No unicode escape literals in visible text
8. No exclamation marks in copy
9. All CTAs have hover, focus, active states
10. All interactive elements keyboard-reachable
11. Mobile bottom action bar appears on event detail at 375px, top bar on 1440px

Produce a file CROSS-PLATFORM-VERIFICATION.md with a table:

| Route | 375px | 768px | 1440px | Notes |

Mark each cell with ✓ or ✗ with a brief note for any ✗.

Fix every ✗. Commit per-page fixes. Delete CROSS-PLATFORM-VERIFICATION.md after all ✗ are resolved.
```

**Acceptance test:** all routes × all viewports = ✓.

---

# STREAM D — Pre-launch polish

Four tasks. Estimated time: 60-90 minutes.

---

## Task D1 — Lint, type-check, build

**Paste this prompt into Claude Code:**

```
Run these commands in sequence. All must pass with zero errors and zero warnings:

  npm run lint
  npx tsc --noEmit
  npm run build

If any command fails, fix the underlying issue and re-run. Do not ignore warnings with eslint-disable or @ts-ignore unless the warning is genuinely a false positive (in which case add a comment explaining why).

After all three pass green, commit any fixes with message: "chore: lint and type-check clean pass"
```

---

## Task D2 — Deploy to Vercel preview

**Paste this prompt into Claude Code:**

```
Push the m4.5-close-out branch to origin:

  git push origin m4.5-close-out

Wait for Vercel to produce a preview deployment. Open the preview URL. Visit / (homepage) and perform a final visual spot-check against EVENTLINQS-HOMEPAGE-TARGET-V3.html.

Compare section-by-section:
- Nav (with search bar)
- Hero (rotating carousel)
- Bento grid
- This Week rail
- Cultural Picks
- Live Vibe marquee
- By City rail (with real Pexels photos)
- Social proof (if 6+ organisers exist)
- For Organisers section
- Footer

For any section that doesn't match the V3 mockup, identify the root cause and fix in a new commit. Push again. Re-verify on preview.
```

---

## Task D3 — Lighthouse audit

**Paste this prompt into Claude Code:**

```
On the Vercel preview URL, run Lighthouse in Chrome DevTools for both Mobile and Desktop profiles. Targets:

- Performance: ≥ 85 mobile, ≥ 90 desktop
- Accessibility: ≥ 95
- Best Practices: ≥ 95
- SEO: ≥ 95

Record scores in a file LIGHTHOUSE-SCORES.md. If any target is missed, investigate and fix:

- Performance misses usually mean images too large (add sizes, use next/image properly) or JS bundle too large (code-split, lazy load below-fold)
- Accessibility misses usually mean missing alt text, low contrast, or missing aria-labels
- Best Practices misses usually mean mixed content, deprecated APIs, or missing security headers
- SEO misses usually mean missing meta tags, missing og:image, or unlinked pages

Commit fixes, push, re-run Lighthouse until all targets met. Delete LIGHTHOUSE-SCORES.md after all targets passed.
```

---

## Task D4 — Merge, tag, deploy

**Paste this prompt into Claude Code:**

```
Prerequisites verified:
- All Stream A, B, C tasks committed
- npm run lint passes
- npx tsc --noEmit passes
- npm run build passes
- Vercel preview matches EVENTLINQS-HOMEPAGE-TARGET-V3.html section-by-section
- Lighthouse mobile ≥ 85, desktop ≥ 90, accessibility/best-practices/SEO ≥ 95

Now finalise:

  git checkout main
  git pull origin main
  git merge m4.5-close-out --no-ff -m "feat: Module 4.5 close-out — homepage synchronised to target mockup"
  git tag -a m4.5-close-out -m "Module 4.5 complete: hero carousel, search bar, horizontal rails, real data wiring, mobile bottom CTA, full platform consistency pass"
  git push origin main
  git push origin m4.5-close-out

Confirm the production deploy on eventlinqs.com picks up the merge. Visit the production URL. Do one final walk-through as a fan (signed out), as a fan (signed in, clicking hearts), and as an organiser (signing up a test event).

Report back: "M4.5 close-out complete. Production live. Ready for M5."
```

---

# Verification checklist — M4.5 is done when

Every item below must be true before tagging `m4.5-close-out`:

1. ☐ Homepage matches V3 mockup section-by-section
2. ☐ Search bar in nav (always visible, opens modal on click)
3. ☐ Hero rotates 3-5 slides every 7s, pauses on hover/focus
4. ☐ Hero background is Pexels video/still, never an organiser cover image
5. ☐ Live count strip shows real numbers (≥ 10 events) or hides
6. ☐ Ribbon card shows real "X tickets sold today" (> 0) or hides
7. ☐ Bento grid renders real events with heart save button on each tile
8. ☐ This Week rail is horizontal snap with scroll progress bar
9. ☐ Cultural Picks tabs hide when empty, entire section hides when all empty
10. ☐ By City rail uses real Pexels photography for all cities
11. ☐ Live Vibe marquee pauses on hover AND keyboard focus
12. ☐ Social proof section hides entirely when < 6 organisers
13. ☐ No iOS/Android rating cards (apps don't exist)
14. ☐ For Organisers section includes testimonial card
15. ☐ Footer rendered (logo, 4 columns, socials, legal)
16. ☐ GlassCard dark variant at 85% opacity, gold border
17. ☐ Sticky action bar bottom-anchored on mobile, top-anchored on desktop
18. ☐ AuthShell uses canonical EventlinqsLogo
19. ☐ All 5 auth pages visually consistent
20. ☐ All dashboard pages visually consistent
21. ☐ Event create has zero CSV/JSON seat-config UI (reserved for M4 Phase 2 visual builder)
22. ☐ Zero stale Tailwind tokens (bg-gray-*, bg-blue-*) sitewide
23. ☐ Zero unicode escape literals sitewide
24. ☐ Zero em-dashes or en-dashes in user-facing copy
25. ☐ Zero exclamation marks in user-facing copy
26. ☐ Australian English throughout (organiser, favourite, colour)
27. ☐ Heart save button wired to saved_events table with optimistic UI
28. ☐ Lighthouse mobile Performance ≥ 85
29. ☐ Lighthouse Accessibility ≥ 95
30. ☐ npm run lint passes green
31. ☐ npx tsc --noEmit passes green
32. ☐ npm run build passes green
33. ☐ Vercel preview signed off section-by-section
34. ☐ Production deploy verified on eventlinqs.com
35. ☐ Tagged m4.5-close-out in git

---

# After M4.5 — what's next

With M4.5 merged, move to **Module 5 (Public Pages)** which is locked in as the next milestone. M5 includes:

- Browse events page (`/events`) — filters, sort, pagination, category pills
- Category landing pages (`/events/category/[slug]`)
- City landing pages (`/events/city/[slug]`)
- Search modal (the full-screen modal opened by the nav search bar built in M4.5)
- Organiser public profile pages (`/organisers/[slug]`)
- Pricing page (`/pricing`)

Module 4 Phase 2 (Reserved Seating with visual drag-drop seat builder) sits between M5 and M6, scheduled per scope.

---

End of manifest.
