# CLOSE-OUT-DONE

Items from CLOSE-OUT.md that are fully MET with evidence. Nothing is ever
deleted, only moved here, so CLOSE-OUT.md stays short enough to keep reading.
Each item leaves one line behind there giving its id, DONE, the date and the
commit. The ledger row and the driven evidence are the proof; this file is the
original brief, kept verbatim so a verdict can always be read against what was
actually asked for.


---

## UX1. SIX DEFECTS ON THE FIRST REAL ORGANISER EVENT, FOUND ON PRODUCTION.

Seen on https://www.eventlinqs.com.au/events/afro-fusion-music-showcase-with-mikhaell-friends-a-l1vcpz
by the owner on 9 September 2026. The first real outside organiser event on the
platform. Four of the six are platform defects that will hit every organiser.

UX1.1 The organiser bio renders raw markdown. The MKL Studios bio displays
      **MKL Studios** with the asterisks visible. Decide one rule and apply it
      everywhere an organiser or artist writes prose: render markdown, or strip it.
      Never display the syntax. Guard it, drilled on a bio containing bold, italic,
      a link and a list.

UX1.2 The venue name is duplicated in Getting there: "Quakers Centre, Quakers
      Centre, 484 William Street, West Melbourne, VIC, Australia". The venue name is
      being concatenated with a formatted address that already carries it. Fix at the
      formatter, not the page, and prove it on a venue whose name is and is not part
      of its address.

UX1.3 Tags are not case normalised. The same event carries #African and #african.
      Normalise at write time, migrate existing rows, and guard that two tags
      differing only by case cannot both exist.

UX1.4 The homepage hero crop cuts the top of the organiser's poster. Organisers put
      the event name at the top of a poster. Either respect a safe area or choose a
      focal point rather than a fixed crop. Drive it at 390, 768 and 1440 on this
      event.

Also recorded, not platform faults, for the owner to raise with the organiser:
  the description begins "oin Mikhaell & Friends", missing the J
  the ticket name is lowercase "general admission" while the page is title case

Verify separately and report: the Google venue map renders on production with a real
pin, which suggests NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is present. Name which key is
serving it and whether it is set on preview as well as production.

---

## C1. FIX CI ON MAIN. BLOCKING. DO THIS FIRST.

CI fails on origin/main at dc71374e. The types-drift guard (run 33942112287)
reports 48 unexplained differences between src/types/database.ts and the live
schema of gndnldyfudbytbboxesk. Migrations are NOT the cause: 113 in the
repository, 113 applied, 0 pending. The committed type file is what is wrong.

Three faults, not 48.

FAULT 1, wrong schema block. door_realtime_enabled, door_staff_for_event,
door_validation_set, resolve_scan_review, scan_ticket and sync_offline_scans are
declared under graphql_public.Functions in the committed file and under
public.Functions in the live database. Every added entry under graphql_public
mirrors a removed entry under public. The live database is correct.

FAULT 2, missing return fields. public.Functions.events_within_distance returns
venue_geocode_source and venue_geocoded_at in the live database. The committed
file omits both. The live database is correct.

FAULT 3, hand narrowed union inside generated output. events.venue_geocode_source
is committed as 'places' | 'geocoding' | 'manual' | null but the generator emits
string | null, because the column is text and not a Postgres enum. Somebody hand
wrote that union into the generated section. That is the defect. Do NOT
reintroduce it there.

C1.1 Update the local Supabase CLI to 2.116.0 first. CI generates with 2.116.0
     and the guard requires the committed types to come from the same version.
     Regenerating with 2.115.0 drifts again immediately.
C1.2 Regenerate the generated section only:
       npx supabase gen types --lang=typescript --project-id gndnldyfudbytbboxesk
     Replace lines 1 through the // BEGIN LEGACY ALIASES marker in
     src/types/database.ts. That command is a READ against production and is
     permitted. You have NO approval to write to production. Never run
     supabase db push against gndnldyfudbytbboxesk.
C1.3 Restore the venue_geocode_source narrowing by making the DATABASE enforce
     it, not TypeScript alone. Add a migration converting
     events.venue_geocode_source to a real Postgres enum with values places,
     geocoding and manual. Confirm first that no existing row holds a value
     outside those three. Apply to TEST vkapkibzokmfaxqogypq and let it reach
     production through the normal pull request and deploy path. If a CHECK
     constraint already covers those values, replace it with the enum in the
     same migration.
C1.4 npx tsc --noEmit must pass. Fix every call site the regeneration breaks.
     Do not widen a type to silence an error.
C1.5 Prove the types-drift guard passes, then prove it still FAILS when fed a
     deliberately stale type file. Both directions, as with every guard.
C1.6 origin/main must be green before any other item below begins.

## C2. CI HYGIENE

C2.1 Add a local pre-push gate: one command running lint, typecheck, vitest,
     every registered guard and the Lighthouse gate. Wire it as a git pre-push
     hook so a push is impossible until it is green. Prove it fails as well as
     passes.
C2.2 Gate the heavy CI jobs on github.event.pull_request.draft == false. Open
     every future pull request as a draft, work, pass C2.1 locally, then mark it
     ready so CI runs exactly once.
C2.3 Register a guard that fails if any workflow loses the draft condition, and a
     guard that fails if the pre-push hook is missing.

## C3. CLOSE THE ORIGINAL BLOCKER 2, SOCIAL CARDS

Prove the eighteen social cards from a running server: three formats across six
channels, each one a decodable JPEG at its published size carrying actual ink,
plus a freshly generated Launch Kit contact sheet. Enumerate the channels and
formats from source, do not type them from memory. Include a per event card
driven against a real event page, not a browse page. Report MET or NOT MET with
the path to every artefact.

## C4. CLOSE THE ORIGINAL BLOCKER 3, ARTS STORAGE OBJECT

Confirm the Arts storage object exists in production storage and that the Arts
tile resolves on https://www.eventlinqs.com.au with a 200 and a non empty body.
Drive it against production, not against a local build. If it 404s, copy the
object to production storage and drive it again.

## C5. CLOSE THE ORIGINAL BLOCKER 5, BRANCH HYGIENE

PR 124 is squash merged. Delete integration/launch locally and on the remote, and
cut a fresh working branch from origin/main. Confirm with git branch -a that no
stale integration/launch remains anywhere.

## C6. COMMUNITY AND FAITH PAGES

Enumerate every community slug and every faith slug from the database or from the
route source on disk. Never type a slug from memory. Drive every single one on
production and record the status code and byte count for each. Every one must
return 200 with correct, non placeholder content. Fix every page that does not.
This is the highest priority user facing item after C1.

## C7. FULL ROUTE SWEEP ON PRODUCTION

Build the route list from src/app on disk. For every static route, drive it on
https://www.eventlinqs.com.au and record the status. For every dynamic route,
drive it with a real id or slug pulled from the database. Report every 404 and
every 500 with the route that produced it. Fix them all. Note that /events/browse
alone is NOT a route; the real route is /events/browse/[city].

## C9. GOOGLE MAPS SERVER KEY, CODE SIDE

Lawal is minting the key himself. Your job is the code side. GOOGLE_MAPS_API_KEY
must be required on production, forbidden on development, and the geocoding path
must fail loudly and visibly rather than silently writing null coordinates.
Register a guard that fails if an organiser created event can be saved with null
coordinates when the key is absent. Prove it both ways.

## C10. RESUME SCOPE V5

Continue Phase B3 onward under the COMPLETION LAW: one item at a time, finished
with schema, code, tests, guard and driven proof at 390, 768 and 1440, plus full
regression green, before the next begins.

## F1. THE BUILD THAT PASSES CI AND FAILS VERCEL. DO THIS BEFORE ANYTHING ELSE.

Commit 7564b40 on verify/l5-launch-readiness failed the CI guards step and failed
the Vercel preview build. The CI log proves the two are judging different builds.

### F1.1. The gate must name what it caught.

CI ended with "[guards] 1 of 84 guard(s) FAILED. Build blocked." and never said
which guard. A gate that will not say what it caught is not finished.
run-guards.mjs must print a final line naming every guard that failed, and exit
naming them. Prove it by making one guard fail on purpose and reading the name back
out of the output.

### F1.2. CI runs on placeholder credentials, so it cannot judge what Vercel judges.

CI carries NEXT_PUBLIC_SUPABASE_URL of https://example.supabase.co and
NEXT_PUBLIC_SUPABASE_ANON_KEY of ci-placeholder-anon-key. The consequences, all
visible in the log of run 34290357211:
  community-layer-protected SKIPS its category half
  check-pricing-lock cannot read pricing_rules and reports UNVERIFIED
  check-public-env reports four critical public variables missing or malformed
Vercel carries the real project and judges every one of them.

Give CI the TEST project vkapkibzokmfaxqogypq and its anon key as repository
secrets so CI reads a real database. Never production, never the service role key.
Then every guard that currently SKIPS in CI must judge, and a SKIP branch must be
reachable only when a database is genuinely absent.

### F1.3. check-public-env believes CI is a local machine.

It printed "WARNING (not blocking, local build)" while running inside GitHub
Actions. It must read the CI and VERCEL environment variables, print the scope it
decided it is on, and block in CI on anything it would block on in production.

### F1.4. The pricing bypass must be proven absent.

scripts/check-pricing-lock.mjs offers ALLOW_PRICING_DRIFT=1 as an emergency bypass.
Register a blocking guard that fails if that variable is set in CI or in any Vercel
environment, and prove it fails as well as passes.

### F1.5. Then fix the real fault and land it.

With F1.1 in place, re-run the branch, read the guard it names, fix what that guard
caught, and land the commit as the single open pull request.

Report at the end: the name of the guard that failed on 7564b40, what it caught,
and proof that CI now judges the same guard set Vercel judges.

### F1.6. The failing guard is unnamed on BOTH machines. F1.1 is now the whole job.

Timestamps from run 34290357211 and preview deployment p3ls50uhh establish the order:
  23:23:19  Vercel preview build: [guards] 1 of 84 guard(s) FAILED. Build blocked.
            Error: Command "npm run build" exited with 1 status
  23:25:20  CI: [preview-state] FAILED: the deployment of 7564b40 is in ERROR
            [guards] 1 of 84 guard(s) FAILED. Build blocked.

There is ONE original fault: a guard failed on the Vercel preview build. preview-state
then correctly reported the resulting ERROR back in CI. preview-state is right. Do not
weaken it, do not change it.

Neither machine names the guard. Two full log reads across three passes were spent on
a question the gate should answer in one line. Fix F1.1 before anything else, re-run,
read the name, fix what it caught.

Also recorded, a second real divergence: on Vercel machine-callers-reachable skipped
for want of a VERCEL_TOKEN, while in CI the same guard skipped on a 404 from the System
Bypass endpoint. One guard, two different skip reasons, two machines, and neither is
the reason it would skip locally. Make its skip conditions identical and named.

### F1.7. The launch readiness report already ran, and it is honest.

  [launch-readiness-honest] 16 L1 rows: 4 PASS, 12 OWNER BLOCKED, 0 FAIL.
  Verdict: NOT LAUNCH READY

Zero FAIL. Nothing is broken. Twelve rows wait on owner actions, not on code. Do not
treat NOT LAUNCH READY as a defect to engineer around. Keep the report honest, name the
exact owner action that clears each blocked row, and re-run it after the owner clears them.

### F1.9. ROOT CAUSE CONFIRMED. This is the FOURTH occurrence of one defect.

F1.8 CASE A is confirmed. CASE B is dead. Do not spend a minute on CASE B.

Proof from git ls-tree on origin/verify/l5-launch-readiness, all five COMMITTED:
  docs/verification/LAUNCH-READINESS.md
  docs/verification/launch-readiness/appearance-2026-09-09.json
  docs/verification/launch-readiness/axe-2026-09-09.json
  docs/verification/launch-readiness/discovery-2026-09-09.json
  docs/verification/launch-readiness/route-sweep-2026-09-09.json

The report is honest. The citations are real. The four rows marked PASS are entitled
to say PASS. Do not downgrade a single row.

.vercelignore excludes docs/* and re-includes exactly three paths: docs/PRICING.md,
docs/security/CREDENTIAL-ROTATION.md, docs/scope/community-layer-approved.json.
docs/verification is not among them, so not one of those five files reaches a Vercel
build. launch-readiness-honest judged citations against files stripped from the upload
and called them deleted.

FOUR OCCURRENCES OF ONE DEFECT. .vercelignore documents the first three itself:
  docs/PRICING.md                            check-pricing-lock
  docs/security/CREDENTIAL-ROTATION.md       payment-critical-doctrine, 12 Aug 2026
  docs/scope/community-layer-approved.json   community-layer-protected, 7 Sep 2026
  docs/verification/**                       launch-readiness-honest, 8 Sep 2026

### F1.9.1. Why the guard written to stop this did not stop it.

vercelignore-covers-guard-reads was written after the third occurrence to prevent a
fourth. In the build that failed it PASSED, on the strength of this:

  TOLERANT build-time scripts (reviewed, each PASSED on Vercel with docs/ absent):
    scripts/guards/launch-readiness-honest.mjs
      SKIPS by name when docs/verification is absent

A WRITTEN CLAIM, not a measurement. Nobody ran that script against a stripped tree.
The claim was false and was disproved two seconds later in the same build. A guard
that issues a false assurance is worse than no guard.

This is the failure class this project exists to eliminate: a claim asserted rather
than driven. A guard may never accept a review record as evidence about behaviour it
can execute.

### F1.9.2. THE FIX. Three parts. All three, or it returns a fifth time.

PART ONE, mechanical, unblocks the branch.
Re-include what is read and ONLY what is read. docs/verification holds hundreds of
screenshots and re-including the tree would bloat every upload. Walk the levels down
the way the file already does for docs/security and docs/scope, naming only:
  docs/verification/LAUNCH-READINESS.md
  docs/verification/launch-readiness/ and the four JSON artefacts inside it
Prove it by deploying the branch and reading launch-readiness-honest PASS on Vercel.

PART TWO, structural. This is the part that ends the recurrence.
vercelignore-covers-guard-reads must stop reading a review record and start executing.
It already enumerates every docs/ path that build-time scripts read: 33 literals across
96 scripts. Change it to DERIVE the required .vercelignore re-inclusions from that
enumeration and fail when the file does not contain them, printing the exact lines to
add. No allowlist. No review record. No human judgement about tolerance. If a
build-time script reads a path, .vercelignore must re-include it or the local gate is
red, before a deploy is ever attempted.

Then DELETE the TOLERANT review list. Any script that genuinely tolerates absence
proves it by executing: build a tree stripped exactly as .vercelignore strips it, run
the script against that tree, record the verdict it actually produced. A tolerance
nobody has driven is not a tolerance.

Prove PART TWO by running the new guard against commit 7564b40 unchanged. It must go
RED and name docs/verification/LAUNCH-READINESS.md. If it goes green on 7564b40 it has
not been fixed and must not be claimed.

PART THREE, the guard's own mistake.
launch-readiness-honest decided the file was deleted rather than stripped by checking
whether a parent directory existed. That is a guess and it guessed wrong. Replace it
with a determination: evaluate the path against .vercelignore, and when the path is
excluded and the build is running on Vercel it is STRIPPED, never DELETED. Prove both
verdicts: a genuinely stripped tree SKIPS naming the reason, a genuinely deleted file
FAILS. Every guard that distinguishes stripped from deleted uses the same shared
determination. Enumerate them and report how many there are.

### F1.9.3. The standing rule this establishes.

Add to CLAUDE.md and register a blocking guard for it:

  A build-time script may never read a file outside src/ unless .vercelignore
  re-includes it AND a drill has proved that script's behaviour against a tree
  stripped exactly as .vercelignore strips it. Local green is not evidence for
  Vercel. A review record is not evidence for anything.

Report at the end: the four occurrences named, the lines added to .vercelignore, proof
the derived guard goes red on 7564b40, the count of guards that distinguish stripped
from deleted, and launch-readiness-honest passing on a real Vercel deployment.

### F1.9 CLOSED. Already fixed by the build in commit 6e61c65f. DO NOT REDO IT.

The build reached this cause independently and its diagnosis is the correct one:
Vercel deletes the FILES matched by .vercelignore and leaves the DIRECTORIES
standing, so docs/verification was empty rather than absent and the guard's skip
test could never fire. Proven from Vercel's own build log enumerating /.git/config
inside a .git that .vercelignore names.

The structural fix in F1.9.2 Part Two is also already built: a guard that
materialises the upload and runs every tolerant script inside it, in the prebuild
chain, proven red by restoring the broken code.

Do not re-open F1.1 through F1.9. Push 6e61c65f, land PR 145, and continue with the
launch-blocking list.

## F2. THE GUARD BUILT TO STOP THE FOURTH FAILURE CAUSED THE FIFTH.

Vercel preview of ffded23, 9 September 2026 at 03:42 UTC:
  Error: Command failed: git ls-files -z
  [guards] 1 of 86 guard(s) FAILED. Build blocked.
  [guards] FAILED:
  Error: Command "npm run build" exited with 1

.vercelignore names .git on its last line. The Vercel build container has no git
repository. A guard shells out to git ls-files, it throws, and the deploy dies.

### F2.1 THE CLASS HAS BEEN NAMED TOO NARROWLY. FIX THE GENERALISATION FIRST.

Five failures now share one cause and it is not "docs get stripped". It is:

    THE VERCEL BUILD HOST IS NOT A DEVELOPER MACHINE.
    No docs. No git. No Vercel token. No developer environment of any kind.

Every build-time script must declare which of those it needs, and the registry must
carry that declaration. A script that needs git, docs, or a token, and does not
declare it, fails the local gate. Prove it by adding an undeclared dependency and
watching the gate go red before a push.

### F2.2 THE UPLOAD-MATERIALISING GUARD MUST NOT RUN ON VERCEL AT ALL.

Its purpose is to predict what Vercel will see. Running it on Vercel is circular:
the thing it simulates is the thing it is running inside. It belongs on the local
pre-push gate and in CI, where the whole tree exists and the comparison is possible.

Make it CI and local only, and while doing so remove its dependence on git ls-files:
derive the file list by walking the filesystem and applying the .vercelignore rules,
so it works in any checkout, shallow or otherwise. Prove both: it runs and judges in
CI, and it does not execute on Vercel.

### F2.3 F1.1 IS HALF DONE. A GUARD THAT THROWS MUST STILL BE NAMED.

In CI, where the guard returned a verdict, F1.1 named it correctly:
  [guards] FAILED: scripts/guards/preview-deployment-state.mjs
On Vercel, where the guard THREW, the name was lost:
  [guards] FAILED:

A crash is exactly when the name matters most. Wrap every guard invocation so an
exception is caught, attributed to the guard that raised it, and printed with its
message and the first line of its stack. Prove it by making one guard throw
deliberately and reading its name back.

### F2.4 EVERY GUARD THAT READS GIT, ENUMERATED AND MADE HONEST.

The same log shows four more git calls failing quietly:
  git rev-parse --abbrev-ref HEAD
  git rev-parse HEAD
  git for-each-ref --format=%(refname:short)
  git remote get-url origin
Those degrade rather than throw, which means they are running blind on Vercel while
reporting normally. Enumerate every guard that reads git, make each state plainly
when there is no repository to read, and report how many there are.

Report at the end: the guard that threw, the count of guards reading git, proof the
upload guard no longer executes on Vercel, and a deliberate throw naming itself.
