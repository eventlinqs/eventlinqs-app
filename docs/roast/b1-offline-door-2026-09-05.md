# Roast: B1, offline validation at the door

Written 5 September 2026 before adjudication, from the brief's literal text
(C:\dev\BUILD-BRIEF.md, B1 and the Completion Law) and Scope v5 sections 3.12
and 3.13.

## Phase 1: the requirement ledger

| # | Requirement (verbatim or split) | Source |
|---|---|---|
| 1 | "an IndexedDB validation set downloaded when the scanner opens" | Brief, B1 |
| 2 | "offline scanning against it" | Brief, B1 |
| 3 | "an offline queue of scans" | Brief, B1 |
| 4 | "reconciliation on reconnect that resolves double-scans correctly and never admits the same ticket twice across two devices" | Brief, B1 |
| 5 | "Drive it: scan with the network disabled, then reconnect and prove the queue reconciles" | Brief, B1 |
| 6 | "Supports up to 50,000 tickets in the local cache" | Scope v5 3.13 |
| 7 | "Cache is valid for 24 hours from download" | Scope v5 3.13 |
| 8 | "Conflict resolution: if two scanners validate the same ticket offline, the first sync wins and the second is flagged for manual review" | Scope v5 3.12 |
| 9 | "the scanner app downloads and caches a validation dataset: all ticket IDs, their current status (valid/transferred/refunded), and the HMAC secret for that event" | Scope v5 3.12 |
| 10 | Completion law 1: migration written, applied to TEST, verified by querying it back | Brief |
| 11 | Completion law 2: built, typechecked, linted, no silent catches | Brief |
| 12 | Completion law 3: real tests added; the suite grows and the canary baseline is raised in the same commit | Brief |
| 13 | Completion law 4: a registered blocking guard for an invariant that could silently break, PROVEN red and green, both outputs shown | Brief |
| 14 | Completion law 5: DRIVEN in a real browser as a real organiser or attendee at 390, 768 and 1440, screenshots under C:\dev\EVIDENCE\B1\ | Brief |
| 15 | Completion law 6: the FULL gate set green after the item: build, every guard, the complete suite, lint, typecheck, axe zero at every impact on affected surfaces, Lighthouse; anything the item broke is fixed inside the item | Brief |
| 16 | Completion law 7: committed, Australian English, no trailers, pushed | Brief |
| 17 | "The item is not finished until production deploys green with it included." | Brief, DRIVEN |
| 18 | DRIVEN: through the same UI a real person sees; no API call, no direct database write, no harness shortcut | Brief, DRIVEN |
| 19 | DRIVEN: a journey that passes only because a script seeded state a real user could not create FAILS | Brief, DRIVEN |
| 20 | Never write to production; every migration to TEST vkapkibzokmfaxqogypq only; read the ref back | Brief, laws |
| 21 | Disk floor 5 GB never breached; free space logged at the start and end of the item | Brief, laws |
| 22 | Park .env.local around every push and restore it | Brief, laws |
| 23 | Australian English, no em dashes, no en dashes, no exclamation marks in copy, never the banned community word | Brief, CLAUDE.md Copy |
| 24 | Lawal is sole author: zero AI trailers in every commit (Law 8) | Brief, CLAUDE.md |
| 25 | Design system inherited exactly: no new colour, size or type; light cards; Lucide only; no glassmorphism (Law 1, Design system) | CLAUDE.md |
| 26 | Law 5: zero dead links on the surfaces touched | CLAUDE.md |
| 27 | Law 7: no third-party claim without a cited primary source, otherwise UNSOURCED | CLAUDE.md |
| 28 | Law 10: every founder step scripted, reserved or impossible, with a verdict | CLAUDE.md |
| 29 | Push BUILD-LOG.md, REVIEW-QUEUE.md and BUILD-LEDGER.md to ops/session-log after the item | Brief, WHAT LAWAL REVIEWS |

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | src/lib/scanner/door-store.ts (IndexedDB, three stores, batched writes); the scanner downloads the set when it opens through door_validation_set, paged by code (src/app/scan/actions.ts, src/components/features/scanner/scanner.tsx); drive verdict 19 at every viewport: "Offline ready. 3 tickets, downloaded ..., valid until ..." |
| 2 | MET | src/lib/scanner/offline-validate.ts, the device's judgement branch by branch; drive verdicts 23 to 31: with the network cut, ADMIT, REJECT already used just now, REJECT not found, ADMIT, each card saying "Checked offline against the door list" |
| 3 | MET | The queue store and the pending pill; drive verdicts 32 and 35: "4 scans waiting to sync", surviving a reload with no signal |
| 4 | MET | sync_offline_scans admits through the SAME row-locked compare-and-set scan_ticket uses (status valid to scanned, keyed by code, hash and event). Verify script on TEST: two devices syncing the same ticket produce exactly one admitted row and one needs_review row (29 of 29). Drive verdicts 44 to 55 at every viewport: Door A "4 scans synced.", Door B "2 scans synced, 1 needs review." with the flag naming the ticket, and on TEST exactly one admitted row per ticket, one flagged row, three tickets scanned once |
| 5 | MET | The journey cuts the network with context.setOffline on each door, scans, reloads, reconnects; three runs on build-4 of c3d396a5, 38 of 38 each, 0 blockers, 0 server errors (C:\dev\EVIDENCE\B1\drive-*.txt, the three screenshot folders, docs/verification/journeys-2026-08-28/b1-offline-door/) |
| 6 | MET, with the limit stated | DOOR_SET_MAX_TICKETS is 50,000, the download stops there and the strip says the list is capped; the store writes 1,000 rows per transaction and the test writes 2,500 through it. A 50,000 row event was NOT driven: no event of that size exists on TEST, and the brief's drive is the three-ticket door. The paging (5,000 per RPC call, keyset by code) is proven on TEST with page size 2 |
| 7 | MET | DOOR_SET_VALID_FOR_MS is 24 hours; setState and validateOffline refuse to admit on an expired set (stale_set), pinned by offline-validate (19); the strip prints "valid until" from expiresAt |
| 8 | MET | Exactly the rule the RPC implements and the drive proves (row 4): Door A synced first and won; Door B's admission of the same ticket was recorded already_scanned with review_status needs_review, and Door B was told so on its strip |
| 9 | MET for the shape the platform has today; the HMAC part belongs to B4 | The set carries every ticket id (code), its current status (valid, scanned, refunded, void, transferred) and, in place of "the HMAC secret", sha256(secret) per ticket, because the platform's tickets are secret-bearer today and B4 (HMAC, rotating QR, per-event keys) comes later. The store is versioned (DoorSetMeta.version 1) so B4 extends it. This is stated in door-types.ts and the migration header |
| 10 | MET | 20260905000001_offline_door_validation.sql applied to vkapkibzokmfaxqogypq with the ref read back (C:\dev\EVIDENCE\B1\migration-push.txt); read back through the CLI: four functions, eight columns, two indexes, the CHECK, grants authenticated true and anon false (migration-readback.txt); scripts/verify/offline-door-schema-verify.mjs 29 of 29 (schema-verify-test.txt) |
| 11 | MET | build-4: all 62 guards PASS including no-silent-catch and entrypoint-authz, compiled, BUILD_EXIT=0 (C:\dev\EVIDENCE\B1\build-4.txt); tsc 0 and eslint 0 in the pre-push hook on 1b678cc6, 63c52959 and c3d396a5 |
| 12 | MET | Twelve files, 123 tests, plus 2 in the suites that grow with the schema manifest and the guard registry: scanner/offline-validate, door-store (on fake-indexeddb), door-sync, door-copy, scan-actions-offline, offline-door-migration, scan-service-worker (the worker driven in a fake worker global), device-id; guards/offline-door-integrity; reporting/door-review-copy, resolve-scan-review-action; dashboard/main-column-shrinks. Canary 271/3182 to 282/3304 in 1b678cc6, 283/3306 in 63c52959, 283/3307 in c3d396a5, each in the commit that added the files |
| 13 | MET | scripts/guards/offline-door-integrity.mjs registered in run-guards.mjs and named in its header: green on the tree, RED with the status = 'valid' clause removed from the sync's compare-and-set, RED with a secret field added to the device record, green again (C:\dev\EVIDENCE\B1\guard-offline-door-integrity-proof.txt). schema-ahead-of-code: PASS against TEST with ticket_scans.client_scan_id PRESENT, and the founder's production command names it ABSENT (guard-schema-ahead-proof.txt) |
| 14 | MET | drive-all on build-4 of c3d396a5: desktop-1440, tablet-768 and mobile-390 each 38 of 38, 0 blockers, 0 server errors, 18 screenshots and 7 in-journey axe states per viewport, every errors.txt 0 bytes. The organiser signs up through the real form, publishes a free event through the wizard; three guests sign up and take a ticket each from the real page; two doors sign in on fresh browsers and paste the ticket links the confirmation emails carried into the manual entry, which is the same string the QR encodes |
| 15 | PARTIAL, one honest shortfall that is not B1's | Build 62 of 62, suite 283 files / 3307 tests, lint, typecheck: green. axe: 7 in-journey states at each of three viewports (21 scans) plus 6 static scans at 390 and 1440, 0 violations at any impact; the three findings earlier drives surfaced (the card's contrast, the 768 overflow, the unreachable scroll region) were fixed inside the item. Lighthouse, median of three on the preview of c3d396a5, signed in, local server stopped: SCANNER desktop 100, mobile 94; ATTENDEES desktop 99, mobile 78; accessibility 100 on all four. MOBILE IS BELOW THE 95 LAW on the attendees page (78) and one point under on the scanner (94), the platform-wide client shell of the founder's 25 August ruling (Issue #42), the same cause A2, A3 and A4 recorded. SEO 66 is the preview's noindex by design and the pages' private posture |
| 16 | MET | 1b678cc6, 63c52959, c3d396a5 pushed through the pre-push hook; no Co-Authored-By, no "Generated with", no robot emoji; no-ai-authorship PASSES in build-4 |
| 17 | PARTIAL, by design | Production CANNOT deploy B1 until the founder applies 20260905000001 to gndnldyfudbytbboxesk (RESERVED under Law 10, Migrations); the schema-ahead-of-code guard names ticket_scans.client_scan_id ABSENT on production and refuses the production build until then. The code is merge-ready: PR #124 green on c3d396a5 (lint · typecheck · build, test, types-drift, Vercel, preview resolution) |
| 18 | MET | Every step is a click, a keystroke or a paste in a real Chromium: signup, the wizard, Get tickets and the stepper, the manual entry and Check in, the reload, Mark resolved. context.setOffline is the harness cutting the cable, which is what a real gate does to a phone. The only non-UI reads are verdicts on rows |
| 19 | MET | Nothing was seeded. The organiser, the event, the guests and their tickets were all created through the product in each run |
| 20 | MET | Every supabase command ran linked to vkapkibzokmfaxqogypq with the ref read back; the journey, the verify script and the preview session script each refuse the production ref; the only production access was read-only (verify-production-schema.mjs) |
| 21 | MET | 11.81 GB at the start, 11.78 before the drives, about 12 GB at the close; never under 5 |
| 22 | MET | Every push used the try/finally park; "env.local present: True, parked present: False" after each |
| 23 | MET | Sweep over the B1 user-facing files: 0 em or en dashes, 0 exclamation marks in copy (the doctype's is markup and the test says so), 0 uses of the banned word; dates and times render en-AU ("5 Sept, 7:42 pm") |
| 24 | MET | As row 16 |
| 25 | MET | The strip is the house white card with border-ink-200, the pending pill is gold-100 with ink text, the buttons are the shared Button, the result card keeps its solid success and error fills with the detail lines on a white inset in ink (the bearer ticket page's ruling), the review panel uses SectionHeader; no new token, no backdrop filter, no icon library |
| 26 | MET | The scanner is reached from the event overview's Door check-in action as before; the review panel sits on the attendees page the organiser already reaches; axe reports 0 non-200 loads on every URL scanned |
| 27 | MET | Supabase's extensions page is cited beside the pgcrypto line in the migration; the 50,000 and 24 hour figures are the scope's own; no competitor claim is made about offline scanning: whether Ticketmaster or Eventbrite's organiser apps validate offline is UNSOURCED here, no primary page was fetched in B1 |
| 28 | MET | One founder item in C:\dev\REVIEW-QUEUE.md with a verdict: the production migration (RESERVED, one command) |
| 29 | MET | push-build-log.ps1 run at the close of B1 |

## Phase 3: the adversarial pass

**Silent drops.** The brief's B1 has four clauses and a drive; rows 1 to 5. The
scope's 3.12 and 3.13 offline clauses are rows 6 to 9. Row 9's HMAC part is not
dropped: it is stated as belonging to B4 and the store is versioned for it.
Nothing in 3.13 about audio feedback, the guest list view, the attendance
dashboard, multi-scanner realtime (B2) or door sales (B3) is claimed here.

**Interpretation drift.** Three places, each stated rather than reworded.
(a) "Scan with the network disabled" is done with Playwright's
context.setOffline rather than a cable, on two separate browser contexts
standing in for two phones; the queue, the reload and the sync behave as they
would on a phone whose signal drops, and the service worker registration and
shell warm are proven on the same runs. (b) The QR is not read by a camera in
the drive: the ticket link the email carries is pasted into the manual entry,
which is the same string the QR encodes and the same parse path
(parseScan / parseManual share isValidPair). Headless Chromium has no
BarcodeDetector. (c) The offline validation checks sha256(secret) rather than
an HMAC, because the platform's tickets are secret-bearer until B4.

**Match versus surpass.** No competitor evidence exists in the 2026 captures for
an organiser's scanning app, and none was fetched; the claim is not made
(UNSOURCED). What is true of the build on its own terms: a door with no signal
admits, refuses and queues; a reload does not lose the door; two doors
reconcile with one winner and one flag the organiser can see and close.

**Unverifiable claims.** "Never admits the same ticket twice across two
devices": falsified by two admitted rows for one ticket; tested on TEST by the
verify script (two devices, one ticket) and at every viewport by verdict 53.
"The set carries no secret": falsified by a secret key in any row; the verify
script asserts no row has one and every hash equals sha256(secret); the guard
refuses a secret column in the RETURNS TABLE and a secret field in the record
type. "A retried sync writes nothing": falsified by a third row after the
replay; tested (2 rows after). "An expired set admits nobody": tested by
offline-validate. "The scanner reopens offline": verdicts 34 and 35 at every
viewport. "The organiser can close the flag and it stays closed": verdicts 59,
62 and 63.

**The generic test.** The strip says "Offline ready. 3 tickets, downloaded
6:27 am, valid until tomorrow 6:27 am." and "Offline, scanning against the door
list"; the flag says "EL-XXXX-XXXX (name) was admitted at another door first.
The organiser can review it under Attendees."; the review row says "Door D102
admitted this ticket at 5 Sept, 6:24 am while offline, but on sync the ticket
had already been admitted. Door 09E7 had admitted it offline at 5 Sept,
6:23 am." Those are this platform's rules in its own words.

**AI-tell sweep.** 0 em dashes, 0 en dashes, 0 exclamation marks in copy, 0
uses of the banned word across the B1 user-facing files.

**Regression sweep, DESIGN-LOCK.** Existing elements changed, each kept for a
stated reason: (1) the scanner's result card, from white detail text on the
solid fill to a white inset in ink, because axe measured about 3.5:1 for white
on the success green; (2) the dashboard layout's main gained min-w-0, because
at 768 the attendees table stretched the column past the viewport and the
panel's button off screen; (3) the attendee table's scroll wrapper became a
named focusable region, because axe named it the moment it began to scroll;
(4) resolveScanReview asks auth.getUser() in its own file, because the entry
point audit reads files, not gates. No hero, spacing, chrome colour, token or
copy elsewhere changed.

**Founder-cost test.** One step is handed over, the production migration, and
it is reserved by his own ruling. The pgcrypto extension line is a no-op on a
Supabase project and is stated as such in the queue.

**Evidence-visibility test.** 54 screenshots and 21 in-journey axe states at
three viewports committed under docs/verification and copied to
C:\dev\EVIDENCE\B1; the build, guard, schema, verify, push, static axe,
Lighthouse and preview session outputs at named paths; the first and second
drives archived under first-drive and second-drive with what each found.

**Found and recorded.** (1) The tablet timeout on the first drive exposed a
pre-existing dashboard overflow at 768 on every dashboard surface with a wide
table; fixed here once, in the shared layout. (2) Fixing that exposed the
unreachable scroll region; fixed. (3) A journey that ran the whole door
sequence in 52 seconds wanted "minutes ago" and got "just now"; the verdict
was wrong, the product right. (4) A timed-out online scan (twelve seconds) is
judged by the door list and queued; if the server had in fact admitted it, the
sync flags a single physical admission for review. Stated in scanner.tsx; a
false flag is visible and closable, a silent double admission is not.

## Phase 4: the gate

NOT MET: 0. PARTIAL: 2 (rows 15 and 17), the same two causes every Phase A
item carried: mobile Lighthouse on the platform-wide client shell
(founder-ruled, Issue #42) and production deployment waiting on the migration
the founder applies himself. Unresolved adversarial findings: 0. Neither
PARTIAL is finishable by me inside the item, so the report leads with
UNFULFILLED and names what unblocks each.

## Phase 5: decision evidence (a hashed door list, and first sync wins)

| Dimension | Evidence |
|---|---|
| Competitor | UNSOURCED. No primary page on Ticketmaster's or Eventbrite's organiser scanning apps was fetched in B1 and no claim is made |
| Market | The scope's own words: "Critical for outdoor events and venues with poor signal" (3.13); the recruitment wedge is Geelong and Melbourne music and community scenes, where paddock and hall doors are the norm |
| Engagement | UNSOURCED on this platform until real doors run |
| Trend | UNSOURCED |
| Our code | Before B1 the door called scan_ticket on every decode and nothing else; a gate with no signal admitted nobody. The set is hashed because a lost phone must not become a ticket printer; the sync reuses scan_ticket's compare-and-set because one proven invariant is better than two |
| Test plan | When B2 (realtime) lands: two doors online see each other's admissions without a sync; the offline queue stays the fallback. When D5 (PostHog) lands: count offline admissions per event and flagged rows per event over the first ten real doors |
