# EventLinqs Module 5 - Public Pages

**Scope version:** 2.0 - final, ready for build
**Predecessor:** M4.5 (Public Pages Redesign - homepage, nav, footer, auth shell, dashboard shell) - complete and deployed on eventlinqs.com
**Successor:** M4 Phase 2 (Reserved Seating with visual drag-drop seat builder)
**Execution model:** 6 phases, each an independent Claude Code session
**Estimated effort:** 8-9 Claude Code sessions across 3-4 evenings
**Primary goals:** Visual polish + conversion + SEO (all three compounding)
**Benchmark targets:** Beat DICE on personalisation, Eventbrite on transparency, Ticketmaster on voice, Resident Advisor on warmth.

---

## Vision - locked

EventLinqs is a ticketing platform with a soul. It was born to serve the African diaspora - Afrobeats, Amapiano, Owambe, Gospel, Comedy - because that community has been poorly served by generic platforms that treat a Beyoncé stadium tour the same as a Melbourne diaspora warehouse rave. But the product itself is universal. Any organiser, any city, any genre can use it. The diaspora is the founding audience, not the ceiling.

The positioning is **"Where the culture gathers."** Bold enough to mean something to the diaspora who feels seen. Universal enough that a pub-quiz organiser in Geelong can run their event on it without feeling out of place. That balance - emotional anchor with open arms - is what Ticketmaster, DICE, Eventbrite, and Resident Advisor all lack. They have scale without soul or soul without scale. EventLinqs has both.

M5 builds the public discovery surface that lets this vision show itself.

---

## Competitive truth - what we're up against and how we win

| Competitor | Their strength | Their weakness | How M5 beats them |
|---|---|---|---|
| DICE | Personalisation via Spotify sync, clean visual design, strong mobile app, anti-touting | Electronic music only, requires app to view tickets, no transparency on fees | Better diaspora taxonomy depth, web-first ticket access, transparent pricing page |
| Eventbrite | SEO dominance, scale, category landing pages, recommendations engine | Cluttered, slow, hidden fees, generic tone, dated visual design | Cleaner UI, transparent fees, distinct voice, faster pages |
| Ticketmaster | Brand trust, scale, exclusive content rights | Predatory fees, hostile UX, zero soul | Transparent pricing, organiser-friendly, community voice |
| Resident Advisor | Cultural authority for electronic music, strong editorial, sub-genre depth (80+ tags) | Electronic only, cold/exclusive tone, app-required for some features | Universal appeal beyond electronic, warmer voice, similar sub-genre depth for diaspora |

**The wedge:** No platform combines diaspora authority + universal appeal + transparency + warmth. We do.

---

## Pre-flight audit - what M4.5 already built

Before writing any new code, Claude Code must read the M4.5 manifest and confirm the following are live on production. If any are missing, they are implicit dependencies and must be flagged before M5 Phase 1 starts.

- Homepage (`/`) - hero "Where the culture gathers / MADE FOR THE DIASPORA", bento grid, This Week rail, Cultural Picks tabs, By City rail, Live Vibe marquee, For Organisers section, social proof, footer
- Main navigation - logo, primary nav links, search bar trigger, city selector, Sign In, Get Started CTA
- Footer - logo, 4 columns, social links, legal
- Auth shell - Sign In, Sign Up, Forgot Password, Reset Password
- Dashboard shell - `/dashboard` landing, events list, navigation
- Global design tokens - gold accent, dark navy primary, cream background, GlassCard dark variant at 85% opacity, spacing rhythm tokens, heading hierarchy, Australian English copy throughout
- Core components - `EventCard`, `GlassCard`, `EventlinqsLogo`, `Footer`, `Nav`, `SearchBar` trigger, heart save button wired to `saved_events` table with optimistic UI

M5 builds around these. It does NOT rebuild them. If any M5 phase accidentally conflicts with M4.5 styling, the M4.5 tokens win.

---

## What M5 delivers - 7 surfaces

| Route | Purpose | Phase |
|---|---|---|
| `/events` | Full browse with filters, sort, pagination, map view, recommendations | 1 |
| `/events/category/[slug]` + `/events/category/[slug]/[subgenre]` | Category + sub-genre landing pages | 2 |
| `/events/city/[slug]` | City landing pages with map | 2 |
| Global search modal | Full-screen search via nav search bar | 3 |
| `/organisers/[slug]` | Organiser public profile with follow primitive | 4 |
| `/venues/[slug]` | Venue public page | 4 |
| `/pricing` | Public pricing page with fee calculator | 5 |

Phase 6 is the close-out: full sitemap, integration verification, known-issues fixes, M5 tag.

---

## Cross-cutting requirements - apply to every phase

These are non-negotiable. Claude Code enforces them on every commit.

### Mobile-first
- Every page designed for 375px viewport first, scale up
- Bottom-anchored sticky action bar on mobile
- Top-anchored on desktop
- Touch targets minimum 44×44px
- Swipe-friendly horizontal carousels with momentum scroll
- Test at 375px, 768px, 1280px, 1920px viewports

### Performance architecture
- `/events`, `/events/category/*`, `/events/city/*` use Next.js ISR with 60-second revalidation
- `/organisers/*` and `/venues/*` use ISR with 5-minute revalidation
- `/pricing` is fully static (SSG)
- All event card images use `next/image` with blur placeholder and proper sizes
- Lighthouse mobile Performance >= 85, Accessibility >= 95, SEO >= 95 on every page
- LCP <= 2.5s on 3G, FID <= 100ms, CLS <= 0.1

### SEO
- Unique `<title>` and meta description per page tuned for search intent
- Open Graph + Twitter Card tags with event-appropriate imagery
- Schema.org `Event` markup on event cards and detail pages
- Schema.org `BreadcrumbList` on category, city, organiser, venue pages
- Schema.org `MusicGroup` or `PerformingGroup` on organiser pages where applicable
- XML sitemap auto-generated for all M5 routes
- Clean semantic HTML (`<article>`, `<section>`, `<nav>`, proper heading levels)
- Canonical URLs to prevent duplicate content (e.g., filtered URLs canonical to base)

### Accessibility
- All imagery has meaningful `alt` text or `alt=""` if decorative
- All interactive elements reachable by keyboard with visible focus rings
- Colour contrast >= 4.5:1 for body text, 3:1 for large text
- ARIA labels on icon-only buttons
- Respects `prefers-reduced-motion`
- Form fields have proper labels
- Error messages announced to screen readers via `aria-live`

### Voice
- Australian English (organiser, favourite, colour)
- Zero exclamation marks in user-facing copy
- Zero em-dashes or en-dashes in user-facing copy
- No marketing hype adjectives - show, don't tell
- Empty states have personality, not generic "No results found"
- Error states are helpful, not scary

### Visual standards
- Use only M4.5 design tokens - zero stale Tailwind classes (`bg-gray-*`, `bg-blue-*`)
- Gold reserved for primary CTAs and emotional emphasis copy
- Dark navy is brand surface, cream is background, white is elevated card
- All imagery is real (Pexels or user-uploaded), no placeholder gradients past local dev

---

## Phase 1 - `/events` Browse Page

### Goal
Build the production-grade events browse experience. Beats Eventbrite's `/d/` page on visual polish, beats DICE on category breadth, matches RA on filter sophistication, beats all on transparency.

### What gets built

**Hero strip (compact, ~30vh):**
- Page title "Browse events"
- One-sentence subtitle with city context: "Live experiences in Melbourne and beyond"
- City pill showing current city (tappable to change via city selector modal)
- Inline primary search input

**View toggle (NEW):**
- Grid view (default) | Map view toggle in top-right of results area
- Map view uses Mapbox GL JS (or Google Maps if Mapbox token isn't already in env vars - Claude Code checks)
- Map shows event pins with category-coloured markers
- Pin click opens compact event preview card with image, title, date, price, "View event" CTA
- Pin clustering at zoom-out levels
- Map pans to current city by default

**Date preset chips (PRIMARY, NEW positioning):**
Sticky horizontal chip row directly below nav. These are PRIMARY filters, not secondary:
- All / Today / Tomorrow / This Weekend / Next 7 days / This Month / Free
- Active state uses gold
- Chip changes apply immediately, reflect in URL
- Horizontal scroll on overflow

**Category chips (secondary chip row):**
- All / Afrobeats / Amapiano / Gospel / Comedy / Owambe / Highlife / R&B / Hip-Hop / House / Tech-House / (more as horizontal scroll)
- Same interaction pattern as date chips
- These respect the active sub-genre taxonomy from Phase 2

**Social proof badge system (NEW):**
Every event card across every M5 page renders one of these badges when conditions are met:
- "Selling fast" - when >70% of inventory sold
- "Few left" - when <10 tickets remaining
- "Just announced" - when event created <48h ago
- "Last chance" - when event starts <24h from now
- "Free" - when no paid tickets exist
- Badges render in top-left corner of `EventCard` component
- Logic lives in a server-side helper, not duplicated per page

**Recommended for you rail (NEW):**
Above the main grid when user has any signals:
- Title: "Recommended for you"
- 6-card horizontal carousel
- MVP logic: events from organisers the user has saved + events in categories the user has interacted with + events in their city
- Falls back to "Popular this week" if user has no signals
- Hidden if no events to show
- Wires into proper SmartLinq engine in M8, but ships M5 with this MVP

**Secondary filter panel (collapsible):**
- Price range slider
- Date range picker (for ranges beyond presets)
- Distance from city centre (km)
- Sort: Recommended / Date (soonest first) / Price low-high / Price high-low / Popularity
- Slide-up sheet on mobile, slide-in panel on desktop

**Events grid:**
- 1 col mobile, 2 col tablet, 3 col desktop, 4 col ultra-wide
- CSS Grid with `auto-fit minmax`
- Uses `EventCard` from M4.5 with the new badge system applied

**Pagination:**
- Infinite scroll via intersection observer (24 events per page)
- Numbered page links rendered server-side for SEO

**Empty state:**
- Illustrated empty state component (reuse or create)
- Copy: "Nothing matching that yet. Try clearing some filters."
- "Clear all filters" CTA + suggestions: "Browse Afrobeats", "Browse Melbourne", "Browse this weekend"

**Skeleton loading:**
- 6 placeholder cards while events fetch

### Acceptance criteria
- [ ] Filter chips sticky, scroll horizontally on overflow, keyboard-navigable
- [ ] Every filter reflects in URL (`?category=afrobeats&when=this-weekend&price_max=50`)
- [ ] Sort changes apply without full page reload
- [ ] Infinite scroll loads cleanly, no jank, no duplicate cards
- [ ] Map view toggles cleanly, pins cluster at zoom-out, pin click opens preview card
- [ ] Recommended for you rail shows when signals exist, hides when empty
- [ ] Social proof badges render correctly per logic rules
- [ ] Date presets work as PRIMARY filters
- [ ] Empty state illustrated and actionable
- [ ] Heart save button works for authed and guest users
- [ ] ISR with 60s revalidation configured and verified
- [ ] Lighthouse >= 85 / 95 / 95 on the deployed page

### Playwright verification
Browse with no filters, apply "Afrobeats" chip, apply "This Weekend" chip, change sort to Price low-high, toggle to Map view, click a map pin, close preview, switch back to Grid view, click into an event, return, clear all filters. Every step asserts URL state and rendered content.

### Estimated effort
1.5 Claude Code sessions.

---

## Phase 2 - Category + Sub-genre + City Landing Pages

### Goal
Build the SEO and discovery layer that drives organic traffic AND establishes EventLinqs as the AUTHORITY on diaspora music. This is where we beat RA on taxonomy depth (for non-electronic) and Eventbrite on visual polish.

### What gets built

**Sub-genre taxonomy (NEW - schema work first):**

Add to database:
```sql
CREATE TABLE category_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES category_taxonomy(id),
  display_order int,
  is_active boolean DEFAULT true,
  hero_image_url text,
  editorial_copy markdown,
  meta_title text,
  meta_description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_taxonomy_parent ON category_taxonomy(parent_id);
CREATE INDEX idx_taxonomy_slug ON category_taxonomy(slug);
```

Seed taxonomy at minimum with these primary categories and sub-genres:
- **Afrobeats** → Afroswing, Afrohouse, Afro-pop, Naija Pop, Highlife
- **Amapiano** → Pure House, Private School, Sgija, Soulful Amapiano
- **Gospel** → Contemporary Gospel, Traditional Gospel, Choir, Worship
- **R&B / Soul** → Neo-Soul, Contemporary R&B, Classic Soul
- **Hip-Hop** → UK Hip-Hop, Aussie Hip-Hop, Naija Hip-Hop, US Hip-Hop
- **House** → Deep House, Tech House, Soulful House, Afro House
- **Comedy** → Stand-Up, Improv, Sketch
- **Owambe** → (cultural celebration events - keep flat for now)
- **Cultural / Community** → Diaspora Festivals, Heritage Events
- **Other** → Any general category for non-music events (workshops, food, fitness, etc.)

This taxonomy expansion is what positions us as the diaspora authority. RA has 80+ electronic sub-genres. We have curated sub-genres across diaspora music genres they don't cover at all.

**Category page structure (`/events/category/[slug]`):**
- Hero with category-specific photography + editorial copy ("Afrobeats in Australia is having a moment. Here's where to be.")
- Sub-genre chip row directly below hero (Afrobeats parent → Afroswing / Afrohouse / Afro-pop / Naija Pop / Highlife chips)
- Recommended for you rail (same logic as Phase 1, scoped to this category)
- City filter chips
- View toggle (Grid / Map) - same component as Phase 1
- Primary events grid
- "Featured organisers in [Category]" carousel
- "Popular cities for [Category]" strip with mini-cards
- "Related categories" strip (Afrobeats → Amapiano, Highlife, Gospel)
- Schema.org `BreadcrumbList` and `CollectionPage` markup

**Sub-genre page structure (`/events/category/[slug]/[subgenre]`):**
- Same template as category page but scoped to sub-genre
- Hero copy and image specific to sub-genre
- Breadcrumb: Browse > Afrobeats > Afroswing
- Cross-link back to parent category at top

**City page structure (`/events/city/[slug]`):**
- Hero with real city photography (Pexels) + local copy ("Melbourne doesn't sleep when the Afrobeats come to town.")
- Category filter chips scoped to this city
- Recommended for you rail scoped to this city
- View toggle (Grid / Map) - map defaults to centred on this city
- Primary events grid
- "This weekend in [City]" featured strip (if events exist this weekend)
- "Popular venues in [City]" - surfaces venue cards (links to `/venues/[slug]` from Phase 4)
- "Popular categories in [City]" strip
- "Top organisers in [City]" carousel
- Schema.org markup

### Content approach
Editorial copy for top 5 categories, top 10 sub-genres, top 10 cities at launch is hand-written by you (or drafted in a separate Claude session). Stored in the `editorial_copy` column of `category_taxonomy` and a parallel `city_taxonomy` table.

Remaining slugs use a well-designed template that interpolates real data: event count, top organiser names, popular venue names. Still feels crafted, not generic.

### Acceptance criteria
- [ ] `category_taxonomy` schema deployed with seed data
- [ ] `city_taxonomy` schema deployed with seed data for Melbourne, Sydney, Brisbane, Perth, Adelaide, London, Manchester, Birmingham, Toronto, Lagos, Accra, Nairobi, plus 5 more US/UK cities
- [ ] Each category slug, sub-genre slug, and city slug renders unique page
- [ ] Invalid slugs return helpful 404 with suggestions
- [ ] Cross-linking between category, sub-genre, and city pages works correctly
- [ ] Hero imagery loads fast via `next/image` with blur placeholder
- [ ] Schema.org markup verified via Google Rich Results Test for one category, one sub-genre, one city page
- [ ] ISR 60s revalidation configured
- [ ] Lighthouse >= 85 / 95 / 95
- [ ] Map view in city pages defaults to that city's centre

### Playwright verification
Visit `/events/category/afrobeats`, click sub-genre chip "Afroswing", confirm URL becomes `/events/category/afrobeats/afroswing`, confirm event grid filters correctly, click city filter "Melbourne", confirm URL adds `?city=melbourne`, navigate to `/events/city/melbourne`, confirm Afrobeats category chip is available, click it, confirm scope persists.

### Estimated effort
2 Claude Code sessions. Editorial copy drafting is ~30 min of your time per top-tier slug.

---

## Phase 3 - Global Search Modal

### Goal
Build the full-screen search experience triggered by the M4.5 nav search bar. Beats DICE's search on result grouping, beats Eventbrite on speed, matches Linear's command menu on interaction polish.

### What gets built

**Modal shell:**
- Full-screen on mobile, large centered card on desktop (max 720px wide)
- Opens via portal over any page
- Triggered by: nav search bar click, Cmd+K (Mac) / Ctrl+K (Win) keyboard shortcut globally
- Opens in <100ms (preloaded)
- Close via Escape, X button, click outside (desktop), back swipe (mobile)

**Search input:**
- Autofocused when opened
- Clear button when text present
- Debounced to 150ms before triggering search

**Empty state (no query):**
- "Recent searches" section (max 5, stored in localStorage)
- "Popular searches" section (curated list from a `popular_searches` table - admin-managed)
- Shortcuts: "Browse by category" → links to `/events`, "Browse by city" → city selector

**Results state:**
Three sections, each collapsible:
- **Events** - event cards (compact: title, date, city, price, image thumbnail)
- **Organisers** - organiser cards (avatar, name, event count, verified badge)
- **Cities & Categories** - text-only with event counts

Each section shows max 5 results with "See all X events" / "See all X organisers" / "See all matching" CTAs that link to filtered browse pages.

**Live results as you type:**
- Powered by Supabase full-text search (MVP)
- Search across: event titles, event descriptions, organiser names, venue names, city names, category names
- Meilisearch hook prepared for M9 upgrade (architectural decision: search query goes through a `searchEvents` server action that can swap implementation)

**Keyboard navigation:**
- Arrow up/down to move through results
- Tab to jump between sections
- Enter to select and navigate
- Escape to close

**No-results state:**
- Copy: "Nothing matches '[query]' yet."
- Show "Trending events" rail as fallback
- "Try browsing by category or city" with shortcuts

### Acceptance criteria
- [ ] Modal opens in <100ms from search bar click
- [ ] Cmd/Ctrl+K opens it globally
- [ ] First results appear within 300ms of typing stopping
- [ ] Keyboard-only navigation works end-to-end
- [ ] Result clickthrough navigates to correct route
- [ ] Recent searches persist across sessions in localStorage
- [ ] Mobile takes full screen with clear close affordance
- [ ] Three sections (Events / Organisers / Cities & Categories) populate independently
- [ ] Empty state and no-results state both render correctly
- [ ] Lighthouse Accessibility >= 95 (keyboard nav, ARIA labels, focus trap)

### Playwright verification
Open modal via search bar, type "afro", verify Events section shows results within 300ms, verify Organisers section populates, arrow-down 3 times to highlight an organiser result, Enter, confirm navigation to `/organisers/[slug]`. Reopen with Cmd+K, verify recent search "afro" appears, click it, confirm results restore.

### Estimated effort
1.5 Claude Code sessions.

---

## Phase 4 - Organiser Profiles + Venue Pages

### Goal
Build the trust-and-discovery layer for organisers and venues. These pages are where buyers form trust and where organisers/venues anchor their brand. They drive organic shares (Instagram bios, WhatsApp broadcasts, flyer QR codes).

### What gets built - Organiser Profile (`/organisers/[slug]`)

**Cover image hero:**
- Organiser-uploaded banner (16:9 aspect ratio, recommended 2160×1215)
- Falls back to branded gradient if not uploaded
- Subtle dark overlay for legibility

**Profile header:**
- Organiser logo/avatar (circular, 96px on mobile, 128px on desktop)
- Organiser name (H1)
- Verified badge if `verified=true` in organisations table
- One-line tagline (from organiser settings)
- City/base location with pin icon
- Social links (Instagram, TikTok, Twitter, website) as icon row
- **Follow button (NEW - real primitive, not stubbed):**
  - Authed users: "Follow" / "Following" toggle, optimistic UI
  - Guest users: opens login modal with copy "Sign in to follow [Organiser]"
  - Wires to new `organiser_follows` table:
    ```sql
    CREATE TABLE organiser_follows (
      user_id uuid REFERENCES auth.users(id),
      organiser_id uuid REFERENCES organisations(id),
      followed_at timestamptz DEFAULT now(),
      PRIMARY KEY (user_id, organiser_id)
    );
    ```
- Share button (native share API on mobile, copy-link on desktop)

**Trust signals strip (NEW):**
- "X events run" (count from events table)
- "Y followers" (count from organiser_follows)
- "Member since [year]" (from organisation created_at)
- "Verified" badge if applicable
- "Responds within X" (placeholder for M11 - show only if data exists, hide otherwise)

**About section:**
- Organiser-written bio with markdown support
- "Show more" expand if >300 characters
- Stored in organisation profile fields

**Upcoming events grid:**
- Uses `EventCard` component with social proof badges
- Up to 12 events visible, "See all upcoming" CTA if more
- Empty state: "No upcoming events from [Organiser] yet. Follow them to be the first to know."

**Past events strip:**
- Horizontal scroll, muted styling (60% opacity)
- "Reflects events run on EventLinqs" caption
- Links to event detail pages (which show as "Past event" state)

**Reviews section:**
- Stub with proper trust language: "X events successfully run. Average response time: Z." (from data we already have)
- "Reviews coming soon" panel for future M7 integration
- Hide entirely if zero events run

**Contact / booking enquiry CTA:**
- Only renders if organiser has enabled "accept booking enquiries" in settings
- Opens enquiry modal with form (name, email, event type, message, date)
- Form submits to organiser via Resend email
- Honeypot + rate limit (3 enquiries per IP per day)

### What gets built - Venue Page (`/venues/[slug]`)

**Schema (new):**
```sql
ALTER TABLE venues ADD COLUMN slug text UNIQUE;
ALTER TABLE venues ADD COLUMN cover_image_url text;
ALTER TABLE venues ADD COLUMN about markdown;
ALTER TABLE venues ADD COLUMN website_url text;
ALTER TABLE venues ADD COLUMN social_links jsonb;
-- generate slugs from name + city for existing venues
```

**Page structure:**
- Cover image hero (venue photo, fallback to branded)
- Venue name (H1)
- Address with map pin
- Capacity, accessibility info
- About section
- "Upcoming events at [Venue]" grid (uses EventCard with badges)
- "Past events at [Venue]" strip (muted)
- "Other venues nearby" strip
- Get directions button (links to Google Maps / Apple Maps)
- Schema.org `Place` markup

### Acceptance criteria
- [ ] `organiser_follows` table created with RLS policies
- [ ] Follow button works for authed users with optimistic UI
- [ ] Guest follow attempt opens login modal correctly
- [ ] `venues` table updated with slug + new columns
- [ ] Slug generation script run for existing venues
- [ ] Both pages load in <2s even for organisers/venues with 50+ events
- [ ] Slug-based routing works (`/organisers/tasknora`, `/venues/melbourne-showgrounds`)
- [ ] Share button generates proper OG tags
- [ ] Trust signals strip renders correctly with real data
- [ ] Booking enquiry form submits to Resend correctly with honeypot working
- [ ] ISR 5-minute revalidation configured
- [ ] Lighthouse >= 85 / 95 / 95

### Playwright verification
Visit a known organiser slug, confirm hero renders, click Follow button as guest (confirm login modal), close modal, log in as test user, click Follow again (confirm optimistic UI), refresh, confirm "Following" state persists. Click into one of the organiser's events. Click venue link from event detail, confirm `/venues/[slug]` renders, confirm upcoming events shown.

### Estimated effort
2 Claude Code sessions (1 for organiser profile, 1 for venue page + follow primitive).

---

## Phase 5 - Pricing Page

### Goal
Ship the single most powerful conversion weapon EventLinqs has against Eventbrite and Ticketmaster - radical fee transparency.

### What gets built

**Hero:**
- H1: "Simple, transparent pricing"
- Sub: "Pay only when you sell. No setup fees. No hidden charges."
- Direct contrast with competitors' opacity

**Three pricing tier cards:**

| | Free events | Standard events | Enterprise |
|---|---|---|---|
| Platform fee | 0% | 5% | Custom |
| Stripe processing | N/A | 2.9% + 30c | Custom |
| Max tickets | Unlimited | Unlimited | Unlimited |
| Reserved seating | ✓ | ✓ | ✓ |
| Marketing tools | ✓ | ✓ | ✓ + dedicated support |
| Multi-currency | ✓ | ✓ | ✓ |
| Custom branding | - | ✓ | ✓ |
| Dedicated account manager | - | - | ✓ |
| CTA | Get started | Get started | Talk to sales |

**Organiser-absorb / pass-to-buyer toggle visualisation:**
A toggle below the Standard card showing how the fee appears to the buyer:
- Toggle ON (organiser absorbs): "Buyer sees AUD 50.00 - you receive AUD 45.95"
- Toggle OFF (pass to buyer): "Buyer sees AUD 52.74 - you receive AUD 50.00"
- Real numbers update as user toggles. Reads from `pricing_rules` table.

**Fee calculator widget (the conversion weapon):**
- Input: Ticket price (AUD/USD/GBP/etc), Quantity sold
- Output table:
  - Gross revenue
  - EventLinqs fee (5%)
  - Stripe fee (2.9% + 30c)
  - You receive
  - Buyer pays (if pass-through)
- Updates live as user types
- "Run the numbers for your event" CTA

**Included features matrix:**
Three columns (Free / Standard / Enterprise), feature rows with tick marks. Clean, scannable.

Features to list:
- Unlimited events
- Unlimited tickets
- General admission ticketing
- Reserved seating
- Dynamic pricing
- Squad bookings
- Waitlists
- Virtual queue
- QR code tickets
- Mobile check-in
- Stripe payments
- Multi-currency
- Refund management
- Discount codes
- Email confirmations
- Sales analytics
- Attendee management
- Marketing emails
- Custom branding
- API access
- Dedicated support
- White-glove onboarding

**Comparison table - EventLinqs vs Competitors:**

| | EventLinqs | Eventbrite | Ticketmaster |
|---|---|---|---|
| Platform fee | 5% | 3.7% + $1.79/ticket | 10-25% |
| Payment processing | 2.9% + 30c | 2.9% + 30c | Variable |
| Service fees to buyer | Optional pass-through | Hidden, large | Predatory |
| Payout speed | 7 days after event | 4-5 business days after event | 5-10 days after event |
| Free events | Free | Free | N/A |
| Diaspora community focus | ✓ | - | - |
| Transparent fee calculator | ✓ | - | - |

(Verify all competitor numbers via web search before committing - they change.)

**FAQ section (accordion):**
- "When do I get paid after my event?"
- "What happens if I need to refund a buyer?"
- "Is there a setup fee?"
- "Can I change my pricing model after launching my event?"
- "What payment methods do you support?"
- "Do you charge for free events?"
- "What's your refund policy for organisers?"

**CTA strip at bottom:**
- "Ready to sell?" headline
- "Get started" primary button → `/signup?source=pricing`
- "Talk to sales" secondary button → `/contact?source=pricing-enterprise`

### Acceptance criteria
- [ ] Three tier cards render cleanly at all viewports
- [ ] Toggle visualisation shows real numbers from `pricing_rules` table
- [ ] Fee calculator returns correct results, validated against actual checkout fees
- [ ] FAQ accordion is keyboard-accessible
- [ ] Comparison table is factually defensible (competitor numbers verified within last 30 days)
- [ ] Primary CTAs link to `/signup?source=pricing` and `/contact?source=pricing-enterprise`
- [ ] Page is fully static (SSG)
- [ ] Lighthouse >= 90 / 95 / 95 (higher Performance bar since it's static)

### Playwright verification
Load `/pricing`, verify three tier cards render, toggle organiser-absorb, verify numbers update, enter "100" in fee calculator quantity, "50" in price, verify You Receive shows correct calculation. Click each FAQ accordion, verify expand/collapse. Click primary CTA, verify navigation to `/signup?source=pricing`.

### Estimated effort
1 Claude Code session.

---

## Phase 6 - M5 Close-Out

### Goal
Tie off M5 with full integration verification, sitemap generation, known-issues fixes, and the m5-close-out git tag.

### What gets done

**Sitemap and SEO finalisation:**
- Auto-generate `sitemap.xml` covering all M5 routes
- Add `robots.txt` with proper crawl directives
- Submit sitemap to Google Search Console
- Verify Schema.org markup on one event, one organiser, one venue, one category, one city page via Google Rich Results Test

**Integration verification:**
- All 7 M5 surfaces load without errors
- All cross-links between M5 pages resolve correctly
- Heart save works from every event card on every page
- Follow button works from every organiser surface
- Search modal opens from every page's nav
- Map view works on browse + city pages
- Recommended for you rails populate correctly

**Known-issues fixes from P0 close-out report:**
1. **Supabase Auth emails via Resend SMTP** - Configure Supabase Dashboard → Auth → SMTP Settings to use Resend API. All auth emails (password reset, email confirmation, magic links) now come from `noreply@eventlinqs.com` with proper EventLinqs branding.
2. **Vercel `/events` caching alert** - Verify ISR is working correctly via Vercel logs. Run the Facebook crawler simulation: 100 concurrent requests to `/events` and confirm Supabase doesn't get hammered.
3. **Step C authed smoke** - Now that Supabase Auth is properly configured for password resets, run the deferred authed smoke from the P0 close-out. Reset admin password, log in, verify dashboard, test authed checkout, save flow, logout.

**Performance audit:**
- Run Lighthouse on every M5 route, capture scores in a table
- Run WebPageTest on `/events` and `/events/city/melbourne` for 3G performance
- Capture LCP, FID, CLS metrics
- File any items >85 perf as follow-up tickets

**Final E2E Playwright test:**
Start at homepage, click Browse Events, filter by Afrobeats, toggle to Map view, click a pin, click "View event", view event detail, click organiser name, view organiser profile, click follow (as authed user), click into upcoming event, reach checkout, complete with test card, verify confirmation page and email.

**Git tag and merge:**
- Tag `m5-close-out` on main
- Update CHANGELOG.md with M5 summary
- Update known-issues list with anything that emerged during M5

### Acceptance criteria
- [ ] sitemap.xml live at `/sitemap.xml` and includes all M5 routes
- [ ] robots.txt live and correct
- [ ] All 5 Schema.org types pass Google Rich Results Test
- [ ] All M5 routes verified working in production
- [ ] Supabase Auth emails now come from Resend (`noreply@eventlinqs.com`)
- [ ] Authed smoke (Step C from P0 close-out) passes
- [ ] Lighthouse scores captured for every M5 route
- [ ] Final E2E Playwright test passes
- [ ] Git tag `m5-close-out` pushed
- [ ] CHANGELOG.md updated

### Estimated effort
1 Claude Code session.

---

## Execution order - locked

| Phase | Builds | Sessions | Notes |
|---|---|---|---|
| 1 | `/events` browse with map, recommendations, badges, date presets | 1.5 | Most visible page, unlocks downstream |
| 2 | Category + sub-genre + city landing pages | 2 | SEO gold, taxonomy depth = diaspora authority |
| 3 | Global search modal | 1.5 | Discovery layer, ties M1+M2 surfaces together |
| 4 | Organiser profiles + venue pages + follow primitive | 2 | Trust layer, organic share growth |
| 5 | Pricing page | 1 | Conversion weapon, transparency wedge |
| 6 | Close-out: sitemap, known-issues, smoke | 1 | Tie off and tag |
| **TOTAL** | | **9** | Spread across 3-4 evenings |

---

## What M5 deliberately does NOT include

To keep scope honest:
- No reviews/ratings UI (M7 - community)
- No SmartLinq full recommendations engine (M8 - uses MVP recommendation logic only)
- No push/email marketing infrastructure (M10)
- No organiser analytics dashboard (M11)
- No admin panel work (M12)
- Reserved seating visual drag-drop builder - that's M4 Phase 2 immediately after M5
- Resale market - that's M11
- Friends-going social signal - deferred to M7 (but `organiser_follows` schema designed to extend)

---

## How M5 sets up the future

After M5 ships, the platform has:
- Full public discovery surface that beats DICE on category breadth, beats Eventbrite on visual polish, beats Ticketmaster on transparency, matches RA on filter sophistication
- Real personalisation MVP that proves out the SmartLinq architecture for M8
- Organiser+venue pages that drive organic growth via shares
- Sub-genre taxonomy that establishes EventLinqs as the diaspora authority (no competitor has this depth for Afrobeats/Amapiano/Gospel)
- Pricing transparency as a permanent competitive wedge
- Search infrastructure ready to swap in Meilisearch in M9

---

## Approval

Lawal reviews this scope, flags anything for tightening, and approves. Once approved, Claude Code receives the Phase 1 command. Build begins.

**This scope is the blueprint to beat Ticketmaster.**
