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
| 6 | `RAIL_MIN = 3`, 12 homepage rails | A category with 1 or 2 events shows no rail at all | The volume law in CLAUDE.md: "A rail with 1 to 2 items next to a rail with 7 is a defect" | **SURVIVES**, and it is the one that needs your ruling. See below |
| 7 | Sale gate: paid event whose organiser cannot charge | A paid event that cannot be bought | Correct: we use Stripe Connect, so no charge can be created | **SURVIVES.** Explicitly preserved, not regressed |
| 8 | `status <> 'published'`, `visibility <> 'public'` | Drafts, scheduled, private, unlisted | The definition of published | **SURVIVES.** This is the rule, not an exception to it |
| 9 | `is('external_ticket_url', null)` on 5 rail queries | Externally ticketed events, from rails only | Founder ruling, 15 August 2026 | **SURVIVES.** Deliberately absent from the main `/events` query (see the comment at `fetchers.ts:712`), so those events remain discoverable |
| 10 | Price filter applied in JavaScript after the query (`fetchers.ts:814`, `:1007`) | Potentially rows on the fetched page | Tier prices live in a joined table, so the filter is hard to express in PostgREST | **UNVERIFIED, flagged.** See below |
| 11 | Notification cron `start_date >= now` (`api/cron/notify-just-announced`) | In-progress events, from "just announced" pushes | Different semantics: announcing something already running is odd | **SURVIVES.** Left deliberately, named here so it is a decision rather than an oversight |

## The two that need you

**#6 `RAIL_MIN = 3`.** This one is a genuine conflict between two of your own
rules, which is why I have not touched it. "Published means visible" says the two
events in a thin category must appear. The market-ready completeness bar in
CLAUDE.md says "a rail with 1 to 2 items next to a rail with 7 is a defect", which
is exactly what `RAIL_MIN` implements.

They are reconcilable, because the events are not actually hidden: they remain on
`/events`, on their category page, and in search. Only the homepage rail is
suppressed. So nothing is unreachable; a presentation rule is being applied.

What is NOT satisfied is your instruction that the user be able to tell what
happened. Today the rail simply is not rendered. My recommendation, for your
ruling rather than my decision, is to keep `RAIL_MIN` and make the homepage say
something true when a category is thin, rather than either dropping the rail
silently or showing a rail of one.

**#10 the price filter.** `price_min` / `price_max` are applied in JavaScript
after the rows come back, because the price lives on the joined `ticket_tiers`.
That is the same shape as the bug fixed in #1: filtering after the database has
chosen the page. There is code immediately below it that captures totals before
slicing, so it may already be handled. **I did not trace it to a conclusion and I
am not claiming either way.** It needs a deliberate look before launch.

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
