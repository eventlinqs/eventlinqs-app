# EventLinqs: Genre Discovery Foundation Spec

Author: Strategic planning session, 28 May 2026
Status: Ready for Claude Code (data layer build)
Authoritative scope reference: docs/SCOPE-v5.md
Positioning: community-first, platform open to all events. Music genre discovery is one discovery surface among many.

Copy and code style rules (NON-NEGOTIABLE):
- No em-dashes or en-dashes anywhere. Hyphens, colons, pipes, commas only.
- Australian English throughout (organiser, colour, centre, catalogue).
- No exclamation marks in copy.

---

## 1. Purpose

Build the data layer that powers music genre discovery, so a fan who loves a genre or an artist can find the right events, and so those events rank in Google. This is a moat foundation, not the moat itself. The moat compounds after launch through usage, retention, and accumulated taste data.

This spec deliberately covers the DATA LAYER ONLY. The visual browse page UI is out of scope here because it depends on the designer (Rizwan Ali) Figma delivery. Per the locked design-consistency rule, Claude Code must NOT improvise the browse page visual design. Build the data, routing, and SEO scaffolding now; drop the designed UI on top later.

---

## 2. The split: build now vs build after Rizwan delivers

### Build NOW (this spec, no designer needed)
1. Genre taxonomy: seed the fixed parent-genre and sub-genre catalogue (section 3).
2. Artist data model: artists, event-to-artist lineup relationship (section 4).
3. Follow data model: a user follows artists and sub-genres (section 5).
4. URL and routing structure for SEO browse pages (section 6), rendered with a temporary minimal unstyled layout that reuses existing event-card components. No new visual design.
5. Tagging on event creation: organiser selects parent genre plus sub-genre, and attaches artists.

### Build AFTER Rizwan delivers (separate later prompt)
1. The polished browse and discovery page UI (filter-first, genre nav).
2. The genre-chip and artist-chip visual components.
3. The artist profile page visual (can reuse the organiser-profile layout pattern).
4. The personalised follow-feed UI surface.

The data built now must be structured so the designed UI later consumes it without a re-architecture.

---

## 3. The Australian genre taxonomy

Two levels: parent genre, then sub-genres. This list is adapted for the Australian market and deliberately includes genres the US-centric lists (for example Eventbrite) miss, such as Afrobeats and Amapiano. Beating Eventbrite on Australian genre depth is an explicit goal: Eventbrite limits sub-genre browse to US events only.

Seed these as data (not hardcoded in components) so they can be extended without a deploy. Each entry needs: a stable slug (lowercase, hyphenated), a display name (Australian English, sentence case), and a parent reference.

### Electronic and dance
- House (`house`)
- Techno (`techno`)
- Drum and bass (`drum-and-bass`)
- Dubstep (`dubstep`)
- Trance (`trance`)
- Garage (`garage`)
- Hardstyle (`hardstyle`)
- Disco (`disco`)
- EDM (`edm`)

### Hip hop and rap
- Hip hop (`hip-hop`)
- Trap (`trap`)
- Drill (`drill`)
- Boom bap (`boom-bap`)
- Grime (`grime`)

### African
- Afrobeats (`afrobeats`)
- Amapiano (`amapiano`)
- Afro house (`afro-house`)

### R and B and soul
- R and B (`rnb`)
- Soul (`soul`)
- Funk (`funk`)
- Neo soul (`neo-soul`)

### Pop
- Pop (`pop`)
- Top 40 (`top-40`)
- Synth pop (`synth-pop`)

### Rock and alternative
- Rock (`rock`)
- Indie (`indie`)
- Alternative (`alternative`)
- Punk (`punk`)
- Hardcore (`hardcore`)

### Metal
- Metal (`metal`)
- Heavy metal (`heavy-metal`)
- Metalcore (`metalcore`)

### Jazz and blues
- Jazz (`jazz`)
- Blues (`blues`)
- Swing (`swing`)

### Reggae and Caribbean
- Reggae (`reggae`)
- Dancehall (`dancehall`)
- Ska (`ska`)

### Latin
- Latin (`latin`)
- Reggaeton (`reggaeton`)
- Salsa (`salsa`)

### Country and folk
- Country (`country`)
- Folk (`folk`)
- Americana (`americana`)
- Bluegrass (`bluegrass`)

### Classical
- Classical (`classical`)
- Opera (`opera`)
- Orchestral (`orchestral`)

### World and other
- World (`world`)
- Acoustic (`acoustic`)
- Singer-songwriter (`singer-songwriter`)
- Experimental (`experimental`)

Notes:
- Parent genres are the top-level group; sub-genres are what fans browse.
- Keep the seed in a migration plus a seed file so it is reproducible across environments.
- Community free-text tags (the hyper-specific layer, for example "underground boom bap") are a fast-follow per the MOAT strategy. The schema should allow a future free-text tag table without rework, but do not build the tag UI now.

---

## 4. Artist data model

Artists are first-class entities so the platform can do artist-level discovery (the dominant discovery engine industry-wide) once scale arrives.

### Table: artists
- `id` uuid primary key
- `slug` text unique not null (lowercase, hyphenated, generated from name)
- `name` text not null
- `bio` text nullable
- `image_url` text nullable
- `spotify_url` text nullable (for future Bandsintown / Spotify sync; store now, use later)
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

### Table: event_artists (join, the lineup)
- `id` uuid primary key
- `event_id` uuid references events(id) on delete cascade
- `artist_id` uuid references artists(id) on delete cascade
- `billing_order` int default 0 (headliner = 0, support acts ascending)
- unique (`event_id`, `artist_id`)

RLS:
- artists: public read; insert and update restricted to authenticated organisers and admin.
- event_artists: public read; write restricted to the owning organiser of the event and admin.

---

## 5. Follow data model

A user follows artists and sub-genres. This is the taste signal that powers the launch follow-feed without needing Spotify.

### Table: follows
- `id` uuid primary key
- `user_id` uuid references auth.users(id) on delete cascade
- `followable_type` text not null check in ('artist', 'subgenre')
- `followable_id` text not null (artist uuid as text, or subgenre slug)
- `created_at` timestamptz default now()
- unique (`user_id`, `followable_type`, `followable_id`)

RLS:
- follows: a user can read, insert, and delete only their own rows. Admin can read all.

Feed query (launch version, simple and robust):
- Return upcoming events where the event has an artist the user follows, OR the event sub-genre is one the user follows, ordered by event start date ascending, deduplicated, with city filter applied.
- No machine-learning ranking at launch. Plain SQL. Robust and fast.

---

## 6. URL and SEO structure

Clean, crawlable, human-readable paths. These pages are search-engine landing pages as much as on-site filters. The structure matters for ranking in Google for queries like "electronic concerts Melbourne".

Patterns:
- Parent genre, all cities: `/music/{parent-slug}` (example `/music/electronic`)
- Sub-genre, all cities: `/music/{sub-slug}` (example `/music/techno`)
- Sub-genre in a city: `/music/{sub-slug}/{city-slug}` (example `/music/techno/melbourne`)
- Artist page: `/artists/{artist-slug}`

Each page must emit:
- A unique, descriptive `<title>` and meta description in Australian English (no em-dashes).
- Open Graph tags (reuse the existing OG component pattern, no localhost leaks per PR #9).
- JSON-LD structured data: `MusicEvent` schema for event listings, `MusicGroup` for artist pages.
- Server-side rendering for crawlability. No client-only event lists on these routes.
- A canonical URL to avoid duplicate-content penalties across the all-cities and per-city variants.

City slugs reuse the existing city set already in the platform. Do not invent new cities.

Temporary layout for this build: render the listing with the existing event-card component in a plain responsive grid, plus a basic genre and city selector. Mark this clearly in code as a temporary pre-design layout to be replaced by the Rizwan-designed browse page. Do NOT style it beyond the existing tokens. Do NOT improvise new design.

---

## 7. Migration workflow (locked rules)

- All schema changes via `supabase db push --linked` from the PowerShell terminal only.
- Never the Dashboard SQL editor. Never MCP apply_migration (MCP is read-only permanently).
- Before starting, run `npx supabase migration list --linked` and reconcile local against remote applied.
- After applying, regenerate types: `supabase gen types typescript --linked` and reconcile with src/types/database.ts (this also progresses the locked task of moving off the handwritten types file).
- One migration per logical change: taxonomy seed, artist tables, event_artists, follows. Separate, reversible, named clearly.

---

## 8. Scope manifest (Claude Code discipline)

Authorised to create or modify:
- New Supabase migration files for: genre taxonomy tables and seed, artists, event_artists, follows.
- New route files under the genre and artist URL patterns in section 6 (temporary unstyled layout only).
- The event creation and edit forms, to add parent-genre plus sub-genre selection and artist attachment.
- src/types/database.ts (regenerate only).
- Seed file for the taxonomy.

Do NOT touch:
- Homepage.tsx, EventDetail.tsx visual design or tokens.
- Checkout, payment, webhook, or refund logic (separate hardening track).
- The Sentry or observability layer.
- Any component visual styling beyond reusing existing tokens.
- The designer-facing pages pending Rizwan delivery.

If a change is needed outside this manifest, stop and ask before proceeding.

---

## 9. Robustness and acceptance criteria

Per the EventLinqs Robustness Standard: every component works 24/7, zero broken states, verified end to end in production before called done. No partial fixes. No "works locally fails in prod".

Acceptance criteria, all must pass:
1. An organiser can create an event, select a parent genre and sub-genre, and attach one or more artists with a billing order.
2. A genre browse route (for example `/music/techno/melbourne`) returns the correct upcoming events, server-side rendered, with valid title, meta, OG, and JSON-LD.
3. An artist route (`/artists/{slug}`) returns the artist and their upcoming events.
4. A signed-in user can follow and unfollow an artist and a sub-genre, and the follow-feed query returns the correct events.
5. RLS verified: a user cannot read or write another user's follows; a non-owner cannot edit an event lineup.
6. All migrations apply cleanly via `supabase db push --linked` and `migration list` shows no drift.
7. Types regenerated, typecheck passes, lint passes, vitest passes.
8. Lighthouse on the new routes meets the production threshold; SSR confirmed (no client-only list).
9. Every CI check green before merge. No gh pr merge --admin. PR follows docs/development/pr-process.md.
10. Verified live in production with a real test event, real artist, real follow, before this is called done.

---

## 10. What this unlocks (the moat foundation)

Once this data layer is live:
- The genre browse engine (the buildable 30 percent of discovery) is real and beats Eventbrite on Australian genre depth.
- The artist data model is in place, so artist pages, artist-level discovery, and a future Bandsintown / Spotify event sync can be added without re-architecture.
- The follow-feed gives a launch-day personalised surface powered by the platform's own community taste signal, no streaming deal required.
- Community tags and curator and DJ ambassador collections (the fast-follow moat layers) have a schema that can extend to them cleanly.

This is the foundation the moat compounds from after launch. Ship it robustly, then let it compound.
