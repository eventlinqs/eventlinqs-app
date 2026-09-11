/**
 * Drills `push-arming-cannot-fail-silently` RED on every clause and GREEN again
 * after every restore, including its premise check and the false positive that
 * the first draft actually produced.
 *
 * THE NEGATIVE DRILLS MATTER MOST HERE. The first version of clause 4 matched
 * any `.register(` and accused four innocent lines: `store.register()` in a
 * React context and three COMMENTS mentioning `instrumentation.register()`. A
 * guard that fails the build on a comment is a guard somebody switches off
 * within a week, and then the defect it exists to stop ships again. So the
 * narrowing is PROVED to hold, not asserted.
 *
 * Usage: node scripts/verify/ux3-push-guard-drills.mjs [outDir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'C:/dev/EVIDENCE/UX3'
mkdirSync(OUT, { recursive: true })

const GUARD = 'scripts/guards/push-arming-cannot-fail-silently.mjs'
const HOOK = 'src/components/notifications/use-push-subscription.ts'
const SCANNER = 'src/components/features/scanner/scanner.tsx'
const ADMIN_SURFACE = 'src/app/admin/(authed)/notifications/backup-alerts.tsx'
const ATTENDEE_SURFACE = 'src/components/notifications/enable-alerts.tsx'
const PUSH_WORKER = 'public/push-sw.js'
/** An unrelated client file, used to prove clause 4 does not fire on prose. */
const INNOCENT = 'src/contexts/hero-presence-context.tsx'

const run = () => {
  const r = spawnSync(process.execPath, [GUARD], { encoding: 'utf8', env: process.env })
  return { code: r.status, text: ((r.stdout ?? '') + (r.stderr ?? '')).trim() }
}

const drills = [
  {
    clause: 2,
    name: 'the activation wait is deleted, which is the defect that shipped and made every FIRST arming fail',
    file: HOOK,
    expect: 1,
    break: (t) =>
      t.replace(
        "await withActiveWorker(await navigator.serviceWorker.register('/push-sw.js'))",
        "await navigator.serviceWorker.register('/push-sw.js')",
      ),
  },
  {
    clause: 3,
    name: "the wait stops settling on 'redundant', so a worker that never activates hangs the button for ever",
    file: HOOK,
    expect: 1,
    break: (t) => t.replace(/'redundant'/g, "'REMOVED-STATE'"),
  },
  {
    clause: 3,
    name: "the wait stops settling on 'activated'",
    file: HOOK,
    expect: 1,
    break: (t) => t.replace(/pending\.state === 'activated'/, "pending.state === 'REMOVED-STATE'"),
  },
  {
    clause: 2,
    name: 'a failed press is reported as idle again, which is the state an unpressed control shows',
    file: HOOK,
    expect: 1,
    break: (t) => t.replace(/setStatus\('error'\)/g, "setStatus('idle')"),
  },
  {
    clause: 1,
    name: 'a SECOND module learns to subscribe, so the race can be reintroduced in a place nobody is watching',
    file: ATTENDEE_SURFACE,
    expect: 1,
    break: (t) =>
      t.replace(
        "import { usePushSubscription } from './use-push-subscription'",
        "import { usePushSubscription } from './use-push-subscription'\n// eslint-disable-next-line\nconst second = async (r) => r.pushManager.subscribe({ userVisibleOnly: true })",
      ),
  },
  {
    clause: 4,
    name: 'the door scanner loses its scope and takes / , silently replacing the push registration',
    file: SCANNER,
    expect: 1,
    break: (t) =>
      t.replace('.register(DOOR_SERVICE_WORKER_URL, { scope: DOOR_SERVICE_WORKER_SCOPE })', '.register(DOOR_SERVICE_WORKER_URL)'),
  },
  {
    clause: 5,
    name: 'the admin surface stops showing why an arming failed',
    file: ADMIN_SURFACE,
    expect: 1,
    break: (t) => t.replace(/status === 'error'/g, "status === 'REMOVED'"),
  },
  {
    clause: 5,
    name: 'the attendee surface stops showing why an arming failed',
    file: ATTENDEE_SURFACE,
    expect: 1,
    break: (t) => t.replace(/status === 'error'/g, "status === 'REMOVED'"),
  },
  {
    clause: 'premise',
    name: 'the push service worker stops handling a push event, so clause 4 would be guarding nothing',
    file: PUSH_WORKER,
    expect: 1,
    break: (t) => t.replace("self.addEventListener('push'", "self.addEventListener('notpush'"),
  },
  {
    /*
     * NEGATIVE. `store.register()` is a subscription store, not a service
     * worker. The first draft of clause 4 failed the build on this exact line.
     */
    clause: 4,
    name: 'NEGATIVE: a non-service-worker register() call must not fail the build',
    file: INNOCENT,
    expect: 0,
    break: (t) => t.replace('store.register()', 'store.register() // a second mention of register(...)'),
  },
  {
    /*
     * NEGATIVE. A COMMENT naming a service-worker registration is documentation.
     * Three comments in this tree mention `instrumentation.register()` and the
     * first draft accused all three.
     */
    clause: 4,
    name: 'NEGATIVE: a comment describing a registration must not fail the build',
    file: INNOCENT,
    expect: 0,
    break: (t) => `// navigator.serviceWorker.register('/some-worker.js') is described here, not called.\n${t}`,
  },
]

const lines = ['THE PUSH-ARMING GUARD, DRILLED BOTH WAYS', '='.repeat(41), '']
let ok = true

const green = run()
lines.push(`BASELINE ${GUARD}  exit ${green.code}`, ...green.text.split('\n').map((l) => `    ${l}`), '')
if (green.code !== 0) ok = false

for (const drill of drills) {
  const original = readFileSync(drill.file, 'utf8')
  const broken = drill.break(original)
  if (broken === original) {
    lines.push(`DRILL clause ${drill.clause} :: ${drill.name}: THE BREAK DID NOTHING, so nothing was proved.`, '')
    ok = false
    continue
  }
  writeFileSync(drill.file, broken)
  const red = run()
  writeFileSync(drill.file, original)
  const back = run()
  const verdict =
    drill.expect === 1
      ? red.code === 1
        ? 'RED, as required'
        : 'DID NOT FAIL'
      : red.code === 0
        ? 'STAYED GREEN, as required'
        : 'FIRED ON AN INNOCENT LINE, which is the false positive this drill exists to stop'
  lines.push(
    `DRILL clause ${drill.clause}  (expect exit ${drill.expect})`,
    `  ${drill.name}`,
    `  mutated  exit ${red.code}   ${verdict}`,
    ...red.text.split('\n').map((l) => `      ${l}`),
    `  restored exit ${back.code}  ${back.code === 0 ? 'GREEN again' : 'STILL RED'}`,
    '',
  )
  if (red.code !== drill.expect || back.code !== 0) ok = false
}

lines.push(ok ? `ALL ${drills.length} DRILLS BEHAVED AS REQUIRED.` : 'A DRILL DID NOT BEHAVE. See above.')
const text = lines.join('\n') + '\n'
writeFileSync(join(OUT, 'ux3-push-guard-drill.txt'), text)
console.log(text)
process.exit(ok ? 0 : 1)
