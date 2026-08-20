# Forward compatibility inventory, 16 August 2026

Report only. **Nothing here was applied.** This is the list a later sweep works
from, and every version claim carries the primary source it was read from rather
than a recollection.

## The one finding that is already a Law 9 breach

**Every GitHub Action pinned in this repository runs on Node 20, which reached
end of life on 30 April 2026.** The repository moved its own runtime to Node 24
on 13 August 2026 and left the actions that CI executes on a dead runtime, so
the platform is half-migrated and the half that is behind is the half nobody
reads.

Read from each tag's own `action.yml`, `runs.using`, on 16 August 2026:

| Action | Pinned here | Runtime of the pin | Latest | Runtime of latest |
|---|---|---|---|---|
| `actions/checkout` | **v4** | `node20` | **v7.0.1** (2026-07-20) | `node24` |
| `actions/setup-node` | **v4** | `node20` | **v7.0.0** (2026-07-14) | `node24` |
| `supabase/setup-cli` | **v1** | `node20` | **v3.0.0** (2026-07-07) | `composite` (no Node runtime of its own) |

Sources: `https://raw.githubusercontent.com/<repo>/<tag>/action.yml` for each row,
and `https://api.github.com/repos/<repo>/releases/latest` for the latest tags,
both fetched 2026-08-16. Node support dates from
`https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`, fetched
2026-08-16: **v20 end 2026-04-30**, v22 end 2027-04-30, **v24 end 2028-04-30**,
v26 becomes LTS 2026-10-28.

**Where they are pinned** (13 uses across 6 workflows):

| Workflow | Lines |
|---|---|
| `ci.yml` | checkout 53, 139, 204; setup-node 73, 142, 207 |
| `env-locks.yml` | checkout 55, 72; setup-node 56, 73 |
| `lighthouse.yml` | checkout 113; setup-node 116 |
| `purchase-e2e.yml` | checkout 42; setup-node 45 |
| `purchase-e2e-local.yml` | checkout 46; setup-node 49; `supabase/setup-cli@v1` 61 |

This is a three-major jump on two actions, which is why it is reported rather
than done tonight: `actions/checkout` v5 changed its default behaviour in ways
that need a read of the release notes, not a find-and-replace. But it is the
first thing a sweep should do, and the Node-20 deprecation warnings the founder
has been seeing are exactly this.

## Runtime pins: do they agree?

**Yes, everywhere the repository controls. The disagreement is in the actions
above and in one dev dependency.**

| Where | Value | Read from |
|---|---|---|
| `.nvmrc` | `24` | the file |
| `package.json` `engines.node` | `24.x` | the file |
| `ci.yml` (3 jobs) | `node-version-file: .nvmrc` | lines 79, 148, 213. Derived, so it cannot drift |
| `env-locks.yml` (2 jobs) | `node-version: 24` | lines 58, 75. Literal, so it CAN drift from `.nvmrc` |
| `lighthouse.yml` | `node-version: 24` | line 118. Literal |
| `purchase-e2e.yml` | `node-version: 24` | line 47. Literal |
| `purchase-e2e-local.yml` | `node-version: 24` | line 51. Literal |
| Vercel | `engines.node` `24.x` decides it | the handover records that Vercel reads `engines.node` and never reads `.nvmrc`, citing `https://vercel.com/docs/functions/runtimes/node-js/node-js-versions` |
| This machine | portable extract at `C:\node24`, `v24.19.0` | `node --version` |

**The one to fix while you are there:** four workflows carry the literal `24`
where `ci.yml` derives it from `.nvmrc`. Today they agree. The 13 August
incident was precisely two files that agreed until they did not, so the literal
should become `node-version-file: .nvmrc` in all four. Small, safe, and it
removes four future disagreements.

**`@types/node` is pinned at 20 while the runtime is 24.** `@types/node@20.19.37`
against a latest of `26.2.0`. This is the same shape as the `.nvmrc` incident: a
declaration of the runtime that disagrees with the runtime, in a file read by a
different tool, with nothing able to notice. It is a TYPE-level disagreement so
it cannot break production, but it can hide a Node 24 API from the compiler and
report a real call as an error, or accept a Node 20 idiom that no longer exists.

## Direct dependencies with a newer MAJOR available

From `npm outdated --long` on 16 August 2026, filtered to rows where the latest
major exceeds the installed major. Classification is mine and is a judgement,
stated as such.

| Package | Installed | Latest | Class | Why |
|---|---|---|---|---|
| `stripe` | 21.0.1 | 22.5.0 | **DO NOT TOUCH** | The payment engine. A Stripe major carries an API version pin change. Out of scope by standing instruction, and correctly so |
| `typescript` | 5.9.3 | 7.0.2 | **BREAKING** | A major TypeScript is a whole-tree event. It will surface real type errors and needs its own day, its own branch and a clean `tsc` before and after |
| `eslint` | 9.39.4 | 10.8.1 | **BREAKING** | Config format and rule removals. Blocked in practice by `eslint-config-next`, which is itself one minor behind and will decide when this is safe |
| `@types/node` | 20.19.37 | 26.2.0 | **RISKY, and the highest value of the list** | See above. Move it to the `24.x` line rather than to 26, so it matches the runtime rather than overshooting it |
| `jsdom` | 29.1.1 | 30.0.1 | **RISKY** | The test DOM. A major can change how a component test sees the DOM, which is exactly the kind of change that turns a suite green for the wrong reason |
| `@testing-library/jest-dom` | 6.9.1 | 7.0.1 | **SAFE-ish** | Matcher package. Read the changelog for removed matchers, then bump |
| `@supabase/ssr` | 0.10.0 | 0.12.4 | **RISKY** | Pre-1.0, so a minor is a major. It owns the cookie/session bridge, which is the auth path |

**Everything else is a minor or patch behind**, 31 packages in all, including
`next` 16.3.0 against 16.3.1, `react` 19.2.4 against 19.2.8, `@supabase/
supabase-js` 2.101.1 against 2.112.3, `playwright` 1.59.1 against 1.62.1,
`lighthouse` 13.1.0 against 13.4.1 and `tailwindcss` 4.2.2 against 4.3.3.

Two of those minors are worth naming because a dated note already depends on
them:

- **`lighthouse` 13.1.0 to 13.4.1.** `lighthouserc.json` records that Lighthouse
  12.1.0's TraceElements gatherer throws, so the LCP-element audit returns no
  data. The proposed fix was a newer Lighthouse. Whether 13.4.1 carries it is
  **UNSOURCED** here; I did not read the changelog tonight.
- **`playwright` 1.59.1 to 1.62.1.** Every proof harness in the repository runs
  on it, including tonight's dead-end crawl.

**One rule for whoever does the sweep**, from the constitution: `sharp` is on a
user-content path, so if it appears in a future list it is verified against the
installed package with a real file, never against a lockfile diff. It is not in
this list; it is current.

## The Supabase Postgres version: DETERMINED, 17 August 2026

**Resolved, and the previous "blocked" answer was wrong about the route rather
than about the credential.** The blocker recorded on 16 August was the redacted
`SUPABASE_DB_URL` in `.env.test`, which is real: a direct `select version()`
cannot connect, proven by an `ERR_INVALID_URL` on the placeholder. What that
missed is that the connection string was never the only route. **The Supabase
CLI on this machine is already signed in**, so the Management API answers it
read-only, with no database connection and no write of any kind:

```
supabase projects list --output json
```

| Project | Ref | `postgres_engine` | `version` | Channel | Status |
|---|---|---|---|---|---|
| eventlinqs-sydney (**PRODUCTION**) | `gndnldyfudbytbboxesk` | **17** | 17.6.1.105 | ga | ACTIVE_HEALTHY |
| eventlinqs-test (**TEST**) | `vkapkibzokmfaxqogypq` | **17** | 17.6.1.155 | ga | ACTIVE_HEALTHY |

**Is it current? Yes on the major, slightly behind on the minor.** PostgreSQL
supports 17 until **8 November 2029**, and the current minor of that line is
**17.11** (https://www.postgresql.org/support/versioning/, fetched 2026-08-17,
which also states the project supports each major for five years and recommends
"always run the current minor release"). Both projects run Supabase's build of
**17.6**. Minor upgrades are Supabase's to schedule from the dashboard, not the
repository's, so this is a check-and-apply item rather than a code change, and it
is not urgent: there is no end-of-life pressure until 2029.

**The two environments are NOT on the same platform build.** TEST is 17.6.1.155
and production is 17.6.1.105. Same Postgres, different Supabase build. Worth
knowing when a behaviour reproduces on one and not the other.

### The finding this actually surfaced: local development runs TWO MAJORS BEHIND

`supabase/config.toml` line 16 declares:

```toml
[db]
major_version = 15
```

That is the Postgres `supabase start` runs locally. **Both hosted projects run
17.** So anything verified against a local Supabase is verified on Postgres 15
and deployed onto Postgres 17, which is exactly the shape of Law 9 clause 2: two
environments disagreeing, with the older one not brought forward. Postgres 15 is
still supported (until 11 November 2027), so nothing is broken today; the risk is
that a behaviour differing between 15 and 17 is invisible locally.

**The fix is one line**, `major_version = 17`, followed by a local `supabase stop`
and `supabase start` to recreate the container. It is NOT applied here because
this document is report-only by instruction, and because recreating the local
database is a founder action with local state attached to it.

## The order I would do this in

1. **The three GitHub Actions.** They are already on a dead runtime and it is
   visible in every workflow run.
2. **`node-version-file: .nvmrc` in the four workflows carrying a literal.**
   Fifteen minutes, removes four future disagreements.
3. **`@types/node` to the 24 line.** Matches the compiler to the runtime.
4. **Read the Postgres version** and decide whether an upgrade is needed.
5. **The minors**, in one pass, with the suite run before and after.
6. **`jsdom`, `@supabase/ssr`, `@testing-library/jest-dom`**, one at a time.
7. **`typescript` and `eslint`**, each on its own branch, each with its own day.
8. **`stripe`**, only on a deliberate decision, never as part of a sweep.
