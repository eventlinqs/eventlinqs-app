/**
 * GUARD: the error-reporting SDK and its Session Replay recorder stay off the
 * PAINT path, not merely off the boot path.
 *
 * WHY THIS EXISTS, with the measurement that produced it.
 *
 * On 5 August 2026 the SDK was moved from a static import to a dynamic one on
 * the window `load` event, and scripts/ci/critical-path-guard.mjs RULE 4 was
 * written to stop the static import coming back. It did its job. What nobody
 * held was the SCHEDULE, and `load` turned out not to be off the paint path at
 * all on a throttled mobile.
 *
 * Measured on the deployed preview of main's tree on 8 September 2026, with
 * scripts/perf/chunk-cost-table.mjs and Lighthouse 12.6.1, on
 * /events/cat-indie-sounds-live-at-the-enmore-sydney:
 *
 *   error reporting SDK      94.6 KB transferred, 231 ms evaluation, 63% unused
 *   Session Replay (rrweb)  123.2 KB transferred, 413 ms evaluation, 70% unused
 *   ------------------------------------------------------------------------
 *   217.8 KB of the page's 439.0 KB of script and 644 ms of main thread work,
 *   with long tasks from those two files at 3,180 ms and 4,079 ms against an
 *   LCP of 4,382 ms whose Render Delay was 2,403 ms.
 *
 * That page scored 0.79 against the gate's 0.80 floor. So the rule is now: the
 * SDK boots at the earliest of an error, a first interaction, or a timer after
 * load; and the Replay recorder is never fetched before a first interaction.
 * Both are one edit away from being undone, and undoing either looks like a
 * tidy-up in review.
 *
 * WHAT THIS GUARD CANNOT SEE, stated rather than implied. It reads source text.
 * It can prove that the scheduling code is present and that the shapes known to
 * be wrong are absent; it cannot prove the browser behaves. The driven proof is
 * scripts/perf/chunk-cost-table.mjs, which shows the bytes actually arriving,
 * and the evidence captured for close-out H3.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const CLIENT = 'instrumentation-client.ts'
const BOOT = 'src/lib/observability/sentry-client-boot.ts'
const REPLAY = 'src/lib/observability/sentry-session-replay.ts'

/**
 * Read a file with its comments removed, so a rule about CODE is never decided
 * by prose.
 *
 * This matters here more than usual: both files carry long comment blocks that
 * NAME the shapes this guard forbids, because a comment that says "the previous
 * schedule was requestIdleCallback, and here is what it cost" is the most
 * valuable line in the file. Testing the raw text would fail the build for
 * explaining itself.
 *
 * WHAT THE STRIPPER CANNOT DO: it removes `/* *\/` blocks and `//` line
 * comments without parsing, so a string literal or a regular expression
 * containing those characters would be truncated. Neither file contains one,
 * and if one ever does the guard fails loudly rather than passing quietly,
 * which is the right direction for a stripper to be wrong in.
 */
const read = (rel) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ')
    .replace(/([^:'"`])\/\/[^\n]*$/gm, '$1')

/**
 * The interaction signals both files must use.
 *
 * Kept here rather than derived from the source, because a guard that reads the
 * list out of the file it is checking asserts only that the file agrees with
 * itself.
 */
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel']

const failures = []
const checks = []

function require_(ok, where, what, why) {
  checks.push({ where, what, ok })
  if (!ok) failures.push({ where, what, why })
}

const client = read(CLIENT)
const boot = read(BOOT)
const replay = read(REPLAY)

// ---------------------------------------------------------------------------
// The barrel rule. This is the one that actually leaked.
// ---------------------------------------------------------------------------
//
// A DYNAMIC import of the @sentry/nextjs barrel is a NAMESPACE import: the
// bundler must assume any property of the namespace object might be read, so it
// cannot tree-shake, so one such line pulls the rrweb recorder into that chunk
// group. It is invisible in review, it is invisible in the core chunk (which
// stays clean because the STATIC named imports shake perfectly), and it defeats
// every interaction-based deferral downstream of it.
//
// Driven, 8 September 2026: with Session Replay already correctly armed on the
// first interaction, the recorder chunk was still fetched at 4,323 ms with NO
// input, 50 ms behind the core, on 2 of 2 runs. The arm was deferred and the
// 123.2 KB was not.
for (const [where, source] of [
  [CLIENT, client],
  [BOOT, boot],
]) {
  require_(
    // `typeof import('@sentry/nextjs').x` is a TYPE position: TypeScript erases
    // it and it costs zero bytes. instrumentation-client.ts uses exactly that to
    // type its forward-declared router hook, and failing the build for it would
    // push somebody towards `any`.
    !/(^|[^f])\bimport\(\s*['"]@sentry\/nextjs['"]\s*\)/.test(source.replace(/typeof import\(/g, 'typeofimport(')),
    where,
    'no dynamic import of the @sentry/nextjs barrel',
    'a dynamic barrel import is a namespace import, cannot be tree-shaken, and drags the rrweb recorder into that chunk group whatever the arming code says; reach the SDK through a named static import, or through src/lib/observability/sentry-session-replay.ts for the recorder',
  )
}

require_(
  /import\(\s*['"]\.\/sentry-session-replay['"]\s*\)/.test(boot),
  BOOT,
  'the recorder is reached through its own module',
  'the recorder needs a chunk of its own; reaching it any other way puts it back in a chunk group something else already fetches',
)

require_(
  /import\s*\{[^}]*replayIntegration[^}]*\}\s*from\s*['"]@sentry\/nextjs['"]/.test(replay),
  REPLAY,
  'the recorder module uses a named import',
  'a namespace import here would defeat the split it exists to create',
)

// ---------------------------------------------------------------------------
// The scheduler in instrumentation-client.ts
// ---------------------------------------------------------------------------

require_(
  !/^\s*import\s+(?!type\b)[^\n]*from\s+['"]@sentry\/nextjs['"]/m.test(client),
  CLIENT,
  'no value import of @sentry/nextjs',
  'a static import puts the whole SDK back in the boot chunk of every route; only `import type` and a dynamic import() are allowed here',
)

for (const event of INTERACTION_EVENTS) {
  require_(
    client.includes(`'${event}'`),
    CLIENT,
    `schedules on ${event}`,
    'the first interaction is the signal that the paint the visitor was waiting for has happened; losing one of the four signals narrows it to a subset of input devices',
  )
}

require_(
  /BOOT_AFTER_LOAD_MS/.test(client) && /setTimeout\(\s*\(\)\s*=>\s*boot\('timer'\)/.test(client),
  CLIENT,
  'boots on a timer after load as well',
  'a visitor who reads a page and never touches it must still have their errors reported; without the timer the deferral would be a silent loss of reporting',
)

require_(
  /window\.addEventListener\('load',\s*armTimer/.test(client),
  CLIENT,
  'the timer is armed by the load event, not started at parse',
  'starting the countdown before load would put the boot back inside the paint window on a slow page, which is the defect this guard exists for',
)

require_(
  !/addEventListener\(\s*'load'\s*,\s*boot\b/.test(client),
  CLIENT,
  'the load event does not boot the SDK directly',
  'that is the 5 August 2026 shape whose cost was measured at 217.8 KB and 644 ms inside the LCP window',
)

require_(
  /function hold\([\s\S]{0,600}?boot\('error'\)/.test(client),
  CLIENT,
  'a held error boots the SDK at once',
  'the whole safety argument for deferring is that nothing is lost, and an error held in a page the visitor then closes IS lost',
)

// ---------------------------------------------------------------------------
// The Replay arming in sentry-client-boot.ts
// ---------------------------------------------------------------------------

require_(
  !/requestIdleCallback/.test(boot),
  BOOT,
  'Session Replay is not armed on an idle callback',
  'an idle callback fires during the quiet a device has WHILE the hero is still painting, so it reads as off the critical path and is not: measured at 123.2 KB and 413 ms inside the LCP window',
)

for (const event of INTERACTION_EVENTS) {
  require_(
    boot.includes(`'${event}'`),
    BOOT,
    `arms Replay on ${event}`,
    'close-out P0.5 sets the bar as "costs nothing before first interaction"; a missing signal means some input devices pay the recorder before they have interacted',
  )
}

require_(
  /armSessionReplay\(\s*reason === 'interaction'\s*\)/.test(boot),
  BOOT,
  'Replay records straight away when the SDK itself was booted by an interaction',
  'otherwise the recorder waits for a SECOND interaction and the buffer is empty for longer than the design intends',
)

require_(
  // The CALL, not the import binding: a file can keep the name in a destructure
  // long after it has stopped constructing the integration.
  /replayIntegration\s*\(/.test(replay),
  REPLAY,
  'Session Replay is still wired at all',
  'this guard must not be satisfiable by deleting the capability: the standing rule is that nothing is removed from the platform, only moved off the paint path',
)

// ---------------------------------------------------------------------------

declareWork('sentry-off-the-paint-path', {
  did: { 'source file read': 3, 'scheduling property checked': checks.length },
  found: { 'paint-path fault': failures.length },
})

if (failures.length > 0) {
  console.error('[sentry-off-the-paint-path] FAIL')
  for (const f of failures) {
    console.error(`  ${f.where}: ${f.what}`)
    console.error(`      ${f.why}`)
  }
  console.error('')
  console.error('  The schedule is: earliest of a held error, the first interaction, or')
  console.error('  BOOT_AFTER_LOAD_MS after load. Session Replay never before an interaction.')
  console.error('  Measured cost of getting this wrong: 217.8 KB and 644 ms inside the LCP window.')
  process.exitCode = 1
} else {
  console.log(
    `[sentry-off-the-paint-path] PASS - ${checks.length} scheduling properties hold: the SDK boots on an error, a first interaction or a post-load timer, and the Replay recorder is never fetched before an interaction.`,
  )
}
