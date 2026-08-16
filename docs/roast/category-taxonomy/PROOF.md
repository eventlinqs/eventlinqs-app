# R1: the category taxonomy now matches the platform built on top of it

Written 8 August 2026, branch `feat/launch-kit-moat`. Migrations
`20260808000004` and `20260808000005`, applied to TEST only under this session's
founder ruling. Production untouched, never linked.

## The divergence

The homepage renders nine category tiles and a rail per category. **Two of the
nine matched no row in `event_categories` at all**, so the tile and the rail
behind it could never render, and the tile linked to `/events?category=...`
which resolved 200 to a permanently empty result.

This is why the category-landing repair in `2a701db` moved music 0 to 6, sports
0 to 5 and nightlife 0 to 6 but left **comedy at 0**. The query was fixed; there
was no category for it to find.

BEFORE (`BEFORE.txt`):

```
--- a. every category the homepage merchandises exists (9) ---
  arts-community         *** NO SUCH CATEGORY ***
  business-networking    EXISTS    5 published event(s)
  comedy                 *** NO SUCH CATEGORY ***
  family                 EXISTS   13 published event(s)
  festival               EXISTS   22 published event(s)
  food-drink             EXISTS   33 published event(s)
  music                  EXISTS  105 published event(s)
  nightlife              EXISTS   44 published event(s)
  sports                 EXISTS   11 published event(s)
  [FAIL] 2 merchandised categor(ies) match no row: arts-community, comedy

--- c. the banned word is gone from category slugs, names and tags ---
  [FAIL] 1 categor(ies) still carry it: arts-culture (Arts & Culture)
  [FAIL] 24 published event(s) still carry it in tags

--- d. comedy-tagged events can reach the comedy category ---
  [FAIL] there is no comedy category

===== 4 FAILED =====
```

## What the migrations did

1. **The legacy arts slug becomes `arts-community`.** Two problems, one rename.
   The constitution bans the word in every form including slugs and data, and
   the platform ALREADY called this category `arts-community` everywhere in
   code: the homepage tile, the homepage rail, the category photo map, the image
   spine. The database was the last holdout, and that mismatch is exactly what
   made the tile unable to match an event.
2. **Comedy becomes a real category.** Law 3: LPA has comedy as the
   fastest-growing ticketed category in Australia, and the platform already
   merchandises it with a tile and a rail. 28 published events were tagged
   `comedy` and none could reach it.
3. **Those 28 events moved into it.** 23 sat in the old arts category and 5 had
   no category at all. None sat in a different specific category, so nothing was
   taken from a category an organiser had deliberately chosen. The `comedy` tag
   is preserved, so it is reversible by reading the tag back.
4. **The old arts tag merged into `arts-community`**, and `cultural` became
   `community` (the tag the platform already uses for that meaning, on 64
   events).

## The judgement recorded rather than made silently

One event still carries the banned word: `africultures-festival-sydney-2027`,
tagged `africultures`.

**That is a proper noun, and it is left alone.** "Africultures Festival" is a
real Sydney festival and that is its actual registered name. The law exists so
EventLinqs never describes communities in the language it has rejected; it is
not a licence to rewrite somebody else's event. Renaming it would corrupt an
organiser's identity, break the search term their audience types, and the event
slug would still carry the word regardless, so the edit would achieve nothing
except damage.

The verifier now separates **our taxonomy** from **proper nouns**, and names
this one with its reason, so it can be overruled in one place instead of being
an unexplained exception buried in a regex.

## AFTER

```
--- a. every category the homepage merchandises exists (9) ---
  arts-community         EXISTS   21 published event(s)
  business-networking    EXISTS    5 published event(s)
  comedy                 EXISTS   28 published event(s)
  family                 EXISTS   13 published event(s)
  festival               EXISTS   22 published event(s)
  food-drink             EXISTS   33 published event(s)
  music                  EXISTS  105 published event(s)
  nightlife              EXISTS   44 published event(s)
  sports                 EXISTS   11 published event(s)
  [PASS] every tile and every rail resolves to a real category

--- b. [PASS] every merchandised category has at least one published event

--- c. the banned word is gone from category slugs, names and tags ---
  [PASS] 0 of 22 categories carry it
  [PASS] 0 of 363 published events carry it in tags we control
  1 event(s) carry it inside a PROPER NOUN, deliberately left alone:
      africultures: the registered name of the Africultures Festival, a real Sydney event, not our taxonomy

--- d. comedy-tagged events can reach the comedy category ---
  events tagged comedy      : 28
  now in the comedy category: 28
  [PASS] the comedy tile and the comedy rail can render

===== ALL GREEN =====
```

## Proven by clicking what the user clicks

Every one of the nine tile destinations, against the running app:

```
  /events?category=comedy              -> HTTP 200, 14 events
  /events?category=arts-community      -> HTTP 200, 16 events
  /events?category=music               -> HTTP 200, 24 events
  /events?category=food-drink          -> HTTP 200, 18 events
  /events?category=festival            -> HTTP 200, 10 events
  /events?category=nightlife           -> HTTP 200, 24 events
  /events?category=sports              -> HTTP 200,  5 events
  /events?category=family              -> HTTP 200,  6 events
  /events?category=business-networking -> HTTP 200,  0 events
```

The homepage Comedy rail renders real events for the first time
("Comedy Lineup Live at Brisbane Hotel").

**`business-networking` returns 0, and it is a CONTENT GAP, not a defect.** Its
5 published events are all in the past (measured: 5 published, 0 upcoming, 5
past), and browse correctly shows only upcoming events. The tile is real, the
category is real, and the catalogue has nothing upcoming to put behind it.

## The verifier is shaped around the tiles, not the table

`scripts/verify/category-taxonomy-verify.mjs` reads the tile list **from the
component source** and the rail list from `page.tsx`, rather than restating them.
The defect was never "the table is wrong" in the abstract; it was that what the
platform SHIPS and what the database HOLDS had never been compared. A tenth tile
added tomorrow is checked automatically. A list retyped into the verifier would
not be.

## Code brought into line

- `EVENT_TYPE_MAP.theatre` now points at `arts-community` for both its tag and
  its category.
- `scripts/seed-national-catalogue.mjs`: 9 occurrences of the old slug updated,
  so a future seed cannot recreate the divergence.
- The `copy-tell-gate` allowlist entry for `url-filters.ts` is **removed**,
  exactly as its own stated reason promised R1 would. The only remaining
  allowlist entry for that word is `src/lib/images/spine.ts`, which is a storage
  path for photo files already uploaded; renaming it breaks the image spine.

Gates: tsc clean, eslint 47 warnings 0 errors (the baseline), 1440 tests across
129 files, copy-tell-gate clean.
