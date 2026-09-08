# The chunk cost table, and what it decided

Close-out P0.5, 8 September 2026. Branch `perf/h3-initial-bundle`.

> "For the event route, the homepage and browse: every JavaScript chunk by
> transferred size, its evaluation time, whether it is on the critical path, and
> what feature it serves. Order by cost. That table decides the work order. Do
> not touch anything before it exists."

The table is produced by `scripts/perf/chunk-cost-table.mjs`, a reporter that
DRIVES the routes rather than reading a build manifest, because three of the
facts that matter here are invisible to every static source:

1. A chunk in the document is not necessarily requested. The Next.js legacy
   polyfill bundle ships as `<script noModule>`: 110 KB on disk, in the HTML,
   and never fetched by any browser that supports modules.
2. A chunk in no manifest can be the biggest thing on the page. The
   error-reporting SDK arrives by dynamic import and is half the script weight.
3. Transferred size is not file size. The three heaviest chunks are 414 KB,
   340 KB and 242 KB on disk and 123 KB, 95 KB and 75 KB over the wire.

Routes come from `lighthouse-gate-urls.json`, the pinned set the Lighthouse gate
audits, so this table and that gate always talk about the same pages. No slug is
guessed.

---

## The table, before any change

Driven against the deployed preview of main's tree
(`eventlinqs-gdnfk6j83`, the preview Lighthouse run 34188084768 measured), with
evaluation times merged from that run's own `bootup-time` audit, Lighthouse
12.6.1, mobile.

`/events/cat-indie-sounds-live-at-the-enmore-sydney` - 21 script requests,
**439.0 KB transferred**: 207.9 KB named in the document, **231.1 KB by dynamic
import**.

| rank | chunk | transferred | on disk | evaluation | in document | serves |
|---|---|---|---|---|---|---|
| 1 | `0b1jd370isqgk.js` | 123.2 KB | 404.1 KB | 413 ms | no | **Session Replay (rrweb)** |
| 2 | `3uq570333emgk.js` | 94.6 KB | 331.6 KB | 231 ms | no | **error reporting SDK** |
| 3 | `2wdcogt80jtt3.js` | 74.5 KB | 236.3 KB | 580 ms | yes | React DOM |
| 4 | `1boc349tfc3da.js` | 30.7 KB | 110.9 KB | 111 ms | yes | unattributed |
| 5 | `258vwuf90fnu-.js` | 15.9 KB | 45.2 KB | - | yes | unattributed |
| 6 | `0uhdrye2nrutq.js` | 14.9 KB | 49.4 KB | - | yes | unattributed |
| 7 | `1-3lx-4fqizyz.js` | 12.1 KB | 35.0 KB | - | yes | React DOM |
| 8 | `1fszpzkk7un1s.js` | 11.6 KB | 27.8 KB | - | yes | unattributed |
| 9 | `3e3h3tjdig_iq.js` | 10.0 KB | 35.5 KB | - | yes | unattributed |
| 10 | `447l86plkgb35.js` | 8.9 KB | 26.5 KB | - | yes | unattributed |
| 11 | `35mku92kq9ffz.js` | 8.4 KB | 20.9 KB | - | yes | Lucide icons |
| 12 | `05ub60vb80se0.js` | 5.6 KB | 13.5 KB | - | no | Session Replay (rrweb) |
| 13 | `3gog3kwxtqm-a.js` | 5.3 KB | 20.6 KB | - | yes | unattributed |
| 14 | `turbopack-3t8xc0iyr2jda.js` | 4.8 KB | 11.0 KB | - | yes | unattributed |
| 15 | `22vweaum04fil.js` | 4.4 KB | 7.8 KB | - | no | Google Maps loader |
| 16 | `3nj8o_-10x9y2.js` | 4.3 KB | 10.8 KB | - | no | unattributed |
| 17 | `3w26vu4e29rrp.js` | 4.1 KB | 14.4 KB | - | yes | unattributed |
| 18-21 | four chunks under 2.5 KB each | 7.7 KB | 9.4 KB | - | mixed | Next.js app router, unattributed |

The attribution is not inferred from a filename. The deployed bytes were fetched
and read: `0b1jd370isqgk.js` contains `rrweb` nine times, `replayIntegration`
four times and `recordCrossOriginIframes` eight times; `3uq570333emgk.js`
contains `__SENTRY__` sixteen times and no rrweb marker at all.

### What the table says

**Ranks 1 and 2 are one feature and they are 217.8 KB of the page's 439.0 KB,
with 644 ms of script evaluation.** Nothing else on the page is within a factor
of three of either. Rank 3 is React DOM, which is the framework and is not going
anywhere. Ranks 4 down are all under 31 KB.

Lighthouse's own `unused-javascript` audit on the same run:

| chunk | bytes | unused | percent |
|---|---|---|---|
| `0b1jd370isqgk.js` (Session Replay) | 125,948 | 88,584 | **70%** |
| `3uq570333emgk.js` (error reporting SDK) | 96,637 | 61,079 | **63%** |
| `2wdcogt80jtt3.js` (React DOM) | 76,139 | 24,582 | 32% |

**And the cost is not only weight, it is WHEN.** The two chunks were evaluating
inside the Largest Contentful Paint window. From the same report:

    long tasks   3uq570333emgk.js  149 ms  at 3,180 ms
                 0b1jd370isqgk.js  270 ms  at 4,079 ms
                 0b1jd370isqgk.js   67 ms  at 4,349 ms

    LCP 4,382 ms = TTFB 630 + Load Delay 1,159 + Load Time 191 + Render Delay 2,403

The hero raster had finished downloading at about 1,980 ms and then waited
2,403 ms for the main thread. That page's median was **0.79 against the gate's
0.80 floor**, and it is the single URL failing the launch gate.

The comparison that proves it is sequencing rather than weight: `/community/african`
carries the same 217.8 KB of SDK and scored 0.93 in the same collection, with a
Render Delay of 126 ms. Its hero is discovered later and paints as soon as it
arrives. The event pages discover their hero early and then queue behind script.

### The work order the table decided

1. **Session Replay (rrweb), 123.2 KB, 413 ms.** P0.5 names it first by name.
2. **The error reporting SDK core, 94.6 KB, 231 ms.**
3. Everything else, none of it above 31 KB, only if 1 and 2 are not enough.

---

## The defect found before any of that could be measured

**The local Lighthouse gate could not see one byte of the 217.8 KB.**

`NEXT_PUBLIC_SENTRY_DSN` is inlined into the browser bundle at build time, and
`instrumentation-client.ts` refuses to load the SDK when it is empty. The
founder's `.env.local` carries `NEXT_PUBLIC_SENTRY_DSN=""`, so every local gate
build shipped a browser bundle with no SDK in it, while every Vercel preview CI
measures ships one.

Driven, same route, same tree:

| | script requests | transferred |
|---|---|---|
| local build, before this fix | 17 | 207.8 KB |
| deployed preview | 21 | 439.0 KB |
| local build, after this fix | 21 | 440.0 KB |

That is close-out P0.2 exactly: "If local says pass and CI says fail, the local
gate is lying and that is a defect in the gate." It is also the whole of the 5 to
15 point gap this repository kept recording between the local gate and the
runner, and it meant the local Lighthouse step could go green on a build nobody
deploys.

The fix is `PARITY_SENTRY_DSN` in `scripts/ops/pre-push-gate.mjs`: when the
environment carries no DSN, the gate builds with a shape-valid one pointing at
loopback, and `scripts/verify/sentry-parity-sink.mjs` answers it. The SDK loads,
parses, evaluates, arms and sends exactly as it does in production; nothing
leaves the machine. A real DSN in the shell or in `.env.local` always wins.
`tests/unit/ci/gate-client-sdk-parity.test.ts` holds it.

**The first attempt at this was wrong, and the gate caught it.** It used an
RFC 2606 `.invalid` host, on the reasoning that a name which can never resolve
can never receive anything. It cannot, and that is the problem: the SDK opens a
session envelope on every page load, the request failed with
ERR_NAME_NOT_RESOLVED, Chrome logged it, and Lighthouse's `errors-in-console`
audit took BEST PRACTICES from 1.00 to 0.93 on all thirteen gated URLs on all
five runs. The push was refused. A parity fix that introduces a difference of
its own is not parity.

What that fix did to the local numbers, median of 5, same build, mobile, warmed:

| route | local gate after the fix | the runner |
|---|---|---|
| `/events/cat-indie-...-sydney` | **0.76** (runs 0.82, 0.76, 0.77, 0.76, 0.75) | 0.79 |
| `/events/artist-layer-...-geelong` | **0.80** (runs 0.80, 0.76, 0.81, 0.77, 0.81) | 0.80 |

Before the fix the local gate reported the whole gated set at medians of 88 to
95 (the C8 CORRECTED table, 7 September 2026), which is the reading that made
the runner look like the problem. Those two per-URL local figures were never
recorded separately on the blind build, so this table does not invent them: what
it shows is that the honest local gate now lands within 0.03 of the runner on
both pages, where the blind one was 9 to 19 points above it across the set.

The local gate now reproduces the failure the runner reports. Every number below
this line is taken on that honest gate.

---

## What was changed, and the mechanism that turned out to matter

### 1. Session Replay arms on the visitor's first interaction

`armSessionReplay()` used to schedule on `requestIdleCallback` with a 5,000 ms
timeout. An idle callback fires during the quiet a throttled device has WHILE the
hero is still painting, so it reads as off the critical path and is not. It now
arms on the first `pointerdown`, `keydown`, `touchstart` or `wheel`.

Cost, stated plainly: an error before the visitor has touched the page has no
replay attached. The error itself still reports in full with its stack. That is
P0.5's own bar: "costs nothing before first interaction."

### 2. The SDK core boots at the earliest of an error, a first interaction, or a timer after load

`load` is not off the paint path on a throttled mobile. The schedule is now the
earliest of a held error (a report must never wait), the first interaction, or
`BOOT_AFTER_LOAD_MS` = 3,000 ms after load. A visitor who only reads a page still
gets their errors reported; the fetch and the evaluation land after the paint.

### 3. The barrel import, which is the one that actually mattered

**Changes 1 and 2 alone did not work, and the driven proof is what showed it.**
With Session Replay correctly armed on first interaction, the recorder chunk was
STILL fetched at 4,323 ms with no input at all, 50 ms behind the SDK core, on 2
of 2 runs. The `el:sentry-replay-armed` mark did not appear until the input at
10,301 ms, so the arming was right. The 123.2 KB arrived anyway.

The cause: two `import('@sentry/nextjs')` calls. A dynamic import of a barrel is
a NAMESPACE import. The bundler must assume any property of the namespace might
be read, so it cannot tree-shake, so each of those lines pulled the whole SDK
surface INCLUDING rrweb into its chunk group. The same file's STATIC named
imports shake perfectly, which is exactly why this was invisible: the core chunk
looked clean.

Both were removed:

- `instrumentation-client.ts` chained `import('@sentry/nextjs')` purely to pick
  up `captureRouterTransitionStart`. That function is now re-exported from
  `sentry-client-boot.ts`, a named static import that lands in the core chunk
  being fetched anyway.
- The recorder moved to `src/lib/observability/sentry-session-replay.ts`, reached
  by `import('./sentry-session-replay')`, with named imports inside it, so it has
  a chunk of its own that nothing else can pull in.

**Deferring the ARM while the BYTES still arrive buys nothing.** The cost P0.5
names is the transfer and the evaluation, not the recording.

---

## The result, driven

`scripts/verify/sentry-replay-window.mjs`, three runs, the local production build
with the parity DSN:

    run 1: load 1451ms | sdk chunk 4470ms | replay chunk 10492ms | before any input: no
    run 2: load 1422ms | sdk chunk 4438ms | replay chunk 10444ms | before any input: no
    run 3: load  961ms | sdk chunk 3973ms | replay chunk  9984ms | before any input: no

    MEDIAN  load 1422 ms | SDK core 4438 ms | recorder 10444 ms
            recorder, measured from the input: 9 ms   <-- the no-buffer window

On 3 of 3 runs the recorder was not requested at all during 9,000 ms of no input,
and arrived only after a real pointer input driven through the browser's own
input pipeline. The SDK core arrives at load + about 3,020 ms, which is the timer
behaving. **And the no-buffer window got SMALLER, not larger**: 9 ms after the
input, because the core is already in memory by the time the recorder is asked
for.

### Script weight on the event page, driven, same route, same machine

| | script requests | transferred | in the document | by dynamic import |
|---|---|---|---|---|
| before | 21 | 440.0 KB | 195.6 KB | 244.6 KB |
| after | 20 | **295.8 KB** | 195.6 KB | **100.2 KB** |

**144.2 KB less script on every page load, a 33% cut**, and the recorder's 413 ms
of evaluation is gone from the load entirely. The SDK core also shrank, 106.0 KB
to 92.9 KB across two chunks, because the barrel is no longer dragging surface in
behind it.

The homepage moved the same way: 16 requests, 267.8 KB, of which 170.8 KB is in
the document.

**Scope v5 section 10.3 asks for an initial JavaScript bundle under 200 KB. The
in-document set on the heaviest measured event route is 195.6 KB**, measured over
the wire on a localhost server (gzip). The deployed preview serves brotli, which
is smaller again; the preview figure is recorded below rather than assumed.

### Lighthouse, median of 5, mobile, warmed, the local honest gate

Same machine, same server, the only variable the code change.

| route | before | after | delta | LCP before | LCP after |
|---|---|---|---|---|---|
| `/events/cat-indie-...-sydney` | **0.76** | **0.87** | +0.11 | 4,639 ms | 3,667 ms (-972) |
| `/events/artist-layer-...-geelong` | **0.80** | **0.88** | +0.08 | 4,420 ms | 3,739 ms (-681) |
| `/events` | **0.70** | **0.92** | +0.22 | 6,182 ms | 3,270 ms (-2,912) |

Every run, not only the median:

    before  cat-indie  0.82, 0.76, 0.77, 0.76, 0.75
    after   cat-indie  0.89, 0.87, 0.86, 0.87, 0.88

    before  geelong    0.80, 0.76, 0.81, 0.77, 0.81
    after   geelong    0.89, 0.88, 0.88, 0.86, 0.88

    before  /events    0.73, 0.70, 0.70, 0.70, 0.69
    after   /events    0.92, 0.89, 0.92, 0.91, 0.92

The WORST run after the change (0.86) is better than the BEST run before it
(0.82) on the page that was failing the gate. The spread narrowed as well, which
is the second half of what "with headroom" means: 0.75-0.82 became 0.86-0.89.

Evidence: `C:\dev\EVIDENCE\H3\lighthouse-before-median5-local.txt` and
`lighthouse-after-median5-local.txt`.

---

## P0.8, the preview deployment failure, named from its own build log

The failure P0.8 names is `docs/c18-final-community-layer` at 718d93b,
7 September 10:04 UTC, deployment `dpl_7Y5XfF1s7nrkFHwuQvkXpuFQQM8V`. Read from
the Vercel build log rather than inferred:

    Error: ENOENT: no such file or directory, open
      '/vercel/path0/docs/scope/community-layer-approved.json'
      at file:///vercel/path0/scripts/guards/community-layer-protected.mjs:61:29
    [guards] 1 of 75 guard(s) FAILED. Build blocked.
    Error: Command "npm run build" exited with 1

`.vercelignore` excludes `docs/`, and that guard read a file under it
unconditionally, so it passed on every machine that has the file and killed the
build on the only machine that does not.

**It is already fixed, and not by this branch.** The same branch shipped the fix
47 minutes later: preview 4455104f READY at 10:50 UTC, merged to main as
15ccce5c, and `scripts/guards/vercelignore-covers-guard-reads.mjs` was added so
the shape cannot return. Every preview deployment since has been READY (twenty
consecutive deployments read back from the Vercel API on 8 September). P0.8 is
MET by observation, not by assumption.

**The sibling hole is still open and is not this item.** The H2 ledger recorded
it: the same shape arriving through `.gitignore` rather than `.vercelignore` (a
build-time script reading a gitignored path passes locally and fails on every
runner). It is written down, it is not built here, and it is not silently
forgotten.
