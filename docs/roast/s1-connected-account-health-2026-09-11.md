# ROAST LEDGER: close-out S1, connected account health. 11 September 2026, session 65.

Written BEFORE adjudicating, from the literal text of the run brief and of S1 in
CLOSE-OUT.md, so the ledger cannot be shaped to fit what happened to get done.

## A. THE RUN BRIEF

| # | Requirement (verbatim or near) | Verdict | Evidence |
|---|---|---|---|
| A1 | Read CLOSE-OUT.md and BUILD-BRIEF.md and continue the build | **MET** | both read; CLOSE-OUT.md indexed and the open sections enumerated |
| A2 | COMPLETION LAW: schema, code, tests, guard, driven proof at 390/768/1440, full regression green | **MET** | see section C |
| A3 | Fix every defect you find before starting the next task | **MET** | four found by driving, all fixed in the item; a fifth found and REPORTED with its reason (section D) |
| A4 | Never claim something works without driving it | **MET** | 56 of 56 driven; everything not driven is named OWNER BLOCKED rather than claimed |
| A5 | Never guess a slug, route or id; enumerate from source or the database | **MET** | the three charge call sites enumerated by grep; the TEST account states enumerated by SQL; the pending migrations enumerated by the parity step |
| A6 | Disk: do not delete .next/.turbo/npm cache; stop under 10 GB | **MET** | 22 GB at start, 20 GB at end. Nothing deleted. No cache clean |
| A7 | Supabase CLI rests linked to TEST; never write production without approval | **MET** | `supabase/.temp/project-ref` read back as vkapkibzokmfaxqogypq before and after; production `linked: false`; the only production access was a READ through the parity and types-drift steps |
| A8 | Africa deferred | **MET** | not touched |
| A9 | After each item update BUILD-LOG, BUILD-LEDGER, REVIEW-QUEUE and push to ops/session-log | **MET** | commit dea9bfd7 on ops/session-log, additions only |
| A10 | FIRST ACTION: push the unpushed commits through the normal gate | **MET** | done first. 25 commits, gate green through 8 steps, BLOCKED at production-parity with the 9 pending migrations named. Nothing pushed |
| A11 | HOUSEKEEPING: move a fully-MET item's body to CLOSE-OUT-DONE.md | **MET, by not moving anything** | S1 is not fully MET (three owner-blocked legs), so it stays with a STATE block, which is the pattern UX6, D1 and D2 already use. No other CLOSE-OUT item became fully MET this session |
| A12 | PRIORITY ORDER ABSOLUTE: UX6, D1, D2, UX5, UX1-4, L items | **INTERPRETED, stated in the open** | every one is BUILT and DRIVEN with only founder-blocked legs, recorded in BUILD-LEDGER before this session. S1 is the only CLOSE-OUT item never started. See the adversarial pass |
| A13 | Write DONE to BUILD-COMPLETE.txt only when every launch-blocking item is MET | **CORRECTLY NOT DONE** | 13 of 17 L1 rows are OWNER BLOCKED. The file was not created |

## B. S1'S OWN REQUIREMENTS

| # | Requirement (verbatim) | Verdict | Evidence |
|---|---|---|---|
| B1 | "DELETE the name comparison check entirely. Do not soften it, do not downgrade it to informational. Remove it." | **MET** | `connectNameDivergenceCheck`, `checkConnectProfile`, `businessNameDivergence`, `normaliseBusinessName`, `NameDivergence`, `getConnectedBusinessName`, `business-name-mismatch.tsx` all deleted. Guard clause 3 fails the build if any of four names returns |
| B2 | Report charges_enabled | **MET** | `account-health.ts`, and a test per rule |
| B3 | Report payouts_enabled | **MET** | same |
| B4 | Report requirements.disabled_reason | **MET** | same |
| B5 | "requirements.currently_due, listed by name, not just counted" | **MET** | `named()`; test "names the requirements rather than only counting them" |
| B6 | "requirements.past_due, listed by name" | **MET** | same |
| B7 | Report requirements.pending_verification | **MET** | reported once stuck past 3 days; 4 tests on the boundary |
| B8 | "requirements.current_deadline, reported as days remaining" | **MET** | `daysUntil`; tests on both sides of 14 and on a passed deadline |
| B9 | Report future_requirements.currently_due and future_requirements.current_deadline | **MET** | reported whenever present, AMBER only near the deadline |
| B10 | Severity rules, exact (RED / AMBER / GREEN) | **MET with ONE narrowing, stated as a deviation** | 34 tests. The narrowing is `details_submitted` false = AMBER not RED, forced by acct_1U2EYNGsSxcPFPRu on TEST |
| B11 | "Name the organiser and the account id on every non green line, and say in plain words what the organiser must do" | **MET** | `who()` and the `actions` array; test "names the organiser and the account" |
| B12 | Descriptor 1: determine and record the charge type from the code | **MET, and it is the finding** | separate charges and transfers without on_behalf_of; recorded in BUILD-LEDGER and held by a guard clause |
| B13 | Descriptor 2: "Set the platform's own statement descriptor to EVENTLINQS" | **OWNER BLOCKED** | a write to the LIVE platform Stripe account; no working key and no approval |
| B14 | Descriptor 3: always set business_profile.name AND statement_descriptor_prefix at creation | **MET** | `connect.ts` sets both in one call; guard clause 2; 7 tests |
| B15 | Descriptor 4: backfill acct_1UDGtEKFmbMwdHmT | **OWNER BLOCKED** | S1 itself reserves it for explicit approval |
| B16 | Descriptor 5: heartbeat check on the effective statement descriptor | **MET, scoped and stated** | implemented against `business_profile.name` rather than the legal entity name, with the reason recorded |
| B17 | Guard: no connected account created without business_profile.name and a prefix in the same call | **MET, drilled both ways** | clause 2, two RED drills |
| B18 | Guard: the heartbeat contains no display-name-to-legal-name comparison | **MET, drilled both ways** | clause 3, one RED drill |
| B19 | Acceptance: name comparison gone from the code AND the email template | **MET** | driven: absent from `/admin/health` and from the rendered email at all three widths |
| B20 | Acceptance: "The new account health check runs against the live connected accounts and prints the real fields" | **OWNER BLOCKED** | both Stripe CLI keys answer 401 api_key_expired |
| B21 | Acceptance: driven proof on TEST, AMBER on outstanding requirements and RED on disabled charges | **OWNER BLOCKED** | same key. Proved exhaustively by unit test, which is not the same thing and is not claimed to be |
| B22 | Acceptance: the existing production account is read and its real state reported, including its effective statement descriptor | **OWNER BLOCKED** | same key |
| B23 | Acceptance: any write to acct_1UDGtEKFmbMwdHmT only with explicit approval | **MET, by not writing** | no live Stripe write of any kind was made |
| B24 | Acceptance: the heartbeat email renders at 390, 768 and 1440 with no overflow | **MET** | product's own `heartbeatEmail`, imported not copied; `scrollWidth == innerWidth` at each |
| B25 | Acceptance: full regression green | **MET except production-parity** | 14 of 15 gate steps PASS; parity is the founder's command |
| B26 | Reversal: if the heartbeat runs longer than 30 seconds, cache the account objects for 10 minutes rather than dropping any field | **BLOCKED on measurement, and stated** | the check cannot reach Stripe here, so its real duration is unmeasurable. No field was dropped and none may be |
| B27 | Reversal: "If Stripe rate limits the account list, page it and report the page count, do not sample." | **NOT MET at first pass, then FIXED** | see the adversarial pass. The first implementation inherited `?limit=100` with no paging from the deleted check, which silently omits every account past the hundredth |

## C. COMPLETION LAW, ITEM BY ITEM

| Leg | Verdict | Evidence |
|---|---|---|
| Schema: migration written, applied to TEST, verified by querying it back | **MET** | `connect_watch_guards()` 5 of 5 on TEST; three invariants drilled on the live database |
| Code: built, typechecked, linted, no silent catches | **MET** | `tsc --noEmit` clean; eslint clean; every catch in `requirement-watch.ts` warns with the reason, held by a guard clause |
| Tests: the suite grows and the canary baseline is raised in the same commit | **MET** | 376/4522 to 378/4567, 0 failed, 0 skipped |
| Guard, proven to fail against the broken state and pass against the fixed one, both outputs shown | **MET** | 16 drills, 11 RED and 5 NEGATIVE |
| DRIVEN at 390, 768, 1440, screenshots under C:\dev\EVIDENCE\<item>\ | **MET** | 56 of 56, `C:\dev\EVIDENCE\S1\` |
| REGRESSION: the FULL gate green after the item | **MET except production-parity** | see B25 |
| Committed, Australian English, no trailers, and pushed | **PARTIAL** | committed (1243809b) and Australian English with no trailer; NOT pushed, because production-parity refuses |

## D. STANDING RULES

| Rule | Verdict | Evidence |
|---|---|---|
| Australian English, no em-dashes or en-dashes | **MET** | the copy gate passes in the regression |
| No exclamation marks in user-facing copy | **MET** | copy gate; the new strings carry none |
| The word "culture" banned in every form | **MET** | not used |
| Law 7: every third-party specification carries its fetched source | **MET** | two Stripe pages fetched 2026-09-11 and cited beside every claim they support; `sourced-specifications` passes |
| Law 8: no AI authorship trailer | **MET** | `no-ai-authorship` passes; the commit-msg hook accepted the message |
| Law 10: script the founder's step, or name why it is reserved | **MET** | each of the three outstanding legs carries its exact command or the law reserving it |
| Funds-holding engine untouched | **MET** | no change to any charge, transfer, refund or payout path; the only payments-adjacent edit is a guard that READS `stripe-adapter.ts` |
| Playwright traces and videos deleted after reading | **MET** | none recorded; evidence is 1.5 MB of PNGs and JSON the ledger cites |
