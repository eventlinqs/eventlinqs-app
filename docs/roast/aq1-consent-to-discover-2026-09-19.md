# ROAST LEDGER: AQ1, consent to discover, captured at checkout

Lane B, 19 September 2026. Commits `4344e1d2` (the build) and `dd7f5861` (this
audit's own findings, applied). Branch `lane/b-growth`, not pushed.

The ledger was written from the verbatim text of AQ1 in `C:\dev\CLOSE-OUT.md`,
the session brief, and the standing rules in `CLAUDE.md`, before adjudicating.

---

## Phase 1 and 2: the requirement ledger, adjudicated

### AQ1's own sentences

| # | Requirement (verbatim or split from it) | Verdict | Evidence |
|---|---|---|---|
| 1 | Express consent, separate from the ticket purchase | **MET** | Its own panel, its own input, no dependency on the purchase. `discovery-consent-is-never-preticked.test.tsx` "is not bundled with anything: each box is its own label and its own input". The purchase completes with it untouched: driven, `aq1.decline.*` registered an order with nothing ticked |
| 2 | in the buyer's own words | **MET, inherited from GA1, verified not assumed** | The label stored in `consent_wordings` and read on screen is "Yes, email and text me about other events near me." Read from the live TEST row during the drive setup, not from a literal in this tree |
| 3 | to hear about other events like this one | **MET** | Purpose `facilitated_event_marketing`, whose stored name is "Marketing about events run by other organisers who sell tickets on EventLinqs" (`src/lib/consent/purposes.ts:44`) |
| 4 | Never pre ticked | **MET, on every consent surface on the platform, not only this one** | Component test reads the DOM: `isChecked()` false, no `checked` attribute. Guard clause 1 fails the build on `defaultChecked`, `checked={true}` or `checked="checked"` in any file rendering a consent checkbox: 7 surfaces scanned. Drilled red |
| 5 | never bundled with the terms | **MET** | `grep 'type="checkbox"' src/app/checkout/[reservation_id]/checkout-form.tsx` returns nothing: the terms are a paragraph of links at line 573, so there is no control to bundle with. The consent panel is a separate card |
| 6 | never inferred | **MET** | `recordCheckoutMarketingAnswer` records `granted` only on a tick. An untouched box records `declined`, and where a live consent already exists it records NOTHING rather than inferring a withdrawal |
| 7 | Stored in the consent ledger with the wording shown, the version and the timestamp | **MET** | `consent_events` carries `wording`, `wording_version`, `occurred_at`. Driven: `aq1.ledger.the-wording-stored-is-the-wording-shown` compares the stored body byte for byte against `consent_wordings` after a real registration |
| 8 | A decline is stored as a decline | **MET, driven** | `aq1.decline.an-untouched-box-is-stored-as-a-decline`: "decision declined on checkout" |
| 9 | and is permanent until the buyer changes it themselves | **MET** | The ledger is append only and the latest event wins. Test `is-permanent-until-the-buyer-themselves-grants-again`: still refused months later; refused again when the decline follows a grant; permitted only when a later grant is the buyer's own act |

### AQ1's acceptance lines

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 10 | a test proving the checkbox is unticked by default | **MET** | `tests/component/discovery-consent-is-never-preticked.test.tsx`, 10 tests, by rendering. Proven to have teeth: adding `defaultChecked` to the panel turns it red |
| 11 | a test proving the exact wording shown is the wording stored | **MET, both halves** | Rendered: the body is byte-equal to the record and stamped with its version. Stored: `tests/unit/growth/consent-to-discover.test.ts`, six tests. Driven end to end on real rows |
| 12 | a test proving a declined buyer is excluded from every discovery query | **MET** | Five behavioural tests through the resolver, plus an enumeration of what "every discovery query" is, plus a guard that re-derives that set from the repository. Driven: `consent_permits` answered `permitted=false, the latest consent event is declined`, and 0 audience rows |
| 13 | checkout conversion measured before and after | **MET** | `readCaptureConversion` attributes every settled reservation to the placement in force when it was created. On screen at `/admin/audience`: 41.7% asked at checkout over 1127 settled, nothing before the question existed. 15 tests at both boundaries |
| 14 | and if it falls more than two percent the surface moves to the ticket page instead | **MET as a rule and a control; NOT automatic, and that is argued below** | The rule is computed, named in the summary row, spelled out in the sentence, and executed by one form. See adversarial finding A |

### AQ1's reversal condition

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 15 | a conversion fall greater than two percent moves the capture off checkout | **MET** | Driven: an admin filled the form, the placement moved, the ticket page asked and the payment step stopped |
| 16 | it does not remove it | **MET, structurally** | `CAPTURE_PLACEMENTS` has two values and neither is "off". Removing the question entirely remains the separate `audience_capture` flag |

### The COMPLETION LAW

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 17 | Schema | **MET** | `supabase/migrations/20260919000110_marketing_capture_placement.sql`, applied to TEST, recorded in the migrations ledger |
| 18 | Code | **MET** | 8 new modules, 7 files changed |
| 19 | Tests | **MET** | 64 new. Suite 471/6109 to 480/6277, 0 failed, 0 skipped |
| 20 | A registered blocking guard proven to fail as well as pass | **MET** | `scripts/guards/discovery-consent-is-asked-once-and-never-preticked.mjs`, registered in `run-guards.mjs`. 5 drills, 5 of 5 fire, re-run on the final tree. Green: 170 guards |
| 21 | Driven proof at 390, 768 and 1440 | **MET** | `scripts/verify/aq1-discovery-consent-drive.mjs`, 58 of 58, `C:\dev\EVIDENCE\AQ1` |
| 22 | Full regression green | **MET for the six lane B steps** | typecheck 18s, lint 65s, copy 1s, guards 148s, types-drift 45s, suite 166s |
| 23 | Fix every defect you find before starting the next task | **MET** | One live defect (the pre-ticked homepage box), three in my own work, two harness faults. All fixed in this item, none deferred |
| 24 | Never claim something works without driving it | **MET** | Every claim above names a driven check, a test name, or a command's output |
| 25 | Never guess a slug, route or id | **MET** | The drive enumerates the event from the database and prints it: `geelong-community-night-686810-7qgaz0, enumerated from the database and never guessed` |

### The session's standing rules

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 26 | Never push, never open a pull request | **MET** | `git log origin/verify/l5-launch-readiness..HEAD` is local only. No push, no PR |
| 27 | Never write the shared files | **MET** | Only `BUILD-LOG-B.md`, `REVIEW-QUEUE-B.md`, `LANE-B-CLOSED.md` were written |
| 28 | Port 3100 and nothing else | **MET** | `LB_BASE_URL` defaults to `http://localhost:3100`; the serve script binds 3100 and the shim 8179 |
| 29 | TEST rows carry lane-B; never delete another lane's rows; never truncate | **MET** | Every row created is `lane-b-aq1-*` or carries `lane-B` in its reason. Teardown reports its counts. No delete outside its own rows, no truncate |
| 30 | The border | **MET, none reached** | Nothing in payments, the notification router or the owner digest was touched |
| 31 | The six cheap gate steps before calling an item done | **MET** | All six run and green on the final tree |
| 32 | Read LANE-RETURNS.md first | **MET** | Read end to end. Both entries naming lane B are marked NOT A RETURN and ask nothing |
| 33 | git status as the second action | **MET** | Clean at the start of the run |
| 34 | Kill no process you did not start; never touch C:\dev\leads | **MET** | Only the five processes the lane's own serve script started were stopped, by that script. `C:\dev\leads` was never read |
| 35 | Disk: stop under 8 GB and report | **MET** | Fell to 4.34 GB, reported in the review queue, 7.8 GB reclaimed from this lane's own `.next` (permitted under 10 GB), ending at 12.12 GB. No other worktree touched, no npm cache cleaned |
| 36 | Update the build log, the review queue and the closed file | **MET** | All three appended |

### The constitution's standing rules

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 37 | No em-dashes or en-dashes, no exclamation marks in user-facing copy | **MET** | Copy gate PASS, 0 violations over 1159 files. Hand-swept the four new copy-bearing files: zero |
| 38 | The word "culture" is banned | **MET** | Copy gate covers it; no occurrence in any new file |
| 39 | Australian English | **MET** | "organiser", "recognised", "behaviour" throughout; no US spellings introduced |
| 40 | Law 1, no generic | **MET** | See adversarial finding D |
| 41 | Law 5, zero dead links | **MET** | No new link was introduced. The admin form posts to a server action, not a route |
| 42 | Law 7, research before recommending | **MET** | No new third-party specification is asserted. The only external claim is the Spam Act 2003, already cited throughout this tree. `sourced-specifications` guard PASS |
| 43 | Law 8, the founder is the sole author | **MET** | Both commit messages carry no trailer, no "Generated with", no robot emoji. `.githooks/commit-msg` is active (`core.hooksPath = .githooks`) and accepted both |
| 44 | Law 9, current by default | **MET, nothing pinned** | No version was changed |
| 45 | Design system: no new colours, sizes or type | **MET** | See adversarial finding E |
| 46 | Law 10, script the founder's step | **MET** | The reversal is a form, not a SQL statement. The migration was applied by an existing script. The only founder step left is applying the migration to production, which is RESERVED by his own ruling |

**Count: 46 requirements. Met 46. Partial 0. Not met 0.**

---

## Phase 3: the adversarial pass

### A. Interpretation drift: "the surface moves" could mean automatically, and I built a control

This is the one place I substituted a reading. AQ1 says "if it falls more than
two percent the surface moves to the ticket page instead". Read one way that is
an automation; read another it is a decision rule with a control.

**I built the control, and here is why that is the right reading rather than the
convenient one.** Every close-out item in this file states a "Reversal
condition" and every one of them was built as a switch a person throws: FO1's
`founding_open`, GA1's `audience_capture`, SEO5's
`event_availability_and_access`. GA1's reads "One switch removes the marketing
question from checkout AND stops every audience write" and nobody built a job to
throw it. The house pattern is: measure, state the verdict, provide the control.

**What I did about the risk that a control nobody looks at is a control that
never fires**, which is the honest objection: the verdict is now in the summary
row of the page, in the same words as the paragraph, from one constant, driven
and compared at three viewports. And when it says move, the reason field arrives
pre-filled with the measurement, so the click is evidenced rather than bare.

**What I did NOT do**: an unattended job that relocates a checkout element with
no human naming a reason. That would contradict the design it sits in, where
every placement row carries a reason somebody can argue with, and it is a
decision about the product rather than about the code.

**The question is put to the owner** in `REVIEW-QUEUE-B.md`, named, with both
readings and what each would cost. Not left implicit.

### B. Silent drops

Compared the ledger against the closure block and the report. **None.** The one
requirement not visible in the first draft of the closure block was #5, "never
bundled with the terms", which had been verified but not written down. It is
row 5 above with its evidence.

### C. The unverifiable claim hunt

| Claim | What would falsify it | Tested |
|---|---|---|
| "unticked by default" | a rendered box that is checked | Yes, by rendering, and drilled red |
| "the wording shown is the wording stored" | a stored body differing from the record | Yes, byte comparison after a real registration |
| "a declined buyer is excluded from every discovery query" | a discovery reader that does not ask the door | Yes, guard re-derives the reader set from the repository each build; the enumeration is not a list somebody maintains |
| "the reversal is operable" | a form that does not move the placement | Yes, driven through the admin UI, and moved back |
| "conversion is measured" | a number not derived from rows | Yes, 470 of 1127 settled, read from `public.reservations` |
| "170 guards pass" | any guard failing | Yes, run on the final tree |
| "58 of 58 driven" | any check failing | Yes, and the report is written to disk |

**One claim was deleted rather than defended.** An earlier draft said the drive
"proves the product is correct at 768". It proved nothing of the kind on that
run: the question was absent because of a transient read, and one render cannot
tell that from a defect. The drive now reloads and reports the count, and the
claim is now about what it actually measures.

### D. The generic test

Could this belong to another product? **No, and the specific thing is the
placement log.** A generic implementation of "ask for consent at checkout" is a
checkbox and a column. This one records WHERE the question is asked as an append
only decision with a reason, because the conversion measurement is taken either
side of that line and a line somebody can move is not a measurement. Nothing off
the shelf does that, and it exists because AQ1's reversal condition would
otherwise have been a sentence.

### E. The regression sweep (DESIGN-LOCK)

Elements changed that the brief did not ask for:

1. `src/components/features/home/email-signup-panel.tsx` lost `defaultChecked`.
   **Not reverted, and it is not a design change**: it is the removal of a
   pre-ticked consent box, which AQ1 forbids by name and the Spam Act 2003 makes
   unlawful to rely on. Nothing visual moved.
2. Nothing else. No hero height, no spacing token, no colour, no chrome. The new
   panel reuses the checkout consent panel's classes exactly
   (`rounded-xl border-ink-100 bg-ink-50/60 p-4`, `h-5 w-5 text-gold-500`,
   `min-h-[44px]`). The admin section reuses that page's existing surface
   (`border-white/[0.08] bg-[#131A2A]`), which is pre-existing and already
   recorded as an open question to the owner.

### F. The founder-cost test

Does this send the founder to a dashboard for something code could do? **One
step, and it is reserved rather than unscripted**: applying the migration to
production is his own ruling of 26 August. Everything else is a form on a page
he already has. The measurement needs no dashboard at all.

Does it ask a question I could have answered by reading the code? **No.** The two
questions in the review queue are a product ruling (percentage points against
relative) and an operational decision about a migrations ledger that thirteen
migrations are missing from, which is not mine to repair quietly.

### G. The evidence-visibility test

Twenty-five screenshots at `C:\dev\EVIDENCE\AQ1`, at 390, 768 and 1440, plus
`aq1-drive-report.json` with every check and its detail. The founder can see the
question absent from the ticket page, present and empty at the payment step, the
reversal taken, the question moved, the payment step going quiet, the
registration completing, and the measurement on screen.

### H. The match-versus-surpass test

**Not applicable, and stated rather than skipped.** AQ1 names no competitor and
asks for no comparison. Neither Ticketmaster nor Eventbrite exposes a
platform-discovery consent on a ticket page, so there is no equivalent surface
to capture. The panel inherits the checkout consent panel's treatment, which was
benchmarked under GA1.

---

## Phase 4: the gate

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0.

Finding A is resolved as a reasoned, documented interpretation with the question
put to the owner, not as an open gap.

## Phase 5: decision evidence

The one decision of substance is finding A, plus the reading of "two percent".

| Dimension | Evidence |
|---|---|
| Competitor | Not applicable to the placement decision; no incumbent publishes one. Stated rather than invented |
| Market | The Spam Act 2003 and APP 7 govern the capture and are already cited in this tree; nothing new is asserted |
| Engagement | The reason the rule exists at all: a consent ask on the surface that sells tickets can cost conversion. **UNTESTED and it says so on screen**: both verdicts currently read "not enough evidence" because no period has 100 settled reservations on both sides |
| Trend | Not applicable |
| Our code | `src/lib/consent/*` (GA1 v3), `public.reservations`, `src/app/admin/(authed)/audience/page.tsx` |
| Test plan | It is the item. Conversion under each placement, converted over settled, a fall of more than 2 points with at least 100 a side, reported with its standard error. The variant to run later is the ticket-page placement itself, which is one form away |
