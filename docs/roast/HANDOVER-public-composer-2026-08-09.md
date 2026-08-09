# Handover: feat/public-composer, 9 August 2026

Written for the merge. Five branches with roughly a hundred commits between
them are about to come together, so this names what is done, what is not, and
where a conflict is EXPECTED rather than discovered.

Branch head at handover: `bc6f592`. Pushed. Tracking `origin/feat/public-composer`.

---

## THE FIRST THING TO KNOW

**This branch now contains `origin/main`.** It was 1 behind and 83 ahead, and
main carried a platform-wide timezone sweep (36 files, 39 call sites) plus the
search-scope work. Without that merge the clock guard could not even run here:
it reported about twenty files main had already fixed.

Nine conflicts were resolved in commit `0f56d97`, none by picking a winner.
**One of them is a semantic decision that changed a test and needs your
confirmation.** It is item 1 below.

---

## DECISIONS THAT NEED YOU

### 1. suburb: its own filter, or collapsed into city

**I kept this branch's behaviour and changed main's test.** That is the one
place tonight where I overrode a shipped assertion, so it is first.

- **origin/main** collapsed suburb INTO city: `?city=sydney&suburb=newtown`
  became `city: 'newtown'`, an ilike on `venue_city`. That matches only events
  whose `venue_city` string literally reads "Newtown". Most Sydney events store
  "Sydney", so the suburb link looked like a filter and returned little.
- **This branch** keeps suburb as its own filter, resolved through
  `resolveSuburb` to a district and then to the ids of events inside it. Real
  geographic narrowing, and it is fully wired.

The assertion in `tests/unit/events/search-and-filters.test.ts` now tests the
composed result, with the reasoning written at the test rather than only in a
commit message. **If you prefer main's collapse, that test is the one place to
change it back, and the suburb branch in `fetchers.ts` goes with it.**

### 2. Law 7 and Law 8 are not in this branch's CLAUDE.md

I followed them as you stated them: citations, and no AI authorship trailer.
**All five of my commits tonight carry no trailer.** But `grep` finds neither
law in `CLAUDE.md` on this branch, so they are presumably on another branch and
will arrive with it. Worth confirming the merged constitution actually carries
them, because the 76 earlier commits on this branch DO carry trailers and
nothing will flag that once the laws land.

---

## WHAT IS DONE

### KNOWN_UNFIXED is empty

All four sites fixed, each with its ratchet entry removed in the same change.

| Site | What a user got before | Now |
|---|---|---|
| `ticket-selector` | "Sale opens" in the READER's zone. A sale opening 7pm Perth read as 9pm in Sydney, so a buyer came back after it opened. A lost sale | The event's zone, and the zone is NAMED: "Tue 1 December 2026 at 11:30 pm AWST" |
| `trending-events-bento` | Homepage rail showed a Perth event's next day to a Sydney reader, before anyone clicked | Event zone |
| `surprise-me-modal` | Same, in the suggestion payload | Event zone |
| `artists/[slug]` credits | A show on the first or last night of a month landed in the WRONG MONTH | Event zone |

`eventTimezone` is **required, not optional**, on the selector's props. An
optional prop is how this stayed wrong; a caller that forgets it now fails to
compile.

One new formatter, `formatEventMonthYear`, added to main's shared
`src/lib/dates/event-time.ts` rather than inlined.

**Also fixed, and it was mine:** `draft-event-preview.tsx` read the clock twice.
A draft has no event row and its `startDate` is a naive wall-clock string, so
the local constructor and the unpinned formatter CANCELLED and the output was
in fact stable. Still indistinguishable from the defect and one refactor from
becoming it. Both reads are now explicitly UTC.

### The guard cannot narrow quietly

Six planted fixtures the matcher must catch, five it must not, three scope
assertions. Each drilled by actually narrowing the guard:

- removing `Intl.DateTimeFormat` from the matcher: **RED**
- pointing the walk at the dashboard only: **RED**
- restoring the `use client` skip: **GREEN, and that was a real hole**

That third result is why `isExempt` exists. The first coverage block asserted
on the WALK, but the skip lives inside the SWEEP, so restoring it left every
coverage test green: blind in exactly the way it was written to prevent, one
level down. The exemption is now a named function asserted directly.
Re-drilled: **RED**.

The ratchet's self-enforcement was drilled too: defect present and unlisted goes
red; present and listed passes; fixed but left listed goes red naming the file.

### npm run build is in the gate sequence, exit code read directly

`package.json` already had `gates` with `npm run build` last in an `&&` chain,
which reads exit codes directly. Verified by running it with the code captured
in a variable and **never through a pipe**: exit **0**.

That mattered twice tonight. `npm run build` first exited **1** because
`.env.local` points at the PRODUCTION Supabase project and the env guard
blocked it. Piping to `tail` would have shown a plausible-looking log and
hidden the exit code, which is the exact failure you described.

### The build was blocked for everyone, and is not any more

`canonical-host` failed on three `scripts/sweep/*.mjs` files that build a
throwaway address, `sweep.buyer.${stamp}@eventlinqs.com`. The guard matches the
bare domain wherever it appears, so an email address in a template literal read
as a host in a URL position.

**Verified PRE-EXISTING on `origin/main`** by checking out main's `scripts/` and
running the guard there: same three files, same failure. So main's own
`npm run build` was blocked, and this unblocks both.

### Verified like a user

Two reader zones, real browsers, both viewports. Evidence in
`docs/roast/timezone-walk-2026-08-09/` (two walk JSONs, 40 captures);
instrument `scripts/verify/timezone-surfaces-walk.mjs`.

The first attempt varied the wrong thing: `process.env.TZ` moves only the
SERVER. The half that bites is the hydrating CLIENT, so the reader's zone is
set on the Playwright browser context. A walk that varied the process alone
would have proven half the property and looked complete.

Ten surface/viewport combinations, Auckland against Perth: **all SAME**, zero
sideways scroll at 390.

---

## WHAT IS NOT DONE

### 1. The rebuilt-page drill for the walk

**Intended:** revert the ticket-selector fix, rebuild, re-walk, confirm the
walk catches it. **Blocked** by the disk guard at 4.4 GB against its 5 GB
floor. Disk fell during the session from other activity on the machine.

**What was done instead:** both expressions evaluated in real browsers at both
reader zones.

```
PRE-FIX  Auckland reader : 2 Dec 2026, 4:30 am
PRE-FIX  Perth reader    : 1 Dec 2026, 11:30 pm     <- different DAY
SHIPPED  both readers    : Tue 1 December 2026 at 11:30 pm AWST
```

That proves the defect class and the fix at the exact zones used. It does NOT
prove a rebuilt page surfaces it through the full render path. **Next action:
free disk above 5 GB, then run the drill.**

### 2. Lighthouse, axe, link-integrity crawl, affordance scan

None run tonight. The four surfaces are existing ones and the changes are
date strings, so regression risk is low, but they are owed and not claimed.

### 3. The deployment (RESOLVED: READY)

`dpl_667XpaPtEBopgEZN6KMTUsCTJyKx`, commit `bc6f592`, state **READY**,
`readyState: READY`, `aliasError: null`, region syd1, built in 135 seconds.
Alias `eventlinqs-app-git-feat-public-b39b4c-lawals-projects-c20c0be8.vercel.app`.

The handover commit `66c11e6` lands after it, so re-check that the newest
deployment is READY before quoting the preview.

The `preview-deployment-state` guard SKIPS locally with no `VERCEL_TOKEN`, and
it says so loudly: a skip is not a pass. Setting that token in the environment
is what makes it real.

---

## FILES ANOTHER BRANCH HAS PROBABLY TOUCHED

Ranked by how likely a conflict is. Two branches were already found fixing the
same signup defect in the same four files, so treat these as expected.

### Near-certain

| File | Why | What I did |
|---|---|---|
| `src/lib/dates/event-time.ts` | main's timezone sweep owns it; any branch doing dates will add to it | Added ONE function at the end, `formatEventMonthYear`. Additive, should merge cleanly |
| `src/lib/events/fetchers.ts` | 3 conflicts already; the hottest file in the repo | Composed tab scoping with the ops resolver. **Read the MERGE NOTE in the file before resolving again** |
| `src/lib/events/search-params.ts` | 4 conflicts already | Kept this branch's supersets plus main's `tab`; removed main's duplicate local `DATE_TO_PRESET` |
| `src/lib/events/types.ts` | 1 conflict already | Union of both sides |
| `src/app/events/page.tsx` | 1 conflict already | Kept `BrowseNotice` over main's `ReservationNotice`; removed the orphaned import |

### Likely

| File | Why |
|---|---|
| `src/components/checkout/ticket-selector.tsx` | I took main's version wholesale then added a REQUIRED prop. Any branch adding a prop here conflicts, and the required prop will break their call sites until they pass `eventTimezone` |
| `src/components/features/events/ticket-panel-client.tsx` | Same prop chain |
| `src/app/events/[slug]/page.tsx` | Huge file, two call sites patched, plus main's robots work |
| `scripts/guards/run-guards.mjs` | Every branch that adds a guard edits the registry AND the header comment. The registry test requires both |
| `src/lib/broadcast/short-links.ts` | I added `launch` to RESERVED_CODES and a `digest` channel marker |
| `tests/unit/dashboard/no-clock-during-render.test.ts` | Any branch fixing a clock read edits KNOWN_UNFIXED. It is now EMPTY and typed `Map<string, string>` |

### Worth knowing

`src/lib/events/home-queries.ts`, `src/app/api/home/surprise/route.ts`,
`src/lib/marketplace/showcase.ts`, `src/components/features/events/event-bento-tile.tsx`
each gained a `timezone` column in a select, a type and a mapping. Small, but a
branch touching the same select list will conflict on the column list.

`scripts/guards/canonical-host.mjs`: three allowlist entries added.

---

## NEXT ACTIONS, IN ORDER

1. **Confirm the newest deployment is READY**, not the one before it.
2. **Rule on the suburb decision** (item 1 above). It is the only place I
   changed a shipped assertion.
3. **Free disk above 5 GB and run the rebuilt-page drill** so the walk's
   sensitivity is proven through the full render path, not only in the client.
4. **Merge order suggestion:** this branch already contains main, so merging it
   first makes the other four branches conflict against a tree that already has
   main's sweep in it, rather than each of them re-resolving the same nine
   conflicts.
5. Lighthouse, axe, link crawl, affordance scan on the four surfaces.
6. Confirm the merged `CLAUDE.md` actually carries Law 7 and Law 8.
