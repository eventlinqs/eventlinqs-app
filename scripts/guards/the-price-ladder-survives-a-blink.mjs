/**
 * GUARD: A READ THAT FAILS ON THE PRICING SCREENS MUST NOT BE WRITTEN BACK OVER
 * THE THING IT FAILED TO READ.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, and it is data loss rather than a wrong
 * number. Measured against the code as it stood on 20 September 2026.
 *
 * `/dashboard/events/[id]/pricing` read an event's dynamic pricing ladder with
 *
 *     const { data: rules } = await supabase.from('dynamic_pricing_rules')...
 *
 * and handed `rules ?? []` to `pricing-client.tsx`, which seeds its editor from
 * what it is given and substitutes ONE synthetic step at the base price when
 * the list is empty. Press Save on that screen and `save_dynamic_pricing`
 * replaces the stored ladder with what the client is holding.
 *
 * So a dropped socket on the way in, plus one press of Save, deleted an
 * organiser's whole pricing decision. HTTP 200 everywhere, nothing in the log,
 * nothing on the screen, and the screen that showed the loss looked exactly
 * like a tier that had never had a ladder.
 *
 * THE SECOND HALF of the same defect was in the action rather than the read:
 * the steps were sent as `enabled ? normalise(steps) : []`, and the database
 * function deleted every rule before deciding whether to insert any, so turning
 * dynamic pricing OFF and pressing Save destroyed the ladder as well. Pausing a
 * price ladder for a weekend is an ordinary thing to want and it is not what
 * the switch says it does.
 *
 * ---------------------------------------------------------------------------
 * SIX CLAUSES, each naming the regression it stops.
 *
 *   1. Every file in the scope exists. A scope that has been renamed away scans
 *      nothing and reports PASS, which is how a scanner lies.
 *   2. Every select in the scope is bounded, and a ranged read carries an
 *      `.order(`. Paging a non-deterministic order is not paging.
 *   3. No read in the scope destructures `data` or `count` without `error`. This
 *      is the clause that would have caught the original defect.
 *   4. Every file in ALL of src/ that renders the pricing or discount editors
 *      reaches the one reader module. The scope above is a directory list, and
 *      a THIRD screen is exactly the way the platform would quietly acquire a
 *      fourth copy of these reads, somewhere the list does not name.
 *   5. The action sends the steps whatever the switch says. `enabled ? ... : []`
 *      is the exact line that made a pause destructive.
 *   6. The newest migration defining `save_dynamic_pricing` guards its DELETE.
 *      An unconditional `DELETE FROM public.dynamic_pricing_rules` reopens
 *      clause 5's defect underneath any caller, including a correct one.
 *
 * WHAT IT DOES NOT JUDGE, stated rather than implied.
 *
 *   - Whether the migration has been APPLIED to any database. It reads the
 *     repository only. The behaviour is proven against TEST by
 *     `scripts/verify/lb-pricewhole-drive.mjs`, which calls the function and
 *     reads the rows back.
 *   - Whether application code writes `dynamic_pricing_rules` directly. That is
 *     `scripts/guards/price-history-integrity.mjs`, which already holds it, and
 *     a second copy of a rule is a second chance to get it wrong.
 *   - The size of a table. An event with more than a thousand ticket types is
 *     not a real event, and this guard does not pretend the row ceiling is the
 *     danger here. Boundedness is enforced because a bound stated in the source
 *     is a bound a reviewer can argue with.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readSource, lineAt, sourceFiles } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-price-ladder-survives-a-blink]'

/** The screens and actions that read what an organiser has decided a buyer pays. */
const SCOPE = [
  'src/app/(dashboard)/dashboard/events/[id]/pricing/page.tsx',
  'src/app/(dashboard)/dashboard/events/[id]/discounts/page.tsx',
  'src/app/(dashboard)/dashboard/events/[id]/stream/page.tsx',
  'src/app/actions/dynamic-pricing.ts',
]

/** The one reader. A read in scope reaches it or states its own bound. */
const READER = 'src/lib/organisers/event-tier-config.ts'

/** The action whose ternary made a pause destructive. */
const ACTION = 'src/app/actions/dynamic-pricing.ts'

/** The editors that a failed read would be written back through. */
const EDITORS = ['<PricingClient', '<DiscountCodesClient']

const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const failures = []
const work = {
  files: 0,
  reads: 0,
  bounded: 0,
  rangedOrdered: 0,
  destructures: 0,
  editorScreens: 0,
  migrationsRead: 0,
}

// ------------------------------------------------------------------- clause 1
for (const file of SCOPE) {
  if (!existsSync(resolve(ROOT, file))) {
    failures.push(
      `the scope names ${file} and it does not exist. Either a pricing surface moved, in which case ` +
        'this guard now judges nothing for it and would report PASS, or it was deleted. Fix the list ' +
        'rather than the symptom.',
    )
  }
}
if (!existsSync(resolve(ROOT, READER))) {
  failures.push(`${READER} is missing, and every read in scope depends on it`)
}

for (const file of SCOPE) {
  const absolute = resolve(ROOT, file)
  if (!existsSync(absolute)) continue
  work.files += 1

  const { withStrings: source } = readSource(absolute)
  const heads = headOnlySelectLines(absolute)

  // ----------------------------------------------------------------- clause 2
  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    work.reads += 1

    if (!boundednessOf(chain, { headSelects: heads })) {
      failures.push(
        `${file}:${chain.line} reads ${chain.table} with no bound. Read it through ${READER}, which ` +
          'pages it and throws, or state a `.limit()` where a reader can see it. Chain: .' +
          chain.methods.join('.'),
      )
      continue
    }
    work.bounded += 1

    if (!chain.methods.includes('range')) continue
    if (!chain.methods.includes('order')) {
      failures.push(
        `${file}:${chain.line} pages ${chain.table} with .range() and no .order(). Ranged paging over ` +
          'an undefined order can return one row in two windows and another in none, so a ladder can ' +
          'come back with a step repeated and a step missing.',
      )
      continue
    }
    work.rangedOrdered += 1
  }

  // ----------------------------------------------------------------- clause 3
  /*
   * COMMENTS ARE STRIPPED FIRST, because these files QUOTE the defective line
   * in their own headers as the thing being stopped, and a scanner that read
   * comments would fail the build on the explanation of the bug rather than on
   * the bug.
   */
  for (const match of source.matchAll(/const\s*(\{[^}]*\}|\[[^\]]*\])\s*=\s*await\b/g)) {
    for (const group of match[1].matchAll(/\{([^}]*)\}/g)) {
      const names = group[1]
      const rows = /\bdata\b/.test(names)
      const counts = /\bcount\b/.test(names)
      if (!rows && !counts) continue
      work.destructures += 1
      if (/\berror\b/.test(names)) continue
      failures.push(
        `${file}:${lineAt(source, match.index)} destructures \`${rows ? 'data' : 'count'}\` and not ` +
          '`error`, so a read that FAILED arrives at the screen as an organiser who has configured ' +
          'nothing. On this screen that empty answer is then editable, and Save writes it back over ' +
          'the configuration that is actually stored.',
      )
    }
  }
}

// ------------------------------------------------------------------- clause 4
for (const file of sourceFiles(ROOT, { subdir: 'src' })) {
  if (!/\.tsx?$/.test(file)) continue
  const absolute = resolve(ROOT, file)
  if (!existsSync(absolute)) continue
  const { withStrings: source } = readSource(absolute)
  if (!EDITORS.some(editor => source.includes(editor))) continue
  work.editorScreens += 1
  if (/from '@\/lib\/organisers\/event-tier-config'/.test(source)) continue
  failures.push(
    `${file} renders a pricing or discount editor and does not read through ${READER}. Every screen ` +
      'that hands an organiser an editable copy of their own configuration must get that copy from a ' +
      'read that throws, because Save writes the copy back.',
  )
}
if (work.editorScreens === 0) {
  failures.push(
    `no file in src/ renders ${EDITORS.join(' or ')}. Either both editors were renamed, in which case ` +
      'clause 4 now judges nothing and reports PASS, or the pricing screens are gone.',
  )
}

// ------------------------------------------------------------------- clause 5
const actionPath = resolve(ROOT, ACTION)
if (existsSync(actionPath)) {
  const { withStrings: action } = readSource(actionPath)
  if (/enabled\s*\?[^\n]*normaliseDynamicPricingSteps/.test(action)) {
    failures.push(
      `${ACTION} sends the price steps only when the switch is on. That is the line that made a PAUSE ` +
        'destructive: the database function is handed an empty list, the stored ladder is replaced ' +
        'with nothing, and the organiser who turned dynamic pricing off for a weekend has lost it. ' +
        'Send the steps whatever the switch says.',
    )
  }
  if (!/normaliseDynamicPricingSteps\(steps\)/.test(action)) {
    failures.push(
      `${ACTION} no longer normalises the submitted steps before saving them. The stored ladder is ` +
        'then whatever order the client happened to hold, and the database will not say so.',
    )
  }
}

// ------------------------------------------------------------------- clause 6
const definingMigrations = readdirSync(MIGRATIONS)
  .filter(name => name.endsWith('.sql'))
  .sort()
  .filter(name => readFileSync(join(MIGRATIONS, name), 'utf8').includes('FUNCTION public.save_dynamic_pricing'))
work.migrationsRead = definingMigrations.length

if (definingMigrations.length === 0) {
  failures.push(
    'no migration defines public.save_dynamic_pricing. Clause 6 judges the newest definition, so with ' +
      'none it would judge nothing and report PASS.',
  )
} else {
  const newest = definingMigrations[definingMigrations.length - 1]
  const sql = readFileSync(join(MIGRATIONS, newest), 'utf8')
  const body = sql.slice(sql.indexOf('FUNCTION public.save_dynamic_pricing'))
  const deleteAt = body.indexOf('DELETE FROM public.dynamic_pricing_rules')
  const guardAt = body.indexOf('IF v_replace THEN')
  if (deleteAt !== -1 && (guardAt === -1 || guardAt > deleteAt)) {
    failures.push(
      `supabase/migrations/${newest} deletes every dynamic pricing rule for the tier without first ` +
        'establishing that a replacement ladder was actually supplied. An empty step list is an ' +
        'ABSENCE OF INSTRUCTION, never an instruction to delete, and a function that reads it the ' +
        'other way destroys an organiser ladder on every pause and on every failed read above it.',
    )
  }
}

if (failures.length) {
  console.error(`${TAG} FAIL`)
  for (const f of failures) console.error(`  ${f}`)
}

declareWork('the-price-ladder-survives-a-blink', {
  did: {
    'pricing surface swept': work.files,
    'database read judged': work.reads,
    'read carrying a bound': work.bounded,
    'paged read checked for a stable order': work.rangedOrdered,
    'destructured read checked for its error': work.destructures,
    'screen rendering a pricing or discount editor': work.editorScreens,
    'migration defining the save function': work.migrationsRead,
  },
  zeroIsFine: {
    /*
     * ZERO IS THE POINT RATHER THAN A GAP. Every read in this scope now reaches
     * the reader module, so no `.range()` is written in a pricing surface at
     * all, and clause 2's ordering half has nothing to judge here. It stays
     * registered because the day somebody pages a ladder inline is exactly the
     * day it is needed, and it would then be counted. The module's own paged
     * reads are judged by `no-silent-row-ceiling` where they live.
     */
    'paged read checked for a stable order': 'every read in scope goes through the reader module, so no pricing surface pages inline',
  },
  found: { 'read or save that could destroy an organiser price ladder': failures.length },
})

if (failures.length) process.exit(1)
