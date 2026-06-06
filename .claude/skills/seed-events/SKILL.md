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
   percent. Seed scenes only from the locked national list in `CLAUDE.md`
   (Scene layer), First Nations first: First Nations, South Asian, Asian,
   Pasifika & Maori, Afrobeats & Amapiano (Owambe within), Latin, Pride,
   Mediterranean, Faith & Worship (Gospel within), Caribbean. Business &
   Networking is a general category, never a scene. Per Law 3, re-verify the
   taxonomy against current Australian market data; never inherit it from an old
   draft.

3. **Real content.** Each event needs a real Australian venue, a sensible
   future date and time, an organiser, and ticket tiers with realistic prices
   (including some free events). Write distinctive titles and descriptions in
   Australian English. No filler, no "Sample Event 1".

4. **Imagery pipeline.** Run `scripts/ingest-imagery.mjs` against the provided
   stock-library folder (`hero/`, `categories/*`, `cities/`, `scenes/*`,
   `venues/`). It converts each image to responsive AVIF, uploads to the
   `event-images` storage bucket, and writes `supabase/seed/imagery-map.json`.
   Pick a fitting image per event from that map by `role` (and `group` for
   categories and scenes), and set `cover_image_url` / `thumbnail_url` to the
   mapped URLs. A published event must carry a real cover: the
   `events_published_real_cover` constraint rejects placeholders. Feature
   surfaces render these through `EventCardMedia` and `HeroMedia`, so never wire
   raw `<img>` or `next/image`. The bucket must allow `image/avif` first (see
   `docs/launch-hardening/imagery-pipeline.md`).

5. **Write the seed.** Put the inserts in a migration file (or a seed script),
   never run ad-hoc writes against a live database. Keep it idempotent and
   re-runnable.

6. **Apply.** Lawal applies migrations with `supabase db push --linked` in
   PowerShell. Never the Dashboard, never the MCP. For local work, seed the
   local stack.

7. **Verify.** Confirm the rows exist (direct database query, not the cached
   client), then load the discovery surfaces and check every rail fills with
   real imagery, real copy, and no broken images.

## Category and scene coverage

| Layer | Slugs / examples |
|---|---|
| General (the spine) | sports, music, arts-culture, family, festival, food-drink, nightlife, business-networking |
| Genre within arts-culture | comedy, theatre, film |
| Scene (EventLinqs touch, locked) | First Nations (first), South Asian, Asian, Pasifika & Maori, Afrobeats & Amapiano (Owambe within), Latin, Pride, Mediterranean, Faith & Worship (Gospel within), Caribbean |

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
