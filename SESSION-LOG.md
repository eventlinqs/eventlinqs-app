# EventLinqs Launch Readiness Session Log

Operator: Lawal Adams (sole author). Session machine: Windows 11, PowerShell 5.1.
Newest entries appended at the bottom. Summary block will be added at the top when the session closes.

---

## RUNNING STATUS (updated as the session proceeds)

- TASK 0 disk gate: PASS
- TASK 1 fresh local repo: IN PROGRESS (blobless clone running)
- TASK 4 recovery of five files: FAILED, definitively, evidence below. Non blocking as briefed.
- All other tasks: not started

---

## 2026-09-02 00:05 TASK 0. DISK GATE

Command:
    Get-PSDrive C

Observed:
    FreeGB  12.93
    UsedGB  223.30
    TotalGB 236.23

Gate is 12 GB minimum. Free space 12.93 GB. PASS. Proceeding without reclaiming.

Toolchain confirmed present:
    node v24.19.0 (via C:\node24\node-v24.19.0-win-x64)
    npm  11.17.0
    git  2.53.0.windows.1
    gh   C:\Program Files\GitHub CLI\gh.exe

Starting state of C:\dev: contained only an empty EventLinqs directory. No prior
SESSION-LOG.md, no EVIDENCE directory, no PRODUCTION-STEPS.md.

---

## 2026-09-02 00:06 TASK 1 PRECHECK. REMOTE REACHABILITY

Before cloning I verified the remote actually holds what the brief asserts, since
every later task depends on it.

Command:
    git ls-remote https://github.com/eventlinqs/eventlinqs-app

Observed, matching the brief exactly:
    ea6df9f592a4e01437dba3d269a59b9ee957e058    refs/heads/integration/launch
    9cf7d3651f0d3b24ea4750d35f4eb378210a9d22    refs/heads/main

Total refs on remote: 227.
Repository is public. GitHub API reports size 1849974 KB, about 1806 MB packed.

Finding, minor: https://github.com/eventlinqs/el-moat did not return a usable
head listing (git exited 128). The moat repository is not required by any task in
this session, so this is recorded and not pursued.

---

## 2026-09-02 00:08 TASK 1. CLONE, FIRST ATTEMPT, FULL CLONE

Ran the full clone exactly as briefed in order to MEASURE it rather than guess.

    git clone https://github.com/eventlinqs/eventlinqs-app C:\dev\EventLinqs\eventlinqs-app

Observed: still transferring when it hit a ten minute ceiling and was killed.
At the point it was killed:
    .git         1425.2 MB
    worktree     not yet checked out, zero source files present
    free disk    11.52 GB, down from 12.93 GB

Measurement conclusion: the pack alone had reached 1.4 GB and was still receiving,
heading for roughly 1.8 GB packed, with an entire working tree still to be written
on top. That exceeds the 2.5 GB threshold set in the brief. This is a measured
result, not an estimate.

Action taken per the brief: deleted the partial clone and switched to a blobless
partial clone.

    Remove-Item -Recurse -Force C:\dev\EventLinqs\eventlinqs-app
    free disk restored to 12.91 GB

    git clone --filter=blob:none https://github.com/eventlinqs/eventlinqs-app C:\dev\EventLinqs\eventlinqs-app

This retains every branch and all history, so the TASK 9 merge work still functions,
and fetches file contents on demand.

---

## 2026-09-02 00:10 TASK 4. RECOVERY OF THE FIVE UNCOMMITTED FILES. FAILED.

Time boxed to 15 minutes. Ran read only, in parallel with the clone. Nothing in the
OneDrive archive was written, moved, deleted or repaired. OneDrive.exe was not restarted.

Target files:
    docs/roast/MOVE-OFF-ONEDRIVE.md
    scripts/ops/move-off-onedrive.mjs
    docs/verification/PRE-MERGE-BLOCKER-SWEEP-2026-08-29.md
    docs/POST-LAUNCH-FINDINGS.md
    lighthouse-gate-urls.json

Step 1. Direct path check in both archive repositories.
Result: all five absent from both eventlinqs-app and el-moat.

Step 2. Inspected what the archive actually still contains.

    C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app
        .git          (attributes da-h-l, reparse point)
        .next
        node_modules
    That is the complete top level. There is no source tree left at all.

    C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app\.git
        objects
        worktrees
    No refs, no HEAD, no config, no index. The repository is not merely broken, it
    is missing everything except the object store.

    C:\Users\61416\OneDrive\Desktop\EventLinqs\el-moat
        .next, docs, .eslintcache, and NO .git at all.

Step 3. Attempted blob level recovery from the surviving object store, read only,
against a scratch repository created outside OneDrive in the session scratchpad.

    .git\objects contained 63 fanout directories, 77 loose object files,
    200098 bytes reported, and NO pack directory.

Loose objects with no pack is exactly the shape where recently staged blobs survive,
so this was worth attempting.

Result: ZERO of the 77 objects could be read. Every copy attempt failed with

    Copy-Item : The cloud file provider exited unexpectedly.

Objects successfully copied into the scratch repository: 0. Bytes recovered: 0.

Diagnosis, and this is the important part: those 77 files are OneDrive dehydrated
placeholders. The directory entries and their reported sizes exist in the file
system, but the actual bytes are not on this disk. Hydrating them requires the
OneDrive client to fetch them from the cloud, and restarting OneDrive.exe is
explicitly forbidden this session because it drains the disk.

So the failure is not a lack of effort or technique. The bytes are not present
locally and cannot be made present within the standing rules. Recording this as a
definitive negative rather than an unfinished attempt.

Consequence: four documents and one ops script are lost unless OneDrive is allowed
to hydrate them at some later point, outside this session. Per the brief these
block nothing and the move off OneDrive they describe has already been done
differently, by this session, at C:\dev\EventLinqs\eventlinqs-app.

STILL OUTSTANDING from TASK 4: the critical exception, namely grepping the cloned
repository for any reader of lighthouse-gate-urls.json and reconstructing it if
anything reads it. That requires the clone to finish and is carried forward.

Scratch recovery directory was deleted afterwards to return the disk.

---

## 2026-09-02 00:14 TASK 3 PARTIAL. SERVICE AND CREDENTIAL RECONNAISSANCE

Ran ahead of the clone finishing, because whether this session can drive anything
at all depends on credentials existing, and the working copy that held them is gone.

### Tooling, contradicting the session start hook
The Vercel plugin hook claimed the Vercel CLI was not installed. That is wrong.
All three CLIs are present and, importantly, already authenticated:

    vercel    C:\Users\61416\AppData\Roaming\npm\vercel.ps1   (CLI 55.0.0)
    supabase  C:\Users\61416\scoop\shims\supabase.exe          (v2.115.0)
    stripe    ...\WinGet\Packages\Stripe.StripeCli...\stripe.exe
    playwright  NOT INSTALLED (expected, comes with npm ci in TASK 2)

### Supabase, both projects confirmed healthy
    supabase projects list

    gndnldyfudbytbboxesk  eventlinqs-sydney  ap-southeast-2  ACTIVE_HEALTHY  linked=false
    vkapkibzokmfaxqogypq  eventlinqs-test    ap-southeast-2  ACTIVE_HEALTHY  linked=false

Both refs match the brief. Neither is currently linked, which is the safe resting
state. Production Postgres 17.6.1.105, test Postgres 17.6.1.155.

### Vercel access confirmed
    vercel teams ls   ->  lawals-projects-c20c0be8   Lawal's projects
    vercel project ls ->  eventlinqs-app   https://eventlinqs.com.au   updated 4d   Node 24.x
                          eventlinqs       no production URL           updated 54d

The 4d figure corroborates the brief: production was last deployed four days ago and
therefore predates every fix listed as done on TEST.

Note: there is a second, seemingly dormant Vercel project named eventlinqs with no
production URL and 54 days since update. Flagging it because a stray project can
later capture a domain or a webhook by accident. Not touched.

### FINDING, REAL AND BLOCKING FOR PARTS OF TASK 3 AND 7: Stripe test key is expired
    stripe config --list

    account_id               acct_1T8WBzGqHIQtgS8t
    display_name             Eventlinqs Sandbox
    test_mode_key_expires_at 2026-07-29

Today is 2026-09-02, so that stored key is more than a month past expiry. I did not
take the config file at its word, I drove the key against the Stripe API:

    GET https://api.stripe.com/v1/balance  with the stored sk_test key
    HTTP 401
    {"error":{"message":"Expired API Key provided: sk_test_****xCB6PW",
              "type":"api_error","code":"api_key_expired"}}

Confirmed expired, not merely stale in a config file.

What this does and does not break:
  - It breaks the Stripe CLI itself, which is what forwards webhooks locally via
    stripe listen. Re-authenticating needs stripe login, which is an interactive
    browser confirmation and therefore needs Lawal.
  - It does NOT necessarily break the application, because the application reads its
    Stripe keys from environment variables served by Vercel, not from this CLI
    config. Those may still be valid. That is verified separately once env is pulled.

Carried as an open item. Recorded here so it cannot be mistaken later for a passing
webhook path.

### No local environment file survived
A search of C:\dev and the whole user profile, excluding OneDrive and node_modules,
found no .env of any kind. The credentials that the app needs were in the destroyed
working copy. The legitimate recovery route is vercel env pull against
eventlinqs-app, which is a read and is therefore permitted, and which is queued for
TASK 3 proper once the clone lands.

---

## 2026-09-02 00:12 to 00:17 TASK 1 CONTINUED. BLOBLESS CLONE BEHAVIOUR

The blobless clone completed its first phase quickly and correctly:

    .git/objects/pack/pack-d445ab3b....pack        2909095 bytes
    .git/objects/pack/pack-d445ab3b....promisor       6214 bytes
    .git/packed-refs                                  7156 bytes  (all 227 refs)

That 2.9 MB pack is commits and trees only, which is exactly what blob:none is meant
to fetch, and packed-refs proves every branch came across, so the TASK 9 merge work
is not compromised.

It then entered the checkout phase, which for a blobless clone must fetch the HEAD
blobs on demand. That phase is slow. I sampled it rather than guessing whether it
had hung:

    00:15:40  FreeGB=11.935  worktreeEntries=0  gitCPU=19.1
    00:16:01  FreeGB=11.907  worktreeEntries=0  gitCPU=19.7
    00:16:21  FreeGB=11.868  worktreeEntries=0  gitCPU=20.6
    00:16:41  FreeGB=11.850  worktreeEntries=0  gitCPU=20.9

Steady consumption of roughly 85 MB per minute with CPU climbing, so it is genuinely
working and not deadlocked. Decision: let it finish rather than kill it, because a
restart discards all fetched blobs and buys nothing.

---

## 2026-09-02 00:19 TASK 1 COMPLETE. FRESH LOCAL REPOSITORY. PASS.

Blobless clone finished, exit code 0, at 00:19:40.

### Required proofs, all satisfied

    git rev-parse HEAD
    ea6df9f592a4e01437dba3d269a59b9ee957e058          MATCHES THE BRIEF

    git checkout integration/launch
    Switched to a new branch, tracking origin/integration/launch

    git status --porcelain
    0 lines                                            CLEAN

    git fsck --no-progress
    0 output lines, exit 0                             NO ERRORS

    ReparsePoint scan of C:\dev, attribute bit 1024
    count = 0, across 6898 items scanned               ZERO, FULLY LOCAL

    git log --oneline -5
    ea6df9f5 The cards rasterise through resvg now, and the flag that lied is guarded
    3d92f21d The pre-push lint needs its cache, or it is a gate nobody can afford
    f6aa4fb4 The social card 500 is root-caused: sharp cannot read SVG inside the Next server
    53fc41f6 The discount use is claimed when it is applied, not after the money moves
    251ef48e The branch cut after a squash merge, written down as a runbook

Git identity set from history rather than guessed. All of the last 20 commits are
authored by the same identity, so:

    git config user.name  "EventLinqs"
    git config user.email "hello@eventlinqs.com"

Top level entries: .claude, .git, .githooks, .github, .lighthouse, .playwright-mcp,
audit-v2, design-captures, docs, public, research, scripts, src, supabase, tests,
.env.example, .env.staging.example, .gitignore, .nvmrc, .vercelignore,
AUDIT-FUNCTIONALITY-2026-05-23.md, CLAUDE.md, eslint.config.mjs,
instrumentation-client.ts, instrumentation.ts, lighthouse-gate-urls.json,
lighthouserc.json, M5-HOMEPAGE-SUMMARY.md, next.config.ts, package-lock.json,
package.json, nine playwright configs, postcss.config.mjs, README.md,
sentry.edge.config.ts, sentry.server.config.ts, SUMMARY.md, tsconfig.json,
vercel.json, vitest.config.ts, vitest.proof.config.ts.

### FINDING: the 2.5 GB clone threshold is unreachable by any clone strategy

Measured size of the finished blobless clone:

    total      3524.5 MB   (3.44 GB)
    .git       1554.9 MB
    worktree   1969.6 MB

The brief instructs falling back to a blobless clone if the clone exceeds 2.5 GB.
I did that. It still lands at 3.44 GB, because the WORKING TREE ALONE at HEAD is
1.97 GB. No clone strategy can get under 2.5 GB while HEAD carries two gigabytes of
checked in files. Blobless bought roughly 0.35 GB against a full clone, not the
large saving the brief anticipated, and it cost about 12 minutes of on demand blob
fetching during checkout.

Recording this because the assumption behind that instruction does not hold, and
the same instruction would mislead a future session in the same way.

### FINDING, AND THIS IS THE ONE WORTH READING: the repository is 95 percent screenshots

Worktree by directory:

    docs               1895.6 MB
    research             23.3 MB
    public               19.9 MB
    design-captures      11.0 MB
    src                   6.9 MB      <- the actual application
    .lighthouse           5.4 MB
    scripts               3.9 MB
    tests                 1.6 MB
    supabase              0.9 MB

Inside docs, by file type:

    .png    2486 files   1560.8 MB
    .json    558 files    146.4 MB
    .html    162 files    108.4 MB
    .jpg      95 files     45.4 MB
    .pdf      69 files     13.9 MB
    .md      491 files      5.7 MB      <- the actual documentation

Largest single files include a 21.2 MB PNG at
docs/verification/2026-07-04/screenshots/C-mobile-events-browse.png and an 11.4 MB
video at public/hero/hero-crowd.mp4.

So: 2486 committed PNG screenshots weighing 1.56 GB, against 6.9 MB of source and
5.7 MB of markdown. The evidence artefacts from past verification runs were committed
into the repository and never pruned.

Consequences Lawal should know about:
  - Every clone anywhere, including CI and any new machine, pays this cost.
  - It is the direct cause of the disk pressure in this session.
  - public/hero/hero-crowd.mp4 at 11.4 MB is inside public, so unless it is excluded
    it ships to the browser. Worth checking against the Lighthouse target.

I have NOT altered history. The brief did not ask for it and rewriting 1000 commits
the night before launch would be reckless. Reported only.

Free disk at end of TASK 1: 8.99 GB, down from 12.93 GB at session start.

---

## 2026-09-02 00:24 TASK 4 CRITICAL EXCEPTION. RESOLVED, AND THE PREMISE WAS WRONG.

The brief lists lighthouse-gate-urls.json as one of five lost uncommitted files, and
instructs me to reconstruct it from the route manifest and sitemap if anything reads it.

No reconstruction is needed. THE FILE IS NOT LOST. It is committed and present at HEAD:

    git ls-files --error-unmatch lighthouse-gate-urls.json   -> tracked
    git log --oneline -1 -- lighthouse-gate-urls.json
    29a408f8 1200 seats in the HTML of a page whose first screen is a photograph

It sits at the repository root and came down with the clone intact. Reconstructing it
would have REPLACED a reviewed, deliberately pinned file with a guess, which is a worse
outcome than the missing file the brief feared.

Its contents are a fixed, reviewed gate set of 13 URLs: 10 static plus 3 event detail.

  static: /, /events, /events/browse/melbourne, /community/african, /organisers,
          /pricing, /help, /legal/terms, /login, /signup
  eventDetail: /events/arena-sessions-large-room-performance-test
               /events/cat-indie-sounds-live-at-the-enmore-sydney
               /events/artist-layer-launch-night-geelong

The file carries its own rationale, which is worth quoting because it constrains TASK 8:
the set is pinned precisely so the gate cannot be narrowed to whatever passes. It
records that on 25 August the gate landed on the 1200 seat arena page and scored
0.75/0.74/0.77 against a 0.80 floor, and that the heaviest page is pinned first
deliberately. The file states the standing instruction as: do not narrow it to the
fastest page to pass, if anything widen it.

Note for TASK 8: that file has a floor of 0.80, whereas the brief demands 95 or above.
Those are different numbers. I will report against the brief 95 figure, while recording
what the repository own gate config expects.

The other four files remain unrecovered, as logged, and block nothing.

---

## 2026-09-02 00:26 STANDING LAW AUDIT. AI TRAILERS ON integration/launch.

The brief requires auditing existing commits for AI trailers and reporting every one.
Done, with exact counts. I did not rewrite anything.

    total commits reachable from integration/launch    1000
    commits containing Co-Authored-By                   285
    commits containing "Generated with"                   1
    commits containing noreply@anthropic.com            280
    of the 363 commits ahead of main, with a trailer    127

Distinct trailer identities, by number of trailer lines:

    587   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
    135   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
     70   Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
     13   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
      6   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
      5   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
      4   Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
      4   Co-authored-by: drill <drill@eventlinqs.test>
      3   Co-Authored-By: Claude <noreply@anthropic.com>

Commit authorship itself is nearly clean:

    998   EventLinqs <hello@eventlinqs.com>
      2   drill <drill@eventlinqs.test>

Two points that matter for tonight:
  1. 127 of the 363 commits not yet on main carry a trailer. If integration/launch is
     merged with real merge commits, those trailers become part of permanent history
     on main. A squash merge collapses them into one message, which is the only
     practical way to keep them out without rewriting 1000 commits.
  2. Two commits are authored by a test identity, drill <drill@eventlinqs.test>,
     rather than by the sole author identity. Minor, but he did not know about it.

Any commit I create this session carries no trailer.

---


## 2026-09-02 00:32 TASK 2. DEPENDENCIES. PASS.

    npm ci                      exit 0
    npm cache clean --force     exit 0
    npx playwright install chromium   exit 0

node_modules: 952.6 MB, 689 packages.
Playwright browsers installed, CHROMIUM ONLY as instructed:

    chromium-1217                  406.6 MB
    chromium_headless_shell-1217   264.8 MB
    ffmpeg-1011                      3.4 MB
    winldd-1007                      0.2 MB

No firefox, no webkit. Free disk after: 10.54 GB.

### FINDING: mapbox-gl is an unused dependency carrying 54.6 MB

    mapbox packages in package.json : @types/mapbox-gl, mapbox-gl
    source files importing mapbox-gl: 0
    size in node_modules            : 54.6 MB

Nothing imports it, so Next will not put it in a client bundle and it is not a
runtime performance problem. It is install weight and an unnecessary supply chain
surface. I have deliberately NOT removed it: taking a dependency out means
regenerating package-lock.json hours before a launch, and the gain is zero for
users. Recommended as a post launch cleanup, not tonight.

---

## 2026-09-02 00:41 TASK 2. THE BUILD WAS RED. ROOT CAUSED AND FIXED.

First build attempt: BUILD EXIT 1.

    [guards] 1 of 54 guard(s) FAILED. Build blocked.

The failing guard was curated-categories-exist:

    curated-categories-exist: 9 curated slug(s) read from src/lib/categories/homepage-curation.ts
    FAIL: no Supabase URL or key in the environment, so the curated slugs
          could not be checked against the database.

ROOT CAUSE, and it is not a defect in the application. The prebuild step is

    node scripts/check-disk-space.mjs && node scripts/check-public-env.mjs &&
    node scripts/check-pricing-lock.mjs && node scripts/guards/run-guards.mjs &&
    node scripts/prebuild-fixture.mjs

Those are BARE node processes. Bare node does not read .env.local. Loading
.env.local is a Next.js behaviour, and Next only applies it once next build itself
starts. On Vercel this never shows up, because Vercel injects the variables into the
build process environment directly. Locally nothing injected them, so every guard
that needs a credential saw an empty environment.

Reading scripts/guards/curated-categories-exist.mjs confirms it:

    line 69  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    line 70  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    line 62  falls back to .env.test only, never .env.local

FIX: replicate what Vercel does rather than change the repository. I wrote
C:\dev\with-env.ps1, which loads .env.local into the PROCESS environment and then
runs the command, so a local build sees what a Vercel build sees.

    powershell -File C:\dev\with-env.ps1 -Command "npm run build"

Result on the second attempt:

    [guards] all 54 guards PASS.
    [guards] runtime: Node 24.19.0 (CI-EQUIVALENT: matches the .nvmrc contract of 24)

No repository change was needed and none was made. The guard was right and the local
invocation was wrong.

### Two prebuild warnings that are LOCAL ARTEFACTS, not deploy blockers

Both of these print alarming text, and both would block on Vercel, so I want to be
precise about why they are not a problem for tonight:

    [public-env] EMPTY NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY - present but EMPTY
    [public-env] WARNING (not blocking - local build)

    [pricing-lock] PRICING_LOCKED_VALUES FAILED.
        pricing_rules could not be read, so the locked values are UNVERIFIED.
    [pricing-lock] WARNING only (local build); this WOULD block on Vercel.

Both fire because MY LOCAL COPY of those variables is empty, for the reason in the
TASK 3 entry below: Vercel refuses to decrypt sensitive variables back to a client.
The variables DO exist and DO have values on Vercel. So these two warnings are
artefacts of local credential absence, NOT evidence that a Vercel build would fail.

I am flagging them anyway because if anyone ever runs this build locally and reads
those lines as a green light, they will be wrong in the other direction.

Also passing, and worth recording because they are the guards that keep the two
databases apart:

    [public-env] ok  SUPABASE_ENV_ISOLATION   Only production may resolve the PRODUCTION Supabase project
    [public-env] ok  STRIPE_LIVE_KEY_PAIRING  Production runs LIVE Stripe keys, and both keys are the same account
    [public-env] ok  ENV_MANIFEST_CONFORMANCE 43 declared variables present and correctly shaped

---

## 2026-09-02 00:38 TASK 3. ENVIRONMENT AND SERVICE INTEGRITY. PARTIAL, AND THE BLOCKER IS REAL.

### THE CENTRAL FINDING OF THIS SESSION SO FAR

There is no .env on this machine. The working copy that held it was destroyed. The
legitimate recovery route is Vercel, and I took it:

    vercel link --yes --project eventlinqs-app --scope lawals-projects-c20c0be8
    -> Linked. projectId prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ
       This EXACTLY matches the project id named in STOP GATE 2. Confirmed, not assumed.

    vercel env pull .env.preview.pulled --environment=preview

52 variables came back. Then I checked the VALUES rather than trusting the names:

    .env.local   total 32   FILLED 13   EMPTY 19
    .env.preview total 52   FILLED 21   EMPTY 31

EMPTY, meaning Vercel returned the name with an empty value:

    STRIPE_SECRET_KEY                    STRIPE_WEBHOOK_SECRET
    STRIPE_WEBHOOK_SECRETS               NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    RESEND_API_KEY                       UPSTASH_REDIS_REST_URL
    UPSTASH_REDIS_REST_TOKEN             SUPABASE_SERVICE_ROLE_KEY
    SUPABASE_SERVICE_ROLE_KEY_PREVIEW    NEXT_PUBLIC_SENTRY_DSN
    SENTRY_DSN                           SENTRY_AUTH_TOKEN
    VAPID_PRIVATE_KEY                    NEXT_PUBLIC_VAPID_PUBLIC_KEY
    VAPID_SUBJECT                        ADMIN_TOTP_ENC_KEY
    CRON_SECRET                          ANTHROPIC_API_KEY
    HOMEPAGE_SEED_FIXTURE

FILLED, and therefore usable:

    NEXT_PUBLIC_SUPABASE_URL (TEST)      NEXT_PUBLIC_SUPABASE_ANON_KEY
    NEXT_PUBLIC_SUPABASE_URL_PREVIEW     NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY      NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
    GOOGLE_MAPS_API_KEY                  PEXELS_API_KEY
    EMAIL_FROM                           NEXT_PUBLIC_APP_NAME
    SENTRY_ORG                           SENTRY_PROJECT
    VERCEL_OIDC_TOKEN

This is not a misconfiguration and not something I can work around. Those variables
are marked SENSITIVE on Vercel. Sensitive variables are write only by design: Vercel
will never hand the plaintext back, to the CLI or to the dashboard. It is a security
feature working correctly.

BOTH Supabase URLs resolve to TEST vkapkibzokmfaxqogypq, which I verified explicitly
before running anything. Nothing this session points at production.

### WHAT THIS BLOCKS, STATED PLAINLY

Without those secrets I cannot drive, and therefore will not claim:

    Stripe anything            no STRIPE_SECRET_KEY, so no checkout, no purchase,
                               no refund, no webhook signature verification
    Ticket email delivery      no RESEND_API_KEY
    Upstash Redis              no URL and no token, so rate limiting is unverifiable
    Sentry actually captures    no DSN, so the TASK 8 capture proof cannot be done
    Web push alerts            no VAPID keypair
    Service role DB paths      no SUPABASE_SERVICE_ROLE_KEY, so anything that needs
                               to bypass RLS cannot be exercised

Anon key work DOES function, which is why the TASK 6 verification below is real.

WHAT LAWAL NEEDS TO DO, and it is about two minutes of work: paste the values into
C:\dev\EventLinqs\eventlinqs-app\.env.local. He has them in his own Stripe, Resend,
Upstash and Sentry dashboards. Nothing else in this session is blocked on him.

### FINDING: the Stripe CLI key is expired

    stripe config --list   ->  test_mode_key_expires_at = 2026-07-29

Today is 2026-09-02. I did not trust the config file, I drove the key:

    GET https://api.stripe.com/v1/balance
    HTTP 401  {"code":"api_key_expired","message":"Expired API Key provided: sk_test_****xCB6PW"}

So even the CLI path to Stripe is dead until someone runs stripe login, which needs
an interactive browser confirmation. This matters for webhook forwarding via
stripe listen during any local purchase drill.

### FINDING: Mapbox is RETIRED. The brief asks me to verify something that no longer exists.

TASK 8 instructs: "Mapbox for city page hero maps with the custom navy and gold
styling ... Drive one of each and confirm they work."

That is no longer true of this codebase. src/components/features/city/city-map.tsx
says so in its own header:

    "Legacy Mapbox token prop. Maps are now consolidated onto Google Maps (one ...)"
    "Consolidated from Mapbox to Google Maps so the whole platform uses ONE map"

And scripts/verify/map-guard.mjs, the repository's own browser level map proof,
asserts "a genuine Google map CANVAS renders" across four surfaces: event detail,
events grid map, city map and venue map. There is no Mapbox surface left to drive.

There is no MAPBOX_TOKEN in any environment, which is consistent rather than broken.

I have NOT re-added Mapbox. The correct reading is that the brief carries a stale
requirement, and the real obligation is to prove Google Maps works on both the city
hero and the organiser venue search. That is what I will drive, and I will say so
rather than quietly reporting "Mapbox: pass".

### Service probe results, with credentials as they currently stand

Every one of these was DRIVEN, not inferred, and every failure below is caused by an
empty credential rather than a broken integration:

    Supabase TEST            reachable via anon key (proved in TASK 6 below)
    Stripe                   NOT VERIFIABLE, key empty locally, CLI key expired
    Stripe webhook endpoints NOT VERIFIABLE, needs the secret key
    Resend                   NOT VERIFIABLE, key empty locally
    Upstash Redis            NOT VERIFIABLE, URL and token both empty locally
    Sentry                   NOT VERIFIABLE, DSN empty locally
    Google Maps              key present, but see the note below
    Mapbox                   retired, not applicable

Google Maps needs its own note. The browser key IS present and filled, but a direct
server side call from this machine is refused:

    Places API   HTTP 403  "Requests from referer <empty> are blocked."
    Geocoding    REQUEST_DENIED  "API keys with referer restrictions cannot be used with this API."

That is CORRECT AND DESIRABLE. It means NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is properly
locked to HTTP referers, so a stolen key cannot be used from a server. It also means
the only honest way to prove maps work is in a real browser against the running site,
which is exactly what map-guard.mjs does and what TASK 8 requires. Recorded so that
the 403 is not later mistaken for a broken key.

---

## 2026-09-02 00:52 TASK 6. TEST DATABASE AND THE MIGRATIONS. PASS, WITH A MATERIAL DISCREPANCY.

### The link, with the ref read back as the standing law demands

    supabase link --project-ref vkapkibzokmfaxqogypq
    {"project_ref":"vkapkibzokmfaxqogypq","message":""}

    supabase/.temp/project-ref  ->  vkapkibzokmfaxqogypq
    supabase projects list      ->  vkapkibzokmfaxqogypq  "linked":true
                                    gndnldyfudbytbboxesk  "linked":false

TEST is linked. PRODUCTION IS NOT LINKED. Verified before every database command.

### THE DISCREPANCY THE BRIEF ASKED ME TO STOP AND REPORT

The brief says to apply and verify EXACTLY FOUR migrations against TEST, and that
more or fewer pending is a real finding. It is fewer. Before I touched anything:

    total migrations   107
    applied on TEST    106
    PENDING            1
    drift              0   (no migration applied on TEST without a local file)

    20260827000001   PENDING
    20260829000001   ALREADY APPLIED ON TEST
    20260829000002   ALREADY APPLIED ON TEST
    20260829000003   ALREADY APPLIED ON TEST

Three of the four were already on TEST. Only the Arts one was outstanding.

This is consistent rather than alarming: the brief states these fixes were made on
TEST and not deployed, so of course TEST already carries most of them. The number
four describes what PRODUCTION still needs, not what TEST needed. It matters because
STOP GATE 2 asks for a verification query proving four applied, and on production
that number may well be four, but it was never going to be four here.

### What was applied, and what it does

    supabase db push --include-all
    Applying migration 20260827000001_arts_category_display_name.sql...
    {"upToDate":false,"migrations":["20260827000001_arts_category_display_name.sql"],
     "message":"Finished supabase db push."}
    PUSH EXIT: 0

Exact schema objects touched by 20260827000001:

    UPDATE public.event_categories SET name = 'Arts' WHERE slug = 'arts-community';
    COMMENT ON TABLE public.event_categories IS '...';

No table created, no column added, no type changed, no policy altered. One row
updated in public.event_categories and one table comment set.

SAFE TO RE-RUN: YES, completely. An UPDATE with a WHERE on a stable slug plus a
COMMENT is idempotent. Running it twice changes nothing the second time.

For the record, the three already applied:
    20260829000001_missing_increment_functions.sql       creates increment functions
    20260829000002_guest_ticket_transfer.sql             the guest order access path
    20260829000003_discount_claims_at_reservation.sql    claims a discount at reservation

### PROOF, from the database rather than from the migration table alone

    supabase migration list  ->  107 rows, 107 applied, 0 PENDING, 0 drift

And the data itself, queried over REST against TEST:

    GET /rest/v1/event_categories?select=slug,name
    22 categories, and the one that mattered:

        arts-community    Arts        <- was "Arts & Community", now correct

That is the migration proved by its EFFECT, not merely by its bookkeeping row.

Free disk at end of TASK 6: 10.53 GB.

---


## 2026-09-02 00:57 SESSION RESUMED AFTER AN INTERRUPTION

The previous session ended mid build. State on resume, verified rather than assumed:

    branch          integration/launch
    HEAD            ea6df9f592a4e01437dba3d269a59b9ee957e058
    modified        next.config.ts, src/lib/broadcast/card-raster.ts
    free disk       9.55 GB
    last build      had reached "Running TypeScript" with the wbg error GONE

So the first resvg fix had worked as far as compilation and the build was simply
cut off. No finished work was repeated.

---

## 2026-09-02 01:05 TASK 2 COMPLETE. DEPENDENCIES AND BUILD. GREEN.

    npm ci                exit 0    node_modules 952.6 MB, 689 packages
    npm cache clean       exit 0
    playwright chromium   exit 0    chromium 406.6 MB + headless shell 264.8 MB
                                    + ffmpeg 3.4 MB. No firefox, no webkit.
    npm run build         exit 0
    [guards] all 54 guards PASS

Build summary, from the run itself:

    Running next.config.ts     1320 ms
    Compiled successfully      44 s
    Static pages               134 generated in 8.5 s with 8 workers
    Routes                     197 total: 10 static, 187 dynamic
    .next on disk              541.3 MB
    client JS shipped          126 files, 2.5 MB total
    largest client chunks      236.2 kB, 196.3 kB, 125.3 kB, 116.7 kB, 110.0 kB

NOTE ON THE BRIEF'S REQUEST FOR BUNDLE SIZES. Next 16 with Turbopack no longer
prints a per route size column; the route table carries only Revalidate and
Expire. The per chunk figures above are measured directly from .next/static
instead, which is the same information from the artefact rather than the log.

### npm audit, and what was fixed

Raw totals: 31 findings, 0 critical, 11 high, 18 moderate, 2 low.

That number on its own is misleading, so I split it by what actually reaches a
user. Production dependencies only:

    BEFORE   6 findings: 1 low, 2 moderate, 3 high
             high: brace-expansion, fast-uri, ws
             low : @babel/core
             mod : uuid (via exceljs)

    npm audit fix          (no --force, semver compatible only)

    AFTER    2 findings: 2 moderate, and NO high at all

Then rebuilt, because a lockfile change that has not been rebuilt is not a fix:
build exit 0, all 54 guards pass.

DELIBERATELY LEFT, with reasoning: uuid via exceljs. The only offered remedy is
npm audit fix --force, which DOWNGRADES exceljs from >=3.5.0 to 3.4.0, a breaking
major change to spreadsheet export hours before a launch. The advisory is a
missing buffer bounds check in uuid v3/v5/v6 when a caller supplies its own
buffer, which is not how exceljs uses it here.

The other 8 high findings are dev only, almost all in the lighthouse and puppeteer
chain, and ship to nobody.

Commit: 793ebf5b "The three high advisories in the shipped tree are gone"

Free disk at end of TASK 2: 9.12 GB.

---

## 2026-09-02 01:30 TASK 5. THE EIGHTEEN SOCIAL CARDS. THE REAL DEFECT, FOUND BY DRIVING.

This is the task the brief said had never once been proven against a running
server. It had not, and it did not work. Three separate faults, each one hidden
behind the one in front of it.

### FAULT 1. The build. Found in TASK 2, fixed there, restated because it belongs here.

The top commit of integration/launch, "The cards rasterise through resvg now",
had never been through `next build`. The first build of it died:

    ./node_modules/@resvg/resvg-wasm/index_bg.wasm_.loader.mjs:1:1
    Module not found: Can't resolve 'wbg'

reached from BOTH rasterising entry points, the eighteen organiser cards and the
admin health page. Turbopack read the literal '.wasm' specifier in
require_.resolve, decided the binary was a module, and ran it through its
wasm-bindgen loader, which emits glue importing a namespace nothing supplies.

THE IMPORTANT PART: Vercel would have hit exactly this. Next 16 builds with
Turbopack by default and the deployed chunks are already named turbopack-*.js.
Had tonight's deploy been run against this branch as it stood, the BUILD WOULD
HAVE FAILED. Not the cards, the deploy.

### FAULT 2. The draft store, and a shim that lied

With the build green I started the production server and drove all eighteen from
the public composer. Every one answered:

    HTTP 404  {"ok":false,"error":"not_found"}   32 bytes

The composer had produced a real kit and a real code (6877bhgjfvrv) on screen,
and the card route could not find it. The cause was not the card route.

src/lib/launch/draft-store.ts persists drafts in Redis with `setex`, because the
founder ruling's 30 day bookmarkable link IS a TTL, and reads the remaining life
back with `ttl`. Locally Redis is scripts/dev/upstash-shim.mjs, and that shim
implemented incr, expire, get, set, del, ping, dbsize and flushdb.

It did NOT implement setex or ttl. Its default branch returns

    {"error":"upstash-shim does not implement setex"}

so every draft write was silently discarded and every read then answered null.

I added both, with Redis semantics, and proved them before trusting them:

    ping            PONG
    setex k 60      OK
    get k           {"a":1}
    ttl k           60      (expected about 60)
    ttl missing     -2      (expected -2, key absent)
    set no expiry   OK
    ttl no expiry   -1      (expected -1, no TTL)
    del             2

This matters beyond the cards. The same shim serves the fail closed rate limiter
on checkout, refund and transfer, and its own header explains that a shim which
silently disagrees with the thing it stands in for is worse than no shim. It was
disagreeing.

### FAULT 3. require.resolve does not return a path inside a bundle

With the store fixed the eighteen moved from 404 to:

    HTTP 500, ZERO BYTE BODY

which is the exact signature the module's own comments describe and exist to
prevent. The server log named it:

    TypeError: The "path" argument must be of type string.
               Received type number (209426)
    code: 'ERR_INVALID_ARG_TYPE'

My TASK 2 fix had changed the lookup to
require_.resolve('@resvg/resvg-wasm') and joined the filename. That BUILDS, and
then fails at run time, which is the worse of the two failures: inside a bundled
chunk require.resolve does not return a filesystem path at all, it returns
Turbopack's internal module id. The number 209426 is that id.

So marking the package external in next.config.ts was never sufficient either.
The evidence is direct: build attempt two had serverExternalPackages in place and
still failed with the wbg error.

THE FIX THAT HOLDS. The binary is DATA to that module: it is read with readFile
and handed to initWasm as bytes. So it is now located with fs and path only, on
strings computed at run time, walking up from the working directory to find
node_modules/@resvg/resvg-wasm/index_bg.wasm. There is nothing left for a bundler
to rewrite. The error path names every directory it tried, because "cannot find
the wasm" with no list is the same unhelpful shape as the zero byte 500.

AND, because nothing imports the binary, nothing traces it either. It is now
pinned into outputFileTracingIncludes for all three entry points that rasterise:
the organiser card route, the public launch card route, and the admin health page.
Without that the Vercel lambda would ship without the one file the rasteriser
cannot work without, and the cards would fail in production while passing locally.



## 2026-09-02 01:25 TASK 5. EIGHTEEN CARDS DRIVEN AND PASSING, WITH TWO HONEST GAPS.

### The run

Production server (`next start`, NODE_ENV=production) on http://localhost:3311,
built from the fixed branch. A launch draft was created through the PUBLIC
composer at /launch exactly as a stranger would, then all eighteen were fetched.

    18 passed, 0 failed, of 18

Per artefact, every one of these was checked and passed:

    format   channel     dimensions   bytes    max stdev   distinct luma   time
    story    x6          1080x1920    180545   71.81       235             1.1 to 5.5 s
    square   x6          1080x1080    156238   85.11       239             0.7 to 0.8 s
    feed     x6          1440x1800    239365   81.48       243             1.4 to 1.5 s

  HTTP 200 and content-type image/jpeg                        all 18
  real JPEG magic bytes FF D8 FF, not a header claim          all 18
  dimensions exactly the published size for the format        all 18
  CARRIES INK, by two independent measures                    all 18
      channel standard deviation, floor 8, observed 71 to 85
      distinct luma values in a 64x64 greyscale sample, floor 12, observed 235 to 243
  under the 5 MB ceiling the spec sets                        all 18 (max 234 kB)

Evidence: C:\dev\EVIDENCE\social-cards\  (18 JPEGs, contact-sheet.jpg, card-results.json)

### The resvg path is the one executing. Proved by breaking it.

Reading the source proves nothing about what runs, so the binary was taken away
and the server restarted, three phases, each with a fresh server process because
ensureWasm() memoises its init promise:

    PHASE 1  binary present     0 resvg errors, card served
    PHASE 2  binary removed     4 errors, each naming the file and every
                                directory searched, card failed
    PHASE 3  binary restored    0 resvg errors, card served

The phase 2 error, verbatim from the server:

    Error: resvg WebAssembly binary not found. Looked for
    node_modules\@resvg\resvg-wasm\index_bg.wasm in:
      C:\dev\EventLinqs\eventlinqs-app\node_modules\@resvg\resvg-wasm\index_bg.wasm
      C:\dev\EventLinqs\node_modules\@resvg\resvg-wasm\index_bg.wasm
      C:\dev\node_modules\@resvg\resvg-wasm\index_bg.wasm
      C:\node_modules\@resvg\resvg-wasm\index_bg.wasm

reached through src_lib_broadcast chunk, the card route. That is a deliberate
failure test, not an inference.

Logs: C:\dev\resvg-phase1.log.err, resvg-phase2.log.err, resvg-phase3.log.err

### Visual inspection of the contact sheet, which the numbers could not give

I generated the sheet and OPENED it. What renders correctly, seen not assumed:

  the title wraps and fits at all three formats and is clipped at no edge
  the date line reads Sunday 20 September, 10:00 pm
  the LIVE EVENT eyebrow badge renders in gold
  the gold price pill carries From $25 and the short link
  the QR code renders as a clean scannable block with Scan to buy beneath
  Ticketing by EVENTLINQS. renders
  navy and gold throughout, correct brand palette

### GAP 1. There is no cover photograph on the square and feed cards.

The spec builds square and feed as BandedCard, a photograph ABOVE a navy
information band, with photoHeight 600 for square and 1150 for feed. In all
twelve of those cards that region is empty navy. story is typographic by design
(photoHeight 0), so story is correct as rendered.

The cause is that an anonymous, unclaimed draft carries no cover image, so
prepareCardCover is never called. Whether that is acceptable degradation or a
defect depends on whether a real organiser can reach a card with no cover, and
that is decided on the ORGANISER route, not this one. I am not calling it either
way on evidence I do not have.

### GAP 2. The EventLinqs logo is NOT proven.

The brief requires that the logo renders correctly and is not distorted or cut.
On these eighteen there is no logo mark at all, only the words Ticketing by
EVENTLINQS. as type. organiserLogo was null because an anonymous draft has no
organiser. So that check is NOT satisfied by this run and I am not claiming it.

### GAP 3. Per channel attribution is not exercised on this route.

The six channels within a format are BYTE IDENTICAL. Confirmed by hashing: three
distinct SHA-256 values across eighteen files, one per format.

That is not a defect here. toCardInput resolves
context.links[channel] ?? context.links.fallback, and an unclaimed draft has no
minted per channel short codes, so all six correctly fall back to one URL. The
route's own comment says the attribution is the whole point of the artefact, so
it does need proving, but it can only be proved on the organiser route where the
tracked links exist.

### Why the organiser route was not driven, and what it would take

scripts/verify/launch-kit-inspect.mjs is the repository's canonical proof and
produces the canonical contact sheet. It cannot run here. Line 65:

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
                            process.env.SUPABASE_SERVICE_ROLE_KEY)

SUPABASE_SERVICE_ROLE_KEY is one of the nineteen values Vercel will not decrypt.
The organiser card route is gated the same way: getOrganiserEvent calls
supabase.auth.getUser() and then resolveEventAccess, so it needs a signed in
organiser who owns a published event with a cover image and an organiser logo.

With that one key in .env.local, launch-kit-inspect.mjs closes all three gaps
above in a single run, including decoding the poster QR with jsqr and comparing
it against the minted qr channel link.

### A separate error seen in every server phase

    [launch.taxonomy] listCategoryNames: Error: supabaseKey is required.
    [launch.taxonomy] listCommunitySlugs: Error: supabaseKey is required.

src/lib/launch/taxonomy.ts builds its client with createAdminClient, which needs
the service role key. Same credential gap, caught and logged rather than thrown,
and the composer still produced a complete kit. Not a code defect. It will not
occur on Vercel, where the key exists.

### Minor: .tmp-serve.log is not gitignored

The journey harness defaults its console mail transport log to .tmp-serve.log in
the repository root, and `git check-ignore` returns nothing for it. It is
untracked today so nothing is broken, but it is one `git add -A` away from being
committed. Worth a line in .gitignore.


