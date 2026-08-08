/**
 * PAYMENT-CRITICAL DOCTRINE. The guard that makes the flag mean something.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. `paymentCritical` was a boolean on ten manifest entries with
 * exactly ONE consumer:
 *
 *     scripts/generate-env-state.mjs:98:  payment: e.paymentCritical ? 'YES' : 'no',
 *
 * A column in a generated document. No guard read it, so no variable was
 * treated differently for carrying it. Founder ruling 2026-08-08: "A
 * classification with one display consumer and no guard is reassurance without
 * a control. Either make it mean something or remove it."
 *
 * THE DOCTRINE, as ruled. A variable marked paymentCritical must:
 *
 *   (a) exist on production;
 *   (b) be sensitive where the platform allows it;
 *   (c) be covered by the runtime sentinel, so its absence or malformation
 *       alerts within one cycle;
 *   (d) appear in the rotation runbook with a verification command.
 *
 * ON CLAUSE (b) AND PUBLIC VARIABLES. Three of the ten are `NEXT_PUBLIC_`,
 * baked into the browser bundle at build time. The platform does not merely
 * decline to mark those sensitive: it CANNOT, because the value is served to
 * every visitor by design. That is precisely what "where the platform allows
 * it" excludes, so a public variable satisfies (b) by being correctly declared
 * public. This is the ruling's own clause, not a weakening of it: any other
 * reading would make the rule unsatisfiable for a variable that must be public.
 *
 * Everything else is enforced exactly as written. Where a variable cannot meet
 * the bar, this reports WHICH and WHY rather than lowering it.
 *
 * Usage: node scripts/verify/payment-critical-doctrine.mjs
 * Exit 1 on any clause unmet.
 */
import { readFileSync, existsSync } from 'node:fs'
import { ENV_MANIFEST } from '../../src/lib/env/manifest.mjs'
import { CRITICAL_ENV_RULES } from '../../src/lib/health/critical-env.mjs'

const ROTATION_DOC = 'docs/security/CREDENTIAL-ROTATION.md'

/**
 * Clauses DEFERRED by an explicit founder decision, with the reason on record.
 *
 * This is not a suppression list and it is not a way to make the guard quiet.
 * It is the same distinction `FLAG_INTENT` draws in reach-integrity: an
 * unresolved gap and a decided deferral look identical from outside, and only
 * one of them needs somebody to do something. A deferral without a recorded
 * reason is just an unresolved gap wearing a better name, so an entry here
 * REQUIRES a reason and the reason is printed every run.
 *
 * Removing an entry is how a deferral is revisited: the clause goes red again.
 */
const DEFERRED = {
  'UPSTASH_REDIS_REST_URL:b': {
    why: 'founder ruling 2026-08-08: "leave it. Flipping mustBeSensitive forces the Vercel record to be recreated as Sensitive, and I am not making unrelated production store changes while a live exposure is being fixed." The value is an endpoint address rather than a credential (the TOKEN beside it is the secret and IS declared sensitive), so the exposure from leaving it readable is that an attacker learns WHICH Upstash instance, not how to reach it. Revisit when the security work lands and a production store change is cheap again',
  },
}

const marked = ENV_MANIFEST.filter((e) => e.paymentCritical)

/**
 * Does the runtime sentinel cover this variable?
 *
 * NOT a name match. A sentinel rule may read a DIFFERENT variable than its own
 * name through `resolve`: the `STRIPE_WEBHOOK_SECRET` rule resolves
 * `STRIPE_WEBHOOK_SECRETS` first, because the platform runs two Stripe
 * endpoints with one secret each. Matching names literally reported that as
 * uncovered when it is covered, which is a guard crying wolf on its first run.
 *
 * So the question is asked BEHAVIOURALLY: hand the rule an environment where
 * only this variable is set, and see whether the rule reads it.
 */
function sentinelCovers(name) {
  for (const rule of CRITICAL_ENV_RULES) {
    if (rule.name === name) return rule
    if (typeof rule.resolve === 'function') {
      try {
        if (rule.resolve({ [name]: '__PROBE__' }) === '__PROBE__') return rule
      } catch {
        /* a resolve that throws on a sparse env simply does not cover it */
      }
    }
  }
  return null
}

const rotation = existsSync(ROTATION_DOC) ? readFileSync(ROTATION_DOC, 'utf8') : ''
/**
 * A rotation-matrix row for `name` with a non-empty final "Verify with" cell.
 * The row shape is: | `NAME` | issued at | stores | order | verify |
 */
function rotationRow(name) {
  for (const line of rotation.split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    if (cells[1] !== `\`${name}\``) continue
    const verify = cells[cells.length - 2] ?? ''
    return { found: true, verify }
  }
  return { found: false, verify: '' }
}

console.log('PAYMENT-CRITICAL DOCTRINE')
console.log(`${marked.length} variable(s) carry paymentCritical`)
console.log(`sentinel declares ${CRITICAL_ENV_RULES.length} rule(s); rotation matrix read from ${ROTATION_DOC}\n`)

const rows = []
for (const e of marked) {
  const a = e.requiredOn.includes('production')
  const bApplies = !e.publicVar
  const b = bApplies ? e.mustBeSensitive === true : true
  const coveredBy = sentinelCovers(e.name)
  const c = coveredBy !== null
  const rot = rotationRow(e.name)
  const d = rot.found && rot.verify.length > 0

  rows.push({ name: e.name, a, b, c, d, bApplies, publicVar: e.publicVar, rot, coveredBy })
}

const F = (ok) => (ok ? ' ok ' : 'FAIL')
console.log('  variable                              (a)prod (b)sens (c)sentinel (d)rotation')
console.log('  ' + '-'.repeat(78))
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(36)}  ${F(r.a)}    ${DEFERRED[`${r.name}:b`] ? 'defr' : F(r.b)}${r.bApplies ? '   ' : '*  '}  ${F(r.c)}       ${F(r.d)}`,
  )
}
console.log('\n  * clause (b) does not apply: the variable is public by declaration, so the')
console.log('    platform cannot hold it sensitive. That is the ruling\'s own "where the')
console.log('    platform allows it" clause.\n')

const failures = []
const deferred = []
const raise = (name, clause, why) => {
  const entry = DEFERRED[`${name}:${clause}`]
  if (entry) deferred.push({ name, clause, why: entry.why })
  else failures.push({ name, clause, why })
}
for (const r of rows) {
  if (!r.a) raise(r.name, 'a', 'not required on production')
  if (!r.b) {
    raise(r.name, 'b', 'not declared mustBeSensitive, and it is not a public variable, so the platform WOULD allow it')
  }
  if (!r.c) {
    raise(
      r.name,
      'c',
      'absent from CRITICAL_ENV_RULES, so neither the build guard nor the runtime sentinel would notice it missing or malformed. Its absence alerts nobody',
    )
  }
  if (!r.d) {
    raise(
      r.name,
      'd',
      r.rot.found
        ? 'has a rotation row but no verification command in it'
        : `has no row in the ${ROTATION_DOC} rotation matrix, so there is no recorded way to rotate it or to prove the rotation worked`,
    )
  }
}

if (deferred.length) {
  console.log(`${deferred.length} clause(s) DEFERRED by founder decision, with the reason on record:\n`)
  for (const d of deferred) {
    console.log(`  ${d.name} (${d.clause})`)
    for (const line of d.why.match(/.{1,74}(\s|$)/g) ?? []) console.log(`    ${line.trim()}`)
    console.log('')
  }
  console.log('  A deferral is a decision, so it does not fail this guard. Removing the entry')
  console.log('  from DEFERRED is how it is revisited: the clause goes red again.\n')
}

if (failures.length) {
  console.log(`===== ${failures.length} CLAUSE(S) UNMET =====\n`)
  const byVar = new Map()
  for (const f of failures) byVar.set(f.name, [...(byVar.get(f.name) ?? []), f])
  for (const [name, list] of byVar) {
    console.log(`  ${name}`)
    for (const f of list) console.log(`    (${f.clause}) ${f.why}`)
  }
  console.log('')
  console.log('Each of these is a variable the manifest says a payment depends on, and which')
  console.log('one of the four controls does not actually cover. Fix the coverage or remove')
  console.log('the classification. Do not lower the bar.')
} else {
  console.log('===== ALL GREEN =====')
  console.log('Every payment-critical variable exists on production, is sensitive where the')
  console.log('platform allows, alerts through the runtime sentinel, and has a rotation')
  console.log('procedure with a verification command.')
}
process.exit(failures.length ? 1 : 0)
