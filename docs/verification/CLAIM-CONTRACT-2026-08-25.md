# The claim contract: a step that claims work must say how much it did

**Date:** 25 August 2026
**Ordered by:** Lawal Adams
**Helper:** `scripts/lib/work-report.mjs`
**Guard:** `scripts/guards/steps-declare-work.mjs` (two checks)
**Drills:** 61 of 61 fire, three of them new
**Unit tests:** `tests/unit/guards/work-report.test.ts`, 13 cases

---

## The ruling, verbatim

> The warm step was named "Warm ISR + the next/image optimiser" and warmed no
> images at all, for weeks. Your own replacement then reported 40 variants on
> four pages, which was a silent cap. Every CI step and every script that CLAIMS
> to do work must PRINT HOW MUCH IT DID, and a zero must read as a failure rather
> than a pass. Sweep them, fix them, guard it.

---

## Two incidents, two different failures, both covered

**The step that did nothing and said nothing.** A CI step named for warming the
image optimiser requested each page's HTML and stopped. It never touched
`/_next/image` at all. It printed a tidy list of 200s and went green for weeks,
while the cold start it existed to remove kept landing inside every Lighthouse
run.

**The step that did some and reported it as all.** Its replacement did warm
images, then reported 40 variants across four pages. Four pages sitting on
exactly 40 is not a measurement. It is a cap, printed as though it were the
finding.

So a claim carries two things or it is not a claim: **what was done, as a
number**, and **whether that number was truncated**.

## `did` versus `found`, which are opposites

| Field | Meaning | Zero means |
|---|---|---|
| `did` | Work performed: pages fetched, files read, rows compared, URLs warmed | **FAILURE. Exit 1** |
| `found` | What the work turned up: violations, drifts, dead links | **The pass**, printed rather than implied |
| `truncated` | Anything capped, named | A cap can never be read as a finding |
| `zeroIsFine` | A `did` key mapped to the reason zero is legitimate | Printed every run, so it cannot become a quiet opt-out |

Conflating the two would make every clean run red, which is the fastest way to
get a gate switched off.

## The sweep

**Scripts a CI `run:` step invokes: 12.** The list is DERIVED from
`.github/workflows/*.yml` on every guard run rather than written down, so adding
a step to CI puts its script under the contract automatically. A hand-maintained
list would have to be remembered, and being remembered is the thing that failed.

| | Before | After |
|---|---|---|
| declare what they did | 0 | 10 |
| reviewed exemptions | 0 | 2 |

The two exemptions, printed with their reason on every run:
`scripts/check-types-drift.sh` (bash, cannot import an ES module; an empty diff
IS its pass) and `scripts/seed-purchase-fixture.mjs` (writes fixture ids to
stdout for the next step, so an empty stdout fails that step immediately). An
exemption for a script CI no longer runs fails the guard, so the list cannot rot.

**Guards the runner runs: 49.** A guard is the same shape of claim as a CI step
and fails the same way: `[x] PASS` on a run that scanned nothing reads exactly
like `[x] PASS` on a run that scanned everything.

| | Count |
|---|---|
| already printed a tally of their own | 42 |
| printed no number at all, now fixed | 7 |
| **total declaring what they scanned** | **49 of 49** |

The seven were `preview-deployment-state`, `event-structured-data`,
`migration-needs-sale-gate-fix`, `pricing-derive`, `refund-restores-inventory`,
`no-ambiguous-embed` and `inventory-lock-integrity`.

Check 2 is deliberately LOOSER than check 1. It accepts `declareWork` or any
printed interpolation that moves with the work, because 42 guards already print
their tally in their own voice and rewriting all of them to one helper would be
churn against working code. What it refuses is a guard that prints no number.

## The detector was wrong before it was right

Its first version required the `console.log(` and its interpolation on the SAME
LINE, and reported 22 mute guards. Five of those were printing a perfectly good
tally two lines down, wrapped by the formatter. Left alone, this pass would have
gone and rewritten five working guards on the word of a broken reader. The
pattern now spans lines, and the count fell from 22 to 7.

## The boundary, with its number, because a scope decision without one is a guess

Swept over all of `scripts/`, on the tree as it now stands:

```
scripts that announce a pass                            227
  printing no count at all                               66
    of those, a CI step or a registered guard             0
    of those, one-off session scripts                    66
```

**Nothing live is left mute.** The 66 are the accumulated one-off scripts of past
sessions: `batch-*`, `capture-*`, `after-*`, screenshot runs, one-shot probes.
None is invoked by a workflow, none is registered in the guard runner, and none
can go green in front of anybody. Bringing them under the contract would be 66
edits to code nothing runs, which is churn, and it would put 66 more entries in
front of the reader of this report for no gain in safety.

The line is drawn at what can PASS IN FRONT OF SOMEBODY: a CI step, or a guard on
the build. If one of those 66 is ever wired into a workflow, check 1 picks it up
on the next run without anybody remembering to.

## What the guard cannot see, stated rather than implied

That a declared count is TRUE. `declareWork` prints whatever it is handed, and a
script that handed it a constant would pass this guard while lying. What stops
that is the same thing that caught the 40: a number that never moves is visible
in a log, and a number that is absent is not.

It also does not read inline shell blocks in a workflow. A `run: |` block of curl
and grep cannot import a module; the ones that matter here already print an HTTP
status per request.

## Drills

| Drill | Check |
|---|---|
| a CI step stops declaring how much work it did | 1 |
| a registered guard stops printing how much it scanned | 2 |
| an exemption is left behind after CI stops running that script | rot |

Plus the runtime negative control, which is the one that matters most: 13 unit
cases in `tests/unit/guards/work-report.test.ts` assert that a zero `did` count
RETURNS FALSE and prints `DID NOTHING`. A helper that printed a tidy count and
never refused would be the warm step again, wearing a contract.

## A note on the grammar, because it was wrong three times

The helper pluralises the head noun of a phrase, not the participle. Its first
version printed "3 boot specifier checkeds", then "11 report checked for
indexabilities", then "0 ambiguouses embed" (because "embed" ends in "ed" and was
read as a participle), then "730 URL swepts". Each is in the unit test as a case.
It is a small thing, but a log nobody can read at 2am is a log nobody reads.

## Gates at the time of writing

```
tsc --noEmit          0 errors
eslint                0 errors, 52 warnings (all pre-existing)
guards                all 49 PASS
drills                61/61 fire
vitest                846 files, 2843 tests, 0 failed, 0 skipped
next build            exit 0 against TEST
```
