# EVENTLINQS LAUNCH-WORTHY SWEEP - RUNNING LOG

Branch `integration/launch`. PR #122 into `main`.
Started 3 September 2026. Brief saved verbatim at `C:\dev\SWEEP-BRIEF.md`.

The final summary, the open items and the three direct answers are written at the
top of this file when every unblocked task is finished. Until then this is the
running record, newest task last.

## STATUS BOARD

| Task | Title | State |
|---|---|---|
| 1 | Commit the types fix, CI green | DONE |
| 2 | Corrupted proper nouns | IN PROGRESS |
| 3 | Venue geocoding | BLOCKED ON FOUNDER (amendment 2) |
| 4 | Mobile Lighthouse 95 | NOT STARTED |
| 5 | Full Scope v5 audit, 18 sections | NOT STARTED |
| 6 | Remaining known defects, a to h | NOT STARTED |
| 7 | Prove the configured things | NOT STARTED |

## ENVIRONMENT AT START

- Node v24.19.0, npm 11.17.0, from `C:\node24\node-v24.19.0-win-x64`.
- Disk free 5.82 GB against a 5 GB floor. This is TIGHT. A Next.js build writes
  gigabytes into `.next` and fails mid-compile on a near-full disk with
  "os error 112", which reads as a code bug rather than a disk fault. Flagged now
  so it is not mistaken for something else later. Watched before every build.
- `core.hooksPath` is `.githooks`, so the Law 8 commit-msg hook is armed.

---

# TASK 1. COMMIT THE TYPES FIX AND GET CI GREEN

**State: DONE.** Commit `f9739ba3`. types-drift guard PASS in 1m21s on PR #122.

## The 13 deletions, adjudicated

The brief asked for confirmation that the 13 deletions were generator reordering
and not a real loss. They are not all reordering. Two of them are substantive and
one of them is a defect I fixed rather than committed. The full account:

| # | Deleted | Verdict |
|---|---|---|
| 1 | `PostgrestVersion: "14.15"` | CORRECTION, not a loss. See below. |
| 2 | `[_ in never]: never` under `Views` | GAIN. Replaced by the real `stored_aggregate_drift` view. |
| 3 to 12 | Five pairs of `TableName` / `EnumName` / `CompositeTypeName extends` lines, 10 lines | FORMATTING. The newer generator wraps the conditional type in explicit parentheses. Semantically identical. |
| 13 | The closing `// ====` comment line | Re-added by the generator WITHOUT the trailing newline. A real, small regression. Fixed. |

1 + 1 + 10 + 1 = 13. Every deletion is accounted for. Nothing is unexplained.

### Deletion 1 is the opposite of a loss

`PostgrestVersion` moved from `14.15` to `14.5`, which looks like a downgrade and
would be a Law 9 concern if it were one. It is not. The repository already
documents the exact fact, at `scripts/ci/types-drift-analyse.mjs:576`:

> on 21 August 2026 TEST reported 14.15 and production 14.5

So the previously committed file was generated against **TEST**. The new file is
generated against **production**, which is what the brief asked for. The value
moving to 14.5 is the evidence that the file now comes from the right project.

The guard ignores that one path deliberately, and says why in its own source: it
records infrastructure rather than schema, it moves when Supabase upgrades their
own estate, and no migration could ever explain it.

### Deletion 13 was a genuine defect, and the commit count proves the fix

The generator dropped the end-of-file newline. No lint rule enforces `eol-last`
in this repo, so nothing would have caught it. I restored it before committing.

The proof is arithmetic: the brief described the diff as 88 insertions and 13
deletions. The commit landed as **87 insertions and 12 deletions**, because with
the newline restored the final comment line is unchanged and is no longer counted
as a delete plus an add. That is deletion 13 confirmed by construction.

## What the 88 insertions actually brought

Not cosmetic. Real schema the application already calls:

- `discount_code_claims` table, with both foreign keys.
- `discount_codes.reserved_uses` column.
- `stored_aggregate_drift` view.
- Eight functions: `claim_discount_use`, `convert_discount_claim`,
  `release_discount_claim`, `release_expired_discount_claims`,
  `increment_discount_uses`, `increment_sold_count`, `transfer_ticket_for_order`,
  and the reservation helpers.

## Verification

- `npx tsc --noEmit` exits 0.
- Pre-push gate ran typecheck, lint and the full suite: 246 files, 2964 tests,
  0 failed, 0 skipped.
- PR #122 `types-drift guard`: **pass, 1m21s**. `test (vitest)`: pass.
  `Resolve Vercel preview`: pass. `Vercel`: pass.
- The job LOG body could not be read while the run was still in progress
  (`gh` returns "logs will be available when it is complete"). The check status
  is authoritative and green; I will read the log body at the finishing gate
  rather than claim now that I have seen it.

## Two incidental findings from this task

**F1. The Law 8 commit-msg hook has a false positive on the word "regenerated".**
The hook substring-matches "Generated with". My first commit message contained
"Re**generated with** supabase CLI 2.116.0" and was rejected. The guard is
behaving conservatively, which is correct for an authorship law, so I rephrased
my message rather than widening the guard. Recorded because the next person to
write the obvious commit message for a types regeneration will hit it too.
Not a defect I am fixing without a ruling: loosening a Law 8 guard to permit a
substring is exactly the kind of change that should need the founder.

**F2. `caniuse-lite` is 6 months stale.** The pre-push build printed
`Browserslist: browsers data (caniuse-lite) is 6 months old`. This is a Law 9
signal (current by default, never backwards): a stale browser matrix silently
changes what gets transpiled and what autoprefixer emits. Not fixed inside Task 1
because it is not a types change and I am not mixing it into that commit.
Carried into Task 6 as an extra item.

**F3. The repository has NO `.gitattributes` at all.** Confirmed by direct check.
This is the root cause of Task 6b (the four phantom LF versus CRLF files) and is
also why git printed `LF will be replaced by CRLF` on the types file. Fixed in
Task 6.
