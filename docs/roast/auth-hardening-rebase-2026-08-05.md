# Roast ledger: rebasing feat/auth-hardening onto origin/main

Date: 2026-08-05
Task: rebase seven auth-hardening commits from old main (414d801) onto
origin/main (88c6683), reconciling with PR #108 and PR #109.

Ledger written BEFORE adjudication, from the brief verbatim.

---

## Phase 1: the requirement ledger

### Conduct standards (standing, non negotiable)

| # | Requirement |
|---|---|
| C1 | Australian English everywhere |
| C2 | No em dashes or en dashes anywhere |
| C3 | Use "community", never the banned alternative |
| C4 | Change only what resolving the rebase requires |
| C5 | No claim without pasted proof |
| C6 | Permanent root cause fixes, no workarounds |
| C7 | Never write to the Production Supabase database |
| C8 | Never modify the funds holding payment engine logic beyond what the conflict genuinely requires, and flag it clearly if it does |

### Task requirements

| # | Requirement |
|---|---|
| 1a | Read docs/ENV-DOCTRINE.md on main before resolving |
| 1b | Read src/lib/env/destinations.ts on main before resolving |
| 1c | Read this branch's sender identity commit before resolving |
| 1d | Understand what each was trying to achieve before resolving anything |
| 2a | Resolve so that BOTH intents survive |
| 2b | Keep ONE definition for each concern, not delete one branch's work |
| 2c | If they belong together in one module, say so and do it deliberately |
| 2d | If they belong apart, keep them apart and make the boundary explicit in a comment |
| 3a | Do not contradict R4: sending domain is eventlinqs.com; eventlinqs.com.au cannot send; canonical web host is www.eventlinqs.com.au; the split is deliberate |
| 3b | Do not contradict R2: no personal address as a literal in shipped source |
| 3c | Do not contradict R2: the in-code fallback to a proven-deliverable brand address must stay |
| 3d | alerts@eventlinqs.com must never become a default anywhere |
| 4 | Complete the rebase, resolving each conflict as it arises (expect more than the two already seen) |
| 5a | Full test suite, paste the result |
| 5b | Full lint, report warning count before and after, prove none added |
| 5c | Clean production build, exit zero, all prebuild guards passing |
| 5d | node scripts/check-env-stores.mjs and every other env guard, paste the output |
| 5e | Confirm the auth sentinel works alongside PR #109's manifest check, and that they do not duplicate or contradict |
| 6a | Run brief-roast, hostile about the resolution: work silently dropped |
| 6b | Hostile about: a conflict resolved by deleting rather than reconciling |
| 6c | Hostile about: anything that now has two competing definitions |
| 6d | Fix what it finds |
| 6e | Run a second round, report both |
| 7 | Do NOT push, do NOT merge |
| 7A | Report: every conflict, which files, how resolved and why |
| 7B | Report: anything from either branch changed to reconcile them |
| 7C | Report: all verification output |
| 7D | Report: both roast rounds |
| 7E | Report: anything not verified and why |

---

## Phase 2 and 3: adjudication and adversarial pass

Recorded below after the ledger was fixed. See ROUND 1 and ROUND 2.
