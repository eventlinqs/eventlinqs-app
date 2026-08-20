# The exclusion audit: every place a legitimate row can vanish

Founder ruling, 16 August 2026: **published means visible**. This is the audit of
the whole class, not a patch of the one filter that was reported.

The trigger: a published, public event on 16 August 2026 under Party Pty Ltd did
not appear on `/events`. The missing cover was blamed. It was innocent, and
proving that mattered more than the fix, because the same wrong diagnosis would
have been applied to the next one.

## What was actually hiding it

`fetchPublicEvents` filtered `start_date >= now`. The event started at 09:00, so
it left discovery at 09:01, on the one day it mattered most.

The cover filter could not have done it, and this is checkable rather than
arguable:

- Every discovery query filters `status = 'published'` and `visibility = 'public'` first.
- The constraint `events_published_real_cover` checks
  `status <> 'published' OR visibility <> 'public' OR (cover_image_url IS NOT NULL AND <> '' AND NOT ILIKE picsum)`.
- It was **validated**, not left `NOT VALID`, by `20260509000010_validate_real_cover_constraint.sql`.
- That migration is from May; production has every pre-August migration applied.

So a published-public row without a real cover cannot exist, and `hasRealCover`
could only ever be a no-op on rows the query returned, while looking
load-bearing.

**Proven on TEST, on real data.** An event moved to "started two hours ago, ends
in two hours" is seen **0** times by the old rule and **1** time by the new one.

## A correction to the ruling's premise

`end_date` and `timezone` are both **NOT NULL** on this schema, confirmed in the
production-generated types (`src/types/database.ts`: `end_date: string`,
`timezone: string`).

So the "where `end_date` is null, show until the end of the calendar day" case
**cannot occur today**. Those predicate branches are defensive only. Two
consequences worth having:

1. Your event had an `end_date`. It was hidden purely by the start-date rule.
2. "Do not make `end_date` required at publish, it would strand existing events"
   is moot: it is already required, and nothing is stranded.

## The audit table

| # | Exclusion | What it hides | Why it was added | Verdict |
|---|---|---|---|---|
| 1 | `start_date >= now` on 15 discovery queries | Any event that has started. The reported defect | Never a decision; the obvious way to write "upcoming" | **REMOVED.** Replaced by "listed until it has ended" |
| 2 | `Today` preset `from: nowIso` | An event on today that started this morning, from the filter called Today | Same assumption as 1 | **REMOVED** |
| 3 | `Today` preset bounds via `setHours` | Evening Australian events fell into the wrong day | Unnoticed use of the server zone (UTC on Vercel) | **REMOVED.** Bounds now in the platform zone |
| 4 | `hasRealCover` filter, 7 sites in `fetchers.ts` | Nothing, provably. A no-op given the validated DB constraint | Batch 4, May 2026, when picsum seed rows could reach public surfaces. The DB constraint later made it redundant and nobody removed it | **DEMOTED to ranking.** A real organiser cover now ranks above one without; nothing is removed |
| 5 | `'coverImageUrl' in input` in the publish gate | Nothing directly, but it let a caller publish with no cover by omitting a field | Written as an optional input, so the check became opt-in by accident | **CLOSED.** The field is required by the type; omitting it is now a compile error |
| 6 | `RAIL_MIN = 3`, 12 homepage rails | A category with 1 or 2 events shows no rail at all | The volume law in CLAUDE.md: "A rail with 1 to 2 items next to a rail with 7 is a defect" | **RULED, 16 August 2026. SURVIVES, and the homepage now says so.** The rule removes a RAIL, never an EVENT, so it never conflicted with reachability. `ThinCategoriesNote` names every thin category with its real count and a working link. Full reasoning: `docs/roast/RAIL-MIN-RULING-2026-08-16.md` |
| 7 | Sale gate: paid event whose organiser cannot charge | A paid event that cannot be bought | Correct: we use Stripe Connect, so no charge can be created | **SURVIVES.** Explicitly preserved, not regressed |
| 8 | `status <> 'published'`, `visibility <> 'public'` | Drafts, scheduled, private, unlisted | The definition of published | **SURVIVES.** This is the rule, not an exception to it |
| 9 | `is('external_ticket_url', null)` on 5 rail queries | Externally ticketed events, from rails only | Founder ruling, 15 August 2026 | **SURVIVES.** Deliberately absent from the main `/events` query (see the comment at `fetchers.ts:712`), so those events remain discoverable |
| 10 | Price filter applied in JavaScript after the query | Every matching event past the first page, and the count with it | Tier prices live in a joined table, so the filter is hard to express in PostgREST | **TRACED AND FIXED, 16 August 2026. It was real.** With the default sort the query fetched ONE page, the filter stripped it, and matches from row 25 onwards were never pulled forward; `total` was then set to the survivors of that page and `totalPages` to 1, removing the only control that could have reached the rest. It now takes the same bounded-superset path the in-memory sorts already took. See below |
| 11 | Notification cron `start_date >= now` (`api/cron/notify-just-announced`) | In-progress events, from "just announced" pushes | Different semantics: announcing something already running is odd | **SURVIVES.** Left deliberately, named here so it is a decision rather than an oversight |

## 16 August 2026, second pass: SEVEN more copies, and the guard that found them

The commit that closed item 1 was titled "Close the date window across every
public surface, not just the one that was reported". It was not true. It closed
the query files and missed seven more live copies of the same rule, and
**nineteen passing tests said nothing**, because a test proves the code it calls
and only a scanner proves the absence of a shape across a tree.

`scripts/guards/no-display-time-exclusion.mjs` found all seven on its first two
runs. Every one is fixed:

| # | Where | What it did |
|---|---|---|
| 1 | `city-rail-section.tsx` (homepage By City counts) | An event that had started stopped being counted. A city whose only event was on RIGHT NOW lost its tile from the rail entirely |
| 2 | `community-picks-section.tsx` | Same rule, twice. Currently unreferenced, fixed anyway so it cannot come back with the defect in it |
| 3 | `city/[slug]/page.tsx` This week | Lower bound at `now`, so this morning's event left This week while it was still on |
| 4 | `community/[community]/[city]/page.tsx` This week | Same |
| 5 | `/events?preset=7d` | `from: nowIso`. The filter called "next 7 days" hid an event on this morning |
| 6 | `/events?preset=month` | Same |
| 7 | `preset=tomorrow` and `preset=weekend` | Bounds built with `setHours`, which is the SERVER zone (UTC on Vercel), so an Australian Saturday evening could fall outside the window called Weekend. This is item 3 again, fixed for `today` alone and left in three other presets and three page-local copies |

The weekend window existed in FOUR hand-rolled copies (the preset, the city
page, the suburb page, the community-by-city page), all built on `setHours`, so
all four had to be found separately. There is now one: `weekendWindowUtc` in
`src/lib/events/listing-window.ts`.

## The two that needed you, now answered

**#6 `RAIL_MIN = 3`. RULED: it stands, and the homepage now says so.** The
conflict was apparent rather than real. `RAIL_MIN` removes a RAIL; it has never
removed an EVENT, and no other surface applies it, so nothing was ever
unreachable. What was missing was the sentence: "no rail" and "no events" looked
identical, which is the same silence this audit exists to close. The homepage now
names every category with one or two events on, with its real count and a working
link, and renders nothing at all once the catalogue is dense. Full reasoning and
the copy: `docs/roast/RAIL-MIN-RULING-2026-08-16.md`.

**#10 the price filter. TRACED: it was real, and it was worse than the shape
suggested.** The doubt was whether the totals captured below the filter already
handled it. They did not, and the reason is that `sortsInMemory` was the only
thing that made the query fetch more than one page.

With `price_asc` or `popularity` the query fetched up to 500 rows, filtered, then
sliced: correct. With the DEFAULT sort, which is what a price filter arrives with
unless the user also changes the sort, the query fetched exactly ONE PAGE of 24
rows. Then:

- the filter stripped that page, and every matching event from row 25 onwards was
  never pulled forward. It did not exist for that search;
- `total` was set to the survivors of that page, so the count read 5 where the
  true answer might be 60;
- `totalPages` therefore read 1, which removed the only control that could have
  reached the rest;
- and a hand-typed `?page=2` offset into the UNFILTERED order, so the pages
  neither tiled nor covered the match set.

The fix is the one the sorts already used: a price filter now makes the query
fetch the bounded superset and slice the page out afterwards, so the two cases
share one rule instead of one of them being right by accident. The bound is
`MAX_SORT_ROWS`, and beyond it the answer is correct for the rows considered,
which is the contract the sorts already carry. `paginatesInMemory()` is the
single decision, and RULE 4 of `no-display-time-exclusion` fails the build if a
`.range()` stops consulting it.

## What makes this class hard, and what closes it

Every member of this class shares one mechanism: **the thing that reports the
outcome is not the thing that does the work.** A filtered-out event produces the
identical screen to an event that does not exist. Nothing fails, nothing logs,
and the surface looks correct.

The structural fix used here is to express the rule in **SQL rather than in
JavaScript after the query**. Dropping rows post-query on a paginated surface
leaves a short page whose missing events are never pulled forward from page 2, so
a filter meant to stop events disappearing would itself make events disappear.
The one place that could not be expressed that way, the per-timezone day
boundary, is enumerated one `or` branch per zone, with two extra branches that
catch a null or unrecognised zone so an eighth timezone can never silently empty
the platform.
