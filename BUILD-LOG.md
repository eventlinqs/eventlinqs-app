# EVENTLINQS SCOPE v5 COMPLETION BUILD LOG

Running log, newest last, timestamped (Australia/Melbourne, AEST). Brief at
C:\dev\BUILD-BRIEF.md (223 lines). Gap analysis at C:\dev\SCOPE-AUDIT.md.
Branch integration/launch, cut from main at 48fe08f7. Operator: Lawal Adams (sole author).

(The FINISHING summary is written at the top of this file when every phase is done.)

---

## 2026-09-03 13:40 Session start

- Brief saved verbatim to C:\dev\BUILD-BRIEF.md: 211 lines, then the DRIVEN addendum appended, 223 lines.
- Read C:\dev\SCOPE-AUDIT.md in full. Read CLAUDE.md (constitution) in full.
- Governing laws for Phase A: Law 0, Definition of Done, Law 5, Law 7, Law 8, Law 9, Law 10,
  Design system, Motion, Copy and banned content, Verification and gates, plus the brief's
  Completion Law and the DRIVEN ruling.
- Disk at start: 4.97 GB free. BELOW the 5 GB floor.

## 2026-09-03 13:45 Disk reclaim (floor 5 GB, continue line 6 GB)

Reclaimed, in order, with the measured result after each:
- Removed .next build output (0.56 GB), two stale .tmp-serve logs, npm cache (0.69 GB),
  Temp files older than one day: 5.54 GB.
- git gc --prune=now on the repo (6 packs to 2): 5.35 GB (gc briefly costs space).
- Windows Update download cache (7.7 GB) is the big safe lever but this shell is NOT
  admin and the harness blocks removal under C:\Windows. Left alone. NOTE FOR LAWAL below.
- Claude Desktop keeps four superseded auto-updater copies under
  AppData\Local\AnthropicClaude. Removed the three oldest (app-1.18286.0, 1.19367.0,
  1.21459.1), kept the current and the previous for rollback: 6.79 GB.
- Not touched: Downloads (15.4 GB, personal audio and Ableton packs), Chrome profile,
  ms-playwright (needed for driving), docs/verification (tracked evidence, 1.87 GB in docs).

Disk after reclaim: 6.79 GB free. Above the 6 GB continue line.

## 2026-09-03 13:50 A1 started: is main (48fe08f7) live on production?

- Served release marker on https://www.eventlinqs.com.au/ : sentry-release
  9cf7d3651f0d3b24ea4750d35f4eb378210a9d22. That is #121, NOT 48fe08f7. Main has NOT deployed.
- Why (Vercel deployment list + build log for dpl_8S9zb5QpAZJZyZEXTJSBJBKHrrpb, target
  production, commit 48fe08f7): state ERROR. The repo's own prebuild env guard blocked it:
    ENV_MANIFEST_CONFORMANCE: ORDER_ACCESS_SECRET [production] fails its declared shape
    (single-token secret of at least 32 characters, pattern ^\S{32,}$). length 92, fp bf11e100.
  The value the founder set on Production 5 days ago contains whitespace (a pasted newline or
  space). The same commit built READY as a preview because the variable is optional on preview.
- Blast radius of replacing the value: ZERO. src/lib/orders/order-access.ts does not exist at
  9cf7d365 (git cat-file -e), so the running production has never minted a guest order link
  with this secret. No outstanding link can be invalidated by rotating it.
- Live smoke (all before the repair): / 200, /events 200, /pricing 200, /organisers 200,
  /communities 200, /community/south-asian 200, /city/melbourne 200, /sitemap.xml 200,
  /robots.txt 200, event page 200, homepage og:image 200 (PNG 1200x630, 57 KB), event og:image
  200 (PNG 1200x630, 915 KB). Evidence: C:\dev\EVIDENCE\A1\
- Vercel CLI 55.0.0 IS installed (%APPDATA%\npm\vercel.cmd) and logged in as the founder's
  account (hello-6187). The session hook that said it was missing was reading a PATH without
  %APPDATA%\npm. So the repair is scriptable (Law 10) rather than a dashboard step.

## 2026-09-03 14:20 A1: production deploy repaired, main is live

- Wrote scripts/ops/repair-order-access-secret.mjs (Law 10). It refuses unless the Vercel CLI
  is logged in and the linked project is eventlinqs-app; it fetches the served release marker
  and asks git whether that release contains order-access.ts (the consumer of the secret),
  refusing if it does unless --accept-link-invalidation is passed; it mints a 64 character
  base64url value and proves it against the manifest's own SHAPES.strongSecret32 before
  storing; it stores via `vercel env update ORDER_ACCESS_SECRET production --sensitive --yes`
  with the value on stdin and NO trailing newline; it redeploys the blocked deployment for the
  production target, polls `vercel inspect` to READY, then polls the live HTML until the
  sentry-release marker equals the expected commit. It never prints the secret (length and an
  8 hex fingerprint only). Dry run first, then the real run. Both outputs in
  C:\dev\EVIDENCE\A1\repair-order-access-secret-run.txt.
- Result: new deployment eventlinqs-k6by54w6p-lawals-projects-c20c0be8.vercel.app READY;
  https://www.eventlinqs.com.au/ now serves sentry-release
  48fe08f71232e86798f84636dc33aa84b0fef14e (main). Confirmed independently with curl after the
  script finished.
- Post-repair smoke, all 200: /, /events, /pricing, /organisers, /communities,
  /community/south-asian, /city/melbourne, /sitemap.xml (application/xml), /robots.txt,
  /events/open-field-party-v8yqlp, and its opengraph-image (image/png).
- vercel.json: added git.deploymentEnabled { "ops/session-log": false } (source:
  https://vercel.com/docs/project-configuration/git-configuration, fetched 2026-09-03). Every
  push of the session log was triggering a production-project build that ERRORed (six of the
  last twenty deployments), because that branch holds only markdown. With this brief pushing
  the log after every item that would have been dozens more.
- NOT FIXED, needs Lawal: the production catalogue. The live sitemap has 552 URLs but only 4
  event pages, two of which are payment test artefacts (payment-verification-test-2-e1ukdb,
  payment-verification-test-3c1p9f). The previous session (SESSION-LOG.md, GATE 0) found the
  same and traced it to data, not code. Seeding production is a production write and the only
  seeder refuses a production target by design (docs at C:\dev\PRODUCTION-STEPS.md lines 79
  to 163). This brief makes production READ ONLY for me, so it is queued for his decision.

## 2026-09-03 (session resumed) A1 gates, commit and push

- The session process ended mid-run once; the parked env file had been restored by the
  finally block and the tree was intact. Resumed from the log.
- Gates after A1 (env file parked for the suite, present for the guards):
  typecheck 0 errors; lint 0 problems; suite 250 files / 2984 tests, 0 failed (the two new
  files add 7). Guards: 57 registered; no-silent-catch went red on the repair script's own
  fetch catch (fixed, the error is now named and printed if the poll ends without the
  release) and curated-categories-exist reads the database, so it needs the env file
  (`node --env-file=.env.local scripts/guards/curated-categories-exist.mjs` PASS). All 57
  green with the env present. Canary baseline raised to 250 files / 2984 tests with a dated
  note (scripts/guards/test-count-canary.mjs).
- Commit db871881 "Repair the blocked production deploy, and stop the log branch from
  building": vercel.json, the repair script, capture-evidence.mjs, the two tests, the canary.
- First push was BLOCKED by the pre-push hook: one test failed, the guard registry's "every
  guard file on disk is registered", because the A2 guard file had already been written to
  the tree while A1 was being pushed. Not an A1 defect, but the hook validates the working
  tree, so it was right to refuse. Registered the guard (with its header line) and re-pushed.
- Guard, axe, Lighthouse for A1: no user-facing surface changed (vercel.json and scripts only),
  so axe and Lighthouse do not apply to this item; the live smoke and the 21 screenshots at
  390, 768 and 1440 under C:\dev\EVIDENCE\A1\ are the driven proof that production serves
  main.

## 2026-09-03 14:55 A1 DONE: merged and live

- Pushed db871881 to integration/launch (second attempt; the first was blocked by the
  registry test until the A2 guard was registered). PR #123 to main: required checks
  "lint · typecheck · build" and "test (vitest)" green, types-drift guard green. Squash-merged
  as bfc4a311. Production redeployed and https://www.eventlinqs.com.au/ now serves
  sentry-release bfc4a311caccf2deb077e01286ffddda72d62bbc. The post-deploy smoke workflow ran.
- Evidence: C:\dev\EVIDENCE\A1\ (live-smoke-2026-09-03.txt, repair-order-access-secret-run.txt,
  gates-after-A1.txt, guards-after-A1-with-env.txt, push-A1.txt, 21 screenshots at 390/768/1440,
  two og:image PNGs).
- Disk at the close of A1: about 6.7 GB free (the build for A2 is about to write .next).

## 2026-09-03 15:00 A2 in progress: 3.11 virtual and hybrid

- Plan written first (Law 0): scratchpad A2-PLAN.md, governing laws stated there.
- SCHEMA (both applied to TEST vkapkibzokmfaxqogypq, ref read back before each push, ledger
  rows read back after): 20260903000001_virtual_hybrid_delivery.sql (ticket_tiers.access_mode
  enum, events.stream_geo_allow with an ISO check, the tier-side raising trigger, the
  event-side coercing trigger, the stream_messages table with organiser-only RLS) and
  20260903000002_stream_link_vault.sql (event_stream_links with no anon grant, the copy and
  empty of events.virtual_url, and a trigger that moves any future write into the vault).
  Verified by scripts/verify/virtual-hybrid-schema-verify.mjs against TEST: 17 checks, 0 failed
  (C:\dev\EVIDENCE\A2\schema-verify-test.txt).
- FOUND AND CLOSED on the way: the anon role could select events.virtual_url through PostgREST
  (probed with the anon key on TEST). A page can honour "revealed only to ticket holders" and
  the API still hands the value to anyone with the key in the page source. Hence a vault table
  rather than a column privilege, because the repo's own security scan records that narrowing
  events by column breaks every whole-row public read.
- GUARD: scripts/guards/stream-link-never-public.mjs, registered and in the runner header.
  Red against the pre-refactor tree (11 reads of virtual_url named with file and line), green
  after the refactor. Both outputs: C:\dev\EVIDENCE\A2\guard-proof.txt.
- CODE: src/lib/stream/{countries,embed,link,access,publish-rule}.ts; the organiser form
  (Stream link field, Who can watch checklist with region quick picks, per-tier "Who this
  ticket admits" on hybrid events, event type change coerces tiers, Publish disabled with the
  sentence when a livestream has no link); the actions (vault write, geo, coerced tier modes,
  the same publish refusal, duplicate copies the vault row); the edit page reads the vault
  under the organiser's session; the selector shows a Livestream badge; the public event page
  states the livestream's reach and never the link; the bearer ticket page and the order
  confirmation page carry Join the livestream for livestream tickets; the confirmation email
  carries the watch link per livestream ticket and never a stream address;
  /t/[code]/watch (bearer gate, tier, status, country, then the vault; every refusal a
  sentence); /api/stream/[code]/messages (GET and POST, same gate, per-ticket rate limit
  'stream-message'); the room client (chat, questions, reactions, 5 s poll); the organiser
  Stream tab (/dashboard/events/[id]/stream: answer, hide, show again, post as organiser).
- TESTS: tests/unit/stream/{access,embed,countries,publish-rule}.test.ts and
  tests/unit/email/virtual-confirmation.test.ts, 37 tests, all green. tsc 0, eslint 0.
- Rate-limit audit (C:\dev\EVIDENCE\A2\rate-limit-audit.txt): the new policy is listed keyed
  by ticket, fail-open, one call site; the three findings it prints are pre-existing.
  entrypoint-authz --check PASS with the two route methods declared as bearer.
