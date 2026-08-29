# Runbook: cut a fresh branch after every squash merge

**Status: standing instruction. Do this immediately after `integration/launch`
merges into `main`.**

Founder ruling, 29 August 2026, after the FOURTH squash conflict on the same
branch.

---

## The rule

**A squash-merged branch must be deleted and re-cut from `main`. Do not keep
working on it.**

```bash
# After the PR is merged on GitHub, from any worktree:
git fetch origin
git worktree remove <path-to-branch-worktree>   # or leave the worktree and re-point it
git branch -D integration/launch
git push origin --delete integration/launch

# Cut the new one from the merged main:
git checkout -b integration/launch-2 origin/main
git push -u origin integration/launch-2
```

The name does not matter. Cutting from `origin/main` after the merge does.

---

## Why, mechanically

A squash merge creates ONE new commit on `main` whose tree is the branch's tree
but whose **parentage has nothing in common with the branch's history**. Git
therefore has no merge base that knows the two sides are the same work.

The next time the branch merges `main`, git compares:

- the branch, carrying forty-two real commits, and
- a single squash commit that git believes is unrelated work,

and it presents **identical content as a conflict**. Files that both sides
"added" independently come through as `add/add`, which is why
`scripts/ops/copy-spine-category-objects.mjs` and
`scripts/ops/rotate-db-password.mjs` conflicted on 29 August despite being
byte-identical on both sides.

This does not decay. It gets worse: every subsequent squash adds another
unrelated commit to reconcile against, so the branch conflicts against a growing
pile of copies of its own past.

---

## The proof to run before resolving, every time

Do not resolve a squash conflict by judgement. Prove it at tree level first, in
four commands. This takes about ten seconds and turns "take ours" from a
preference into a fact.

```bash
# 1. What tree does the incoming commit carry?
git rev-parse MERGE_HEAD^{tree}

# 2. Does any ancestor of HEAD carry that exact tree?
git log --format='%T %H' HEAD | grep "^<that-tree> "

# 3. Confirm with an empty diff.
git diff <that-ancestor> MERGE_HEAD          # must print NOTHING

# 4. Confirm the ancestor really is ours.
git merge-base --is-ancestor <that-ancestor> HEAD && echo YES
```

**If step 3 is empty and step 4 says YES**, `main` contributed nothing this
branch lacks. Ours is a strict superset and every conflict resolves to ours by
arithmetic. Record the four outputs in the merge commit message.

**If step 3 is NOT empty**, `main` moved independently and every difference
needs its own verdict. Do not take ours wholesale.

### Resolving without destroying anything

`reset`, `checkout`, `restore`, `stash` and `clean` are all banned during a
conflicted merge on this project, because each can silently discard uncommitted
work. Take ours by writing the file out of HEAD instead:

```bash
git show "HEAD:<path>" > "<path>"
git add -- "<path>"
```

Then verify the whole staged tree is unchanged before committing:

```bash
git diff HEAD --cached --stat      # empty means the merge takes nothing and gives nothing
```

---

## The record

| # | Date | Squash commit on main | Cost |
|---|---|---|---|
| 1 | 2026-08-12 | `86bb285b` "Production defect sweep before launch (#112)" | 27 inherited AI trailers, Law 8 debt entry |
| 2 | (earlier) | recorded in the Law 8 deferral list | |
| 3 | 2026-08-26 | `8663a4de` "Refund result, the lockdown 404, and the types drift (#120)" | deferral entry, and the note "this is the third squash to do this, which is why the branch is being recreated from main once this merges" |
| 4 | 2026-08-29 | `9cf7d365` "Integration/launch (#121)" | four conflicts, plus a fourth Law 8 deferral |

Entry 3 **predicted** that the branch would be recreated and that the third
would be the last. It was not recreated, and the debt recurred exactly as
written. That is why this is now its own runbook with its own filename rather
than a sentence inside a guard's allowlist.

---

## The second cost, which is easy to miss

Every squash also inherits an **AI authorship trailer** into
`scripts/guards/no-ai-authorship.mjs`, because GitHub composes the squash message
from the constituent commits and the committer is GitHub rather than a person.
Each one needs a deferral entry keyed by full sha, with its reason, under founder
ruling R-LAW8-DEBT (2026-08-12). There are now four.

**Removing the trailer is not an option**: it would rewrite `main`, invalidating
the sha production is running and every sha quoted in the handover documents. The
whole debt clears in one pass with the rewrite in
[AUTHORSHIP-HISTORY-REWRITE.md](AUTHORSHIP-HISTORY-REWRITE.md), which is written
and waiting and is not authorised.

A fresh branch cut does not fix the trailers already deferred. It stops NEW ones
arriving, because a branch cut from `main` has `main`'s squash commits as real
ancestors rather than as foreign commits to merge.
