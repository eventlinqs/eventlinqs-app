# Roast ledger: the refund system build, 20 August 2026

Written BEFORE adjudicating, from the brief verbatim, so the ledger cannot be
shaped to fit what happened to get done.

## Task 0, the tree

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Report git status and HEAD | MET | Reported: 5 modified, 2 untracked, HEAD 189c248c on integration/launch |
| 2 | Finish any half-written file first, and name what was found | MET | Named: payouts limiter moved but its test still asserted the old ordering; `payouts-read-wiring.test.ts` cited by the parity script never existed; `before.json` captured with no `after.json`. All three finished |
| 3 | Baseline npm test with file, test, fail and skip counts | MET | 211 files, 2528 tests, 1 failed, 0 skipped |
| 4 | Full guard runner, verdict per guard | MET | 38 guards, all PASS, exit 0 |
| 5 | npm run build against TEST, unpiped, raw $LASTEXITCODE | MET | `RAW_LASTEXITCODE=0`, compiled 56s, 134 pages |
| 6 | If the tree is not green now, stop and tell me | MET | It was not green. Reported, cause named as the half-applied work, then fixed |

## Task 1, the rate limits

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 7 | Re-key payouts-read to the organiser, limiter after resolveOrganiserScope on three routes | MET | `applyRateLimit('payouts-read', request, scope.org.organisationId)` on list, summary, refunds; audit section 3c reads ORG/ORG |
| 8 | Prove no behaviour change beyond the key | MET | `payouts-read-parity.mjs --compare`: 15 of 15 IDENTICAL, statuses 200/401/403/404 |
| 9 | waitlist-join FAIL CLOSED | MET | `failClosed: true`; audit fail-open list drops from 14 to 13 and no longer names it. Same-domain claim verified in code, both reach `sendEmail` via the single-source sender |
| 10 | ADMIN_TOTP_ENC_KEY into .env.test, never mistakable for production | MET | Readable marker, round-tripped through the real `encryptString`/`decryptString`, negative control throws without it |
| 11 | Other three stay fail-open, record why | MET | Each policy now records its own bound (session, secret, ownership scope) |

## Competitor verification, Law 7

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 12 | Verify all three against live help centres before building, cite | MET | Eventbrite policy page, Humanitix self-service and funds pages, Ticketmaster refund page, all fetched and quoted |
| 13 | Build to what is true today, not to the brief | MET | Confirmed the brief on all three; Humanitix bank-transfer claim sourced verbatim |

## Build 1, the per-event policy

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 14 | Organiser sets at creation, editable after | MET | Four fields through `CreateEventInput`, both payloads, and the event form editor |
| 15 | At minimum N days before, or no refunds | MET | `refund_policy_type` CHECK ('days_before','no_refunds') plus days 0..365 |
| 16 | Shown on the event page BEFORE purchase | PARTIAL | Code written, typechecks, builds. NOT seen rendering on a deployed page |
| 17 | Shown in the confirmation email | PARTIAL | Wired into both HTML and text builders. NOT observed in a delivered email |
| 18 | Enforce the one-way rule after publishing | MET | DB trigger; drill refuses a real tightening on a real published event |
| 19 | Refuse tightening in the product with a clear explanation | MET | `explainTightening` in updateEvent before the write |
| 20 | Pin it with a test | MET | 10-case table in `policy.test.ts`, same 10 through SQL in the drill |
| 21 | Free events need no policy | MET | `describeRefundPolicy(.., isFree)` and the `free_order` refusal |
| 22 | Cancelled events always refunded regardless of policy | MET | Checked before the policy; test proves the ordering |

## Build 2, the buyer request path

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 23 | On the buyer's TICKET PAGE and in the confirmation email | PARTIAL | Built on the order confirmation page and linked from the email. `/tickets` has no entry point |
| 24 | Captures specific tickets and an optional message | MET | `refund_request_tickets`, `buyer_message` |
| 25 | Organiser gets an email AND a dashboard item | PARTIAL | Both built. The email send is NOT observed delivering |
| 26 | Approve or decline with a reason and a note the buyer receives | MET | Note required, minimum 10 chars, server and client |
| 27 | Show the buyer the state honestly at every point | MET | Five states rendered distinctly |
| 28 | No silent failures | MET | Every refusal returns a plain sentence |

## Build 3, auto-approval

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 29 | Inside policy and funds available, approve and refund automatically | MET | Drill: `status=approved auto=true`, real Stripe refund succeeded |
| 30 | Verify the funds-holding model in our code before claiming it | MET | `create-platform-charge.ts` header, `payout_schedule` default post_event_only |
| 31 | Same proven path, never a second refund path | MET | `one-refund-path` guard, drilled |

## Build 4, the unwind

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 32 | Enumerate every artefact and prove each | PARTIAL | 11 proven. Squad, waitlist, attendee list and capacity figures NOT proven |
| 33 | Ticket voided and unscannable | MET | Drill row |
| 34 | Inventory restored on the tier | MET | Drill row |
| 35 | Seat released, free on the map, resellable | MET | Reproduced as FAIL, fixed, re-proven as OK |
| 36 | Squad or group membership updated | NOT MET | Never tested |
| 37 | Waitlist promotion triggered correctly | NOT MET | Never tested |
| 38 | Order state | MET | Drill row |
| 39 | Ledger netting to zero | MET | Drill row |
| 40 | Buyer's ticket page | NOT MET | Not driven |
| 41 | Organiser's attendee list | NOT MET | Not driven |
| 42 | Any capacity or reach figure that counted it | NOT MET | Not identified or checked |
| 43 | Prove seat maps with a real seated event on TEST, before and after | MET | `refund-seat-drill.mjs`, exit 1 before, exit 0 after |

## Build 5, the parity audit

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 44 | Check every money surface against four competitors from their own docs | PARTIAL | Six pages fetched; not all 17 rows sourced per competitor |
| 45 | Table with a verdict per row | PARTIAL | Compiled in the report; some rows NOT CHECKED |
| 46 | Cover at minimum the 17 named rows | PARTIAL | All 17 appear; several carry NOT CHECKED rather than a verdict |
| 47 | For every GAP state effort and whether it blocks launch | MET | Stated per gap |
| 48 | Build nothing beyond 1 to 4 without telling me | MET | Nothing built beyond; squad-expire defect REPORTED not fixed |
| 49 | A row not checked is NOT CHECKED, never assumed PARITY | MET | Marked as such |

## How it gets built

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 50 | Every claim proven by driving the real path over HTTP against TEST | PARTIAL | Parity capture is real HTTP. The refund drills drive the service layer, the real RPCs and a REAL Stripe charge and refund, but the buyer request was NOT driven over HTTP through the server action |
| 51 | Any test measuring absence needs a negative control | MET | Controls throughout; the unwind probe refuses to conclude with nothing to inspect (exit 2) |
| 52 | Fail loudly in development, never quietly refuse in production | MET | `policyFromEvent` throws in development on an absent column |
| 53 | One source of truth, client and server consult the same function | MET | `src/lib/refunds/policy.ts` |
| 54 | Every refusal names its real cause | MET | Machine reason plus sentence from the same branch |
| 55 | Guards with drills: one-way rule, single refund path, full unwind on every trigger | PARTIAL | One-way and single-path drilled. "Full unwind on EVERY trigger" is checked structurally, not per trigger |
| 56 | Break each, paste raw failure and exit code, revert by forward edit, confirm green | MET | Three drills with exit codes and diffs proving identical revert |
| 57 | Every guard prints what it scanned | MET | Both print scan lines |
| 58 | No-regression after every build with the numbers | PARTIAL | Run at the end (213/2579) and at milestones, not after literally every build |
| 59 | Roast yourself before reporting | MET | This file |

## Ship and report

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 60 | Commit, push integration/launch with explicit refspec | MET | `189c248c..38c6e6b8` |
| 61 | Wait for READY and PROBE rather than trusting the status field | PARTIAL | Probed and caught a stale alias AND a build placeholder. Deployment still BUILDING at report time |
| 62 | Preview URL and SHA at the very top | MET | In the report |
| 63-67 | Report order: parity, builds, unwind, ledger, half-applied | MET | Followed |

## Standing rules

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 68 | Disk reclaim (mid-task directive) | MET | 10.34 to 12.91 GB, itemised |
| 69 | Australian English, no em or en dashes, community not the banned word | MET | Test asserts no dash and no exclamation in buyer-facing strings |
| 70 | TEST writes only | MET | Every script carries the preflight; applier carries three refusals |
| 71 | No merging to main | MET | Pushed to integration/launch only |
| 72 | Law 8 authorship | MET | 0 matches for AI attribution across both commits |

---

# Final adjudication, after going back to finish

The gate says finish what is within reach rather than report it unfulfilled.
Four rows moved after the first pass.

| # | Was | Now | What changed |
|---|---|---|---|
| 16 | PARTIAL | **MET** | Probed the deployed preview: the event page returns "Before you book", "Refund policy", "Refundable to 7 days before", "Refunds available up to", "refunded in full" |
| 36 | NOT MET | **MET** | Found the gap by adjudication, not by a failing test. Migration 20260820000003 releases the squad slot inside reconcile_refund. Drilled: with the previous function the drill reports SQUAD member paid, expected refunded, FAIL, exit 1; with this one, OK, exit 0 |
| 37 | NOT MET | **MET, and I was wrong** | The refund path already promotes the waitlist per refunded tier, and it runs AFTER reconcile_refund has decremented sold_count, so it never promotes into a tier its own counter still calls full. I had it down as a gap on an incomplete grep |
| 55 | PARTIAL | **MET** | "Full unwind on every trigger" is now structural: the squad release lives in reconcile_refund, so the organiser button, the admin console, automatic approval and an adopted orphan refund all get it. The guard requires it |

## Still not met, and why

| # | Requirement | Verdict | Why, and what would close it |
|---|---|---|---|
| 23 | Buyer request on the TICKET PAGE | **PARTIAL** | Built on the order confirmation page, which is where Eventbrite and Humanitix both put it, and linked from the confirmation email. `/tickets` and `/account/tickets` have no entry point. Closing it is a link from each ticket row to its order, about an hour |
| 25 | Organiser gets an email AND a dashboard item | **PARTIAL** | Both are built and the dashboard item is proven. The SEND is not observed delivering, because the drill drives the service directly and does not go through the server action that calls `sendRefundRequestedToOrganiser` |
| 40 | Buyer's ticket page reflects the refund | **NOT MET** | Not driven. The ticket row reads `tickets.status`, which the drill proves becomes `refunded`, but I did not load the page and look |
| 41 | Organiser's attendee list | **NOT MET** | Not driven |
| 42 | Any capacity or reach figure that counted it | **NOT MET** | Not identified. `sold_count` is proven; whether any dashboard or discovery figure caches a count independently was not established |
| 50 | Every claim driven over HTTP | **PARTIAL** | The parity capture and the deployed policy block are real HTTP. The refund drills drive the real RPCs, the real service and a REAL Stripe charge and refund, but the buyer request was not driven through the HTTP server action |
| 44-46 | Parity audit rows | **PARTIAL** | Six competitor pages fetched and quoted. Nine of seventeen rows carry a sourced verdict; eight are marked NOT CHECKED rather than assumed |
| 58 | No-regression after EVERY build | **PARTIAL** | Run at milestones and at the end (213 files, 2579 tests, 0 failed, 0 skipped), not after each individual build |

## Adversarial pass

**Silent drops.** None. Every row above appears in the report.

**Interpretation drift.** One, named: "on the buyer's ticket page" was built as "on the buyer's order page". That is where the competitors put it and it is where the email points, but it is not what the brief said, so it is PARTIAL and not MET.

**Match versus surpass.** Auto-approval is AHEAD of Humanitix on a specific, sourced capability: their help centre states that once an event is paid out they no longer hold the funds and the host must arrange a bank transfer. We are merchant of record and hold funds until a post-event transfer, verified in `create-platform-charge.ts`. LEVEL with Eventbrite, which also auto-approves when the balance covers it. Seat release on refund is AHEAD of all four in the sense that none of them document it; that is an absence of evidence, not proof they lack it, and it is recorded that way.

**Unverifiable claims.** "Every artefact unwinds" was the risky one. Falsified by naming the artefacts NOT checked (40, 41, 42) rather than claiming the set is complete.

**AI-tell sweep.** 0 em-dashes, 0 en-dashes, 0 exclamation marks in buyer-facing copy, asserted by a test over every generated string, not by eye.

**Regression sweep.** No design element changed that was not asked for. Two clock reads were pinned to the platform zone, which the existing guard required.

**Founder-cost test.** One item sends work back: migrations 20260820000001, 20260820000002 and 20260820000003 are applied to TEST only and need `supabase db push --linked`. That is the constitution's rule, not something I could do in code.
