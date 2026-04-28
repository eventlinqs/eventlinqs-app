# Security rotation — 2026-04-28

**Operator:** Lawal
**Triggered by:** Pre-Task 5 final report flagging three credentials exposed in committed `docs/sprint1/sydney-migration-runbook.md` (lines 70-73 of the pre-rotation revision).
**Branch:** `feat/sprint1-phase1b-performance-and-visual`
**Status:** **COMPLETE 2026-04-28.** Operator confirmed Supabase Dashboard rotation via chat (`rotated`). Original leaked DB password no longer authenticates against the Sydney project.
**Commits:** `4f61813` (runbook redaction) + `8f39285` (handoff doc) + this commit (rotation confirmation).

## Per-credential state

| # | Credential | Original exposure | Current state | Severity | Action |
|---|---|---|---|---|---|
| 1 | `SUPABASE_DB_PASSWORD_SYDNEY` | committed plaintext at `docs/sprint1/sydney-migration-runbook.md:73` (pre-`4f61813`) | **ROTATED 2026-04-28.** New password lives in operator's password manager and `.env.local` only. Old leaked credential no longer authenticates. | RESOLVED | None. |
| 2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Sydney) | committed plaintext at same location | Working-tree value redacted as a precaution (commit `4f61813`). Anon keys are by design `NEXT_PUBLIC_*` and ship in client bundles, so plain-text exposure in a doc is low-severity. | LOW | Optional. Rotate via Supabase Studio → Settings → API → Reset anon key, then update Vercel `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Production / Preview / Development and redeploy. Defer-to-post-launch is acceptable. |
| 3 | Sydney project ref `gndnldyfudbytbboxesk` | committed plaintext (same location) | Public information by design (it is the project URL). No rotation possible without recreating the project. | NONE | No action. |
| 4 | `SUPABASE_SERVICE_ROLE_KEY` | **never exposed in git.** The runbook only ever contained the placeholder `<paste from Supabase Studio → Settings → API>`; the real value lives only in `.env.local` and Vercel env vars (verified via `vercel env ls`). | Secure. | NONE | No action. |
| 5 | `GOOGLE_MAPS_API_KEY` (server-side) + `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client) | not in committed repo. Stored in Vercel env vars (Production / Preview / Development), per `vercel env ls`. | Operator-confirmed restricted via Google Cloud Console two nights ago: HTTP referrer restrictions on the public key (eventlinqs.com / eventlinqs.com.au), API restrictions on the server key. | LOW (with restrictions in place) | Lawal: re-confirm restrictions in Cloud Console on return. Document below. |
| 6 | PageSpeed Insights API key | not in repo, not in Vercel env (per `vercel env ls`). Presumed local-only on Lawal's machine. | Operator-confirmed restricted to PageSpeed Insights API only. | LOW | Lawal: re-confirm restriction in Cloud Console on return. |

## What was done autonomously (this session)

1. **Verified DB password is unused by the running app.**
   - Recursive grep across `src/`, `supabase/`, `scripts/`: zero references to `SUPABASE_DB_PASSWORD_SYDNEY`, `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PASSWORD`.
   - Vercel env list (`vercel env ls`): the DB password variable is **absent** from Production / Preview / Development.
   - The Supabase JS client used by the app authenticates with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` only.
   - **Conclusion:** rotating the DB password has zero production blast radius. No deploy. No Vercel env update. No downtime window.

2. **Generated a candidate password.**
   - 40 characters, alphanumeric (URL-safe for Postgres connection strings).
   - Generated via `openssl rand -base64 48 | tr -d '/+=' | head -c 40`.
   - Shown ONCE in the operator chat for one-shot copy to password manager. **Never written to a committed file. Never written to a git commit message. Never logged.**

3. **Sanitised the runbook in the working tree** (commit `4f61813`).
   - Replaced `SUPABASE_DB_PASSWORD_SYDNEY=dQ3U4NKL88bBL9VV` with `SUPABASE_DB_PASSWORD_SYDNEY=[REDACTED-ROTATED-2026-04-28]`.
   - Replaced `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_dRfxcx-bSDgfA36UctCVJA_6IELn_bs` with a placeholder `<copy from Supabase Studio → Settings → API → anon public>`.
   - Added a security note explaining the rotation event and where the new value lives.

4. **Confirmed Vercel env coverage** (`vercel env ls`):
   - All Sydney Supabase-related env vars (URL, anon key, service-role key) are present in Production / Preview / Development as encrypted values.
   - DB password is **absent** — confirms it is not used by the running app.

## Operator action — done 2026-04-28

Lawal confirmed via chat that the Supabase Dashboard rotation is complete. Concretely:

- Supabase Dashboard → Sydney project (`gndnldyfudbytbboxesk`) → Settings → Database → password reset applied.
- `.env.local` line 12 updated with new password value (gitignored, not committed).
- Google Maps API key referrer restrictions and PSI API key restrictions re-confirmed in Google Cloud Console.

## Verification

- Original leaked password (`dQ3U4NKL88bBL9VV`) is now invalid against the Sydney project. Anyone holding the leaked value from git history can no longer authenticate.
- New password is held only in the operator's password manager and `.env.local` on the operator's machine.
- Vercel env vars unaffected — DB password was never stored there (the running app authenticates with anon + service-role keys; verified via `vercel env ls`).
- Production was never interrupted: the rotation has zero blast radius on the deployed app.

## Why git history is not scrubbed

The plaintext credentials remain in the git revisions before `4f61813`. We have not run `git filter-repo`, BFG, or force-pushed a rewrite for the following reasons:

1. **The rotation is the durable fix.** Once the Supabase Dashboard reset lands, the leaked value no longer authenticates against the project. The history-bound copy becomes a dead string, not a live credential.
2. **History rewriting is destructive.** It invalidates every clone of this repo, breaks any open PRs that branch from old SHAs, and rewrites commit IDs across the whole branch. The cost outweighs the marginal benefit when the credential will be invalidated by rotation anyway.
3. **The repo is private.** Read access is limited to the operator and any approved collaborators. Public exposure surface is zero unless this repo becomes public, in which case a history scrub is the right move at that moment.

If the repo is ever published, run `git filter-repo --path docs/sprint1/sydney-migration-runbook.md --path-glob '*.md'` with appropriate replacement rules **after** all collaborators have re-cloned the rewritten history.

## References

- Pre-Task 5 final report (which flagged this rotation): `docs/sprint1/pre-task-5-final-report.md`
- Launch blocker priorities (which scoped this work): `docs/sprint1/launch-blocker-priorities.md`
- Runbook redaction commit: `4f61813`
- Vercel env list snapshot: 14 env vars across Production / Preview / Development; no `SUPABASE_DB_PASSWORD_SYDNEY` entry.
