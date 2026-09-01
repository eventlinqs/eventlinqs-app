EVENTLINQS LAUNCH READINESS SESSION

OPERATOR: Lawal Adams, sole founder and sole author of this platform.
He is at work and unreachable for the duration. Make no decision that requires
him except at the two STOP GATES, which are absolute.

OBJECTIVE: bring EventLinqs to a verified launch ready state so that the only
work remaining when he returns is the production writes held at the stop gates.
He intends to launch tonight and go to market tomorrow. Work accordingly.

WHERE THINGS STAND, SO YOU DO NOT REDISCOVER IT
- Live and proven on production today: ticket purchase and refund, both driven
  with a real card and real money returned. Four migrations applied. Database
  password rotated. Search Console verified, sitemap submitted, 586 URLs.
- Fixed on TEST but NOT deployed: guest magic link, discount reservation claim,
  ticket email, paid publish refusal, cover composer, two label guards, seat map,
  door scanner. Nine of ten stranger journeys pass on TEST.
- Production therefore runs code predating all of that. Today a guest cannot
  reach their own order, no discount code can be created, and the eighteen
  social cards fail.
- The old working copies at C:\Users\61416\OneDrive\Desktop\EventLinqs had their
  .git destroyed by OneDrive sync. Both eventlinqs-app and el-moat are dead.
  GitHub is the source of truth. integration/launch is at
  ea6df9f592a4e01437dba3d269a59b9ee957e058 and main is at
  9cf7d3651f0d3b24ea4750d35f4eb378210a9d22.

=====================================================================
SECTION A. STANDING LAWS. NON NEGOTIABLE. THESE OVERRIDE CONVENIENCE.
=====================================================================

ENVIRONMENT
- Windows PowerShell 5.1. Begin every command group with:
    $env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
  and an explicit Set-Location. Never rely on an inherited working directory.

DATABASES
- PRODUCTION SUPABASE gndnldyfudbytbboxesk IS READ ONLY FOR THIS ENTIRE SESSION.
  No db push. No storage writes. No policy or schema change. No seed. Nothing.
- TEST SUPABASE vkapkibzokmfaxqogypq is yours to write to freely.
- Before ANY supabase command, run the link and READ THE PROJECT REF BACK, and
  log it. Never assume the link. A mislinked db push reports success and changes
  nothing, and that is how a platform goes live believing in migrations it does
  not have.

ONEDRIVE
- C:\Users\61416\OneDrive\Desktop\EventLinqs is a COLD ARCHIVE.
  It may be READ from, once, in TASK 4 only, read only, time boxed.
- Never write, move, delete or repair anything there. Never attempt to revive
  either repository there. Do not restart OneDrive.exe. It drains the disk.

AUTHORSHIP AND LANGUAGE
- Lawal is the sole author. No AI trailers, no Co-Authored-By, no "Generated
  with", in any commit you create. Also AUDIT the existing commits on
  integration/launch for such trailers and report every one you find.
- Australian English throughout: code, comments, docs, copy, commit messages.
- No em dashes, no en dashes, no hyphens surrounded by spaces, anywhere.

THE COMPLETION LAW, WHICH MATTERS MORE THAN SPEED
- SHIP 100 PERCENT. Nothing is called done while partially built.
- NEVER record something as working unless you drove it and observed the result.
  Not "should work". Not "the code looks correct". Not "tests exist for this".
- WORKING MEANS: a real organiser or a real attendee could do this unaided, in a
  real browser, and it succeeded, and you hold a screenshot or a hard assertion
  proving it. A green unit test is not evidence of working. A driven flow is.
- FIX EVERYTHING YOU FIND BEFORE STARTING THE NEXT TASK. Do not log it for later.
  If fixing X requires touching Y, finish Y properly, then return and close X
  before moving on.
- If you must leave something incomplete to unblock a dependency, you must come
  back and finish it in the same session, and the log must say so explicitly.

AUTHORITY
- Repo CLAUDE.md is the single source of truth.
- docs/EventLinqs_Scope_v5.md is the authoritative 12 module scope. Never invent
  module numbers from memory.
- docs/STRATEGY-LOCK.md governs positioning.

THE LOG
- Write to C:\dev\SESSION-LOG.md continuously, newest last, every entry stamped
  with the time. For every task record: what you ran, what you observed, pass or
  fail, what you fixed, and free disk before and after.
- Assume the session may be interrupted at any moment. The log must be good
  enough for a cold restart to resume from it without re-doing finished work.

=====================================================================
SECTION B. DISK DISCIPLINE. THIS MACHINE IS TIGHT.
=====================================================================
- Starting point is roughly 13.2 GB free on C:. The floor is 5 GB and it is
  never to be breached under any circumstance.
- Log free space at the start and end of every task.
- If free space falls below 6 GB at any point: STOP the current task, reclaim
  (npm cache clean --force, delete .next, delete duplicate evidence files,
  clear temp), log exactly what you reclaimed, then continue.
- If you cannot get back above 6 GB, STOP THE SESSION, write a clear handover at
  the top of SESSION-LOG.md naming what is done and what is not, and stop.
  Do not push on regardless. A session that fills the disk destroys the work.
- Reserves available if genuinely desperate, but log before touching them:
  C:\Users\61416\Downloads is 15.4 GB, C:\Users\61416\Music is 18.6 GB.
  Do not delete either without recording exactly what you removed.

=====================================================================
TASK 0. DISK GATE
=====================================================================
Report free space on C:.
HARD GATE: 12 GB minimum to proceed. If under, reclaim from AppData caches and
Windows temp only, never from OneDrive. If you cannot reach 12 GB, log it and
stop.

=====================================================================
TASK 1. FRESH LOCAL REPOSITORY, PERMANENTLY OFF ONEDRIVE
=====================================================================
git clone https://github.com/eventlinqs/eventlinqs-app "C:\dev\EventLinqs\eventlinqs-app"
Set-Location there, then git checkout integration/launch

MEASURE THE CLONE. Log its on disk size.
If it exceeds 2.5 GB, delete it and re-clone as a blobless partial clone:
  git clone --filter=blob:none https://github.com/eventlinqs/eventlinqs-app "C:\dev\EventLinqs\eventlinqs-app"
That keeps every branch and all history so the merge work in TASK 9 still
functions, but fetches file contents on demand. Verify soundness afterwards with
git log --oneline -5 and a clean git status on integration/launch.

PROVE AND LOG ALL OF THESE:
- git rev-parse HEAD equals ea6df9f592a4e01437dba3d269a59b9ee957e058
- git status is clean
- git fsck reports no errors
- A recursive scan of C:\dev finds ZERO paths carrying the ReparsePoint
  attribute (bit 1024). Report the count. It must be zero. This is the proof
  the project is genuinely off OneDrive and fully local, which is the entire
  point of this task.
- Full list of top level entries

Set git user.name and user.email to match the identity already used in the
repository history. Verify by inspecting recent commits, not by guessing.

=====================================================================
TASK 2. DEPENDENCIES AND BUILD, PROVEN
=====================================================================
npm ci    (npm ci, not npm install)
Then npm cache clean --force
Then a full production build.

Install Playwright browsers for CHROMIUM ONLY. Do not install firefox or webkit.
Chromium serves the journeys, the three viewport runs, Lighthouse and axe, and
skipping the other two saves roughly 1 GB.

Delete the .next directory before every fresh production build rather than
letting outputs accumulate.

PROVE: npm ci and the build both exit 0. Log the full build summary including
route count and bundle sizes. Investigate every warning that indicates a real
defect and fix it.
Run npm audit. Log high and critical findings. Fix those fixable without
breaking the build; log with reasoning any you deliberately leave.

A RED BUILD IS THE TASK. Do not proceed past it. Fixing it is the work.

=====================================================================
TASK 3. ENVIRONMENT AND SERVICE INTEGRITY
=====================================================================
Before driving anything, confirm the local environment can actually reach what
it needs, and log each one as reachable or not:
- Supabase TEST vkapkibzokmfaxqogypq
- Stripe in sandbox, including the configured webhook
- Resend for transactional email
- Upstash Redis
- Mapbox
- Google Maps Places API
- Sentry
Any missing or misconfigured environment variable is a finding. Fix it or log it
precisely with what is needed. Do not silently proceed with a dead integration
and then report journeys as passing.

=====================================================================
TASK 4. RECOVER THE FIVE UNCOMMITTED FILES. READ ONLY. NON BLOCKING.
=====================================================================
TIME BOX: 15 minutes total. Do not exceed it.
Attempt one read only pass over the OneDrive archive for:
  docs/roast/MOVE-OFF-ONEDRIVE.md
  scripts/ops/move-off-onedrive.mjs
  docs/verification/PRE-MERGE-BLOCKER-SWEEP-2026-08-29.md
  docs/POST-LAUNCH-FINDINGS.md
  lighthouse-gate-urls.json
Check both eventlinqs-app and el-moat. Both repositories there are destroyed, so
you may also try recovering blobs from
C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app\.git\objects
using git plumbing against a scratch repository elsewhere. Read only. Still
inside the 15 minutes.

If recovered: copy into C:\dev, git add by explicit path, verify exactly five
staged and nothing else, commit in Australian English with no trailer, push,
then verify local HEAD equals remote HEAD.

IF NOT RECOVERED: log it and CONTINUE. Four documents and one ops script. They
block nothing and the move they describe is already done differently.

CRITICAL EXCEPTION, DO NOT SKIP THIS:
grep the repository for any reference to lighthouse-gate-urls.json. If anything
reads it, RECONSTRUCT the file from the route manifest and sitemap so the
Lighthouse gate actually runs against the right URL set. A missing config file
that causes a gate to silently pass is worse than a failing gate.

=====================================================================
TASK 5. THE EIGHTEEN SOCIAL CARDS, DRIVEN FROM A RUNNING SERVER
=====================================================================
This has never once been proven against a live server. The resvg swap is built
and pixel proven in isolation but has never executed against a running build.
Prove it now, properly.

Start the production server. Request all three formats across all six channels.

FOR EACH OF THE EIGHTEEN, INDIVIDUALLY, PROVE AND LOG:
- HTTP 200 and the correct content type
- Decodes as a valid JPEG
- Pixel dimensions exactly match the published size for that channel and format
- CARRIES INK: inspect actual pixel variance. A blank or near uniform image
  FAILS even at a plausible byte count. File size is not evidence.
- Text is legible, correctly positioned, and not clipped at any edge
- The EventLinqs logo renders correctly and is not distorted or cut

Confirm the resvg path is genuinely the one executing, not merely present in the
source. Prove it by instrumentation or by a deliberate failure test, not by
reading the code.

Then regenerate the Launch Kit contact sheet and confirm EVERY artefact on it
passes. Open the contact sheet and inspect it visually, do not just check it was
written.

Save all eighteen plus the contact sheet under C:\dev\EVIDENCE\social-cards\
so Lawal can review them without running anything.

Any failure is fixed here and now.

=====================================================================
TASK 6. TEST DATABASE AND THE FOUR MIGRATIONS
=====================================================================
Link to TEST and READ THE REF BACK. It must report vkapkibzokmfaxqogypq.
If it reports anything else, stop and log it as a blocking finding.

Apply and verify exactly four migrations against TEST:
  20260827000001
  20260829000001
  20260829000002
  20260829000003
EXACTLY FOUR. If more or fewer are pending, stop and log the discrepancy in
full detail. That is a real and important finding, not noise.

PROVE: query the migrations table afterwards and log the applied list verbatim.
For each migration, log the exact schema objects it creates or alters, so that
tonight's production run is fully predictable before it is run.
Note for each whether re-running it would be safe.

=====================================================================
TASK 7. THE TEN STRANGER JOURNEYS, DRIVEN AS A REAL HUMAN WOULD
=====================================================================
Nine of ten passed previously. Drive all ten again against TEST, in a real
Chromium browser, at three viewports: mobile 390, tablet 768, desktop 1440.

The ten cover at minimum:
  guest magic link
  discount reservation claim
  ticket email delivery
  paid publish refusal
  cover composer
  label guard one
  label guard two
  seat map
  door scanner
  ticket purchase and refund end to end

IDENTIFY THE TENTH, the one that does not pass, and FIX IT. That is a core
deliverable of this session, not an optional extra.

FOR EACH JOURNEY AT EACH VIEWPORT LOG: name, viewport, pass or fail, duration,
and the screenshot path.
Save screenshots under C:\dev\EVIDENCE\journeys\

Working means a real organiser or a real attendee could complete this unaided.
If a journey passes only because a test seeded state a real user could not
create, that journey FAILS. Say so and fix it.

=====================================================================
TASK 8. QUALITY, CONTENT AND COMMERCIAL GATES. ALL OF THEM.
=====================================================================
PERFORMANCE AND ACCESSIBILITY
- Lighthouse on the production build: 95 or above on BOTH desktop and mobile,
  across the gate URL set. Non negotiable. Fix what fails.
- axe-core: zero violations. Fix what fails.
- Lint clean, typecheck clean, full test suite green.

LANGUAGE AND POSITIONING, LOCKED AND PERMANENT
- BANNED TERMS. These must appear NOWHERE in user facing copy:
  diaspora, friends-launch, culture-first, "Where the culture gathers",
  and any user facing use of culture, cultural or cultures.
  The word is community, with no exceptions.
- The tagline must read exactly: Every community. Every event. One platform.
- Positioning is COMMUNITY FIRST, not culture first. Community means who you
  associate with: heritage, genre, faith, sport, scene. Open to all events.
- The platform must read as a complete general ticketing platform first, across
  sports, music, comedy, theatre, family, festivals, food and corporate.
  Community is a go to market layer of roughly 10 to 20 percent of the surface,
  not the dominant identity.
- No generic content anywhere. If copy reads like filler, it is a defect.

COMMERCIAL CORRECTNESS
- Verify on the RENDERED checkout, not the constants file: platform fee 3.5
  percent plus $0.99, processing 2.5 percent, free events free, pass on by
  default, ACCC compliant all in price display.
- Verify Stripe uses destination charges with transfer_data.destination.
- Verify the payout tier logic displays correctly: Tier 1 three day post event
  with 20 percent reserve, Tier 2 pre event after first successful event capped
  at $50K, Tier 3 reduced 10 percent reserve capped at $250K after five events
  and $50K volume.
- Verify the venue revenue share is opt in and writes to the append only ledger.

TAXONOMY AND DISCOVERY
- Verify the Scenes V2 rail renders both families correctly.
  SOUNDS: Electronic and Dance, Country, Indie and Rock, Hip-Hop and RnB, Pop,
  Folk and Acoustic, Blues and Roots, Afrobeats and Amapiano, Latin, Caribbean
  and Dancehall, Jazz and Soul, Metal and Hardcore.
  COMMUNITIES: First Nations first, then South Asian, Asian, Pasifika and Maori,
  Mediterranean, Pride, Faith and Worship.
- Verify First Nations is genuinely first in the rendered order.
- Verify the demand engine functions: taste and follow graph, personalised
  discovery feed, and the alert engine including PWA web push and the email
  backbone. Drive at least one alert end to end.

DESIGN STANDARDS
- Navy and gold, light, luxury, refined.
- Trust signals are CONTEXTUAL ONLY: a small icon row below "Get tickets" on the
  event detail page, full trust treatment on checkout near the payment form, and
  ZERO trust signals on the homepage, browse and marketing pages. Verify this in
  the rendered pages and fix any violation.
- These are rejected and must not appear: bento grids, dark themes,
  glassmorphism, scroll hijacking, holographic WebGL tickets, NLP search.
- Verify the logo renders correctly at every size, on every page and every card.

MAPS
- Mapbox for city page hero maps with the custom navy and gold styling.
- Google Maps Places API for venue search, geocoding and autocomplete in
  organiser flows.
- Drive one of each and confirm they work.

OBSERVABILITY AND SEO
- Verify Sentry is initialised and ACTUALLY CAPTURES, by triggering a test error
  and confirming it arrives. Do not accept configuration as proof.
- Verify the sitemap resolves and log its URL count against the 586 submitted to
  Search Console. Explain any difference.
- Verify robots, canonicals and OpenGraph tags on event, city and browse pages.
  The OG tags are what consume the eighteen social cards, so a card that renders
  but is not referenced is still a failure.
- Verify the national seed of 261 published events across 20 Australian cities
  is intact and rendering.

Save every report under C:\dev\EVIDENCE\gates\

=====================================================================
TASK 9. PREPARE THE MERGE. DO NOT PUSH IT.
=====================================================================
Prepare the merge of integration/launch into main on a LOCAL branch named
launch-prepared. Resolve every conflict. Four squash conflicts are expected from
previous attempts.

Log every conflict and exactly how you resolved it, file by file, with your
reasoning. Lawal will review this before it goes anywhere.

Rebuild and re-run the FULL gate set from TASK 8 on launch-prepared. It must be
as green as integration/launch or greener. If preparing the merge broke
anything, fixing it is part of this task.

Leave launch-prepared LOCAL and UNPUSHED. Do not open a pull request. Do not
merge. Never use gh pr merge --admin.

=====================================================================
STOP GATE 1. ARTS STORAGE OBJECT. DO NOT RUN.
=====================================================================
Copying the Arts storage object to production is a production write and is
FORBIDDEN this session. It must happen BEFORE any deploy or the Arts tile 404s
on the homepage. This is an ordering constraint, not a preference.

Write the exact ready to run command to C:\dev\PRODUCTION-STEPS.md, together
with how to verify the object exists afterwards and how to confirm the tile
renders on the live homepage.

=====================================================================
STOP GATE 2. PRODUCTION MIGRATIONS AND DEPLOY. DO NOT RUN.
=====================================================================
Write to C:\dev\PRODUCTION-STEPS.md, in strict order, each with its exact
expected output so success can be told apart from silence:
  1. The supabase link command for gndnldyfudbytbboxesk
  2. The command that READS THE REF BACK, with the exact expected output
  3. The db push command
  4. The verification query proving exactly four migrations applied
  5. The Vercel deploy command for prj_YIHLHcjuQfg4RmtNt7JekkcTVznJ
  6. Post deploy smoke checks against www.eventlinqs.com.au:
     guest magic link, discount code creation, one social card fetched live,
     the Arts tile rendering, one real ticket purchase, one real refund
Include the rollback command for each step that has one.

=====================================================================
FINISHING
=====================================================================
Write a summary at the TOP of C:\dev\SESSION-LOG.md containing:
- What is PROVEN, each item with its evidence path
- What FAILED, with your best diagnosis and what you tried
- What is waiting at the two stop gates
- Free disk remaining
- Anything you discovered that Lawal does not yet know about, however small
- Your honest assessment of whether this platform is ready to go in front of
  real organisers and real ticket buyers tonight, and if not, precisely what
  stands in the way

Do not claim anything is done that you did not drive.
Do not soften a failure. He would rather read a hard truth at six o'clock than
discover it from a customer at nine.

If you run low on context, checkpoint the log first so the session can resume
cleanly, then continue.
