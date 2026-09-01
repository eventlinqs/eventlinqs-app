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

