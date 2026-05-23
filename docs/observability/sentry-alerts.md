# Sentry alert rules

Founder-side configuration. These rules live in the Sentry dashboard (`https://sentry.io/organizations/eventlinqs/projects/eventlinqs-web/alerts/`), not in the codebase. Configure once the SDK install is complete (see `sentry-audit-2026-05-24.md`).

## Recommended rule set for v1 (friends-launch ready)

### 1. New issue created -> immediate email

| Field | Value |
| - | - |
| Type | Issue alert |
| Conditions | "A new issue is created" |
| Filters | `environment: production` |
| Actions | Email `hello@eventlinqs.com` |
| Frequency | Immediate (no throttle) |

Catches the long tail of "bug we have never seen before" - which is exactly what the React #185 incident was. Volume should be near zero in steady-state; if it is noisy, that is a signal to add filters in `beforeSend` not to mute this rule.

### 2. Issue frequency > 10 events in 1 hour -> email

| Field | Value |
| - | - |
| Type | Issue alert |
| Conditions | "The issue is seen more than 10 times in 1 hour" |
| Filters | `environment: production` |
| Actions | Email `hello@eventlinqs.com` |
| Frequency | Every 1 hour (so we do not get hammered if a single issue spikes) |

Catches "old bug that suddenly went viral" - a regression that the new-issue rule already paged once but is now compounding.

### 3. Spike in transaction error rate -> email

| Field | Value |
| - | - |
| Type | Metric alert |
| Metric | `transactions.failure_rate` |
| Conditions | "Above 5% over 1 hour" |
| Filters | `environment: production` |
| Actions | Email `hello@eventlinqs.com` |

Catches systemic degradation (Stripe down, Supabase RLS broken, etc.) where individual issues might not trip the per-issue rules but the overall failure rate does. Threshold can be tightened post-launch once baseline is established.

### 4. Performance regression on the homepage -> email

| Field | Value |
| - | - |
| Type | Metric alert |
| Metric | p95 of `transaction.duration` for `transaction:/` |
| Conditions | "Above 4000 ms over 1 hour" |
| Filters | `environment: production` |
| Actions | Email `hello@eventlinqs.com` |

Optional for v1; useful once traffic is real and `tracesSampleRate: 0.1` produces enough data. Wait two weeks post-launch before enabling so the threshold is calibrated.

## What to skip for v1

- **PagerDuty / SMS integrations.** Email to `hello@eventlinqs.com` is the canonical alert channel until on-call rotation exists.
- **Slack alerts.** No Slack workspace in v1 scope.
- **Spike Protection rules.** Sentry's free tier handles billing protection automatically; manual rules add noise.
- **Custom Discover queries as alerts.** Premature optimisation pre-launch.

## What to confirm after each rule is set

1. Send a synthetic event via the health route once the SDK is installed:
   ```bash
   curl "https://www.eventlinqs.com/api/health/sentry-error?token=<HEALTH_CHECK_TOKEN>"
   ```
2. Confirm an event appears in the project tagged `synthetic=true`.
3. For rule 1, confirm the email arrives at `hello@eventlinqs.com`. If not, check Sentry's "Action Settings" page for delivery failures.
4. Filter the `synthetic=true` events out of dashboard views after verification (Sentry > Settings > Inbound Filters > Custom > tag matches `synthetic=true`).

## Rules that should NOT be set

- "Issue seen more than N times" without a time window. Without a window, this rule fires once and stays "satisfied" forever, silencing real recurrences.
- "Any issue in any environment". Without an environment filter, dev/preview noise floods the inbox.
- "Issue assigned to me". The bot has no Sentry user, so this never fires.

## When to revisit

- 30 days post-launch: review alert volume. Tighten or relax thresholds based on signal-to-noise.
- After first paid plan tier: add Slack and PagerDuty if/when those tools enter the ops stack.
- After Sentry user accounts exist for the founder + first engineer hires: switch from generic `hello@eventlinqs.com` to per-person `@mention` routing for issue ownership.
