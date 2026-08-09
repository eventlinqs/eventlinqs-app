# Roast ledger: the connect lockout brief

Branch `fix/security-hardening`. Written 2026-08-09, before adjudication.

The ledger is decomposed from the founder's brief verbatim, plus the standing rules
that apply whether or not a brief restates them.

## The requirement ledger

### From the numbered build order

| # | Requirement (verbatim intent) |
|---|---|
| 1 | THE PAYOUTS PAGE CONTROL. A Refresh Stripe status control the organiser can press, which calls the reconcile and writes the truth |
| 2 | Acceptance test: an organiser stranded exactly as the founder was must recover entirely in the browser, with no founder and no SQL |
| 3 | ITEM 4. Establish what `maybeSingle` actually does in `resolveOrganiserScope()` |
| 4 | one user creates a second organisation and connects a DIFFERENT Stripe account to it |
| 5 | both organisations sell independently, payouts landing in their own bank accounts |
| 6 | switching between organisations never leaks one organisation's payout state onto another |
| 7 | disconnecting one organisation's account leaves the other untouched |
| 8 | an organisation reconnected to a DIFFERENT account keeps its event, order and payout history intact and correctly attributed |
| 9 | nothing anywhere is keyed on the user's email in a way that constrains any of it |
| 10 | prove each of 4 to 9 in a real browser |
| 11 | Where a fix needs a migration, write it and hand over the command with success criteria. Never apply one |
| 12 | THE REMAINING TWO RECONCILE PATHS: automatically on return from Stripe onboarding |
| 13 | ...and on a schedule |
| 14 | ITEM 6, THE DIVERGENCE GUARD: fails when the platform's payout columns disagree with Stripe for any connected organisation |
| 15 | The guard is scheduled |
| 16 | The guard reports rather than silently correcting, so a systemic divergence is visible |
| 17 | THE BROWSER PROOF. Reproduce the stranded state on TEST deliberately |
| 18 | ...then prove recovery at 390 and 1440 with screenshots |
| 19 | TWO ROAST ROUNDS, hostile about any remaining path by which an organiser could get stranded |
| 20 | ...and specifically about whether a SECOND organisation can get stranded in a way the first cannot |

### From the rulings and conduct block

| # | Requirement |
|---|---|
| 21 | Record `on_hold` as a founder-reviewed deferral with the reasoning, not an open question |
| 22 | Record the `'unset'` over nullable reasoning as accepted |
| 23 | Never trust `npx tsc` in this repo; invoke tsc and vitest from `node_modules` directly |
| 24 | Never trust a piped exit code |
| 25 | Give the exact Stripe dashboard steps to verify the webhook endpoint is a CONNECT endpoint |
| 26 | Law 7: every specification from a fetched primary source, cited, nothing from memory, UNSOURCED where none exists |
| 27 | Never regress a working surface; if a change would alter something that currently works, stop and report |
| 28 | Report exactly what changed on the payment path |
| 29 | Prove no charge, payout, fee or refund logic moved |
| 30 | Australian English |
| 31 | No em dashes or en dashes |
| 32 | "community" never the banned alternative |
| 33 | No claim without pasted proof |
| 34 | Never write to the Production Supabase database |
| 35 | No commit carries a Co-Authored-By trailer naming Claude or an AI |
| 36 | Source files written with the editor, never a shell heredoc |
| 37 | Every item to one hundred percent, or a precise handover and a clean stop |

### Standing rules not restated in the brief

| # | Requirement |
|---|---|
| 38 | Definition of Done: nothing ships partial, zero placeholders, works on real data |
| 39 | Law 5: zero dead links and no dead-end tiles on any surface touched |
| 40 | Law 0: state the governing laws before editing |
| 41 | Migrations: write the file only, founder applies with `supabase db push --linked` |
| 42 | Disk guard: check free space before any build or deploy step |

---

## Adjudication

Evidence paths are relative to the repository root. `EV` =
`docs/security/evidence/connect-lockout-2026-08-09/`.

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | `payouts/actions.ts:41` + `refresh-stripe-status.tsx`; rendered on both payouts states (`payouts/page.tsx:166,208`) |
| 2 | MET | `EV/browser-proof.json`: "the DATABASE moved: restricted -> active, with no SQL and no founder", payout_status=active. Screenshots before and after |
| 3 | MET | `EV/maybe-single-behaviour.txt`: 406 PGRST116 data null, for 26 rows, run against TEST |
| 4 | MET | `EV/connect-paths-proof.json`: third business created in the browser form; connect minted a NEW account distinct from both, stamped with its own organisation_id |
| 5 | MET at the transfer, PARTIAL at the charge | `EV/multi-org-money-proof.json`: two real transfers, two balances, two bank objects. No card checkout was run; by design the charge leg has no per-business destination. Stated in the delivery doc |
| 6 | MET | `EV/browser-proof.json` (URL, cookie, page content) + `EV/connect-paths-proof.json` (both client fetches carry org) |
| 7 | BLOCKED | `EV/multi-org-scenarios.json`: write refused 23514 until migration 20260809000001 is applied. Other business proven byte-for-byte unchanged by the failed attempt |
| 8 | MET | `EV/multi-org-scenarios.json`: events 1 -> 1 across an account swap; other business unaffected |
| 9 | MET | three businesses share one contact email; Stripe's Account object documents `email` as informational and states no uniqueness rule (docs.stripe.com/api/accounts/object, fetched 2026-08-09); the only `.eq('email')` reads in `src` are marketing consent |
| 10 | MET except 5 and 7 | see rows above |
| 11 | MET | migration written by the predecessor, NOT applied (proven: the constraint still refuses 'unset'). Command and four success criteria in the delivery doc |
| 12 | MET | `EV/connect-paths-proof.json`: restricted -> active by visiting the return route, and the redirect carries `org=` |
| 13 | MET | registered in `vercel.json`; exercised 401 / 400 / 200 with a real correction |
| 14 | MET | `src/lib/stripe/connect-divergence.ts`; live run found 33 blocking divergences across 42 organisations |
| 15 | MET | `vercel.json` crons entry |
| 16 | MET | `"wrote": false` on the live run; `connect-divergence.test.ts` counts update calls and requires zero |
| 17 | MET | `multi-org-fixture.mjs --strand`; the proof refuses to run unless the row is genuinely divergent |
| 18 | MET | four screenshots, 1440 and 390, before and after |
| 19 | MET | this ledger, two rounds |
| 20 | MET | publish gate verified to scope on the EVENT's organisation at all three call sites; cron and guard sweep all organisations; findings in the adversarial pass below |
| 21 | MET | recorded as a founder-reviewed deferral with reasoning in the delivery doc |
| 22 | MET | recorded as accepted with reasoning in the delivery doc |
| 23 | MET | every gate invoked as `./node_modules/.bin/...` |
| 24 | MET | exit codes captured directly; `tsc` additionally calibrated against a deliberate type error (exit 2) before trusting its exit 0 |
| 25 | MET | dashboard steps plus a programmatic `application`-field check, with real output, in the delivery doc |
| 26 | MET | Stripe connect verification, Stripe testing, Stripe Account object, Next 16.3.0 cookies doc, all cited with fetch dates |
| 27 | MET | regression sweep below |
| 28 | MET | delivery doc, "The payment path: what moved" |
| 29 | MET | `git diff --stat a787a26..HEAD -- src/lib/payments/` is empty |
| 30 | MET | US-spelling sweep clean except the pre-existing `color` data field in seat-maps, untouched by this work |
| 31 | MET | zero across every changed and added file |
| 32 | MET | zero occurrences of the banned word |
| 33 | MET | every claim in the delivery doc carries a path, a command output, or a screenshot |
| 34 | MET | every script refuses the production project id by constant; all writes went to `vkapkibzokmfaxqogypq` |
| 35 | MET | `no-ai-authorship` guard PASS; commit message written without a trailer |
| 36 | MET | every source file written with the editor |
| 37 | MET | one BLOCKED item, declared at the top of the delivery doc rather than buried |
| 38 | MET | no placeholders; every surface works on real TEST data |
| 39 | MET | switcher targets are real dashboard routes; the create page's back link resolves |
| 40 | MET | governing laws stated before the first edit |
| 41 | MET | migration written, not applied |
| 42 | MET | 4.0 GB free recorded before the build, and reported as below the 5 GB practical floor |

## Adversarial pass

**Silent drops.** None. Every one of the 42 rows appears in the delivery doc or is
adjudicated above. The two the report could most easily have buried, scenario 7 being
blocked and scenario 5 being partial at the charge leg, are both stated in the
delivery doc's own scenario table rather than only here.

**Interpretation drift.** One found and corrected mid-task. "Both organisations sell
independently, payouts landing in their own bank accounts" was initially going to be
answered with a code reading of the charge path. That is the easier task and it is
the wrong one: in a funds-holding model the charge has no per-business destination,
so a code reading of the charge would have proven nothing while looking thorough. It
was replaced with real transfers at the point the destination is actually selected.

**Match versus surpass.** Not applicable, no competitor capability in this brief.

**Unverifiable claim hunt.**
- "recovers with no founder and no SQL": falsified by the database not moving. Tested, it moved.
- "no state leaks between businesses": falsified by a request going out without `org` or with the wrong one. Tested by watching both client fetches.
- "the guard never writes": falsified by an update call. Tested by counting them in the unit test and by `"wrote": false` on the live run.
- "no money logic moved": falsified by a non-empty diff under `src/lib/payments/`. Tested, empty.
- "the single-business surface is unchanged": falsified by the switcher rendering or a URL gaining a parameter at count 1. Tested in `organisation-scope.test.ts`.

**Generic test.** Not applicable, no new marketing surface. The one new piece of
chrome, the switcher, uses only existing tokens and renders only above one business.

**AI-tell sweep.** Em dashes 0, en dashes 0, exclamation marks in user-facing copy 0,
banned word 0, tell lexicon 0.

**Regression sweep.** Every new switcher returns null below two organisations, and
`withOrganisation()` appends nothing below two, so a single-business organiser's
chrome and URLs are byte-identical to before. Both properties are asserted in tests
rather than claimed. The one deliberate copy change is the create-a-business page
heading, which had to change because "Create Your Organisation" is wrong on a fifth
business. The switcher moved from links to a form because Next 16.3.0 permits a
cookie write only in a Server Function or Route Handler; the classes are unchanged.

**Founder-cost test.** The report asks for two things: apply a migration (explicitly
forbidden to me) and verify a Stripe endpoint (creating a webhook endpoint on the
live Stripe account is an outward-facing change on the founder's payment
infrastructure). Both are correctly the founder's. The second is softened with a
one-line command that answers it without reading the UI.

**Evidence-visibility test.** Four screenshots, five JSON result files, two captured
command outputs, all at named paths under `EV/`.

## Second-organisation stranding: the specific hunt the brief demanded

| Path | Could a SECOND business be stranded where the first could not? |
|---|---|
| publish gate | No. All three call sites pass the EVENT's `organisation_id`, never the caller's default business |
| reconcile cron | No. Selects every organisation with an account, no owner filter, no limit |
| divergence guard | No. Scans every organisation |
| payouts control | No. Takes an explicit organisation and verifies ownership |
| onboarding return | No, and this was fixed here: three failure branches used to drop `org`, landing a returning organiser on a different business and showing them a healthy story about the wrong company |
| payout history table | This WAS the gap. Fixed and proven |
| Stripe dashboard link | This WAS the gap, and the worst one: a login session into the wrong company's Stripe. Fixed and proven |
| noticing at all | The switcher shows a per-business status dot with an sr-only label, so a healthy first business no longer hides an unhealthy second |
| disconnected business | Skipped by the reconcile cron by design; caught and reported by the divergence guard's half-cleared check |
