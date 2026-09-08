# PR5 PLAN. One pull request at a time, and a check that says when it is not.

Close-out, PR HYGIENE, PR5, verbatim:

  "From now on, one open pull request at a time. Open the next only when the
   previous is merged or closed. Register a guard or a check that reports when
   more than two pull requests are open at once."

## The state that makes this harder than it reads

After the PR1 audit of 9 September there are FOUR open pull requests, and three
of them are open BY DECISION, not by neglect:

  139  feat/positioning-lock              in flight, merging now
  104  docs/marketing-and-merge-103-evidence  holds CONTENT-PLAN.md and
                                              OUTREACH-TEMPLATES.md, on main nowhere
  97   chore/photo-shot-list              holds docs/SHOT-LIST.md, blocked on photo day
                                          AND on re-verifying its counts against C18F
  69   feat/genre-data-layer              /music routes, parked by CLAUDE.md's own words
                                          ("Missing scene landing pages are tracked for
                                          the post-photos taxonomy mission")

A guard that simply fails at "more than two open" fails the build on day one for
three pull requests the owner was told, in writing, would stay open. That guard
gets switched off within a week, which is the exact failure mode CLAUDE.md names
for `no-ai-authorship` and `branch-protection-required`.

## The design

`scripts/guards/one-pull-request-at-a-time.mjs`, registered in `run-guards.mjs`,
therefore blocking on `prebuild`.

  1. A REVIEWED PARKED RECORD, `scripts/guards/lib/parked-pull-requests.json`:
     one entry per deliberately-held pull request carrying `number`, `branch`,
     `why` and `unblockedBy`. This is the same shape as the reviewed baseline in
     `sourced-specifications.mjs`, which CLAUDE.md already describes: it prints
     its baseline on every run and reports entries that match nothing, so the
     allowlist cannot rot into an unexamined list.

  2. ACTIVE = open minus parked. The guard FAILS when `active.length > 1`, which
     is PR5's actual rule, and is stricter than the "more than two" reporting
     threshold the clause asks for. The total is always printed, so "more than
     two open" is visible on every run whether or not it fails.

  3. The record cannot rot. A parked entry naming a pull request that is no
     longer open is a FAULT: it means the record outlived its subject. An entry
     with an empty `why` or `unblockedBy` is a FAULT: parking must state what
     ends the parking.

  4. CREDENTIALS. Reads with `gh api` locally or `GITHUB_TOKEN` in CI, exactly as
     `branch-protection-required.mjs` does, and SKIPs in capitals with the
     remedy printed when neither is present. A guard that fails on every machine
     without credentials gets disabled within a week.

  5. PURE JUDGEMENT SPLIT OUT. `judgeOpenPullRequests({ open, parked })` returns
     a fault list and is exported, so `tests/unit/guards/` can drive every shape
     without the network, the way `judgeProtection` is tested.

## Proving it both ways

  - Unit tests over `judgeOpenPullRequests`: one active (pass), two active
    (fail), a parked entry that is not open (fail), a parked entry with no
    reason (fail), all-parked-plus-one (pass), zero open (pass).
  - A drill in `scripts/verify/guard-failure-drills.mjs`: delete an entry from
    `parked-pull-requests.json` and the guard must fail against the LIVE list,
    naming the pull request that became unexplained. Restored in a `finally`,
    like every other drill.

## Definition of done for PR5

Registered and blocking, red and green both shown, the canary raised in the same
commit, and the guard run against the real live list of open pull requests after
139 merges, when the true count is three, all three parked, zero active.
