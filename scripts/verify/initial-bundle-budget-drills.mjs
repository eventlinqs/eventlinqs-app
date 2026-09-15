/**
 * THE --built DRILLS FOR scripts/guards/initial-bundle-budget.mjs.
 *
 * ============================================================================
 * WHY THESE ARE NOT IN THE MAIN DRILL HARNESS
 * ============================================================================
 *
 * `scripts/verify/guard-failure-drills.mjs` runs every guard as
 * `node <guard>` with no arguments, which is the right shape for a harness that
 * runs on every push. Three of that harness's drills cover this guard's
 * CONTRACT half. The clauses below only exist in `--built` mode, which needs a
 * finished `next build` to weigh, and a drill that costs a five minute build
 * cannot live in a harness that must stay cheap.
 *
 * So they live here, run by hand against a real build, and the output is kept
 * as evidence. Each one plants a real regression, runs the guard, expects a
 * named failure, and restores the file whatever happens.
 *
 *     node scripts/verify/initial-bundle-budget-drills.mjs
 *
 * A green run of the guard is asserted FIRST and LAST, so a drill that left the
 * tree mutated cannot be mistaken for a clean pass.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const GUARD = join(ROOT, 'scripts', 'guards', 'initial-bundle-budget.mjs')
const BUDGET = join(ROOT, 'perf-budget.json')
const ATTRIBUTION = join(ROOT, 'scripts', 'perf', 'lib', 'chunk-attribution.mjs')
const AUDIENCE = join(ROOT, 'scripts', 'perf', 'lib', 'route-audience.mjs')

function runGuard() {
  const r = spawnSync(process.execPath, [GUARD, '--built'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** Edit a JSON file through a function, returning the original text. */
function mutateJson(path, fn) {
  const original = readFileSync(path, 'utf8')
  const parsed = JSON.parse(original)
  fn(parsed)
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
  return original
}

function mutateText(path, find, replace) {
  const original = readFileSync(path, 'utf8')
  if (!original.includes(find)) return { original, stale: true }
  writeFileSync(path, original.replace(find, replace))
  return { original, stale: false }
}

const DRILLS = [
  {
    name: 'B1 the ratchet: a route grows past its recorded mark',
    expect: 'may only ever go down',
    plant: () => mutateJson(BUDGET, (b) => { b.marks['/events'] = 1000 }),
  },
  {
    name: 'B2 coverage: a route in the build has no mark',
    expect: 'has no mark in perf-budget.json',
    plant: () => mutateJson(BUDGET, (b) => { delete b.marks['/events'] }),
  },
  {
    name: 'B3 coverage: a mark names a route the build does not emit',
    expect: 'which this build does not emit',
    plant: () => mutateJson(BUDGET, (b) => { b.marks['/a-route-that-was-deleted'] = 123456 }),
  },
  {
    name: 'B4 the Scope budget: a public route over it loses its register entry',
    expect: 'not in the overBudget register',
    plant: () => mutateJson(BUDGET, (b) => { delete b.overBudget['/events/[slug]'] }),
  },
  {
    name: 'B5 the register: an entry stops saying why',
    expect: 'An undated or unexplained exception',
    plant: () => mutateJson(BUDGET, (b) => { delete b.overBudget['/events/[slug]'].why }),
  },
  {
    name: 'B6 the register cannot outlive the defect: an entry for a route that is under budget',
    expect: 'The debt is paid; delete the entry',
    plant: () => mutateJson(BUDGET, (b) => { b.overBudget['/help'] = { since: '2026-09-15', why: 'x', fix: 'y' } }),
  },
  {
    name: 'B7 a marker declared always present goes dead',
    expect: 'is declared always present and matched no chunk',
    plant: () => mutateText(ATTRIBUTION, 'test: /__reactContainer|onRecoverableError/,', 'test: /__aMarkerThatMatchesNothingAtAll__/,'),
    path: ATTRIBUTION,
  },
  {
    name: 'B8 the two readings of internal disagree',
    expect: 'but the indexing policy calls it',
    plant: () => mutateText(AUDIENCE, "export const INTERNAL_PREFIXES = ['/dashboard', '/admin']", "export const INTERNAL_PREFIXES = ['/dashboard', '/admin', '/events']"),
    path: AUDIENCE,
  },
]

function restore(path, original) {
  writeFileSync(path, original)
}

console.log('\n=== initial-bundle-budget: the --built drills ===\n')

const first = runGuard()
if (first.code !== 0) {
  console.error('REFUSING TO DRILL: the guard is already red on this tree, so no drill below could be read as proof.')
  console.error(first.out.split('\n').filter((l) => l.includes('FAIL')).join('\n'))
  process.exit(1)
}
console.log('  GREEN  the guard passes on the tree as it stands, so every red below is the drill\n')

let passed = 0
const failed = []
for (const drill of DRILLS) {
  const path = drill.path ?? BUDGET
  let original = null
  try {
    const planted = drill.plant()
    original = typeof planted === 'string' ? planted : planted.original
    if (typeof planted === 'object' && planted.stale) {
      failed.push(`${drill.name}: the anchor was not found. The drill is stale.`)
      console.log(`  STALE  ${drill.name}`)
      continue
    }
    const { code, out } = runGuard()
    const named = out.includes(drill.expect)
    if (code !== 0 && named) {
      passed += 1
      const line = out.split('\n').find((l) => l.includes(drill.expect)) ?? ''
      console.log(`  FAILS AS EXPECTED  ${drill.name}`)
      console.log(`      ${line.trim().slice(0, 190)}`)
    } else if (code === 0) {
      failed.push(`${drill.name}: the guard PASSED with the regression planted.`)
      console.log(`  NOT CAUGHT  ${drill.name}`)
    } else {
      failed.push(`${drill.name}: the guard failed but never said "${drill.expect}".`)
      console.log(`  WRONG REASON  ${drill.name}`)
    }
  } finally {
    if (original !== null) restore(path, original)
  }
}

const last = runGuard()
console.log('')
if (last.code !== 0) {
  failed.push('the tree did not restore clean: the guard is red after the drills.')
  console.log('  NOT RESTORED  the guard is red after the drills')
} else {
  console.log('  GREEN  the guard passes again on the restored tree')
}

console.log(`\n${passed} of ${DRILLS.length} drill(s) fired correctly.`)
for (const f of failed) console.log(`  FAULT ${f}`)
process.exit(failed.length ? 1 : 0)
