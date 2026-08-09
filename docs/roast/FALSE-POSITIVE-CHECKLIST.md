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

## THE SHAPE THESE SHARE

Both are cases where the evidence looked stronger than it was:

| | looked like | actually was |
|---|---|---|
| 1 | the attack is refused | the attack half-succeeded, silently |
| 2 | the branch is verified | the branch had not built in six commits |
| 3 | the guard cannot narrow | the anti-narrowing assertion measured the wrong layer |

The general rule, and the reason this file exists: **when a gate goes green, ask
what it would look like if the thing were broken.** If the answer is "the same",
the gate is decoration.

The third instance on this branch, recorded for completeness, is the parity
proof that normalised two timestamps with a regex that matched nothing, so it
would have reported a moved renderer against a byte-for-byte identical one. Same
shape: a proof that cannot fail is worse than no proof, because it launders a
guess into a fact.
