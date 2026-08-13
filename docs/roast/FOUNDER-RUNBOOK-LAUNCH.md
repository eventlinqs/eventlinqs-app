# Founder runbook: launch

Everything you have to do yourself, in the order to do it. Written 13 August 2026
from `integration/launch`.

**Read the scope note first.** Sections 1 to 4 were prepared and verified in this
run. Sections 5 to 7 were NOT prepared, and they say so at the top of each. Do
not treat an unprepared section as a checklist; treat it as a statement of what
is still unknown.

---

## 1. Verify the Vercel environment variables

Page: Vercel dashboard, project `eventlinqs-app`, **Settings, Environment
Variables**.

| # | Variable | Scope | What it must be | How you know it worked |
|---|---|---|---|---|
| 1.1 | `NEXT_PUBLIC_SITE_URL` | Production | exactly `https://www.eventlinqs.com.au` | The row shows that value AND the **Sensitive** toggle is **OFF**. A Sensitive `NEXT_PUBLIC_` variable is invisible at build time and reads as empty, which is the root cause of the canonical-host defect. |
| 1.2 | `NEXT_PUBLIC_APP_URL` | Production | either absent, or exactly `https://www.eventlinqs.com.au` | If present it must match 1.1 character for character. The manifest rule `ORIGIN_AGREEMENT` fails the build if they disagree. |
| 1.3 | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Production | a key starting `AIza`, about 39 characters | Present and non-empty. Empty here means every map renders its fallback with no error anywhere. |
| 1.4 | `VERCEL_TOKEN` | GitHub Actions secret, not Vercel | a Vercel token with read access to the project | The `preview-deployment-state` guard currently prints `SKIP - no VERCEL_TOKEN`. After setting it, that line must read a real verdict. **A skip is not a pass.** |
| 1.5 | `ANTHROPIC_API_KEY` | Production | a key starting `sk-ant-` | Without it the composer falls back to pattern matching. It still produces a kit, so the absence is invisible from the outside. |

**Success for section 1:** trigger a redeploy and read the build log. Every
`[public-env]` line reads `ok`. There is no `SERVER SECRET WARNING` block.

---

## 2. Rotate the credentials

The list lives in `docs/roast/ROTATE-AT-GOLIVE.md`. Do `CRON_SECRET` first.

**2.1 `CRON_SECRET`.** Production currently holds a 28-character value against a
declared 32-character minimum. Generate a new one of at least 32 characters, set
it in Vercel Production, and set the identical value as a GitHub Actions secret.

**Success:** after redeploy, the build log has no `CRON_SECRET` line in the
server-secret warning block. Then check that a cron actually runs: Vercel,
project, **Logs**, filter on `/api/cron/`, and confirm a 200 rather than a 401.
`requireCronAuth` fails closed, so a wrong secret shows as every scheduled job
returning 401 and the platform going quiet with no error raised anywhere.

**2.2** Work through the rest of `ROTATE-AT-GOLIVE.md` in the order given there.

---

## 3. Merge to main

Nothing in this run merged to main. `origin/main` is untouched.

1. Confirm CI is green on `integration/launch`.
2. Merge `integration/launch` into `main` through the GitHub UI.
3. Watch the production deployment reach **READY**.
4. Open `https://www.eventlinqs.com.au` and confirm it loads without a redirect.

**Success:** the address bar shows `www.eventlinqs.com.au` and did not bounce
through `eventlinqs.com`.

### 3.1 Rollback, if the merge goes wrong

History rewriting and force pushing are banned, so rollback is forward-only.

1. **Fastest, no git at all:** Vercel, project, **Deployments**, find the last
   known-good production deployment, use **Promote to Production**. This is
   instant and reversible and should be your first move.
2. **Then fix the code:** `git revert -m 1 <merge-sha>` on `main`, push. `-m 1`
   keeps main's side as the parent, which is what you want for a merge commit.
3. **Confirm:** the revert commit appears on main, a new production deployment
   reaches READY, and the site behaves as it did before the merge.

Never `git reset` or force push to recover. A revert is a new commit and leaves
every quoted SHA in every handover valid.

---

## 4. Prove money moves, with a real card

Do this on production, after the merge, with your own card.

1. Create a paid event with a single ticket tier at **$1.00**, publish it.
2. Open the public event page in a private browser window, not logged in as the
   organiser.
3. Buy one ticket with a real card.
4. **Success at the buyer end:** you land on the order confirmation page, and the
   ticket email arrives with a QR code.
5. **Check in Stripe:** dashboard, **Payments**. The payment shows **Succeeded**.
   Open it and confirm: the amount is the $1.00 face value plus the platform fee
   and the processing fee, the statement descriptor is what you expect, and under
   **Connect** the transfer to the organiser account is listed or scheduled.
6. **Check the platform:** the order appears in the organiser dashboard, and the
   ticket count on the event decrements by one.
7. Refund it from Stripe, and confirm the platform marks the order refunded.

**If any step fails, stop and do not announce launch.** A checkout that takes
card details and settles nothing is the single worst outcome available.

---

## 5. NOT PREPARED: the production taxonomy migrations

**This was not done in this run.** What is known:

- Neither taxonomy migration has been applied to production, so a banned word is
  live on customer-facing pages there and the Arts and Comedy homepage tiles
  match no row.
- The migrations exist on this branch and TEST has them.
- Commit `913a1d9` ("fix(taxonomy): the banned word leaves the data, and two
  homepage tiles start matching") is the relevant work.
- Commit `7a151ad` renumbered a migration out of a version collision, so the
  order matters.

**What is NOT known and must be established before you run anything:** whether
`CATEGORY_SLUG_ALIASES` and `resolveCategorySlug` cover every retired slug. If
any retired slug lacks an alias, every shared link and every printed QR code
pointing at the old slug will 404 after the migration. **Do not apply these
migrations until that has been checked and proven in a browser.**

---

## 6. NOT PREPARED: removing the 32 seeded events from production

**This was not done in this run.** No identification query was written, no
cleanup script exists, and nothing was proven on TEST.

The critical unknown is stated so it is not skipped: **it is not established
whether a seeded row carries a reliable fixture marker, or whether it can only be
identified by title or slug.** That is the difference between a safe delete and a
dangerous one, and it decides whether a real organiser's event could match the
same filter. Establish that first.

---

## 7. NOT PREPARED: the dependency vulnerabilities

`npm audit` reports 31, of which 11 are high. They were not triaged in this run,
so it is not known which are reachable from a request path and which are dev-only
(a test runner or a build script, reachable by nobody). Do not spend launch night
on this: an unreviewed `npm audit fix` is more likely to break the build than to
close a real hole.
