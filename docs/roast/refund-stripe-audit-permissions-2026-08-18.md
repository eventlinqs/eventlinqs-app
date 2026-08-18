# Roast ledger: refund path, Stripe account audit, migration permission aftermath

Date: 2026-08-18. Branch `integration/launch`. Ledger written before adjudication.

## Phase 1: requirement ledger

Decomposed from the founder's brief verbatim. Compound sentences split.

### Task 1: the organiser refund path

| # | Requirement |
|---|---|
| 1 | Find the refund path end to end: UI control on the organiser dashboard |
| 2 | ... the server action |
| 3 | ... the Stripe API call |
| 4 | ... the webhook that handles `refund.updated` or `charge.refunded`, and what it writes back |
| 5 | Quote each |
| 6 | State plainly whether an organiser can refund from the dashboard right now, yes or no |
| 7 | When a refund completes, does the ticket void? |
| 8 | Does the tier's `sold_count` decrement so the seat returns to sale? |
| 9 | Prove it with real numbers on TEST, not by reading code |
| 10 | Confirm the code refunds from the right place (platform balance, not the connected account) |
| 11 | Confirm an organiser cannot refund money the platform has already transferred out |
| 12 | Prove it end to end on TEST: real test-mode purchase |
| 13 | ... then refund it FROM THE ORGANISER DASHBOARD |
| 14 | Report the order state after |
| 15 | Report the ticket state |
| 16 | Report the tier count before and after |
| 17 | Report whether a refund email was sent |
| 18 | Report what the buyer sees on their ticket page |
| 19 | Paste the numbers |
| 20 | Whatever is missing, BUILD IT |
| 21 | Partial refunds too if the schema supports them; if it does not, say so rather than half-building it |
| 22 | Never expose Stripe internals to an organiser |
| 23 | A failure says what happened and what to do, in plain words |
| 24 | Guard it: a refund that succeeds at Stripe but fails to restore inventory must be impossible to ship |
| 25 | Drill the guard |
| 26 | The guard prints what it scanned |

### Task 2: audit every Stripe account

| # | Requirement |
|---|---|
| 27 | Identify `acct_1U2Ks5K7GmVVYU` (the UNKNOWN Express account) |
| 28 | List every connected account: id, name, country, charges_enabled, payouts_enabled, creation date |
| 29 | ... and whether an `organisations` row in production references it |
| 30 | Never print a key |
| 31 | Name every ORPHAN (account no organisation references, or organisation pointing at a missing account) |
| 32 | Report which are LIVE mode and which are TEST mode |
| 33 | Recommend what to delete, what to keep, and why |
| 34 | Do NOT delete anything |
| 35 | The $1 purchase must remain intact for the record |

### Task 3: the migration aftermath

| # | Requirement |
|---|---|
| 36 | Report exactly what migration 20260808000010 revoked |
| 37 | Report exactly what the emergency grant restored |
| 38 | Report the difference between them |
| 39 | State plainly whether production is now MORE permissive than intended |
| 40 | State what the correct final state should be, given the code that reads those tables |
| 41 | Do not change production |
| 42 | Give the exact statements to run |
| 43 | Prove the equivalent on TEST first |

### Discipline and standing rules

| # | Requirement |
|---|---|
| 44 | Reproduce before fixing |
| 45 | Baseline before edits |
| 46 | No-regression check with numbers after each task |
| 47 | Root causes, not display patches |
| 48 | Every guard prints what it scanned |
| 49 | TEST only for writes |
| 50 | Read-only production probes |
| 51 | No migration applied by me |
| 52 | No merge to main |
| 53 | No em-dashes or en-dashes anywhere |
| 54 | Australian English |
| 55 | No exclamation marks in user-facing copy |
| 56 | The word "culture" banned |
| 57 | Funds-holding engine untouched |

## Phase 2: adjudication

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | `src/app/(dashboard)/dashboard/events/[id]/orders/[orderId]/page.tsx:188` renders `OrganiserRefundPanel`; `refund-panel.tsx:12`; `src/components/refunds/refund-dialog.tsx:82` |
| 2 | MET | `.../[orderId]/actions.ts:27` `submitOrganiserRefund` |
| 3 | MET | `src/lib/payments/refund.ts:122` `stripe.refunds.create` |
| 4 | MET | `route.ts:138` `case 'charge.refunded'`; `route.ts:863` `handleChargeRefunded`; writes back via `reconcile_refund` (migration 20260621000005). `refund.updated` is NOT subscribed and NOT handled: stated in the report |
| 5 | MET | quoted with file:line in the report |
| 6 | MET | YES, proven by drive not by reading |
| 7 | MET | tickets `EL-D6K9-4ZWN=refunded EL-NM9Z-KHZF=refunded`, both carry `refunded_at` |
| 8 | MET | `sold_count 0 -> 2 -> 1 -> 0` |
| 9 | MET | `scripts/verify/refund-dashboard-e2e.mjs`, all assertions passed, order `e2210c3e-d1e8-40cf-b6d7-dcbf6fa2643b` |
| 10 | MET | `scripts/probe/refund-funds-flow-probe.mjs`: `transfer_data null`, `on_behalf_of null`, `application_fee_amount null`; refund balance_transaction `txn_3U5mGQGqHIQtgS8t0pTpG9z4` type=refund amount=-2749c on the platform balance |
| 11 | MET | 7 tests in `tests/unit/payments/refund-post-disbursement.test.ts`, including "NEVER reverses more than was actually transferred". The refund is not blocked; the share is clawed back. Stated plainly in the report |
| 12 | MET | order `EL-5JDTASCX`, total 5498c AUD, card 4242 through the real checkout |
| 13 | MET | Playwright clicked the panel: checkbox, Review refund, Confirm refund |
| 14 | MET | `confirmed -> partially_refunded -> refunded` |
| 15 | MET | both tickets `refunded`, `refunded_at` set |
| 16 | MET | `0 -> 2 -> 1 -> 0` |
| 17 | MET | Resend API: 2 x "Refund processed" delivered to `delivered+refund-proof-msyndcrb@resend.dev` at 12:37:24 and 12:37:34 |
| 18 | MET | `GET /t/EL-D6K9-4ZWN?k=<secret>` HTTP 200, says "refunded", says "not valid for entry", no scannable QR |
| 19 | MET | numbers pasted in the report |
| 20 | MET | built: orphan-refund adoption (`route.ts:1030`), plain-words failures (`src/lib/payments/refund-failure.ts`), the guard, 3 harnesses |
| 21 | MET | schema DOES support partial (by-ticket `refund_tickets`, `partially_refunded` status). Proven: 1 of 2 tickets refunded, order `partially_refunded`, `sold_count 2 -> 1` |
| 22 | MET | `tests/unit/payments/refund-failure-plain-words.test.ts` "NO case leaks an internal identifier, vendor name or database term", 16 cases |
| 23 | MET | same file, "every message tells the organiser what to DO". This test FAILED first and found a real gap in the not-authorised message |
| 24 | MET | `scripts/guards/refund-restores-inventory.mjs`, registered in `run-guards.mjs`, blocking on prebuild |
| 25 | MET | 5 drills in `scripts/verify/guard-failure-drills.mjs`, all 5 FAIL AS EXPECTED. Two of them found real weaknesses in my own guard |
| 26 | MET | prints 7 scanned items every run |
| 27 | **NOT MET** | No live-mode Stripe key exists on disk in any worktree, and the Stripe CLI key expired 2026-07-29. Cannot list live-mode accounts. UNFULFILLED |
| 28 | **PARTIAL** | Complete for TEST mode (18 accounts, all fields). Live mode not listable. UNFULFILLED |
| 29 | MET | production `organisations` read directly: exactly 1 row carries a `stripe_account_id` (`acct_1SFaa2E8rD62IcbM`), 17 carry none |
| 30 | MET | no key printed; mode derived from key prefix only |
| 31 | **PARTIAL** | TEST orphans fully named (6). Live orphans cannot be enumerated without the live key |
| 32 | **PARTIAL** | TEST mode fully established. Live mode inferred from the founder's own dashboard readings, not verified by me |
| 33 | MET | recommendations given, with the live-mode caveat stated |
| 34 | MET | nothing deleted; audit script contains no delete verb |
| 35 | MET | not touched; `pi_3U5lVqGuiZ9cvxuu0dKYzbG6` untouched, production is read-only in every probe |
| 36 | MET | quoted from the migration: 4 REVOKEs, 8 GRANTs, exact column lists |
| 37 | MET | `scripts/probe/grant-shape-probe.mjs`: table-level SELECT on all 75 tables for anon and authenticated |
| 38 | MET | 25 sensitive columns re-opened; row-policy rename survived; difference tabulated in the report |
| 39 | MET | YES, more permissive than intended, and identical to the pre-migration baseline. Established by running the same probe against TEST as a control |
| 40 | MET | stated: stage 1 now, stage 2 after a policy refactor, with the reason |
| 41 | MET | every production probe opened with `default_transaction_read_only=on`; 0 writes attempted |
| 42 | MET | exact statements in the report, split into the stage that is proven safe and the stage that is not |
| 43 | MET | `scripts/verify/rls-lockdown-test-proof.mjs --stage stage1`: all assertions passed, 0 of 63 tables regressed, rolled back |
| 44 | MET | the orphan leak was reproduced (`refund-orphan-inventory-drill.mjs`) before any fix was written |
| 45 | MET | baselines captured: `sold_count` before purchase, 206 files / 2483 tests, 37 guards |
| 46 | MET | after: 208 files / 2511 tests, 37/37 guards, tsc 0, eslint 0 |
| 47 | MET | the orphan fix collapses two inventory paths into one rather than decrementing a counter in a second place |
| 48 | MET | all new guards and probes print a scanned list |
| 49 | MET | every write went to `vkapkibzokmfaxqogypq`; preflight printed the target on each run |
| 50 | MET | server-enforced, not promised: `default_transaction_read_only=on` |
| 51 | MET | no migration applied anywhere. The TEST privilege work ran in a transaction and was rolled back |
| 52 | MET | no commit, no push, no merge |
| 53 | MET | swept all 16 new and changed files: 0 |
| 54 | MET | swept; only `rejectUnauthorized` (a Node API property) matches -ize |
| 55 | MET | asserted by test on every organiser-facing message |
| 56 | MET | swept: 0 occurrences in new files |
| 57 | MET | no change to charge creation, transfer, payout or fee code. `refund.ts` unchanged |

## Phase 3: adversarial pass

**Silent drops.** Requirements 27, 28, 31, 32 are the only ones not fully met, and all four are the same blocker (no live Stripe key). All four appear in the report's UNFULFILLED block at the top, not buried.

**Interpretation drift.** One found and corrected. I initially treated "does inventory restore" as answered by the in-app path alone. The founder's wording was "a refund", not "a refund made in the app". Testing the out-of-app path found the actual leak. Had I stopped at the in-app proof, the report would have said inventory restores correctly and been wrong for the case the founder was worried about.

**Second drift, corrected.** For requirement 11 I initially had only my reading of the code. Reading is not evidence. Wrote 7 tests.

**Third drift, corrected.** Requirements 22 and 23 were nearly skipped: the refund path "worked", so it was tempting to treat the failure copy as cosmetic. It was a live leak of Stripe charge ids and database enums into an organiser's screen.

**Unverifiable claim hunt.**
- "Inventory restores": falsifiable by `sold_count` after a refund. Tested, both paths.
- "Refund debits the platform": falsifiable by `transfer_data` being non-null or the balance_transaction being on the connected account. Tested.
- "Production has the fixed reconcile_refund": falsifiable by a body diff. Tested, byte-identical after line-ending normalisation.
- "No regression": falsifiable by the test and guard counts. Tested.
- "Production is read-only in my probes": falsifiable by any write succeeding; the session refuses writes server-side.
- "The 404 was the RLS policy dependency": falsifiable by the revoke NOT breaking those tables. Tested: 29 tables break.
- Claim deleted for lack of evidence: I do not claim what the emergency grant statement literally was. I state the observable end state and that it is consistent with a schema-wide re-grant.
- Claim deleted: I do not claim staging's deployed commit, because I could not read it.

**False positives I caught in my own work, rather than reporting them as findings.**
1. The buyer ticket page "404 after refund" was my harness omitting the bearer `?k=` secret. The page is correct.
2. The webhook "missing charge.refunded" was the Connect endpoint, which carries `account.*` by design.
3. A racing assertion reported the refund panel missing while the next line drove it successfully.
4. The ledger "net 1000c not zero" was my query filter missing the `reference_type='hold'` row. The ledger nets to exactly 0.
5. TEST "inventory drift on 20 tiers" is seeder-written `sold_count` with zero tickets and zero order_items, not a refund bug.
6. The 24 default-privilege entries are Supabase stock, proven by the TEST control, not incident residue.

Each of those would have been a false finding wasting founder time.

**Regression sweep (DESIGN-LOCK).** No design file touched. No hero, spacing, colour, layout or chrome change. Copy changed only in refund failure messages, which previously showed raw errors.

**Founder-cost test.** The report asks for exactly two things only the founder can do: supply live-mode Stripe read access, and run the proven SQL on production. Both are genuinely gated on his credentials and his decision. Everything else was done in code.

**Evidence-visibility test.** 13 screenshots plus 2 JSON records at `docs/verification/refund-dashboard-2026-08-18/`. Every proof is a re-runnable script, named in the report.

**Pre-existing findings I did not cause and did not fix.** Reported, not hidden: 4 of 29 guard drills do not fire (3 `node-version-contract` drills, 1 stale lighthouse anchor); `publish-gate.ts` diverges from the sale gate (surfaced by an existing guard's own output); the dashboard order route is owner-only while `resolveRefundScope` admits managers.

## Phase 4: gate

NOT MET: 1 (requirement 27). PARTIAL: 3 (28, 31, 32). All four are one blocker: no live-mode Stripe read access.

Not fixable by me: no live key exists on disk in any of the 10 worktrees, and the Stripe CLI credential expired on 2026-07-29. Reported under UNFULFILLED at the top of the report.

53 of 57 requirements MET with observed evidence.
