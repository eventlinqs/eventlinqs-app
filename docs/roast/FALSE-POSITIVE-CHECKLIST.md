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

## THE SHAPE THESE SHARE

Cases where the evidence looked stronger than it was:

| | looked like | actually was |
|---|---|---|
| 1 | the attack is refused | the attack half-succeeded, silently |
| 2 | the branch is verified | the branch had not built in six commits |
| 3 | the guard cannot narrow | the anti-narrowing assertion measured the wrong layer |
| 4 | 200 commits are clean | one commit was clean, and it was never said which |
| 5 | the guard is enforcing | the guard was crashing, and about to stop every deploy |

The general rule, and the reason this file exists: **when a gate goes green, ask
what it would look like if the thing were broken.** If the answer is "the same",
the gate is decoration.

The third instance on this branch, recorded for completeness, is the parity
proof that normalised two timestamps with a regex that matched nothing, so it
would have reported a moved renderer against a byte-for-byte identical one. Same
shape: a proof that cannot fail is worse than no proof, because it launders a
guess into a fact.
