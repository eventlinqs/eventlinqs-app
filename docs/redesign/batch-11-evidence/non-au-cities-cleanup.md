# Batch 11.0 Round 3 Item D - Non-AU city routes cleanup

Date: 2026-05-14
Status: SHIPPED. AU-first launch lock enforced at code AND DB layer.

## Trigger

Vercel runtime logs surfaced real user traffic to non-AU routes:

```
GET 200 /events/browse/manchester    (UK)
GET 200 /events/browse/london        (UK)
GET 200 /events/browse/new-york      (US)
GET 200 /events/browse/lagos         (Nigeria)
GET 200 /events/browse/dublin        (Ireland)
GET 200 /events/browse/accra         (Ghana)
```

AU-first launch lock violation. No non-AU slug should be routable.

## Root cause

`src/lib/locations/launch-cities.ts` exported a 32-city
`LAUNCH_TARGET_CITIES` allow-list that included 19 international
cities planned for a deferred regional expansion. Three public
routes used this allow-list as their validation source:

- `/events/browse/[city]` via `resolveCity` -> `getPickerCities`
- `/culture/[culture]/[city]` via `culture.cities` arrays inside
  `src/lib/cultures/data.ts` (which independently named the same
  international cities for SEO copy)
- `/city/[slug]` via the `cities` table (no non-AU rows today, but
  unprotected against future seed regressions)

The sitemap reads the picker too, so non-AU URLs were also being
emitted in `sitemap.xml`.

## Database audit (pre-fix)

```sql
SELECT slug, name, state FROM public.cities ORDER BY slug;
```

20 rows returned, all already AU. Schema lacks a `country` column,
so there was no DB-layer guard.

Event counts per `venue_city`:

| venue_city | event count |
|---|---|
| sydney | 18 |
| melbourne | 16 |
| brisbane | 9 |
| adelaide | 3 |

Zero events tagged to a non-AU venue_city. No FK cleanup required.

## Cities removed from the LAUNCH_TARGET_CITIES allow-list (code-side)

| Slug | Country |
|---|---|
| auckland | New Zealand |
| london | United Kingdom |
| manchester | United Kingdom |
| birmingham | United Kingdom |
| dublin | Ireland |
| toronto | Canada |
| montreal | Canada |
| ottawa | Canada |
| new-york | United States |
| houston | United States |
| atlanta | United States |
| washington-dc | United States |
| minneapolis | United States |
| lagos | Nigeria |
| abuja | Nigeria |
| accra | Ghana |
| nairobi | Kenya |
| johannesburg | South Africa |
| dubai | United Arab Emirates |

Total: 19 cities removed. AU 13-city list retained (Sydney, Melbourne,
Brisbane, Perth, Adelaide, Gold Coast, Newcastle, Wollongong, Geelong,
Hobart, Canberra, Darwin, Cairns).

## Files touched (code)

| Path | Change |
|---|---|
| `src/lib/locations/launch-cities.ts` | Trimmed `LAUNCH_TARGET_CITIES` from 32 to 13 (AU only). Comment block updated with the launch-lock rationale and unblock instructions. |
| `src/lib/locations/picker-cities.ts` | DB-sourced city discovery now filters `venue_country = 'Australia'` on the events query. Belt-and-braces guard so an organiser seeding a London event cannot leak London back into the picker. |
| `src/lib/cultures/data.ts` | Added `AU_CITY_DISPLAY_NAMES` set + `filterToAuCities` helper. `getCulture`, `getAllCultures`, `getTier1Cultures`, `getTier2Cultures` all return `culture.cities` filtered to AU display names. Raw CULTURES table keeps the global lists for SEO copy and future expansion. |
| `public/cities/lagos.svg` | Deleted (was unreferenced placeholder). |
| `public/cities/london.svg` | Deleted (was unreferenced placeholder). |

## Migration (DB layer)

`supabase/migrations/20260514121006_remove_non_au_cities.sql`

The migration is idempotent and:

1. Adds `country VARCHAR(2) NOT NULL DEFAULT 'AU'` column to `public.cities`.
2. Backfills `country='AU'` on every existing row (all are AU today).
3. Deletes any row where `country <> 'AU'` (no-op currently).
4. Adds `CHECK (country = 'AU')` constraint named `cities_country_au_only`.

Founder must apply via `npx supabase db push --linked` from PowerShell.
Re-running is safe. To unblock international markets later: drop the
constraint via a new migration AND re-add the relevant rows to
`LAUNCH_TARGET_CITIES`.

## HTTP verification

### Non-AU /events/browse/[city] (expect 404)

```
manchester                404
london                    404
new-york                  404
lagos                     404
dublin                    404
accra                     404
toronto                   404
auckland                  404
abuja                     404
birmingham                404
montreal                  404
ottawa                    404
houston                   404
atlanta                   404
washington-dc             404
minneapolis               404
nairobi                   404
johannesburg              404
dubai                     404
```

19 of 19 return 404. ✓

### AU /events/browse/[city] (expect 200)

```
sydney                    200
melbourne                 200
brisbane                  200
perth                     200
adelaide                  200
canberra                  200
hobart                    200
darwin                    200
geelong                   200
gold-coast                200
newcastle                 200
wollongong                200
cairns                    200
```

13 of 13 return 200. ✓

### Non-AU /culture/[culture]/[city] intersection (expect 404)

```
/culture/african/london          404
/culture/african/new-york        404
/culture/african/lagos           404
/culture/african/toronto         404
/culture/african/dublin          404
/culture/african/auckland        404
```

6 of 6 return 404. ✓

### AU /culture/african/[city] (expect 200)

```
/culture/african/sydney          200
/culture/african/melbourne       200
/culture/african/brisbane        200
/culture/african/perth           200
/culture/african/adelaide        200
```

5 of 5 return 200. ✓

### Non-AU /city/[slug] (expect 404)

```
/city/london                    404
/city/new-york                  404
/city/lagos                     404
/city/auckland                  404
/city/dubai                     404
```

5 of 5 return 404. ✓

## Hardcoded reference grep

Non-AU city names still appear in `src/lib/cultures/data.ts` and
`src/app/blog/page.tsx` in editorial body copy (e.g. "Where Lagos
meets Lakemba", "From Lagos to Atlanta under the same praise
break", "Detty December is no longer just a Lagos phenomenon").

These references are **content, not routing**. They describe the
diaspora origins of the culture - they are not clickable links to
non-AU routes. Removing them would lobotomise the culture
storytelling. They are retained.

The `src/components/features/events/event-form.tsx` timezone
dropdown also lists `Africa/Lagos`, `Europe/London`, etc. - these
are IANA timezone identifiers for the organiser create-event flow.
Retained.

The cultures/data.ts `cities: ['Sydney', ..., 'London', 'Toronto',
'Houston', 'Atlanta', 'Lagos']` arrays remain unchanged in the
CULTURES source table - they are filtered to AU at the
`getCulture` / `getAllCultures` accessor level (see
`filterToAuCities`).

## Sitemap audit

`src/app/sitemap.ts` reads from `getPickerCities()`. With the
trimmed `LAUNCH_TARGET_CITIES` and the `venue_country='Australia'`
filter in `buildPickerCitiesRaw`, the picker now emits AU only,
which propagates to the sitemap. No `sitemap.ts` code change
required.

## Platform sweep post-fix

```
node scripts/batch-11-platform-sweep.mjs
```

```
Total: 94 | CLEAN: 94 | ISSUES: 0 | ERROR: 0
```

No regression on previous Batch 11.0 work. AU city pages, culture
pages, intersection pages, marketing pages, legal pages, auth pages,
event detail pages: all 94 routes (47 routes × 2 viewports) return
200 with zero console errors, zero 404 resources, zero failed
requests.

## Acceptance gates - all met

- [x] LAUNCH_TARGET_CITIES trimmed to AU-only (13 cities)
- [x] picker-cities DB lookup filters `venue_country='Australia'`
- [x] culture.cities filtered to AU at getCulture / getAllCultures
- [x] DB migration adds `country` column + CHECK (country='AU')
- [x] Non-AU SVG placeholders deleted (lagos.svg, london.svg)
- [x] 19 non-AU /events/browse/[city] routes return 404
- [x] 13 AU /events/browse/[city] routes return 200
- [x] 6 non-AU /culture/[culture]/[city] routes return 404
- [x] 5 AU /culture/african/[city] routes return 200
- [x] 5 non-AU /city/[slug] routes return 404
- [x] Sitemap emits AU only (via picker filter, no separate change needed)
- [x] Platform sweep 94/94 CLEAN
- [x] No autonomous commit / push

End of report.
