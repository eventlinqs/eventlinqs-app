---
name: seed-events
description: Use when seeding or populating EventLinqs with realistic sample events, filling an empty discovery surface or a launch city with a catalogue across all event categories, or building demo data from a local stock-image library.
---

# seed-events

## Overview

Seed EventLinqs with a realistic Australian catalogue that makes every
discovery surface look live and world-class. The catalogue spans all general
categories plus scenes, per launch city, with real venues, real dates, and
optimised imagery from a local stock library. Read `CLAUDE.md` first.

Core principle: a seed is a shipped surface. The same laws apply. No generic
copy, no placeholder imagery, no em-dashes, Australian English throughout.

## Governing laws (read before you seed - Law 0)

`CLAUDE.md` is the constitution; read it first and state which laws govern the
task. A seed is governed by Law 0, Law 1 (no generic), Law 3 (Australia-smart
taxonomy), Law 5 (zero dead links), the Scene layer, and Media architecture. On
any conflict, `CLAUDE.md` and the code win.

**One source of truth (Law 5).** The events a discovery surface renders and the
events its detail routes resolve must be the SAME set. If the homepage is served
from a fixture (`HOMEPAGE_SEED_FIXTURE=1`), every fixture slug must resolve to a
real detail page, or the cards 404 on click. Never seed density into one source
(a fixture) while detail reads another (the DB) - that is the Potemkin facade
the zero-dead-links law forbids. After seeding, prove it by clicking, or by
running `scripts/link-integrity-crawl.mjs`, not by a hand-picked slug.

## Inputs

- A local stock-image folder that Lawal provides. Treat it as the only image
  source; never hotlink or generate images.
- The launch city or cities to populate.
- The real category and scene list (below).

## Workflow

1. **Scope.** Pick the cities and decide the count per category so each rail
   reads full, not sparse. Default to local seeding only; touch the production
   Sydney database only on explicit instruction.

2. **Categories and scenes.** Use the real `event_categories` slugs, never an
   invented one. Cover all general types: `sports`, `music`, `arts-culture`
   (theatre and comedy live here as genre, not as their own category),
   `family`, `festival`, `food-drink`, `nightlife`, `business-networking`. Then
   add the scene layer as the EventLinqs differentiator on top, roughly 10 to 20
   percent. Seed scenes only from the locked V2 national list in `CLAUDE.md`
   (Scene layer). Music and sound first: Electronic & Dance, Country, Indie &
   Rock, Hip-Hop & RnB, Pop, Folk & Acoustic, Blues & Roots, Afrobeats &
   Amapiano, Latin, Caribbean & Dancehall, Jazz & Soul, Metal & Hardcore. Then
   community and culture: First Nations, South Asian, Asian, Pasifika & Maori,
   Mediterranean, Pride, Faith & Worship. Business & Networking is a general
   category, never a scene. Per Law 3, re-verify the taxonomy against current
   Australian market data; never inherit it from an old draft.

3. **Real content.** Each event needs a real Australian venue, a sensible
   future date and time, an organiser, and ticket tiers with realistic prices
   (including some free events). Write distinctive titles and descriptions in
   Australian English. No filler, no "Sample Event 1".

4. **Imagery pipeline (photo day).** The founder runs `scripts/ingest-imagery.mjs`
   per `docs/PHOTO-DAY.md`: drop licensed photos into `design-assets/incoming/`
   named `role__key__city__descriptor.jpg` (role in hero/category/scene/city/
   venue; an existing `hero/ categories/<cat>/ cities/ scenes/<scene>/ venues/`
   tree is also read), run one command. It validates each source against a
   dimension + quality floor, converts to responsive AVIF at the locked sizes,
   uploads to the `event-images` storage bucket, and writes the manifest
   `supabase/seed/imagery-map.json`. The script is storage-only and structurally
   cannot touch a database row. Pick a fitting image per event from the manifest
   by its slot (`role`, `key`, `city`, `descriptor`) and set `cover_image_url` /
   `thumbnail_url` to the mapped `url` (or the entry `default`). A published event
   must carry a real cover: the `events_published_real_cover` constraint rejects
   placeholders. Feature surfaces render these through `EventCardMedia` and
   `HeroMedia`, so never wire raw `<img>` or `next/image`. The bucket must allow
   `image/avif` first (see `docs/PHOTO-DAY.md`, prerequisites).

5. **Write the seed.** Put the inserts in a migration file (or a seed script),
   never run ad-hoc writes against a live database. Keep it idempotent and
   re-runnable.

6. **Apply.** Lawal applies migrations with `supabase db push --linked` in
   PowerShell. Never the Dashboard, never the MCP. For local work, seed the
   local stack.

7. **Verify.** Confirm the rows exist (direct database query, not the cached
   client), then load the discovery surfaces and check every rail fills with
   real imagery, real copy, and no broken images. Then click through: every
   seeded card must resolve to a working detail page (Law 5). Run
   `scripts/link-integrity-crawl.mjs` for the automated proof of zero dead links.

## Category and scene coverage

| Layer | Slugs / examples |
|---|---|
| General (the spine) | sports, music, arts-culture, family, festival, food-drink, nightlife, business-networking |
| Genre within arts-culture | comedy, theatre, film |
| Scene - music and sound (V2, locked) | Electronic & Dance, Country, Indie & Rock, Hip-Hop & RnB, Pop, Folk & Acoustic, Blues & Roots, Afrobeats & Amapiano, Latin, Caribbean & Dancehall, Jazz & Soul, Metal & Hardcore |
| Scene - community and culture (V2, locked) | First Nations (first), South Asian, Asian, Pasifika & Maori, Mediterranean, Pride, Faith & Worship |

## Data rules

- Real AU venues and suburbs, real future dates, plausible capacities and
  prices. Mix paid and free events.
- Distinctive, specific copy per event. Never templated or numbered.
- Australian English, community-first language, no em-dashes or en-dashes, no
  banned words (diaspora, friends-launch).
- Spread events across the next weeks so This Week, This Weekend, and Trending
  all have content.

## Common mistakes

- Inventing a category slug instead of using the real `event_categories` list.
- Letting scenes dominate the catalogue. They are a layer, not the spine.
- Seeding the live Sydney database to dress up a benchmark. Local only unless
  told otherwise.
- Setting `cover_image_url` to a placeholder or skipping AVIF optimisation.
- Generic titles, copy, or prices. Every event reads like a real one.
- Seeding density into a fixture whose slugs the detail route cannot resolve, so
  every card 404s on click (Law 5). Density and detail share one source of truth.
