# The false-positive checklist

Founder ruling, 9 August 2026. Sibling of `SILENT-BREAK-CANDIDATES.md`, which
catalogues features that pass every gate and can never fire. This one catalogues
the opposite direction: **gates that report green while the thing they exist to
protect is broken.**

A red gate costs an hour. A green gate over an open hole costs whatever the hole
costs, for as long as nobody looks. Every entry here is a real instance found on
this codebase, with what it cost and what now stops it.

---

## 1. A test that asserts the WRONG SIDE of a defect

**Found:** 9 August 2026, the anonymous cover upload.

The upload route writes to `<kitCode>/cover.webp`, a path derived from the kit
code, which is SHAREABLE by design. The upload is an upsert. Ownership was
verified AFTER the write.

The test for the attack case checked that the attacker's upload never moved the
owner's draft POINTER. It passed. It never checked storage, and storage was
where the damage was: anybody holding a shared code could overwrite the owner's
artwork. The response said 403, the pointer never moved, so it looked refused,
while the bytes behind the owner's poster were the attacker's.

**Why this class is worse than no test.** No test is a known gap. A test that
asserts the wrong side is a documented PASS over an open hole, and it actively
discourages the next person from looking, because the case appears covered. The
test name even said "REFUSES Mallory".

**The check to run.** For any test of a refusal, ask: *what does the attacker
actually get if this refusal is wrong?* Then assert on THAT, not on the nearest
convenient observable. Assert on the side effect, not the status code:

- refusing a write? assert nothing was written, not just that a 403 came back
- refusing a send? assert no message left, not just the response shape
- refusing a charge? assert no ledger row, not just the error
- refusing a read? assert the bytes are absent, not that the UI hid them

**Now stopped by:** `tests/unit/launch/cover-upload-route.test.ts` asserts
`h.uploaded` is null on every refusal path, and ownership resolves before any
write.

---

## 2. A gate that was never in the sequence

**Found:** 9 August 2026, `feat/public-composer`.

Six consecutive preview deployments in ERROR, going back to the act-link commit
`d529390`. The branch alias kept serving the last successful build, so **every
"verified on the deployed preview" claim on that branch since then was made
against stale code.** The other active branch built fine, so nothing surfaced
it.

Meanwhile: 1839 unit tests passing, `tsc` clean, `eslint` clean, nine guards
PASS. All of them green, all of them true, none of them capable of seeing it.
The cause was a `server-only` module reaching a client component, which only the
bundler can detect.

**Why this class is worse than no gate.** The green gates were not merely
silent, they were actively reassuring. A branch with no gates at all would have
been treated with suspicion.

**The check to run.** A branch whose preview has not built is a branch whose
verification is fiction. Before believing any claim made against a preview, ask
whether the deployment that claim was made against is actually READY.

**Now stopped by:** `npm run gates` includes `next build`, and
`scripts/guards/preview-deployment-state.mjs` fails when the newest deployment
for the current branch is in ERROR.

---

## 3. TWO SESSIONS IN ONE WORKING TREE

**Found:** 9 August 2026. Founder ruling that it is a CLASS, not an incident.

Two agent sessions were pointed at `eventlinqs-app` itself rather than at
separate worktrees. What happened, in order: one session started a merge; the
checkout overwrote the other session's UNCOMMITTED work; that session's verified
poster change then landed inside a commit whose message is about timezones.

Nothing was lost, but only because the change had been rendered, reviewed and
hashed into a baseline first, so the re-application could be proven byte-for-byte
identical. Without that baseline it would have been silently gone.

**Why this belongs in a false-positive checklist.** Every individual signal
looked normal. `git status` showed staged files, which is what a working session
looks like. Tests failed with parse errors, which reads as your own broken edit.
A guard failed, which reads as your own new guard. None of it announces "another
process is writing to this directory", and the natural response to each symptom
in isolation is to fix it, which means working around the collision instead of
recognising it.

**Symptoms, at the start of EVERY session:**

- an unexpected `.git/MERGE_HEAD`, `.git/rebase-merge` or `CHERRY_PICK_HEAD`
- files modified that you did not touch
- a stash you did not create, especially one on the current branch
- your own uncommitted work vanishing between commands
- lint or tsc reporting a parse error or a merge-conflict marker
- a test file that fails to LOAD rather than to assert

**The rule.** Run `git status` and `git stash list` BEFORE the first edit. If
another session's fingerprints are present, STOP AND REPORT rather than working
around them. Do not `git merge --abort`, do not `git commit`, do not
`git checkout --` anything: each of those destroys work you cannot see the
intent behind.

**The prevention, which is cheaper than the cure:** one worktree per session
(`git worktree add`), so two sessions cannot share an index.

---

---

## 3. A GUARD THAT ASSERTS ON THE WRONG LAYER OF ITS OWN IMPLEMENTATION

**Founder ruling, 9 August 2026: this belongs here as its own entry.**

**What happened.** The clock guard
(`tests/unit/dashboard/no-clock-during-render.test.ts`) had narrowed twice
before, and both times it reported FEWER violations and therefore looked
HEALTHIER. So a coverage assertion was added to make a future narrowing go red:
planted fixtures the matcher must catch, and scope assertions on the swept set.

One of those scope assertions was this:

```ts
it('sweeps client components, which is the hole that hid most of the platform', () => {
  const clientFiles = files.filter((f) => /^['"]use client['"]/m.test(readFileSync(f, 'utf8')))
  expect(clientFiles.length).toBeGreaterThan(100)
})
```

It asserts that the WALK lists client components. But the `use client` skip that
caused the original hole never lived in the walk. It lived inside the SWEEP
loop:

```ts
for (const f of files) {
  if (/^['"]use client['"]/m.test(src)) continue   // <- the hole
  ...
}
```

**Drilled.** Restoring that skip and re-running: **all 18 tests green.** The
coverage assertion was blind in exactly the way it was written to prevent, one
level down. It measured the input to the loop and called that coverage of the
loop.

**The fix.** The exemption decision became a named function so it could be
asserted directly rather than by proxy:

```ts
function isExempt(src: string): boolean {
  return /useHydrated/.test(src)
}

it('does not exempt a file merely for being a client component', () => {
  const clientWithDefect = [`'use client'`, '', `const w = new Date(iso).toLocaleDateString('en-AU', {...})`].join('\n')
  expect(isExempt(clientWithDefect)).toBe(false)
  expect(clockReads(clientWithDefect)).not.toEqual([])
})
```

Re-drilled with `use client` back inside `isExempt`: **RED.**

**The rule.** A coverage assertion must test the DECISION the guard makes, not
an input the decision happens to consume. Ask: *which line would I edit to
narrow this guard?* If your assertion does not execute that line, it does not
cover it. Filtering, skipping and early-`continue` are all decisions; a count of
what was fed in is not.

**Why this one is the most dangerous shape in the file.** Entries 1 and 2 are
gates that were absent or wrong. This is a gate that was PRESENT, DELIBERATE,
and written by someone who had already understood the failure mode, and it
still could not see the hole. Sincerity is not coverage.

---

## 4. A GATE THAT REPORTS SUCCESS BECAUSE IT WAS GIVEN NOTHING TO INSPECT

**Founder ruling, 12 August 2026: this belongs here as its own entry.**

*(Numbering note: two entries above are both headed `3`. Left as they are rather
than renumbered, because the prose in them cross-references by number.)*

**What happened.** `scripts/guards/no-ai-authorship.mjs` enforces Law 8 by
reading commit MESSAGES. It was registered in the guard registry, it ran on
every pull request inside `npm run build`, and it reported:

```
[no-ai-authorship] PASS - no commit in scope attributes this work to an AI.
```

It was reading ONE commit. `actions/checkout@v4` defaults to `fetch-depth: 1`,
so CI handed the guard a single-commit clone. The guard asked for the last 200
commits, git returned one, and every one of that one was clean.

**How it was found.** Not by the gate. By merging `origin/main` into the branch
and running the guard LOCALLY, where the clone is complete: it immediately
failed on `86bb285`, main's tip, which carries 27 trailers. CI was green on the
identical commit at the identical moment. The two disagreed because one of them
had been given nothing to look at.

**Why it is the worst kind of green.** A missing gate is a known hole. This gate
was present, registered, running, and printing a sentence asserting a property of
200 commits it had never read. Everyone downstream is entitled to believe it.

**The fix, in two parts, because either alone is insufficient.**

1. `fetch-depth: 0` on the `verify` job, the only job that runs the guards.
2. The guard now PRINTS ITS DENOMINATOR:

```
[no-ai-authorship] scanned 9 commit(s), scope: commits after 7fd2f4e ...
```

Part 2 is the one that matters long term. Part 1 can be reverted by anyone
tidying CI runtimes, and the gate would go quietly back to lying. With the count
in the log, `scanned 1 commit(s)` is visible from the CI output alone, without
knowing anything about the checkout configuration.

**Drilled.** Before: CI scanned 1. After: CI scanned 9, run `31524888333`.

**The rule.** Any gate that samples a POPULATION must report the size of the
population it sampled. A gate that reports only its verdict cannot be
distinguished from a gate that was handed an empty set. Ask of every green gate:
*how many things did it look at, and does it say so?*

---

## 5. A GUARD THAT CRASHES THE BUILD IT EXISTS TO PROTECT

**Founder ruling, 12 August 2026: this belongs in the permanent record.**

The inverse shape to everything above. Entries 1 to 4 are gates that were falsely
GREEN. This is a gate that was catastrophically RED, and the damage is the same
kind: the gate stops being trusted, and then it stops being enforced.

**What happened.** The same Law 8 guard shells out to `git log`. A Vercel build
unpacks a source tarball and has no `.git` directory at all, so the first call
threw:

```
fatal: not a git repository (or any parent up to mount point /vercel)
  at git (file:///vercel/path0/scripts/guards/no-ai-authorship.mjs:57:10)
[guards] 1 of 16 guard(s) FAILED. Build blocked.
```

Every deployment on the branch had been failing since the guard landed. The
guard exists only on `fix/security-hardening`, so **the day it merged to main,
every branch on the platform would have stopped deploying**, with a stack trace
pointing at an authorship check.

**It is the failure the guard's own header warns about.** That header already
argues, about scope: *"A gate that cannot go green is a gate somebody switches
off, and then the law has no enforcement at all."* The author reasoned it through
for scope and did not apply it to environment.

**The fix.** Detect the absence of history and SKIP, loudly, naming what is still
enforcing (the commit-msg hook, and this guard in CI where the checkout is real).
A commit only reaches a Vercel build after CI has already run the guard over it,
so the skip opens no gap.

**The proof shape, which is the transferable part.** A guard with an environment
branch needs drilling in EVERY environment it claims to handle, and one of those
runs must be the failure case, or the drill only proves it can say yes:

| condition | expected | got |
|---|---|---|
| real repository | runs and passes | PASS, exit 0, scanned 7 |
| deferral entry broken | RED, naming the commit | FAIL, exit 1, named it |
| `--all-history` | RED on known offenders | FAIL, exit 1, 17 offenders |
| no `.git` (the Vercel condition) | SKIP, not crash | SKIP, exit 0 |

Row 2 is the load-bearing one. Without it, rows 1 and 4 are equally consistent
with a guard that has been quietly defanged.

**The rule.** If a guard reads anything outside the source tree (git history, a
network service, an env var, a token), enumerate the environments it runs in and
drill it in each. "It passes on my machine and in CI" is two environments;
production build hosts are usually the third, and they are usually the poorest.

---

## 6. A CORRECT GUARD THAT NOTHING INVOKES

**Founder ruling, 12 August 2026: this belongs here as its own entry, and it is
the fourth instance of the class.**

**What happened.** `scripts/verify/migration-collision-guard.mjs` was written to
catch exactly one failure: two branches minting the same migration version, so
`db push` records one as applied and the other never runs and never appears
pending again. It is a good guard. It has a local-tree check, a duplicate-content
check, a cross-branch check that reads every ref, and a `--remote` mode that
compares against the linked project. Its header explains the failure mode better
than this entry does.

It was invoked by nothing. Not `run-guards.mjs`, not `package.json`, not a
workflow. It sat in `scripts/verify/` and every gate around it went green.

**What accumulated behind the silence.** Three live collisions:

| version | claimed by | state |
|---|---|---|
| `20260809000001` | `kit_draft_covers` vs `payout_status_unset` | caught before either was skipped |
| `20260808000004` | `category_taxonomy_r1` vs `category_taxonomy_repair` | **already fired on TEST**: `_r1` ran, `_repair` was recorded as applied and never executed |
| `20260531000001` | `refund_reconcile` vs `checkin_scanner` | superseded branch, no live risk |

The middle row is the guard's own predicted failure, in production data, while
the guard that predicts it sat in the repository. And `_repair`'s header records
that it had ALREADY been renumbered once to escape a different collision. Twice
moved by hand, twice landed on one, because the version was a hand-picked number
and nothing checked the choice.

**Why this shape is distinct from 4 and 5.** Entry 4 is a gate given nothing to
inspect; it ran and reported. Entry 5 is a gate that crashed what it protected;
it ran and screamed. This one **never ran at all**. There was no output to be
wrong, no red to investigate, no line in a log to disbelieve. The other two can
be caught by reading a gate's output sceptically. This one cannot, because there
is no output. It is invisible to every technique in this file.

**The fix.** Registered in `scripts/guards/run-guards.mjs`, so it runs in
`prebuild` and blocks the build, which is the only moment it can act before a
colliding version is pushed. Drilled: collision planted, `run-guards` exit 1,
`[guards] 1 of 13 guard(s) FAILED. Build blocked.`; planted file removed, exit 0,
`all 13 guards PASS`.

Two things had to be fixed for it to be registerable, and both are worth knowing:

- **It could not have been satisfied.** The fix for a cross-branch collision is a
  renumber, but every other ref keeps the old name until it merges, and one of
  those refs is always `origin/main`. The branch carrying the fix would fail
  because it carried the fix. It now recognises a renumber the working tree has
  already made and reports `[pending merge]` instead of failing. A gate that
  cannot be satisfied is a gate somebody removes, which is how this file starts.
- **It could have become entry 4.** Its cross-branch check reads refs, and a
  `fetch-depth: 1` clone has one. It now refuses to print PASS when it can see
  fewer than two refs, and says the question is unanswered instead.

**The rule, and it is a sweep rather than a habit.** Every check must be
reachable from something that runs on its own: a gate, a script in
`package.json`, or a workflow step. Existing is not enforcing. Ask of any guard
you are relying on: *what would invoke this?* If the answer is "someone
remembering", it is documentation, not a gate.

**The sweep this produced.** 78 checks in `scripts/guards/` and
`scripts/verify/`; 27 reachable, 51 invoked by nothing. Most of the 51 are
correctly manual, needing a browser, a running server or credentials. Twelve are
source-only and deterministic and could be gates today, listed in the handover.
`scripts/verify/payment-critical-doctrine.mjs` is the one that most deserves the
next look, because of what it guards.

---

## 7. A GUARD DRILLED IN ONE ENVIRONMENT AND SHIPPED TO ANOTHER

**Founder ruling, 12 August 2026: this belongs here as its own entry. It is the
sharpest one in the file, because entry 5 already says exactly how to prevent it
and it happened anyway, two entries later, to the person who wrote entry 5.**

**What happened.** `scripts/verify/payment-critical-doctrine.mjs` was registered
as a build guard on the founder's ruling. Before registering it, it was drilled:

```
mustBeSensitive: false on STRIPE_SECRET_KEY  ->  1 of 14 FAILED. Build blocked.  exit 1
restored                                     ->  all 14 guards PASS.             exit 0
```

Red on a real defect, green when fixed, manifest byte-identical afterwards. A
good drill. **It was run only on the development machine.** The guard was pushed,
and every deployment on the branch died:

```
===== 10 CLAUSE(S) UNMET =====
  STRIPE_SECRET_KEY
    (d) has no row in the docs/security/CREDENTIAL-ROTATION.md rotation matrix
[guards] 1 of 14 guard(s) FAILED. Build blocked.
```

Clause (d) reads `docs/security/CREDENTIAL-ROTATION.md`. `.vercelignore`
excludes `docs/*`, so on the build host that file does not exist and all ten
payment-critical variables looked uncovered. The guard was right about what it
could see and wrong about the world.

**Entry 5 of this file, written two turns earlier, says:** *"If a guard reads
anything outside the source tree (git history, a network service, an env var, a
token), enumerate the environments it runs in and drill it in each. 'It passes
on my machine and in CI' is two environments; production build hosts are usually
the third, and they are usually the poorest."* The rule was written, published,
and then not applied by its own author. Knowing the failure mode is not the same
as running the check.

**It was also the SECOND time on this exact host for this exact reason.** The
header of `.vercelignore` already recorded `check-pricing-lock.mjs` parsing
`docs/PRICING.md` and blocking every deploy until that file was re-included.
The precedent was in the file being edited.

**THE DIRECTORY-EXCLUSION DETAIL, which cost a second failed deploy.** The
obvious fix is wrong:

```
docs/*
!docs/PRICING.md
!docs/security/CREDENTIAL-ROTATION.md      # <- does nothing
```

`docs/*` excludes the `docs/security` DIRECTORY, and gitignore semantics (which
Vercel inherits) say a file inside an excluded directory can never be
re-included. `docs/PRICING.md` works only because it sits directly under `docs/`
and is therefore excluded as a FILE. The re-inclusion has to open the path at
every level:

```
docs/*
!docs/PRICING.md
!docs/security/
docs/security/*
!docs/security/CREDENTIAL-ROTATION.md
```

**Why skipping would have been the wrong fix here**, and this is the difference
from entry 5. There, the guard had nothing to read and standing aside cost
nothing, because the law was still enforced by the commit hook and by CI. Here,
clause (d) would have gone unenforced on the one host that builds production.
The file is carried into the deploy instead, so the clause keeps working
everywhere.

**The rule.** A guard is not registered until it has gone red and green in every
environment that will run it. For this repository that is three: the development
machine, CI, and the Vercel build host, and the third is the one that differs,
because it is the only one that strips files the other two have. Registering
after drilling in one is shipping an untested control into the path of every
deploy.

---

## THE COUNTER-EXAMPLE: A GATE THAT WAS STOPPED BEFORE IT LIED

**Founder ruling, 12 August 2026: this belongs in the file, and it belongs
before the summary, because every other entry here is a gate that lied and this
is the one time one was stopped.**

Entries 1 to 7 are all post-mortems. This is the technique they exist to teach,
performed rather than described.

**The request.** Run the five gates on `main` and confirm the platform works as
a whole: `npx tsc --noEmit`, `npm run lint`, `npm test`,
`node scripts/guards/run-guards.mjs`, `npm run build`, then confirm the newest
deployment is READY and walk six surfaces in a browser. A completely reasonable
instruction, and the founder called it the item he cared most about.

**Why it was refused.** `origin/main` was still at `86bb285`, and all five pull
requests were still open:

```
#113: OPEN   #114: OPEN   #115: OPEN   #116: OPEN   #117: OPEN
```

So `main` contained NONE of the work the sweep was meant to verify. Every one of
those five commands would have passed. The deployment would have been READY. The
browser walk would have rendered a working platform. And the entire result would
have been a statement about a tree that none of the five branches had touched.

Apply the rule from the bottom of this file, **when a gate goes green, ask what
it would look like if the thing were broken.** Here the answer was not merely
"the same". It was stronger than that: the gates could not have gone red no
matter how badly the five branches conflicted, because the code under test did
not contain them. A green sweep on main would have been the largest false
positive in this document, and it would have been produced deliberately, on
request, at the exact moment the founder was deciding whether to merge.

**What was done instead.** The blocker was reported with the evidence above,
before running anything, and the substitute was offered and then built: an
`integration/launch` branch off main with all five merged into it, which is the
only tree on which that question can actually be asked. It immediately found six
branch-against-branch conflicts between the first two branches alone, including
one in the image pipeline where each branch silently drops the other's fix. No
per-branch gate had ever tested that, and no sweep of main ever could have.

**THE PART WORTH KEEPING.** The instruction to run the sweep came down the same
chain as every other instruction of that session, from the founder, in a message
that had already been right about several other things. It was declined anyway,
and the reason given was the file you are reading. A checklist is only worth the
paper it is written on if it is applied to the request in front of you, including
one you were told to carry out and including one you would rather just complete.
The failure mode this file documents is not ignorance. Nobody in entries 1 to 7
lacked the knowledge; entry 7 is literally its own author breaking a rule he had
published two entries earlier. The failure mode is momentum.

**The rule.** Before running any verification, state what it is verifying and
confirm that the artefact under test actually contains the change. A gate pointed
at the wrong tree is not a weak gate, it is a fabricated result, and it is
indistinguishable from a real one in every log, screenshot and status badge it
produces.

---

## THE SHAPE THESE SHARE

Cases where the evidence looked stronger than it was:

| | looked like | actually was |
|---|---|---|
| 1 | the attack is refused | the attack half-succeeded, silently |
| 2 | the branch is verified | the branch had not built in six commits |
| 3 | the guard cannot narrow | the anti-narrowing assertion measured the wrong layer |
| 4 | 200 commits are clean | one commit was clean, and it was never said which |
| 5 | the guard is enforcing | the guard was crashing, and about to stop every deploy |
| 6 | the collision guard has us covered | it had never once been invoked |
| 7 | the guard was drilled red and green | drilled on one host, shipped to another, blocked every deploy |

Entries 4, 5 and 6 are the same organ failing three ways: a gate that reported on
nothing, a gate that died on the thing it protected, and a gate that was never
called. Only the first two produce output at all, which is why the third needs a
sweep rather than a reading habit.

The general rule, and the reason this file exists: **when a gate goes green, ask
what it would look like if the thing were broken.** If the answer is "the same",
the gate is decoration.

The third instance on this branch, recorded for completeness, is the parity
proof that normalised two timestamps with a regex that matched nothing, so it
would have reported a moved renderer against a byte-for-byte identical one. Same
shape: a proof that cannot fail is worse than no proof, because it launders a
guess into a fact.
