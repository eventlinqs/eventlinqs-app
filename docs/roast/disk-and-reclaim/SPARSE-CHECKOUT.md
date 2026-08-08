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

### The seven commands, in order

Run each **inside** its own worktree, **when nobody is working in it**. Ordered
smallest-first so the first two are risk-free warm-ups on worktrees nobody is
using, and the two live sessions come last.

**The success criterion is identical for all seven**, so it is stated once:

> The command prints `APPLIED. Kept: src, scripts, supabase, tests, public, ...`
> followed by `docs/ N.NN GB -> 0.00 GB (reclaimed N.NN GB)`, and exits 0.
> Afterwards `dir docs` shows the folder is gone or empty, and
> `git -C . status --short` shows **no modifications**: sparse-checkout changes
> the working tree, never the index.

If it prints `REFUSING`, read which of the two refusals it is. Untracked files
under `docs/` must be dealt with first; the primary must not be thinned at all.

| # | Worktree | Command | Reclaims |
|---|---|---|---|
| 1 | `eventlinqs-app-backend` | `cd C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-backend; node scripts\sparse-checkout-docs.mjs --apply` | 0.40 GB |
| 2 | `eventlinqs-app-hardening` | `cd C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-hardening; node scripts\sparse-checkout-docs.mjs --apply` | 0.40 GB |
| 3 | `eventlinqs-app-tab-a` | `cd C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-tab-a; node scripts\sparse-checkout-docs.mjs --apply` | 1.03 GB |
| 4 | `el-env-integrity` | `cd C:\Users\61416\OneDrive\Desktop\EventLinqs\el-env-integrity; node scripts\sparse-checkout-docs.mjs --apply` | 1.47 GB |
| 5 | `el-prod-sweep` | `cd C:\Users\61416\OneDrive\Desktop\EventLinqs\el-prod-sweep; node scripts\sparse-checkout-docs.mjs --apply` | 1.70 GB |
| 6 | `el-auth-hardening` | `cd C:\Users\61416\OneDrive\Desktop\EventLinqs\el-auth-hardening; node scripts\sparse-checkout-docs.mjs --apply` | 1.51 GB |
| 7 | `el-security` | `cd C:\Users\61416\OneDrive\Desktop\EventLinqs\el-security; node scripts\sparse-checkout-docs.mjs --apply` | 1.47 GB |

**6 and 7 are the live sessions** (`feat/launch-kit-artefacts` and
`fix/security-hardening`). Do those last, and only when that session has
stopped. Nothing breaks if you thin a worktree mid-session, but the person in it
will see `docs/` vanish and wonder what happened.

**Total: 7.98 GB.** Check the result with:

```powershell
node scripts\sparse-checkout-docs.mjs        # report mode, in any worktree
```

Undo for any worktree, at any time:

```powershell
node scripts\sparse-checkout-docs.mjs --restore
```

**I did not run any of them.** Four sessions are live and changing another
session's working tree is exactly the harm that emptied `node_modules` this
morning.

---

## A number worth noticing

The primary's `docs/` is **2.70 GB** but only **1.47 GB** of it is tracked at
HEAD. The other **1.23 GB is untracked**: 299 image files sitting in the working
tree, uncommitted, unbacked-up and invisible to every guard. Some are this
session's screenshots. That is a separate problem from replication, and it is
the one where a file genuinely can be lost.
