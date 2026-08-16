# Runbook: remove AI authorship trailers from history

Status: **WRITTEN, NOT AUTHORISED.** Founder decides when this runs, and it runs
after launch. Nothing in this document has been executed.

Law: CLAUDE.md Law 8 (authorship, the founder is the sole author).
Written: 2026-08-09.

---

## First, a correction to the scope

The instruction that prompted this runbook said "every commit in this repository
currently carries such a trailer". Measured, it does not:

```
$ git rev-list --all --count
1351
$ (commits whose message matches co-authored-by:.*(claude|anthropic) or a robot emoji)
705
```

**705 of 1351 reachable commits, about 52 percent.** The earliest is
`5961718` dated 2026-04-11; the most recent is `d042952` dated 2026-08-09. One
commit, `82686fe`, additionally contains the phrase "Generated with". No robot
emoji appears anywhere.

That matters because it halves the rewrite surface and it means a message filter
must be a no-op on 646 commits rather than touching everything. It does not change
the recovery cost, which is dominated by the worktrees and the open pull requests,
not by the rewrite itself.

## The blast radius, measured

| Thing | Count | Consequence |
|---|---|---|
| Reachable commits | 1351 | every SHA changes from the oldest rewritten commit forward |
| Commits carrying a trailer | 705 | earliest 2026-04-11, so effectively all history is rewritten |
| Distinct real SHAs quoted in `docs/**` | **286** | every one becomes a dangling reference |
| Local branches | 71 | all need their refs replaced |
| Remote branches on `origin` | 46 | all need force-pushing |
| Tags | 10 | all need re-pointing and force-pushing |
| **Open pull requests** | **16** | the highest-risk item, see below |
| Linked worktrees | 9 | all need resetting, and one lives at `C:/elrel` |
| Separate clones | 1 | `eventlinqs-organiser-engine`, easy to forget |
| Pack size | 1.31 GiB | the rewrite is I/O bound but still fast |

## Prerequisite, and it is not installed

`git filter-repo` is the correct tool. `git filter-branch` is deprecated, is
roughly two orders of magnitude slower, and its own documentation tells you not to
use it.

```
$ git filter-repo --version
git: 'filter-repo' is not a git command.
$ python --version
Python 3.11.9          # available, which is all filter-repo needs
$ git --version
git version 2.53.0.windows.1
```

Install first:

```powershell
pip install git-filter-repo
```

## The exact command

`filter-repo` refuses to run on a repository that is not a fresh clone, and it
removes the `origin` remote afterwards as a safety measure. Both behaviours are
wanted here. Work in a throwaway clone, never in a worktree.

```powershell
# 1. A fresh mirror clone, so nothing touches the nine worktrees.
cd C:\
git clone --mirror C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app el-rewrite.git
cd C:\el-rewrite.git

# 2. Strip the trailers from every commit message. Nothing else is touched:
#    no tree changes, no author changes, no dates.
git filter-repo --message-callback '
import re
msg = message.decode("utf-8", "replace")
# the Co-Authored-By trailer naming a model or vendor
msg = re.sub(r"(?im)^[ \t]*co-authored-by:.*(claude|anthropic|openai|gpt|copilot|gemini)\b.*\r?\n?", "", msg)
# the tool credit line, and the robot emoji if one ever appears
msg = re.sub(r"(?im)^.*generated with \[?claude code\]?.*\r?\n?", "", msg)
msg = msg.replace("\U0001F916", "")
# collapse the blank lines the removals leave behind
msg = re.sub(r"\n{3,}", "\n\n", msg).rstrip() + "\n"
return msg.encode("utf-8")
'
```

`filter-repo` writes an old-to-new mapping at
`C:\el-rewrite.git\filter-repo\commit-map`. **Do not delete it.** It is what makes
the 286 document references recoverable rather than lost.

## Repairing the 286 document SHAs

This is the step most rewrites skip, and it is why handover documents rot. The
commit map turns it into a scripted edit rather than 286 manual lookups.

```powershell
# From a normal (non-mirror) clone of the REWRITTEN history:
#   commit-map is two columns: <old-sha> <new-sha>, full 40 hex each.
# For every doc, replace any 7-to-12 character prefix of an old SHA with the
# matching prefix of its new SHA, preserving the original abbreviation length.
```

Write that as a small script rather than by hand, run it over `docs/`, and commit
the result as one "docs: remap commit references after history rewrite" change.
The heaviest files are:

| File | Real SHAs quoted |
|---|---|
| `docs/benchmark/system-pass/REPORT.md` | 39 |
| `docs/reports/M5-PHASE1-FINAL.md` | 26 |
| `docs/sprint1/pre-task-2-close-report.md` | 15 |
| `docs/hardening/phase1/closure-report.md` | 12 |
| `docs/brand-sweep/phase-5-verification.md` | 11 |
| `docs/brand-sweep/closure-report.md` | 11 |

Note that `docs/roast/*` and `docs/verification/*` also carry SHAs used as
evidence in closure reports, so the remap must cover all of `docs/`, not just the
top six.

## What breaks

**Certain to break:**

1. **Every SHA in every handover document**, 286 of them, until remapped.
2. **All 46 remote branches and 10 tags** need force-pushing. Any branch
   protection on `main` must be lifted for the push and restored immediately
   after.
3. **All 9 linked worktrees** are left pointing at commits that no longer exist.
4. **`eventlinqs-organiser-engine`**, a separate clone, is a stale copy of the old
   history and will happily push it back if anyone works in it. Delete or re-clone
   it, do not leave it.

**The worst item, and the reason to do this after launch:**

5. **16 open pull requests.** A force-push to a PR's head branch does not close
   the PR, but GitHub compares against the base and will show every commit as
   changed. Review comments anchored to specific lines of specific SHAs become
   detached and in some cases unreadable. PRs with meaningful review history
   (#99 `release/launch-line`, #98 `fix/hardening-security`, #95
   `chore/gates-to-law`) are the ones to worry about. Decide per PR whether to
   merge it before the rewrite, close and recreate it after, or accept the lost
   comment anchoring. **Do not start the rewrite with 16 PRs open.**

**Will NOT break:**

- File contents, trees and blobs are untouched; only commit messages change.
- Authors, committers and dates are preserved, so `git log --author` and any date
  based reporting still work.
- Vercel deployments already built are unaffected. Future builds are fine.
  Deployment records referencing old SHAs become historical only.

## Recovering the nine worktrees

Confirm the inventory first, because one is outside the project folder and is the
one people forget:

```powershell
git worktree list
```

Which currently gives, and this is the list to work from:

```
eventlinqs-app            (main working tree)   feat/public-composer
C:/elrel                                        release/launch-2026-07-26
el-auth-hardening                               feat/launch-kit-artefacts
el-env-integrity                                feat/env-integrity
el-prod-sweep                                   fix/production-sweep
el-security                                     fix/security-hardening
eventlinqs-app-backend                          feat/m6-phase5-refunds-manager
eventlinqs-app-hardening                        feat/hardening-phase2-5-vercel-sydney-preview-supabase
eventlinqs-app-tab-a                            fix-acl/help-content-copy
```

Recovery, per worktree, after the rewritten history is pushed:

```powershell
# In the MAIN working tree first:
cd C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app
git fetch origin --prune --tags --force
git reset --hard origin/feat/public-composer

# Then each linked worktree, using its own branch from the list above:
cd C:\Users\61416\OneDrive\Desktop\EventLinqs\el-security
git fetch origin --prune
git reset --hard origin/fix/security-hardening
git worktree repair          # fixes the .git file pointers if paths moved
```

**Before resetting anything, in EVERY worktree:**

```powershell
git status --porcelain       # must be empty
git stash list              # must be empty, or the stash is lost
```

`git reset --hard` discards uncommitted work irrecoverably, and this repository
has a documented history of parallel sessions holding uncommitted work in several
worktrees at once.

**There are ELEVEN stashes on record** (`git stash list`), several of them named
as safety points before a risky operation:

```
stash@{0}  On feat/walkthrough-defects: pre-consolidation-safety-20260723-232734
stash@{1}  On feat/event-media-standard: pre-untangle-safety-20260629-005855
stash@{2}  On feat/home-rebuild: pre-integration-stash
stash@{3}  On chore/workshop-inspection: inspection-artifacts
...
```

**A rewrite orphans all eleven**, because a stash is a commit whose parent will no
longer exist. They will not appear in `git stash list` afterwards and are only
recoverable from the reflog until it expires. Before running anything, either
apply them, or export each one to a patch:

```powershell
$i = 0
git stash list --format="%gd" | ForEach-Object {
  git stash show -p $_ > "C:\stash-backup-$i.patch"; $i++
}
```

This was originally written as "two stashes", from having looked at only the first
two lines of the list. It is eleven. Law 7: count it, do not recall it.

Also re-run the Law 8 hook config in the rewritten main clone, because
`core.hooksPath` is local config and a fresh clone will not have it:

```powershell
git config core.hooksPath .githooks
```

## How long it takes

Honest split, because the command is the fast part and the estimate people quote
is always the command.

| Step | Time |
|---|---|
| `pip install git-filter-repo` | 1 minute |
| Mirror clone of a 1.31 GiB pack | 2 to 5 minutes |
| The `filter-repo` run itself over 1351 commits | **under 2 minutes** |
| Writing and testing the SHA remap script against `commit-map` | 45 to 90 minutes |
| Reviewing the remap diff across `docs/` | 30 minutes |
| Force-pushing 46 branches and 10 tags, lifting and restoring branch protection | 20 minutes |
| Resetting 9 worktrees, checking each for uncommitted work first | 45 minutes |
| Reconciling 16 open PRs | **2 to 4 hours, and it is a judgement call per PR** |
| Verification pass, see below | 30 minutes |

**Realistic total: half a day**, dominated entirely by the pull requests and the
document remap. The rewrite is minutes.

## Verification, after

```powershell
# 1. Zero trailers anywhere in the rewritten history.
node scripts/guards/no-ai-authorship.mjs --all-history      # must exit 0

# 2. The commit count is unchanged: a message filter must not drop commits.
git rev-list --all --count                                   # expect 1351

# 3. Trees are untouched. Compare the tip tree against the pre-rewrite tip.
git rev-parse HEAD^{tree}                                    # same as before

# 4. No dangling SHA references left in docs.
#    Re-run the audit that produced the 286 figure and expect 0 unresolvable.

# 5. The guard's boundary is now obsolete: delete EFFECTIVE_FROM and the
#    --all-history branch from scripts/guards/no-ai-authorship.mjs, so the guard
#    checks all history unconditionally from then on. Also delete this paragraph
#    and mark this runbook EXECUTED with the date.
```

## Decision record

Leave this section for the founder.

- Authorised by:
- Date run:
- Open PR count at the time:
- Deviations from this runbook:
