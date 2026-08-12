# url-filters-parsed: FIXED, and the check that missed half of it

Harness check 2 of 5. Fixed 8 August 2026 on branch `feat/launch-kit-moat`.

## What the handover said, and what was actually true

The handover recorded six unparsed filters: `city`, `date`, `suburb`,
`event_type`, `venue`, `tab`.

Scanning the source for every `/events?` link a user can click found **twelve**,
and cleared one that was never a defect:

| Parameter | Emitted by | Was |
|---|---|---|
| `city` | 6 sites: both city landing "View all"s, the city tile, the event-type rail, both community-by-city links | dropped |
| `date` | 8 sites: the homepage This Week rail, three header-search shortcuts, both city landings, both community-by-city links | dropped |
| `suburb` | the suburb landing "Open in browse view" | dropped |
| `event_type` | the eight city format tiles | dropped |
| `venue` | the venue profile "View all" and the homepage featured-venues rail | dropped |
| `tab` | three of the four header-search tabs | dropped |
| `free` | the header-search "Free events" shortcut | **not in the handover** |
| `price` | the category highlight slides | **not in the handover** |
| `organiser` | the organiser profile "View all" | **not in the handover** |
| `faith` | the faith landing "View all" | **not in the handover** |
| `moment` | the homepage community-moments bento | **not in the handover** |
| `sort=trending` | the category highlight slides | **not in the handover**: the value was not one of the four the parser accepted, so it was discarded |
| `error` | `/checkout/[reservation_id]` bouncing a buyer back | **not in the handover** |
| `sub` | nothing. It appears only in a doc comment | **not a defect**, and the old check would have counted it |

The check itself was the reason the count was wrong: it hardcoded a list of nine
parameter names. **It now derives the emitted set by scanning the source**, so it
cannot undercount again. It reports `all 18 parameters emitted in /events links
are parsed`.

## The one that mattered most to a buyer

`/checkout/[reservation_id]` redirects to `/events?error=reservation_expired`
when a seat hold lapses. `/events` read nothing from the URL. So a buyer partway
through paying had their held seats vanish and landed on a generic browse page
with no explanation, which from their side reads as the platform losing their
order. They are now told what happened, that they have not been charged, and
what to do next.

## Two defects behind the parsing, that parsing alone would not have fixed

1. **`hasActiveFilters` did not know about any of the new filters.** That
   predicate decides whether a request goes to the CACHED fetch path, whose
   snapshot is taken with no filters at all. Every new filter would have parsed
   perfectly and then been thrown away. There is a test per filter for this.
2. **`ilike('venue_city', '%gold-coast%')` can never match `Gold Coast`.** The
   parameter carries a slug and the column holds a display name, so every
   multi-word city was structurally unmatchable. Single-word cities survived the
   mismatch by accident, which is why it was never noticed. `city` now resolves
   the slug to the name the column actually holds.

## Nothing invented (Law 0.5, Law 3)

Every mapping resolves to a taxonomy already in the database or in locked
content data, checked against the 362 published events on TEST before it was
written. The two judgement calls are stated in the code beside the mapping:
`dj-set` resolves to the electronic and dance tokens (there is no `dj` tag on
any event, and a DJ set is the Electronic & Dance scene in the locked
taxonomy), and `workshop` resolves to the Education category (there is no
`workshop` tag). `suburb` is a 12 km radius around the district centroid, using
the `suburbs` table's real coordinates and the `events_within_distance` RPC the
distance filter already uses, because these entries are metropolitan districts
with no text form that matches any column.

## The proof

Unit: `tests/unit/events-url-filters.test.ts`, 45 tests. Suite 1411 passing
across 126 files, up from 1366 across 125.

End to end against real data: `node scripts/verify/url-filters-e2e.mjs`. Every
case asserts the returned events against the database, not just the HTTP status.

```
16 pass, 0 FAIL

  [PASS] city=melbourne          24 events rendered (27 eligible), every one in Melbourne
  [PASS] city=gold-coast         10 events rendered (10 eligible), every one on the Gold Coast
  [PASS] date=week               12 events rendered (12 eligible), every one inside the next seven days
  [PASS] date=today              filter correct, catalogue empty (CONTENT GAP)
  [PASS] free=1                  24 events rendered (33 eligible), every one free
  [PASS] price=free              24 events rendered (33 eligible), every one free
  [PASS] event_type=comedy       14 events rendered (14 eligible), every one tagged comedy or in the comedy category
  [PASS] event_type=food-drink   18 events rendered (18 eligible), every one tagged or categorised food and drink
  [PASS] venue=factory-theatre   9 events rendered (9 eligible), every one at Factory Theatre
  [PASS] venue=Factory Theatre   9 events rendered (9 eligible), every one at Factory Theatre
  [PASS] organiser=harbour-lights-collective  14 events, every one run by Harbour Lights Collective
  [PASS] faith=christian         filter correct, catalogue empty (CONTENT GAP)
  [PASS] suburb=inner-west       24 events rendered (35 eligible), every one within the Inner West district
  [PASS] sort=trending           HTTP 200, maps to popularity instead of being discarded
  [PASS] error=reservation_expired    the buyer is told what happened
  [PASS] error=reservation_not_found  the buyer is told what happened
```

## Two CONTENT GAPS, reported as gaps and not as passes

Both filters are correct and the catalogue has nothing for them. This is not a
defect and it is not a finished surface either, so it is named rather than
folded into the pass count:

- `/events?date=today` and the header-search "Tonight" shortcut: **0 published
  events start before midnight tonight** on TEST. Every seeded event is further
  out. A user who taps Tonight lands on a designed empty state.
- `/events?faith=christian` and the `/faith/christian` landing "View all":
  **0 published events carry any Christian tag** (`gospel`, `worship`,
  `christian`, `choir`, `praise`, `church`, `easter`, `christmas`). The same
  zero empties the "Live Christian events" section on the faith landing itself.
  The other four faith landings have the same exposure.

Both are catalogue problems for seeding to fill, not code to change.

## One thing I broke and caught

Refactoring the two duplicated filter blocks into a shared resolver moved the
search predicate out of a literal `ilike('title', ...)` call. The
`search-matches-more-than-title` check was matching on that literal, so it went
**green while the defect was completely untouched** - a false clean bill of
health produced by a change that had nothing to do with search.

The check now locates the one function that builds the predicate and reads it,
and fails loudly if that function is renamed rather than quietly passing. It is
correctly FAILing again, and is fixed as harness item 3.
