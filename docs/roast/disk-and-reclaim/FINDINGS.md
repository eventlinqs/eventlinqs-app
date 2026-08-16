# reclaim-space, and what is actually eating the disk

Written 8 August 2026. Founder direction: fix the script properly, prove the
confinement, make it refuse when another session is active, and then find what
is growing, because the delete did not free space.

---

## 1. The script defect, and the fix

```js
for (const name of readdirSync(EVENTS_ROOT)) {
  const dir = join(EVENTS_ROOT, name)
  if (dir === REPO) continue          // protected ONLY the caller
  ...
  if (DEEP) dirsCleared += rm(join(dir, 'node_modules'))
}
```

It walked the PARENT directory and deleted from every sibling worktree. There
are **nine linked worktrees** on this machine, one per Claude Code session, so a
session running `npm run reclaim -- --deep` deleted other live sessions'
`node_modules` while they were working.

**The sibling loop is gone.** Siblings are now REPORTED and never touched.
`--deep` still exists and now means "my own `node_modules` too", which costs the
caller one `npm ci` and costs nobody else anything.

Deletion additionally routes through one function that refuses any path not
resolving strictly inside the invoking worktree, so a future edit that
reintroduces a sibling path fails loudly rather than quietly working.

### The proof you asked for

`node scripts/verify/reclaim-confinement-proof.mjs` - **10 pass, 0 FAIL.**

A code review is not proof, and neither is running the fixed script from this
repo, because `--deep` legitimately deletes the caller's own `node_modules` and
proving confinement that way would destroy the environment it protects. So the
proof builds **two throwaway worktrees**: a CALLER holding its own copy of the
real script, and a SIBLING beside it. It runs the real script with
`--deep --force` from inside the caller.

```
  [PASS] the CALLER lost its own node_modules, so --deep still works
  [PASS] the SIBLING is completely untouched, which is the incident not reproducing
  [PASS] this repo was never touched
  [PASS] the sibling was REPORTED, so a full sibling stays visible
  [PASS] every outside path is refused, including the live el-security worktree
         5 of 5 refused: the proof sibling, el-security, this repo, the parent and the grandparent
  [PASS] inside paths are still allowed
  [PASS] without --force it refuses while another session is active
         exit 2, and the caller's own node_modules survived the refusal
```

Both assertions pull in opposite directions, so passing both is the whole test:
the script must still delete, and must still not reach sideways.

### Detecting rather than trusting

It refuses to run when either signal fires:

- **another Claude Code session is active.** Each session writes to
  `%LOCALAPPDATA%/Temp/claude/<encoded-worktree-path>/<session-id>/`, so a
  session directory touched within 45 minutes means somebody is working. Two
  levels of `stat` only: a recursive walk of every session's scratch takes
  minutes and timed out when first attempted.
- **a dev server is listening** on 3000, 3001, 3002 or 3100.

It fired on the real machine during the proof:

```
[reclaim] ANOTHER SESSION IS ACTIVE ON THIS MACHINE:
    session in el-auth-hardening (active 17 min ago)
```

`--report` shows what would go and deletes nothing. `--force` overrides, and
says so.

---

## 2. What is actually eating the disk

**The delete did not free space because the space is not in build artefacts.**

The EventLinqs tree is 16.60 GB:

| Size | What | Can reclaim-space touch it? |
|---|---|---|
| **10.69 GB** | `docs/`, replicated across nine worktrees | **NO. Never could.** |
| 2.80 GB | `node_modules` across all worktrees | Only its own, now |
| 1.66 GB | the shared `.git` object store | No |

`docs/` in this worktree alone is **2790 image files, 2.44 GB** (1949 tracked,
299 untracked). Every linked worktree checks out its own copy:

```
    el-auth-hardening   docs 1.51 GB      el-prod-sweep   docs 1.70 GB
    el-security         docs 1.47 GB      el-env-integrity docs 1.47 GB
    eventlinqs-app-tab-a docs 1.03 GB     this worktree   docs 2.44 GB
```

Single files run to 26 MB (`docs/benchmark/system-pass/overnight-elevation/pages/home-1440.png`).

Even at its most destructive the old script could only ever reach the 2.80 GB of
`node_modules`, and it reached it by destroying other sessions' work. **The
10.69 GB it can never touch is the actual problem**, and it grows every session,
because every session commits screenshot evidence.

The report now prints this on every run, so a cleaner can no longer report
success while the real consumer grows.

### The acute problem, happening right now

Free space fell from **6.6 GB to 3.50 GB** during this session. The cause is the
aftermath of the bug itself:

```
Files over 20 MB written in the last 25 minutes:
   130.5 MB  16:01  el-security\node_modules\@next\swc-win32-x64-msvc\next-swc...node
    23.3 MB  16:01  el-security\node_modules\@rolldown\binding-win32-x64-msvc\...node
    86.2 MB  15:51  AppData\Local\npm-cache\_cacache\...
    41.8 MB  15:59  AppData\Local\npm-cache\_cacache\...
```

**Multiple sessions are reinstalling `node_modules` simultaneously**, and each
`npm ci` also repopulates a shared npm cache (1.42 GB) that a previous
`reclaim-space` run had emptied with `npm cache clean --force`. One deletion
therefore costs the machine roughly 0.9 GB per affected worktree to restore,
plus the cache, all of it downloaded again.

So the honest answer to "is a session writing gigabytes somewhere": **yes, and
it is my restore and el-security's restore, both caused by the deletion.** It
will settle once the installs finish. The structural 10.69 GB will not.

---

## 3. What would actually reclaim space, ranked

1. **Sparse-checkout `docs/` out of worktrees that do not need it.**
   Reclaims most of the 10.69 GB without losing a single file, because the
   objects stay in the shared `.git`. The largest win by far and it is
   reversible per worktree:
   ```powershell
   cd <worktree>
   git sparse-checkout init --cone
   git sparse-checkout set src scripts supabase tests public
   ```
2. **Stop committing full-page uncompressed PNGs.** 26 MB for one screenshot is
   the driver of both `docs/` and the 1.66 GB `.git`. Evidence at 1440 does not
   need to be lossless; a quality-80 WebP or JPEG is typically a tenth the size
   and reads identically in a review.
3. **Remove worktrees that are finished.** `git worktree list` shows nine;
   several are on long-merged branches (`feat/m6-phase5-refunds-manager`,
   `fix-acl/help-content-copy`).
4. **Do NOT keep running `npm cache clean --force`.** It is shared by every
   session and every clean costs all of them a re-download.

## 4. Two things I did not resolve, flagged

- **The entire tree lives inside OneDrive**
  (`C:\Users\61416\OneDrive\Desktop\EventLinqs`), so `node_modules`, `.next` and
  10.69 GB of images are all sync candidates. `AppData\Local\Microsoft\OneDrive`
  is 1.60 GB. Whether `node_modules` is excluded from sync I could not determine
  without changing OneDrive settings, which is not mine to do. If it is not
  excluded, every install is also an upload of hundreds of thousands of files.
- **`AppData\Roaming` is 9.84 GB**, of which Adobe is 3.98 GB and npm 1.84 GB.
  Outside this project entirely, but it is a third of the free-space problem.
