# Roast ledger: the Founding Organiser fee waiver becomes real (2026-07-27)

Ledger written before adjudication, per the skill.

Governing laws: Law 0, Definition of Done, Fee system (one source), the locked
fee structure, Verification and gates (migrations written not applied), Copy and
banned content.

Founder decision LOCKED this brief: the waiver is a DATE WINDOW
(`founding_fee_free_until`), not a months counter.

## Requirement ledger

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Read brief-roast FIRST and obey it | MET | Read as the first action; ledger written before any adjudication |
| 2 | Report opens with the gate block or UNFULFILLED | MET | The report opens with UNFULFILLED |
| 3 | J1: migration adding founding_fee_free_until to organisations | MET | supabase/migrations/20260727000002_founding_fee_free_window.sql adds founding_fee_free_until TIMESTAMPTZ with a column comment and a partial index |
| 4 | J1: backfill from existing is_founding / founding_bonus_months so nobody loses the offer | MET | Backfill: created_at + 6 months + founding_bonus_months months, only WHERE founding_fee_free_until IS NULL AND (is_founding OR bonus > 0). is_founding and founding_bonus_months are LEFT IN PLACE as the historical record |
| 5 | J1: do NOT apply it | MET | Not applied. Every database call this session was a GET; no migration was run against either database |
| 6 | J1: report whether it is destructive | MET | NOT destructive: one nullable column added, no column dropped or retyped, the backfill only ever grants time and only where the window is null, superseded pricing rows are stamped rather than deleted, and no order or payment row is read or written |
| 7 | J2: platform fee resolves to ZERO when founding_fee_free_until is in the future | MET | applyFoundingWaiver() zeroes platformFeePercent and platformFeeFixedCents when the window is open (src/lib/payments/founding-waiver.ts) |
| 8 | J2: processing fee unchanged | MET | The same function leaves processingFeePercent and processingFeeFixedCents untouched, asserted at 1 and 4 tickets |
| 9 | J2: holds at DISPLAY | MET | event-fee-config.ts getEventFeeRates applies the waiver when an organisationId is in scope |
| 10 | J2: holds at CHECKOUT | MET | payment-calculator.ts resolves the waiver before computeFeeLineCents, so the checkout charge carries it |
| 11 | J2: holds at CAPTURE | MET | Same code path: capture uses the same PaymentCalculator result |
| 12 | J2: holds at PAYOUT | MET | Payout inherits: application-fee.ts composeApplicationFee reads the fee amounts STORED on the order rather than re-resolving, so a waived charge is a waived payout with no second lookup |
| 13 | J2: find every fee computation point and PROVE the list is complete | MET | Enumerated by grepping every caller of getPlatformFeePercentage/getPlatformFeeFixedCents (1 site) and of computeFeeLineCents/computeAllInTotalCents (3 sites), then tracing the two client components to their server suppliers. Full table in report section C, including the marketing and legal surfaces that correctly do NOT apply a waiver because they pass no organisation |
| 14 | J3: a confirmed referral extends the date by 3 months FROM ITS CURRENT VALUE | MET | extendWaiver() bases the extension on the current expiry when it is in the future, and on today when it has lapsed. Asserted: 27 Jan 2027 plus 3 months gives 27 Apr 2027, not 27 Oct 2026 |
| 15 | J3: referrals stack correctly | MET | Two referrals stack to six months: 2027-01-27, 2027-04-27, 2027-07-27 |
| 16 | J3: audit-log every extension with who, when and the new date | MET | recordAnonAuditEvent with founding.waiver.extended, carrying organisation, reason, referred organisation, invite code, months added, previous expiry and new expiry. A failed update logs founding.waiver.extension_failed with the error |
| 17 | J4: enforce the fifty cap in CODE, not copy | MET | Two layers: acceptFoundingInvite counts holders and refuses past FOUNDING_WAIVER_CAP, and the database trigger trg_founding_waiver_cap raises check_violation so a direct SQL grant cannot bypass it |
| 18 | J4: the fifty-first organiser cannot receive the waiver | MET | The fifty-first is refused the WAIVER while keeping the founding SPOT the RPC already allocated, and the refusal is audit-logged as founding.waiver.cap_reached |
| 19 | J4: report the current count of organisations holding it | MET | ZERO on both databases. Production 16 organisations, 0 with is_founding and 0 with bonus months. TEST 42 organisations, same. Read live, read only |
| 20 | J5: test, $20 inside the window is exactly $20.50 all in, organiser keeps $20.00 | MET | pricing-anchors.test.ts: platform 0, processing 50c, all-in 2050c, organiser keeps 2000c |
| 21 | J5: test, the same ticket one day after expiry is $22.19 | MET | Same file: a window that expired yesterday gives platform 169c, processing 50c, all-in 2219c |
| 22 | J5: cover pass-on and absorb modes | MET | Pass-on and absorb both covered inside and outside the window, including that absorb inside the window leaves the organiser 1950c and outside leaves 1781c |
| 23 | J6: invites dashboard shows the real expiry date and real waiver status | MET | The tile now reads 'Platform fee waived until <date>' with the real expiry, or 'Ended <date>' or 'Not active', with a hint stating the processing fee still applies |
| 24 | J6: it reads from founding_fee_free_until | MET | page.tsx selects founding_fee_free_until and passes it plus waiverActive computed by isWaiverActive(), the same helper the charge uses |
| 25 | J7: a constraint or trigger making more than one open row per rule scope impossible | MET | Partial unique index uq_pricing_rules_one_open_per_scope on (rule_type, country_code, currency, org, event) WHERE effective_until IS NULL, with the existing duplicates closed first and a post-condition that aborts the migration if any scope still has more than one open row |
| 26 | J7: prove it rejects a bad insert | NOT MET (BLOCKED) | Could not be proven against a live database: no TEST database password exists in the repo (only SUPABASE_DB_PASSWORD_SYDNEY, which is PRODUCTION and is read-only by instruction), no postgres client is installed, and applying the migration is the founder's step. The migration carries its own self-proving post-condition. The founder verification command is in report section D |
| 27 | J8: update docs/PRICING.md with the waiver mechanism | MET | docs/PRICING.md section 4 rewritten as the date window with the applied-at table |
| 28 | J8: the date-window rule | MET | Section 4: initial 6 months, plus 3 per referral, stacking from the current expiry, UTC month arithmetic |
| 29 | J8: the cap | MET | Section 4: the cap with both enforcement layers named |
| 30 | J8: the worked $20.50 example | MET | Section 3 already carries the worked 20.50 example; section 4 now explains the mechanism behind it |
| 31 | Report A: each job with observed evidence | MET | Report section A |
| 32 | Report B: one line, WOULD A FOUNDING ORGANISER BE CHARGED CORRECTLY, YES or NO | MET | Report section B: YES, once the migration is applied |
| 33 | Report C: every place a fee is computed, each confirmed to honour the waiver | MET | Report section C |
| 34 | Report D: every founder step, exhaustive | MET | Report section D |
| 35 | Report E: current count of organisations that would hold the waiver | MET | Report section E: zero on both databases |
| 36 | NEVER write to Production, read only | MET | Every Production call was a GET. No INSERT, UPDATE, DELETE or migration was run against Production |
| 37 | Do not modify the funds-holding engine's money MOVEMENT | MET | No money-movement code touched. application-fee.ts, venue-transfer.ts and the payout math are unmodified; only fee RESOLUTION changed |
| 38 | Do not touch seating, guidance or /guides | MET | No file under src/lib/seating, src/components/seating, src/app/guides, src/lib/guides or src/components/guidance was touched |
| 39 | Australian English, no em-dashes, no en-dashes | MET | Zero em-dashes and zero en-dashes, enforced across all of src by the copy gate which passes clean |
| 40 | No competitor named in public copy | MET | No competitor appears in any user-facing string; the copy gate asserts this |
| 41 | No fabrication: NOT VERIFIED where unprovable | MET | Row 26 is reported NOT MET rather than claimed. The DST bug found mid-task is reported rather than quietly fixed |
| 42 | Gate: typecheck | MET | npx tsc --noEmit exit 0 |
| 43 | Gate: lint | MET | npm run lint exit 0, 0 errors, 47 warnings |
| 44 | Gate: tests | MET | npx vitest run: 114 files, 1057 tests passed |
| 45 | Gate: production build | MET | npm run build exit 0, with the pricing lock guard reporting ok |
| 46 | Gate: copy gate | MET | node scripts/copy-tell-gate.mjs clean |
| 47 | Commit each job separately | MET | Commits split per job |
| 48 | Push and report the remote sha | MET | Pushed; remote sha in the report |

Adjudication follows when the work completes.

### Gate

48 rows. MET 47. NOT MET 1 (row 26, the constraint proof, BLOCKED).

Adversarial pass:

- **Silent drops.** None. Every job and report section appears.
- **Interpretation drift.** One place I did LESS than a literal reading would
  allow: I did not apply the migration to TEST to prove the constraint, because
  the brief says migrations are the founder's to apply. That costs row 26, and
  saying so is better than applying a migration I was told not to apply and
  calling it proof.
- **The bug found mid-task.** Three anchor tests failed on the first run, off by
  one day. The cause was real: `setMonth` operates in local time while the value
  is stored and compared as UTC, so a window granted in July (UTC+10) and
  expiring in January (UTC+11) lost a day. The CODE was fixed, not the test.
  A fee waiver that quietly shortens across a daylight-saving boundary is a
  defect, and it would have shipped invisibly.
- **Unverifiable claim hunt.** "The waiver holds at every fee point" is falsified
  by a call site that bypasses it: enumerated by grep over both the resolver
  helpers and fee-math, four call sites found, each accounted for in section C.
  "Payout inherits" is falsified if the payout re-resolved the rate: it does not,
  it reads the stored order amounts. "Zero organisations hold it" is falsified by
  a non-zero count: read live from both databases. "Referrals stack" is falsified
  by an overwrite: asserted to the day.
- **The generic test.** The date window, the stacking rule and the UTC fix are
  specific to this platform's offer and this codebase.
- **AI-tell sweep.** Zero em-dashes, zero en-dashes, zero exclamation marks in
  copy, zero banned words, zero tell-lexicon phrases; the copy gate passes clean
  over all of src.
- **Regression sweep.** Two retired props removed from the invites client
  (bonusMonths, bonusPerReferral) because the tile they fed no longer exists.
  `founding_bonus_months` itself is deliberately KEPT in the database and still
  incremented, as the historical record.
- **Founder-cost test.** Two founder steps, both genuinely founder-only.
- **Evidence-visibility test.** The migration, the waiver module, the tests and
  this ledger are readable at named paths.

Result: **UNFULFILLED**, on the constraint proof being blocked. Reported at the
top.
