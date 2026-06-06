# Flagged orphan branch triage (2026-06-06)

Triage of the 4 branches flagged in
`docs/launch-hardening/orphan-branch-forensics.md`. Method: diff each against
fresh `main`, decide per the evidence.

## 1a. feat/m6-phase4-payouts-dashboard - KEEP (unique, not superseded)

The merged admin payout work (PRs 74 to 77) is the **admin-facing** cockpit:
`src/app/admin/(authed)/payouts/**` plus `src/lib/admin/payouts.ts` (a platform
admin disburses, voids, and inspects balances/holds/history for any organiser).

This branch is the **organiser-facing** dashboard - a different audience and
surface that is entirely absent from `main`:

- `src/app/api/payouts/{list,summary,refunds,stripe-dashboard-link}/route.ts` -
  organiser payout API (main has zero `src/app/api/payouts/*`).
- `src/components/payouts/{summary-cards,payouts-history-table,refunds-list,reserve-release-timeline,stripe-dashboard-button,format}` -
  the organiser dashboard UI.
- `src/lib/payouts/{queries,auth,email}.ts` - organiser payout data, ownership
  gate, and payout email notifications.
- A fuller `/dashboard/payouts` page (148 lines vs main's 107) and unit tests.

Verdict: **not superseded** feature by feature; the admin cockpit and the
organiser dashboard are complementary. Unique remainder = the entire organiser
payout dashboard above. Land it via its own PR (it also modifies the Stripe
webhook for payout-event emails and adds an `auth`/rate-limit policy). Not
deleted.

## 1b. feat/auth-defects-fix - PARTLY LANDED here, branch KEPT

Two defects. Diffed the signup route + auth-emails lib + the form changes
against main.

- **Defect 2 (reset-password hang):** STILL EXISTS on `main`. The success path
  never calls `setLoading(false)` and `await signOut()` can deadlock on
  NavigatorLock, so the button sticks on "Updating password" forever.
  **Cherry-picked the fix into this branch as its own commit** (bounded
  timeouts, `finally` reset, hard navigation).
- **Defect 1 (signup confirmation email):** the symptom (Supabase's 4-per-hour
  default-mailer cap) is real, and `main` still calls `supabase.auth.signUp`
  from the browser. But the chosen fix is the **config** path - configure
  Supabase Custom SMTP to Resend (runbook item 2, still pending) - which solves
  deliverability without code. The branch's approach is a competing **code**
  path (a custom `/api/auth/signup` route using `admin.generateLink` + the
  Resend SDK). NOT cherry-picked: it would create a second, parallel solution
  that conflicts with the config path once that is done.

Verdict: defect 2 fixed here; defect 1 should be closed by completing runbook
item 2 (config). The branch is **kept** because its `/api/auth/signup` +
`auth-emails`/`send` code is the unique fallback if the founder prefers the code
path over Supabase Custom SMTP. Founder decision.

## 1c. feat/hardening-phase2-load-testing - KEEP (load-test rig)

The k6 load-test rig is intact and entirely unique to this branch (16 files,
none on `main`):

- `tests/load/profiles/{browse,checkout,organiser}.js` - the three k6 scenarios.
- `tests/load/lib/{config,checks,fixtures}.js` - shared k6 helpers.
- `tests/load/scripts/{seed-test-users,seed-test-organisers,refresh-event-slugs}.mjs` -
  staging seed + slug refresh.
- `tests/load/process-results.mjs` + `tests/load/results/*` - the
  post-processor and a captured browse smoke baseline.
- `docs/hardening/phase2/{scope,load-test-results}.md`.

Verdict: this is the basis for the upcoming load-test mission. **Kept, not
deleted.** Bring it forward by branching the load-test work from it (or
cherry-picking `tests/load/**` onto a fresh branch) when that mission starts.

## 1d. feat/sprint1-phase1b-performance-and-visual - DELETED (contained)

Adds only 6 docs (`COMPETITIVE-INTELLIGENCE`, `FUTURE-TOOLING`,
`GENRE-DISCOVERY-FOUNDATION-SPEC`, `M5-DESIGN-SPEC`, `STATUS-2026-05-29`,
`audit/AUDIT-FULL-2026-05-29`). Every one is **byte-identical on `main`** (0
diff lines) and the branch makes no other change. Provably contained - the
branch is **deleted**.

## Net

| Branch | Verdict |
|---|---|
| feat/m6-phase4-payouts-dashboard | KEEP (unique organiser payout dashboard; land via PR) |
| feat/auth-defects-fix | KEEP; defect-2 fix cherry-picked here; defect-1 = config (runbook item 2) |
| feat/hardening-phase2-load-testing | KEEP (load-test rig for the next mission) |
| feat/sprint1-phase1b-performance-and-visual | DELETED (byte-identical docs on main) |
