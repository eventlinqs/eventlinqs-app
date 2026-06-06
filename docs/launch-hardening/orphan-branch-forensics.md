# Orphan branch forensics (2026-06-06)

Applied the byte-diff method to the orphan remote branches (no open PR): a
branch is provably stale only if its merged/closed PR landed its work AND every
file it adds already exists on `main`. A branch that adds files absent from
`main`, or has no PR to prove its modifications merged, is flagged, not deleted.

## Deleted (7, provably stale)

| Branch | PR | Evidence |
|---|---|---|
| `docs/audit-payment-2026-05-26` | #47 merged | 1 added file, 0 absent on main |
| `fix/checkout-render-crash` | #51 merged | 0 added files (modifications merged) |
| `fix/sentry-init-in-handler` | #50 merged | 0 added files |
| `fix/sentry-instrumentation-hook` | #49 merged | 0 added files |
| `fix/sentry-runtime-diag` | #48 merged | 0 added files |
| `fix/auth-getuser-revalidation` | #72 closed | content folded into #85 (item 7 struck on main) |
| `fix/event-hero-cover-image` | #6 merged | 30 added files, all already on main |

## Flagged - do NOT delete (4, unique or unprovable)

| Branch | Why kept |
|---|---|
| `feat/auth-defects-fix` | No PR. Adds 5 files absent from main, including `src/app/api/auth/signup/route.ts` and `src/lib/email/auth-emails.ts` (drives signup confirmation through Resend). Genuinely unique unmerged work. |
| `feat/hardening-phase2-load-testing` | No PR. Adds 16 files absent from main: the k6 load-test profiles, `tests/load/**`, and the phase-2 scope/results docs. The Session 2 load-test rig. |
| `feat/m6-phase4-payouts-dashboard` | No PR. Adds 17 files absent from main: `src/app/api/payouts/list` + `refunds` routes and the payout dashboard. (The M7 payouts cockpit shipped separately via #74; this earlier app layer is unmerged.) |
| `feat/sprint1-phase1b-performance-and-visual` | No PR. Its added docs are on main, but with no merge record its modifications cannot be proven landed. Kept pending a founder check. |

Recommendation: land the first three via PRs (or confirm they are superseded);
decide `sprint1-phase1b` after a quick diff.

## Worktree assessment (directories NOT touched)

| Worktree | Branch | PR | State | Recommendation |
|---|---|---|---|---|
| `eventlinqs-app-hardening` | `feat/hardening-phase2-5-...` | none | 5 commits ahead; uncommitted = deleted lighthouse artifacts + untracked `tests/load/` | KEEP. Active Session 2 staging/preview hardening. Land via a PR when ready. |
| `eventlinqs-app-backend` | `feat/m6-phase5-refunds-manager` | none | 10 commits ahead; uncommitted = deleted artifacts | REVIEW. The refund operator path merged via #71; confirm whether this fuller refunds-manager is unique or superseded before reclaiming. |
| `eventlinqs-app-tab-a` | `fix-acl/help-content-copy` | #46 merged | 2 trivial post-merge commits; uncommitted = untracked research snapshots | RECLAIM. The PR merged; the branch is effectively done and the uncommitted files are disposable benchmark snapshots. |

None of the worktree directories were removed (per instruction). Each holds
uncommitted artifacts, so reclaim with `git worktree remove` only after
confirming there is nothing to keep.

## Net

Remote branches after this pass: `main`, the open-PR branches, the 4 flagged
unique branches, and the 3 worktree branches. Everything provably stale is gone;
nothing unique was deleted.
