# Batch 11.1 D1 - Geelong picker investigation

Date: 2026-05-15
Status: SHIPPED. Root cause closed.

## Symptom (founder report)

"Header location picker search bar accepts 'Sydney' and shows
Sydney. Search 'Geelong' returns 'No cities match' even though
CC's Batch 11.0 reported Geelong as one of the 13 valid AU cities."

## Investigation

### Step 1: DB confirms Geelong row exists

```sql
SELECT slug, name, state, country FROM public.cities WHERE slug = 'geelong';
-- geelong | Geelong | VIC | AU
```

### Step 2: LAUNCH_TARGET_CITIES had Geelong

`src/lib/locations/launch-cities.ts` already listed Geelong in the
Batch 11.0 Round 3 trim:

```ts
{ city: 'Geelong', slug: 'geelong', country: 'Australia', countryCode: 'AU', latitude: -38.1499, longitude: 144.3617, isAustralia: true },
```

### Step 3: Live picker DOM trace - Geelong actually appears

I built `scripts/batch-11.1-trace-picker.mjs` and ran it against
both local production build and live `https://www.eventlinqs.com`.
Both showed Geelong present in the default view AND searchable by
the full name, partial, and case-insensitive variants:

```
AU section (default view, no query):
  ... GeelongAustralia ...
Search "Geelong" -> matches: GeelongAustralia
Search "geelong" -> matches: GeelongAustralia
Search "Geelo"   -> matches: GeelongAustralia
```

**Geelong itself was not the bug.** The founder's report was from a
state earlier than the Round 3 deploy; the deploy live as of 14 May
has Geelong in the picker.

## Root cause (the deeper bug Geelong was a symptom of)

Auditing the DB cities table against the code allowlist revealed a
parity gap: the DB has 20 AU cities, the code allowlist had 13. The
7 cities present in the DB but absent from the picker:

- `albury` (NSW)
- `ballarat` (VIC)
- `bendigo` (VIC)
- `launceston` (TAS)
- `sunshine-coast` (QLD)
- `toowoomba` (QLD)
- `townsville` (QLD)

A user searching for any of those would have hit the same "No
cities match" message the founder saw for Geelong. The Geelong
report was a symptom; the root cause was DB-vs-code drift.

## Fix (root cause)

Three changes:

### 1. Extend LAUNCH_TARGET_CITIES from 13 to 20 entries

`src/lib/locations/launch-cities.ts`: added the 7 missing cities
with proper state codes, lat/lng, and full display names.

### 2. Pull from `public.cities` table directly

`src/lib/locations/picker-cities.ts`: the picker now queries the
`cities` table in addition to LAUNCH_TARGET_CITIES. Any future
addition to the DB cities table auto-propagates to the picker
without a code change. This closes the future-drift door:

```ts
const [eventsResult, citiesResult] = await Promise.all([
  supabase
    .from('events')
    .select('venue_city, venue_country')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('venue_country', 'Australia')
    .not('venue_city', 'is', null),
  supabase
    .from('cities')
    .select('slug, name, state, country, latitude, longitude')
    .eq('country', 'AU')
    .order('slug', { ascending: true }),
])
```

### 3. Harden picker filter against slug-style and compressed queries

`src/components/ui/location-picker.tsx`: the search filter now
matches against `city`, `country`, `slug`, AND a normalised form
where spaces and hyphens are stripped. A user typing "goldcoast",
"gold-coast", or "Gold Coast" all match the Gold Coast entry. A
user typing the slug "sunshine-coast" or "Sunshine Coast" both
match.

```ts
const filteredMatches = useMemo(() => {
  const q = query.trim().toLowerCase()
  if (!q) return allCities
  const qNorm = q.replace(/[\s-]+/g, '')
  return allCities.filter(c => {
    const city = c.city.toLowerCase()
    const country = c.country.toLowerCase()
    const slug = c.slug.toLowerCase()
    if (city.includes(q) || country.includes(q) || slug.includes(q)) return true
    const cityNorm = city.replace(/[\s-]+/g, '')
    const slugNorm = slug.replace(/[\s-]+/g, '')
    return cityNorm.includes(qNorm) || slugNorm.includes(qNorm)
  })
}, [allCities, query])
```

## Verification

Section 3.1 (city coverage parity) in
`scripts/batch-11.1-au-launch-readiness.mjs` now reports:

```
Step 1: 20 AU cities in DB cities table
Step 2: 20 slugs in LAUNCH_TARGET_CITIES
Step 3: 20 unique city slugs in /sitemap.xml
Step 4: 20 cities in picker AU section

=== City coverage parity: 20/20 PASS ===
```

Every AU city in the DB is in the allowlist, in the picker, in the
sitemap, searchable by name AND slug, with `/events/browse/[city]`
returning 200 AND `/city/[slug]` returning 200.

End of report.
