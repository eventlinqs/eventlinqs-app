EVENTLINQS LAUNCH-WORTHY SWEEP
Branch integration/launch. PR #122 is open into main.
Production Supabase gndnldyfudbytbboxesk: schema is CURRENT, all 107 applied.
You may READ it. You may NOT write to it. TEST vkapkibzokmfaxqogypq is writable.

THE STANDARD: this platform goes in front of real organisers and real ticket
buyers and is measured against Ticketmaster and Eventbrite. "It works on my
machine" is not the bar. Nothing is done until you have driven it and seen it.

LAWS
- PowerShell 5.1. Prefix: $env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
- Australian English. No em dashes, no en dashes, no hyphens surrounded by spaces.
- Lawal is sole author. Zero AI trailers in any commit.
- FINISH EACH TASK COMPLETELY BEFORE STARTING THE NEXT. Never defer a finding.
- Never write a PASS you did not observe. If you cannot prove it, say so.
- Disk floor 5 GB.
- The pre-push hook runs the full suite and .env.local makes two suites fail to
  collect. Park it around every push and restore it in a finally:
    $p=@(); try { if (Test-Path ".env.local") { Move-Item ".env.local" ".env.local.parked" -Force; $p+=".env.local" }; git push origin integration/launch } finally { foreach ($f in $p) { Move-Item "$f.parked" $f -Force } }
- Log everything to C:\dev\SWEEP-LOG.md and push it to ops/session-log after
  every task so Lawal can read progress from his phone.

=====================================================================
TASK 1. COMMIT THE TYPES FIX AND GET CI GREEN. DO THIS FIRST.
=====================================================================
src/types/database.ts is already regenerated with supabase CLI 2.116.0 against
production and typechecks clean. It is uncommitted.
Review the diff (88 insertions, 13 deletions) and confirm the 13 deletions are
generator reordering and not a real loss. Then commit and push.
Watch PR #122. The types-drift guard must go green.
Do not proceed until it does.

=====================================================================
TASK 2. THE CORRUPTED PROPER NOUNS. HIGHEST PRIORITY DEFECT.
=====================================================================
A find-and-replace of cultural to community corrupted the names of real
organisations, festivals and public bodies. Known: "Multicommunity Council of
the Northern Territory", "National Multicommunity Festival", and 41 more. These
sit on the /community pages, which are 441 of the 552 URLs in the production
sitemap and are the exact surface Lawal is taking to organisers this week.

1. FIND EVERY ONE. Search the whole repo, all seed data, all content files, and
   the TEST database. Start with "multicommunity" in every case form, then widen
   to any place where community, communities or Community sits inside something
   that is clearly a proper noun: an organisation, festival, council, centre,
   association, institute, society, or government body.
   Report the complete list with file and line BEFORE changing anything.

2. RESTORE EACH ONE AND VERIFY IT. The mechanical reverse (Multicommunity to
   Multicultural) is a starting point, not an answer. For every organisation or
   event, confirm the real, current name by web search before writing it.
   These are real Australian bodies. Naming them wrong twice is worse than once.
   Anything you cannot confirm goes on a separate list for Lawal to rule on.
   Do NOT guess.

3. DO NOT OVERCORRECT. Genuine uses of "community" in EventLinqs' own voice stay
   exactly as they are. FOUNDER RULING, today: proper nouns are exempt from the
   word ban. The ban stops EventLinqs describing itself as culture-first; it was
   never meant to rename other people's organisations.

4. GATE IT. Add a blocking guard, registered and documented like the other 55,
   holding the restored names, failing the build if any is corrupted again.
   Write the ruling into the guard as its reasoning.
   Prove it fires: FAIL against the corrupted text, PASS against the corrected.
   Show both outputs.

5. Drive the affected pages and read the RENDERED output at 390, 768 and 1440.
   Confirm the names are correct on the page, not just in the source.

=====================================================================
TASK 3. VENUE GEOCODING. A DOCUMENTED SCOPE ITEM THAT WAS NEVER BUILT.
=====================================================================
Scope v5 section 3.1.1 requires "physical venue with Google Maps integration and
embedded map preview". It does not exist. event-form.tsx has no map; the venue
is two plain text inputs; venue_latitude appears once, at line 544, as null, and
is never assigned. The 85 geocoded events are seed data.

CONSEQUENCE: every event a real organiser creates has null coordinates,
permanently and silently, so it will never appear on a city map. This breaks the
moment organisers start listing, which is this week.

PRECONDITION: Lawal is replacing the VALUE of GOOGLE_MAPS_API_KEY on Vercel with
a genuine server key. Before writing code, verify it works:
  Geocoding API and Places Autocomplete must both return OK, not REQUEST_DENIED.
If it still returns REQUEST_DENIED, STOP this task, say so clearly, and move to
TASK 4. Do not build against a key that cannot run.

BUILD:
- Places Autocomplete on the venue field in the organiser event form.
- Geocode the chosen venue server side and persist venue_latitude/longitude.
- An embedded map preview in the form so the organiser confirms the pin.
- Backfill: a script that geocodes existing events with null coordinates,
  run against TEST only. Never against production.
DRIVE IT: create an event through the real form at all three viewports, confirm
coordinates land in the database, then confirm the event appears on its city map.

=====================================================================
TASK 4. MOBILE LIGHTHOUSE. LAWAL'S STANDARD IS 95 AND IT IS NON-NEGOTIABLE.
=====================================================================
Current: mobile 79 on /, 90 on /events, 93 on /pricing. Desktop 98 to 100.
The entire gap is LCP. Every other metric is 96 to 100 and CLS is a perfect 0.
Diagnosed mechanism: 18 of 20 homepage images are optimised on demand through
/_next/image from remote origins (Supabase storage and images.pexels.com), so a
cold request pays a remote fetch plus an AVIF encode before anything paints.
The first visitor after every deploy pays it in production too.

FIX IT PROPERLY. Options in order of preference:
  a. Take the above-fold hero out of on-demand optimisation entirely: a
     pre-generated, correctly sized AVIF served as a static asset with priority
     and accurate sizes, so it does not touch the optimiser at all.
  b. A post-deploy warm script that requests the hero URLs at the used widths so
     the first real visitor never pays the cold cost.
  c. Reduce hero payload.
Measure with a median of 3, before and after, on all three paths.
If you reach 95 on mobile, say so with the numbers. If you cannot, report the
measured ceiling, the exact reason, and what would close it. Do not soften it
and do not claim it.

=====================================================================
TASK 5. THE FULL SCOPE v5 AUDIT. THIS IS WHAT STOPS SURPRISES LATER.
=====================================================================
docs/EventLinqs_Scope_v5.md section 3 carries EIGHTEEN feature sections and its
own header says "Every feature below is included in the build scope. Nothing is
optional." Only 3.1 has ever been audited. Dynamic pricing, gamification, the
resale market and virtual events have never been looked at.

Audit ALL EIGHTEEN. For each, record: BUILT, PARTIAL or NOT BUILT, with the file
and line that proves it, and one sentence on what a user would experience today.
Where something is PARTIAL or NOT BUILT, say whether it matters for launch or
can follow.
Do NOT build them. Do NOT guess. Read the code and drive it where cheap.
Write the result as a table at the top of C:\dev\SCOPE-AUDIT.md and push it.
This is the document that tells Lawal what he actually has.

=====================================================================
TASK 6. THE REMAINING KNOWN DEFECTS. FIX ALL OF THEM.
=====================================================================
a. Test baseline stale. The canary reports 246 files and 2964 tests against a
   baseline of 245 and 2961. Raise it and note why on the constant.
b. Phantom modifications. Four tracked files dirty the tree after every test run
   purely from LF versus CRLF:
     docs/design/poster-band/hashes.json
     docs/design/poster-composition/parity.json
     docs/design/poster-composition/set/INDEX.txt
     docs/roast/organiser-copy/OUTPUT.md
   Fix with .gitattributes. Verify: run the suite, git status must be clean.
c. The test suite WRITES INTO TRACKED FILES. That is how an unintended change
   eventually rides along in a commit. Redirect those outputs somewhere
   untracked, or gate them behind an explicit flag.
d. Journey harness: j6 (door scanner) cannot be run by the standard runner
   because it takes three arguments the runner cannot supply, so it exits in
   under a second and reports nothing. j7-seated reports correctly then never
   exits and stalled the whole suite for 622 seconds. Fix both.
e. Journey screenshots all write to one fixed directory, so a three-viewport run
   leaves only the last run's images. Namespace them per viewport.
f. The Publish button is not disabled before the paid-publish refusal
   (disabled=false), so the refusal is server side on click. It is announced and
   links to the fix, but the button does not look blocked. Make the disabled
   state honest, keeping the server-side refusal as the real guard.
g. Ruling R3 is half enforced. GOOGLE_MAPS_API_KEY and PEXELS_API_KEY are
   declared mustBeSensitive: false, which is the single line permitting them to
   sit readable on the Development scope, contrary to the ruling's own written
   evidence. Change both to true. Expect the guards to then flag the values
   currently on Development: report exactly which, so Lawal can remove them.
h. Payout tiers 2 and 3: the thresholds ($50K, $250K, five events) appear
   NOWHERE in the source. Promotion is operational, not automatic. Either
   implement it or state plainly in the audit that tier promotion is manual.

=====================================================================
TASK 7. PROVE THE THINGS THAT ARE ONLY CONFIGURED
=====================================================================
- Sentry: the DSN is set on Production and Preview, 122 days old. The client
  half is proven. Prove an event actually ARRIVES: fire /api/health/sentry-error
  against the deployed preview and confirm it lands with a stack and release tag.
- If Lawal has run stripe login: re-drive paid purchase, refund, signed-in
  transfer and seated completion at 390, 768 and 1440. That closes the tenth
  journey and the 12 blocked rows of the 30-row table.
  If he has not, say so plainly and move on. Do not fake it.
- Web push needs a real browser and a real subscription. State it as unprovable
  headlessly rather than claiming or failing it.

=====================================================================
FINISHING
=====================================================================
Full gate set: build, all guards, complete suite, lint, typecheck, axe on every
affected surface, Lighthouse desktop and mobile.
Commit per task, Australian English, no trailers. Push with the parking block.
Confirm PR #122 is fully green.

Then write, at the top of C:\dev\SWEEP-LOG.md:
- Every defect found and fixed, with its evidence
- Everything still open, and whether it blocks launch
- The scope audit summary
- Your direct answer, in one sentence each:
    Is this platform ready to go in front of real organisers?
    Is it ready to go in front of real ticket buyers?
    Would it stand comparison with Eventbrite on the journeys a user actually
    takes? Name specifically where it would not.
Be blunt. He would rather read a hard truth now than find it from a customer.

=====================================================================
AMENDMENTS (received mid-session, same day)
=====================================================================
1. Save the brief word for word to C:\dev\SWEEP-BRIEF.md (this file).

2. TASK 3 AMENDMENT. Lawal is going to work and cannot mint the Google server
   key today. Run the REQUEST_DENIED check as instructed. When it fails, mark
   TASK 3 as BLOCKED ON FOUNDER in the log and move straight to TASK 4. Do not
   stall on it, do not retry it, and do not let it hold up anything else.

3. TASK 7 AMENDMENT. stripe login has not been run and will not be today. Mark
   the paid purchase and refund rows BLOCKED ON FOUNDER and carry on. Same for
   web push.

4. TASK 3 and the Stripe half of TASK 7 are the ONLY two things allowed to be
   blocked. Every other task must be finished. After every task, commit
   C:\dev\SWEEP-LOG.md to the ops/session-log branch and push it so Lawal can
   read progress from his phone. When every unblocked task is complete, create
   the file C:\dev\SWEEP-COMPLETE.txt with a one line summary. Never create that
   file for any other reason.
