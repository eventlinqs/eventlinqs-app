# Sparse-checkout of docs/: implemented, proven, measured

Written 8 August 2026. Founder direction: implement it, prove no file is lost, a
worktree that needs a document can still get it, the primary keeps everything,
then report how much it reclaims.

---

## How much it reclaims: 7.98 GB

| Worktree | docs/ | |
|---|---|---|
| `eventlinqs-app` | 2.70 GB | **PRIMARY, keeps everything** |
| `el-prod-sweep` | 1.70 GB | reclaimable |
| `el-auth-hardening` | 1.51 GB | reclaimable |
| `el-env-integrity` | 1.47 GB | reclaimable |
| `el-security` | 1.47 GB | reclaimable |
| `eventlinqs-app-tab-a` | 1.03 GB | reclaimable |
| `eventlinqs-app-backend` | 0.40 GB | reclaimable |
| `eventlinqs-app-hardening` | 0.40 GB | reclaimable |
| **Total** | **10.68 GB** | **7.98 GB reclaimable** |

**Free space would go from 3.46 GB to roughly 11.44 GB**, a 3.3x improvement,
without deleting a single file.

---

## Proof: 9 of 9, and nothing is lost

`node scripts/verify/sparse-checkout-proof.mjs`

The proof creates a throwaway linked worktree with `--no-checkout`, so the
evidence archive is never written to disk even once. That matters at 3.46 GB
free: a proof that needs 1.5 GB to demonstrate saving 1.5 GB is not a proof
anybody can run.

```
  [PASS] the thinned worktree does not materialise docs/
         docs/ on disk: 0.000 GB, against 2.70 GB in the primary
  [PASS] it is still a usable worktree
         src/ and package.json are present, so it can build and test
  [PASS] every docs file is still in the commit the thin worktree points at
         3078 of 3078 tracked docs files present in HEAD, with 0 bytes on disk
  [PASS] a specific image is byte-retrievable from the thin worktree
         docs/audit/personas-2026-07-11/a-01-landing-390.png reads back 752 KB
         via git show, without materialising it
  [PASS] it can materialise one document folder on demand
         docs/roast is now on disk in the thin worktree
  [PASS] and the rest stays thin
         docs/benchmark is still not materialised
  [PASS] a full restore brings everything back
         docs/ restored to 1.47 GB in the throwaway worktree
  [PASS] the primary still has everything
         docs/ in the primary: 2.70 GB, unchanged
  [PASS] the tool REFUSES to thin the primary without --force
         exit 2, naming the primary as the copy that keeps everything
```

**"3078 of 3078 tracked docs files present in HEAD, with 0 bytes on disk"** is
the assertion that answers "is anything lost". It is asked of git, not of the
filesystem: the files are still in the commit the thin worktree points at, and a
named image reads back byte-for-byte through `git show` without being
materialised.

---

## The tool

`scripts/sparse-checkout-docs.mjs`. It inherits the reclaim-space doctrine: **it
operates on the worktree it is RUN FROM and never reaches sideways.** Run it
inside each worktree you want thinned.

```powershell
node scripts/sparse-checkout-docs.mjs              # report, changes nothing
node scripts/sparse-checkout-docs.mjs --apply      # thin THIS worktree
node scripts/sparse-checkout-docs.mjs --get docs/roast   # materialise one path
node scripts/sparse-checkout-docs.mjs --restore    # full checkout back
```

It **refuses** in two situations, both of which cost somebody real work if
ignored:

- **on the PRIMARY worktree.** The primary holds the shared object store and is
  the copy that keeps everything. Thinning it would leave no working tree with
  the evidence materialised, so a reviewer would have to know this command
  exists before they could open a screenshot.
- **when there are UNTRACKED files under `docs/`.** Sparse-checkout only manages
  TRACKED paths. Untracked files are left on disk, so they would be neither
  reclaimed nor protected, and they are the one category that is **not
  recoverable from git**. This worktree currently has 299 of them.

### The order to run it in

Thin the linked worktrees, when nobody is working in that worktree:

```powershell
cd C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-backend
node scripts\sparse-checkout-docs.mjs --apply      # 0.40 GB
# then -hardening (0.40), -tab-a (1.03), el-env-integrity (1.47),
# el-prod-sweep (1.70), el-auth-hardening (1.51), el-security (1.47)
```

**I did not run it on any of them.** Four sessions are live and changing another
session's working tree is exactly the harm that emptied `node_modules` this
morning. `el-security` and `el-auth-hardening` in particular are actively in
use.

---

## A number worth noticing

The primary's `docs/` is **2.70 GB** but only **1.47 GB** of it is tracked at
HEAD. The other **1.23 GB is untracked**: 299 image files sitting in the working
tree, uncommitted, unbacked-up and invisible to every guard. Some are this
session's screenshots. That is a separate problem from replication, and it is
the one where a file genuinely can be lost.
