# CLOSE-OUT, 2026-09-05

Nothing in this file may be skipped, deferred, or logged for later. Every item
below closes with driven proof and a MET or NOT MET line in BUILD-LEDGER.md with
evidence paths, and a plain language entry in REVIEW-QUEUE.md. Work them in order.

STANDING RULE ADDED NOW: never guess a slug, a route, an id, or a filename.
Enumerate it from the database or from source on disk, then drive it. Guessing a
slug once produced both a 404 and a false pass, and the same class of error hid a
live door scanner defect. If a check cannot enumerate its own inputs, it is not a
check.

STANDING RULE ADDED NOW: nothing is pushed until the same checks pass locally.
Six failed run emails arrived for a single pull request because CI was used as a
test runner. That never happens again.

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

## C8. MOBILE LIGHTHOUSE TO 95

The standing minimum is 95 on mobile and desktop on a production build, and it is
non negotiable. Mobile currently sits at 93. The cause on record is the platform
wide client shell, Issue #42. Fix the shell. Do not chase per page workarounds and
do not relax the gate. Prove the score on a production build at 390 wide.

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

## C11. AFRICA REMAINS DEFERRED

Multi language UI in French, Yoruba, Swahili and Zulu, and phone OTP login, are a
later stage. Do not build them.

## C12. SENTINEL

Write DONE to C:\dev\BUILD-COMPLETE.txt only when C1 through C10 are each marked
MET in BUILD-LEDGER.md with evidence. A partially built item is not done.
## C13. ORGANISER CANNOT DELETE OR ARCHIVE AN EVENT. P1, DO BEFORE C6.

Found by Lawal on production, 6 September 2026. The organiser events list offers
Edit, View, Launch Kit, Duplicate, Pause and Cancel. There is no delete and no
archive. Once cancelled, an event keeps only Edit, View and Duplicate, so it can
never leave the list.

Competitor check. Eventbrite: delete exists, blocked while completed orders exist,
and then only 120 days after the event finishes; Unpublish returns it to draft.
Humanitix: delete only if no ticket was EVER sold, free or paid, cancelled or not;
otherwise Archive, which hides it, stops sales and marks it private. TryBooking:
no delete at all, only close, cancel and archive, explicitly for audit. Two of
three offer delete for zero-sales events. All three offer a way out of the list.
EventLinqs offers neither. Close the gap completely.

### C13.1 Define the state machine first, in writing, before any code

The event lifecycle must be explicit and total: draft, published, paused,
cancelled, archived, deleted. Document every legal transition and every illegal
one. Archived is orthogonal to cancelled: a cancelled event can be archived, an
archived event cannot be published without being restored first. No state may be a
dead end. Put the diagram in the repository, not only in a commit message.

### C13.2 DELETE, eligibility and enforcement

Offered only when the event has NEVER had a payment record of any kind: zero rows
in orders, zero issued tickets, zero completed squad purchases, zero discount code
redemptions, zero refunds. Free tickets count as tickets, exactly as Humanitix
treats them.

Enforce this in the DATABASE, not the interface. An RLS policy or a delete-guarding
trigger that refuses the delete regardless of caller. The UI hiding a button is not
enforcement. Prove the refusal by calling the delete directly with the service role
and watching it fail.

Require the organiser to type the event name to confirm. Permanent, no undo, and
say so on the dialog.

### C13.3 DELETE must leave nothing behind

A delete that orphans rows or files is a partial fix. Enumerate every table and
bucket that references an event, from the schema, not from memory, and handle each
one explicitly: ticket tiers, discount codes, stream links and stream messages,
price history, waitlists, squads and squad members, invites, lineup and artist
links, venue links, seat maps, scans and validation sets, follows and alerts,
scheduled emails and digests, analytics rows.

Storage too: every generated social card, OG image and Launch Kit artefact for that
event must be removed from the bucket. Leaving orphaned objects in storage is
exactly the kind of half-done that is not acceptable.

Where a foreign key should cascade, make it cascade in a migration. Where it must
not, the delete must fail loudly with a clear message rather than leave a mess.
After the delete, run a referential integrity check that proves zero orphans.

### C13.4 ARCHIVE, always available, and it must take effect everywhere

Archiving stops all sales, removes the event from the organiser's default list, and
removes it from every public surface. Every one of these, enumerated from source and
driven, not assumed: browse and city browse, city and suburb pages, community and
faith pages, categories, the personalised discovery feed, on-site search, the
sitemap, any RSS or JSON feed, artist pages, venue pages, organiser public profiles,
the alert engine and push notifications, email digests, and social card generation.

Archived events remain visible to the organiser under an Archived filter and can be
restored. Every record is retained.

### C13.5 ARCHIVE must never break a real attendee

Anyone holding a ticket to an archived event must still see it at /account/tickets
and at /t/[code], must still be able to open the ticket at the door, and the scanner
must still validate it. Archiving is a discovery change, never a ticket change.
Drive this with a real issued ticket on an archived event.

Archiving must never be usable to escape a refund obligation. If an event has sold
tickets and is being taken down, the cancellation and refund path must run. Archive
is not a substitute for cancelling.

### C13.6 Public URLs after the fact

A deleted event's URL returns 410 Gone. An archived event's URL returns 404 unless
the viewer holds a ticket for it. Neither may return 200 with a broken or empty
page, and neither may return a soft 404 that search engines index. Remove both from
the sitemap in the same change. Any social card already posted publicly will now
point at a dead link, which is expected and correct, but the page it lands on must
be a proper error page, not a crash.

### C13.7 Admin console parity and audit

The admin event view gets the same delete and archive, under the same database
rules, with no admin override that bypasses C13.2. Every delete, archive and
restore writes an audit row: who, what, when, from where, and the event's state at
the time. Surface it in the existing admin audit view.

### C13.8 Fix the cancelled dead end

A cancelled event must keep a full action set including Archive. The state where an
event can only be edited, viewed or duplicated forever is the defect that started
this item, and it must be gone.

### C13.9 Guards, proven in both directions

Register guards and prove each one fails as well as passes, per the standing law:
a delete against an event carrying an order is refused at the database; an archived
event never appears on any public surface; an archived event's ticket still
validates at the door; no orphaned rows or storage objects remain after a delete;
a cancelled event always has a route out of the list.

### C13.10 Driven proof

At 390, 768 and 1440: delete offered and completing on a zero-sales event; delete
absent and refused at the database on an event with an order; archive removing the
event from public browse and from search; restore returning it; a ticket holder
still reaching their ticket on an archived event. Evidence paths in the ledger.

### Out of scope, deliberately, do not build

Multi-select bulk delete or bulk archive. Single event actions only for now. Do not
half-build a bulk path.

## C14 IS PROMOTED. RUN ORDER FROM NOW ON.

Owner decision, 6 September 2026. The design uplift is not last. After the item in
progress, the order is: C13 (delete and archive), then C14 (design uplift), then
C4, C5, C6, C7, C8, C9, C10. C14 is not deferred behind the rest.

Two additions to C14, both to keep it to hours rather than weeks:

### C14.9 Uplift these screens first, in this order

A venue or organiser forms their judgement on five screens. Do these first, prove
them, then stop and report before touching anything else:

  1. Homepage. Composition and dimensions are APPROVED and must not change.
     Improve typography rhythm, spacing consistency, image treatment, hover and
     focus detail, and loading behaviour only.
  2. Browse and city browse. The event card is the single most repeated object on
     the platform; it carries most of the perceived quality.
  3. Event detail. This is where a ticket buyer decides.
  4. Checkout. Trust treatment near the payment form, per the locked design rules.
  5. Organiser dashboard first screen and the events list. This is what a venue
     sees when you demo it to them.

Everything else in C14 follows after those five are proven.

### C14.10 The uplift must survive an empty platform

The platform will be shown with very few events on it. Every one of those five
screens must look considered when it holds one event, or none. Empty and sparse
states are part of this uplift, not an afterthought, because that is the state a
venue will see in the demo.

## C14 STANDARD OF WORK. THIS SECTION GOVERNS EVERY CHANGE IN C14.

### C14.11 The champion and challenger rule. Non-negotiable.

What is already built is the CHAMPION. Any change you propose is a CHALLENGER.
A challenger replaces the champion only when it is measurably better on the
criteria in C14.12 and worse on none of them. A tie keeps the champion. A change
that is prettier but slower, or cleaner but less accessible, is a LOSS and is
reverted.

If you cannot beat the champion on a given screen or component, you LEAVE IT
EXACTLY AS IT IS, record in BUILD-LOG.md that you attempted it and why the
champion won, and move on. Leaving good work alone is a correct outcome and is
never a failure. Changing something to look busy is the failure.

Never revert a champion to a challenger you have not measured. Never claim an
improvement you have not driven and captured.

### C14.12 The rubric. Every challenger is scored against every line.

Perceived quality is not taste, it is these. Measure each, before and after,
at 390, 768 and 1440, in light and dark.

TYPOGRAPHY
  - One type scale with a consistent ratio. No more than six sizes in active use
    across the whole platform.
  - Two font families maximum. Optical sizing and variable weights preferred over
    additional families.
  - Body copy line length between 45 and 75 characters at every viewport.
  - No orphaned single words on headings at any of the three viewports.
  - Consistent vertical rhythm; baseline spacing derived from the scale, never
    arbitrary.

COLOUR
  - Navy and gold only, from the token ramp. Gold is an accent: it must cover no
    more than roughly five percent of any screen's surface.
  - Body text contrast at least 4.5 to 1, large text and interface elements at
    least 3 to 1, in BOTH themes. Measure it, do not assume it.
  - No colour used to carry meaning without a second cue (icon, label or shape).

FORM AND DEPTH
  - Three border radius values maximum across the platform. Three elevation
    levels maximum, with a single consistent light source. Shadows must be
    physically coherent, never decorative.
  - One spacing scale. A guard fails the build on any hardcoded spacing value.
  - Optical alignment, not merely mathematical: icons, avatars and glyphs aligned
    to how they read, not to their bounding boxes.

IMAGERY
  - Consistent aspect ratios per context, consistent corner treatment, consistent
    overlay and scrim treatment. Text never sits on an unprotected image.
  - Every image served through next/image with correct sizes, modern formats, and
    a reserved box so it contributes zero layout shift.

MOTION
  - Durations between 150 and 300 milliseconds, one easing family.
  - Every animation respects prefers-reduced-motion.
  - No animation delays first interaction or adds to CLS. No scroll hijacking,
    no parallax, no entrance animation on content the user is waiting for.

INTERACTION
  - Touch targets at least 44 by 44 pixels.
  - Visible focus ring on every interactive element, in both themes.
  - Hover, active, focus, disabled and loading states defined for every control.
  - Every destructive action confirmed; every irreversible action says so.

CRAFT
  - Empty and sparse states designed, with a next action.
  - Loading skeletons shaped like the content they replace. No page-sized spinner.
  - Designed 404, 410 and 500 pages.
  - Form errors preserve input, name the field, and say how to fix it.

MEASURED FLOOR, ALL OF WHICH MUST BE EQUAL OR BETTER AFTER EVERY CHANGE
  - Lighthouse mobile and desktop, per route touched: never lower than before.
  - axe-core violations: zero, before and after.
  - Bundle size for the route: never larger without a written justification and
    a measured perceptual gain.
  - Visual diff: reviewed, and every difference intentional and explained.

### C14.13 Benchmarking. Study, never copy.

Before uplifting each of the five screens in C14.9, study current public reference
material from Ticketmaster, Eventbrite, DICE, Humanitix and TryBooking, and record
in BUILD-LOG.md what each does better and worse than EventLinqs on the C14.12
rubric. The goal is to SURPASS them, and you must state on which specific rubric
lines the EventLinqs screen now wins.

Never copy a competitor's layout, copy, imagery, iconography or distinctive visual
identity. This is benchmarking, not reproduction. Any asset you use must be
original or properly licensed. Navy and gold, community-first, and the locked
strategy remain the identity.

### C14.14 Tools you may use, and what stays banned

Use the full capability of the existing stack and use it well: Tailwind v4 with
tokens, shadcn and Radix for accessible primitives, restrained Framer Motion,
next/image, variable fonts, CSS container queries, CSS view transitions where
they degrade gracefully, and hand-authored SVG. Introduce a new dependency only
with a written justification, a bundle cost measurement, and a demonstrated
perceptual gain that could not be achieved without it.

Banned and staying banned: bento grids, dark theme as default, glassmorphism,
Lenis or any scroll hijacking, holographic or 3D ticket rendering, generic stock
photography, and generic copy or layout of any kind.

### C14.15 Work like a studio, not like a script

For each of the five screens in C14.9, produce in this order and record it:
  1. A written critique of the current screen against the C14.12 rubric, naming
     every specific failure.
  2. The intended change and what rubric line each part of it improves.
  3. The implementation.
  4. Before and after captures at 390, 768 and 1440, light and dark.
  5. The measured floor from C14.12, before and after.
  6. A verdict: challenger wins and lands, or champion holds and nothing changes.

No screen is marked MET without all six recorded and the evidence paths in
BUILD-LEDGER.md. "Improved the spacing" with no measurement is not evidence.

### C14.16 Stop and report

After the five screens in C14.9 are each resolved to a verdict, STOP. Write the
summary to REVIEW-QUEUE.md in plain language with the before and after images, push
it, and wait. Do not sweep the remaining routes until the owner has seen the five.

## CORRECTIONS AND FINAL VERIFICATION. THIS SUPERSEDES C10 AND C12.

### SUPERSEDES C12. The sentinel condition is now this and only this.

Write DONE to C:\dev\BUILD-COMPLETE.txt only when C1 through C15 are EACH marked
MET in BUILD-LEDGER.md with evidence paths. C13 and C14 are inside the sentinel
condition, not outside it. The earlier wording naming C1 through C10 is void.

### SUPERSEDES C10. Enumerate the scope, do not follow a pointer.

"Continue Phase B3 onward" is not a work list. Replace it with this:

C10.1 Read docs/EventLinqs_Scope_v5.md, the authoritative scope. Enumerate EVERY
      numbered section and subsection from that file. Never invent, merge, renumber
      or infer a module number, and never work from memory of what the scope says.

C10.2 For each section, record its true state against the built platform with
      driven evidence, not by reading code and assuming: BUILT, PARTIAL, NOT BUILT,
      or DEFERRED. DEFERRED is reserved for the Africa items only: multi-language UI
      in French, Yoruba, Swahili and Zulu, and phone OTP login. Nothing else may be
      marked DEFERRED without the owner saying so.

C10.3 Build every section that is PARTIAL or NOT BUILT, one at a time, under the
      COMPLETION LAW. A section is not closed until schema, code, tests, guard and
      driven proof at 390, 768 and 1440 all exist and full regression is green.

C10.4 A section you cannot complete because it needs something only the owner can
      supply is not PARTIAL and is not DEFERRED. Mark it OWNER BLOCKED, name exactly
      what is needed in one sentence, and carry on with the next section.

### C15. FINAL FULL SCOPE VERIFICATION. THE LAST ITEM. NO EXCEPTIONS.

C15 runs after C1 through C14 are MET, and its job is to prove nothing was left
behind. Do not trust the ledger. Re-verify from the running platform.

C15.1 Re-enumerate every section of docs/EventLinqs_Scope_v5.md from the file, not
      from the ledger and not from memory.

C15.2 For each section, drive the actual behaviour against production or a
      production build. Reading the code is not verification. Clicking through a
      dev server is not verification. Drive it, capture it, cite the artefact.

C15.3 Re-drive every route enumerated from src/app on production. Static routes
      directly, dynamic routes with a real id or slug from the database. Record the
      status code for every one. Any 404 or 500 that is not deliberate is a defect
      and is fixed before C15 can close.

C15.4 Re-run every registered guard and confirm each still fails as well as passes.
      A guard that no longer fails when it should has stopped protecting anything.

C15.5 Confirm the measured floor on production: Lighthouse mobile and desktop both
      95 or better, axe-core zero, and the field Web Vitals budgets from C14.5 in
      place and reporting.

C15.6 Produce docs/verification/FINAL-SCOPE-VERIFICATION.md as ONE table, every
      scope section on its own row, with columns: section number, name, state
      (MET, OWNER BLOCKED or DEFERRED), the evidence path, and the date driven.
      Every row must carry an evidence path. A row without one is not verified.

C15.7 List separately, at the top of that file, every OWNER BLOCKED item with the
      one thing Lawal must supply for each. Known ones at the time of writing:
      the Google Maps server key value, a valid Stripe CLI login, the logo and
      brand assets, and real event supply on production. Add any others you find.

C15.8 Write the same summary into REVIEW-QUEUE.md in plain language, push it, and
      only then write DONE to the sentinel.

C15.9 If any section cannot reach MET and is not OWNER BLOCKED or DEFERRED, DO NOT
      write the sentinel. Report and stop. A partially built platform is never
      reported as finished.

## C16. MAIN IS RED AND PRODUCTION IS FAILING TO DEPLOY. P0. HALT EVERYTHING ELSE.

Owner reported, 6 September 2026, from deployment and CI notifications:
  - Production deployment FAILED, main at b7798b7, 6 September 08:37 UTC
  - CI run FAILED on main at b7798b7
  - Production deployment FAILED, main at 2d558d2, 6 September 11:53 UTC
  - CI run FAILED on main at 2d558d2
  - Lighthouse CI failed twice on the C13 pull request

### C16.0 HALT RULE, PERMANENT FROM NOW ON

While origin/main is red, or the most recent production deployment is not Ready,
NO new close-out item may be started and no further pull request may be merged.
Fixing main and fixing production is the only work in progress. This rule outranks
every other ordering instruction in this file.

After EVERY merge to main from now on, watch the resulting production deployment
through to Ready and confirm the live site serves that commit BEFORE starting the
next item. A merge is not finished when the pull request closes. It is finished
when production is serving it.

### C16.1 Diagnose both failures properly. Name the cause, do not patch the symptom.

Read the actual failing step logs for the CI runs on b7798b7 and 2d558d2, and the
Vercel build logs for both failed production deployments. Record in BUILD-LOG.md
exactly what failed in each and why.

Then answer this question explicitly in writing, because it is the important one:
the pull request checks passed and main failed. WHY. Do not proceed until you can
state the mechanism. The leading hypothesis to test first is that preview builds
use preview environment variables while the production build uses production ones,
so a production-only environment or configuration failure is invisible until after
the merge. This is the same class of defect that blocked the deploy previously via
ORDER_ACCESS_SECRET failing its shape.

### C16.2 REOPEN C2. Its stated outcome is not met.

C2 was marked done and the owner has since received four more failed run
notifications. That is a partial build. C2 is reopened and does not close again
until it demonstrably prevents this.

C16.2.1 The pre-push gate must include a PRODUCTION PARITY BUILD: a full production
        build with the production environment manifest validated exactly as Vercel
        validates it, not a development or preview build. If a build would fail on
        Vercel production, the gate must fail locally first. Prove this by
        deliberately breaking a production-only environment value and watching the
        gate refuse the push.
C16.2.2 Add a required CI check that performs the same production parity build on
        every pull request, so the pull request cannot go green while main would go
        red.
C16.2.3 Enable branch protection on main: all required checks must pass before a
        merge is possible, and no direct pushes to main. Verify the protection is
        actually in force by attempting a merge with a failing check and confirming
        it is refused.
C16.2.4 Register a guard that fails if branch protection is missing or if the
        production parity check is absent from the required set.

### C16.3 Fix Lighthouse CI on the C13 pull request

Lighthouse CI failed twice on C13. Read the report, fix the cause in the code, and
do not relax the gate. The 95 minimum on mobile and desktop is not negotiable and
must not be lowered, skipped, or made non blocking to get a merge through.

### C16.4 Prove production is genuinely healthy, not just deployed

  - origin/main CI green.
  - The newest production deployment reads Ready and its commit matches origin/main.
  - https://www.eventlinqs.com.au and the apex both return 200.
  - Drive at least ten real routes enumerated from src/app on production, including
    the homepage, browse, a city page, a community page, an event page and checkout,
    and record the status code for each.
  - The post-deploy smoke workflow passes.
Record every one of those with evidence in BUILD-LEDGER.md before C16 closes.

### C16.5 No shortcuts to green

Never make a failing check non blocking, never skip a test, never lower a
threshold, never merge with admin override, and never disable a guard to get past
this. Fix the cause. If a check is genuinely wrong, fix the check and explain why
in BUILD-LOG.md.

## C17. THE HOMEPAGE HERO IS EMPTY WITH NO EVENTS. P1. DO IMMEDIATELY AFTER C16.

Owner reported with a screenshot, 6 September 2026. The homepage hero renders as a
flat dark rectangle with no imagery. It previously drew its image from a featured
event; that event is gone and nothing replaced it. The hero is the first thing any
organiser, venue or attendee sees and it currently reads as unfinished. The owner
is sending the link to a reviewer imminently.

### C17.1 Diagnose before designing

Determine whether the hero is empty because no featured event exists, or because an
image reference is failing to resolve. Read the component, then drive the live
homepage and inspect what it actually renders. Record the answer. Do not assume.

### C17.2 The hero must NEVER render without imagery

Build a proper fallback, not a hardcoded image:
  - Featured event exists, use its imagery, as today.
  - No featured event, render a curated hero from a small managed set held in the
    repository or in storage, chosen deterministically so it does not flicker
    between renders.
  - Image fails to load, render a designed treatment that still looks intentional:
    typography, the navy and gold ramp, correct contrast. Never a bare rectangle,
    never a broken image icon, never a spinner.
Register a guard that FAILS if the homepage hero can render with neither event
imagery nor a curated fallback. Prove it fails as well as passes.

### C17.3 Image standards. These are not optional.

  - No generic stock photography. This is already banned by the locked strategy and
    the ban holds here. A hero anyone can recognise from another website is worse
    than no hero.
  - Every image must be owned outright or properly licensed for commercial use, with
    the licence recorded in the repository next to the asset. Never scrape, never
    hotlink, never use an unlicensed image.
  - The imagery must read as Australian and as community-first: real crowds, real
    venues, real performers, the kind of event EventLinqs is actually for. It must
    not look like a generic global SaaS header.
  - No identifiable individual may appear without a model release.
  - Provide light and dark treatments, or one image that holds up under both.

### C17.4 Legibility and craft

  - A scrim between image and text, tuned so the headline and subhead clear 4.5 to 1
    contrast at every viewport in both themes. Measure it. The scrim defect found in
    C3 must not reappear here.
  - The headline must not reflow awkwardly or orphan a word at 390, 768 or 1440.
  - The gold call to action must stay clearly visible against every image in the set.
  - Focal point handling so faces and subjects are not cropped out on narrow screens.

### C17.5 Performance. The hero is the LCP element.

  - Served through next/image with priority, correct sizes, modern formats, and an
    explicit reserved box so it contributes zero layout shift.
  - LCP under 2.5 seconds on mobile, measured, and the Lighthouse mobile score must
    not drop. If a candidate image cannot meet that budget, it is the wrong image.

### C17.6 The same rule applies everywhere a page can be empty

While in here, apply the same standard to every surface that can render with no
events: browse, city and suburb pages, community and faith pages, category pages,
artist and venue pages, and the discovery feed. Enumerate them from src/app. Each
must look considered when it holds nothing, with a clear next action. This is
C14.10 brought forward because the platform is being shown now.

### C17.7 Driven proof

At 390, 768 and 1440, light and dark: hero with a featured event, hero with no
events at all, and hero with the image deliberately failed. Plus one empty-state
capture for each surface in C17.6. Evidence paths in the ledger.

## C18. THE PLATFORM AND THE SCOPE DISAGREE ON THE COMMUNITY TAXONOMY. P1.

The live site serves 21 nationality based community slugs:
aboriginal-torres-strait-islander, african, arab, caribbean, chinese, filipino,
greek, indian, italian, japanese, korean, latin-american, lebanese-levantine,
maori, other-east-southeast-asian, other-european, other-south-asian,
pacific-pasifika, persian-iranian, turkish, vietnamese. All 21 return 200.
A separate /faith/[faith] route exists. No Pride community appears anywhere.

This does not obviously match the SCENES V2 taxonomy in the locked documents.
Nobody has verified it against the scope. Resolve it from the documents, not from
anyone's memory and not by asking the owner.

### C18.0 The rule for this item

docs/EventLinqs_Scope_v5.md is the authoritative scope and docs/STRATEGY-LOCK.md
is the locked strategy. Where implementation and those documents disagree, the
DOCUMENTS WIN and the implementation is corrected. You may never edit a locked
document to make it agree with code that drifted.

If the two documents contradict each other, or the taxonomy in them is genuinely
ambiguous, STOP. Quote the exact conflicting passages with file and line numbers
into REVIEW-QUEUE.md and wait for the owner. Do not guess and do not split the
difference. Ambiguity is a decision for the owner; divergence is a defect for you.

### C18.1 Read the sources and quote them

Locate the scope and strategy documents. Verify the filenames rather than assuming
them. Quote VERBATIM into BUILD-LOG.md, with file paths and line numbers, every
passage that defines the community taxonomy, the scene taxonomy, the SOUNDS and
COMMUNITIES families, and anything governing faith. Never paraphrase and never
invent or renumber a module.

### C18.2 Enumerate what actually exists

From the database and from source on disk, not from the live HTML:
  - Every community row and slug, and where the canonical list is defined.
  - Every faith row and slug, and why faith sits on its own route.
  - Which surfaces consume each list: /communities, /community/[community],
    /community/[community]/[city], /faith/[faith], the discovery feed, browse
    filters, sitemap, social cards, seed data, onboarding and event creation.
    Enumerate from src/app, never from memory.

### C18.3 Produce the comparison

One table in docs/verification: scope document, database, live site, side by side,
one row per taxonomy entry. Mark each row MATCH, MISSING FROM PLATFORM, EXTRA ON
PLATFORM, or RENAMED. This table is the evidence; the fix follows from it.

### C18.4 Correct the platform to the documents

Implement every MISSING entry to the same standard as the existing ones: page,
routing, filters, feed, sitemap, social cards, seed content, and the city variant.
No community may be a stub. If the locked scope names Pride, it is built in full
like every other community; there is no partial version of it and no exception.

Resolve every EXTRA and RENAMED entry according to C18.0.

### C18.5 A slug change is a migration, never a text edit

Any slug that changes requires, in one change: a database migration, permanent 301
redirects from every old URL including the city variants, sitemap regeneration,
re-tagging of every existing event and organiser carrying the old value,
regeneration of affected social cards, and a link check proving nothing on the
platform points at a dead slug. Enumerate the affected surfaces from source.

### C18.6 Make drift impossible from now on. This is the real fix.

Register a guard that reads the taxonomy from the scope document and FAILS the
build when the database, the routes, or the rendered list diverge from it in
either direction. Prove it fails as well as passes, by adding an entry in one
place only and watching the build refuse.

This is the durable outcome. Fixing the list once is worth little; a platform that
cannot silently drift from its own scope is worth a great deal. The same principle
applies to every other list the scope defines, and C15 must check for the same
class of divergence across the whole scope, not only here.

### C18.7 Driven proof

Every community and every faith page driven on production at 390, 768 and 1440,
status and content recorded, including any newly built ones and every redirect
from an old slug. Evidence paths in the ledger. Never type a slug from memory;
enumerate it.

## C18 FINAL. THIS VOIDS "C18" AND "C18 CORRECTED" ENTIRELY. IGNORE BOTH.

Owner decision, 6 September 2026, recorded verbatim in intent: the community layer
is an approved, deliberate feature added during the build. It is a differentiator
and it stays. All 21 community pages, the city variants and the faith route remain.

### C18F.0 THE ONLY RULE THAT MATTERS HERE. ADDITIVE, BOTH DIRECTIONS.

NOTHING IS REMOVED FROM THE PLATFORM IN THIS ITEM. Not a community, not a category,
not a route, not a page, not a slug. There is no circumstance under which this item
deletes a user facing feature.

  - Where the PLATFORM is ahead of the scope, the SCOPE is updated to record what
    was built and approved.
  - Where the SCOPE is ahead of the platform, the PLATFORM is built to match.
  - Where they differ in naming only, nothing changes without the owner saying so.

If you conclude something should be removed, you do not remove it. You write the
case in REVIEW-QUEUE.md in plain language and carry on with the next item. Removal
is an owner decision, always.

### C18F.1 Write the community layer into the scope

Scope v5 contains no community taxonomy. That is a gap in the DOCUMENT, not a
defect in the platform. Close it by writing an addendum that becomes part of the
authoritative scope, alongside docs/EventLinqs_Scope_v5.md and referenced from it:

  - All 21 communities as live, enumerated from the database rather than typed
    from memory, with their slugs.
  - The /community/[community] and /community/[community]/[city] routes and what
    each renders.
  - The /faith/[faith] route and how faith relates to community.
  - How the community layer sits alongside the Scope v5 event categories at line
    351: they are different axes, not competing lists. An event has a category AND
    may belong to communities.
  - Marked APPROVED BY OWNER, added during build, September 2026.

Never edit the body of docs/EventLinqs_Scope_v5.md itself. Add the addendum and
reference it.

### C18F.2 Event categories, additive only

Scope v5 line 351 lists: Music, Sports, Arts & Culture, Food & Drink, Business &
Networking, Education, Charity, Nightlife, Family, Technology, Religion, Fashion,
Health & Wellness, Community, Other, with regional subcategories.

Compare against what the platform implements: database, /categories/[slug], browse
filters, event creation, discovery feed, seed data, sitemap. Enumerate the surfaces
from src/app.

  - Any category in the scope and MISSING from the platform: build it, fully, to
    the same standard as the existing ones.
  - Any category on the platform and not in the scope: KEEP IT. Record it in the
    addendum as an approved addition. Do not remove it and do not raise it as a
    defect.
  - Naming differences: report them, change nothing.

### C18F.3 Slugs are not touched

No slug is renamed in this item. Community, faith or category. If a slug is
genuinely broken, that is a separate defect with its own migration, permanent
redirects, re-tagging and sitemap regeneration, and it needs owner sign off first.

### C18F.4 Guards that protect what exists

Register guards that FAIL the build when:
  - Any of the 21 communities stops rendering, or the count drops.
  - Any faith page stops rendering.
  - Any category present today disappears.
  - Any category the scope requires is absent.
Prove each guard fails as well as passes. The purpose of these guards is to protect
the platform from silent loss, not to police it into a shorter list.

### C18F.5 Pride, for the owner only

Pride does not appear as a community on the platform. This is noted for the owner's
decision and NO ACTION is taken on it. Do not add it, do not remove anything, do
not raise it again. One line in REVIEW-QUEUE.md, then move on.

### C18F.6 Driven proof

All 21 community pages, their city variants, every faith page and every category
page driven on production at 390, 768 and 1440. Status and content recorded for
each. Enumerate every slug from the database, never type one from memory. Evidence
paths in the ledger.

## C19. GOOGLE IS NOT INDEXING PAGES. INDEXING AND CANONICAL POLICY. P2.

Google Search Console reported five exclusion reasons on 6 September 2026:
alternate page with proper canonical tag; duplicate, Google chose different
canonical than user; excluded by noindex; not found 404; page with redirect.

You cannot read Search Console, it requires authentication. Do NOT attempt to.
Audit from the source and from production instead. The owner will export the URL
level report separately.

### C19.1 Audit what the platform actually declares

From source and from the live production HTML, for every route enumerated from
src/app, record: the canonical URL emitted, whether noindex is set, whether it
appears in the sitemap, and whether it is reachable by internal links. Produce one
table. Never assume from the code alone; fetch the rendered page and read the tags.

### C19.2 Confirm the intentional exclusions are correct and complete

These must be noindex and must NOT be in the sitemap: dashboard, admin, checkout,
order confirmation, ticket pages, scan, squad payment, queue, unsubscribe, dev and
design preview routes, and any authenticated surface. Any of them indexable is a
defect and a privacy risk. Any public marketing or discovery page carrying noindex
by accident is also a defect.

### C19.3 Set an INDEXING THRESHOLD POLICY. This is the important one.

Hundreds of community, city, suburb, category and browse pages currently hold no
events. Google is collapsing them as duplicates because they are substantially
identical, and canonicals are only a hint to Google, not an instruction.

Implement: a templated discovery page is noindex until it holds real content, and
becomes indexable automatically once it does. Propose the threshold in
REVIEW-QUEUE.md with your reasoning, defaulting to at least three published
upcoming events, and let the owner confirm the number. The sitemap must contain
only indexable pages, so a page enters and leaves the sitemap with its own state.

### C19.4 Make each page genuinely different

For pages that DO carry content, the template must produce materially unique text,
not a boilerplate paragraph with a swapped noun. Unique title, unique meta
description, unique heading, and copy that reflects that specific community or
city. Add structured data: Event schema on event pages, ItemList on listing pages,
Organization and WebSite site wide. Validate it, do not assume it.

### C19.5 Resolve the 404s

Enumerate every URL the platform has ever published that now 404s, including
paused, cancelled and deleted events and any renamed slugs. Each one gets either a
permanent redirect to the right destination, or a deliberate 410 Gone, and is
removed from the sitemap. Nothing may 404 silently.

### C19.6 Guards

Register guards that FAIL when: an authenticated or transactional route is
indexable or present in the sitemap; the sitemap contains a noindex URL; a page
emits no canonical; or a public discovery page emits a canonical pointing at a
different page. Prove each fails as well as passes.

### C19.7 Driven proof

Fetch the live production HTML for a representative set enumerated from src/app,
including one community page with events and one without, one city page, one event
page, one authenticated page, and record canonical, robots and sitemap membership
for each. Validate the sitemap parses and every URL in it returns 200 and is
indexable. Evidence paths in the ledger.

## C8 CORRECTED. THE MOBILE PERFORMANCE GATE. SUPERSEDES EARLIER C8 FRAMING.

VERIFIED FROM lighthouserc.json AND ITS HISTORY, 7 September 2026:

  - The performance floor has ALWAYS been 0.80. It was never lowered. It was never
    set to the owner's 95 standard. Do not treat this as a regression to undo.
  - Category floors aggregate `optimistic`, which is Math.max, THE BEST RUN. The
    homepage "0.76" came from runs of 0.66, 0.76, 0.75. The median is 0.75.
  - Homepage and /culture/* have performance at WARN, waived to Issue #42,
    expiring 2026-11-01. The homepage cannot currently fail on performance.
  - Lighthouse is pinned at 12.1.0 where the TraceElements gatherer throws, so
    largest-contentful-paint-element and layout-shifts return NO detail in every
    report. The gate reports the number and cannot report the cause.
  - numberOfRuns is 3; CLAUDE.md's hard rule is median-of-5.

NEVER lower a threshold to pass. NEVER move an assertion from error to warn to get
a merge through. Every change below either tightens the gate or makes it honest.

### C8.1 See the cause. Do this first, nothing else works without it.

Upgrade to @lhci/cli 0.15.1 (Lighthouse 12.6.1). The file records this as a one
line change in .github/workflows/lighthouse.yml. It re-baselines all gated URLs, so
run it, capture every URL's score on BOTH versions, and record the comparison in
docs/perf. Only the event detail route has been measured on both; measure the rest
before trusting it. Once it lands, largest-contentful-paint-element and
layout-shifts return real data and you can finally name the LCP element instead of
guessing at it.

### C8.2 Make the numbers honest

Change every categories:* floor from aggregationMethod "optimistic" to "median", so
the gate judges the typical run and not the best one. The config note names this as
a deliberate decision requiring its own evidence: this is that decision, and the
evidence is that the owner has been quoted best-run figures and planned against
them. Update the _aggregationContract declaration in the same change so
tests/unit/ci/lighthouse-aggregation-contract.test.ts still passes.

Raise numberOfRuns from 3 to 5, per the CLAUDE.md hard rule, and raise the workflow
timeout to accommodate it. If five runs cannot fit, say so with the measured
runtime rather than leaving the rule quietly broken.

### C8.3 Fix the dead waiver

The /culture/.+$ pattern matches nothing. The platform serves /community/*. Decide,
with measurements rather than assumption, whether the Issue #42 cold-start waiver
still applies to the community pages, and either re-point the pattern with a fresh
expiry and a stated reason, or delete it and let the general floor apply. Do not
leave a waiver in the file that protects nothing.

### C8.4 Report the truth before optimising anything

With C8.1 through C8.3 landed, run the gate and write ONE table to REVIEW-QUEUE.md
in plain language: every gated URL, its median mobile performance, LCP, TBT, CLS
and script bytes, and the named LCP element for each. This is the first honest
picture of where the platform stands. Push it and let the owner see it.

### C8.5 Then close the gap, biggest first

From that table, work the largest cost first, one at a time under the COMPLETION
LAW. The measured event-route costs on record are TBT 402ms, LCP 3,547ms, main
thread 2,054ms, script 433KB, and the known offender is the platform wide client
shell, Issue #42. Reducing main thread JavaScript is the lever; everything else
follows it.

### C8.6 A ratchet, never a plateau

After each improvement, RAISE the floor in lighthouserc.json to just below the new
measured median, at error level, so the gain can never be given back. The floor
only ever goes up. Record each raise with the measurement that justified it.

### C8.7 The 95 decision belongs to the owner

The measured medians are 0.75 to 0.79. Reaching 0.95 on mobile requires roughly TBT
under 150ms, LCP under 2.5s and materially less JavaScript, which is an
architectural change to the client shell and collides with C14. Put the honest
estimate in REVIEW-QUEUE.md in plain language, with what 0.95 costs in build time
and what the platform would score if the gate were set where it actually performs
today. Then STOP and let the owner decide whether 0.95 gates the launch or is the
ratchet target. Do not decide it for him and do not quietly set the gate anywhere
in between.

## OWNER DECISION, 7 SEPTEMBER 2026. LAUNCH ON THE RATCHET.
## THIS REORDERS EVERYTHING BELOW IT AND OUTRANKS EARLIER ORDERING.

The 95 mobile Lighthouse target DOES NOT GATE THE LAUNCH. It remains the standard
and the destination. C8 continues after launch as a ratchet while the owner is
doing outreach. Nothing about the 95 standard is abandoned, cancelled or lowered.

What gates the launch instead: the platform is OPERATIONAL. Nothing breaks. Every
journey an organiser or an attendee takes works end to end, driven and proven on
production. That is the bar and it is not negotiable in the other direction.

### L1. WHAT "LAUNCH READY" MEANS. Driven on production, not asserted.

Every one of these, end to end, at 390, 768 and 1440, with evidence captured:

  ORGANISER
  1. Sign up at /signup, verify email, sign in.
  2. Create an organisation, then create an event at /dashboard/events/create with
     a real venue address, and confirm coordinates are saved and NOT null.
  3. Add tiers and pricing, add a discount code, publish.
  4. The event appears on /events/[slug], on browse, on its city page, and on any
     community it belongs to.
  5. Generate the Launch Kit and confirm every card renders with real ink.
  6. Pause, unpause, archive, restore, and delete a zero-sales event.
  7. View attendees, orders, and the GST report.

  ATTENDEE
  8. Find the event from the homepage without knowing the URL.
  9. Buy a ticket end to end with a real card on a low-price test event, receive
     the confirmation email, and see the ticket at /account/tickets and /t/[code].
 10. Refund that order from /dashboard/events/[id]/refunds and confirm the money
     returns and the ticket is voided.
 11. Squad or group purchase path, and a waitlist join.

  DOOR
 12. Scan the issued ticket at /scan/[eventId]. It validates once and refuses the
     second time. Prove the offline path and the multi-scanner path.

  PAYOUT
 13. The organiser payout path resolves and reports correctly at /dashboard/payouts.

  PLATFORM
 14. Every route enumerated from src/app returns its expected status on
     production. Zero unexpected 404s. Zero 500s anywhere.
 15. Every transactional and confirmation email actually sends and renders.
 16. axe-core zero on every public surface.

A journey that cannot be completed is a launch blocker regardless of which item it
belongs to.

### L2. LAUNCH-BLOCKING ORDER. Work these, in this order, nothing else.

  1. C13  organiser can delete and archive an event
  2. C17  the homepage hero and every empty state
  3. C14  the five screens, then STOP and report as C14.16 requires
  4. C9   the Google Maps code side and its guard
  5. C4   the Arts storage object
  6. C7   full route sweep on production, every 404 and 500 fixed
  7. C19  indexing and canonical policy
  8. C10  audit Scope v5 section by section and build every launch-affecting gap.
          Anything in C10 that does NOT affect L1 goes to the post-launch queue,
          named, not silently skipped.
  9. C5   branch hygiene
 10. L5   the launch readiness report below

### L3. THE C8 RATCHET. Do this ONCE, now, then leave C8 until after launch.

Before launch, make the performance gate honest and enforced rather than aspirational:

  - Complete C8.1, the Lighthouse 12.6.1 upgrade, because without it the gate
    cannot name an LCP element and post-launch work would be blind.
  - Complete C8.2, category floors from optimistic to median, and 5 runs.
  - Complete C8.3, the dead /culture/* waiver.
  - Then set the error-level performance floor at the measured median MINUS a small
    variance allowance, on EVERY gated URL, and DELETE the warn-level waivers on the
    homepage and the community pages. Today those pages are waived because they fail
    0.80; at an honest floor they pass and are enforced. Enforcement goes UP, not
    down. Record the measured medians that justify the number.
  - The floor only ever RISES. After every post-launch improvement, raise it to just
    below the new median at error level so a gain can never be given back. Never
    lower it, never move an assertion back to warn, never add a waiver without an
    expiry date and a stated reason.

That is the whole of C8 before launch. The 95 work resumes after.

### L4. POST-LAUNCH QUEUE. Named, not forgotten.

  C8 ratchet to 95 on mobile and desktop.
  C18 the community taxonomy written into the scope and guarded.
  C15 full scope verification across every Scope v5 section.
  Anything C10 identifies that does not affect L1.
  The supplier matching module, Stage 0, gated as its own assessment describes.

### L5. THE LAUNCH READINESS REPORT. Replaces the sentinel for this phase.

Do NOT write DONE to C:\dev\BUILD-COMPLETE.txt at the end of the launch-blocking
list. Instead produce docs/verification/LAUNCH-READINESS.md: one row per L1 item,
with PASS or FAIL, the evidence path, and the date driven. Every row PASS, or it is
not launch ready. Write the same summary in plain language to REVIEW-QUEUE.md, push
it, and stop for the owner.

The sentinel is written only when the post-launch queue in L4 is also complete.

### L6. Standing laws unchanged

The COMPLETION LAW still applies to every item. One at a time, finished with schema,
code, tests, guard and driven proof before the next begins. Fix everything found
before starting the next task. Never claim something works without driving it. Never
guess a slug, route or id. Nothing is removed from the platform. Africa stays
deferred. Production is never written without the owner's approval.

## AFRICA DEFERRAL, NARROWED. 7 September 2026. SUPERSEDES "Africa stays deferred".

Scope v5 section 10.3 is titled Africa-Specific Build Requirements, but several of
its items are not Africa-specific and serve the Australian launch. The blanket
deferral was too broad. Split it as follows.

### DEFERRED, correctly. Do not build. Mark DEFERRED by owner decision in C15.

  - Mobile money integration: Paystack and Flutterwave, M-Pesa, USSD, local card
    networks.
  - Phone OTP login.
  - The asynchronous "payment pending" state holding inventory for bank transfer
    and USSD confirmation.
  - Multi-language UI in French, Yoruba, Swahili and Zulu.
  - The Lagos, Nairobi, Johannesburg and Accra market entry work in 10.3 and 10.4.

### PULLED FORWARD. These are launch-relevant and are NOT deferred.

  A. THE BUNDLE TARGET. Scope 10.3 specifies a minimal JavaScript payload, under
     200KB initial bundle, with aggressive image compression, lazy loading, and a
     PWA that functions offline with a checkout that does not fail on poor network.
     The event route currently measures 433KB of script against a 480KB budget.
     THE SCOPE'S OWN NUMBER IS THE C8 TARGET. Record it in C8 as the destination
     the ratchet climbs towards, and check whether the PWA offline requirement and
     the resilient checkout are built. Australians on a phone at a venue with bad
     reception are the same problem as anyone else on a weak network.

  B. WHATSAPP SHARE. Scope 10.3 requires WhatsApp deep links with rich preview
     cards on all share flows, event invitations, squad booking links and ticket
     transfers. This directly serves the community layer in Melbourne and Geelong.
     Audit what exists, build what does not, and drive the preview card rendering.

  C. TRUST SIGNALS. Scope 10.3 requires verified organiser badges, a public dispute
     resolution process, buyer protection messaging, and visible refund policies.
     A new platform asking for card details needs these MORE than an incumbent.
     Place them per the locked design rules: contextual on the event page, full
     treatment on checkout near the payment form, none on the homepage or browse.

  D. FRAUD PREVENTION. Scope 10.3 requires dynamic rotating QR codes and single-use
     cryptographic validation. Audit the existing door and ticket work against that
     requirement and report whether it is already MET. Do not rebuild what exists.

Add A through D to the LAUNCH-BLOCKING order in L2 only where they affect an L1
journey. Anything that does not affect an L1 journey goes to the post-launch queue,
named. Report which is which before building, so the owner sees the split.

## C8 EXECUTION METHOD. HOW THE BUNDLE TARGET IS ACTUALLY REACHED.

The target is Scope v5 section 10.3: initial JavaScript bundle under 200KB. The
event route currently measures 433KB of script with 2,054ms of main thread work.

WHY THIS MOVES THE SCORE, so the work is aimed rather than guessed. On mobile,
Total Blocking Time is 30 percent of the performance score and Largest Contentful
Paint is 25 percent. Both are driven by main thread JavaScript here: the repository
already records LCP render delay of 3,071ms caused by a 187KB chunk carrying rrweb
with 1,047ms of evaluation. That is a paint blocked by script, not a slow image.
Cutting script cuts both metrics at once, and they are 55 percent of the score.

### C8B.1 Measure first, and never optimise blind

Complete C8.1 (Lighthouse 12.6.1) BEFORE any of this. Without it,
largest-contentful-paint-element returns nothing and you cannot see which element
is actually the LCP, which means every change after it is a guess.

Then produce a cost table for the event route, the homepage and browse: every
JavaScript chunk by transferred size, its evaluation time, whether it is on the
critical path, and what feature it serves. Order it by cost. That table decides the
work order. Do not touch anything before it exists.

### C8B.2 Investigate rrweb and session replay FIRST

The 187KB rrweb chunk with 1,047ms of evaluation is the largest single named cost
in the repository's own records, and the owner's Sentry notifications report that
replays are being DROPPED. Determine whether session replay is delivering anything
of value. Then either remove it, or load it lazily and strictly off the critical
path so it costs nothing before first interaction. Measure the route before and
after and report the delta. If it turns out to be needed and cannot be deferred,
say so with the measurement rather than leaving it unexplained.

### C8B.3 Work down the table, one item at a time

For every item: state the expected saving, make the change, re-measure the same
route on the same gate, and record actual script bytes, TBT, LCP, main thread work
and the performance score before and after. A change that does not improve the
measured numbers is REVERTED, not kept because it looks tidier. This is the
champion and challenger rule from C14 applied to performance.

### C8B.4 Byte weight and sequencing are judged together

The repository already records that an earlier split improved sequencing but pushed
script bytes UP from 370KB to 433KB by duplicating shared runtime. Naive code
splitting can make this worse. Every change reports BOTH total script bytes and the
critical path timing, and a change that improves one while worsening the other is
justified in writing or reverted.

### C8B.5 The scope's own numbers are the destination

Scope v5 section 10.3 also requires aggressive image compression with WebP and a
JPEG fallback, lazy loading, a PWA that functions offline, and a checkout that does
not fail under poor network conditions. Audit each against what is built and report
MET or NOT MET. A ticket buyer at a venue with bad reception is the same problem
that section describes.

### C8B.6 Honest reporting, no rounding up

Report the median, never the best run. State plainly what the score is after each
change and how far it remains from 95. Never describe a partial improvement as
reaching the target. If the bundle reaches 200KB and mobile is at 0.90, say 0.90.

## P0. RAISE THE PERFORMANCE. DO NOT TOUCH THE GATE. 7 September 2026.
## OWNER DIRECTIVE. THIS SUPERSEDES THE "N1" HONEST-FLOOR INSTRUCTION ENTIRELY.

The earlier instruction to lower the performance floor to the measured median is
VOID. The gate stays at minScore 0.80 and above. Never lower a threshold, never
move an assertion from error to warn, never add a waiver, never make a check
non-blocking. The platform rises to meet the gate. The gate does not come down.

Nothing in this file is an addition to scope. Every item is Scope v5 delivered
properly. Treat it that way.

### P0.1 STOP OPENING PULL REQUESTS UNTIL THE PLATFORM PASSES ITS OWN GATE

Every pull request is failing Lighthouse for the same reason: the platform measures
0.75 to 0.79 against a 0.80 floor, so ANY branch fails regardless of what it
changed. C17.4, C9 and C18 each generated a failed-run email for a defect none of
them caused.

Therefore: do the performance work FIRST, on one branch, and land it. Open no other
pull request until every gated URL passes 0.80 at MEDIAN with real headroom. After
that lands, every subsequent pull request passes on its own merit and the failure
emails stop at the source.

### P0.2 Run the gate locally before every push, without exception

The pre-push gate must run the SAME Lighthouse measurement CI runs, against a
Vercel preview, with the same version, the same run count and the same aggregation.
If local says pass and CI says fail, the local gate is lying and that is a defect in
the gate. Fix it. No push happens until local Lighthouse is green.

### P0.3 See the cause first

Upgrade to @lhci/cli 0.15.1 (Lighthouse 12.6.1). One line in the workflow. In 12.1.0
the TraceElements gatherer throws, so largest-contentful-paint-element and
layout-shifts return NOTHING and the gate cannot say which element is the LCP.
Re-baseline every gated URL and record both versions.

### P0.4 Make the measurement stricter, never looser

Category floors from aggregationMethod "optimistic" to "median". Optimistic takes
the BEST of the runs; median is the typical one. This TIGHTENS the gate. Raise
numberOfRuns from 3 to 5 per the CLAUDE.md hard rule and raise the workflow timeout
to fit. Update the _aggregationContract declaration so the contract test passes.
Fix the dead /culture/* waiver, which matches no route since the platform serves
/community/*.

### P0.5 Build the cost table, then work it biggest first

For the event route, the homepage and browse: every JavaScript chunk by transferred
size, its evaluation time, whether it is on the critical path, and what feature it
serves. Order by cost. That table decides the work order.

Start with the 187KB chunk carrying rrweb at 1,047ms of evaluation, which the
repository already names as the cause of 3,071ms of LCP render delay, and which the
owner's Sentry notifications say is dropping its replays anyway. Determine whether
it earns its cost. Remove it or move it strictly off the critical path. Measure
before and after and report the delta.

Then work down the table one item at a time. Every change reports script bytes, TBT,
LCP, main thread work and the performance score, before and after, on the same gate.
A change that does not improve the measured numbers is REVERTED.

### P0.6 The target is the scope's own number

Scope v5 section 10.3 specifies an initial JavaScript bundle under 200KB. The event
route measures 433KB. That is the destination. On mobile, Total Blocking Time is 30
percent of the score and Largest Contentful Paint is 25 percent, and both are driven
by main thread JavaScript here, so cutting script moves 55 percent of the score.

### P0.7 Then ratchet the floor UP, never down

Once every gated URL passes 0.80 at median with headroom, RAISE the floor to just
below the new median at error level, so the gain can never be given back. Repeat
after every improvement. The floor only ever rises, towards 95.

### P0.8 Fix the preview deployment failure

The Vercel PREVIEW deployment failed for branch docs/c18-final-community-layer at
718d93b, 7 September 10:04 UTC. That is a build error, not a score. Read the build
log, name the cause, fix it. A branch whose preview cannot build cannot be gated at
all.

### P0.9 Then resume, and finish Scope v5 entire

After the platform passes its own gate: C13, C17, C14's five screens, C9, C4, C7,
C19, C10 the full Scope v5 section-by-section audit and build, C5, C18, then C15 the
final verification across every scope section. Nothing is skipped. Nothing is left
partially built.

## EVENT PRODUCTION MODULE. M1 SHIPS WITH LAUNCH. M2 TO M7 AFTER THE LAUNCH LIST.

Owner decision, 7 September 2026. EventLinqs is the platform where events get made:
planned, staffed, sold, run at the door, and paid. Ticketing is module one. This is
module two. Nothing here delays the launch except M1, which is one form.

RESEARCH FINDINGS THAT DICTATE THE ARCHITECTURE. Verified, not assumed.

  (a) WhatsApp Business Platform moved to PER-MESSAGE pricing on 1 July 2025.
      Marketing templates are always charged. Utility templates and free-form
      messages are FREE inside an open 24-hour customer service window, which opens
      when the USER messages the business. Therefore: send ONE paid utility template
      carrying the lead, designed so replying is the natural action; the reply opens
      the free window; every message after it costs nothing. Marginal cost of a fully
      automated lead is one template per matched supplier.
  (b) The Spam Act 2003 requires consent, accurate sender identification, and an
      unsubscribe that works for at least 30 days, costs nothing and asks for no
      extra personal information. Whether a conspicuously published business address
      constitutes consent is CONTESTED in Australian commentary. Therefore automated
      first contact with a non-opted-in supplier IS NOT BUILT. A person makes first
      contact. Everything after opt-in is automated on express consent.
  (c) Automated Instagram or social direct messaging breaches Meta's platform terms
      and risks a permanent ban. NOT BUILT, at any scale, ever.

### M1. THE REQUEST. SHIPS WITH THE LAUNCH.

Capture what an organiser still needs, from the first event onward. No supply, no
matching, no messaging. Data collection only.

M1.1 On event creation and in the organiser dashboard: "What do you still need for
     this event?" Multi-select categories, budget band, free text notes.
M1.2 Categories live in the database as a guarded taxonomy, never hardcoded,
     enumerated from source. Register a guard that fails on drift, exactly as C18
     requires for communities.
M1.3 Free for the organiser, always. Never a blocking step in event creation. An
     event must be creatable with no request and nothing breaks. Prove it.
M1.4 The acknowledgement the organiser sees must be honest. Never imply a service
     that does not exist yet.
M1.5 Admin can see every request with its event context attached.
M1.6 Driven at 390, 768 and 1440. Evidence paths in the ledger.

### M2. SUPPLIER PROFILE AND VERIFICATION.

M2.1 Claimable profile built on the EXISTING artist and venue graph
     (/artists, /artist/dashboard, /gigs, /venues/[handle]). Do not build a parallel
     system.
M2.2 ABN validated against the Australian Business Register free web services API.
     Store entity name, status, GST registration. Revalidate on a schedule. A
     cancelled ABN suspends the supplier from matching automatically.
M2.3 Public liability certificate upload with a MANDATORY expiry date. Reminders at
     30, 14 and 7 days. AUTOMATIC SUSPENSION from matching on lapse.
M2.4 Category credentials where they apply: Victorian security licence under the
     Private Security Act 2004, food handling registration, working with children.
M2.5 Service region, capacity band, categories, portfolio, work history.
M2.6 GUARD: an unverified, lapsed or suspended supplier can NEVER appear in a match.
     Prove it fails as well as passes.

### M3. MATCHING AND THE OUTBOUND LEAD.

M3.1 Match on category, region, capacity band, availability and verification state.
M3.2 CAP suppliers per request at three to five. Sending a lead to everyone destroys
     win rates and churns supply.
M3.3 Rank by verification depth, response rate, win rate and recency. NEVER by who
     paid the most.
M3.4 Outbound is ONE WhatsApp utility template per matched supplier, carrying date,
     venue, capacity, category and budget band, written so that replying is the
     natural action. Email in parallel for suppliers who prefer it.
M3.5 Every outbound message writes to a message log with its category and measured
     cost. Cost per lead must be a MEASURED number, never an estimate.
M3.6 GUARD: no message is ever sent without a recorded express consent and a working
     unsubscribe path. Prove it refuses.

### M4. THE QUOTE THREAD.

M4.1 Inside the free window the supplier submits a quote conversationally: amount,
     inclusions, availability, questions.
M4.2 Quotes normalise into a comparable structure for the organiser.
M4.3 The organiser compares and accepts. Acceptance creates a booking and exchanges
     contact details.
M4.4 The organiser is NEVER charged for this. Revenue sits on the supplier side.
M4.5 Log every state: sent, delivered, read, replied, quoted, accepted, declined,
     expired.

### M5. COMPLIANCE, BUILT IN.

M5.1 Express consent captured at opt-in with timestamp, method and IP.
M5.2 Every commercial message carries accurate sender identification and an
     unsubscribe that works for at least 30 days, free, requiring no extra personal
     information.
M5.3 Unsubscribe is honoured immediately across EVERY channel, not per channel.
M5.4 Automated first contact with a non-opted-in supplier is NOT BUILT.
M5.5 No automated Instagram or social direct messaging.
M5.6 GUARD: the system cannot send a commercial message to any address without a
     consent record. Prove it refuses.

### M6. SUPPLIER MONETISATION.

M6.1 ONE mechanism to start: per-qualified-lead OR subscription. Never both, and
     never a lead fee and a take rate on the same booking.
M6.2 Priced in Australian dollars, displayed inclusive of GST.
M6.3 Lead credits refundable where a lead proves unreachable or fake. Lead quality
     is what kills these businesses.
M6.4 A take rate only when payment genuinely flows through the platform, and NOT
     before Australian financial services advice on holding funds between organiser
     and supplier. Stages M1 to M5 hold no funds at all.

### M7. THE DEMAND MAP.

M7.1 Admin view over all requests: category by region by event size by month, with
     fill rate and time to first quote.
M7.2 This is the supplier recruitment plan, evidence-based rather than guessed, and
     it is the most valuable dataset this business will own.

### AUTOMATION BOUNDARY, STATED PLAINLY

AUTOMATED: request capture, matching, ranking, the outbound lead, the whole
conversation inside the free window, quote capture and normalisation, acceptance,
ABN revalidation, insurance expiry and suspension, lead accounting, supplier billing.

HUMAN: first contact to recruit a non-opted-in supplier (compliance, and it converts
better), first insurance certificate review once per supplier, disputes.

HUMAN UNTIL VOLUME JUSTIFIES OTHERWISE: servicing a request where no verified
supplier exists in that category or region. For the first fifty events the owner
does this by phone. The organiser sees a working product. This is deliberate and
correct, not a compromise.

## M6 REPLACED. THE MONEY MODEL. 7 September 2026, owner decision.
## THIS VOIDS THE EARLIER M6 AND ANY LEAD-FEE OR SUBSCRIPTION INSTRUCTION.

No lead fees. No credits. No subscriptions. Nobody pays to see or answer a job.

### M6.1 Organisers pay nothing, ever

The supplier quotes a number. The organiser pays exactly that number. No booking
fee, no service fee, no percentage on top. The organiser must never see a fee for
using this module. Guard: no organiser-facing charge can be introduced here.

### M6.2 Trades pay nothing to receive or answer a lead

Free to join, free to be matched, free to quote, free to message. Forever. Guard:
no paywall may ever sit between a supplier and a lead.

### M6.3 Commission on completed, paid jobs only, and it earns down

Taken from the supplier's payout when the job is paid. Never before.

  0 to 2 completed bookings   12%
  3 to 9                      10%
  10 to 24                     8%
  25 and above                 6%

The rate is a property of the supplier and rises only if they are suspended. Show
each supplier their current rate and the next tier on their dashboard. This is a
reward for working through the platform, not a tax for using it.

### M6.4 What the supplier gets for that percentage

  - Leads, free, forever.
  - GUARANTEED PAYMENT. Organiser funds secured before the job, released on
    completion. Chasing invoices is the biggest complaint of every Australian trade
    and solving it is most of the value here.
  - Verified badge: ABN live, insurance current, category licences held.
  - A public work history of real events, which becomes their portfolio.

### M6.5 Payments are part of the first build, not a later stage

No transaction means no revenue and no payment guarantee, so the Stripe Connect
supplier rail ships with this module. A supplier is another connected account on the
rail already built for organiser payouts.

### M6.6 HARD GATE before any supplier money moves

Money flowing organiser to EventLinqs to supplier, and held until completion, may
constitute a non-cash payment facility under Australian law unless structured under
Stripe's own licensing. Get written advice from an Australian lawyer BEFORE the
first supplier payment. Do not build held-balance flows until that advice is in.
Everything up to accepting a quote can be built now; the money movement waits on it.

### M6.7 Enforcement sits on the supplier, never the organiser

If a supplier takes a job off-platform: removed from matching, work history and
ratings forfeited, no further leads, earned rate lost. Never withhold an organiser's
ticket revenue for a supplier's conduct. The organiser did not breach anything and
doing so would likely be an unfair contract term under Australian Consumer Law.

The real defence is not punishment. It is that the quote, the contract, the
schedule, the run sheet, the payment protection and the live insurance certificate
all live here. Nobody rebuilds that to save a percentage on one job.

## POSITIONING, LOCKED. 7 September 2026, owner decision. AUTHORITATIVE.

Read docs/STRATEGY-LOCK.md, then ADD this section to it. Do not overwrite anything
already in that file and do not remove the existing community-first positioning,
which stands and is reinforced by this.

### THE CATEGORY

EventLinqs is NOT a ticketing platform. It is the platform where events get made.
Ticketing is one module. Never describe the platform as a ticketing platform, in
copy, in metadata, in social cards, in emails, or in the About page.

### THE PROMISE

"You've got help."

### THE POSITIONING STATEMENT

For anyone putting on an event in Australia, EventLinqs is the one place it gets
made. Find your suppliers, book them, sell your tickets, run your door, get paid.
Unlike ticketing platforms that stop at the checkout, EventLinqs helps you put the
event on.

### THE TAGLINE, UNCHANGED

Every community. Every event. One platform.

### WHAT THIS MEANS THE PLATFORM MUST ALWAYS DO

  - An organiser must never be left at a dead end. Every screen where they could be
    stuck offers the next step.
  - Help is free. Finding suppliers is free, quoting is free, asking is free.
  - The platform earns only when the organiser's event succeeds and money moves.
  - Every surface answers "what does this organiser need next", not "what can we
    sell them".

### WHAT WE NEVER DO

  - Never lead with fees or a price comparison. We do not compete on price.
  - Never charge an organiser to be helped.
  - Never charge a supplier to see or answer a job.
  - Never describe ourselves as cheaper. We are not cheaper, we are a different
    category.
  - Never use the phrases "ticketing platform" or "ticket seller" for EventLinqs.

### COPY THAT MUST CHANGE TO MATCH

Audit and rewrite, enumerated from src/app, not from memory: the homepage hero and
subhead, /for-organisers, /about, /pricing, the organiser signup flow, the empty
states, the transactional email templates, meta descriptions and titles, and the
social card copy. Each rewritten line must pass the test: does it sound like a
ticketing company, or like the place an event gets made.

Driven at 390, 768 and 1440. Do not change the approved homepage composition or
dimensions; copy only.
