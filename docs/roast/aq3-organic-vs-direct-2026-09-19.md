# AQ3, lane B's half: the requirement ledger

**Task:** close-out AQ3's measurement half, "organic attributed orders reported
separately from direct", plus the defect found while driving it.
**Date:** 19 September 2026.
**Lane:** B. **Branch:** lane/b-growth. **Port:** 3100. **Database:** TEST
vkapkibzokmfaxqogypq only.

The ledger was written before adjudication, from the verbatim session brief, the
verbatim AQ3 body in `C:\dev\CLOSE-OUT.md`, and the standing laws in CLAUDE.md.

---

## A. The COMPLETION LAW, from the session brief

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| A1 | Read CLOSE-OUT.md and BUILD-BRIEF.md and continue the build | MET | CLOSE-OUT.md read (headings, the three-lane protocol, the marketing block, the AQ bodies); BUILD-BRIEF.md and BP-* read for the lane rules |
| A2 | One item at a time | MET | One item taken: AQ3's lane B half. The account-deletion defect was found INSIDE it and fixed inside it rather than deferred, which A10 requires |
| A3 | Finished with schema | MET | `supabase/migrations/20260919000130_evidence_outlives_the_account.sql`, applied to TEST and recorded in its ledger. The measurement half itself needs no schema and that is stated rather than implied: every field it reads (`referrer`, `utm_*` on `ledger_entries`) already existed from D1 |
| A4 | Code | MET | `src/lib/growth/source-categories.generated.ts`, `traffic-channel.ts`, `organic-reach-math.ts`, `organic-reach.ts`, `src/app/admin/(authed)/traffic/page.tsx`, `scripts/ops/refresh-ga-source-categories.mjs` |
| A5 | Tests | MET | `tests/unit/growth/organic-is-not-direct.test.ts`, 42 tests. Suite 482 files / 6356 tests / 0 failed / 0 skipped |
| A6 | A registered blocking guard proven to fail as well as pass | MET, twice | `organic-is-not-direct.mjs` RED 5 of 5 (`C:\dev\EVIDENCE\AQ3\drills-organic.txt`); `evidence-outlives-the-account.mjs` RED 4 of 4 (`drills-evidence.txt`). Both registered in `run-guards.mjs`; GREEN in the 173-guard run |
| A7 | Driven proof at 390, 768 and 1440 | MET | `scripts/verify/aq3-organic-vs-direct-drive.mjs`, **57 of 57**, `C:\dev\EVIDENCE\AQ3\drive.txt`, with captures per viewport |
| A8 | Full regression green (the six lane B steps) | MET | typecheck 34s, lint 58s, copy 1s, guards 145s (173 of 173), types-drift 39s, suite 114s. `gate-*.txt` in the evidence directory |
| A9 | Before the next begins | MET | No other item started |
| A10 | Fix every defect found before starting the next task | MET | Six fixed, listed in section E. The largest is the account-deletion defect |
| A11 | Never claim something works without driving it | MET | Every claim below names a drive check, a test, a guard run, or a database read |
| A12 | Never guess a slug, route or id: enumerate it | MET | The visited event is read from the database at runtime (`aq3.fixture.the-visited-event-was-read-not-guessed`), and the period links are harvested from the rendered page rather than typed |

## B. The lane rules

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| B1 | Work only in C:\dev\lanes\B on lane/b-growth | MET | Every command run from this worktree; no `-C` at another lane |
| B2 | Never push, never open a pull request | MET | No push, no PR. Commit on lane/b-growth only |
| B3 | Never write the shared files | MET | CLOSE-OUT.md, CLOSE-OUT-DONE.md, CLOSE-OUT-NEXT.md, BUILD-LEDGER.md, BUILD-LOG.md, REVIEW-QUEUE.md, DEPLOY-STATE.txt, push-attempt.log, BUILD-COMPLETE.txt all unmodified |
| B4 | Write only BUILD-LOG-B.md, REVIEW-QUEUE-B.md, LANE-B-CLOSED.md | MET | Those three, plus this ledger inside the repo |
| B5 | Append a closure block naming item, date, commit, one line per criterion with an evidence path | MET | LANE-B-CLOSED.md, this run |
| B6 | Port 3100 and nothing else | MET | `BASE=http://localhost:3100` on every run; the server is `scripts/dev/lane-b-serve-with-stripe.mjs`, which binds 3100 |
| B7 | Every TEST row carries lane-B | MET | `lane-b-aq3-*` organisation, event, venue, accounts and buyer address |
| B8 | Never delete, edit or reuse another lane's row; never truncate | MET | The purge matches `lane-b-aq3-` only. The visited event is READ, never written. No truncate |
| B9 | Border rule for another lane's territory | MET | Three BORDER lines written in REVIEW-QUEUE-B.md, section D below |
| B10 | The six cheap gate steps, all six | MET | A8 |
| B11 | Do not run lighthouse, build or production-parity | MET, with one recorded slip | A PowerShell invocation swallowed `--` and started the whole 16-step gate. It was interrupted and re-run correctly as `node scripts/ops/pre-push-gate.mjs --only types-drift`. Recorded rather than hidden |
| B12 | Read LANE-RETURNS.md first | MET | Read. No return names lane/b-growth; the last lane B entry is explicitly "NOT A RETURN" |
| B13 | The priority order | MET | FO1, GA1 v3, GA2, GA3, GA4, GA5, OL1, AN1, PL1, C19 all checked against CLOSE-OUT.md and CLOSE-OUT-DONE.md: every one closed, AN1's fourth line the owner's. AQ1 and AQ2 closed earlier today. AQ3 is the open body |
| B14 | git status as the second action; never discard uncommitted work | MET | Ran at the start; the tree was clean |
| B15 | Never stop or kill another process; never Get-Process node or taskkill | MET | The only server started was lane B's own on 3100 |
| B16 | Never touch C:\dev\leads | MET | Never read, listed or written |
| B17 | Production untouched; the CLI rests linked to TEST | MET | `supabase projects list` shows vkapkibzokmfaxqogypq linked. Every write named TEST and the apply tool refuses anything else |
| B18 | Disk discipline | MET | 13.65 GB free at the start, 8.5 GB at the gate run. No cache deleted, no `npm cache clean`. No Playwright traces or videos were recorded |
| B19 | Africa deferred | MET | Untouched |
| B20 | After each item update the build log, the review queue and the closed file, and commit | MET | All three written and committed with the work |

## C. AQ3's own body, verbatim

| # | AQ3 asks | Verdict | Evidence |
|---|---|---|---|
| C1 | Event structured data on every event page | MET, NOT BY THIS LANE | SEO1 v2, closed by lane C on 14 September, verified by lane A on 19 September. Audited against the tree before this item started and recorded in REVIEW-QUEUE-B.md |
| C2 | City and category landing pages | MET, NOT BY THIS LANE | `/city/[slug]` and `/categories/[slug]` both exist |
| C3 | A this weekend surface | MET, NOT BY THIS LANE | Lane C, commit 027780ad, 19 September |
| C4 | Correct Google Events markup | MET, NOT BY THIS LANE | Same item as C1 |
| C5 | Measured as organic sessions to event pages and the orders attributed to them | **MET** | `/admin/traffic`: organic search visits and organic search orders, off `ledger_entries` page-view and sale rows. Driven: a real arrival from Google produced the visit row, and that visitor's purchase produced the order (`aq3.purchase.the-sale-row-carries-the-search-engine`) |
| C6 | Acceptance: structured data validating against Google's own tester | **NOT MET, AND NOT THIS LANE'S** | Lane C's SEO1 v2 half. Lane B did not re-run it and does not claim it. Stated in REVIEW-QUEUE-B.md |
| C7 | Acceptance: landing pages indexed and reported in Search Console | **NOT MET, THE OWNER'S** | The property does not exist until a dashboard in his Google account mints it. The scripted halves are `scripts/ops/set-measurement-identifiers.mjs` and `scripts/ops/search-console-verify.mjs`. Same blocker as AN1 acceptance 4 |
| C8 | Acceptance: organic attributed orders reported separately from direct | **MET** | Four separate tiles and eleven separate channel rows at all three viewports. Enforced at build time by clause 3 of `organic-is-not-direct.mjs`, drilled RED |
| C9 | Reversal: a surface that cannot be filled with real events is not published | MET, NOT BY THIS LANE | `src/lib/seo/discovery-threshold.ts`, and lane C drove it in both directions on `/this-weekend` |

## D. Borders raised rather than crossed

| # | Border | Whose | Written |
|---|---|---|---|
| D1 | `perf-budget.json` needs a first mark for `/admin/traffic` | lane C's file, lane A's build | REVIEW-QUEUE-B.md |
| D2 | The demand beacon refuses an UNLISTED event, so a page that renders to anyone holding the link is never counted | the slot ledger, lane A's | REVIEW-QUEUE-B.md |
| D3 | `event_group_rates.created_by` carries the same `on delete set null` shape under a row-level price trigger: latent, not live | lane B's own table, deliberately deferred to its own change | REVIEW-QUEUE-B.md |

## E. Defects found and fixed inside this item

| # | Defect | Found by | Fixed |
|---|---|---|---|
| E1 | **No account on the platform could be deleted, at all.** `marketing_capture_placement.decided_by` carried `on delete set null` into a table whose every UPDATE is refused by a FOR EACH STATEMENT trigger. The referential action runs its statement whether or not a row matches, so `auth.admin.deleteUser` failed for everybody | the AQ3 drive teardown | migration 20260919000130, applied to TEST; 18 stuck accounts then deleted, and the 13 evidence rows kept all 12 of their deciders |
| E2 | The refresh script dropped one row of Google's published table silently (`aax-us-east.amazon-adsystem.com` fills the layout column, so it arrives with one space, not two) | reading the parse counts against the raw text | separator relaxed AND an `unparsed` refusal added, so a lost row can never again be silent |
| E3 | The guard's calibration probe could not fail: it was handed paths after the function had been changed to take source, so it tested the string "undefined" against both matchers | the guard's own first run, then a reading | the function throws on a non-string, and the probe is two-sided through the same function the real scan uses |
| E4 | Clause 3 accepted a local named `direct` that read the organic figure, which is the defect wearing the defect's name | its own drill, reported DID NOT FAIL | matches a READ of the field (`.direct` or a destructure), not the word |
| E5 | Every figure in the channel table was off-screen at 390, behind an inner scroll, while the page passed its own horizontal-overflow check | reading the driven capture rather than the report | the table reflows to labelled lines below md; a new drive check measures where the figures actually are |
| E6 | The drive swallowed its own exceptions in a `finally` and reported "1 of 1 checks passed" over a throw | a run that reported one check | a `catch` that records the stack as a failed check |

## F. Harness faults corrected before they could accuse the product

| # | Fault | What it claimed | What was true |
|---|---|---|---|
| F1 | The direct arrival reused the Google arrival's user agent | "the ledger failed to record a direct visit", three times | The beacon dedupes per visitor per event per day and the two were one visitor. The product was right |
| F2 | The second run reused the first run's user agents on the same day | "the ledger failed to record a search arrival", three times | Same dedupe, across runs. Every arrival now carries a per-run build number, so the drive is re-runnable |
| F3 | `aq3.ledger.every-referrer...` compared its own count to itself | passed reading "0 recorded referrer(s), all www.google.com.au" | True of an empty list. It now asserts the expected count |

## G. Standing laws

| # | Law | Verdict | Evidence |
|---|---|---|---|
| G1 | Australian English | MET | copy gate PASS |
| G2 | No em-dashes or en-dashes | MET | 0 across every new file; copy gate PASS |
| G3 | No exclamation marks in user-facing copy | MET | The one `!` in the page is a JS negation on line 108 |
| G4 | The banned word, everywhere | MET | `no-banned-word-anywhere` PASS. Two rows of Google's fetched table carry it as a third-party brand name and are exempted with a reason and an EXACT budget of 2, under the founder ruling of 3 September 2026 |
| G5 | Community-first language | MET | Nothing in this item names a community |
| G6 | No placeholder copy | MET | Every figure is read from the database; the empty state is designed and names a next action |
| G7 | Law 7, research before recommending | MET, and it changed the design | Google's channel rules and source table fetched and cited. The table carries no entry for `google.com.au`, so a host match would have reported every Google visit as a referral. Section H |
| G8 | Law 8, authorship | MET | Commit message carries no trailer; `no-ai-authorship` PASS |
| G9 | Law 10, script the founder's step | MET | The table refresh is one command and idempotent. The one step left to him is applying the migration to production, which HIS OWN ruling of 26 August reserves |
| G10 | Law 5, zero dead links | MET | 4 period links driven at three viewports, 0 non-200. The two external citations answered 200 when fetched |
| G11 | Law 1, no generic | MET | Section H |
| G12 | DESIGN-LOCK | MET | No existing surface changed. `admin-nav.ts` gains one entry so the page is reachable, `indexing-policy.ts` one entry because every route must be classified. No hero, spacing, colour or chrome touched |
| G13 | axe-core, 0 serious or critical | MET | 0 violations of ANY impact at 390, 768 and 1440, in the drive, through the saved admin session: `scripts/axe-lane-b-surfaces.mjs` cannot reach an authenticated page |
| G14 | Design system inheritance | MET | `AdminStatTile`, `#131A2A` cards, `font-display`, `--brand-accent`, the console's own dark surface. No new colour, no new size, no glassmorphism, no client JavaScript |

## H. The competitor benchmark, and the honest shape of it

There is no public Ticketmaster or Eventbrite equivalent of a staff console, so a
1440/390 capture of theirs cannot be taken. The observable equivalent, and the
thing this page is actually measured against, is **GA4's Traffic acquisition
report**, whose default dimension is "Session default channel grouping"
(https://support.google.com/analytics/answer/12923437, fetched 2026-09-19) using
the same default channel group this page implements
(https://support.google.com/analytics/answer/9756891, fetched 2026-09-19).

| Aspect | Verdict | The specific difference |
|---|---|---|
| Definition of a channel | PARITY | The same published rules, in the same published order |
| Provenance | SURPASS | The page links the rules and the site list, names the date the list was confirmed, and a guard recomputes a digest over it on every build. GA4's report does not carry its own definition |
| Consent dependency | SURPASS | A referring host is not identifying, so it is recorded whether the visitor accepted or refused. A GA4 number is missing everybody who refused |
| Orders attributed | SURPASS for this purpose | Read off the platform's own append-only ledger, first touch, stored server side at the moment the browser still had it. No tag to install, nothing to sample, nothing to model |
| Channel coverage | BELOW, deliberately and named | 11 channels against GA4's 17. Cross-network and the Google Ads network type need data this platform does not hold, and the two shopping rules could not be read unambiguously on the day. Named on the page, and an unclaimed visit stays a referral, so it under-reports search rather than flattering it |
| Exploration | BELOW, named | No pivots, no date comparison, no segments. One question, answered |
| Honesty about its own gaps | SURPASS | The page reports sale rows it could not trace to an order rather than absorbing them, names the channels that recorded nothing, and says "no visits" where a rate cannot exist instead of printing 0 |

**The generic test.** Could this page belong to another product? No. It reads the
EventLinqs slot ledger's own demand and sale rows, it counts a visit the way the
EventLinqs demand beacon writes one (one visitor, one event page, one day), it
counts an order the way this platform writes sale rows (one per order item,
resolved back through `order_items`), and it refuses to print money because
`ledger_entries` carries no currency and a refund row carries no channel. Every
one of those is a fact about this codebase.

## I. The gate

Requirements: 57. MET: 55. NOT MET: 2 (C6 and C7, both outside this lane and
both named). PARTIAL: 0. Unresolved adversarial findings: 0.

C6 and C7 are recorded as NOT MET rather than excused, because AQ3 lists them and
this lane did not do them. C6 belongs to the lane that built the structured data;
C7 cannot exist until the founder's own Google account mints the property.
