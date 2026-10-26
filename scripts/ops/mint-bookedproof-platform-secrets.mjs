/**
 * THE FOUR SCOPE SECRETS OF BOOKEDPROOF'S PLATFORM READ IN ONE COMMAND
 * (trial gate T3; LAW 10, script the founder's step).
 *
 * Runs scripts/ops/mint-bookedproof-connector-secret.mjs once per scope
 * (organisations, events, buyers, ledger), each with its own --name and its own
 * handoff file in --handoff-dir, so each scope keeps its own secret as the
 * project manager ruled (26 October 2026, 22:45 (3)). On production the founder
 * types APPLY ONCE here; this hands that same typed word to each run's own
 * prompt on its standard input, so every run still refuses unless APPLY was
 * typed, and nothing in the script it calls is loosened.
 *
 * Usage (PowerShell, logged in to the Vercel CLI):
 *   node scripts/ops/mint-bookedproof-platform-secrets.mjs --scope preview
 *       (dry run of all four)
 *   node scripts/ops/mint-bookedproof-platform-secrets.mjs --scope production --apply --handoff-dir C:\dev\EVIDENCE\WI1\secrets
 *   node scripts/ops/mint-bookedproof-platform-secrets.mjs --prove https://www.eventlinqs.com.au --handoff-dir C:\dev\EVIDENCE\WI1\secrets --scope production
 *
 * It stops at the first run that does not exit 0, and says which.
 */
import { spawnSync } from 'node:child_process'
import { readSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ONE = join(HERE, 'mint-bookedproof-connector-secret.mjs')
const SCOPES = ['organisations', 'events', 'buyers', 'ledger']

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const SCOPE = opt('--scope') ?? 'preview'
const APPLY = flag('--apply')
const ROTATE = flag('--rotate')
const PROVE = opt('--prove')
const DIR = opt('--handoff-dir') ? resolve(opt('--handoff-dir')) : null

function fail(msg) {
  console.error(`REFUSED: ${msg}`)
  process.exit(2)
}

if (!['preview', 'production'].includes(SCOPE)) fail(`--scope must be preview or production, not ${SCOPE}.`)
if ((APPLY || PROVE) && !DIR) fail('--apply and --prove need --handoff-dir <folder outside any checkout>.')

/** One line from the terminal, read synchronously, as the script it calls reads its own. */
function askLine(question) {
  process.stdout.write(question)
  const buf = Buffer.alloc(256)
  let line = ''
  for (;;) {
    let n = 0
    try {
      n = readSync(0, buf, 0, buf.length, null)
    } catch {
      return line
    }
    if (n <= 0) return line
    line += buf.subarray(0, n).toString('utf8')
    if (line.includes('\n')) return line.split(/\r?\n/)[0]
  }
}

let typed = null
if (APPLY && SCOPE === 'production' && !PROVE) {
  console.log('PRODUCTION. This switches on Bookedproof\'s read only read of EventLinqs on the live site, all four scopes (trial gate T3).')
  typed = askLine('Type APPLY to store all four on production: ').trim()
  if (typed !== 'APPLY') fail('not applied: APPLY was not typed.')
}

for (const scope of SCOPES) {
  const name = `BOOKEDPROOF_PLATFORM_SECRET_${scope.toUpperCase()}`
  const handoff = DIR ? join(DIR, `bookedproof-platform-${scope}.${SCOPE}`) : null
  const runArgs = [ONE, '--name', name, '--scope', SCOPE]
  if (PROVE) runArgs.push('--prove', PROVE)
  if (APPLY && !PROVE) runArgs.push('--apply')
  if (ROTATE) runArgs.push('--rotate')
  if (handoff) runArgs.push('--handoff', handoff)
  console.log(`\n===== ${scope} =====`)
  const r = spawnSync(process.execPath, runArgs, {
    stdio: [typed ? 'pipe' : 'inherit', 'inherit', 'inherit'],
    input: typed ? `${typed}\n` : undefined,
    windowsHide: true,
  })
  if (r.status !== 0) fail(`the ${scope} run exited ${r.status}; the scopes after it were not run.`)
}
console.log(`\nall four scopes done on ${SCOPE}${PROVE ? ', each proved' : APPLY ? ', each stored and handed over' : ' (dry run)'}.`)
