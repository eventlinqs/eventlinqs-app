# suburb-primary-written: FIXED, and the wrong answer it was hiding

Harness check 4 of 5. Fixed 8 August 2026 on branch `feat/launch-kit-moat`.

## What was broken, and the worse thing underneath it

`events.suburb_primary` was never written by anything. On TEST, exactly **0 of
363 published events** carried one, so every `/city/[slug]/[suburb]` page was
permanently empty of organiser events.

The page hid that, and what it did instead was worse than being empty. Its
comment claimed the bridge was "venue_city matching city OR venue_name
containing the suburb name". **The code only ever applied the first half.** It
selected every event in the CITY and rendered them under the district's name, so
`/city/melbourne/inner-melbourne` and `/city/melbourne/bayside` returned the
identical list, each asserting those were its own district's events. Nothing
errored, every page looked full, and six district pages were six copies of the
city page.

That is why it survived every gate: a wrong answer that looks like a right one.

## Why this is not the city fix

`city_primary` resolves the locality the organiser TYPED, because "Geelong" is
the city of Geelong. A district cannot be derived that way and must not be
guessed from a city name. The entries the platform ships are metropolitan
DISTRICTS ("Inner West", "Eastern Suburbs", "Inner Melbourne"), not names any
organiser types, and no text column contains one.

What IS real is the venue's coordinates and the district centroids already in
`public.suburbs`. 346 of the 362 published events (95.6 percent) carry
coordinates. Assigning an event to the nearest district centroid within a
bounded radius, inside its own city, is a deterministic reading of a real
coordinate. An event with no coordinates, no city claim, or nothing within 12 km
is **left null**, which is the honest state.

## The defect I introduced, and the data that exposed it

My first version used "within the radius" for the page and the filter. It is
INCLUSIVE, and an assignment that is inclusive is not an assignment.

The data made it obvious: **43 of the 55 Melbourne events carry the CBD centroid
(-37.8136, 144.963) as their venue coordinate**, and all six Melbourne districts
sit within 12 km of the CBD. So the radius rule handed those same 43 events to
all six districts and the pages stayed identical. The measurement before the fix:

```
melbourne/inner-melbourne: 22 events     melbourne/inner-melbourne: 22 events
melbourne/bayside:         22 events     melbourne/bayside:          0 events
melbourne/eastern-suburbs:  0 events  -> melbourne/eastern-suburbs:  0 events
melbourne/northern-suburbs:22 events     melbourne/northern-suburbs: 0 events
melbourne/western-suburbs: 22 events     melbourne/western-suburbs:  0 events
melbourne/southern-suburbs:22 events     melbourne/southern-suburbs: 0 events
```

The rule is now the ONE nearest district (`resolveSuburbSlug`), applied by all
three of the organiser write path, the `/events?suburb=` filter and the suburb
landing page. **One rule, three callers.** When the write and the read disagree,
the suburb page and the browse view give different answers to the same question
and neither is wrong on its own.

The five now-empty Melbourne districts render the shared designed empty state
("the first ... could be yours", HTTP 200, verified). That is a CONTENT GAP for
seeding to fill, and it is strictly better than five pages asserting events they
do not have.

## The filter does not depend on the migration

The `/events?suburb=` filter resolves district membership from coordinates where
`suburb_primary` is not yet set, so it is correct **before** the backfill
migration is applied as well as after. A discovery surface that depends on a
migration somebody has to remember to run is itself a silent break waiting to
happen, which is the defect class this whole branch is about.

## The proof

**Unit** (`tests/unit/suburb-resolution.test.ts`, 15 tests): the honest refusals
(no coordinates, no city, a city with no districts, nothing in range, non-finite
input), the resolutions (every district resolves from its own centroid, nearest
wins, never another city's district), and `distanceKm` against the known
Melbourne to Sydney great-circle distance.

**Backfill prediction, read only**
(`node scripts/verify/suburb-primary-backfill-verify.mjs`):

```
--- a. the district registry the migration joins ---
  active districts in public.suburbs : 24
  districts in the repo              : 24
  [PASS] every district exists in both, so the SQL rule and the TypeScript rule see the same set

--- b. how many published events carry a district claim ---
  published events            : 363
  with a district claim       : 0
  the rule says should have   : 209
  NOT YET APPLIED: the migration would fill 209 more row(s)

--- c. [PASS] no event is filed under a district the rule did not choose
--- d. [PASS] no event filed under another city's district
--- e. [PASS] 209 event(s) across 11 district(s), each on exactly one page
       59 sydney-inner-west, 54 melbourne-inner-melbourne, 36 brisbane-inner-city,
       16 perth-inner-perth, 15 gold-coast-surfers-paradise, 11 canberra-civic,
       11 hobart-inner-city, ...
  18 district(s) resolve to no events. CONTENT GAP, not a defect.
```

The verifier re-derives the answer **independently in JavaScript** and fails on
any row where the database disagrees. Two implementations of one rule (SQL in
the migration, TypeScript at write time) is exactly where a silent divergence
lives, so neither is trusted to check the other.

It also simulates `20260808000001` (the city backfill, still pending) when
predicting, because the suburb statement reads `city_primary`. Predicting from
the current column reports 25 rows; the real answer after both run in one push
is 209. Reporting 25 would have made the founder read a correct push as a
failure.

**End to end** (`node scripts/verify/url-filters-e2e.mjs`): **17 pass, 0 FAIL**,
including the new exclusivity assertion:

```
district assignment is EXCLUSIVE (each event on exactly one district page)
  [PASS] melbourne districts are disjoint
         22 event(s) across 6 districts, each on exactly one
```

Gates: tsc clean, eslint 47 warnings 0 errors (the baseline), 1435 tests across
128 files, copy-tell-gate clean, and **all 9 reach-integrity code checks pass**.

## What is NOT done here

`20260808000003_suburb_primary_backfill.sql` is **written and not applied**. Per
the constitution, migrations are written by the agent and applied by Lawal with
`supabase db push --linked`. Three migrations are pending on TEST and nothing
else: `20260808000001` (city backfill), `20260808000002` (digest share channel)
and `20260808000003` (this one). The linked project is confirmed
`vkapkibzokmfaxqogypq` (eventlinqs-test); production shows `linked: false`.

The suburb FEATURE works without it, as described above. What the migration adds
is the stored column, which removes the per-request coordinate resolution and is
what `city-primary-coverage` (harness check 5) needs to go green.
