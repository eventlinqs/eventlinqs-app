# M6 Phase 2 Closure Report

Date: 2026-05-01
Branch: feat/sprint1-phase1b-performance-and-visual

## Verdict

**All 4 items PASS.** Phase 2 is closed.

## Item-by-item outcome

| Item | Description                                                  | Verdict |
| ---- | ------------------------------------------------------------ | ------- |
| 1    | Lighthouse + axe on public Connect onboarding preview        | PASS    |
| 2    | Lighthouse + axe on authed dashboard (6 cells, 3 states x 2 viewports) | PASS    |
| 3    | Live Stripe Test mode E2E with human-gated KYC               | PASS (6/6) |
| 4    | docs/m6/m6-phase2-test-results.md updated, no Phase 2.5 framing | PASS    |

## Item 3 detail

Track A re-ran the live E2E with a US Stripe Express test account
(`acct_1TSG4KGSxBgLYjFv`) against test organiser
`cc0e7ba2-f173-41c9-8f15-57bcf0a19ab0`. All 6 assertions PASS.

| ID  | Assertion                                                     | Result |
| --- | ------------------------------------------------------------- | ------ |
| (a) | stripe-cli forwarded account.updated to local webhook         | PASS   |
| (b) | capabilities.charges_enabled true after KYC                   | PASS   |
| (c) | organisations.payout_tier === 'tier_1'                        | PASS   |
| (d) | tier_progression_log row inserted with reason=auto_promotion  | PASS   |
| (e) | paid event publish blocked when charges_disabled              | PASS   |
| (f) | paid event publish allowed when charges_enabled               | PASS   |

The (d) assertion that previously FAILed on the AU account passes
cleanly on the US account. The Stripe-side state at verify time was
charges=true, payouts=true, details=true, fullyOnboarded=true. The
webhook handler gate `fullyOnboarded && wasIncomplete` fired exactly
once and inserted row id `f4da8752-4df6-4d05-a675-183662611288` into
`tier_progression_log` with `reason='auto_promotion'`,
`from_tier='tier_1'`, `to_tier='tier_1'`, and metadata referencing the
Stripe webhook event id and account id.

Track B added a regression test that defends the auto_promotion path
without requiring a live Stripe round trip. Three test cases:

- positive: fully onboarded + previously incomplete + previous tier
  `tier_0` asserts the tier UPDATE to `tier_1` AND the log INSERT
- negative: payouts_enabled=false (other capabilities true) asserts
  NO log insert (the gate that caused the prior AU run to FAIL)
- idempotency: previously-onboarded redelivery asserts NO log insert
  on repeat events

All 3 cases pass in `npm test` (vitest 4.1.5).

## Phase 2.5 framing

Audited and removed. No `Phase 2.5`, `phase-2.5`, or `phase_2.5`
references remain in user-facing docs. The two grep hits in
`progress.log` are meta-confirmations that the framing was removed,
not actual framing.

## Artifacts

### E2E and audit outputs

- `docs/m6/audit/phase2/e2e-results.txt` (Track A verdict PASS, 6/6)
- `docs/m6/audit/phase2/progress.log` (full Phase 2 timeline)
- `docs/m6/audit/phase2/summary.json` (Item 1 preview Lighthouse + axe)
- `docs/m6/audit/phase2/summary-authed.json` (Item 2 dashboard, 6 cells)
- `docs/m6/audit/phase2/lighthouse-*.json` and `axe-*.json` (per-cell raw)
- `docs/m6/m6-phase2-test-results.md` (Item 4 narrative report)

### Track A artifacts (uncommitted)

- `scripts/m6-phase2-e2e-orchestrator.mts` (two-phase orchestrator)
- `scripts/m6-phase2-state-probe.mts` (pause/resume probe)
- `scripts/m6-phase2-refresh-link.mts` (AccountLink minter for resume)
- `tests/fixtures/auth.mts` (test organiser fixture)
- `.tmp/m6-e2e-state.json` (state file from last verify run)

### Track B artifacts (committed)

Commit `82d77b9` test(m6): unit test for tier_progression_log
auto_promotion handler. 6 files, +1179 / -119:

- `src/lib/stripe/connect-handlers.ts` (NEW, 115 lines)
- `src/app/api/webhooks/stripe/route.ts` (handler import, inline removed)
- `tests/unit/webhook-handlers/account-updated-tier-promotion.test.ts` (NEW, 220 lines)
- `vitest.config.ts` (NEW, native tsconfig paths)
- `package.json` (test/test:watch scripts, vitest 4.1.5 devDep)
- `package-lock.json` (vitest dep tree)

## Commits

- `82d77b9` test(m6): unit test for tier_progression_log auto_promotion handler

Track A produced no commits. Its outputs are documentation files
(`e2e-results.txt`, `progress.log`) and uncommitted scripts. The live
Stripe account was deleted on cleanup; the test organiser was reset to
`not_started`.

## Stop

Phase 2 is closed. Do not start Phase 3 without explicit operator
direction.
