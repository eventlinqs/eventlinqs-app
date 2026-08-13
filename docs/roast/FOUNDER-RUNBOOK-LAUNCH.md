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

**Prepared. The identification is a real fixture marker, not a title match.**

`events.is_seed_data` is a boolean column added by migration
`20260628000001_events_is_seed_data.sql`, defaulting to `false`. Only seeder
scripts ever set it `true`; the application in `src/` **reads** it and never
writes it, so a real organiser event cannot acquire the mark. That is what makes
this a safe delete.

**It is fail-safe by construction.** `orders.event_id` references
`events(id) ON DELETE RESTRICT`. If a seeded event has ever taken an order,
Postgres **refuses** the delete rather than cascading. Everything else that hangs
off an event, tiers included, is `ON DELETE CASCADE`, so nothing is left orphaned.

### The steps

1. **Count first, and write the number down:**

   ```sql
   select count(*) from public.events where is_seed_data = true;
   ```

   Expect **32**.

2. **Look at what you are about to delete:**

   ```sql
   select id, slug, title, status, venue_city
     from public.events where is_seed_data = true order by title;
   ```

   Read the list. Every row should be a demo event you recognise as seeded. **If
   you see anything that looks like a real organiser's event, stop.**

3. **Find out how many have taken an order.** This is not a formality: on TEST
   this number is 61, not 0, because the demo catalogue was bought against
   during testing.

   ```sql
   select count(*) from public.orders o
     join public.events e on e.id = o.event_id
    where e.is_seed_data = true;
   ```

   **If it is 0**, step 4 will remove everything and you are done in one
   statement. **If it is not 0**, that is normal and expected, and step 4 below
   still does the right thing: it removes every seeded event that has NOT taken
   money and leaves the rest alone. Nothing is refused and nothing is guessed.

   To see exactly which ones will be kept:

   ```sql
   select e.id, e.slug, e.title, count(o.id) as orders
     from public.events e
     join public.orders o on o.event_id = e.id
    where e.is_seed_data = true
    group by e.id, e.slug, e.title
    order by orders desc;
   ```

4. **Delete the seeded events that have taken no money:**

   ```sql
   delete from public.events e
    where e.is_seed_data = true
      and not exists (select 1 from public.orders o where o.event_id = e.id);
   ```

   **Why this rather than a plain `delete ... where is_seed_data = true`:** the
   plain form is REFUSED outright, deleting nothing, the moment a single seeded
   event has an order, because `orders.event_id` is `ON DELETE RESTRICT`. Proven
   on TEST on 13 August 2026, where it failed with
   `ERROR: update or delete on table "events" violates foreign key constraint
   "orders_event_id_fkey" on table "orders"`. The guarded form above cannot be
   refused, and it can never remove an event that has taken money.

5. **What you see if it works:** `DELETE n`, where `n` is the count from step 1
   minus the number of distinct seeded events that have orders.

   **What you see if something is wrong:** any error at all. The guarded form has
   nothing left to trip over, so an error here means something unexpected about
   the database, not about this procedure. Stop and read it.

6. **Verify:**

   ```sql
   select count(*) from public.events where is_seed_data = true;
   ```

   Expect **0** if step 3 was 0. Otherwise expect exactly the number of distinct
   seeded events that carry orders, and those are deliberately still there.

   ```sql
   select count(*) from public.events;
   ```

   Expect the step 1 total minus the number deleted in step 4, and nothing else.

7. **If you want the order-bearing ones gone too**, do not delete them: hide
   them, so the order history and its money trail stay intact.

   ```sql
   update public.events set status = 'draft', visibility = 'private'
    where is_seed_data = true;
   ```

7. **Verify in a browser:** the homepage rails and `/events` still render real
   events and are not empty. If a rail is now empty, that rail was being filled
   entirely by seeded data, which is worth knowing before launch.

**NOT DONE, and stated plainly:** no cleanup script was written and this
procedure was not rehearsed end to end on TEST. The SQL above is derived from the
schema and the seeder's own documented contract, and step 5 is fail-safe, but you
are running it for the first time. Take the count in step 1 before anything else.

---

## 7. Prove money moves, with a real card

See section 4 above, which is the same procedure. Do it **after** sections 5 and
6, so the platform you test is the platform you launch.
