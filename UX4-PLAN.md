# UX4 PLAN, 10 September 2026 (session 59)

Close-out UX4: NOTIFICATION ROUTING. The inbox is loud about the harmless and
silent about the dangerous. Grounded in what was read out of the repository and
the live APIs, not in assumption.

## WHAT EXISTS TODAY, established by reading

**One alert dispatcher, and it lives only in CI.** `scripts/ops/alert-dispatch.mjs`:
four Resend attempts with backoff, then a GitHub issue as a second channel that
shares no rate limit, and a non-zero exit if both are silent. It is called from
exactly ONE place, `.github/workflows/post-deploy-smoke.yml`, on `failure()`.
It ALWAYS opens the issue, which is right for an outage and wrong for anything
that arrives daily.

**The business half is built.** UX3 (session 58) put the five owner
notifications behind database triggers, a worker at `/api/cron/platform-notify`,
retry, escalation to web push, a digest at a named ceiling, and the admin feed.
UX4.4 is therefore already delivered and this item verifies rather than rebuilds it.

**Nothing tells the owner the build is alive.** There is no daily state message
of any kind about the BUILD. `/api/cron/health-heartbeat` sends a daily
PLATFORM health note (docs/ops/HEALTH-ALERTS.md); it knows nothing about main,
production deployments, open pull requests or when the build last pushed.

**Nothing can see a stall.** Six runs were killed and nothing was pushed for
nine hours on 9 September and not one message was sent, because nothing failed.

**Main going red sends only GitHub's own "Run failed: CI" email**, which is the
same shape as the email a branch gate sends, which is UX4.3's complaint.

**The six branch-gate emails are GitHub's own workflow-run notifications.**
Nothing in this repository dispatches an email for a branch failure. The switch
that stops them is an ACCOUNT setting, not a repository one.

## SOURCES FETCHED FOR THIS ITEM (Law 7)

- Vercel cron limits: 100 cron jobs per project on every plan, Pro minimum
  interval once per minute (https://vercel.com/docs/cron-jobs/usage-and-pricing,
  fetched 2026-09-10). The 19th entry added below is well inside that.
- GitHub repository activity endpoint returns push timestamps with `activity_type`
  and `ref`, verified live against this repository rather than assumed.
- Resend rate-limit semantics were already sourced in `alert-dispatch.mjs` (H2.4)
  and are reused unchanged.

## A DEFECT FOUND FIRST, FIXED BEFORE UX4 BEGINS

`src/app/api/cron/queue-admit/route.ts` says in its own header "runs every
minute via Vercel Crons" and has NO entry in `vercel.json`. Nineteen cron route
directories, eighteen scheduled. The virtual-queue admission batch has never
run: anyone placed in a queue waits for ever and stale admissions are never
expired. Fixed with the missing entry plus a registered guard so a route can
never again document a schedule it does not have.

## THE BUILD

**UX4.0 (the defect).** `vercel.json` gains `/api/cron/queue-admit`. New guard
`scripts/guards/cron-routes-scheduled.mjs`: every `src/app/api/cron/*` route has
a `vercel.json` entry, or a named exemption saying how it is invoked instead.
Proven red and green.

**UX4.1 The daily state email.** A pure renderer plus a collector:
- `scripts/lib/state-report.mjs`: pure. Judges and renders. Unit tested.
- `scripts/ops/state-report.mjs`: collects from the GitHub REST API
  (main's CI colour and commit, what landed in 24 hours, open pull requests and
  their age, failing branch runs with the guard NAMED out of the run log, the
  last push to any ref), the Vercel REST API (the production deployment's ready
  state and the commit it serves), and production itself for the business counts.
- `src/app/api/ops/state/route.ts`: cron-secret authed, read only, returns events
  live, tickets sold, new organisers, orders paid. CRON_SECRET is already a
  repository secret, so this adds no owner step.
- Sent by Resend with the GitHub issue held back unless Resend fails, because a
  digest that opens an issue every morning is the noise this item removes.
- It sends on a quiet day. Its absence is the alert.

**UX4.2 The stall alert.** `scripts/ops/stall-watch.mjs` over the same pure judge.
Alerts once per six-hour band so a long stall does not become its own noise.
Two arming paths, both honest about what they can see:
- hourly in GitHub Actions, which cannot confirm the watchdog is running and says
  so in the message;
- `--from-watchdog` from the launcher loop, where the watchdog running is proved
  by the fact that it is what invoked the script. Offered as RUN-BUILD20.ps1
  under Law 10, since the launcher is the founder's file.

**UX4.3 Outage only, immediate, distinguishable at a glance.** One subject
grammar across every class, so the inbox sorts itself:
  `EventLinqs OUTAGE: ...` `EventLinqs BUILD STALLED: ...`
  `EventLinqs daily state: ...` `EventLinqs: ...` (business, UX3, unchanged)
Main red now raises its own OUTAGE alert from `ci.yml`, restricted to `main`.
A failed PRODUCTION deployment now raises one from the smoke workflow. The
existing smoke failure alert joins the same grammar.

**UX4.4 Business immediate.** Delivered by UX3. Re-driven here as proof.

**UX4.5 Branch gate failures stop being email.** Repository side: a registered
guard fails the build if any workflow dispatches an alert on a ref that is not
main, so the platform can never start emailing branch gates. Digest side: every
failing branch appears as one line with its guard named. Account side: the
GitHub Actions notification setting is the owner's and is stated as an owner
step with its exact path, because a machine cannot change his account
preferences.

## PROOF

Driven, never asserted: a real daily email rendered from the real GitHub, Vercel
and production reads and captured at 390, 768 and 1440; the stall judge driven
across the boundary in both directions; the outage path driven with a deliberate
failure; the business path re-driven on TEST. Guards proven red and green. Full
gate at the end.

## WHAT THIS ITEM CANNOT PROVE HERE, AND WHY

A GitHub Actions SCHEDULE only fires on the default branch. Until this work is on
main, the daily and hourly jobs cannot run on their schedule in the cloud. Main
is reachable only after the founder runs `npm run migrate:production`, which is
the same block UX3 is behind. Every script is therefore driven on this machine
against the real APIs, and the cloud schedule is named as pending that command.
