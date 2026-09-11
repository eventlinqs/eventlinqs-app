# The daily state, and the stall alert

Operator runbook for close-out UX4. Companion to
`docs/observability/post-deploy-smoke.md`, which covers the outage path.

## Why this exists

From 00:23 to 09:28 on 9 September 2026 the build was stalled, six runs were
killed, nothing was pushed for nine hours, and **not one email was sent**,
because nothing failed. In the same period six emails arrived for branch gates
doing their job, and zero arrived when a real organiser published a paid event
on production.

Every alerting mechanism the platform had was a FAILURE notification. A stall
produces silence, and silence is indistinguishable from a quiet healthy day
unless something also arrives on a quiet healthy day.

## The four classes, and how to tell them apart

The subject line says which before anything is opened. Filter on the first two
words.

| Subject begins | Class | What it means | Channels |
|---|---|---|---|
| `EventLinqs OUTAGE:` | outage | Something a visitor can see is broken now: main red, a failed production deployment, a failed post-deploy smoke | Email and a GitHub issue, at once |
| `EventLinqs BUILD STALLED:` | stall | Nothing has been pushed for six hours | Email and a GitHub issue, at once |
| `EventLinqs daily state:` | daily | The once-a-day state of everything | Email; an issue only if the email fails |
| `EventLinqs:` | business | Somebody did something on the platform, sent by the product itself (UX3) | Email, then web push |
| `[DRILL] ` in front of any of them | any | A test of the alerting path. No action required | as above |

The grammar is one table, `scripts/lib/alert-classes.mjs`, and
`scripts/guards/alert-routing.mjs` fails the build if it drifts.

## What the daily state carries

Every line of close-out UX4.1, in this order:

1. **Main**: green or red, and the commit.
2. **Production**: the deployment ready state, the commit it serves, its age.
3. **Landed on main in 24 hours**: one line per commit.
4. **When the build last pushed**: the fact no failure notification can produce.
5. **Open pull requests**: number, age, title.
6. **Branches red in 24 hours**: one line each, with the guard it caught named,
   read out of the failing job's own log.
7. **The platform**: events live, tickets sold, paid orders, new organisers.

**Its absence is the alert.** If a morning goes by with no daily state, the thing
that sends it has stopped, and that is worth ten minutes.

## Where each fact comes from

| Fact | Source |
|---|---|
| main, commits, pull requests, failing runs, last push | GitHub REST, with `GITHUB_TOKEN` in Actions or the `gh` CLI login on a laptop |
| production ready state and commit | Vercel REST, with `VERCEL_TOKEN` or the Vercel CLI login |
| events live, tickets sold, orders, organisers | `GET /api/ops/state` on production, authed with `CRON_SECRET` |

The guard name comes from the line close-out F1.1 made `run-guards.mjs` print:

```
[guards] FAILED: scripts/guards/preview-deployment-state.mjs
```

The job log is fetched, not the run's log archive, because a job log comes back
as plain text on a 200 while a run log is a zip. Two details of that request were
found by driving it and both are load-bearing: the endpoint answers **415** to
`Accept: text/plain`, and the 302 it returns points at a signed blob host that
**refuses a forwarded `Authorization` header**, so the redirect is followed by
hand without it.

## The stall alert

Fires when nothing has been pushed for six hours. `STALL_THRESHOLD_HOURS` in
`scripts/lib/state-report.mjs` is the only place that number lives.

It alerts once per six-hour **band**, so a full day of silence costs four
messages rather than twenty four. Two ways of knowing whether the band has
already been raised, because the two callers genuinely differ:

- the hourly cloud check passes `--check-period-hours 1` and speaks only when
  the band is higher now than one check ago. No state is kept anywhere.
- the watchdog loop runs at irregular intervals and passes `--state-file`, which
  holds the last band it raised.

**It says plainly what it could not see.** A cloud run has no view of the build
machine, so the message says so and tells the reader that a deliberately stopped
build is the reason to ignore it. A run invoked by the watchdog itself says the
loop is alive, because the loop is what invoked it.

**A push to the session log is not the build moving.** `BOOKKEEPING_REFS` in
`scripts/lib/state-report.mjs` names `ops/session-log`, and the last-push reader
passes those pushes over and pages the activity listing past them by its own
cursor. Found 11 September 2026: twelve runs of the loop were each refused at
the same gate step and each pushed its ledger files, so the judge read "0.1
hours ago, to ops/session-log" across a 44 hour silence on every working branch.
The report and the alert both say how many bookkeeping pushes were passed over.
Clause 6 of `scripts/guards/alert-routing.mjs` executes the picker against a
feed led by the session log and fails the build if it ever counts.

## Running it by hand

```
# Compose the daily state and print it without sending
node scripts/ops/state-report.mjs --dry-run

# Compose it and write the email HTML out for a look
node scripts/ops/state-report.mjs --dry-run --html state.html --json state.json

# The stall judge, as the hourly cloud check runs it
node scripts/ops/state-report.mjs --stall --dry-run --check-period-hours 1

# The stall judge, as the watchdog loop runs it
node scripts/ops/state-report.mjs --stall --from-watchdog --state-file C:/dev/stall-state.json
```

`--now <iso>` moves the clock, which is how the boundary is driven without
waiting six hours for it.

## In the cloud

`.github/workflows/state-report.yml`, two jobs on two schedules:

- `10 21 * * *` the daily state. That is 07:10 in Melbourne on AEST and 08:10 on
  AEDT, so it lands in the morning either way.
- `25 * * * *` the stall check.

**A schedule only fires on the default branch.** Neither job runs until this
file is on `main`. `workflow_dispatch` runs either of them by hand, with a
`dry_run` switch.

## The one thing that is the owner's

GitHub emails the person who triggered a workflow run when it fails. That is an
**account** setting, not a repository one, and nothing in this repository can
change it. It is the source of the six branch-gate emails.

To turn it off: **github.com/settings/notifications**, the **Actions** section,
clear the email checkbox.

Nothing is lost by doing so. Every branch failure appears in the daily state as
one line with its guard named, and every OUTAGE is dispatched by this repository
on two channels that have nothing to do with that setting.

## Drilling it

The alert path is proven by driving it, never by reading it:

```
# A drill marks itself, because the target is in the reserved .invalid domain
node scripts/ops/alert-dispatch.mjs --class outage --target https://smoke-drill.invalid \
  --subject "the production homepage smoke FAILED" --dry-run

# A real target does not
node scripts/ops/alert-dispatch.mjs --class outage --target https://www.eventlinqs.com.au \
  --subject "the production homepage smoke FAILED" --dry-run
```

`scripts/guards/alert-routing.mjs` executes both of those on every build.
