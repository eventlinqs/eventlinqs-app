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

C1. DONE 2026-09-05, commit 4587489f (PR #125). Body moved to
C:\dev\CLOSE-OUT-DONE.md. Ledger: BUILD-LEDGER.md, the C1.1 to C1.6 rows.

C2. DONE 2026-09-06. Body moved to C:\dev\CLOSE-OUT-DONE.md. What it built is
live on every push: scripts/ops/pre-push-gate.mjs, .githooks/pre-push, and the
workflows-skip-drafts and pre-push-gate-wired guards. No single commit hash is
recorded for it.

C3. DONE 2026-09-06. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "C3. CLOSE THE ORIGINAL BLOCKER 2, SOCIAL CARDS".

C4. DONE 2026-09-06. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "C4. CLOSE THE ORIGINAL BLOCKER 3, ARTS STORAGE OBJECT".

C5. DONE 2026-09-06. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "C5. CLOSE THE ORIGINAL BLOCKER 5, BRANCH HYGIENE".

C6. DONE 2026-09-06. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "C6. COMMUNITY AND FAITH PAGES".

C7. DONE 2026-09-06. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "C7. FULL ROUTE SWEEP ON PRODUCTION".

C8 is NOT moved and is NOT closed. The owner decision of 7 September 2026 took
it off the launch gate and put it in the L4 post-launch queue as a ratchet, so
it is deferred rather than done. Its three sections stay in this file.

## C8. MOBILE LIGHTHOUSE TO 95

The standing minimum is 95 on mobile and desktop on a production build, and it is
non negotiable. Mobile currently sits at 93. The cause on record is the platform
wide client shell, Issue #42. Fix the shell. Do not chase per page workarounds and
do not relax the gate. Prove the score on a production build at 390 wide.

C9. DONE 2026-09-07. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "C9. GOOGLE MAPS SERVER KEY, CODE SIDE (7 September
2026, 18:07 to 19:10, session 40)". No single commit hash is recorded there.

C10. DONE 2026-09-08. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "C10. RESUME SCOPE V5, the audit and the
launch-affecting gaps (8 September 2026, session 42)". No single commit hash is
recorded there. What C10 identified that does not affect L1 sits in the L4
post-launch queue, named rather than dropped.

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

## HALT. 8 September 2026. NOTHING BUT THESE TWO THINGS.

The owner is receiving a failed-run email for every pull request opened. The cause
is not those pull requests. The Lighthouse gate demands 0.80 and the platform
measures 0.75 to 0.79, so EVERY branch fails regardless of content. The positioning
pull request failed the gate twice for a defect it did not cause.

### H1. OPEN NO NEW PULL REQUEST. Merge only what is already green.

No new branch. No new item. Not C19, not positioning, not the production module,
not anything already written in this file below the P0 section. Everything waits.

### H2. Fix the post-deploy smoke failure on main at 9ac4d88 FIRST.

That is the production health check and it is red. Read the failing job log, name
the cause in BUILD-LOG.md, fix it, and confirm the workflow passes on main. A red
smoke check on main means production is not verified.

### H3. Then do P0, and only P0, on ONE branch.

P0.3 Lighthouse 12.6.1 upgrade so the gate can name the LCP element.
P0.4 median aggregation, 5 runs, fix the dead /culture/* waiver.
P0.5 the chunk cost table, then the 187KB rrweb chunk with 1,047ms evaluation.
P0.6 towards the Scope v5 target of a sub-200KB initial bundle.
Measure before and after on every change. Revert anything that does not improve the
measured numbers.

Land that ONE branch. Every gated URL must pass 0.80 at MEDIAN with headroom.

### H4. Only then resume.

After the platform passes its own gate, every subsequent pull request passes on its
own merit and the failure emails stop. Then work the launch-blocking list in L2 in
order, one item at a time, and open one pull request at a time.

### H5. Never lower the gate to get past this.

The floor stays at 0.80 and above. No waivers, no warn-level downgrades, no skipped
checks. The platform rises to meet the gate.

## H2 EXPANDED. THE POST-DEPLOY SMOKE FAILURE, DIAGNOSED. Fix all four.

Run 34143506887 on main at 9ac4d88. The real failure, from the log:
  curl: (35) Recv failure: Connection reset by peer
  HTTP=000curl-failed
Production RESET THE CONNECTION after 30 seconds. It was not an HTTP error and the
site is not down: the homepage was independently fetched and served correctly with
the right headline and no error boundary.

Evidence pattern inside that single job: polls 1 and 2 fast, poll 3 took 85 seconds,
poll 5 returned empty, poll 6 fine, then the assertion request was reset. That is a
client being throttled and dropped, not an outage.

### H2.1 Find out what dropped the connection. This is the important one.

Identify why production reset a connection from a GitHub runner. Investigate, in
order: rate limiting middleware and its Upstash configuration, Vercel bot or attack
protection, and whether the user agent 'eventlinqs-post-deploy-smoke/1.0' from a
datacentre IP is being filtered. Reproduce it deliberately before claiming a fix.

This matters far beyond the smoke check. If production silently resets connections
to an unfamiliar client it may do the same to a Stripe webhook or a Supabase
callback, and a dropped payment webhook is a lost order nobody is told about. Verify
that every machine-to-machine caller the platform depends on is exempt from whatever
is doing this, and register a guard.

### H2.2 The smoke must retry before it cries

A single failed request must not declare production down. Retry with backoff, at
least three attempts, and only fail when the failures are consistent. Distinguish in
the output between a non-200 response, a connection failure, and a timeout, because
those are three different problems and they currently all read the same.

False alarms are worse than no alarm, because they teach the owner to ignore the
channel.

### H2.3 The smoke checked the wrong deployment

The deployment ID never changed across all six polls, so the check ran against the
previous build and then judged it. Wait for the deployment under test to actually be
live, identified by its own deployment id, and fail with a clear message if it never
appears rather than silently testing something else.

### H2.4 The alerting is rate limited and therefore unreliable

The Resend dispatch returned 429, so the alert email was never delivered. An alert
channel that silently drops is worse than none. Establish the real sending limit,
add retry with backoff, and add a second channel that does not share the same
limit. Prove an alert arrives by deliberately failing the smoke once.

### H2.5 Prove it

Re-run the smoke on main and show it green. Then deliberately break it once and show
the alert arriving. Both captured, evidence paths in the ledger.

## H2.6 A DRILL MUST ANNOUNCE ITSELF AS A DRILL.

The alert drill fired correctly on 8 September against https://smoke-drill.invalid
and the email reached the owner. Good. But the subject line read "EventLinqs
production homepage smoke FAILED" with nothing to say it was a test, and the owner
reasonably read it as a real production failure.

An alert that cannot be told apart from a real one trains the reader to panic or to
ignore. Both destroy the value of the channel.

Fix:
  - Any drill run must set the subject to begin with "[DRILL]" and the body to open
    with a line stating plainly that this is a scheduled test of the alerting path
    and no action is required.
  - The drill must state the target it used, so smoke-drill.invalid is visible as
    the reason it failed.
  - A real alert must NEVER carry the drill marker.
  - Register a guard: an alert generated from a drill target must carry the drill
    marker, and an alert generated from the real production URL must not. Prove it
    fails as well as passes.

## PR HYGIENE. 22 OPEN PULL REQUESTS, MOST OF THEM MONTHS OLD. DO AFTER P0.

Open pull requests as at 8 September 2026 include #139 (15 hours), #117, #116,
#115, #114, #113 (27 days), #104, #102 (1 month), #99, #98 (2 months), and twelve
more not listed. This is a graveyard and it hides what is actually in flight.

### PR1. Audit every open pull request. Report before closing anything.

For each one, record in REVIEW-QUEUE.md: number, title, age, and a verdict of
ALREADY ON MAIN, SUPERSEDED, STILL WANTED, or UNKNOWN.

Determine ALREADY ON MAIN by checking whether its changes are present in main, not
by reading the title. Determine SUPERSEDED by naming the later work that replaced it.

### PR2. Never close a pull request carrying work that is not on main.

If a branch holds anything not present on main and still wanted, say so and leave it
open. If it is wanted but unmergeable through drift, say that too rather than
quietly closing it. Losing work silently is worse than a messy list.

### PR3. Close the dead ones with a reason.

Anything ALREADY ON MAIN or SUPERSEDED gets closed with a one line comment saying
which commit or pull request replaced it. Delete its branch only after the close.

### PR4. Then rebase and finish what is left.

Rebase each STILL WANTED branch onto main, run it through the gate, and land it one
at a time. #139, the positioning ruling, is the most recent and should now pass
Lighthouse since H3 raised the floor and cut the bundle. Re-run it first.

### PR5. From now on, one open pull request at a time.

Open the next only when the previous is merged or closed. Register a guard or a
check that reports when more than two pull requests are open at once.

F1. DONE 2026-09-09, commit 6e61c65f. Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, sections "F1.1", "F1.2, F1.3, F1.4", "F1.6" and
"F1.9.2 AND F1.9.3". Its own closing line says: do not re-open F1.1 through F1.9.

UX1. DONE 2026-09-11, commit ef32a2ba. Body moved to C:\dev\CLOSE-OUT-DONE.md.
All four defects fixed at the cause and DRIVEN through the real forms at 390,
768 and 1440 (31 of 31 checks). The signed-in journey that was PARTIAL is run.
Ledger: BUILD-LEDGER.md, "UX1, THE ONE PARTIAL CLAUSE, CLOSED".

## UX2. FOUR MORE DEFECTS FROM THE OWNER'S LIVE READ, PLUS A LEGAL CHECK.

Same event page, 9 September 2026. The route sweep drove 211 routes with zero errors
and found none of these, because a sweep reads status codes and a person reads a page.

UX2.1 LEGAL, HIGHEST PRIORITY. The footer publishes ABN 30 837 447 587. Read that
      number from ONE source, so it changes everywhere at once. The entity taking
      ticket money must match the ABN displayed and the Stripe account entity. When
      the Pty Ltd is registered the number changes, and a guard must fail the build
      if the displayed ABN and the configured entity disagree. Owner is verifying
      the current number at abr.business.gov.au.

UX2.2 The venue map pin is an unlabelled dot. Every surrounding commercial POI
      carries a labelled marker with an icon; the venue, the only point that matters,
      does not. Give it the venue name, brand colour, and visual weight above the
      surrounding POIs. Drive it at 390, 768 and 1440.

UX2.3 The right rail collides with the footer. The last rail card abuts the dark
      footer with no terminal spacing because the two columns end at different
      points. Close the rail properly at every viewport.

UX2.4 The public contact address is hello@eventlinqs.com on a site served from
      eventlinqs.com.au. Split domains hurt trust and email authentication. Pick one
      domain, use it in every surface and every outbound email, and guard that the
      two never diverge again.

### UX2.5 THE PROCESS CHANGE THIS PROVES.

L1 must carry a HUMAN READ of the five launch screens, not only a driven sweep.
A sweep proves a page answers. It cannot see an invisible pin, a bio rendering
asterisks, or a rail crashing into a footer. Add it as a named L1 row with its own
evidence, and never report the sweep as covering it.

## UX3. THE PLATFORM TELLS ITS OWNER NOTHING. HIGHEST PRIORITY OF THE UX ITEMS.

On 8 September 2026 a real outside organiser created an account, built an event,
uploaded a video, set a price and published it on production. The organiser's own
emails were delivered correctly. The owner received nothing and found out by
opening the website by chance the next day.

UX3.1 Five owner notifications, each proven by driving the real action on TEST,
      never by asserting that a code path exists:
        a new organiser account is created
        Stripe Connect onboarding is started
        Stripe Connect onboarding completes and charges are enabled
        an event is published
        every paid order
      Each carries what happened, who, which event, and a direct link into the admin
      console for that record.

UX3.2 The notification path may not be able to fail silently. H2 already proved an
      alert channel can drop itself. Every notification is recorded as sent or failed,
      a failure is retried, and a persistent failure raises through the second channel
      exactly as the smoke alert does. Drill the failure path, not only the success.

UX3.3 Volume control from the start, so this is not ripped out later. Order
      notifications are individual until a configurable daily count, then a digest.
      The threshold is one named constant, and the digest is drilled at the boundary.

UX3.4 The admin Notifications screen must show the same events as a readable feed,
      so the owner can see what happened while away without searching an inbox.

Guard: no state change in that list of five can complete without a notification
record being written. Prove it refuses as well as passes.

## UX4. NOTIFICATION ROUTING. THE INBOX IS LOUD ABOUT THE HARMLESS AND SILENT ABOUT THE DANGEROUS.

Proof from the owner's own inbox, 9 September 2026: the build was stalled from 00:23
to 09:28, six runs killed, nothing pushed for nine hours, and NOT ONE EMAIL was sent,
because nothing failed. Meanwhile six emails arrived for branch gates doing their job,
and zero arrived when a real organiser published a paid event on production.

Nothing here reduces what the owner knows. It replaces noise with the signal that was
missing.

UX4.1 THE DAILY STATE EMAIL. Once a day, at a fixed time, WHETHER OR NOT anything is
      wrong. Main green and its commit; production Ready and the commit it serves;
      what landed in 24 hours; what is open and for how long; WHEN THE BUILD LAST
      PUSHED; each failing branch in one line with its guard named; events live,
      tickets sold, new organisers. It must arrive on a quiet day, because its
      absence is itself the alert.

UX4.2 THE STALL ALERT. If the watchdog is running and nothing has been pushed in six
      hours, alert immediately. This is the condition that cost a full day and that no
      failure notification can ever detect, because a stall produces silence.

UX4.3 IMMEDIATE, OUTAGE ONLY. Main red, a production deployment failed, or the
      post-deploy smoke failed. Distinguishable at a glance from a branch gate, which
      today it is not.

UX4.4 IMMEDIATE, BUSINESS. New organiser, Stripe onboarding started and completed,
      event published, every paid order. This is UX3, the half that does not exist.

UX4.5 BRANCH GATE FAILURES stop being email. They stay in the run log and on the pull
      request, and they appear as one line in the daily email. Never silence the gate
      itself.

Prove every one by driving it: stall the watchdog on purpose and confirm the alert;
fail a branch and confirm no email but a line in the digest; fail main and confirm
both channels; publish on TEST and confirm the business notification. Record all four.

F2. DONE 2026-09-09, commits 1a8d7c95 (F2.3), de4330ca (F2.1 and F2.2) and
13718bb4 (F2.4). Body moved to C:\dev\CLOSE-OUT-DONE.md.
Ledger: BUILD-LEDGER.md, "CLOSE-OUT F2, ADJUDICATED".

## D1  The slot ledger.  Built category general from the first line.
Priority: immediately after UX6. Do not start while any UX6 item is open.

STATE, 10 September 2026, commit f053f7fc. BUILT, DRIVEN AND GREEN, WITH ONE
LEG OUTSTANDING THAT IS NOT MINE TO CLOSE.

  schema            Applied on TEST. ledger_guards() answers 10 of 10 true
                    there. Append only enforced by the database: two triggers
                    that RAISE, the UPDATE and DELETE grants revoked from
                    service_role, RLS on with no policies.
  adapter, guards   One door in. Three registered guards, six clauses, each
                    drilled RED then GREEN on this tree.
  tests             6 files, 102 tests. Canary 359/4247 to 365/4350.
  backfill          264 rows from 244 confirmed orders on TEST; a re-run wrote
                    0 and left 264 alone. NO demand rows backfilled, on
                    purpose. PRODUCTION backfill NOT DONE: production has no
                    ledger tables and a production write is Lawal's approval.
  reversal          Measured both ways on a real build. On the response path it
                    added p95 310.2ms against a 50ms threshold, so it moved
                    behind next/server after(), dropping no field. Five
                    readings after: p95 -31.7, 24.5, 31.0, 49.5, 81.9ms.
  driven            15 of 15 checks at 390, 768 and 1440, on real data: 28
                    units and $665 over six distinct days out, every number on
                    screen compared against the ledger the page read it from,
                    no overflow at any width. Plus a real free purchase writing
                    a real sale row and a real event page writing a real
                    page_view row.
  regression        Green: 102 guards, 365 files / 4350 tests, build, the
                    indexing drive, the checkout drive, the Lighthouse mobile
                    gate (13 URLs, 65 runs).

  FIVE DEFECTS FOUND BY DRIVING IT, all fixed in the item: half of all buyers
  recorded as nobody (guest_email only, null for 138 of 294 orders on TEST);
  the backfill reporting 264 written on a run that wrote 34; the panel showing
  three false zeros beside 28 real sales; five swallowed errors; and
  publish-requires-cover accusing the adapter of publishing events because it
  read a crypto .update() as a database write.

  TO CLOSE: npm run migrate:production. It creates the ledger on production,
  which is the only thing standing between the Afro-Fusion slot and its curve.
  What that order will produce is already established, read-only:
      EL-9HE57YNV  general admission x1  18.00  at 2026-09-09 14:19:41

  Evidence C:\dev\EVIDENCE\D1\. Ledger rows in C:\dev\BUILD-LEDGER.md.

WHY IT IS NOT CALLED THE TICKET LEDGER
This ledger is the foundation of a business that will later run for gyms, clinics, tour operators, studios and venues. If it speaks ticketing it will have to be rebuilt to leave ticketing. It speaks the general language from the first migration and EventLinqs adapts into it.

VOCABULARY, BINDING
- SLOT: any dated unit of perishable capacity. An event, a class, an appointment, a departure, a session.
- INVENTORY CLASS: a priced bucket within a slot. A ticket tier, a membership rate, a concession, a cabin grade.
- UNIT: one sellable place within an inventory class.
- SOURCE SYSTEM: which platform the row came from. "eventlinqs" for now.
Nothing in the ledger schema, the column names, the enums or the engine may use the words event, ticket or tier.

WHAT TO BUILD
One append only table. Rows are INSERTed, never UPDATEd or DELETEd. A refund is a new negative row. Current state tables are untouched.

Every row carries: source system, slot id, organisation id, timestamp.
Every slot carries: category and subcategory as required fields, not derived. Capacity, on sale timestamp, slot timestamp, derived days out, postcode.

Five row types:
1. SALE. inventory class, quantity, price paid, days out, referrer and utm, device, hashed buyer id, first time or returning.
2. PRICE CHANGE. inventory class, old price, new price.
3. INVENTORY. inventory class, action (open, close, hold, release, capacity change), quantity.
4. REFUND. inventory class, quantity, amount.
5. DEMAND. action (page view, checkout started, checkout abandoned, waitlist join, sold out view), hashed visitor id, email if one was entered.

Plus one closing row per slot: final sold, final revenue, fill percentage, attended, no shows.

The email on the DEMAND row is required, not optional. Without it D2 cannot contact anyone.

THE ADAPTER
EventLinqs writes to the ledger through a single adapter module that maps event to slot, tier to inventory class, ticket to unit. Nothing else in the codebase writes to the ledger directly. A registered guard must assert this, because the adapter boundary is the entire portability of the business and it will erode within a month if nothing defends it.

Backfill from existing completed orders on production through the same adapter. Backfill only what was genuinely recorded. Invent nothing.

WHAT IT SHIPS TO THE ORGANISER
A dashboard panel, "How your tickets sold": cumulative sales against days out, price at each point, and how many reached checkout and did not finish.

ACCEPTANCE, ALL REQUIRED
- Migration applied on TEST first. Production only on explicit approval from Lawal.
- Every write path emits its row through the adapter.
- Demand events fire from the slot page and every checkout step including abandonment.
- Tests on all five row types, the adapter mapping and the backfill.
- Guard one: no code path issues UPDATE or DELETE against the ledger.
- Guard two: no ledger column, enum or engine file contains the words event, ticket or tier.
- Guard three: no module outside the adapter writes to the ledger.
- All three guards proven to fail as well as pass.
- Driven proof: pull the complete curve for the Afro-Fusion slot including order EL-9HE57YNV and render it. Captured at 390, 768 and 1440, no overflow.
- Full regression green.

REVERSAL CONDITION, EVALUATED BY THE BUILD
Measure checkout latency at the 95th percentile before and after. If the ledger write adds more than 50ms, move it off the request path to a queue. Never drop fields to make it cheaper. If the queue cannot be built inside this item, ship sales and refunds only, defer demand events, and report it rather than shipping a slow checkout.

## D2  The recovery engine.  Fillrate v0.  Makes money on day one.
Priority: immediately after D1. Requires D1 DEMAND rows including email.

STATE, 11 September 2026, commit 35b47532. BUILT, DRIVEN AND GREEN, WITH ONE
LEG OUTSTANDING THAT IS NOT MINE TO CLOSE.

  schema            Applied on TEST (20260910000003 and 20260910000004).
                    recovery_guards() answers 14 of 14 true there. Sends are
                    append only by trigger and by grant; a hold may be completed
                    but never rewritten; every send and every offer names the
                    ledger row that authorised it, NOT NULL, by foreign key.
  the engine        10 files in src/lib/fillrate. Not one imports a table, a
                    type or a noun belonging to this platform. The word for a
                    place comes from the slot's own category, so the same three
                    messages read "your class" for a gym.
  guards            Three registered (105 total, from 102), nine clauses, each
                    drilled RED then GREEN. Two of the first six drills came
                    back DID NOT FAIL and both were real holes in the guards.
  tests             5 files, 102 tests, plus 11 on the panel. Canary 4455 to
                    4464 in the same commit.
  driven            150 of 150. 41 checks at each of 390, 768 and 1440 on the
                    abandonment sequence, plus 27 on the waiting list, built
                    from nothing through the interface: a real organiser signs
                    up, publishes an event with one free place, a real attendee
                    takes it, two more join the queue, the freed place goes to
                    the first with a hold, the hold runs out, and it passes to
                    the second and not back to the first.
  regression        Green: 105 guards, 371 files / 4464 tests, build, indexing,
                    checkout-viewport, and the Lighthouse mobile gate (13 URLs,
                    65 runs, every assertion).

  THREE DEFECTS FOUND BY DRIVING IT, all fixed in the item:
  the Join Waitlist dialog painted perfectly and could not be clicked, trapped
  in the stacking context of a transformed ancestor (nine more overlays were one
  transform from the same fate, all ten now portalled, with a registered guard);
  one unsubscribe out of sixteen sends cut the whole platform's sequence to a
  single message; and the resume link put its query string after its fragment,
  so the parameters were never parameters and it stopped landing on the tickets.

  NOT DONE, NOT ASSERTED: the payment step of an abandonment, and Stripe's own
  half of the refund that frees a place. Both keys in the Stripe CLI answer
  api_key_expired against Stripe's own API, re-checked 11 September, and every
  STRIPE_SECRET_KEY on Vercel is sensitive. Everything either would trigger IS
  driven; only Stripe's half is not.

  TO CLOSE: npm run migrate:production, or stripe login. The same command that
  closes UX6 and D1.

  Evidence C:\dev\EVIDENCE\D2\. Ledger rows in C:\dev\BUILD-LEDGER.md.


WHY
Between 60 and 80 percent of people who start a checkout do not finish, over 85 percent on mobile. Up to 20 percent of those are recoverable by an automated sequence. No forecast, no model, no history needed. It works on the first slot.

BINDING CONSTRAINT
The engine reads the ledger and nothing else. It must never import from, query, or reference an EventLinqs table, model or type. If it cannot be pointed at a gym's ledger rows tomorrow with only a new adapter, it is built wrong. A registered guard asserts this.

All customer facing copy is parameterised by slot category. The word for a unit comes from a category lookup: ticket, class, appointment, seat, place, booking. No user facing string hard codes "ticket".

WHAT TO BUILD, THREE THINGS ONLY

1. ABANDONED CHECKOUT RECOVERY
Email entered, checkout not completed. Three messages: 2 hours, 24 hours, 72 hours. Stop on purchase, sell out, cancellation, or slot start. Each names the slot, the inventory class, the price, and links to a resumable checkout. No discount in v0.

2. WAITLIST ACTIVATION
Inventory class sold out, person joins waitlist. A refund or release frees a unit, the waitlist is notified in join order with a time limited hold that passes down the list on expiry.

3. THE PROOF PANEL
On the organiser dashboard: how many abandoned, how many emailed, how many returned, and revenue recovered in dollars. This panel is the product. It is what a future standalone Fillrate customer pays for.

MEASUREMENT
Every recovered sale records that it was recovered, which message did it, and the delay. Report raw recovery rate.
Do NOT build a holdout yet. At current volume it would withhold from two or three people and prove nothing. Add it automatically at 300 cumulative abandonments and register that threshold in code.

RULES
- Only ever contact a person about the specific slot they themselves started buying. Never another slot, never another organisation.
- Working one click unsubscribe and the same sender identity as the confirmation email.
- Organiser can switch it off per slot. Default on.
- Suppress the unsubscribed, the refunded and anyone who already bought.

ACCEPTANCE, ALL REQUIRED
- Driven proof on TEST: abandon, receive message one, return, buy, confirm two and three suppressed.
- Driven proof of waitlist: sell out, join, refund, confirm the email fires and the hold expires to the next person.
- Unsubscribe proven to work and to suppress.
- Proof panel renders real numbers at 390, 768 and 1440, no overflow.
- Tests on send, stop conditions, suppression and hold expiry.
- Guard: no path can contact a person about a slot they never engaged with.
- Guard: the engine imports nothing from EventLinqs domain code.
- Both proven to fail as well as pass.
- Full regression green.

REVERSAL CONDITION, EVALUATED BY THE BUILD
Track unsubscribe and complaint rates. Above 2 percent unsubscribes or 0.1 percent complaints, cut to a single message at 2 hours and report. Above 0.3 percent complaints, stop all sends immediately and report, because sender reputation damage would also take down the confirmation emails buyers actually need.

## UX6  Mobile checkout layout.  BLOCKS ALL PAID ADVERTISING.

STATE, 10 September 2026, commit e94840d6. EVERY DEFECT FIXED AT THE CAUSE AND
DRIVEN, WITH ONE LEG OUTSTANDING THAT IS NOT MINE TO CLOSE.

  UX6.1, UX6.2, UX6.3   MET at the cause. The blow-out mechanism was measured on
                        the real page (a 520px child took the track from 358px to
                        520px and the order summary's right edge from 374 to 536
                        on a 390 screen); fixed on 45 grids platform-wide; two
                        registered blocking guards, six drills red then green.
  UX6.4                 MET and driven: zero /tickets links in every guest
                        confirmation the drive sent, and the bearer link opened
                        in a fresh context with no session, HTTP 200 at 390, 768
                        and 1440.
  requirement 1         PARTIAL. Six of the seven surfaces driven at all three
                        widths, twice over, plus the chrome at 1024, 1100, 1280
                        and 1366. The PAYMENT step is NOT EXERCISED: no working
                        Stripe TEST key exists on this machine (both CLI keys
                        answer 401 api_key_expired, every Vercel record is
                        sensitive) and a CLI preview deploy fails on Vercel's own
                        client-side file selection.
  requirements 2, 3, 4  MET.

  TO CLOSE, either founder command does it:
      npm run migrate:production   releases the thirteen unpushed commits, and
                                   the push builds a git preview carrying the
                                   TEST Stripe key
      stripe login                 a working key here, and the drive reaches the
                                   payment step locally

  Also found by driving and fixed in the same item, neither reported before:
  two of five footer social links unreachable on every mobile page; and the
  shared header laying its account controls out at a right edge of 1264 on a 768
  screen, measured identically on production at 768, 820, 900, 960, 1024 and
  1100, so no window under about 1272 could sign in from the header. Plus two
  live WCAG AA failures on the buying path, one of them the price.

  Evidence C:\dev\EVIDENCE\UX6\. Ledger rows in C:\dev\BUILD-LEDGER.md.

Business deadline: 24 September 2026. Paid traffic for the 10 October event cannot start until this is closed.

FOUND
9 September 2026, by the owner driving a real purchase on a phone. Order EL-9HE57YNV, ticket EL-RDHV-JQY2, AUD 18.00. The payment succeeded and the ticket email arrived correctly. The failure is layout, and it is costing sales.

WHY IT IS A BLOCKER AND NOT A COSMETIC
Published checkout abandonment runs 60 to 80 percent across industries and over 85 percent on mobile, the worst performing device. The eighth most common stated reason for abandoning a checkout is being unable to see the total before paying. That is exactly this defect, on exactly the worst device. Every dollar of advertising spent while this is open is spent sending people to a checkout they cannot complete.

UX6.1 BLOCKER. The payment summary is cropped off the right edge at 390 wide. The buyer cannot see the total they are about to pay.
UX6.2 BLOCKER. Multiple checkout boxes do not fit the mobile grid. Content is clipped at the right edge.
UX6.3 BLOCKER. Clipped content is unreachable. No horizontal scroll, no other route to it. Where content genuinely cannot fit it must scroll inside its own container, never be silently clipped.
UX6.4 The ticket email tells the buyer their tickets are at /tickets "when you are signed in". That purchase was a guest checkout with no account, and every buyer arriving from advertising will be a guest. Guest ticket recovery must not require an account.

REQUIRED FIX, STRUCTURAL NOT COSMETIC
1. Drive every checkout and ticket surface at 390, 768 and 1440 and capture each: event page, ticket select, checkout, payment, confirmation, ticket view, /tickets.
2. Assert at each width that document.documentElement.scrollWidth is less than or equal to window.innerWidth. Any surface failing this fails the build.
3. Assert the order total element sits inside the viewport box at 390 and its text is non empty.
4. Register both as blocking guards, proven to fail as well as pass, so this class cannot return.
5. UX6.4 is a copy and routing fix. The email must give a guest a ticket link that works with no sign in, and the sign in sentence must appear only for buyers who have an account.

REVERSAL CONDITION, EVALUATED BY THE BUILD
If the width guard proves flaky on Vercel because webfonts load late, fix it by awaiting document.fonts.ready. Never weaken the assertion, never raise the tolerance, never exempt a page.

## S1  Connected account health, done properly.  Replaces a false alarm with a real check.
Priority: after D2. Do not start while UX6, D1 or D2 is open.

THE FALSE ALARM TO REMOVE
The daily heartbeat compares the organiser display name on EventLinqs with the legal entity name on the Stripe connected account and reports a discrepancy when they differ. Stripe holds these as two separate fields by design. KYC requires the legal entity name of the person or company receiving funds. business_profile.name is the public trading name. For a sole trader organiser they will almost always differ, correctly. MKLStudios trading under the legal name Michael Mirindi MWIKIZA is a correctly configured account, not a fault.
Left in place, this check fires for nearly every organiser forever and trains the owner to ignore the daily email, which destroys the value of every other line in it.
DELETE the name comparison check entirely. Do not soften it, do not downgrade it to informational. Remove it.

WHAT REPLACES IT
For every connected account, read and report the fields that actually determine whether money moves:
- charges_enabled
- payouts_enabled
- requirements.disabled_reason
- requirements.currently_due, listed by name, not just counted
- requirements.past_due, listed by name
- requirements.pending_verification
- requirements.current_deadline, reported as days remaining
- future_requirements.currently_due and future_requirements.current_deadline

Severity rules, exact:
- RED if any account has charges_enabled false, or payouts_enabled false, or a disabled_reason set, or anything in past_due.
- AMBER if anything is in currently_due, or a current_deadline falls inside 14 days, or anything sits in pending_verification for more than 3 days.
- GREEN only when every account can take charges, can be paid out, and has nothing currently due.
Name the organiser and the account id on every non green line, and say in plain words what the organiser must do to clear it.

THE STATEMENT DESCRIPTOR, THE REAL DEFECT
Stripe falls back through business_profile.name, then business_profile.url, then the legal entity name when settings.payments.statement_descriptor is not set. For direct charges and for destination charges with on_behalf_of, the buyer's bank statement shows the CONNECTED ACCOUNT'S descriptor. A buyer who sees an organiser's personal legal name on their statement does not recognise it and disputes the charge.

1. Determine and record in the ledger which Stripe charge type this platform uses, direct, destination, or separate charges and transfers, and whether on_behalf_of is set. Do not assume. Read it from the code.
2. Set the platform's own statement descriptor to EVENTLINQS.
3. At connected account creation, always set business_profile.name to the organiser display name and always set settings.card_payments.statement_descriptor_prefix explicitly, derived from that display name, never left to Stripe's fallback. business_profile.name has the highest precedence, so setting it at creation prevents the legal name fallback for every future organiser automatically.
4. Backfill the existing account acct_1UDGtEKFmbMwdHmT the same way, so the Afro-Fusion buyers see a name they recognise.
5. Add to the daily heartbeat a check that no connected account's effective statement descriptor contains the legal entity name when business_profile.name is set and differs from it.

GUARDS, EACH PROVEN TO FAIL AS WELL AS PASS
- No connected account can be created without business_profile.name and a statement descriptor prefix set in the same call.
- The heartbeat contains no check that compares a display name to a legal entity name.

ACCEPTANCE, ALL REQUIRED
- The name comparison is gone from the code and from the email template.
- The new account health check runs against the live connected accounts and prints the real fields.
- Driven proof on TEST: create a connected account with requirements outstanding and confirm the heartbeat goes AMBER and names them. Disable charges on a test account and confirm it goes RED.
- The existing production account is read and its real state reported, including its effective statement descriptor.
- Migration or update applied to acct_1UDGtEKFmbMwdHmT only with explicit approval from Lawal before any write to a live Stripe account.
- The heartbeat email renders correctly at 390, 768 and 1440 with no overflow.
- Full regression green.

REVERSAL CONDITION, EVALUATED BY THE BUILD
If reading requirements for every connected account makes the daily heartbeat run longer than 30 seconds, cache the account objects for 10 minutes rather than dropping any field from the check. Never reduce the field list to make it faster. If Stripe rate limits the account list, page it and report the page count, do not sample.
