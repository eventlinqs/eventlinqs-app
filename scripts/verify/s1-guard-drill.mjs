/**
 * THE S1 GUARD DRILL. Every clause of both guards proven to FAIL against a
 * broken tree and PASS against this one, plus the NEGATIVE cases that prove each
 * narrowing holds.
 *
 * WHY THE NEGATIVES MATTER AS MUCH AS THE POSITIVES. Both guards were genuinely
 * too broad on their first run, and the drill records what they accused:
 *
 *   - statement-descriptor-premise-holds accused src/lib/payments/stripe-adapter.ts,
 *     which can EXPRESS a destination charge but can never ORIGINATE one, because
 *     every on_behalf_of it writes is read straight off its own params.
 *   - one-door-to-the-requirement-watch accused a HEADER COMMENT in
 *     account-health.ts of being a second writer, and accused the property READ
 *     `row.first_seen_at` of being a write.
 *
 * A guard that fires on the read it exists to protect, or on the sentence
 * explaining itself, is a guard somebody switches off inside a week, and then
 * the defect it exists to stop ships again. So each narrowing carries a negative
 * case here asserting it STAYS green, and the drill fails if one ever goes red.
 *
 * Nothing is written to the repository. Each case copies the real file, edits
 * the copy, points the guard at a throwaway tree and puts the original back in a
 * finally.
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const NODE = process.execPath

const GUARDS = {
  premise: 'scripts/guards/statement-descriptor-premise-holds.mjs',
  door: 'scripts/guards/one-door-to-the-requirement-watch.mjs',
}

/**
 * A throwaway copy of exactly what the guards read: src/, the guard itself and
 * the shared work-report helper. Copying src/ whole keeps the drill honest -
 * the guard walks the same 998 files it walks for real, so a clause cannot pass
 * here for the want of a file.
 */
function stagedTree() {
  const dir = mkdtempSync(join(tmpdir(), 's1-drill-'))
  mkdirSync(join(dir, 'scripts', 'guards'), { recursive: true })
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true })
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true })
  cpSync(join(ROOT, 'scripts', 'lib'), join(dir, 'scripts', 'lib'), { recursive: true })
  for (const g of Object.values(GUARDS)) cpSync(join(ROOT, g), join(dir, g))
  return dir
}

function runGuard(dir, guard) {
  const r = spawnSync(NODE, [join(dir, guard)], { cwd: dir, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const results = []
function drill(name, guard, expect, mutate) {
  const dir = stagedTree()
  try {
    mutate(dir)
    const { code, out } = runGuard(dir, guard)
    const red = code !== 0
    const wanted = expect === 'RED'
    const ok = red === wanted
    results.push({ name, expect, got: red ? 'RED' : 'GREEN', ok })
    console.log(`${ok ? '  OK  ' : '  ** '} ${expect.padEnd(5)} expected, ${(red ? 'RED' : 'GREEN').padEnd(5)} got   ${name}`)
    if (!ok) console.log(out.split('\n').filter(l => l.includes('FAIL') || l.includes('    ')).slice(0, 4).join('\n'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const edit = (dir, file, fn) => {
  const p = join(dir, file)
  writeFileSync(p, fn(readFileSync(p, 'utf8')), 'utf8')
}

console.log('')
console.log('S1 GUARD DRILL')
console.log('')
console.log('statement-descriptor-premise-holds')

// Baseline.
drill('the tree as it stands is green', GUARDS.premise, 'GREEN', () => {})

// Clause 1, the premise. A caller supplying on_behalf_of makes the connected
// account's descriptor buyer-facing and falsifies three statements in the tree.
drill(
  'clause 1: a CALLER supplies on_behalf_of',
  GUARDS.premise,
  'RED',
  dir => edit(dir, 'src/lib/payments/create-platform-charge.ts', t =>
    t.replace('transfer_group: input.transferGroup,', 'transfer_group: input.transferGroup,\n    on_behalf_of: connectedAccountId,'),
  ),
)

// NEGATIVE. The gateway pass-through is exactly what the first draft accused,
// and it must stay green: it cannot originate a destination charge.
drill(
  'NEGATIVE clause 1: the gateway passing its own params through stays green',
  GUARDS.premise,
  'GREEN',
  () => {},
)

// And the exemption is checked, not trusted: a gateway that invents one is red.
drill(
  'clause 1b: the gateway sets on_behalf_of from something other than params',
  GUARDS.premise,
  'RED',
  dir => edit(dir, 'src/lib/payments/stripe-adapter.ts', t =>
    t.replace('on_behalf_of: params.on_behalf_of!,', "on_behalf_of: process.env.STRIPE_PLATFORM_ACCOUNT!,"),
  ),
)

// Clause 2, both halves.
drill(
  'clause 2: createExpressAccount stops setting the descriptor prefix',
  GUARDS.premise,
  'RED',
  dir => edit(dir, 'src/lib/stripe/connect.ts', t =>
    t.replace(/statement_descriptor_prefix: connectedDescriptorPrefix\(input\.businessProfile\.name\),/, ''),
  ),
)
drill(
  'clause 2: createExpressAccount stops prefilling business_profile',
  GUARDS.premise,
  'RED',
  dir => edit(dir, 'src/lib/stripe/connect.ts', t =>
    t.replace('business_profile: input.businessProfile,', ''),
  ),
)

// Clause 3. The deleted comparison, returning under its old name.
drill(
  'clause 3: the deleted name comparison returns',
  GUARDS.premise,
  'RED',
  dir => edit(dir, 'src/lib/health/checks.ts', t =>
    `${t}\nexport function businessNameDivergence(a: string, b: string) { return a === b }\n`,
  ),
)

// The premise of clause 1, checked rather than remembered.
drill(
  'the premise check: the charge module stops creating a payment intent',
  GUARDS.premise,
  'RED',
  dir => edit(dir, 'src/lib/payments/create-platform-charge.ts', t =>
    t.replace('input.gateway.createPaymentIntent(', 'input.gateway.somethingElse('),
  ),
)

console.log('')
console.log('one-door-to-the-requirement-watch')

drill('the tree as it stands is green', GUARDS.door, 'GREEN', () => {})

// Clause 1. A second module touching the table in CODE.
drill(
  'clause 1: a second module reads the watch table',
  GUARDS.door,
  'RED',
  dir => edit(dir, 'src/lib/health/checks.ts', t =>
    `${t}\nexport const second = () => 'connect_requirement_watch'\n`,
  ),
)

// NEGATIVE. A header comment naming the table is what the first draft accused.
drill(
  'NEGATIVE clause 1: a COMMENT naming the table stays green',
  GUARDS.door,
  'GREEN',
  dir => edit(dir, 'src/lib/health/checks.ts', t =>
    `${t}\n// the requirement age comes from public.connect_requirement_watch\n`,
  ),
)

// Clause 2. The clock written into a payload.
drill(
  'clause 2: first_seen_at enters an upsert payload',
  GUARDS.door,
  'RED',
  dir => edit(dir, 'src/lib/stripe/requirement-watch.ts', t =>
    t.replace('requirement, last_seen_at: nowIso }', 'requirement, last_seen_at: nowIso, first_seen_at: nowIso }'),
  ),
)

// NEGATIVE. The property read the age is computed from, which the first draft
// accused, must stay green.
drill(
  'NEGATIVE clause 2: the property READ row.first_seen_at stays green',
  GUARDS.door,
  'GREEN',
  dir => edit(dir, 'src/lib/stripe/requirement-watch.ts', t =>
    t.replace(
      'const perAccount = ages.get(row.stripe_account_id) ?? new Map<string, number>()',
      'const perAccount = ages.get(row.stripe_account_id) ?? new Map<string, number>()\n    void row.first_seen_at',
    ),
  ),
)

// Clause 3. A failure that nobody reads, and a failure that nobody reports.
drill(
  'clause 3: the module stops reading its errors',
  GUARDS.door,
  'RED',
  dir => edit(dir, 'src/lib/stripe/requirement-watch.ts', t =>
    t.replace(/const \{ error \} = await/g, 'await').replace(/const \{ data, error \} = await/g, 'const data = await'),
  ),
)
drill(
  'clause 3: the module stops warning about a failed write',
  GUARDS.door,
  'RED',
  dir => edit(dir, 'src/lib/stripe/requirement-watch.ts', t => t.replace(/console\.warn\(/g, 'noop(')),
)

// The guard must also notice when it is judging nothing at all.
drill(
  'the door disappears, so the guard says it is judging nothing',
  GUARDS.door,
  'RED',
  dir => edit(dir, 'src/lib/stripe/requirement-watch.ts', t => t.replace(/connect_requirement_watch/g, 'somewhere_else')),
)

console.log('')
const bad = results.filter(r => !r.ok)
const red = results.filter(r => r.expect === 'RED').length
const green = results.filter(r => r.expect === 'GREEN').length
console.log(`${results.length} drills: ${red} expected RED, ${green} expected GREEN (the narrowings), ${bad.length} behaved wrongly.`)
if (bad.length > 0) {
  for (const b of bad) console.log(`  ** ${b.name}: expected ${b.expect}, got ${b.got}`)
  console.log('')
  console.log('A guard that does not fail against a broken tree is not a guard.')
  process.exitCode = 1
} else {
  console.log('Every clause fails against the break it exists to stop, and every narrowing stays green.')
}
