/**
 * THE LB-ORVALUE DRIVE, RUN AGAINST THE DEFECTS IT EXISTS TO CATCH.
 *
 * A drive that has only ever been seen green proves the screens render, not
 * that the drive can tell a right screen from a wrong one. This puts both
 * defects back, runs the same drive against the same running server, and
 * requires the NAMED checks to fail. It then restores from a byte snapshot
 * taken before the mutation and verifies the restore is byte-identical.
 *
 * THE TWO, exactly as they stood on 19 September 2026 before this item:
 *
 *   1. the fee-override picker dropped the typed term straight into the or()
 *      filter, so a comma answered PGRST100 and the route answered 500
 *   2. the founding-terms search replaced `,()` with spaces, which neither
 *      errors nor matches: "Rock, Paper" was looked for as "Rock  Paper"
 *
 * The second is the one worth watching: it returns 200 the whole time. Only the
 * check that the ROW IS THERE can tell the difference, which is why a drive that
 * asserted status codes alone would have passed over it.
 *
 * Usage, with the server already up on 3100:
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/lb-orvalue-drive-red.mjs --out C:/dev/EVIDENCE/LB-ORVALUE
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const TARGETS = 'src/app/admin/(authed)/pricing/targets/route.ts'
const NETWORK = 'src/app/admin/(authed)/network/page.tsx'

const MUTATIONS = [
  {
    file: TARGETS,
    find: ".or(ilikeAnyOf(['title', 'slug'], q))",
    replace: '.or(`title.ilike.${term},slug.ilike.${term}`)',
  },
  {
    file: NETWORK,
    find: "termQuery = termQuery.or(ilikeAnyOf(['name', 'slug'], foundingQuery))",
    replace:
      "const safe = foundingQuery.replace(/[,()]/g, ' ').trim()\n" +
      '    termQuery = termQuery.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)',
  },
]

/** Every check id that MUST fail once the defects are back. */
const MUST_FAIL = [
  'a-comma-search-answers-200-not-500',
  'the-fee-override-picker-finds-a-comma-titled-event',
  'the-founding-terms-search-finds-a-comma-named-organisation',
]

const snapshots = new Map()
const problems = []

function mutate() {
  for (const m of MUTATIONS) {
    if (!snapshots.has(m.file)) snapshots.set(m.file, readFileSync(m.file))
    const text = readFileSync(m.file, 'utf8')
    if (!text.includes(m.find)) {
      problems.push(`STALE: the anchor for ${m.file} is gone: ${m.find.slice(0, 60)}`)
      continue
    }
    writeFileSync(m.file, text.replace(m.find, m.replace))
  }
}

function restore() {
  for (const [file, bytes] of snapshots) {
    writeFileSync(file, bytes)
    if (Buffer.compare(bytes, readFileSync(file)) !== 0) {
      problems.push(`RESTORE FAILED for ${file}. The tree is dirty and must be checked by hand.`)
    }
  }
}

function runDrive(outDir) {
  try {
    return execFileSync(
      'node',
      ['--env-file=.env.local', 'scripts/verify/lb-orvalue-drive.mjs', '--out', outDir],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, BASE: process.env.BASE ?? 'http://localhost:3100' },
        maxBuffer: 32 * 1024 * 1024,
      },
    )
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
}

console.log('=== LB-ORVALUE: the drive, run red ===\n')

let output = ''
try {
  mutate()
  if (problems.length > 0) throw new Error(problems.join(' | '))
  console.log('  both defects restored; waiting for the dev server to recompile')
  await new Promise(r => setTimeout(r, 4000))
  for (const path of ['/admin/login', '/admin/pricing', '/admin/network']) {
    await fetch(`${process.env.BASE ?? 'http://localhost:3100'}${path}`, { redirect: 'manual' }).catch(() => {})
  }
  output = runDrive(join(out, 'red'))
} finally {
  restore()
}

writeFileSync(join(out, 'red-run.txt'), output)

const lines = output.split(String.fromCharCode(10))
const verdictOf = fragment => {
  const found = lines.filter(l => l.includes(fragment))
  if (found.length === 0) return 'ABSENT'
  return found.every(l => l.trimStart().startsWith('FAIL')) ? 'FAILED' : 'STILL PASSED'
}

let fired = 0
for (const fragment of MUST_FAIL) {
  const verdict = verdictOf(fragment)
  if (verdict === 'FAILED') fired += 1
  else problems.push(`${fragment}: ${verdict} with the defect in place`)
  console.log(`  ${verdict.padEnd(14)}${fragment}`)
}

for (const fragment of ['orvalue.setup.both-fixtures-carry-a-comma', 'orvalue.teardown.left-as-found']) {
  const ok = lines.some(l => l.trimStart().startsWith('PASS') && l.includes(fragment))
  if (!ok) problems.push(`${fragment} did not pass during the red run`)
  console.log(`  ${(ok ? 'PASS' : 'NOT PASSED').padEnd(14)}${fragment}`)
}

console.log('')
console.log(`=== ${fired}/${MUST_FAIL.length} checks failed as they must ===`)

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`  PROBLEM: ${p}`)
  process.exit(1)
}
console.log('\nEvery named check failed against the defects and the tree is byte-identical.')
