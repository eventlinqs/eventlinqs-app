# Handover: feat/public-composer, 9 August 2026

Written for the merge. Five branches with roughly a hundred commits between
them are coming together, so this names what is done, what is not, and where a
conflict is EXPECTED rather than discovered.

Branch head at handover: see the final commit on `feat/public-composer`.
Pushed and in sync with origin.

---

## 1. THE SUBURB DIVERGENCE: DELIBERATE, FOUNDER-RULED, DO NOT REVERT

**Founder ruling, 9 August 2026: keep this branch's precise behaviour.**

`origin/main` collapsed `suburb` INTO `city`, so `?city=sydney&suburb=newtown`
became `city: 'newtown'`, an ilike on `venue_city`. That only matches events
whose `venue_city` string literally reads "Newtown". Most Sydney events store
"Sydney", so the suburb link rendered as a working filter and returned almost
nothing.

The founder's words: *a control that looks like it works and returns nothing is
worse than no control, and it is the same class as the category landings that
took the six soonest events platform-wide and only then filtered by category.*

**This branch keeps `suburb` as its own filter**, resolved through
`resolveSuburb` to a district and then to the ids of events inside it
(`fetchers.ts`, `resolveEventFilterOps`). Real geographic narrowing.

**A shipped assertion was re-pointed to match**, in
`tests/unit/events/search-and-filters.test.ts`:

```
was:  parseEventsSearchParams({city:'sydney', suburb:'newtown'}).filters.city === 'newtown'
now:  .city === 'sydney'  AND  .suburb === 'newtown'
```

**IF YOU ARE MERGING AND SEE THAT ASSERTION CHANGED, IT IS NOT A REGRESSION.**
The reasoning is written at the test itself so it cannot be lost. Reverting it
silently re-breaks the suburb link on every city page.

---

## 2. THE NINE CONFLICTS ALREADY RESOLVED, SO THEY ARE NOT RE-LITIGATED

All in the merge commit "Merge origin/main: the timezone sweep, and four
conflicts resolved by keeping both sides". **None was resolved by picking a
winner.** If the same conflicts resurface when another branch merges, this is
the resolution to reproduce.

| # | File | Conflict | Resolution |
|---|---|---|---|
| 1 | `src/lib/events/types.ts` | main added `tab`; this branch added `suburb`, `organiser`, `faith`, `moment` | **Union.** Dropping either side loses a shipped filter |
| 2 | `src/app/events/page.tsx` | main's `ReservationNotice` vs this branch's `BrowseNotice`, both fixing the same checkout bounce-back | **Kept `BrowseNotice`**: driven by parsed search params and also covers `reservation_expired`, the more common bounce. main's now-unused import removed rather than left dangling |
| 3 | `src/lib/events/search-params.ts` | the accepted-params list | **HEAD's superset** (it also handles the `free=1` and `price=free` spellings) plus main's `tab` |
| 4 | `src/lib/events/search-params.ts` | preset resolution | **HEAD's superset**, same reason |
| 5 | `src/lib/events/search-params.ts` | filter mapping | **HEAD's fields plus main's `tab` line.** This is the suburb decision in section 1 |
| 6 | `src/lib/events/search-params.ts` | duplicate `DATE_TO_PRESET` | main's local copy removed; `url-filters.ts` is its canonical home after this branch's refactor |
| 7 | `src/lib/events/fetchers.ts` | public fetch path | **COMPOSED, not chosen.** main added tab scoping (WHERE free text may match); this branch refactored filters into one ops resolver (HOW a filter becomes an op). They are orthogonal: the tab resolves the effective filters, then the resolver applies them |
| 8 | `src/lib/events/fetchers.ts` | `unstable_cache` key parts | **Union of both key sets.** A filter missing from the key serves one filter's page under another's URL |
| 9 | `src/lib/events/fetchers.ts` | cached admin fetch path | Same composition as 7 |

**The one interaction that needed care in 7 and 9:** on the Organisers tab the
query names an ORGANISER, so the free text is consumed by the
`organisation_id` lookup and **withheld** from the resolver, or it would also
run as a title match and return plausible-looking wrong results. The MERGE NOTE
is in `fetchers.ts` at the block.

---

## 3. FILES ANOTHER BRANCH HAS PROBABLY ALSO TOUCHED

Ranked by how likely a conflict is. Two branches were already found fixing the
same signup defect in the same four files, so treat these as expected.

### Near-certain

| File | Why | What this branch did |
|---|---|---|
| `src/lib/events/fetchers.ts` | 3 conflicts already; hottest file in the repo | Composed tab scoping with the ops resolver. **Read the MERGE NOTE in the file before resolving again** |
| `src/lib/events/search-params.ts` | 4 conflicts already | HEAD supersets plus main's `tab`; removed main's duplicate `DATE_TO_PRESET` |
| `src/lib/events/types.ts` | 1 conflict already | Union of both sides |
| `src/app/events/page.tsx` | 1 conflict already | Kept `BrowseNotice`; removed the orphaned import |
| `src/lib/dates/event-time.ts` | main's timezone sweep owns it; any date work adds here | Added ONE function at the end, `formatEventMonthYear`. Additive |

### Likely

| File | Why |
|---|---|
| `src/components/checkout/ticket-selector.tsx` | Took main's version wholesale, then added a **REQUIRED** `eventTimezone` prop. Any branch adding a prop conflicts, and the required prop **breaks their call sites until they pass it**. That is deliberate: optional is how this stayed wrong |
| `src/components/features/events/ticket-panel-client.tsx` | Same prop chain, both render sites |
| `src/app/events/[slug]/page.tsx` | Large file; two call sites patched, plus main's robots work |
| `scripts/guards/run-guards.mjs` | Every branch adding a guard edits the registry AND the header comment; the registry test requires both |
| `src/lib/broadcast/short-links.ts` | Added `launch` to `RESERVED_CODES` and a `digest` channel marker |
| `tests/unit/dashboard/no-clock-during-render.test.ts` | Any branch fixing a clock read edits `KNOWN_UNFIXED`. It is now **EMPTY** and typed `Map<string, string>`, plus a new coverage block and `isExempt` |
| `scripts/guards/canonical-host.mjs` | Three allowlist entries added |
| `docs/roast/FALSE-POSITIVE-CHECKLIST.md` | New entry 3 appended |

### Column-list conflicts (small but real)

These each gained a `timezone` column in a select, a type and a mapping. A
branch touching the same select list conflicts on the column list:

`src/lib/events/home-queries.ts`, `src/app/api/home/surprise/route.ts`,
`src/lib/marketplace/showcase.ts`,
`src/components/features/events/event-bento-tile.tsx`.

---

## 4. WHAT DEPENDS ON A MIGRATION YOU HAVE NOT APPLIED

**One, and only one.**

`supabase/migrations/20260812000001_kit_draft_covers.sql` creates the storage
bucket for anonymous composer cover artwork. Public read, and deliberately **no
anonymous insert policy at all**: the only writer is
`POST /api/launch/[code]/cover` under the service role, after a fail-closed
rate limit, an ownership check against the httpOnly draft cookie, a byte cap,
magic-byte sniffing, a decompression-bomb guard and a full sharp re-encode.

**Until it is applied:** a stranger can build a kit and see everything, but
uploading their own artwork fails, so every poster falls back to the
typographic composition. No crash, no dead end.

**RENUMBERED, and TEST needs a repair before the next push.** This file was
`20260809000001` and was applied on TEST under that version. It moved to
`20260812000001` by founder ruling on 2026-08-12, because
`fix/security-hardening` claims `20260809000001` for `payout_status_unset` and
`db push` keys on the version prefix alone: with both at that version, one is
recorded as done and the other never runs. The payout one does not move, because
a silently skipped payout release strands every restricted organiser for ever.

TEST still holds `20260809000001` as applied, and `payout_status_unset` would
inherit that record and never run.

**There are now TWO repairs, not one** (the taxonomy renumber of 2026-08-12 added
the second). Both are `--status reverted`, which only deletes a ledger row; it
runs no SQL and touches no table. Run them together, then push once:

```
npx supabase migration repair --status reverted 20260809000001 --linked
npx supabase migration repair --status reverted 20260808000004 --linked
npx supabase migration list --linked     # neither version applied any more
npx supabase db push --linked
```

**What that push then applies on TEST**, and why each is safe to re-run:

| version | file | effect on TEST |
|---|---|---|
| `20260809000001` | `payout_status_unset` | runs for the FIRST time. This is the whole point of the repair |
| `20260812000001` | `kit_draft_covers` | re-runs. `on conflict do nothing` on the bucket, policy dropped before created |
| `20260812000002` | `category_taxonomy_repair` | runs for the first time. Every statement is guarded, so on TEST it only settles the category NAME to "Arts and Theatre"; `_r1` already did the rename, the comedy row and the comedy backfill |
| `20260808000004` | `category_taxonomy_r1` | re-runs, because the repair cleared its row too. Guarded the same way, so it is a no-op on a database it has already run against |

The last row is the one to understand before running: reverting `20260808000004`
un-records the file that DID run (`_r1`), so it becomes pending again and
re-executes. That is intended and safe because `_r1` is idempotent, and it is the
only way to clear the version for the file that did not run.

**Apply with:** `supabase db push --linked`

**Not a dependency any more:** `20260809000001_kit_drafts.sql` was written for
a `kit_drafts` table and then **removed**. The draft store now uses Redis,
which fits better on the merits: a draft is inherently ephemeral, so the 30-day
life IS a TTL and there is no nightly sweep to write, schedule or get wrong.
Keys are namespaced by Supabase project ref, so a TEST draft can never be read
by production. **If you see that filename referenced anywhere, it is stale.**

Six other migrations on this branch (`20260808000001` to `20260808000006`) came
from `origin/main` via the merge, not from this branch.

---

## 5. WHAT IS DONE

### KNOWN_UNFIXED is empty

| Site | Before | Now |
|---|---|---|
| `ticket-selector` | "Sale opens" in the READER's zone. A sale opening 7pm Perth read as 9pm in Sydney, so a buyer returned after it opened. A lost sale | Event zone, and the zone is NAMED: "Tue 1 December 2026 at 11:30 pm AWST" |
| `trending-events-bento` | Homepage rail showed a Perth event's next day to a Sydney reader | Event zone |
| `surprise-me-modal` | Same, via the suggestion payload | Event zone |
| `artists/[slug]` credits | A show on the first or last night of a month landed in the WRONG MONTH | Event zone |

Also fixed, and it was this branch's own: `draft-event-preview.tsx` read the
clock twice. The two runtime-zone reads CANCELLED so the output was stable, but
it was indistinguishable from the defect and one refactor from becoming it.
Both are now explicitly UTC.

### The guard cannot narrow quietly

Six planted fixtures the matcher must catch, five it must not, three scope
assertions, and `isExempt` so the exemption decision is asserted directly.

Three narrowing drills, each run: removing `Intl.DateTimeFormat` **RED**;
narrowing the walk to the dashboard **RED**; restoring the `use client` skip
**RED** (after the fix; it was GREEN before, which is checklist entry 3).

Ratchet self-enforcement drilled: defect present and unlisted **RED**; present
and listed **PASS**; fixed but left listed **RED** naming the file.

### Audits

| Audit | Result |
|---|---|
| Link-integrity crawl | **PASS.** 328 internal links, **zero dead links** |
| Affordance scan | **PASS.** 19 pages, **0 dead-end tiles** |
| axe-core (WCAG 2 A/AA) | **PASS.** 3 surfaces x 2 viewports, **0 violations, 0 serious/critical** |
| Lighthouse | **NOT RUN.** See section 6 |

### Verified like a user

Ten surface/viewport combinations under two reader zones (Pacific/Auckland and
Australia/Perth), **all identical**, zero sideways scroll at 390. Evidence in
`docs/roast/timezone-walk-2026-08-09/`.

The reader zone is set on the Playwright browser context. The first attempt set
`process.env.TZ`, which moves only the SERVER; the half that bites is the
hydrating CLIENT, so that walk would have proven half the property and looked
complete.

---

## 6. WHAT IS NOT DONE

### 6a. Lighthouse: BLOCKED ON DISK

Chrome cannot launch. **The drive is at 655 MB free** and fell through the
session (5.1 GB to 655 MB) from activity outside this repo.

### 6b. The rebuilt-page drill: BLOCKED ON DISK

Same cause. The disk guard's floor is 5 GB and it was not worked around.

What stands instead: both expressions evaluated in real browsers at both reader
zones.

```
PRE-FIX  Auckland reader : 2 Dec 2026, 4:30 am
PRE-FIX  Perth reader    : 1 Dec 2026, 11:30 pm     <- different DAY
SHIPPED  both readers    : Tue 1 December 2026 at 11:30 pm AWST
```

That proves the defect class and the fix at the exact zones used. It does NOT
prove a rebuilt page surfaces it through the full render path.

### SAFE TO CLEAR, measured this session

| Path | Size | Safe? |
|---|---|---|
| `%LOCALAPPDATA%\npm-cache` | **1.11 GB** | **YES.** `npm ci` refetches |
| `%TEMP%` (Windows user temp) | **0.49 GB** | **YES.** Transient |
| `%LOCALAPPDATA%\pip\cache` | **0.18 GB** | **YES.** Regenerable |
| `%LOCALAPPDATA%\Microsoft\OneDrive` cache | **1.61 GB** | **ASK.** The repo lives inside OneDrive; clearing may force a full resync |
| `%LOCALAPPDATA%\ms-playwright` | 0.66 GB | **NO.** Needed for the drill and axe |

**Clearing the three YES rows recovers about 1.78 GB, reaching roughly 2.4 GB.
That is still short of the 5 GB floor.** With the OneDrive cache as well it
reaches roughly 4.0 GB, still short. **About 1 GB more has to come from
elsewhere on the drive**, which is 236 of 237 GB used, so the bulk is outside
these caches and outside this repo.

**Repo health, flagged not acted on:** the repo is about 5.5 GB, of which
`docs/` is **2.75 GB** and `.git` is **1.70 GB**. Every verification walk
commits PNGs and PDFs, and all of it is committed (zero untracked files under
`docs/`), so none of it is safe for me to delete and `.git` will keep growing.
Worth a decision about where binary evidence lives.

---

## 7. NEXT ACTIONS, IN ORDER

1. **Free disk.** Clear the three YES rows, decide on OneDrive, find about 1 GB
   more. Target 5 GB so the build guard passes.
2. **Run the rebuilt-page drill**: revert the ticket-selector fix, rebuild,
   re-walk, confirm the walk catches it, restore.
3. **Run Lighthouse**, median of 3 minimum against the warmed preview, never
   localhost and never a single run.
4. **Repair the TEST record, then apply `20260812000001_kit_draft_covers.sql`**
   (see section 4 for the exact commands) so anonymous cover upload
   works.
5. **Merge order suggestion:** this branch already contains `origin/main`, so
   merging it first means the other four branches conflict against a tree that
   already has main's sweep, rather than each re-resolving the same nine
   conflicts in section 2.
6. **Confirm Law 7 and Law 8 are in the merged `CLAUDE.md`.** Neither is in
   this branch's copy. All five commits from this session carry no AI trailer;
   the 26 in the range are inside `86bb285`, the squashed PR #112 that main
   contributed.
