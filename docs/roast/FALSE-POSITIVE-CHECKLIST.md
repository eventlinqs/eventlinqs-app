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

## THE SHAPE THESE SHARE

Both are cases where the evidence looked stronger than it was:

| | looked like | actually was |
|---|---|---|
| 1 | the attack is refused | the attack half-succeeded, silently |
| 2 | the branch is verified | the branch had not built in six commits |

The general rule, and the reason this file exists: **when a gate goes green, ask
what it would look like if the thing were broken.** If the answer is "the same",
the gate is decoration.

The third instance on this branch, recorded for completeness, is the parity
proof that normalised two timestamps with a regex that matched nothing, so it
would have reported a moved renderer against a byte-for-byte identical one. Same
shape: a proof that cannot fail is worse than no proof, because it launders a
guess into a fact.
