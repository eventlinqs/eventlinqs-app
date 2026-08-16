# Ledger: integration resume, five-branch merge

Worktree: `C:\Users\61416\OneDrive\Desktop\EventLinqs\el-moat`
Branch: `integration/launch`. Base: `origin/main` at `86bb285`.
Date: 2026-08-12. Author: Lawal Adams.

A row is adjudicated only against evidence actually observed in this tree, never
against intention. UNFULFILLED rows are reported at the top of the final report.

## The five merges

| # | Branch | PR | Commit | Conflicts | Result |
|---|---|---|---|---|---|
| 1 | `feat/public-composer` | #113 | pre-existing, plus `6e779da` for its outstanding docs commit | 0 | IN |
| 2 | `fix/security-hardening` | #114 | `197a24b` | 6 files | IN |
| 3 | `feat/launch-kit-artefacts` | #115 | `6f62621` | 2 files, 4 regions | IN |
| 4 | `feat/launch-kit-moat` | #116 | `47ac212` | 5 files, 13 regions | IN |
| 5 | `fix/production-sweep` | #117 | `579e3a6` | 13 files, 25 regions | IN |

All five confirmed ancestors of HEAD by `git merge-base --is-ancestor`, exit 0.

## Task rows

| Task | Status | Evidence observed |
|---|---|---|
| Preserve the unstaged work | FULFILLED | 15 files in `el-moat-backup-2026-08-12`; 3 SHA256 matches, 12 extractions byte-exact against `git cat-file -s`. |
| Ledger | FULFILLED | This file. |
| Audit the three pre-resolved files | FULFILLED | Both sides quoted and proven in `run-guards.mjs`, `vercel.json`, `image-pipeline.ts`. |
| Characterise the Law 8 blocker | FULFILLED | Guard run read-only: exit 1, 76 offenders, 1 deferred, 99 scanned. `86bb285` already allowlisted. |
| Stage the three | FULFILLED | Exactly 3 paths staged, left Unmerged paths. |
| Resolve CLAUDE.md and the organisation page | FULFILLED | Laws 6, 7, 8 present in order; both forward-reference notes removed under ruling. |
| Union `.githooks/commit-msg` | FULFILLED | 6126 bytes, 112 lines, 0 markers; 21-case harness, 0 regressions. |
| Commit merge 2 | FULFILLED | `197a24b`, hook proven to fire on a trailer and on an em dash. |
| `npm ci` and typecheck baseline | FULFILLED | exit 0, sharp 0.34.5 to 0.35.3; lockfile already agreed. 6 errors in 4 files. |
| Merge 45c2d28 first | FULFILLED | `6e779da`, exactly 2 docs files, 301 insertions, no source or lockfile. |
| Merges 3, 4, 5 in handover order | FULFILLED | `6f62621`, `47ac212`, `579e3a6`. |
| Overlap check after each merge | FULFILLED | 137, 276 then 290 overlapping files; 85 pairs flagged; 0 genuine losses. |
| Integrity commit (6c) | **UNFULFILLED, BLOCKED** | Not started. The post-merge typecheck fails with 22 errors, 16 of which are merge damage outside the authorised scope. Escalated instead. |
| Final report (6d) | FULFILLED | Delivered with the build break at the top. |

## Guard total, running

21 after every merge. Merge 3 was the only one that touched the registry, and it
registered two guards this line already had, so git deduped rather than dropped.

## Lockfile

`package.json` and `package-lock.json` never conflicted, because only
`feat/public-composer` ever changed the sharp entry: base and the other four all
declare `^0.34.5`. Installed sharp is 0.35.3 and agrees with both files. One
`npm ci` was run, after merge 2; none of merges 3 to 5 touched either file.

## Blocking state

The tree does not typecheck. See `docs/roast/POST-LAUNCH-FINDINGS.md` for the
non-blocking observations and the final report for the 22 errors and their
attribution.
