# Security rotation — 2026-04-28

**Operator:** Lawal
**Triggered by:** Pre-Task 5 final report flagging three credentials exposed in committed `docs/sprint1/sydney-migration-runbook.md` (lines 70-73 of the pre-rotation revision).
**Branch:** `feat/sprint1-phase1b-performance-and-visual`
**Working tree changes committed:** `4f61813` (runbook redaction).

## Per-credential state

| # | Credential | Original exposure | Current state | Severity | Action |
|---|---|---|---|---|---|
| 1 | `SUPABASE_DB_PASSWORD_SYDNEY` | committed plaintext at `docs/sprint1/sydney-migration-runbook.md:73` (pre-`4f61813`) | **ROTATION PENDING — operator action required.** Working-tree value redacted in commit `4f61813`. Old credential remains live in Sydney project until Dashboard reset. | **HIGH** | Lawal: Supabase Dashboard → Sydney project (`gndnldyfudbytbboxesk`) → Settings → Database → Reset password → paste candidate (in 1Password). |
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

## What requires operator action (Lawal — when back at desk)

### Step 1: Rotate the Sydney DB password
1. Open https://supabase.com/dashboard/project/gndnldyfudbytbboxesk/settings/database.
2. Scroll to **Database password** → click **Reset database password**.
3. Paste the candidate password from the password manager (saved during this session).
4. Confirm.

### Step 2: Update `.env.local`
1. Open `.env.local` line 12: `SUPABASE_DB_PASSWORD_SYDNEY=dQ3U4NKL88bBL9VV`.
2. Replace the value with the new password from the password manager.
3. Save. Do not commit `.env.local` (gitignored).

### Step 3: Verify rotation invalidated the old credential (optional, recommended)
- The simplest check: try connecting with the OLD password via any psql client. It should fail with `password authentication failed`. If it succeeds, the Dashboard reset did not apply.

### Step 4: Confirm Google API key restrictions
1. https://console.cloud.google.com/apis/credentials → your project.
2. Click `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`:
   - Application restrictions: should be **HTTP referrers**.
   - Allowed referrers should include: `https://eventlinqs.com/*`, `https://*.eventlinqs.com/*`, `https://eventlinqs.com.au/*`, `https://*.eventlinqs.com.au/*`, plus any preview-domain patterns you allow.
   - API restrictions: limited to Maps JavaScript API + Places API + Geocoding API (whichever you use).
3. Click `GOOGLE_MAPS_API_KEY` (server):
   - Application restrictions: **None** is acceptable for a server-side key (since there's no referer header).
   - API restrictions: must be limited to the specific Google APIs you call from server code.
4. Click PageSpeed Insights API key (if listed):
   - Application restrictions: **None** is acceptable for local CLI use.
   - API restrictions: must be limited to **PageSpeed Insights API** only.

### Step 5: Reply in chat with one of: `rotated`, `done`, or `complete`
On confirmation, I will:
- Update this doc's status from `ROTATION PENDING` to `ROTATED 2026-04-28`.
- Update `docs/sprint1/launch-blocker-priorities.md`: strike security cleanup, list 4 remaining blockers (M6, M7, layout, logo), recommend M6 next.
- Commit + push as `docs(security): credential rotation complete — update launch blockers`.

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
