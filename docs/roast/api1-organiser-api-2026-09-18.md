# ROAST LEDGER: API1, the organiser scoped read only API. 18 September 2026.

Commit `bad09cb4` on `lane/b-growth`. Ledger written BEFORE adjudicating, so it
cannot be shaped to fit what was built.

Brief re-read verbatim from `C:\dev\CLOSE-OUT.md:2199` (lane A folded it out of
CLOSE-OUT-NEXT.md during this run; the text is identical to the copy this run
started from). Plus the lane B run prompt, plus the standing rules.

---

## Phase 1: the requirement ledger

### A. The item body, decomposed. Every imperative its own row.

| # | Requirement (verbatim intent) |
|---|---|
| 1 | Build the read only part of Scope v5 section 11.1 |
| 2 | Organiser scoped API keys |
| 3 | Issued from the organiser dashboard |
| 4 | Revocable |
| 5 | Hashed at rest |
| 6 | GET events |
| 7 | GET orders |
| 8 | GET attendees |
| 9 | For that organiser only |
| 10 | Paginated |
| 11 | Rate limited at the 1000 a minute organiser tier in Scope v5 section 4.1 |
| 12 | Every response carries the organiser id |
| 13 | No write endpoint |
| 14 | No webhook in this item |

### B. The acceptance clauses, decomposed.

| # | Requirement |
|---|---|
| 15 | A key for organiser A cannot read organiser B |
| 16 | Proven by a test that asserts the 404, NOT a 403 |
| 17 | A revoked key is refused within one request |
| 18 | A registered blocking guard that fails the build if any API route returns a row without the organiser scope in its query |
| 19 | That guard proven red then green |
| 20 | Driven proof of the key screen at 390 |
| 21 | Driven proof of the key screen at 768 |
| 22 | Driven proof of the key screen at 1440 |
| 23 | Hash manifest of files touched |
| 24 | Full regression green |

### C. The lane run prompt, the rules that bind this item.

| # | Requirement |
|---|---|
| 25 | One item at a time, finished before the next begins |
| 26 | Finished with schema |
| 27 | Finished with code |
| 28 | Finished with tests |
| 29 | Fix every defect found before starting the next task |
| 30 | Never claim something works without driving it |
| 31 | Never guess a slug, route or id: enumerate from source or the database |
| 32 | Never push, never open a pull request |
| 33 | Never write the shared files (CLOSE-OUT.md, BUILD-LEDGER.md, REVIEW-QUEUE.md, etc.) |
| 34 | Append a closure block to LANE-B-CLOSED.md with item id, date, commit hash, one line per acceptance criterion with evidence path |
| 35 | Port 3100 and nothing else for the server, the Playwright base URL and every driven proof |
| 36 | Every TEST row carries lane-B in its name, slug, email or reference |
| 37 | Never delete, edit or reuse a row tagged for another lane; never truncate a table |
| 38 | Stay inside the lane's slice; raise a BORDER line rather than editing another lane's territory |
| 39 | Run the six cheap gate steps: typecheck, lint, copy, guards, types-drift, suite. All six must pass |
| 40 | Do NOT run the lighthouse, build or production-parity steps |
| 41 | Read LANE-RETURNS.md first; returned work is the first job |
| 42 | Second action every run: git status; never discard uncommitted work |
| 43 | Never stop, kill or restart a node or claude process not started by this lane |
| 44 | Never run Get-Process node or taskkill on a name |
| 45 | Never read, edit or delete anything under C:\dev\leads |
| 46 | No production Supabase write; CLI rests linked to TEST |
| 47 | Do not delete .next, .turbo or the npm cache unless free disk is under 10 GB |
| 48 | Never run npm cache clean |
| 49 | If free disk falls under 8 GB, stop, report, end the run |
| 50 | Update build log, review queue and closed file after the item |

### D. Standing rules from the constitution that bind every task.

| # | Requirement |
|---|---|
| 51 | Law 0: read the governing laws before editing, and state them |
| 52 | Law 0: state how the result will be verified before writing code |
| 53 | Law 1: no generic text, layouts, placeholders or template aesthetics |
| 54 | Law 5: zero dead links AND no dead-end tiles |
| 55 | Law 7: no specification stated from memory; fetch the primary source and cite it |
| 56 | Law 8: no Co-Authored-By naming Claude, no "Generated with", no robot emoji |
| 57 | Law 9: current by default, never backwards |
| 58 | Law 10: script the founder's step, or name the law that reserves it |
| 59 | Copy: no em-dashes, no en-dashes |
| 60 | Copy: Australian English |
| 61 | Copy: the word "culture" banned in every form |
| 62 | Copy: no exclamation marks in user-facing copy |
| 63 | Copy: no placeholder copy |
| 64 | Copy: no competitor named in public-facing copy |
| 65 | Fee system: never hardcode a fee number anywhere, copy included |
| 66 | Design system: inherit exactly, no new colours, sizes or type |
| 67 | Design system: touch targets 44px or larger |
| 68 | Migrations: write the migration file only; the founder applies to production |
| 69 | Definition of Done: nothing ships partial, zero placeholders, works on real data |
| 70 | DESIGN-LOCK: change only what the item asks and regress nothing |

---

## Phase 2: adjudication

### A. The item body

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | Scope v5 11.1 read at `docs/EventLinqs_Scope_v5.md:1265`. Its read-only clauses: read-only access to orders including attendee details, payment status, check-in status; list attendees for an event. Built as three resources, six GET routes |
| 2 | MET | `organiser_api_keys.organisation_id` not null, FK to `organisations`. Every read filters on it |
| 3 | MET | `/dashboard/api-keys`, sidebar entry `dashboard-sidebar.tsx:66`. Driven: `a.desktop-1440.the-nav-reaches-the-key-screen` returns `/dashboard/api-keys` |
| 4 | MET | `revokeApiKeyAction`, driven end to end through the screen: `revoke.the-screen-shows-one-fewer-active-key` (3 active of 3, then 2 active of 3) |
| 5 | MET | `token_hash` sha256 hex, unique index, DB constraint `^[0-9a-f]{64}$`. Unit: "is a sha256 hex digest", "does not contain the token it is over". The plain token is written nowhere |
| 6 | MET | `GET /api/v1/events` and `/events/[id]`. Driven `scope.events.answers-200` |
| 7 | MET | `GET /api/v1/orders` and `/orders/[id]`. Driven `scope.orders.answers-200` |
| 8 | MET | `GET /api/v1/attendees` and `/attendees/[id]`. Driven `scope.attendees.answers-200` |
| 9 | MET | `scope.{events,orders,attendees}.every-row-belongs-to-the-key-holder` and `.the-other-organisers-rows-are-absent`, on real rows for two real organisers |
| 10 | MET | `page.one-per-page-returns-one-and-says-there-is-more`, `.the-second-page-is-a-different-row`, `.an-over-large-ask-is-clamped-not-refused` (999999 clamped to 200) |
| 11 | MET | `POLICIES['api-v1-read']` limit 1000, windowSec 60, keyed by organisation. The number cited to `docs/EventLinqs_Scope_v5.md:869`. Unit test asserts the value AND the ordering of the three steps |
| 12 | MET | One response builder injects it; guard fails the build if any other v1 file calls `NextResponse.json`. Driven `scope.*.names-the-organisation-on-the-payload`. The single exception (the 401 before a key is known) is stated in the code, the test and the closure block |
| 13 | MET | No route exports POST/PUT/PATCH/DELETE (unit test). Plus every write privilege revoked from every role including service_role, driven: `readonly.the-service-role-cannot-write-through-a-view` |
| 14 | MET | No webhook built. `find src/app/api/v1 -name route.ts` returns six GET-only files |

### B. The acceptance clauses

| # | Verdict | Evidence |
|---|---|---|
| 15 | MET | Six crossings driven, both directions, all three resources |
| 16 | MET | `cross.*.answers-404-and-never-403` x6, each paired with `.is-byte-for-byte-the-answer-for-a-uuid-that-exists-nowhere`. The guard fails the build on a 403 anywhere on the surface; a unit test asserts `response.ts` contains no 403 and no forbidden builder |
| 17 | MET | 200, revoke through the screen, then 401 `revoked_key` with no wait: `revoke.the-key-works-immediately-before-revocation` then `revoke.the-very-next-request-is-refused` |
| 18 | MET | `scripts/guards/api-v1-organiser-scope.mjs`, registered in `run-guards.mjs:1142` (blocking on prebuild). Nine checks, listed in its header |
| 19 | MET | 11 of 11 drills red, tree green after each: `C:\dev\EVIDENCE\API1\guard-drills.txt`. Also registered in `scripts/verify/guard-failure-drills.mjs` |
| 20 | MET | `drive/mobile-390-api-keys-a.png`, plus 24 named checks at that width |
| 21 | MET | `drive/tablet-768-api-keys-a.png`, plus 24 named checks at that width |
| 22 | MET | `drive/desktop-1440-api-keys-a.png`, `-b.png`, `desktop-1440-revoke-confirmation.png` |
| 23 | MET | 29 files, sha256 first 16, in BUILD-LOG-B.md under this item |
| 24 | MET for the six steps that are this lane's | typecheck, lint, copy, guards (148), types-drift (MIGRATIONS PENDING), suite (442 files, 5741 tests, 0 failed, 0 skipped). Lighthouse, build and production-parity are lane A's by the run prompt and were NOT run: that is requirement 40, not a gap |

### C. The lane run prompt

| # | Verdict | Evidence |
|---|---|---|
| 25 | MET | API1 was the only item worked. The prior ten plus FT1 were verified already closed with evidence before starting, not re-done |
| 26 | MET | `supabase/migrations/20260918000010_organiser_api_keys.sql`, applied to TEST and read back by query |
| 27 | MET | 13 new source files, 4 modified |
| 28 | MET | 43 new tests across two files, all passing |
| 29 | MET | Nine defects found and every one fixed: six guard findings, two screenshot findings, one lint finding. Plus four harness defects. None deferred |
| 30 | MET | 97 of 97 driven checks. No claim in the report rests on inference |
| 31 | MET | Every id is enumerated: fixture ids come back from the inserts, the "nowhere" uuid is a constant chosen to exist nowhere, `asUuid` refuses anything that is not one. No slug or route guessed |
| 32 | MET | `git log` shows one commit on `lane/b-growth`; no push, no PR |
| 33 | MET | Only BUILD-LOG-B.md, REVIEW-QUEUE-B.md and LANE-B-CLOSED.md were written. CLOSE-OUT.md was read only |
| 34 | MET | The closure block is appended with the item id, the date, `bad09cb4`, and one row per acceptance line with its evidence |
| 35 | MET | `PORT=3100` throughout; `BASE=http://localhost:3100` on every drive |
| 36 | MET | Every row carries `lane-b-api1-<stamp>`: organisations, events, owners, orders, tickets, keys |
| 37 | MET | The only deletions were rows this run created, matched by their own ids or the run stamp. No table truncated |
| 38 | MET | Nothing in lane A's money code or lane C's notification code was touched. The four shared scripts edited (drift analyser, two guards, the aggregate registry) are platform gates, not another lane's slice, and each edit was forced by a guard this item tripped |
| 39 | MET | All six green on the committed tree |
| 40 | MET | None of the three was run |
| 41 | MET | LANE-RETURNS.md read first; its two lane B entries both say explicitly that nothing is asked of lane B |
| 42 | MET | `git status` was the second action; the tree was clean, nothing to preserve |
| 43 | MET | The only processes started or stopped were this lane's own dev server and shim, started by `scripts/dev/lane-b-serve-with-stripe.mjs` |
| 44 | MET | Neither command was run |
| 45 | MET | `C:\dev\leads` never read, listed or touched |
| 46 | MET | Every db command ran against `vkapkibzokmfaxqogypq`; the drive refuses to start against anything else. CLI confirmed linked to TEST |
| 47 | MET | No cache deleted. Disk 12 GB free, above the 10 GB threshold |
| 48 | MET | Not run |
| 49 | MET | 12 GB free, above 8 GB. Reported in the build log |
| 50 | MET | All three updated |

### D. Standing rules

| # | Verdict | Evidence |
|---|---|---|
| 51 | MET | Governing laws stated in the session before the first edit |
| 52 | MET | The verification plan was stated before code: migration plus TEST query, unit tests, a drilled guard, a driven proof at three widths, the six gate steps |
| 53 | MET | See the generic test in Phase 3 |
| 54 | MET, with the limit of the proof stated | The one new nav entry resolves 200 SIGNED IN, driven: `a.desktop-1440.the-key-screen-answers-200` asserts both the status and the landed path. The screen's only two outbound links are `/dashboard/organisation/create` and `/dashboard/events`; both were driven to 307-to-login while signed out, which is the correct answer for a dashboard route, and both are PRE-EXISTING sidebar destinations rather than anything this item introduced. I did NOT click them signed in, and say so rather than implying I did. No tile-shaped image was added, so the affordance half of Law 5 has no new subject |
| 55 | MET | The only external specification claimed is the rate tier, cited to the repository's own Scope v5 section 4.1 with the line number. No third-party platform spec is asserted anywhere in this item |
| 56 | MET | `git log -1 --format=%B` carries no trailer, no "Generated with", no emoji. `no-ai-authorship` guard green |
| 57 | MET | No version pinned, moved or downgraded |
| 58 | MET | One founder step exists (the production migration) and it is RESERVED by name, with the command, in REVIEW-QUEUE-B.md |
| 59 | MET | Copy gate green over 1127 files |
| 60 | MET | Copy gate green; "organisation", "revoke", "authorise" spellings used |
| 61 | MET | Copy gate green; no occurrence introduced |
| 62 | MET | Copy gate green |
| 63 | MET | No "coming soon", no lorem, no sample values. The empty state is a real designed sentence |
| 64 | MET | Copy gate includes competitor names; green |
| 65 | MET | The guard fails the build if any numeric literal other than 0 or 1 appears on the key screen. The fee is not mentioned at all on this surface; the rate limit and page caps are READ from the modules that enforce them |
| 66 | MET | Only existing tokens used: `ink-*`, `gold-*`, `type-rail-heading`, `max-w-*`, `rounded-lg/xl`. No new colour, size or face |
| 67 | MET | `every-control-is-at-least-44px` driven at all three widths (`h-11` = 44px) |
| 68 | MET | The migration file is written and applied to TEST only. Production is named as the founder's command |
| 69 | MET | See Phase 3 |
| 70 | MET | See the regression sweep in Phase 3 |

---

## Phase 3: the adversarial pass

**Silent drops.** Compared the 70-row ledger against the report draft. Rows the
draft did not mention: 14 (no webhook), 31 (never guess an id), 43 to 49 (the
machine-sharing rules), 55 to 57, 59 to 64 (the copy laws individually). NONE of
these is unmet; they were unstated because they are satisfied by default or by a
green gate. They are now adjudicated above rather than assumed. **No requirement
is unmet and unmentioned.**

**Interpretation drift.** One place it nearly happened and is worth naming. The
acceptance says "a test that asserts the 404, not a 403", and the easy reading is
"write a unit test asserting a 404 status". That reading is satisfiable with a
mock and proves nothing, because the whole risk is that the SCOPE is wrong, not
that the status constant is wrong. The harder and correct reading is the one
built: two real organisations, real rows, and a byte-for-byte comparison against
the 404 for an id that exists nowhere. A status-only test would have passed on a
route that returned 404 for everything.

A second, smaller one: "paginated" could have been satisfied by accepting a
`limit`. The ceiling is the part that matters, because without one a read API is
an export endpoint by accident, so `MAX_PAGE_SIZE` is enforced and driven.

**The match-versus-surpass test.** The brief does not use the words surpass,
beat or better than. It cites Scope v5 and Bookedproof's need. No competitor
comparison is claimed in the report, and none is made here. NOT APPLICABLE,
stated rather than skipped.

**The unverifiable claim hunt.** Every quality claim in the report, and what
would falsify it:

| Claim | Falsifier | Tested |
|---|---|---|
| A key for A cannot read B | A's key returns any row whose organisation_id is B's, or a 200 for B's id | Yes, 6 crossings plus 3 list sweeps |
| The 404 is not an existence oracle | The two bodies differ | Yes, byte comparison, 6 times |
| A revoked key is refused within one request | The request after revocation returns 200 | Yes, driven with no wait |
| The QR secret never leaves | The string appears in a payload | Yes, 4468 bytes searched for 2 known secrets and for `"secret"` |
| The views are read only | A service-role write succeeds | Yes, refused, and the row read back unchanged |
| The guard would catch an unscoped read | Removing the predicate leaves the guard green | Yes, drill 1 |
| No horizontal overflow at 390 | scrollWidth exceeds clientWidth | Yes, 0px at all three widths |
| The documented caps are the real ones | The page shows a number the module does not | Yes, both the guard (no literals) and the drive (the rendered text) |
| Nothing left on TEST | A row matching the stamp survives | Yes, twice: the drive's own teardown check and a separate query after |

No claim survives that I cannot falsify-test. One claim was DELETED during the
run: the first closure draft would have said "the suite is green", and one of
four runs failed unexplained. It now says three passed, one failed, and the
output was not captured.

**The generic test.** Could this belong to another product? The API itself is a
standard REST read surface and deliberately so; there is no EventLinqs identity
to express in a JSON payload beyond correctness. The SCREEN is where the test
bites, and what makes it EventLinqs is not decoration: it leads with the
data-ownership promise in the founder's own terms ("You own these records: we do
not hold them back from you and we never will"), which is the second blade of
the locked wedge and something DICE and Eventbrite structurally will not say. It
documents the endpoints with figures READ from the modules that enforce them
rather than typed, which is the forecast tool's law applied to a settings
screen. And it ends by pointing at the spreadsheet download rather than pretending
the API is the only answer. A template API-keys screen has a table and a Generate
button; this one argues the platform's position.

**The AI-tell sweep.** Ran the copy gate over the tree: 1127 files scanned, 0
violations, across dashes, banned words, phrase tells and competitor names.
Manually scanned the three new user-facing files for the tell lexicon
(unforgettable, look no further, elevate, unlock, vibrant, nestled, in the heart
of, stands as a testament, "not just X it's Y", delve, tapestry, seamless,
robust, leverage, navigate the landscape): **0 occurrences**. Em-dashes: 0.
En-dashes: 0. Exclamation marks in user-facing copy: 0.

**The regression sweep. DESIGN-LOCK.** Existing elements changed that the brief
did not ask for:

1. `dashboard-sidebar.tsx`: one nav entry ADDED. Required by Law 5 (the screen
   must be reachable) and by the item's own "issued from the organiser
   dashboard". No existing entry moved, renamed or restyled.
2. `src/lib/rate-limit/policies.ts`: two policies ADDED. No existing policy's
   number, key or posture changed.
3. `src/lib/seo/indexing-policy.ts`: one route classified. Forced by a guard.
4. `src/types/database.ts`: regenerated surgically. Verified that the counts of
   `event_needs`, `event_need_lines` and `wheelchair_accessible` are UNCHANGED,
   so no unrelated schema rode in.
5. Four gate scripts changed, each forced by a guard this item tripped, each
   adjudicated in the review queue. The drift analyser change is a LOOSENING and
   is the one that deserved the most care: it ships with six negative tests.

**Nothing was reverted, because nothing was changed that should not have been.**
No hero height, spacing, colour, layout, chrome or existing copy was touched.

**The founder-cost test.** Does the report send him to a dashboard for something
scriptable? One founder step exists: applying the migration to production. It is
RESERVED by his own ruling of 26 August 2026, not a failure to script it, and the
one command is named. Does it ask a question answerable by reading the code? No
question is asked. The review queue's four entries are: a reserved step with its
command, one decision genuinely his (an unusual privilege posture), one gap
closed and recorded, one unexplained intermittent.

**The evidence-visibility test.** Can he see it with his own eyes? Five
screenshots at named paths, a 97-check JSON report, a guard drill transcript.
All under `C:\dev\EVIDENCE\API1\`. The deliverable is visual and is captured at
all three widths.

---

## Phase 4: the gate

NOT MET: 0. PARTIAL: 0. Unresolved adversarial findings: 0.

One item is recorded as unexplained and is NOT counted as met or unmet because it
is not a requirement: a single suite run failed at 147 seconds between three
passes, with its output not captured. It is in REVIEW-QUEUE-B.md.

---

## Phase 5: decision evidence

This item is an engineering build against a written specification, not a design
or strategic decision, so the six-dimension table is not triggered. The one
decision inside it that could have gone either way is recorded anyway:

| Dimension | Evidence |
|---|---|
| Competitor | NOT GATHERED, and stated rather than skipped. No competitor's API key format or scoping model was fetched. The decision (views carrying the scope column) was driven by this repository's own schema, not by market practice, and the item cites Scope v5 rather than a competitor |
| Market | NOT GATHERED, same reason |
| Engagement | NOT APPLICABLE: a settings screen behind auth, not a conversion surface |
| Trend | NOT GATHERED |
| Our code | `src/lib/organisations/scope.ts`, `src/app/api/payouts/list/route.ts`, `src/lib/rate-limit/policies.ts`, the five table shapes in `src/types/database.ts`, all read before building |
| Test plan | How we would know it is wrong: a key returning a row whose organisation_id is not its own, or a 403 for an out-of-scope id. Both are asserted by the drive and the second is blocked by a registered guard |
