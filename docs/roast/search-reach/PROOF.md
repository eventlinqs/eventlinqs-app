# search-matches-more-than-title: FIXED

Harness check 3 of 5. Fixed 8 August 2026 on branch `feat/launch-kit-moat`.

## What was broken

Search was `ilike('title', '%q%')` and nothing else. Two consequences, both of
which look to a user like an empty catalogue rather than a broken search:

**Nine of the twelve homepage Sounds tiles were dead ends.** The tiles link to
`/events?q=`, and nine send a multi-word query. No event title contains those
literal strings. The events existed the whole time, tagged with the hyphenated
form:

| Tile | Query it sends | Tag the events actually carry |
|---|---|---|
| Electronic & Dance | `electronic dance` | `electronic-dance` |
| Indie & Rock | `indie rock` | `indie-rock` |
| Hip-Hop & RnB | `hip hop rnb` | `hip-hop-rnb` |
| Folk & Acoustic | `folk acoustic` | `folk-acoustic` |
| Blues & Roots | `blues roots` | `blues-roots` |
| Afrobeats & Amapiano | `afrobeats amapiano` | `afrobeats-amapiano` |
| Caribbean & Dancehall | `caribbean dancehall` | `caribbean-dancehall` |
| Jazz & Soul | `jazz soul` | `jazz-soul` |
| Metal & Hardcore | `metal hardcore` | `metal-hardcore` |

**Three of the four header-search tabs answered a different question.** The tabs
route to `/events?q=...&tab=communities|cities|organisers` and /events rendered
the EVENTS scope for all four. Searching "Melbourne" under Cities returned event
titles containing Melbourne and no cities at all.

## The fix, and the shape of it

**The predicate.** The whole phrase is matched across five text columns (title,
summary, description, venue_name, venue_city). Individual tokens are matched
ONLY against `tags`, which is a controlled vocabulary. That distinction is the
design: matching loose tokens against free text would send "hip hop rnb" into
every event with "Hopscotch" in its title, trading a broken search for a noisy
one. The hyphenated form of the phrase is matched against tags too, because that
is exactly how the scene taxonomy is stored.

**The tabs.** A tab is a SCOPE, not a filter on events. Communities and cities
resolve against the locked editorial data already in the repo (21 and 20
entries); organisers are a query. Every result is a whole-tile link to the real
landing page, and the empty state names what was searched and routes to the
index rather than dead-ending.

**Filter-grammar escaping.** Inside a PostgREST `or(...)` the characters `,` `.`
`(` `)` are grammar, not data. An unescaped term containing them is not merely
unmatched: it is parsed as additional filter clauses, and a bare `.` can name a
column. Values are quoted and internal quotes and backslashes escaped. This is
tested with a deliberately column-shaped input.

## The proof

`node scripts/verify/search-reach-e2e.mjs` - **29 pass, 0 FAIL**. Every case
asserts the returned events against the database, so a result that does not
answer the query fails even when the page returns 200.

```
the 12 homepage Sounds tiles (9 of them multi-word, all 9 were dead)
  [PASS] Electronic & Dance      5 results, every one answers "electronic dance"
  [PASS] Country                 3 results, every one answers "country"
  [PASS] Indie & Rock            8 results, every one answers "indie rock"
  [PASS] Hip-Hop & RnB           6 results, every one answers "hip hop rnb"
  [PASS] Pop                     8 results, every one answers "pop"
  [PASS] Folk & Acoustic         4 results, every one answers "folk acoustic"
  [PASS] Blues & Roots           3 results, every one answers "blues roots"
  [PASS] Afrobeats & Amapiano    9 results, every one answers "afrobeats amapiano"
  [PASS] Latin                   3 results, every one answers "latin"
  [PASS] Caribbean & Dancehall   8 results, every one answers "caribbean dancehall"
  [PASS] Jazz & Soul             3 results, every one answers "jazz soul"
  [PASS] Metal & Hardcore        3 results, every one answers "metal hardcore"

the columns a title-only search could never reach
  [PASS] venue name "The Forum Melbourne" (no title contains it)   3 results
  [PASS] city name "Melbourne"                                     24 results
  [PASS] description-only word "weekend"                           1 result

filter-grammar safety (, . ( ) are syntax inside or())
  [PASS] a comma: rock, paper
  [PASS] a full stop: dr. jazz
  [PASS] brackets: live (acoustic)
  [PASS] a quote: rock"n"roll
  [PASS] a column-shaped injection: id.neq.00000000-0000-0000-0000-000000000000

the three header-search tabs that are not events
  [PASS] tab=cities q=melbourne        "1 city matching melbourne" -> /city/melbourne (200)
  [PASS] tab=communities q=african     "1 community matching african" -> /community/african (200)
  [PASS] tab=organisers q=harbour      "2 organisers matching harbour" -> both 200
  [PASS] tab=cities with no match      "No cities matching zzzznothing" with a route to /cities
  [PASS] singular label is a real word "1 city matching melbourne"
```

**All twelve Sounds tiles now reach real events**, including Metal & Hardcore,
which the tag census had suggested might be a content gap and is not.

Unit: `tests/unit/events-search-scopes.test.ts`. Suite 1420 passing across 127
files, up from 1411 across 126. tsc clean, eslint 47 warnings 0 errors (the
baseline), copy-tell-gate clean.

## One defect the harness caught in my own work

The single-result heading read **"1 citie matching"** and **"1 communitie
matching"**: a naive `label.replace(/s$/, '')`. Invisible until a search returns
exactly one result, which is the common case for a city name. Both forms are now
spelled out and there is an assertion pinning it.
