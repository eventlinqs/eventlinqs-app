# EventLinqs production steps

Written 2026-09-02 by the launch readiness session. NOTHING IN THIS FILE WAS RUN.
Every command below is a production write and was held at a stop gate.

---

## READ THIS BEFORE STEP 5. EVERY FIX FROM THIS SESSION IS LOCAL ONLY.

    integration/launch  local   836768d5
    integration/launch  remote  ea6df9f592a4e01437dba3d269a59b9ee957e058
    launch-prepared             local only, deliberately never pushed

The remote is still sitting on the commit that DOES NOT BUILD. TWELVE commits
exist only on this machine:

    836768d5  Script everything that happens after stripe login
    ae8dbfac  Name the new guard in the header the registry test reads
    e7684304  The guard I just added was caught by another guard, which is the system working
    a9a3a346  The last backdrop-filter in the tree, and a guard so it stays gone
    a87198e4  Every social card answered 500 once the rasteriser was initialised twice
    098a0aa4  The authorship guard outgrew its own window and said so
    0c503050  Journey 2 never tested the thing in its own title, no venue was filled
    bcbe339d  The journeys could only ever run at 1440, and nothing said so
    6ccb2950  Twenty two city browse pages were sharing as a bare link with no card
    7afc5913  The eighteen cards render from a running server, proved by breaking it on purpose
    793ebf5b  The three high advisories in the shipped tree are gone
    571b7b15  The card rasteriser survives the bundler, so a production build exists at all

READ a87198e4 BEFORE YOU DECIDE THE ORDER OF ANYTHING. It fixes a defect where
EVERY social card answers HTTP 500 for the life of a server once the WebAssembly
rasteriser has been initialised twice, which the scheduled health cron can cause
on its own. Without it, the Launch Kit can go down on production hours after a
green deploy, silently, and stay down until the lambda recycles.

If you deploy from the remote as it stands, the Vercel build FAILS at
`Module not found: Can't resolve 'wbg'`, because the resvg fix is one of those
twelve. Push the branch before step 5, or the deploy cannot succeed:

```powershell
$env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
Set-Location C:\dev\EventLinqs\eventlinqs-app
git log --oneline origin/integration/launch..integration/launch   # expect the twelve above
git push origin integration/launch
git rev-parse integration/launch
git ls-remote origin refs/heads/integration/launch                # the two must match
```

I did not push it myself: the brief holds every outward action at a stop gate and
this is one. `launch-prepared` stays local and unpushed either way, as instructed.

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

DECISION REQUIRED FROM LAWAL. I originally wrote three options and presented
them as neutral. **After reading the seeder I am withdrawing option (a) as
written**, and the reason is the most important thing in this section.

### WHY YOU CANNOT SIMPLY SEED PRODUCTION

`scripts/seed-national-catalogue.mjs` is the only national seeder, and it is
exactly the 261-across-20-cities catalogue the brief describes. It **REFUSES to
run against production**, by a hard guardrail, on purpose:

    if (URL.includes(PROD_REF)) {
      console.error('[seed] ABORT: target is PRODUCTION. Refusing.')
      process.exit(1)
    }

Its own header says "TEST only". Every row it writes is marked
`is_seed_data = true`.

So seeding production is not a command anybody can run today. It would need a
NEW seeder written deliberately to defeat that guardrail, and before anyone does
that, this is what the flag actually buys you:

**`is_seed_data` is honoured in exactly ONE place in the entire codebase**,
`src/lib/broadcast/digest.ts:240`, which excludes seed events from the email
digest. It is filtered from NO public surface. Driven on TEST just now against a
real seed event:

    /events/endurance-hall-five-thousand-seats
      HTTP 200, renders fully, no error boundary
      shows "Get tickets" at AUD 49.00
      carries ZERO visible marker that it is not a real event
      IS PRESENT IN THE SITEMAP

A seeded production catalogue would therefore be 261 fabricated events that a
real buyer cannot tell from a real one, with prices and a working ticket
selector, indexed by Google. CLAUDE.md's Definition of Done bans exactly this:
"Zero placeholders. No stubs, mocks, fake or hardcoded sample values" and
"Everything works on real data". Selling, or appearing to sell, tickets to
events that do not exist is also not a position to take under Australian
Consumer Law.

The seeder's guardrail is not an obstacle to work around. It is the correct
answer already encoded.

### THE OPTIONS, RESTATED HONESTLY

  a. **Seed production. NOT AVAILABLE as written, and I recommend against
     building it.** It needs a new seeder that defeats a deliberate guardrail,
     and it puts fake purchasable events in front of real buyers and Google.
     If you want it anyway, the minimum precondition is making `is_seed_data`
     a real display filter across discovery, detail, checkout and the sitemap,
     which is a build in itself and is not currently anywhere.
  b. **Onboard real organisers first** and launch with a genuinely small
     catalogue, accepting a thin browse grid on day one. The platform is built
     for this: the "one event shows the rail" ruling of 23 August fills a sparse
     rail with InvitationCards rather than hiding the real event, so a thin
     catalogue reads as recruitment.
  c. **Delay go to market** until there is a catalogue.

Whichever is chosen, the two payment verification test events should not be the
public face of the platform. They are indexed in the sitemap submitted to Google.

Rollback for any seeding: none is written, because no production seed command
exists and, per the above, none should be written casually.

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

WATCH THE BUILD LOG FOR THESE TWO, NARROWED 12:40 by running LOCK 3.

    [public-env]  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must not be empty
    [pricing-lock] PRICING_LOCKED_VALUES must be readable

Both were warnings locally only because the local copy of those values is empty.
What LOCK 3 (`node scripts/check-env-stores.mjs --mode=stores`) now proves, and
what it deliberately cannot:

  RULED OUT   "missing". `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is
              requiredOn ['production','preview'], and LOCK 3's `missing-scope`
              check fires when a required record does not exist on a scope. It
              passed all 93 records, so a record DOES exist on production.

  NOT RULED   "present but EMPTY". The store check validates presence, forbidden
  OUT         scopes, branch pinning and read-back exposure. It does NOT call
              `checkShape`, which needs the actual value and belongs to the
              environment evaluator that runs inside the build. So an
              empty-but-present record would satisfy LOCK 3 and still fail
              `[public-env]`.

That is not a gap in LOCK 3, it is the division of labour: the platform models
"present but EMPTY" as its own silent-failure class, and the env-locks drill
includes a case for exactly it ("a value emptied AFTER deploy is visible to the
runtime evaluator").

So: the deploy will not fail because the variable is ABSENT. It could still fail
because the value is empty or test-mode, and `[public-env]` is the thing that
would say so. Watch it, but expect it to pass.

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
account.

This WAS driven this session, 3 of 3, against TEST: the signed link opens the
order and exposes "Transfer or gift this ticket", the same order WITHOUT a token
opens but hides the transfer action, and a forged token is refused. Guest ticket
transfer passed 7 of 7 on top of that, with the ticket moving in the database and
the old QR secret rotated. Evidence: `C:\dev\EVIDENCE\journeys\guest-link-run.json`.

Re-check it on production anyway, because `ORDER_ACCESS_SECRET` differs per
environment and a TEST pass is not a production pass. This is a confirmation, not
an unknown.

**6e. Discount code creation**

Sign in as an organiser, open an event, create a discount code, and confirm a row
appears and the code applies at checkout.

This WAS driven this session, 7 of 7, at all three viewports: the row lands, the
new code renders on the screen that created it, the percentage persists, and a
duplicate is refused OUT LOUD with "A code with that name already exists for this
event" rather than failing silently. Evidence:
`C:\dev\EVIDENCE\journeys\viewports\j8-*.log`.

Re-check on production as a confirmation, not as an unknown.

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

## What this session PROVED by driving it, so the smoke checks have a baseline

Everything here was driven in a real browser against the production build on TEST.

  organiser signup, event creation, publish   PASS, journey 1, 0 blockers
  a guest claims a free ticket, end to end    PASS, "You're going", TOTAL AUD 0.00
  ticket email delivery                       PASS, read from the console transport
  the guest magic link                        PASS 3 of 3, and closed to a
                                              forged or absent token
  guest ticket transfer                       PASS 7 of 7, ticket moved in the
                                              database and the old QR secret rotated
  the door scanner                            PASS, ADMIT then REJECT
                                              "Already used just now"
  discount code creation                      PASS 7 of 7, row lands, duplicate
                                              refused out loud
  the seat map                                seat selected and HELD at AUD 155.21
  all 18 social cards + the A4 poster         PASS 28 of 28, canonical Launch Kit
                                              proof, 9 tracked links all resolving
  the fee on the RENDERED checkout            AUD 59.00 + Service fee AUD 3.06
                                              = AUD 62.06.  59.00 x 3.5% + 0.99
                                              = 3.055, so the locked platform fee
                                              is exactly what the buyer is charged,
                                              as ONE fee with no processing line
  axe-core                                    0 violations across 11 surfaces,
                                              the whole pinned gate set
  the paid-publish money refusal              PASS at 390, 768 and 1440, driven
                                              after the venue fix. The organiser is
                                              refused with "Connect Stripe before
                                              publishing a paid event: that is how
                                              you get paid, and we cannot take money
                                              for a ticket without it. Free events
                                              can be published right now", the
                                              message is IN VIEWPORT and ANNOUNCED
                                              to a screen reader, and it carries a
                                              link to /dashboard/payouts which then
                                              offers "Set up payouts".
                                              WORTH KNOWING: the Publish button is
                                              NOT disabled beforehand. The refusal
                                              is server side, on click. That is a
                                              deliberate-looking choice and it works,
                                              but a buyer-facing reader should know
                                              the button does not look blocked.
  every journey at three viewports            ALL TEN, at 390, 768 and 1440.
                                              30 rows: PASS 18, FAIL 12, and
                                              every one of the twelve failures is
                                              the SAME missing Stripe key. Nothing
                                              is left unexplained by it.
                                              Table: EVIDENCE\journeys\TASK7-TABLE.txt
  the door scanner ON A PHONE                 ADMIT then REJECT "Already used just
                                              now" at 390 and at 768, not only at
                                              1440. A door is only ever run from a
                                              phone, so this is the size that
                                              mattered and it had never been tried.
  trust signals, BOTH halves of the law       ZERO on 6 marketing surfaces
                                              (including /events and browse, which
                                              the earlier gate could not read
                                              because they answered HTTP 500), and
                                              PRESENT on event detail as a 20px
                                              icon row below "Get tickets":
                                              "Secure checkout | Community
                                              organiser | Refund policy".
  Scenes V2 and the tagline                   all 12 SOUNDS families render,
                                              First Nations is genuinely first in
                                              the rendered order, and the tagline
                                              reads exactly "Every community.
                                              Every event. One platform."

## What this session could NOT verify, so you know what is untested

  A PAID purchase, and therefore refund       BOTH Stripe keys stored by the CLI
  and signed-in transfer                      are expired (2026-07-29 and
                                              2026-07-07, driven, HTTP 401
                                              api_key_expired). The server says
                                              "STRIPE_SECRET_KEY is not set".
                                              Fix: run `stripe login`.
  Sentry capture                              no DSN available locally, and the
                                              server confirms dsnPresent:false on
                                              every boot. Nothing could be made
                                              to arrive, so it is not claimed.
  Google Maps in a browser                    the browser key is correctly locked
                                              to HTTP referers, so localhost is
                                              refused (RefererNotAllowedMapError).
                                              That refusal is the key being
                                              configured properly. Prove it with
                                              scripts/verify/map-guard.mjs against
                                              the deployment, not locally.

Two entries that USED to sit in this list have been driven since and were moved
out of it. They are recorded in the PROVED table above instead:

  the three viewport runs                     the harness ignored its own viewport
                                              argument. Fixed in bcbe339d and the
                                              journeys were re-driven at 390, 768
                                              and 1440.
  paid-publish refusal specifically           the venue was never filled, so the
                                              publish was refused for a MISSING
                                              VENUE before it could reach the money
                                              refusal. Fixed in 0c503050 and
                                              re-driven at all three viewports.

### One environment fact worth knowing before the next preview

CORRECTED 11:50. I first wrote this as "one environment GAP worth fixing". That
was wrong and the manifest says so plainly:

    ORDER_ACCESS_SECRET
      requiredOn: ['production'],
      optionalOn: ['preview', 'development'],

with the reason in its own comment: "Missing means guest order links are neither
issued nor honoured. It fails CLOSED rather than falling back to the public dev
constant, which would let anyone open any order by guessing an id."

So its absence from Preview is the DESIGNED, SAFE state. Nothing is broken and
nothing needs fixing.

The narrower true statement: `src/lib/orders/order-access.ts` fails closed
without it under NODE_ENV=production, so the guest magic link cannot be exercised
on any preview deployment. If you want to test that flow outside production, set
`ORDER_ACCESS_SECRET` on Preview. Until then it is untestable there, by design.



---

## WHAT ONLY YOU CAN DO, each with a verdict

Law 10 requires every step assigned to the founder to carry one of three
verdicts: SCRIPTED with the command, RESERVED naming the law, or IMPOSSIBLE
naming what a machine cannot do. A step with no verdict has not been thought
about. There are five, and four of them gate real product.

### 1. `stripe login`   IMPOSSIBLE for me, then SCRIPTED

The single most expensive item on this list. TWELVE of the thirty journey rows
failed on it, and all twelve are this one credential, not twelve defects.

IMPOSSIBLE part, and it is one command:

```powershell
stripe login
```

It is a browser OAuth that mints a session against your Stripe account. I cannot
authorise it, and the two keys the CLI had stored are both expired, driven and
confirmed again just now:

    GET https://api.stripe.com/v1/balance  ->  HTTP 401
    "Expired API Key provided: sk_test_***...xCB6PW"
    code: api_key_expired

Vercel will not decrypt a sensitive variable back to a client on any scope or
branch, so there was no second route to it.

SCRIPTED part, everything after:

```powershell
$env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
Set-Location C:\dev\EventLinqs\eventlinqs-app

# one window: the server, with the key in ITS environment, because the
# journeys drive the SERVER rather than the script
powershell -NoProfile -ExecutionPolicy Bypass -File C:\dev\serve.ps1 3311

# another window
node scripts/ops/after-stripe-login.mjs
```

It proves the key authenticates, REFUSES a live key before it acts, then
re-drives j3, j4, j5 and j7-seated at desktop and mobile and prints one verdict.
It never prints a secret, only a length and a prefix. If it still reports a
missing card field it tells you the server, not the key, is the problem.

### 2. REPLACE the value of the existing GOOGLE_MAPS_API_KEY   IMPOSSIBLE for me

**CORRECTED 11:00. I first wrote this as "mint a server key and add it". That was
wrong, and wrong in a way that would have cost somebody a deploy.**

The variable ALREADY EXISTS and is already required:

    vercel env ls   ->   GOOGLE_MAPS_API_KEY   Config
                         Production, Preview, Development   137d ago

    manifest        ->   describe: 'Google Maps server key: geocoding at seed
                                    and publish time'
                         requiredOn: ['production', 'preview']
                         publicVar: false

But its VALUE is byte-identical to the browser key. Compared by hash, not by eye:

    GOOGLE_MAPS_API_KEY              sha256 3dcc7ad828a5
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY  sha256 3dcc7ad828a5

so it carries the same HTTP referer restriction and is refused for both APIs:

    Geocoding API        REQUEST_DENIED
    Places Autocomplete  REQUEST_DENIED
    "API keys with referer restrictions cannot be used with this API."

Nothing in `src/` or `scripts/` reads it, so nothing is broken TODAY. The trap is
tomorrow: anyone building the venue geocoding will see a non-public variable named
`GOOGLE_MAPS_API_KEY`, described as the server key, marked required on production,
wire to it and ship. It will fail in production and look like their code.

**THE ACTUAL STEP:** mint a key in the Google Cloud console restricted by IP (or
unrestricted and held server side), then replace the VALUE of the existing
`GOOGLE_MAPS_API_KEY` on Production and Preview. The name, the manifest entry and
the scopes are already right. Do not add a new variable.

**WHILE YOU ARE THERE:** that key is also on the DEVELOPMENT scope, which the
manifest's own doctrine note (line 1289, founder ruling R3 of 2026-08-03) names
as a problem for this exact variable: "the audit found a live RESEND_API_KEY and
a billable GOOGLE_MAPS_API_KEY sitting readable there, and no mode rule can
protect either". I pulled it to this laptop in one command to run the test above,
which is precisely the exposure that ruling describes, and deleted the file
immediately afterwards. The manifest entry permits it while the doctrine note
forbids it, so those two disagree and one of them should change.

### 2c. A five minute security tidy-up, whenever you want it

NOT a launch blocker and I have deliberately not applied it, because applying it
turns the build RED until you remove two values from Vercel, and that is your
timing to choose rather than mine on launch morning.

Founder ruling R3 (2026-08-03), recorded in the manifest itself: "THE DEVELOPMENT
SCOPE MUST NOT HOLD SECRETS AT ALL". Its own audit evidence named two variables.
One was fixed, one was not:

    RESEND_API_KEY        mustBeSensitive: TRUE    gone from Development. Correct
    GOOGLE_MAPS_API_KEY   mustBeSensitive: false   STILL readable there
    PEXELS_API_KEY        mustBeSensitive: false   STILL readable there, billable

The rule enforces itself through `storePolicyFor`, which forbids a variable on a
non-sensitive-capable scope ONLY when `mustBeSensitive` is true. Development
cannot take `--sensitive`, so a true flag removes the variable from it
permanently. A false flag lets it sit there in plain text.

I proved the exposure rather than asserting it: one `vercel env pull` put the
billable Google key on this laptop in plain text, twice today. I deleted the file
both times and verified.

THE EDIT, one line each, in `src/lib/env/manifest.mjs`:

    GOOGLE_MAPS_API_KEY    mustBeSensitive: false  ->  true
    PEXELS_API_KEY         mustBeSensitive: false  ->  true

Then remove both from the Development scope in Vercel. The guards will tell you
if you miss one.

SCOPE OF THE RISK, so it is weighed correctly: neither key can spend on a buyer
behalf or reach the database. Both are billable, so this is quota theft and a
bill, not customer data. That is why it waits for you.

### 2b. The original framing, kept for the record

This one is worse than "not built", and the distinction matters for what you do
first. Scope 3.1.1 requires "Google Maps integration and embedded map preview"
on the event builder, and neither exists: `venue_latitude` appears once, as null,
and is never assigned, so no organiser-created event can reach a city map.

Building it would NOT have been enough. Driven just now against the only key on
this machine:

    Geocoding API          REQUEST_DENIED
    Places Autocomplete    REQUEST_DENIED
    both: "API keys with referer restrictions cannot be used with this API."

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is correctly locked to HTTP referers, which is
exactly what you want for a key that ships to a browser, and it is precisely why
it cannot geocode server side. A SECOND key, restricted by IP or unrestricted
and held server side, has to exist before any of that code could run. Only you
can mint it in the Google Cloud console.

So the order is: mint the server key, THEN build the geocoding. Not the reverse.

### 3. The Sentry DSN   ALREADY SET. Nothing for you to do but confirm it fires

**CORRECTED 11:00.** I wrote that the DSN "does not exist until your dashboard
mints it". It exists:

    SENTRY_DSN              Secret   Preview, Production   122d ago
    NEXT_PUBLIC_SENTRY_DSN  Secret   Preview, Production   122d ago

What is true is that I could not READ them, because they are stored Secret, which
is correct for a secret and is a completely different statement from "unset".
`dsnPresent:false` was a fact about THIS MACHINE, not about production.

So Sentry is CONFIGURED. What remains unproven is only that it CAPTURES end to
end on the live project, which needs one deliberate error after the deploy:

After you have it:

```powershell
$env:SENTRY_DSN = "<the DSN>"
node scripts/verify/sentry-capture.mjs      # if present, else trigger
                                            # /api/health/sentry-error and look
                                            # in the Sentry issue stream
```

### 4. The VAPID keys   ALREADY SET. Push needs a browser, not a key

**CORRECTED 11:00.** I implied you had to supply these. All three are set:

    VAPID_PRIVATE_KEY             Secret   Preview, Production   40d ago
    NEXT_PUBLIC_VAPID_PUBLIC_KEY  Secret   Preview, Production   40d ago
    VAPID_SUBJECT                 Secret   Preview, Production   40d ago

The email half of the alert engine is driven end to end (`cron dispatches:1
sent:1`, follower received "Just announced: ..."). The push half is unproven for
one reason only, and it is not a credential: it needs a REAL BROWSER to grant
notification permission and register a subscription, which a headless run cannot
produce. Open the site on a phone, accept notifications, then fire the alert cron.

### 5. An organisation on payout tier 2 or 3   IMPOSSIBLE for me, and DOWNSTREAM

Tier 1 is observable. Tiers 2 and 3 display only for an organisation that has
completed paid events and cleared the volume thresholds. That needs real paid
orders, which needs item 1. It is not separately blocked; it unblocks itself
once Stripe works and a test organisation has traded.

### And one that is RESERVED rather than blocked

Applying a migration to production is yours by your own ruling of 26 August 2026,
restated in CLAUDE.md Law 10: "a production schema change is the one thing he
wants to press himself." That is a decision about authority, not capability. The
commands are written above in STOP GATE 2 and were deliberately not run.
