> **SUPERSEDED 23 AUGUST 2026. DO NOT ACT ON THIS DOCUMENT.**
>
> The founder REVERSED this ruling seven days after making it. The binding
> rule is now **ONE EVENT SHOWS THE RAIL**: there is no minimum count on any
> surface, and a rail renders whenever it has at least one event. The law lives
> in `CLAUDE.md` under the market-ready completeness bar, and the build-failing
> proof is `tests/unit/growth/one-event-shows-the-rail.test.ts`.
>
> WHY THE REVERSAL. The reasoning below is sound for a platform that has
> volume, and wrong for one that does not. `RAIL_MIN = 3` hid a real
> organiser's real event for being the only one in its category, and the first
> organiser in a category is the one we can least afford to lose. The argument
> below that "nothing is unreachable, only unrailed" is true and is no longer
> the point: the homepage is where an organiser looks to see whether listing
> with us did anything, and it showed them nothing.
>
> WHAT REPLACED THE COMPROMISE. `ThinCategoriesNote`, the note this ruling
> built to name the suppressed categories, is DELETED along with its test. It
> existed only to describe what the threshold was hiding, so with the threshold
> gone it had nothing left to name. Thinness is now answered by FILLING the
> rail: `invitationFillCount` tops a one-event rail up to four cards with
> invitations to be next on it, so a sparse rail reads as recruitment.

---
# RAIL_MIN: the ruling, and why the conflict was only apparent

Founder ruling, 16 August 2026. Exclusion audit item 6. Written so the next
session finds the answer instead of rediscovering the question.

## The ruling

**`RAIL_MIN = 3` STANDS. The homepage now says so.**

A homepage rail is editorial curation, not discovery. A rail of one reads as a
broken shelf standing next to a rail of seven, and that is a defect by the
market-ready completeness bar in `CLAUDE.md`, which says in as many words: "A
rail with 1 to 2 items next to a rail with 7 is a defect."

What was NOT acceptable was the silence. Until today a thin category simply did
not render, and "no rail" looked exactly like "no events". That is the same
mechanism the exclusion audit spent a night closing everywhere else: the thing
that reports the outcome is not the thing that does the work, so absence and
failure produce identical output.

## Why the two rules never actually conflicted

The audit flagged this as a genuine conflict between two of the founder's own
rules, and asked for a ruling rather than deciding. Read precisely, they do not
touch:

| Rule | What it governs | What it says here |
|---|---|---|
| Published means visible (16 August 2026) | REACHABILITY | The event must be findable. It is: `/events`, its category page, its city page and search all list it |
| The volume law (`CLAUDE.md`) | PRESENTATION | The homepage must not look half-built. A rail of one does |

`RAIL_MIN` removes a RAIL. It has never removed an EVENT. Nothing on the
platform becomes unreachable because a homepage rail did not render, and no
other surface applies the rule at all.

So the correct resolution is not to choose one rule over the other. It is to
notice that the platform was doing the right thing and not saying it.

## What was built

`src/components/features/home/thin-categories-note.tsx`, rendered on the
homepage after the category rails.

Every category that has one or two events on is named, with its real count and
a link to exactly the listing its rail would have linked to:

> **ALSO ON / ON NOW, IN SMALLER NUMBERS**
> A rail needs three events before it reads as a line-up rather than a gap, so
> these are listed here instead. They are on sale now, and every one of them is
> one tap away.
> `Comedy 2 events`  `Sport 1 event`  `Family 2 events`

Three properties make it a statement rather than furniture:

1. **It is built from the same slices the rails render**, so the note and the
   rails can never disagree about what is on.
2. **It renders nothing when every category is full or empty.** At real density
   it disappears completely. It is a launch-shaped truth, not a permanent band.
3. **It wears the rail chrome**, the gold rule, the gold eyebrow and the
   rail-scale heading, because it is a rail-shaped statement. No new colour, no
   new type scale, no new component language (Law 1, Design system).

## What this does NOT change

- The counts under **Browse by Category** were already live and already
  truthful; a thin category has shown its real count there all along.
- `/events`, `/categories/[slug]`, the city pages and search are untouched. They
  never applied `RAIL_MIN` and still do not.
- Nothing is added when the catalogue is thin ACROSS THE BOARD. The empty-state
  card ("Events loading soon") still owns the zero-events case.

## The line for the next session

If you are about to lower `RAIL_MIN` to 1 or 2 because a category looks
suppressed: do not. The rule is deliberate, the events are reachable, and the
homepage now states the case. If you are about to delete the note because the
homepage looks busy: check the catalogue first, because at density it is not
rendering at all and something else is busy.
