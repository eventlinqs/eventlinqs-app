/**
 * Drills `gate-servers-carry-a-limiter` RED on every clause and GREEN again
 * after every restore, and writes the transcript to the evidence path so both
 * directions are on the record rather than asserted.
 *
 * A guard nobody has watched fail is a guard nobody has tested. This one exists
 * because the gate accused the product of six defects that were its own missing
 * Redis, so "it passes" is the least interesting thing that can be said about
 * it.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'C:/dev/EVIDENCE/D1'
mkdirSync(OUT, { recursive: true })

const GUARD = 'scripts/guards/gate-servers-carry-a-limiter.mjs'
const GATE = 'scripts/ops/pre-push-gate.mjs'
const POLICIES = 'src/lib/rate-limit/policies.ts'
const STUB = 'scripts/verify/upstash-local-stub.mjs'

const run = () => {
  const r = spawnSync(process.execPath, [GUARD], { encoding: 'utf8', env: process.env })
  return { code: r.status, text: ((r.stdout ?? '') + (r.stderr ?? '')).trim() }
}

const drills = [
  {
    name: 'a step serves the build outside the one door',
    file: GATE,
    break: (t) =>
      t.replace(
        "  const started = await startGateServer(env, CHECKOUT_LOG)",
        "  const server = spawn(NODE, ['node_modules/next/dist/bin/next', 'start', '--port', '9999'], { cwd: ROOT, env })\n" +
          '  const started = await startGateServer(env, CHECKOUT_LOG)',
      ),
  },
  {
    name: 'the one door stops handing the server a limiter URL',
    file: GATE,
    break: (t) => t.replace('      UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${stubPort}`,', ''),
  },
  {
    name: 'the one door stops handing the server a limiter token',
    file: GATE,
    break: (t) => t.replace("      UPSTASH_REDIS_REST_TOKEN: 'local',", ''),
  },
  {
    name: 'the one door stops proving the backend answers',
    file: GATE,
    break: (t) =>
      t
        .replace('  const pong = await pingUpstashStub(stubPort)', '  const pong = null')
        .replace("      if (body?.result === 'PONG') return null", '      if (body) return null'),
  },
  {
    /*
     * LINE ENDINGS, not cleverness. The first version of this drill matched a
     * five-line block with `\n` and the file is CRLF on this machine, so it
     * silently edited nothing and reported "could not break it" - which is the
     * drill working, and is why a drill that cannot break its target counts as
     * a fault rather than a pass.
     */
    name: 'the premise stops being true: the money path goes fail-open',
    file: POLICIES,
    break: (t) => {
      const at = t.indexOf("'checkout-reserve': {")
      if (at === -1) return t
      const flag = t.indexOf('failClosed: true,', at)
      if (flag === -1) return t
      return t.slice(0, flag) + '// removed by the drill' + t.slice(flag + 'failClosed: true,'.length)
    },
  },
  {
    name: 'the stub the door names is gone',
    file: STUB,
    rename: true,
  },
]

const report = []
const say = (s) => {
  report.push(s)
  console.log(s)
}

say('THE GATE-SERVER GUARD, DRILLED BOTH WAYS')
say('========================================')
say('')

const baseline = run()
say(`BASELINE ${GUARD}  exit ${baseline.code}`)
for (const l of baseline.text.split(/\r?\n/)) say(`    ${l}`)
say('')
if (baseline.code !== 0) {
  writeFileSync(join(OUT, 'guard-gate-server-drill.txt'), report.join('\n'), 'utf8')
  console.error('the guard is not green before the drills; nothing was drilled')
  process.exit(1)
}

let failures = 0
for (const d of drills) {
  say(`DRILL  ${d.name}`)
  const path = d.file
  let original = null
  let moved = null
  if (d.rename) {
    moved = `${path}.drill-moved`
    renameSync(path, moved)
  } else {
    original = readFileSync(path, 'utf8')
    const broken = d.break(original)
    if (broken === original) {
      say('  COULD NOT BREAK IT: the text this drill edits is not there any more. That is a FAULT in the drill.')
      failures += 1
      say('')
      continue
    }
    writeFileSync(path, broken, 'utf8')
  }

  const red = run()
  say(`  broken   exit ${red.code}   ${red.code === 0 ? 'STILL GREEN, which is a hole' : 'RED, as required'}`)
  for (const l of red.text.split(/\r?\n/)) say(`      ${l}`)
  if (red.code === 0) failures += 1

  if (d.rename && moved && existsSync(moved)) renameSync(moved, path)
  else if (original !== null) writeFileSync(path, original, 'utf8')

  const green = run()
  say(`  restored exit ${green.code}  ${green.code === 0 ? 'GREEN again' : 'STILL RED, which is worse'}`)
  if (green.code !== 0) {
    failures += 1
    for (const l of green.text.split(/\r?\n/)) say(`      ${l}`)
  }
  say('')
}

say(failures === 0 ? `ALL ${drills.length} CLAUSES DRILLED RED AND GREEN.` : `${failures} DRILL FAULT(S).`)
writeFileSync(join(OUT, 'guard-gate-server-drill.txt'), report.join('\n'), 'utf8')
process.exit(failures === 0 ? 0 : 1)
