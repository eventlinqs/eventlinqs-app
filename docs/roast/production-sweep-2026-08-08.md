# Production defect sweep, 8 August 2026

Branch `fix/production-sweep`, cut from `origin/main` at `bbe6fd7`.

Written to after each journey so a crash costs nothing. Every claim carries a
screenshot path or pasted output. Nothing here is a plan; it is a record of what
was observed.

## Standing constraints for this pass

- The sweep runs against the **TEST** Supabase project (`vkapkibzokmfaxqogypq`).
  `.env.local`, which points at production (`gndnldyfudbytbboxesk`), was
  **deleted from this worktree** before anything ran, so there is no path by
  which this session can write to the live database. `scripts/sweep/db.mjs`
  additionally refuses to start if it is ever pointed at the production ref.
- The funds-holding payment engine is not modified.
- Another session holds `feat/launch-kit-moat` in the primary working tree. This
  sweep runs in a separate worktree at `el-prod-sweep` and never checks out that
  branch.

## Environment facts established before walking

| Fact | Value | How it was established |
|---|---|---|
| Branch base | `bbe6fd7` | `git log --oneline -1 origin/main` |
| Supabase target | `vkapkibzokmfaxqogypq` (TEST) | `grep NEXT_PUBLIC_SUPABASE_URL .env.test` |
| Production env removed | yes | `ls -a \| grep .env` shows no `.env.local` |
| Free disk | 6.4 GB | `df -h /c` |

## Journey log

Populated as each journey completes. See the sections below.
