# Batch 8.3 GATE 2 - Existing Code Audit

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03

## Audit findings

### 1. Route

`src/app/venues/[handle]/page.tsx` **does not exist**. There is no
`src/app/venues/` directory in the codebase. This is a **net-new
public-facing build**.

### 2. Data model

`src/types/database.ts` line 143 defines the `Venue` interface:

```ts
export interface Venue {
  id: string
  organisation_id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  capacity: number | null
  description: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
```

The `venues` table is organisation-owned (`organisation_id` FK) and
was originally provisioned for seat maps (M4). It is **not** a
public-discovery taxonomy.

### 3. Gaps versus Batch 8.3 brief assumptions

| Brief assumption | Reality | Impact |
|------------------|---------|--------|
| Venue has a `slug` for `/venues/[handle]` URL | No `slug` column | Need to derive a public handle from venue name |
| Venue has `latitude` + `longitude` for map | No geo fields on `venues` | Geo lives on `events.venue_latitude` / `events.venue_longitude` - aggregate from events |
| Venue has `venue_type` (concert hall / club / theatre etc.) | No type field | Derive from event categories at this venue |
| Venue has `amenities` JSON | No amenities | Show only the fields we have (capacity, address, accessibility-N/A) |
| Venue has `website`, `phone`, hours | No fields | Skip in v1; surface when M7 admin panel adds them |
| Venues are linked to events via FK | `events.venue_id` exists but is sparsely populated; most events use `venue_name` text only | Use `venue_name` as the primary join axis; fall back to `venue_id` when set |

### 4. Build strategy decision

This is a **net-new public-facing build with name-derived handle and
event-aggregation data layer**. Specifically:

- **Public handle** = slug-form of `venue.name` (e.g. "Hordern Pavilion"
  becomes `hordern-pavilion`). Resolved server-side by ilike-matching
  `venues.name` and falling back to `events.venue_name` ilike if no
  `venues` row exists - so every public-event venue gets a profile
  page even when the M7 admin panel hasn't formally created the venue
  record yet.
- **Geo coordinates** - aggregate from `events.venue_latitude` /
  `events.venue_longitude` (most-recent non-null event at this venue).
- **Venue type** - derived from the most-frequent event category at
  this venue. Surfaces as a pill in the hero ("Live music venue" for
  music-heavy venues, "Comedy club" for comedy-heavy etc.)
- **Amenities** - render only the fields we have today. Capacity is
  the most useful single signal; mark accessibility / parking etc as
  TBD until the M7 admin panel surfaces them.
- **Schema.org Place JSON-LD** - includes Place + PostalAddress + the
  GeoCoordinates we derived from events; embedded `event` array for
  upcoming events at the venue.

Forward-compat note: when M7 admin panel adds `slug`, `geo`, `type`,
`amenities`, `website`, `phone` to the venues table, the page picks
them up via the existing fields without code changes - the resolver
prefers `venues` table values over event aggregations.

### 5. Coordination with Batch 8.2 OP7

Batch 8.2 closure report C-B8.2-02 deferred OP7 (Venues organiser uses
rail) until `/venues/[handle]` exists. This batch ships the route, so
OP7 will be wired up in the same commit train. The wire-up adds a new
SnapRailScroller above the OP9 contact panel on the organiser profile
page, sourced from the most-frequent venue_name values across the
organiser's upcoming + past events.
