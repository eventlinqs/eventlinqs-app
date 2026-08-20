# Founder runbook: launch

Everything you have to do yourself, in the order to do it. Written 13 August 2026
from `integration/launch`, re-verified against the tree and against production on
15 August 2026 at `48dd6e8`.

**Read the scope note first.** Sections 1 to 4 were prepared and verified in the
original run. Sections 5 to 7 were not, and they say so at the top of each. Do
not treat an unprepared section as a checklist; treat it as a statement of what
is still unknown.

**What the 15 August re-verification changed**, so you are not comparing this
against an older copy someone quoted at you:

| Where | What was wrong | Now |
|---|---|---|
| 3.1 | told you to expect an upstream comparison that cannot appear, because this worktree tracks `origin/main` | uses `--porcelain` plus two `rev-parse` lines, which do not depend on the upstream |
| 3.2 | silent on the merge method | records that a squash collapses 202 commits, so the revert is all or nothing |
| 3.5 | did not exist | new read-only step: confirm no pending version is already applied. Measured: production ends at `20260727000002`, so nothing collides |
| 3.6 (was 3.5) | read as though it applied one migration | says plainly that one push applies **eleven**, and that section 5's push is therefore a no-op |
| 3.8 (was 3.7) | `git revert -m 1` given unconditionally, plus a duplicate rollback misnumbered `3.1` | one rollback, with the squash and merge-commit forms distinguished, and the promote-vs-migration ordering trap spelled out |
| 4.0 | did not exist | confirm the live fee in `pricing_rules` before trusting the `$2.03` |
| 4a | three commands that would all have been REFUSED by the production write preflight | every command carries `ALLOW_PRODUCTION_SUPABASE`, with the clear-it-after step |
| 5 | told you to push again, from a worktree that is not linked | push marked as already done by 3.6, and `--workdir` supplied for the linked checkout |
| 6 | a heading saying "nothing to do here" sitting above the correction that disproves it | heading marked superseded, purge confirmed as a launch step |
| 7 | ordered the $1 purchase after the purge, contradicting the founder ruling in section 4 | corrected: purchase first, purge second, repeat purchase third |

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

### 1a. Creating `VERCEL_TOKEN` (row 1.4), step by step

**You create this, not the agent.** A token is a credential and it is minted
under your account.

**Create it.**

1. Go to **https://vercel.com/account/tokens**. Vercel documents it as the
   "Account Tokens page, also found under the Settings area of your account".
   In the scope selector at the top left, make sure you are viewing your
   **personal account**, not a team.
   (https://vercel.com/docs/accounts/access-tokens, fetched 14 August 2026)
2. Enter a descriptive name, for example `EventLinqs CI preview-state guard`.
3. Open the **Scope** dropdown, select the team that owns the project, then
   select **the EventLinqs project**.
   **Choose the project, not All Projects.** Vercel publishes three scopes only:
   Full Account, Team, and Project. Project is the smallest, and it "can only
   read and write resources belonging to a project that the token is scoped to"
   (https://vercel.com/changelog/project-scoped-tokens, 30 July 2026, fetched
   14 August 2026). Selecting **All Projects** creates a team-scoped token
   instead, which is wider than this guard needs.
4. Choose an expiry. Vercel offers "a default list of expiration dates ranging
   from 1 day to 1 year"
   (https://vercel.com/changelog/expiration-dates-now-available-for-access-tokens,
   fetched 14 August 2026). Pick the shortest that outlives your rotation window
   and write the date in `docs/roast/ROTATE-AT-GOLIVE.md`.
   **UNSOURCED:** the exact list of options and which is preselected. Vercel does
   not publish them, so no default is claimed here.
5. Select **Create** (Vercel's knowledge base shows this as **Create**, then
   **Create Token** in a modal, so accept either label). **Copy the value now.**
   Personal access tokens begin with `vcp_` and the value is not shown again.

**There is no read-only scope.** Vercel documents all three levels as read and
write. A read-only Vercel API token is **UNSOURCED**; do not go looking for one.
Project scope is the minimum blast radius available.

If the team enforces two-factor authentication or SAML, Vercel will say so when
you select it, and you must satisfy that first.

**Where the value goes.**

- **CI (the one that matters):** GitHub repository secret.
  Repository **Settings**, sidebar **Secrets and variables**, then **Actions**,
  **Secrets** tab, **New repository secret**. Name it exactly `VERCEL_TOKEN`,
  paste the value, **Add secret**.
  (https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets,
  fetched 14 August 2026). The workflow exposes it as
  `VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}`.
  **Known limit:** GitHub does not pass secrets to workflows triggered from a
  **forked** repository, so the guard will skip on fork pull requests. That is
  documented behaviour, not a misconfiguration.
- **Local:** set it in your shell for the session only.
  `$env:VERCEL_TOKEN="vcp_..."`. Do not put it in `.env.local` and do not commit
  it. Vercel's own instruction: "Treat tokens as secrets ... Store it in a secret
  manager or environment variable; never commit it to source control."
  (https://vercel.com/docs/cli/tokens, fetched 14 August 2026)

**Confirm it works, in one command.** Run this in **Git Bash**, not PowerShell,
where `curl` is an alias for `Invoke-WebRequest` and these flags will not parse.

```bash
curl -s -o /tmp/vercel-check.json -w '%{http_code}\n' \
  "https://api.vercel.com/v7/deployments?projectId=PROJECT_ID&limit=20" \
  -H "Authorization: Bearer VCP_TOKEN_VALUE"
```

`PROJECT_ID` is the `projectId` in `.vercel/project.json`.

- **Working:** prints `200`, and the file holds a JSON object with a
  `deployments` array and a `pagination` object.
- **Not working:** any other code. Vercel documents `401` "The request is not
  authorized" and `403` "You do not have permission to access this resource",
  with an error body of `{ "error": { "code": ..., "message": ... } }`
  (https://vercel.com/docs/rest-api/errors, fetched 14 August 2026).
  **UNSOURCED:** which of 401 or 403 an expired or revoked token returns
  specifically. Treat any non-200 as a failure.

**Confirming the guard flips from SKIP to PASS.**

```powershell
$env:VERCEL_TOKEN="vcp_..."; node scripts/guards/preview-deployment-state.mjs
```

- **Before:** `[preview-state] SKIP - no VERCEL_TOKEN, so the state of
  <branch>'s preview is UNKNOWN, not good.`
- **After, and this is the line you want:**
  `[preview-state] PASS - newest settled deployment for <branch> is READY (<sha>).`

**Read the skip lines as failures to observe, never as passes.** The guard exits
0 on all of these: no git checkout, no token, no project or team id, a non-200
from Vercel, no deployment yet for the branch, the newest still building, an
unreadable response shape, and a CANCELED deployment. Only ONE path exits 1.

### What the guard actually enforces once it has the token

Read from its code, `scripts/guards/preview-deployment-state.mjs`:

1. Resolves the current branch with `git rev-parse --abbrev-ref HEAD`.
2. Reads `projectId` and `teamId` from the environment, falling back to
   `.vercel/project.json`.
3. Calls `GET https://api.vercel.com/v7/deployments?projectId=...&teamId=...&limit=20`
   with `Authorization: Bearer $VERCEL_TOKEN`.
4. Keeps only deployments whose `meta.githubCommitRef` equals the current
   **branch**.
5. Takes the newest one that has SETTLED, meaning `READY`, `ERROR` or `CANCELED`.
6. **Exits 1 if and only if that deployment is in `ERROR`.** Everything else
   exits 0.

So it is precisely one assertion: **the newest settled preview for this branch is
not a failed build.** It does not check that the deployment matches the commit
you are about to push, only that it is the newest settled one on the branch. It
does not check the site renders, and it cannot: a build can succeed and the page
still be wrong.

It exists because `feat/public-composer` once had six consecutive preview
deployments in ERROR while the branch alias kept serving the last good build, so
every claim of "verified on the deployed preview" was made against stale code,
with 1839 unit tests, tsc, eslint and nine guards all green throughout.

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

## 3. THE MERGE, AS EXECUTABLE STEPS

Nothing in this run merged to main. `origin/main` is untouched.

**Run these in order. Do not skip a verification.** Every step says what to type,
what you should see, and what it means if you see something else. Where a step
says STOP, stop: the next step assumes the previous one succeeded.

Open PowerShell. Every command in this section assumes this prefix, which is not
repeated on each line:

```powershell
Set-Location "C:\Users\61416\OneDrive\Desktop\EventLinqs\el-moat"; $env:PATH="C:\node24\node-v24.19.0-win-x64;$env:PATH"
```

### THE ONE RULE THAT CAN TAKE THE LIVE SITE OFF SALE

**Deploy the code FIRST. Apply the migrations SECOND. Never the other way round.**

Migration `20260808000010_rls_column_privilege_lockdown.sql` revokes
`stripe_account_id` and `stripe_charges_enabled` from the `anon` role. The code
on `main` **today** reads those two columns through an anon embed and hands them
to the sale gate. Apply that migration to a database whose deployed code still
does that, and both fields read `undefined` for every organiser, the gate returns
false platform-wide, and **every paid event on the live site stops selling.** It
does not error and it does not alert. It renders the real, designed "still
finishing their payment setup" state, which is why it went unnoticed on the
preview for weeks.

`integration/launch` carries the fix. Steps 3.1 to 3.7 below are ordered so that
getting this wrong requires ignoring an explicit STOP.

---

### 3.1 Confirm the branch is green and is what you think it is

```powershell
git fetch origin; git status --porcelain
git rev-parse HEAD; git rev-parse origin/integration/launch
```

**Expect:** `git status --porcelain` prints **nothing at all**, and the two
`rev-parse` lines print the **same** 40-character SHA, matching the one at the
top of the report you were handed.

Then open the GitHub Actions run for that SHA and confirm **CI is green**.

**Why not `git status --short --branch`.** An earlier draft used it and told you
to expect "up to date with `origin/integration/launch`". You will never see that
line: this worktree's upstream is set to `origin/main`, so that command prints
`## integration/launch...origin/main [ahead 202]`. It is comparing against the
wrong branch, and the commands above do not depend on the upstream at all.

**The same fact matters later.** Because the upstream is `origin/main`, a bare
`git push` from this worktree targets **main**. Every push in this runbook names
its remote and branch for that reason. Never push from here without the refspec.

**STOP IF:** CI is red, or the SHAs do not match, or anything at all is listed by
`--porcelain`. Do not merge a branch whose verification you have not seen.

### 3.2 Merge to main

Through the **GitHub UI**, not the command line, so the merge is recorded and
reviewable:

1. Open a pull request from `integration/launch` into `main`.
2. Confirm the checks pass on the PR itself.
3. Merge it.

**Expect:** the PR shows merged, and `main` now contains the branch SHA.

**USE "SQUASH AND MERGE". NOT "CREATE A MERGE COMMIT".** This was already the
habit; as of 15 August 2026 it is also a reason. Two commits on this branch,
`487846f` and `ae55157`, are authored `drill <drill@eventlinqs.test>` after a
test drill wrote its identity into the shared config through an inherited
`GIT_DIR` (finding 77). A squash merge writes ONE new commit and does not carry
the squashed commits forward, so neither of those ever reaches `main`, and where
the squashed commits have more than one author GitHub attributes the new commit
to whoever presses the button. Pressing "Create a merge commit" instead would
carry both into `main`'s history permanently, and the only ways to undo that are
banned here.

**Know what the button does, because the rollback in 3.8 depends on it.** This
repository allows all three methods, and its practice is **Squash and merge**:
every commit on `main` from `(#105)` to `(#112)` is single-parent, and the last
true merge commit was PR #44.

A squash collapses **all 202 commits** on this branch into **one** commit on
main. That is fine, and it has one consequence worth knowing in advance rather
than discovering under pressure: **the revert is all or nothing.** There is no
reverting one fix out of the merge. Undoing it undoes the entire branch, and
anything you then want back has to be re-applied forward as new work.

Note which button you press. Step 3.8 asks for it.

### 3.3 Watch production deploy, and verify it is the NEW code

```powershell
git fetch origin; git log --oneline -3 origin/main
```

In Vercel, project `eventlinqs-app`, **Deployments**: wait for the production
deployment of that merge commit to reach **READY**.

**Expect:** state READY, and its commit SHA equals the merge commit.

**STOP IF:** the deployment is ERROR or CANCELED. A branch alias can keep serving
the previous good build, so "the site still works" does not mean the deploy
succeeded. Read the state, not the site.

### 3.4 VERIFY THE SALE-GATE FIX IS LIVE, before any migration

This is the step that makes the ordering rule safe. Do it before you touch the
database.

1. Open `https://www.eventlinqs.com.au` in a **private window**. Confirm the
   address bar stays on `www.eventlinqs.com.au` and does not bounce through
   `eventlinqs.com`.
2. Open a **paid** event page whose organiser is fully onboarded.
3. Confirm a **ticket selector renders**, with a quantity control and an all-in
   total.
4. Confirm the words **"finishing their payment setup" do NOT appear.**

**STOP IF** that message appears on a fully onboarded organiser's paid event.
The fixed code is not live, and applying the migration now would take every paid
event off sale. Go back to 3.3 and find out what deployed.

### 3.5 Confirm no pending version has already been applied

Read only. Takes about twenty seconds, and it is the difference between a
migration running and a migration being silently marked done without ever
running.

**The hazard, in one paragraph.** `supabase db push` keys on the fourteen-digit
VERSION PREFIX, never on the filename or the contents. `main` carries a file at
version `20260808000004` called `category_taxonomy_repair.sql`. This branch
renumbered that file to `20260812000002` and put a **different** migration at
`20260808000004`, called `category_taxonomy_r1.sql`. If production had ever
recorded `20260808000004`, the new `r1` file would be treated as already applied
and would **never run**, with nothing reporting it.

**This worktree is not linked to any Supabase project**, so `--linked` on its own
has nothing to resolve. Two ways to ask, and either is enough.

**Form 1, the CLI.** `--workdir` points the command at a checkout that IS linked,
without changing the link in this one:

```powershell
supabase migration list --linked --workdir "C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-hardening"
```

**Form 2, SQL.** In the Supabase SQL editor on the production project:

```sql
select version from supabase_migrations.schema_migrations
 order by version desc limit 5;
```

**Expect:** the newest applied version is **`20260727000002`** and there is no
`20260808000004` anywhere in the list.

**MEASURED 15 AUGUST 2026, READ ONLY: this is already true.** Production's
migration history ends at `20260727000002` with **77 versions applied**, and
`20260808000004` is **not among them**. Nothing from August has been applied at
all. So both taxonomy migrations will run, in order, exactly as section 5
describes, and the hazard above does not fire on this merge. Re-run the check
anyway if any time has passed, because the whole point is that this is a fact
about the database and not about the repository.

**STOP IF:** `20260808000004` appears as applied. That is not a reason to abort
the merge, but it changes what you should believe afterwards: `r1` will be
skipped, `20260812000002_category_taxonomy_repair.sql` will do the work instead
(it performs the same rename, insert and backfill with every statement guarded),
and section 5's verification SQL becomes the only thing that proves the end state
is right.

**The automated form of this check** is
`node scripts/verify/migration-collision-guard.mjs --remote`. Its local half is
registered in the guard runner and blocks every build; the remote half needs
network and a linked project, so it does not run by default and reports
`PASSED WHAT RAN, 1 CHECK(S) SKIPPED` rather than pretending to be green.

### 3.6 Apply the migrations

Only once 3.4 and 3.5 have both passed. PowerShell only, never the Supabase
Dashboard SQL editor and never the MCP.

**This worktree is not linked**, so run it against a checkout that is, or link
this one first. Confirm the target is production before you press return:

```powershell
supabase migration list --linked --workdir "C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-hardening"
supabase db push --linked --workdir "C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-hardening"
```

**ONE PUSH APPLIES ELEVEN MIGRATIONS, NOT ONE.** `db push` applies **every**
pending version in order, so this single command applies the whole August set,
measured against production on 15 August 2026:

```
20260808000001_city_primary_backfill.sql
20260808000002_share_channel_digest.sql
20260808000003_suburb_primary_backfill.sql
20260808000004_category_taxonomy_r1.sql            <- section 5's file 1
20260808000005_cultural_tag_to_community.sql
20260808000006_share_codes_never_released.sql
20260808000010_rls_column_privilege_lockdown.sql   <- the sale-gate hazard
20260809000001_payout_status_unset.sql
20260812000001_kit_draft_covers.sql
20260812000002_category_taxonomy_repair.sql        <- section 5's file 2
20260815000001_external_ticketing.sql
```

**RE-VERIFIED INDEPENDENTLY ON 16 AUGUST 2026, AND STILL ELEVEN.** The list above
was measured by hand on 15 August. It has since been confirmed by machine, from a
different source, without anybody typing the number: the types-drift guard on
PR #118 reads the applied set from the Supabase Management API
(`GET /v1/projects/{ref}/database/migrations`) and printed

```
[types-drift] 88 migration(s) in the repository, 77 applied to gndnldyfudbytbboxesk, 11 pending.
```

88 minus 77 is 11, and they are the eleven files above. **So when you run the push
and the CLI lists eleven versions, that is correct and expected, not a surprise
and not a sign that something extra crept in.**

**ATTRIBUTION, because two migrations do the same thing and only the first one
counts.** `share_links.event_id` becoming nullable is done by
**`20260808000006_share_codes_never_released.sql`**, NOT by
`20260815000001_external_ticketing.sql`. Both files contain
`ALTER COLUMN event_id DROP NOT NULL`, but 000006 sorts earlier and therefore runs
first in this single push, so by the time 20260815000001 executes that statement
it is a **no-op**. The types-drift guard reaches the same conclusion independently
and attributes the three `event_id` type changes to 000006. This matters if you
are ever reading the push output or a failure trace and trying to work out which
file actually changed the column: it is 000006. What 20260815000001 genuinely and
solely contributes is `destination_url`, `draft_code` and
`events.external_ticket_url`.

**Section 5 therefore does not need a second push.** Section 5 is written as
though its two taxonomy migrations are applied separately and later. They are
not: this step applies them. When you reach section 5, **skip its push and run
only its verification SQL and browser checks.** Running the push again is
harmless and does nothing, which is worth knowing so a no-op does not read as a
failure.

**Expect:** the CLI lists those eleven versions as applied and exits 0. It takes
seconds; there is no long-running step.

**STOP IF:** a non-zero exit with a Postgres error naming a constraint. Do not
re-run. Read section 5 for the taxonomy migrations specifically, and section 5a
for the ordering hazard.

### 3.7 Verify BOTH halves landed

Both, not either. One without the other is a silent failure in one direction or
the other.

**(a) The site still sells.** Re-open the same paid event page from 3.4. It must
**still render a ticket selector**. If it now shows the payment-setup message,
the code deployed in 3.3 was not the fixed code, and you should roll back per
3.8 immediately.

**(b) The revoke actually applied.** In the Supabase SQL editor, as the `anon`
role, selecting `stripe_account_id` from `organisations` must be **refused**. If
it still succeeds, the migration did not apply and step 3.7(a) passed for the
wrong reason.

**Success for section 3 is both together:** a paid event page that renders a
ticket selector, AND an `anon` role that cannot read `stripe_account_id`.

### 3.8 Rollback

History rewriting and force pushing are banned, so rollback is forward-only.
Work down this list and stop as soon as the site is correct.

**1. Fastest, no git at all:** Vercel, **Deployments**, find the last known-good
production deployment, **Promote to Production**.

Read this next sentence before you use it, because the ordering rule cuts both
ways. Promoting the OLD build is the right first move **while the migration has
not been applied**, because the old code does not need the revoked grant yet.
Once 3.6 has run, the old code DOES depend on a grant the database no longer
gives, so promoting it re-creates the off-sale state you were trying to escape.

- **Not past 3.6 yet:** promote freely. This is the clean fix.
- **Past 3.6:** do step 2 first, then promote.

**2. If the migration is already applied and the code cannot go forward:** write
a NEW migration re-granting the two columns to `anon`, and apply it:

```sql
-- e.g. supabase/migrations/20260816000001_restore_anon_stripe_columns.sql
grant select (stripe_account_id, stripe_charges_enabled)
  on public.organisations to anon;
```

**Do not edit or delete `20260808000010`.** An applied migration is corrected by
a new one, never by editing the old one: the database has recorded that version
as done and will never read the file again.

**3. For the code, and the form depends on which merge button you pressed in
3.2:**

```powershell
git fetch origin; git checkout main; git pull

# If you pressed "Squash and merge" (this repository's recent practice):
git revert <squash-sha>

# If you pressed "Create a merge commit":
git revert -m 1 <merge-sha>

git push origin main
```

`-m 1` names which parent to treat as the mainline, which only means anything on
a commit that HAS two parents. A squash merge produces an ordinary single-parent
commit, so `-m 1` describes nothing there. On git 2.53 it is accepted rather than
rejected, so the wrong form will not stop you and will not warn you; use the
right one anyway, because the next person reads the command to learn what the
commit was.

**Push with the explicit refspec.** This worktree's upstream is `origin/main`, so
a bare `git push` is ambiguous about intent even when it happens to be correct.

**4. Confirm:** the revert commit appears on main, a new production deployment
reaches READY, and a paid event page renders a ticket selector.

Never `git reset`, never `--amend`, never force push. A revert is a new commit
and leaves every SHA quoted in every handover valid.

---

## 4. Prove money moves, with a real card

Do this on production, after section 3 is fully green, with your own card. It is
the gate on everything in section 6: nothing is deleted from production until
this passes.

**Where it lands.** On `Party Pty Ltd`, which is your own TEST organiser record
carrying a live Connect account. It is not a company and not EventLinqs' legal
entity, and it is deleted in section 6.4 once this passes.

### 4.0 Confirm the live fee before you build anything

Read only, one query, and it decides whether the `$2.03` below is the right
number to expect.

**Why this step exists.** The `$2.03` in 4.1 is derived from the PRICING-LOCK
block in `docs/PRICING.md`, which is the DOCUMENTED fee. The CHARGED fee is
resolved at runtime from the `pricing_rules` table through `getPricingRule`. They
are supposed to agree and there is no gate that can prove they do from the
repository, because one of them lives in a database. If they disagree you will
see a total other than $2.03, the STOP in 4.1 will fire, and you will be halting
a system that is behaving exactly as configured.

In the Supabase SQL editor on production:

```sql
select country, currency, platform_fee_percentage, platform_fee_fixed,
       effective_from, effective_until
  from public.pricing_rules
 where organisation_id is null and event_id is null
 order by effective_from desc
 limit 5;
```

**Expect:** the live AU row reads `platform_fee_percentage = 3.5` and
`platform_fee_fixed = 99`, with `effective_until` null.

**If it differs:** the live fee is correct and the `$2.03` in 4.1 is stale. Do
the arithmetic with the real values, `round(subtotal x pct / 100 + tickets x
fixed)`, and expect that instead. Do not change the database to match the
document.

### 4.1 Create the event

1. Sign in as the organiser who owns `Party Pty Ltd`.
2. Create a paid event with a single ticket tier at **$1.00**. Publish it.
3. Open its public page in a **private window**, not signed in.

**Verify before buying:** the page renders a ticket selector, and the all-in
total reads **$2.03**.

That looks wrong at a glance and it is right. The one fee is
`round(100 x 3.5 / 100 + 1 x 99)` = `round(3.5 + 99)` = **103 cents**, so the fee
on a $1 ticket is **$1.03** and the buyer pays **$2.03**. The flat 99c per ticket
dominates completely at this price. It is the worst-looking ratio the fee model
ever produces, which is exactly why a $1 ticket is a good test of it and a
terrible thing to screenshot.

**STOP IF** you see a second fee line, a "payment processing fee", or any total
other than $2.03. There is ONE fee. A second line means something shipped that
this branch removed.

### 4.2 Buy it

Buy one ticket with a real card.

**Verify, all four:**

1. You land on the order confirmation page.
2. The ticket email arrives, and it carries a QR code.
3. In **Stripe, Payments**: the payment reads **Succeeded**, the amount is
   **AUD 2.03**, and the statement descriptor is `ELINQS* PARTY PTY LTD`.
4. In the organiser dashboard: the order appears, and the event's remaining
   ticket count has gone down by one.

**STOP IF** the card is charged but no order appears, or an order appears with no
payment. A checkout that takes card details and settles nothing is the worst
outcome available, and it is the reason this step exists.

### 4.3 Refund it

Refund the payment from the Stripe dashboard.

**Verify:** the order shows as refunded in the organiser dashboard within a
minute or two, and the ticket is voided.

**Only when 4.1 to 4.3 have all passed is section 6 unlocked.**

---

## 4a. The purge, as executable steps

**Do not start this until section 4 passed.** Founder ruling: nothing on
production is deleted until the $1 purchase has succeeded, because the demo
catalogue is the thing you would need in order to diagnose a failure.

### 4a.0 The approval, and why every command below carries it

All three commands in this section write, or rehearse a write, against
production. They call `assertNotProductionDatabase()` as their first executable
statement, which **refuses a production target outright** and prints:

```
========================================================================
REFUSED BY THE PRODUCTION WRITE PREFLIGHT
========================================================================
```

That refusal happens before any client is constructed and before any socket
opens, so a refused run has changed nothing. It is not a fault to work around; it
is the control doing its job. The approval is per run, and you give it like this:

```powershell
$env:ALLOW_PRODUCTION_SUPABASE="1"
```

**Give it in the shell, never in the env file.** Putting the line in your
production env file would work through `--env-file` and would approve every run
from then on, silently, which is the exact failure the control exists to prevent.
The preflight now detects that case and refuses it by name, telling you which
file parked the approval, so the file route is closed rather than merely
discouraged.

**Clear it the moment this section is done:**

```powershell
Remove-Item Env:\ALLOW_PRODUCTION_SUPABASE
```

An approved shell that stays open is a shell in which the next command you
happen to run is also approved.

### 4a.1 Prove the orders are synthetic

```powershell
$env:ALLOW_PRODUCTION_SUPABASE="1"; node --env-file=<your production env file> scripts/verify/seeded-order-forensics.mjs
```

**Expect:** it ends `SAFE TO PURGE`.

**STOP IF** it prints `STOP`. It lists exactly which orders and why. Each has to
be explained individually first. It is read only and opens no transaction.

### 4a.2 Dry run, and READ THE ROW LIST

```powershell
$env:ALLOW_PRODUCTION_SUPABASE="1"; node --env-file=<your production env file> scripts/verify/seeded-purge-rehearsal.mjs
```

Without `--commit` this **always rolls back**. It prints:

- the organisations it matched, keyed on
  `owner_id = 00000000-0000-4000-8000-000000000001`, with their event and order
  counts,
- every table it would touch, before and after,
- a real-data fingerprint proving non-seeded rows are unchanged.

**Read the organisation list.** Every row should be demo content you recognise.

**Expect:** `RESULT: PASS`, `real data untouched: confirmed`, and
`tables whose count changed on disk: none`.

**STOP IF** you see a name you do not recognise as demo content, or
`ORPHANED:`, or `REAL DATA CHANGED:`.

**It refuses to run at all** if the owner marker ever matches `OANH` or
`Party Pty Ltd`. That refusal means the marker is wrong, not that the exclusion
should be relaxed.

### 4a.3 Commit it

The dry run printed a count of organisations. Pass that exact number back:

```powershell
$env:ALLOW_PRODUCTION_SUPABASE="1"; node --env-file=<your production env file> scripts/verify/seeded-purge-rehearsal.mjs --commit --confirm=<N>
```

`--commit` on its own is **refused**, and a wrong `--confirm` is refused, both
with exit 1 and nothing changed. The number cannot be supplied without having
read the dry run, which is the point.

**Expect:** `=== COMMITTED ===` and `RESULT: PASS`, preceded by the approval
banner naming the project this is about to write to. Read that banner. It is the
last thing between you and a real delete.

**Then clear the approval:**

```powershell
Remove-Item Env:\ALLOW_PRODUCTION_SUPABASE
```

### 4a.4 Verify afterwards, and expect the site to look thinner

```sql
select count(*) from public.events;
select count(*) from public.organisations;
select count(*) from public.share_links where event_id is null;
```

The third must be **unchanged**, not zero: pre-existing nulls are legitimate, and
a null count that GREW means a row was severed from its parent instead of removed.

Then in a browser: the homepage, `/events`, search and the category pages still
render. **Two things will look alarming and are correct:**

1. **Rails will thin out or vanish.** `RAIL_MIN = 3` hides any category rail with
   fewer than three events, and with none upcoming the homepage swaps in its
   "Events loading soon" state. That is the completeness bar telling you the
   truth: the catalogue is thin. Seed real events, never restore fixtures.
2. **`/events` additionally hides any event with no cover image**
   (`hasRealCover`), so a real event without artwork will not appear there even
   though the row exists.

### 4a.5 Delete the test organiser record

Last, by hand, once section 4 is complete and refunded: remove `Party Pty Ltd`,
its $1 event, and unwind its Stripe Connect account on the Stripe side. The purge
script deliberately leaves it, because it is not owned by the seed account and
because the $1 purchase lands on it.

**`OANH` is never deleted by anything.** It is a real person who signed up on
8 August and has listed nothing yet.

---

## 5. Apply the taxonomy migrations to production

**Prepared and proven on TEST.** Two files run, in version order:

| Order | File | What it does |
|---|---|---|
| 1 | `20260808000004_category_taxonomy_r1.sql` | renames `arts-culture` to `arts-community` (name "Arts & Community"), inserts the `comedy` category, files comedy-tagged events under it, merges the `arts-culture` tag into `arts-community` |
| 2 | `20260812000002_category_taxonomy_repair.sql` | the same rename, insert and backfill, every statement guarded. On production it runs second and is a near no-op |

**Nothing is orphaned, and here is why.** The rename is an `UPDATE` of the slug in
place, so the category row keeps its UUID, and events reference the category by
`category_id`, not by slug. No event changes category and none is left pointing
at a row that does not exist. Verified on TEST: **0 orphaned events**.

**The retired slug still resolves.** `arts-culture` is the only retired slug.
`CATEGORY_SLUG_ALIASES` in `src/lib/events/search-params.ts` maps it to
`arts-community`, and `resolveCategorySlug` applies that on `/events?category=`.
Proven in a browser against the preview, which runs on TEST where the migration
has already been applied:

| URL | Status | Events shown |
|---|---|---|
| `/events?category=arts-culture` (retired) | 200 | 16 |
| `/events?category=arts-community` (live) | 200 | 16 |
| `/events?category=comedy` (added) | 200 | 11 |
| `/events?category=not-a-real-category` | 200 | 0 |

The last row is the control: it shows the check can tell success from failure.
`/categories/arts-culture` is not affected because that route only ever served
seven legacy hero categories and never served this one.

### The steps

> **STEP 3 BELOW IS ALREADY DONE IF YOU FOLLOWED SECTION 3.**
>
> `supabase db push` applies EVERY pending version in one go, so step 3.6 has
> already applied both files above along with the other nine. Running the push
> again is a harmless no-op that reports nothing pending.
>
> **Coming from section 3: skip to step 6 and do the verification only.** The
> verification is the part that still matters, and it matters more than usual,
> because it is what proves the two files landed in the right order.
>
> Steps 1 to 5 are kept for the case where this section is run on its own.

1. Open PowerShell in `C:\Users\61416\OneDrive\Desktop\EventLinqs\el-moat`.
2. Confirm the Supabase CLI target is **production** and that you intend that.
   **This worktree is not linked to any project**, so `--linked` alone resolves
   nothing here. Point the command at a checkout that is linked, and read back
   which project answers:

   ```powershell
   supabase migration list --linked --workdir "C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-hardening"
   ```

3. Run:

   ```powershell
   supabase db push --linked --workdir "C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app-hardening"
   ```

4. **What you see if it works:** the CLI lists the two migration versions above as
   applied and exits 0. Applying takes seconds; there is no long-running step.
5. **What you see if it fails:** a non-zero exit with a Postgres error naming a
   constraint. The most likely is a UNIQUE violation on `event_categories.slug`,
   which means a row already exists. Both files are guarded with
   `WHERE NOT EXISTS`, so this should not happen; if it does, **stop** and do not
   re-run.
6. **Verify in SQL:**

   ```sql
   select slug, name from public.event_categories
    where slug in ('arts-culture','arts-community','comedy');
   ```

   Expect `arts-community` and `comedy`, and **no `arts-culture` row**.

   ```sql
   select count(*) from public.event_categories where name ilike '%cultur%';
   ```

   Expect **0**.
7. **Verify in a browser** on `https://www.eventlinqs.com.au`:
   - `/events?category=comedy` shows events rather than an empty page.
   - `/events?category=arts-community` shows events.
   - `/events?category=arts-culture` still shows the **same** events as
     `arts-community`. This is the shared-link and printed-QR case.
   - No page anywhere renders the banned word in a filter chip or a card.

### Rolling it back

The migrations delete nothing, so a rollback is a rename in the other direction.
Only do this if something is visibly wrong:

```sql
update public.event_categories set slug = 'arts-culture', name = 'Arts & Culture'
 where slug = 'arts-community';
```

Leave the `comedy` row in place: removing it would orphan the 28 events filed
under it, which is worse than the tile existing.

---

## 5a. MIGRATION AND DEPLOY ORDER, and why this one is not negotiable

**Founder ruling, 15 August 2026. This is a production safety rule, not a
preference. Getting the order wrong takes the live site off sale silently.**

### What the hazard is

Migration `20260808000010_rls_column_privilege_lockdown.sql` REVOKES
`stripe_account_id` and `stripe_charges_enabled` on `organisations` from the
`anon` role. That is correct and it stays.

Production's event page **on `main` today** reads those two columns through an
`anon` embed and hands them to the sale gate. The moment the migration is applied
to a database whose deployed code still does that, both fields read `undefined`
for every organiser, the gate returns false platform-wide, and **every paid event
on the live site stops selling**.

It does not error. It does not alert. It renders "This organiser is still
finishing their payment setup. Check back soon.", which is a real, designed state
that an organiser who genuinely has not onboarded also sees. That is precisely
why it went unnoticed on the preview for weeks.

### The order

1. **DEPLOY THE CODE FIRST.** `integration/launch` carries the fix: the event
   page reads the two columns with the service role and collapses them to a
   boolean, so it does not depend on the anon grant at all.
   **Verify before going further:** open any paid event on the deployed target
   and confirm a ticket selector renders and the words "finishing their payment
   setup" do NOT appear. If they do, stop. The fix is not live.
2. **THEN APPLY THE MIGRATION**, with `supabase db push --linked` in PowerShell,
   never the Dashboard editor and never the MCP.
   **Verify:** re-open the same event page. It must still sell. If it now shows
   the payment-setup message, the code deployed in step 1 was not the fixed code.
3. **CONFIRM THE REVOKE ACTUALLY LANDED**, otherwise step 2 passed for the wrong
   reason. As `anon`, selecting `stripe_account_id` from `organisations` must be
   refused. If it still succeeds, the migration did not apply and the column is
   still public.

### What success looks like

A paid event page that renders a ticket selector, AND an `anon` role that cannot
read `stripe_account_id`. Both, not either.

### What failure looks like, and the rollback

**Failure is the payment-setup message appearing on an event whose organiser is
fully onboarded.**

Rollback, in the order to try it:

1. **Redeploy the previous good build** from the Vercel dashboard. This is the
   fastest lever and it is the right one if step 1 was the problem, because the
   migration is harmless while the old code is not yet live.
2. **If the migration is already applied and the code cannot be rolled forward,
   restore the grant.** Write a new migration that re-grants the two columns to
   `anon`, and apply it. **Do not edit or delete `20260808000010`.** History
   rewriting is banned here and a migration that has been applied must be
   corrected by a new one, never by editing the old one.
3. `git revert` is available for the code and is the sanctioned way to undo a
   commit. `git reset`, `--amend`, and force-pushing are banned. The exact form
   depends on which merge button was used and is written out in step 3.8; in
   short, `git revert <sha>` after a squash merge and `git revert -m 1 <sha>`
   after a true merge commit.

### What stops this being a written procedure nobody follows

`scripts/guards/migration-needs-sale-gate-fix.mjs`, registered in the guard
runner and therefore blocking on `prebuild`. If the revoking migration is present
in the tree, the guard requires the fix to be present too: the event page must
not pass the anon embed into `isOrganiserSellable`, and it must read the posture
with a privileged client. Either half missing fails the build.

**What the guard cannot see, stated plainly:** it reads the working tree. It
cannot tell you what is deployed, nor which migrations have been applied to any
database. A tree that passes can still be pushed at a project whose live code is
older. Steps 1 to 3 above are the part only a person can do.

---

## 6. Remove the seeded events from production

> ## WITHDRAWN 15 AUGUST 2026. THE BANNER BELOW IS WRONG AND IS KEPT ONLY SO THE
> ## CORRECTION HAS SOMETHING TO POINT AT.
>
> **The purge IS a launch step. Run section 4a.** The block quote that follows
> said "there is nothing to do here" on the strength of `is_seed_data = true`
> returning zero rows on production. That zero means nothing: `false` is the
> column default and the backfill that would have set it `true` only ever ran on
> TEST, so a marker-keyed count finds nothing while sixteen demo organisations
> sit there unmarked. The correction directly beneath the quote has the real
> identification method, keyed on `owner_id`.
>
> This was left standing for one session with the correction underneath it, which
> is the worst of both: a reader who stops at the heading skips the purge
> entirely, and the heading is in larger type than the thing that disproves it.

> ## SUPERSEDED, DO NOT ACT ON THIS: MEASURED 15 AUGUST 2026, THERE IS NOTHING TO DO HERE.
>
> Production was read, read only, with exact server-side counts:
>
> | | |
> |---|---|
> | events total | **48** |
> | `is_seed_data = true` | **0** |
> | `is_seed_data = false` | 48 |
> | `is_seed_data IS NULL` | 0 |
> | organisations owning only seeded events | **0** |
> | venues referenced only by seeded events | **0** |
>
> **Production carries no seeded data at all.** An earlier draft of this section
> said "Expect 32". That figure was never verified against production and it is
> wrong. The seeded catalogue lives on TEST only.
>
> So section 6 is **NOT a launch step**. Run step 1 below if you ever seed
> production, and otherwise skip the whole section. The scripts and the procedure
> are kept because they are correct, rehearsed, and the gate that proves the
> above is step 1 itself.
>
> The orphaned-organisation problem described in section 6a is likewise a TEST
> finding only. On production exactly **one** organisation has zero events
> (`oanh`), it holds no Stripe account, and it is not seeded data.
>
> One incidental read worth recording: production has **1 order**, `pending`,
> with its payment `initiated`, **no payment intent, no ticket**. That is an
> abandoned checkout from 28 May 2026, not a defect. No money moved and no ticket
> is owed.

### CORRECTION, 15 August 2026: the marker is not the identification method

**`is_seed_data = false` on all 48 production rows does NOT mean production has
no demo content.** `false` is the column DEFAULT
(`20260628000001_events_is_seed_data.sql`), and the backfill that set it `true`
ran against TEST only. So a marker-keyed purge finds nothing on production while
demo content sits there unmarked. Reading the zero as "there is nothing to clean"
is the same silent fail-open this branch has been closing all week: the query
answered a narrower question than the one asked.

**WHAT `Party Pty Ltd` IS, corrected by the founder 15 August 2026.** It is
**NOT a company and NOT EventLinqs' legal entity.** It is a **test organiser
record the founder created on the platform with a made-up name**, so that a real
card could be put through a $1 checkout. It holds a Stripe CONNECTED account, and
**it is deleted after the $1 purchase passes.** Every earlier description of it in
this runbook and in the findings log as "the one real organisation", a company, or
a legal entity was wrong, and those lines are corrected below. Treat it as the
founder's test fixture with a live Connect account attached.

**What the 48 actually are, read 15 August 2026, read only.** 18 organisations,
of which **17 hold no Stripe Connect account at all** and one, `Party Pty Ltd`
(the founder's test organiser record, see above),
holds `acct_1SFaa2E8...` with charges enabled. The events cluster on
`created_at = 2026-04-25` under organisation names that are plainly demo content:
Owambe Sydney, Afrobeats Melbourne, Gospel Brisbane, Amapiano Adelaide, Lagos
Comedy Tour, Caribbean Carnival Melbourne, Island Vibes Sydney, Bollywood Nights
Sydney, Diwali Festival Melbourne, Filipino Fiesta Brisbane, Lunar Nights
Melbourne, Latin Sabor Sydney, Sydney Pride Collective, Polonia Australia Events,
Mahrajan Sydney, Pasifika Collective.

**THE CORRECTED IDENTIFICATION METHOD**, to be used after the $1 purchase and not
before:

1. **Never key on `is_seed_data` alone on production.** It is unset there.
2. **Key on the OWNER, not on the Connect account.** The demo catalogue belongs
   to one synthetic seed account, `00000000-0000-4000-8000-000000000001`. Select
   by that `owner_id`. Keying on "has no Connect account" is close but WRONG: it
   would also catch `OANH`, a real signup with no events, and delete a real
   person's organisation. See the owner table below.
3. **Corroborate with the creation date.** The demo cohort shares
   `created_at::date = 2026-04-25`. Use it to confirm the set, never alone to
   define it.
4. **Exclude anything with an order carrying a real payment.** Run
   `scripts/verify/seeded-order-forensics.mjs` against production first; it must
   print SAFE TO PURGE. Production currently holds exactly one order, and it is
   an abandoned `pending` with no payment intent.
5. **Exclude `Party Pty Ltd` from the purge, then delete it separately.** It is
   the founder's TEST ORGANISER RECORD, not a company and not EventLinqs' legal
   entity. It is where the $1 purchase lands, so it must survive the seeded purge;
   once the $1 purchase has passed and been refunded it is **deleted on its own**,
   together with its test event and its Connect account, which is a Stripe-side
   job (section 8.4). It is excluded from the purge because it is not owned by the
   seed account, not because it is a real business.

### THE DECISIVE MARKER IS THE OWNER, not the date. Verified 15 August 2026.

A correction to an earlier draft of this section, and to the founder report that
went with it. That draft said the demo cohort could be identified by
`created_at::date = 2026-04-25`. **It cannot.** Seven of the organisations have
events created on 9 and 14 May as well, so a date test flags them as real when
they are not.

**Production has exactly THREE organisation owners.** Read only, 15 August 2026:

| Owner | Account | Organisations | With a Connect account |
|---|---|---|---|
| `00000000-0000-4000-8000-000000000001` | `s***@eventlinqs.app`, created 2026-04-25 | **16** | **0** |
| `3b753251-...` | the founder's own account | 1 (`Party Pty Ltd`, the founder's TEST organiser record, deleted after the $1 purchase) | **1** |
| `5758a4b1-...` | `w***@icloud.com`, created 2026-08-08 | 1 (`OANH`) | 0 |

The first is a **single synthetic seed account**: an all-zeros UUID on an
`eventlinqs.app` address, created the day the demo catalogue was written, owning
sixteen organisations and holding no Connect account anywhere. **Those sixteen
are the demo cohort.** Identify them by `owner_id`, not by date and not by name.

**THERE IS NO REAL ORGANISER BLOCKED ON ONBOARDING.** Every organisation without
a Connect account except one belongs to that seed owner, and the exception has no
events.

**`OANH` IS A REAL PERSON AND MUST NOT BE PURGED.** It is owned by a genuine
`icloud.com` signup from 8 August 2026 with no events and no Connect account.
Nothing of theirs is blocked from selling, because they have listed nothing, but
they are a real user. **Any purge keyed on "no Connect account" would delete
them, which is exactly why the marker is the OWNER ID and not the Connect
status.**

**NOTHING ON PRODUCTION IS DELETED UNTIL THE $1 PURCHASE SUCCEEDS.** Founder
ruling, 15 August 2026. The purchase is the proof that the money path works end
to end on the live platform; deleting demo content before that removes the very
catalogue that might be needed to diagnose a failure.

**Status: REPORT ONLY. Nothing on production was modified, and no purge of
production has been written or run.**

**Rehearsed end to end on TEST, 14 August 2026, and it passed.** Two scripts do
the work. You do not write SQL by hand and you do not delete anything the
forensic check has not first cleared.

| | |
|---|---|
| Read-only check | `scripts/verify/seeded-order-forensics.mjs` |
| The purge | `scripts/verify/seeded-purge-rehearsal.mjs` |
| Rehearsal result on TEST | 299 events, 60 orders and every dependent removed; real data unchanged; rolled back cleanly |

### What is being removed, and how it is identified

`events.is_seed_data` is a boolean added by migration
`20260628000001_events_is_seed_data.sql`, defaulting to `false`. Only seeder
scripts ever set it `true`. The application in `src/` READS it and never writes
it, so a real organiser's event cannot acquire the mark. The identification is a
fixture marker, not a title match.

### THE RULING: removed completely, never hidden

Setting order-bearing seeded events to draft and private was proposed and is
**rejected**. It is not an option and must not be reintroduced. A hidden row is
still in the live database, still joins to payouts and ledgers, still appears in
any query that forgets the filter, and still has to be explained to whoever
audits the books. Not visible is not the same as not there. Worse, hiding the
parent leaves the ten `ON DELETE SET NULL` children alive and pointing at
nothing, which on TEST was 1737 share_links, 100 ledger rows, 42 payout_holds and
12 payouts of seeded financial debris.

**Why deletion is correct here specifically**, rather than as a general rule:

- Every order behind a seeded event carries a **fixture identity**, proved per
  order rather than in aggregate. On TEST all 60 were an RFC 2606 reserved
  address, a domain we own, a public throwaway inbox, or no address at all. RFC
  2606 reserves `example.com` and the `.test`, `.example`, `.invalid` and
  `.localhost` names precisely so they cannot belong to a real person
  (https://www.rfc-editor.org/rfc/rfc2606, fetched 14 August 2026).
- The Stripe payment intents and refund objects on them are **real Stripe
  objects created with a test-mode key**, so no money moved and no card was
  charged. Stripe states that objects in a sandbox "aren't usable in live mode"
  and that sandboxes "simulate creating real objects without affecting actual
  transactions or moving real money"
  (https://docs.stripe.com/testing-use-cases, fetched 14 August 2026).
- Stripe publishes a first-class **"Delete test data"** facility and destroys
  sandbox subscription data itself after 120 days while exempting live mode
  (same URL, and
  https://support.stripe.com/questions/test-mode-subscription-data-retention,
  both fetched 14 August 2026). A payments processor treating synthetic data as
  disposable is the closest thing to an industry position that exists.
- Adobe Commerce is the one platform found that publishes a hard rule: "If you
  use sample data in Staging or Production, then you must remove the information
  and products before going live"
  (https://experienceleague.adobe.com/en/docs/commerce-on-cloud/user-guide/develop/test/sample-data,
  fetched 14 August 2026).
- The Australian retention duty attaches to "transactions and other acts engaged
  in by the person" (Income Tax Assessment Act 1936 s 262A(1), verbatim,
  https://www.ato.gov.au/law/view/document?docid=PAC/19360027/262A, fetched
  14 August 2026), with a five year period under s 262A(4); the Corporations Act
  2001 s 286 binds records of "its transactions" for seven years. Both are
  defined by reference to transactions the business actually engaged in.
  **Whether either duty reaches synthetic rows is UNSOURCED:** neither the ATO
  nor ASIC publishes anything on test, seeded or fictitious data, and that
  question is deliberately not argued either way here.

**The decision does not depend on resolving that legal question**, which is why
it is safe to act on. Step 1 below deletes nothing unless the forensic check has
already proved every affected order is synthetic. Anything that could be a record
of a real transaction is never reached by this procedure.

### The steps

**Step 1. Prove production looks like TEST. This gate is not optional.**

Everything above is a finding about TEST. Production cannot be read from the
development machine, and a seeded event that somebody bought a real ticket for
under LIVE keys would carry a real payment.

```
node --env-file=<your production env file> scripts/verify/seeded-order-forensics.mjs
```

It is read only: it opens no transaction and issues no write.

It prints one line per order and then a verdict. **Proceed only if the verdict
reads `SAFE TO PURGE`.** It reads that only when all three hold: no order carries
an email domain outside the known fixture set, the Stripe key mode is readable,
and no order carries a payment intent created with LIVE keys.

If it prints `STOP`, it lists exactly which orders and why. Do not purge. Each
one has to be explained individually first.

Note the check the script makes and why it cannot be shortcut: **a test-mode
Stripe id and a live one both begin `pi_`.** There is no prefix or checksum that
separates them, so the mode is read from the API key, not from the id. That is
the whole reason this must run against production rather than be inferred from
the TEST result.

**Step 2. Rehearse against production, with the rollback still in place.**

```
node --env-file=<your production env file> scripts/verify/seeded-purge-rehearsal.mjs
```

Without `--commit` this **always rolls back**. It performs every delete inside
one transaction, asserts the result, prints the before and after row counts for
every table it can touch, and then undoes all of it. Nothing is written.

Read the output. It ends with `RESULT: PASS` or `RESULT: FAIL`.

**Step 3. Commit it.**

```
node --env-file=<your production env file> scripts/verify/seeded-purge-rehearsal.mjs --commit
```

Same run, but it commits when every assertion passed. If any assertion fails it
rolls back regardless of the flag.

### What success looks like

- Step 1 ends `SAFE TO PURGE`.
- Steps 2 and 3 end `RESULT: PASS`.
- `seeded events remaining: 0 (must be 0)`.
- `real data untouched: confirmed`. This is the assertion that matters most: the
  script counts non-seeded events, their orders and their tickets before and
  after, and fails if any of the three moved. "The seeded rows are gone" does not
  prove a real row did not go with them, so it is checked separately.
- No line reading `ORPHANED BY THIS PURGE`. Null foreign keys that existed
  beforehand are reported as `unchanged and pre-existing` and are fine; a null
  count that GREW is a row severed from its parent instead of removed, and fails
  the run.
- After step 2 only: `tables whose count changed on disk: none`, proving the
  rollback was complete.

### What failure looks like

- **`STOP` at step 1.** An order does not read as synthetic. Stop entirely.
- **A foreign key error naming a table.** A dependency exists that this
  procedure predates. The transaction rolls back on its own and nothing is lost.
  The script derives the dependency graph from the live schema on every run
  rather than from a hardcoded list, so this should not happen; if it does, the
  table needs adding in the right position and the rehearsal repeating.
- **`REAL DATA CHANGED: ...`** in the failures. The purge would have taken a real
  row. It rolls back. Do not retry until the cause is understood.
- **`ORPHANED: <table>.<column> gained N null row(s)`.** A SET NULL child was not
  removed before its parent. Rolls back.

### How you verify afterwards

```sql
select count(*) from public.events where is_seed_data = true;   -- expect 0
select count(*) from public.events;                             -- expect only your real events
```

Then in a browser: the homepage rails, `/events`, search, the category pages and
the organiser pages still render real events. Section 6a below records which
surfaces were confirmed from the code to read the database rather than a fixture.

### Reference: the same procedure as SQL

You do not need this to run the procedure above, and running the scripts is
preferred because they assert their own result. It is recorded so the sequence is
reviewable without reading JavaScript, and so the dependency order is written
down somewhere a database person can check it.

1. **Count first, and write the number down:**

   ```sql
   select count(*) from public.events where is_seed_data = true;
   ```

   The TEST figure was 299. **The production figure is whatever this returns;
   no number is asserted for it here, because nobody has read production.**

2. **Look at what you are about to delete:**

   ```sql
   select id, slug, title, status, venue_city
     from public.events where is_seed_data = true order by title;
   ```

   Read the list. Every row should be a demo event you recognise as seeded. If
   you see anything that looks like a real organiser's event, stop.

3. **Find out how many have taken an order.** On TEST this was 60, not 0,
   because the demo catalogue was bought against during testing. That is normal
   and it does not change the procedure: those orders are removed too, in the
   order below, after the forensic check has cleared them.

   ```sql
   select count(*) from public.orders o
     join public.events e on e.id = o.event_id
    where e.is_seed_data = true;
   ```

4. **Run the purge as ONE transaction.** Order matters and is not negotiable:
   three tables hold `ON DELETE RESTRICT` on orders, orders holds one on events,
   ten hold `ON DELETE SET NULL` on events and four more hold it on orders.
   Deleting the parent first is simply refused; deleting it without the SET NULL
   children leaves them alive pointing at nothing. Both were observed on TEST.

   The four ORDER-side SET NULL children are the ones most easily missed, and an
   earlier version of this procedure missed all four. On TEST that would have
   orphaned 5 `share_link_events` rows.

   ```sql
   begin;

   create temporary table seeded_ids on commit drop as
     select id from public.events where is_seed_data = true;

   -- The ORDER-side SET NULL children FIRST. An earlier version of this
   -- procedure omitted all four; on TEST that orphaned 5 share_link_events.
   create temporary table seeded_order_ids on commit drop as
     select o.id from public.orders o where o.event_id in (select id from seeded_ids);
   delete from public.share_link_events           where order_id in (select id from seeded_order_ids);
   delete from public.organiser_marketing_consents where order_id in (select id from seeded_order_ids);
   delete from public.squad_members               where order_id in (select id from seeded_order_ids);
   delete from public.venue_share_ledger          where order_id in (select id from seeded_order_ids);

   -- The EVENT-side SET NULL children, removed explicitly so nothing is orphaned.
   delete from public.share_links                 where event_id in (select id from seeded_ids);
   delete from public.payouts                     where event_id in (select id from seeded_ids);
   delete from public.payout_holds                where event_id in (select id from seeded_ids);
   delete from public.organiser_balance_ledger    where event_id in (select id from seeded_ids);
   delete from public.venue_payouts               where event_id in (select id from seeded_ids);
   delete from public.venue_share_ledger          where event_id in (select id from seeded_ids);
   delete from public.booking_requests            where event_id in (select id from seeded_ids);
   delete from public.gigs                        where event_id in (select id from seeded_ids);
   delete from public.organiser_marketing_consents where event_id in (select id from seeded_ids);

   -- The RESTRICT children of orders. refund_tickets cascades from refunds.
   delete from public.refunds r using public.orders o
     where r.order_id = o.id and o.event_id in (select id from seeded_ids);
   delete from public.payments p using public.orders o
     where p.order_id = o.id and o.event_id in (select id from seeded_ids);
   delete from public.community_contributions
     where order_id in (select id from public.orders where event_id in (select id from seeded_ids))
        or event_id in (select id from seeded_ids);

   -- The orders, then the events. Seventeen CASCADE tables follow automatically.
   delete from public.orders where event_id in (select id from seeded_ids);
   delete from public.events where is_seed_data = true;

   select count(*) as must_be_zero from public.events where is_seed_data = true;
   ```

   **Read that count before you commit.** If it is 0, `commit;`. If it is
   anything else, `rollback;` and stop.

5. **What you see if it works:** each `delete` reports a row count, the final
   select reports **0**, and `commit` succeeds. The measured TEST shape was:
   5 share_link_events, 1737 share_links, 100 ledger rows, 42 payout_holds,
   12 payouts, 1 booking request, 1 gig, 7 refunds, 38 payments, 60 orders,
   then 299 events.

   **What you see if it fails:** a foreign key error naming a table not in the
   list above. That means a new dependency exists that this procedure predates.
   `rollback;` immediately, nothing will have been lost, and add that table to
   the sequence in the right position before trying again. The scripts derive the
   list from the live schema on every run, so they do not have this failure mode;
   this hand-written SQL does, which is the reason the scripts are preferred.

6. **Verify, after committing:**

   ```sql
   select count(*) from public.events where is_seed_data = true;   -- expect 0
   select count(*) from public.events;                             -- expect your
   -- step 1 total minus the number of seeded events deleted, and nothing else
   select count(*) from public.share_links where event_id is null; -- expect the
   -- same number as before you started, not a larger one
   ```

   The third query is the one that proves nothing was orphaned: the number must
   be UNCHANGED, not zero. Pre-existing nulls are legitimate; a null count that
   grew means a row was severed from its parent rather than removed.

**Status: rehearsed.** This procedure was run end to end against TEST on
14 August 2026 and passed, with the counts above and with the non-seeded events,
orders and tickets proved unchanged. It has NOT been run against production, and
step 1 of the script procedure is the gate that decides whether it ever should
be.

---

## 6a. What the public surfaces show afterwards, confirmed from the code

Checked by reading the fetchers, not by assuming. Two questions were asked of
each surface: does it read the database or a FIXTURE, and does it filter
`is_seed_data`.

**The fixture question is the dangerous one, and it is CLEARED.**
`HOMEPAGE_SEED_FIXTURE` is real. It is read by exactly two surfaces, the homepage
rails (`src/lib/events/home-queries.ts:93`) and `/events/[slug]`
(`src/app/events/[slug]/page.tsx:111`). It cannot be on in production, behind
four independent barriers:

1. `src/lib/dev/fixture-events.ts:24` requires `VERCEL_ENV !== 'production'` at
   runtime.
2. `scripts/prebuild-fixture.mjs:22` hard-aborts the build if the flag is `1`
   while `VERCEL_ENV === 'production'`.
3. The fixture file `src/lib/dev/home-seed-fixture.json` is gitignored and
   untracked, so it is not in a production build at all.
4. `src/lib/env/manifest.mjs:1007` declares it `forbiddenOn: ['production']`,
   which the health sentinel treats as always-blocking.

Nothing in `.github/` or `vercel.json` sets it. **The homepage cannot render
fabricated events over a purged production database.**

| Surface | Fetcher | Verdict |
|---|---|---|
| Homepage rails | `loadHomeUpcoming`, `src/lib/events/home-queries.ts:88` | Only real events. Reads the DB, filters `status=published` and `visibility=public` only |
| `/events` | `fetchPublicEventsCached` / `fetchPublicEvents`, `src/lib/events/fetchers.ts:790` and `:626` | Only real events |
| Search | same fetchers via `?q=`, ops from `src/lib/events/search-query.ts` | Only real events |
| Sitemap | `src/app/sitemap.ts:186` | Only real events. Seeded URLs stop being advertised the moment they are deleted |
| Category pages | `src/app/categories/[slug]/page.tsx:78` | Only real events; falls to the shared `CategoryHeroEmpty` state |
| Organiser pages | `fetchOrganiserEvents`, `src/app/organisers/[handle]/page.tsx:68` | Only real events, but see the warning below |

**`is_seed_data` has exactly ONE consumer in application code:**
`src/lib/broadcast/digest.ts:240` filters seeded rows **OUT** of the weekly city
digest. Its behaviour is byte-identical after the purge. **Nothing anywhere in
`src/` filters seeded rows IN**, so nothing breaks.

### Two things to expect, neither of them a defect in the purge

1. **Rails will go empty or thin, and some will vanish.** `RAIL_MIN = 3`
   (`src/app/page.tsx:114`) makes any category rail with fewer than three real
   events hide itself entirely. With zero upcoming events the homepage swaps in
   the "Events loading soon" state. That is correct behaviour, and it is the
   market-ready completeness bar telling you the truth: the catalogue is thin.
   Seed real events before launch, do not restore fixtures to hide it.
2. **`/events` additionally drops any event failing `hasRealCover`**
   (`src/lib/events/fetchers.ts:741`). A real event with no cover image will not
   appear there even though the row exists.

### THE ONE REAL GAP: orphaned organisations and venues

**The purge removes events. It does NOT remove the organisations and venues the
seeder created.** On TEST that leaves **33 organisations** and **13 venues** with
zero events, all `status = 'active'`. Both are read independently of `events`:
`src/app/sitemap.ts:217` and `:239` list them, and
`src/app/organisers/[handle]/page.tsx:57` serves a live profile page for each.
The result is an indexed page with nothing on it.

**They are deliberately not deleted, and the reason is measured, not cautious.**
On TEST, **31 of those 33 organisations hold a `stripe_account_id` with
`stripe_charges_enabled` true**, and all 33 have an `owner_id` pointing at a real
user. Deleting the row does **not** delete the Stripe Connect account: it orphans
a live connected account from the only record that names it. That is worse than
an empty page, and unwinding a Connect account is a deliberate Stripe-side job,
not a side effect of a database delete.

The purge script counts and prints both figures on every run, so this is visible
rather than discovered later. Recorded in `docs/roast/POST-LAUNCH-FINDINGS.md`.

---

## 7. Prove money moves, with a real card, a SECOND time

See section 4 above, which is the same procedure.

**CORRECTED 15 AUGUST 2026.** This section used to read "do it after sections 5
and 6", which contradicted the founder ruling recorded in section 4 and section
4a: **the $1 purchase comes FIRST and gates the purge**, because the demo
catalogue is what you would need in order to diagnose a failed checkout, and
deleting it first throws away the evidence.

The order is: section 4 (buy, verify, refund), then 4a (purge), then this section
as a **repeat** of section 4 on the purged platform, so the thing you finally
test is the thing you launch. Two purchases, not one, and the first is the gate.

Skip the repeat only if 4a made no changes at all.

---

## 8. THE 20 AUGUST DEPLOY, AS A RUN SHEET

Written 20 August 2026 from `integration/launch`. **Self-contained on purpose:**
every command, every URL, the rollback and the diagnostic are inline, so you
never have to leave this section or search for anything mid-deploy.

**Scope.** This section covers ONE deploy: merging `integration/launch` to `main`
and applying the NINE migrations pending on production. It supersedes section 3
for this particular run, because the pending set is different now (nine, not
eleven) and because two of them can refuse an organiser publish if applied
against the old code.

**The count changed from eight to nine on 21 August.** The ninth,
20260821000001, records two columns found on production that no migration ever
created. It is idempotent, so it is a no-op against a production that already
has them. See 8.5a.

**The ordering rule that governs everything below.** The CODE must be live before
the MIGRATIONS are applied. `20260819000002` revokes `SELECT` on
`public.organisations` from `anon` and `authenticated`, and the old code read
five revoked columns on the session client. Apply the migrations first and every
create, update and publish of a paid event is refused with "Organisation not
found." Deploy first and nothing breaks, because the new code reads those columns
with the service role behind an ownership check. Steps 8.1 to 8.5 exist to make
that order impossible to get wrong.

### 8.0 Before you start: what must be true

| # | Check | Command | PASS | FAIL |
|---|---|---|---|---|
| 8.0.1 | You are on the right branch | `git -C C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat rev-parse --abbrev-ref HEAD` | prints `integration/launch` | anything else: stop, you are in the wrong worktree |
| 8.0.2 | Nothing uncommitted | `git -C C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat status --porcelain` | prints NOTHING | any line: commit or set it aside first |
| 8.0.3 | Local and remote agree | `git -C C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat rev-parse HEAD && git -C C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat ls-remote origin integration/launch` | the two SHAs match | they differ: push first |

### 8.1 Squash merge on GitHub

1. Open <https://github.com/eventlinqs/eventlinqs-app/pulls> and open the PR for
   `integration/launch` into `main`. If none exists, create it:
   base `main`, compare `integration/launch`.
2. Wait for checks. **PASS:** the CI check is green. **FAIL:** anything red, stop
   and read it; do not use admin merge, do not tick "merge without waiting".
3. The green button has a dropdown. It **must read "Squash and merge"**. If it
   reads "Merge pull request" or "Rebase and merge", open the dropdown and change
   it to "Squash and merge" before pressing.
   - **Why it matters:** this repository is squash-only. A merge commit here
     produces a history `main` has not seen before and makes the next merge back
     into `integration/launch` conflict on every file, exactly as it did on
     20 August.
4. Press it, then press "Confirm squash and merge".

**Expected side effect, do NOT try to fix it.** GitHub composes a squash message
by concatenating the squashed commits' messages, so the new commit on `main` will
carry `Co-Authored-By` trailers. That is the known Law 8 debt. It is recorded in
`docs/roast/LAW8-DEBT.md` and the guard defers `86bb285b` and `36179dc1` by name.
The NEW squash commit is not yet in that list, so if you later merge `main` back
into `integration/launch`, the Law 8 guard will fail on it. The fix then is to add
that SHA to `INHERITED_DEFERRED` in `scripts/guards/no-ai-authorship.mjs`, exactly
as the two before it. Do not rewrite history; that is still not authorised.

### 8.2 Capture the new SHA on main

```
git -C C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat fetch origin main
git -C C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat log -1 --format="%H %s" origin/main
```

Write the full 40-character SHA down. Every step below refers to it as **NEW_SHA**.

- **PASS:** the subject line is your PR title and the SHA differs from `36179dc1`.
- **FAIL:** it still says `Integration/launch (#118)` or the SHA is `36179dc1` --
  the merge did not land. Go back to 8.1.

### 8.3 Confirm production deployed that exact SHA

1. Open <https://vercel.com/eventlinqs/eventlinqs-app/deployments>.
2. Find the newest deployment whose Environment is **Production**.
3. Check three things on it:
   - Status is **Ready** (not Building, not Error, not Queued).
   - The commit SHA shown matches **NEW_SHA** (first 7 characters is enough).
   - Its domain includes `www.eventlinqs.com.au`.

- **PASS:** all three true.
- **FAIL, status Error:** open Building logs, read the first error. Do not apply
  any migration; production is still running the old code.
- **FAIL, SHA does not match:** a later commit or a different branch deployed.
  Do not proceed. Promote the correct deployment, or push again, then re-check.
- **FAIL, still Building:** wait. Do not start 8.5 during a build.

### 8.4 BEFORE the migration: prove the new code is actually serving

This is the step that makes the ordering rule real rather than a hope.

**URL to open:**
<https://www.eventlinqs.com.au/events/payment-verification-test-3c1p9f>

This is a real paid event on production: "Payment Verification Test", organiser
Party Pty Ltd, starts 31 August 2026, 10 tickets in stock. It is one of only two
paid events on production whose organiser passes all five sale-gate fields, which
is why it is the page named here rather than a demo event that legitimately
cannot sell.

**What you must see:** the page loads, and the ticket area shows **"Get tickets"**.

- **PASS:** "Get tickets" is visible.
- **FAIL:** you see "still finishing their payment setup", or the page 404s or
  500s. STOP. Do not apply the migrations. The deploy is not healthy and the
  migrations will make diagnosis harder.

Command-line equivalent, if you prefer it:

```
curl -s -L https://www.eventlinqs.com.au/events/payment-verification-test-3c1p9f | Select-String -Pattern "Get tickets"
```

- **PASS:** one match printed. **FAIL:** no output.

### 8.5 Confirm the pending list is exactly the eight you expect

**RUN IT FROM `el-moat`, AND FROM NOWHERE ELSE.** `db push` applies the migration
files it finds in the working directory, and decides what is pending by diffing
them against the remote ledger. Both halves are per-checkout, so the wrong
directory fails in the two worst ways available:

| Checkout | Linked project | Has the 8 files | What `db push` would do |
|---|---|---|---|
| `el-moat` | `gndnldyfudbytbboxesk` PRODUCTION | 8 of 8 | **correct** |
| `eventlinqs-app-hardening` | `gndnldyfudbytbboxesk` PRODUCTION | **0 of 8** | finds nothing to push and reports success. A SILENT NO-OP that reads as a completed migration |
| `eventlinqs-app` | `vkapkibzokmfaxqogypq` **TEST** | 8 of 8 | pushes to TEST, where all eight are already applied and recorded, so it also reports success having done nothing to production |

Measured 20 August 2026. Earlier sections of this runbook send you to
`eventlinqs-app-hardening`; for THIS deploy that is wrong, because that checkout
sits on `feat/hardening-phase2-5-vercel-sydney-preview-supabase` and predates
every one of these eight files.

Confirm the directory before you trust it:

```
cd C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat
cat supabase/.temp/project-ref
git rev-parse --abbrev-ref HEAD
```

- **PASS:** prints `gndnldyfudbytbboxesk` and `integration/launch`.
- **FAIL:** prints `vkapkibzokmfaxqogypq` -- that is TEST. Stop; you are about to
  migrate the wrong database.

Then the dry run, from that same directory:

```
supabase db push --linked --dry-run
```

**PASS:** it prints `DRY RUN: migrations will *not* be pushed to the database.`,
then `Would push these migrations:` followed by exactly **9** bulleted names, then
`Finished supabase db push.` The eight are exactly these (verified by running this
dry run against production on 20 August 2026, which returned this list and nothing
else):

```
20260818000001_column_lockdown_stage1_no_policy_dependency.sql
20260819000001_policy_refactor_no_org_privilege.sql
20260819000002_organisations_column_lockdown.sql
20260819000003_confirm_order_reacquires_lapsed_hold.sql
20260819000004_confirm_only_pending_orders.sql
20260820000001_refund_releases_seat.sql
20260820000002_refund_policy_and_requests.sql
20260820000003_refund_releases_squad_seat.sql
20260821000001_record_out_of_band_refund_columns.sql
```

**FAIL, any other count or any name not on this list: STOP.** Measured read-only
against production on 21 August 2026: ledger 88 rows, tree 97 files, 9 pending,
0 applied-without-a-file. A TENTH entry means something reached the tree that this
run sheet has not accounted for. An EIGHTH means something was applied out of
band. Either way, find out what before pushing.

### 8.5a Why there is a ninth, and why it is safe

`20260821000001_record_out_of_band_refund_columns.sql` is not a feature. It
records two columns that were found on production during the PR #119 types-drift
investigation and that NO migration in this repository ever created:

```
refunds.stripe_refund_status    text, nullable, no default
refunds.stripe_pending_reason   text, nullable, no default
```

They appear in no .sql file, in no commit on any branch, and in no application
code. TEST, which has every migration applied, does not have them. They were
applied by hand at some point, outside the migration files.

The migration ADDS them with `ADD COLUMN IF NOT EXISTS`, so against production,
which already has them, **it changes nothing**. Its purpose is to make the
repository describe the database, so they stop being invisible and so a future
migration cannot collide with them.

Nothing is at stake in the data: measured on production on 21 August, `refunds`
held 0 rows and both columns were non-null in 0 of them, with no constraint, no
index and no default on either.

**If you would rather they did not exist**, that is your call and not mine.
Delete the file before pushing and run this instead:

```sql
ALTER TABLE public.refunds
  DROP COLUMN IF EXISTS stripe_refund_status,
  DROP COLUMN IF EXISTS stripe_pending_reason;
```

Either way the types-drift guard passes afterwards, because the repository and
the database genuinely agree.

**Order matters and is already correct.** `db push` applies in version order, so
stage 1 (`20260818000001`, the tables no policy depends on) runs first, then the
44 policies move onto `SECURITY DEFINER` helpers (`20260819000001`), and only then
is `organisations` revoked (`20260819000002`). This is the ordering that was wrong
on Monday. It is right now, and it was proven on TEST: all eleven applied in one
pass and `anon` still read events, organisations, venues, seats, event_artists,
ticket_tiers, event_categories and profiles afterwards.

### 8.6 Apply the migrations

From `C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat`, the same directory you
just confirmed in 8.5:

```
supabase db push --linked
```

It will ask for the database password. Answer, or pass `-p`.

**SUCCESS looks like:** each of the eight printed in version order, then
`Finished supabase db push.` and a shell exit with no error. Confirm the ledger
moved:

```
supabase migration list --linked
```

- **PASS:** all eight now show a Remote timestamp, and nothing is left in the
  Local-only column.

**FAILURE looks like:** the push stops on a named file with a Postgres error. The
message names the file and usually the object. Two shapes to expect:

- `ERROR: policy "..." for table "..." already exists` -- that migration was
  partly applied out of band. Do not force it. Go to 8.8, then investigate.
- `ERROR: permission denied for table organisations` -- this should not happen
  during the push itself, but if it does, go to 8.8 immediately.

The push is not atomic across files. If it fails on file 5, files 1 to 4 are
applied and recorded. That is why 8.8 exists and why you should not simply re-run.

### 8.7 AFTER the migration: prove nothing went dark

Do these three in order. Each has an explicit failure action.

**8.7.1 The public event page still sells.**
Open <https://www.eventlinqs.com.au/events/payment-verification-test-3c1p9f>

- **PASS:** loads, and shows **"Get tickets"** exactly as in 8.4.
- **FAIL:** 404, 500, or "still finishing their payment setup". Go to 8.8 NOW.

**8.7.2 A second public surface, so one cached page cannot fool you.**
Open <https://www.eventlinqs.com.au/events> and
<https://www.eventlinqs.com.au/communities>

- **PASS:** both load with event cards and images visible.
- **FAIL:** either is blank, 404 or 500. Go to 8.8 NOW.

**8.7.3 An organiser can still publish.** This is the path the lockdown would
have broken, so it is the one that must be driven rather than assumed.
Sign in, go to <https://www.eventlinqs.com.au/dashboard/events>, open any DRAFT
event with a paid ticket tier, and press Publish.

- **PASS:** it publishes, and the event's status becomes Published.
- **FAIL, and this is the specific message to watch for:** `Organisation not
  found.` That is the exact symptom of the column revoke meeting old code. It
  means production is NOT running the merged code. Go to 8.8, then re-check 8.3.

### 8.8 ROLLBACK: one statement, and one query that names the problem

**The rollback.** Open the Supabase SQL editor for the PRODUCTION project
(`gndnldyfudbytbboxesk`) and paste this single statement. It restores table-level
`SELECT` on the four tables the lockdown narrows, which immediately undoes the
privilege change without touching any data:

```sql
GRANT SELECT ON public.organisations, public.venues, public.seats, public.event_artists TO anon, authenticated;
```

- **PASS:** `GRANT` printed, and the failing page from 8.7 loads on refresh
  (hard-refresh, or add `?x=1`, to defeat the CDN cache).
- It is safe to run even if the lockdown was not the cause: it only widens read
  access back to what production had all through 19 August.
- It does NOT roll back the refund or confirm_order migrations, and it does not
  need to; those add behaviour rather than remove access.

**The diagnostic: which table and column is actually denied.** Paste this into the
same SQL editor. It answers "what can `anon` and `authenticated` no longer read",
which is the question you had to guess at three times on Monday:

```sql
SELECT c.table_name,
       c.column_name,
       has_column_privilege('anon',          (quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, c.column_name, 'SELECT') AS anon_ok,
       has_column_privilege('authenticated', (quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, c.column_name, 'SELECT') AS auth_ok
FROM information_schema.columns c
JOIN pg_class cl ON cl.oid = (quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass
WHERE c.table_schema = 'public' AND cl.relkind = 'r'
  AND NOT (has_column_privilege('anon',          (quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, c.column_name, 'SELECT')
       AND has_column_privilege('authenticated', (quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, c.column_name, 'SELECT'))
ORDER BY 1, 2;
```

**How to read it:**

- **Zero rows** means no column is denied to either role. The lockdown is not your
  problem; look at the deploy (8.3) instead. This query was validated on
  production on 20 August: it ran in 164ms and returned zero rows, and a control
  asking the same question about an unprivileged role returned 889 rows, so a zero
  here is a real answer and not a broken query.
- **Rows listed** name the exact table and column. Expected AFTER a successful
  push: the `organisations` columns outside
  `(id, name, slug, description, logo_url, website)`, plus the narrowed columns on
  `venues`, `seats` and `event_artists`. That is the lockdown working as designed.
- **A column you did not expect**, especially on a table a public page reads, is
  the cause of a 404 or 500. Run the GRANT above.

### 8.9 The refund, and what confirms the seat came back

The seat release and the squad unwind are NOT live on production until 8.6
succeeds. Measured read-only on 20 August: production's live `reconcile_refund`
(4716 characters) does not touch `seats` or `squad_members`, and
`squad_member_status` has only `invited, paid, declined, timed_out`. After the
push it gains `refunded`.

1. Pick a **seated** event with a real paid order. Note the event id and the
   seat's row and number from the order.
2. Sign in, open
   `https://www.eventlinqs.com.au/dashboard/events/<EVENT_ID>/orders`, open the
   order, and press Refund. Confirm the full amount.
3. **Wait for the Stripe webhook.** The refund is applied by
   `charge.refunded`, not by the button, so the seat does not come back the
   instant the dialog closes. Give it up to a minute.

**What confirms the seat returned, in the dashboard:**

| Where | What you must see |
|---|---|
| `/dashboard/events/<EVENT_ID>/seats` | the seat is **available** again and selectable, not sold |
| `/dashboard/events/<EVENT_ID>` | the tier's sold count is **one lower**, remaining capacity one higher |
| `/dashboard/events/<EVENT_ID>/orders` | the order reads **refunded** (or `partially_refunded` on a partial) |

**What confirms it in the database**, if the UI is ambiguous. Run in the
production SQL editor, replacing the order id:

```sql
SELECT t.ticket_code,
       t.status              AS ticket_status,
       t.seat_id             AS seat_now,          -- must be NULL
       t.released_seat_id    AS seat_before,       -- must be the seat it held
       s.status              AS seat_status        -- must be 'available'
FROM public.tickets t
LEFT JOIN public.seats s ON s.id = t.released_seat_id
WHERE t.order_id = '<ORDER_ID>';
```

- **PASS:** `ticket_status` is `refunded`, `seat_now` is NULL, `seat_before` holds
  the original seat id, and `seat_status` is `available`.
- **FAIL, `seat_now` still set and `seat_status` still `sold`:** the refund did not
  reconcile. Check the Stripe webhook delivered: Stripe Dashboard, Developers,
  Webhooks, the `charge.refunded` event, and look for a non-2xx response.
- **FAIL, `seat_before` is NULL but `seat_now` is NULL too:** the ticket never had
  a seat. You refunded a general-admission order; pick a seated one.

**For a squad booking**, add this. `refunded` only exists after 8.6:

```sql
SELECT sm.id, sm.status
FROM public.squad_members sm
WHERE sm.order_id = '<ORDER_ID>';
```

- **PASS:** status is `refunded`, so squad completion stops counting that member
  and the slot is genuinely open again.
- **FAIL:** status is still `paid`. The squad would complete a slot short. That is
  the defect `20260820000003` fixes, so confirm that migration is in the ledger.

### 8.9a Confirm nothing reached production without a migration

Run after the push, from `el-moat`:

```
node scripts/verify/schema-provenance.mjs
```

It compares production against TEST, which is built from the migrations and from
nothing else, so anything present on production and absent from TEST was not
produced by a migration. It writes nothing: both sessions are opened read-only
and rolled back.

- **PASS:** `every object on production is produced by a migration`, and the line
  above it reads `objects on PRODUCTION that no migration produced: 0`.
- **FAIL:** it lists the objects. Each one reached production by hand. Write an
  idempotent migration recording it, or rule on removing it. Do not leave it.
- **CANNOT CONCLUDE:** it refuses when TEST is behind the tree, because every
  unapplied migration's columns would otherwise be reported as out-of-band. Apply
  the missing ones to TEST first, with
  `node scripts/verify/apply-migration-to-test.mjs --file supabase/migrations/<file>.sql`.

This is the check that did not exist on 21 August, which is why two hand-applied
columns on `refunds` sat unnoticed until a types-drift failure surfaced them.

### 8.10 Stop here

Do not merge `main` into `integration/launch` in the same sitting. If you do, the
Law 8 guard will fail on the new squash commit for the reason recorded in 8.1, and
you will be debugging authorship trailers while holding a fresh production deploy.
