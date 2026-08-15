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

1. Open PowerShell in `C:\Users\61416\OneDrive\Desktop\EventLinqs\el-moat`.
2. Confirm the Supabase CLI is linked to **production** and that you intend that.
3. Run:

   ```powershell
   supabase db push --linked
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

## 6. Remove the seeded events from production

> ## MEASURED 15 AUGUST 2026: THERE IS NOTHING TO DO HERE.
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

## 7. Prove money moves, with a real card

See section 4 above, which is the same procedure. Do it **after** sections 5 and
6, so the platform you test is the platform you launch.
