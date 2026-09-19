/**
 * GUARD: THE GROUP RATE IS DERIVED AND NOT SHOWN UNTIL IT IS SPENT, AND EVERY
 * TICKET CAN BE SHARED.
 *
 * Close-out AQ2. Five clauses, each one a sentence of the item made
 * unskippable.
 *
 *   1. THE FLOOR IS DERIVED FROM THE FEE, NEVER TYPED. The constitution's fee
 *      doctrine allows exactly one source, public.pricing_rules, and a floor
 *      typed into a migration is a second copy of the fee that stops agreeing
 *      with the first the day the founder changes it in /admin/pricing. Both
 *      halves of the derivation have to reach the resolver.
 *
 *   2. THE CURRENCY TO COUNTRY MAP AGREES IN ALL THREE PLACES. The pricing
 *      country comes from the CURRENCY, in payment-calculator.ts, in the AQ2
 *      trigger, and in the pricing module. Three copies of one decision, and
 *      the day they disagree the database refuses prices the checkout would
 *      happily charge. This is the clause most likely to rot, because adding a
 *      currency looks like a one-line change.
 *
 *   3. EVERY TICKET SURFACE CARRIES A TRACKED SHARE LINK. AQ2: "Every ticket
 *      carries a tracked share link on the confirmation and on the ticket
 *      page." The ticket page had none, which meant the surface a buyer keeps
 *      open, and opens again at the door, was the one that asked nothing.
 *
 *   4. THE COEFFICIENT IS COMPUTED FROM WHAT CAN BE PROVED. A share link with
 *      no `created_by` might be a guest buyer or might be the organiser's own.
 *      Folding those into the coefficient would inflate the one number a
 *      decision to invest in referral is made from, so the numerator is the
 *      known-buyer count and the looser figure is offered separately.
 *
 *   5. THE GROUP RATE IS NOT SHOWN TO ANYBODY UNTIL SOMETHING CHARGES IT.
 *      This one RELEASES ITSELF and is the most useful clause here. The rate,
 *      its floor and its refusal are lane B's; the line that spends it lives in
 *      the squad payment step, which is the checkout payment intent and belongs
 *      to another lane under the three-lane protocol. A form that sets a price
 *      nothing charges is a placeholder, and the Definition of Done calls a
 *      placeholder a defect. So: while no payment path reads
 *      public.event_group_rates, no page or component may either. The day that
 *      border change lands, this clause stops applying on its own, with nobody
 *      needing to remember to delete it.
 *
 * IT READS THE REPOSITORY AND NOTHING ELSE, so it runs on the Vercel build host
 * with no database and no credentials.
 *
 * Run standalone:  node scripts/guards/the-group-rate-and-the-sharer-are-honest.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { rendersComponent } from './lib/names-and-calls.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[the-group-rate-and-the-sharer-are-honest]'

const SRC = join(ROOT, 'src')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260919000120_group_rate_and_its_floor.sql')
const CALCULATOR = join(ROOT, 'src', 'lib', 'payments', 'payment-calculator.ts')
const GROUP_RATE = join(ROOT, 'src', 'lib', 'pricing', 'group-rate.ts')
const COEFFICIENT = join(ROOT, 'src', 'lib', 'growth', 'referral-coefficient-math.ts')

/** The two surfaces AQ2 names by name. */
const TICKET_SURFACES = [
  'src/app/orders/[order_id]/confirmation/page.tsx',
  'src/app/t/[code]/page.tsx',
]

/**
 * Where a READ of the group rate means it is being SPENT, against where it
 * means it is being SHOWN. Directory-shaped on purpose: the question is not
 * which file, it is which side of the product a read sits on.
 */
const SPENDS_IT = ['src/app/actions/', 'src/lib/payments/', 'src/app/api/']
const SHOWS_IT = ['src/app/', 'src/components/']

const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const rel = p => relative(ROOT, p).split(sep).join('/')

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function mapFromPairs(text, pattern) {
  const out = new Map()
  for (const m of text.matchAll(pattern)) out.set(m[1], m[2])
  return out
}

function main() {
  const problems = []
  const migration = read(MIGRATION)
  const calculator = read(CALCULATOR)
  const groupRate = read(GROUP_RATE)
  const coefficient = read(COEFFICIENT)

  let filesRead = 0
  let readersOfTheRate = 0

  // ------------------------------------------------------------------- 1 ---
  if (!migration) {
    problems.push('the AQ2 migration is missing, so the group rate has no floor and no refusal.')
  } else {
    for (const ruleType of ['platform_fee_percentage', 'platform_fee_fixed']) {
      if (!migration.includes(`'${ruleType}'`)) {
        problems.push(
          `the floor does not resolve ${ruleType} from pricing_rules. A floor that does not read the ` +
            'fee is a second copy of the fee, and it stops agreeing with the first the day it is changed.',
        )
      }
    }
    if (!migration.includes('resolve_pricing_value')) {
      problems.push('the floor does not go through the SQL pricing resolver, so its precedence can drift from the application.')
    }
    /*
     * A FEE-SHAPED LITERAL, which is what a typed rate looks like in either
     * language: a number divided by a hundred that is not the resolved one.
     */
    const stripped = migration.replace(/v_pct \/ 100/g, '')
    const typedRate = /(^|[^0-9.a-z_])[0-9]+(\.[0-9]+)?\s*\/\s*100\b/im.exec(stripped)
    if (typedRate) {
      problems.push(
        `the migration carries a fee-shaped literal (${typedRate[0].trim()}). The rate lives in pricing_rules and nowhere else.`,
      )
    }
  }

  // ------------------------------------------------------------------- 2 ---
  const calcBlock = calculator.slice(
    calculator.indexOf('const CURRENCY_TO_COUNTRY'),
    calculator.indexOf('function countryFromCurrency'),
  )
  const fromCalculator = mapFromPairs(calcBlock, /([A-Z]{3}):\s*'([A-Z]{2})'/g)
  const sqlBlock = migration.slice(
    migration.indexOf('v_country := case upper(v_tier.currency)'),
    migration.indexOf("else 'GLOBAL'"),
  )
  const fromSql = mapFromPairs(sqlBlock, /when '([A-Z]{3})' then '([A-Z]{2})'/g)
  const fromModule = mapFromPairs(
    groupRate.slice(groupRate.indexOf('PRICING_COUNTRY_BY_CURRENCY')),
    /([A-Z]{3}):\s*'([A-Z]{2})'/g,
  )

  if (fromCalculator.size === 0) {
    problems.push('the currency to country map could not be read out of payment-calculator.ts, so nothing below is comparing anything.')
  } else {
    for (const [name, map] of [['the SQL trigger', fromSql], ['the pricing module', fromModule]]) {
      const mismatch = [...fromCalculator.entries()].find(([k, v]) => map.get(k) !== v)
      const extra = [...map.keys()].find(k => !fromCalculator.has(k))
      if (mismatch) {
        problems.push(
          `${name} maps ${mismatch[0]} to ${map.get(mismatch[0]) ?? 'nothing'} while the calculator maps it to ` +
            `${mismatch[1]}. The floor would then be resolved at a different scope from the fee actually charged.`,
        )
      } else if (extra) {
        problems.push(`${name} knows a currency (${extra}) the calculator does not, so one of them is out of date.`)
      }
    }
  }

  // ------------------------------------------------------------------- 3 ---
  for (const surface of TICKET_SURFACES) {
    const source = read(join(ROOT, surface))
    if (!source) {
      problems.push(`${surface} is missing, and AQ2 names it as a surface that must carry a share link.`)
      continue
    }
    if (!rendersComponent(source, 'EventShareBar')) {
      problems.push(
        `${surface} carries no tracked share bar. AQ2: "Every ticket carries a tracked share link on the ` +
          'confirmation and on the ticket page", and referral is the only acquisition channel on this ' +
          'platform whose cash cost is zero.',
      )
    }
  }

  // ------------------------------------------------------------------- 4 ---
  if (!/coefficient\s*=\s*referralCoefficient\(fromAKnownBuyer, soldOrders\)/.test(coefficient)) {
    problems.push(
      'the referral coefficient is no longer computed from the known-buyer count. A share link with no ' +
        'created_by may be a guest buyer or may be the organiser own, and folding those in inflates the ' +
        'one number a decision to invest in referral is made from.',
    )
  }

  // ------------------------------------------------------------------- 5 ---
  const spenders = []
  const presenters = []
  for (const file of walk(SRC).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
    const source = readFileSync(file, 'utf8')
    filesRead += 1
    if (!source.includes("from('event_group_rates')")) continue
    readersOfTheRate += 1
    const name = rel(file)
    if (SPENDS_IT.some(dir => name.startsWith(dir))) spenders.push(name)
    else if (SHOWS_IT.some(dir => name.startsWith(dir))) presenters.push(name)
  }
  if (spenders.length === 0 && presenters.length > 0) {
    problems.push(
      `${presenters.join(', ')} shows the group rate, and nothing charges it: no file under ` +
        `${SPENDS_IT.join(' or ')} reads public.event_group_rates. A price somebody can set and nobody is ` +
        'ever charged is a placeholder, and the Definition of Done calls a placeholder a defect. This ' +
        'clause stops applying by itself the day the squad payment step reads the rate.',
    )
  }

  console.log(
    `${TAG} the group rate is read by ${readersOfTheRate} file(s): ${spenders.length} that charge it ` +
      `(${spenders.join(', ') || 'none'}) and ${presenters.length} that show it (${presenters.join(', ') || 'none'}).`,
  )
  if (spenders.length === 0) {
    console.log(
      `${TAG}   nothing charges it yet, so clause 5 is ACTIVE: no surface may present it. ` +
        'It releases itself when a payment path reads the rate.',
    )
  }

  if (problems.length > 0) {
    console.error(`${TAG} the group rate or the sharing that pays for it is not held:`)
    for (const p of problems) console.error(`${TAG}   ${p}`)
  }

  declareWork('the-group-rate-and-the-sharer-are-honest', {
    did: {
      'source file read': filesRead,
      'currency mapped in three places': fromCalculator.size,
      'ticket surface checked': TICKET_SURFACES.length,
      'reader of the group rate': readersOfTheRate,
    },
    found: { 'clause broken': problems.length },
    /*
     * ZERO IS THE POINT OF CLAUSE 5, not a guard that did nothing.
     *
     * While no payment path spends the group rate, no file anywhere should read
     * it, so this counter being zero is the state the clause exists to hold.
     * The day the border change lands in the squad payment step the count goes
     * to one and this note stops being needed, which is the same self-releasing
     * property the clause itself has.
     */
    zeroIsFine: {
      'reader of the group rate':
        'nothing charges the group rate yet, so nothing should read it. Clause 5 holds exactly that, and ' +
        'it releases itself when the squad payment step starts reading the rate.',
    },
  })

  if (problems.length > 0) process.exit(1)

  console.log(
    `${TAG} PASS: the floor is derived from pricing_rules, ${fromCalculator.size} currencies agree in three ` +
      `places, ${TICKET_SURFACES.length} ticket surface(s) carry a tracked share bar, the coefficient counts ` +
      'only provable referrals, and no surface presents a rate nothing charges',
  )
}

if (process.argv[1] && process.argv[1].endsWith('the-group-rate-and-the-sharer-are-honest.mjs')) main()
