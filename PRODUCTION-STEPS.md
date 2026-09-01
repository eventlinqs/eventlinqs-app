# EventLinqs production steps

Written 2026-09-02 by the launch readiness session. NOTHING IN THIS FILE WAS RUN.
Every command below is a production write and was held at a stop gate.

Run them in the order given. The order is a constraint, not a preference.

Before anything: this session left the Supabase CLI linked to TEST. Every step
that touches production re-links deliberately and reads the ref back first.

---

## GATE 0. NOT IN THE ORIGINAL BRIEF. READ IT BEFORE YOU DEPLOY ANYTHING.

**Production has no catalogue.** Measured tonight, read only, on the live site:

    https://www.eventlinqs.com.au/                      1 event linked
    https://www.eventlinqs.com.au/events                1 event linked
    https://www.eventlinqs.com.au/events/browse/sydney      0 events
    https://www.eventlinqs.com.au/events/browse/melbourne   0 events

and the one event on both surfaces is `payment-verification-test-2-e1ukdb`.

The production sitemap carries 552 URLs of which exactly FOUR are event detail
pages, two of them named `payment-verification-test`.

The brief expected a national seed of 261 published events across 20 cities. It
is not on production. This is DATA, not code, so deploying the branch does not
change it.

CLAUDE.md, "The market-ready completeness bar (volume law)", makes this a breach
rather than a nice-to-have: "All of Australia from day one ... Every city the
platform lists must be represented with real events".

DECISION REQUIRED FROM LAWAL, and it is not a step I can write a command for
without knowing which of these he wants:

  a. Seed production from the same catalogue TEST carries (TEST currently holds
     117 published events visible to an anonymous reader, not 261 either).
  b. Onboard real organisers first and launch with a genuinely small catalogue,
     accepting that the browse grid is nearly empty on day one.
  c. Delay go-to-market until there is a catalogue.

Whichever is chosen, the two payment verification test events should not be the
public face of the platform. They are indexed in the sitemap submitted to Google.

Rollback for any seeding: none is written, because no seed command is written.
Do not run an unrehearsed seed against production.

---

## STOP GATE 1. THE ARTS STORAGE OBJECT

This MUST run BEFORE the deploy. After the deploy `src/lib/images/spine.ts` asks
for the community-first path, and if the objects are not there the Arts tile
serves a 404 on the homepage.

The operation is a server-side copy of three objects inside the `event-images`
bucket, from `stock/categories/arts-culture/` to `stock/categories/arts-community/`.
It is COPY ONLY: both paths serve afterwards, which is deliberate, so already
rendered pages and CDN edges keep working through the deploy.

The script is already written, is idempotent, refuses to overwrite, and carries
the founder approval of 26 August 2026 in its own header.

### The command

```powershell
$env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
Set-Location C:\dev\EventLinqs\eventlinqs-app

# The approval is read from the SHELL, deliberately, so it is per run and cannot
# be parked in a file. The --env-file supplies only the URL and the service key.
$env:ALLOW_PRODUCTION_SUPABASE = "1"

node --env-file=C:\dev\EventLinqs\eventlinqs-app\.env.production.local `
     scripts/ops/copy-spine-category-objects.mjs
```

NOTE: `.env.production.local` does not exist on this machine. It must contain the
PRODUCTION `NEXT_PUBLIC_SUPABASE_URL` (gndnldyfudbytbboxesk) and the PRODUCTION
`SUPABASE_SERVICE_ROLE_KEY`. This session could not create it: Vercel refuses to
decrypt sensitive variables back to a client, so the service role key was never
available here.

### Expected output

The script prints the project ref and marks it PRODUCTION, then one line per
object. Three objects are copied:

    theatre-interior-evening-480.avif
    theatre-interior-evening-960.avif
    theatre-interior-evening-1440.avif

A re-run reports each as already present and skips it. That is success, not a
failure: the script is idempotent by design.

### How to verify the objects exist afterwards

```powershell
# Public URL check, one per object. 200 means the object is there.
foreach ($w in 480,960,1440) {
  $u = "https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/stock/categories/arts-community/theatre-interior-evening-$w.avif"
  try {
    $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -TimeoutSec 30
    "OK  $w  HTTP $($r.StatusCode)"
  } catch { "FAIL $w  $($_.Exception.Message)" }
}
```

Expected: three lines reading `OK 480 HTTP 200`, `OK 960 HTTP 200`,
`OK 1440 HTTP 200`.

### How to confirm the tile renders on the live homepage

AFTER the deploy in stop gate 2, not before:

```powershell
$r = Invoke-WebRequest -Uri "https://www.eventlinqs.com.au/" -UseBasicParsing -TimeoutSec 60
"arts-community referenced on the homepage: " + ($r.Content -match 'arts-community')
"arts-culture still referenced:             " + ($r.Content -match 'arts-cult' + 'ure')
```

Then open https://www.eventlinqs.com.au/ and look at the Arts tile in Browse by
Category. It must show the theatre interior photograph, not a gradient and not a
broken image.

### Rollback

None is needed and none should be run. The script only ADDS objects at a new
path; it deletes and moves nothing, so there is nothing to undo. If the copy is
somehow wrong, the old path is untouched and still serving.

---

## STOP GATE 2. PRODUCTION MIGRATIONS AND DEPLOY

Run these in this order. Do not reorder.

### Step 1. Link the Supabase CLI to production

```powershell
$env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
Set-Location C:\dev\EventLinqs\eventlinqs-app
supabase link --project-ref gndnldyfudbytbboxesk
```

Expected output, exactly:

    {"project_ref":"gndnldyfudbytbboxesk","message":""}

### Step 2. READ THE REF BACK. Do not skip this.

A mislinked `db push` reports success and changes nothing. Read the ref from the
file the CLI actually uses, not from the command you just typed.

```powershell
Get-Content C:\dev\EventLinqs\eventlinqs-app\supabase\.temp\project-ref
supabase projects list
```

Expected output of the first command, exactly one line:

    gndnldyfudbytbboxesk

Expected in the second: the JSON row for `gndnldyfudbytbboxesk` carries
`"linked":true`, and the row for `vkapkibzokmfaxqogypq` carries `"linked":false`.

STOP if either disagrees.

### Step 3. Apply the migrations

```powershell
supabase db push
```

Expected output. Four migrations are applied, in this order, and no others:

    Applying migration 20260827000001_arts_category_display_name.sql...
    Applying migration 20260829000001_missing_increment_functions.sql...
    Applying migration 20260829000002_guest_ticket_transfer.sql...
    Applying migration 20260829000003_discount_claims_at_reservation.sql...
    {"upToDate":false,"dryRun":false,"migrations":[ ...those four... ],
     "seeds":[],"roles":[],"message":"Finished supabase db push."}

This is VERIFIED, not assumed. Production was queried read only during the
session on 2026-09-02 and reported:

    total migration rows   107
    applied on production  103
    PENDING                4

and the four pending were exactly the four named above. If the count is not four
when you run it, something changed between then and now. Stop and look.

What each one does, so the run is predictable:

  20260827000001_arts_category_display_name.sql
      UPDATE public.event_categories SET name = 'Arts' WHERE slug = 'arts-community';
      COMMENT ON TABLE public.event_categories ...
      One row updated, one table comment. No schema change.
      SAFE TO RE-RUN: yes, fully idempotent.

  20260829000001_missing_increment_functions.sql
      Creates the missing increment functions.
      SAFE TO RE-RUN: yes if written as CREATE OR REPLACE. Check the file head
      before a second run; it was not re-run during this session.

  20260829000002_guest_ticket_transfer.sql
      The guest order access and transfer path.
      SAFE TO RE-RUN: not verified. Treat as run-once.

  20260829000003_discount_claims_at_reservation.sql
      Claims a discount at reservation rather than after the money moves.
      SAFE TO RE-RUN: not verified. Treat as run-once.

Only the first was actually applied and observed during this session, against
TEST, where the other three were already present.

### Step 4. Verify exactly four migrations applied

```powershell
supabase migration list
```

Expected: every one of the 107 rows now shows a `remote` value equal to its
`local` value, and the four below in particular:

    {"local":"20260827000001","remote":"20260827000001", ...}
    {"local":"20260829000001","remote":"20260829000001", ...}
    {"local":"20260829000002","remote":"20260829000002", ...}
    {"local":"20260829000003","remote":"20260829000003", ...}

Prove the EFFECT as well as the bookkeeping, because a migration row is not a
schema change:

```powershell
# The Arts rename, read from the live table. Needs the production anon key.
$u = "https://gndnldyfudbytbboxesk.supabase.co"
$k = "<PRODUCTION NEXT_PUBLIC_SUPABASE_ANON_KEY>"
$r = Invoke-RestMethod -Uri "$u/rest/v1/event_categories?select=slug,name&slug=eq.arts-community" `
      -Headers @{ apikey = $k; Authorization = "Bearer $k" }
$r
```

Expected: one row, `slug = arts-community`, `name = Arts`. If `name` still reads
`Arts & Community`, the migration row exists and the change did not land.

### Step 4b. RELINK TO TEST as soon as production work is finished

```powershell
supabase link --project-ref vkapkibzokmfaxqogypq
Get-Content C:\dev\EventLinqs\eventlinqs-app\supabase\.temp\project-ref
```

Expected: `vkapkibzokmfaxqogypq`. Leaving the CLI pointed at production is how a
later, unrelated `db push` lands somewhere nobody intended.

### Step 5. Deploy

Project `prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ`, org `team_yPo8T18zSl5VczJfWIIrNqly`,
scope `lawals-projects-c20c0be8`, project name `eventlinqs-app`.

The branch to deploy is `launch-prepared`, which this session prepared locally
and did NOT push. Push it or merge it first; a Vercel deploy builds a git ref.

```powershell
$env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
Set-Location C:\dev\EventLinqs\eventlinqs-app

# Confirm what is about to ship.
git log --oneline -5 launch-prepared
git diff --stat main launch-prepared

vercel --prod --scope lawals-projects-c20c0be8
```

Expected output: a build starts, the log ends with `Production: https://...`,
and `vercel ls --scope lawals-projects-c20c0be8` shows the new deployment as
READY against `eventlinqs.com.au`.

WATCH THE BUILD LOG FOR THESE TWO, because both are warnings locally and both
BLOCK on Vercel:

    [public-env]  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must not be empty
    [pricing-lock] PRICING_LOCKED_VALUES must be readable

Both were warnings during this session only because the local copy of those
values is empty. They exist on Vercel, so the build should pass, but if either
fires as an error the deploy stops there and that is the reason.

### Step 6. Post deploy smoke checks

Run every one. A deploy that builds is not a deploy that works.

```powershell
$BASE = "https://www.eventlinqs.com.au"
```

**6a. The site is up and not rendering an error boundary**

```powershell
$r = Invoke-WebRequest -Uri "$BASE/" -UseBasicParsing -TimeoutSec 60
"HTTP $($r.StatusCode)"
"error boundary present: " + ($r.Content -match 'We hit a snag loading this page')
```

Expected: `HTTP 200`, and `error boundary present: False`.

That second line matters more than the status code. During this session the event
detail page answered HTTP 200 with 63951 bytes while rendering nothing but
"We hit a snag loading this page" and a Retry button. A smoke check that only
reads the status code would have called that green.

**6b. One social card, fetched live**

```powershell
$r = Invoke-WebRequest -Uri "$BASE/api/launch/<a real kit code>/card/square?channel=instagram" -UseBasicParsing -TimeoutSec 120
"HTTP $($r.StatusCode)  $($r.Headers['Content-Type'])  $($r.RawContentLength) bytes"
```

Expected: `HTTP 200  image/jpeg` and roughly 150000 to 250000 bytes. A
ZERO BYTE body or a JSON error body is the failure this session fixed; if it
comes back, the resvg WebAssembly binary did not make it into the lambda and
`outputFileTracingIncludes` in next.config.ts is the place to look.

Get a kit code by opening `$BASE/launch`, typing an event description and letting
the composer build a kit; the code is in the artefact URLs on that page.

**6c. The Arts tile renders**

As written under stop gate 1 above.

**6d. Guest magic link**

Open `$BASE` in a private window. Buy or locate an order as a guest, then use the
"find my order" path and confirm the emailed link opens the order without an
account. This is journey 5 guest half and it could NOT be driven this session.

**6e. Discount code creation**

Sign in as an organiser, open an event, create a discount code, and confirm a row
appears and the code applies at checkout. This is journey 8 and it could NOT be
driven this session.

**6f. One real ticket purchase, and 6g. one real refund**

With a real card, on a real published event, end to end, then refund it from the
buyer's own ticket. Both could NOT be driven this session.

### Rollbacks

**Deploy.** Instant, and this is the one to reach for first:

```powershell
vercel rollback --scope lawals-projects-c20c0be8
# or promote a known-good deployment explicitly:
vercel promote <previous-deployment-url> --scope lawals-projects-c20c0be8
```

**Migrations.** THERE IS NO SUPABASE ROLLBACK COMMAND. `supabase db push` is
forward only. The four migrations have no down files in this repository, so a
revert is a hand written migration.

  20260827000001 is trivially reversible:

      UPDATE public.event_categories
      SET name = 'Arts & Community'
      WHERE slug = 'arts-community';

  The other three create functions and tables and would each need a hand written
  reversal. Take a backup BEFORE step 3 so the option exists at all:

```powershell
supabase db dump --file C:\dev\prod-backup-before-migrations.sql
```

Do that while still linked to production, immediately after step 2 and before
step 3. It is the only real rollback the migration half of this has.

**Storage copy.** Nothing to roll back. It only adds.

---

## What this session could NOT verify, so you know what is untested

  Stripe anything          no STRIPE_SECRET_KEY locally, and the Stripe CLI's own
                           test key expired on 2026-07-29 (proved: HTTP 401
                           api_key_expired)
  All ten stranger journeys blocked at account creation by the missing
                           SUPABASE_SERVICE_ROLE_KEY
  Sentry capture           no DSN locally, so nothing could be made to arrive
  Ticket email delivery    no RESEND_API_KEY
  The event detail page    renders its error boundary locally for the same
                           service role key reason, so it is UNPROVEN on this
                           branch at any viewport

Pasting SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY into
`C:\dev\EventLinqs\eventlinqs-app\.env.local` unblocks all of it locally.
