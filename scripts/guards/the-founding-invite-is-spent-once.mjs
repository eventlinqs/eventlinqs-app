/**
 * GUARD: A FOUNDING INVITE IS SPENT ONCE, FOR EXACTLY ONE SPOT, AND THE
 * ALLOWANCE THAT CAPS IT CANNOT FAIL OPEN.
 *
 * THE DEFECT, LB-INVITEWHOLE, 20 September 2026. The acquisition loop the growth
 * plan names as lever two (invite an organiser) answered a failed read as an
 * answer, in five places, and two of them cost the organiser the thing they had
 * been invited to.
 *
 *   THE INVITE SPENT ON NOTHING. acceptFoundingInvite marked the invite
 *   'accepted' in one round trip and claimed the founding spot in another, and
 *   discarded the claim's error:
 *
 *       const { data: spot } = await admin.rpc('claim_founding_spot', { ... })
 *       const spotNumber = typeof spot === 'number' ? spot : null
 *
 *   A dropped socket there is indistinguishable from the programme being full,
 *   so the invited organiser was told "All 50 founding spots are taken right
 *   now" while their single-use code had been spent milliseconds earlier. No
 *   spot, no six-month window, no way to try again, and nothing recording it.
 *   Migration 20260920000050 puts both writes inside accept_founding_invite,
 *   where one transaction rolls both back.
 *
 *   THE ALLOWANCE THAT FAILED OPEN. Five invites per founding organiser, and
 *   the whole enforcement was `(count ?? 0) >= INVITES_PER_FOUNDING_ORGANISER`
 *   over a count whose error was never bound. A failed count read as nought
 *   issued and minted a sixth. Every founding invite is a founding spot and six
 *   fee-free months.
 *
 *   THE FRONT DOOR THAT TURNED PEOPLE AWAY. getInviteByCode discarded its error
 *   and /join/[code] rendered "This invitation is not available. It may have
 *   already been used, or it has been withdrawn." at somebody holding a valid,
 *   pending code, and told them to go back to the person who invited them.
 *
 * WHY A GUARD OF ITS OWN, when three others already judge reads.
 * `no-silent-row-ceiling` is scoped to the consent and marketing path and does
 * not reach src/lib/founding. `read-failure-is-not-not-found` says in its own
 * header that it judges notFound() inside src/app and cannot see a helper in
 * src/lib folding a read into null for a RENDERED refusal, which is exactly the
 * shape of the front door above. And neither of them can judge the thing that
 * actually mattered here: that the consume and the claim are ONE transaction.
 *
 * THE SIX CLAUSES, one is enough to fail the build.
 *
 *   1  every file in the loop exists, so a renamed surface cannot make this
 *      guard judge nothing and report PASS
 *   2  no read in the loop is unbounded, and a paged read carries a total order
 *   3  no read in the loop destructures `data` or `count` without `error`
 *   4  the conversion goes through the SQL function: the TypeScript does not
 *      write `status: 'accepted'` itself and does not call claim_founding_spot
 *      directly, because either one puts the consume and the claim back into
 *      two transactions
 *   5  the caller deletes the invite cookie only when the code was consumed
 *   6  the allowance in the database and INVITES_PER_FOUNDING_ORGANISER in the
 *      TypeScript are the same number, and the migration still installs the
 *      trigger and the atomic function
 *
 * WHAT IT CANNOT SEE, said plainly. It reads the repository, never a database,
 * so it cannot tell whether the migration has been APPLIED anywhere. That is
 * what scripts/verify/lb-invitewhole-sql-proof.mjs is for, and it runs against
 * TEST with real rows.
 *
 * Run: node scripts/guards/the-founding-invite-is-spent-once.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-founding-invite-is-spent-once]'

/**
 * The acquisition loop, end to end: the module that converts an invite, the
 * screen a founding organiser issues them from, the action that mints one, the
 * warm landing an invited organiser arrives on, and the action that spends the
 * code at signup.
 */
const SCOPE = [
  'src/lib/founding/invites.ts',
  'src/app/(dashboard)/dashboard/invites/page.tsx',
  'src/app/(dashboard)/dashboard/invites/actions.ts',
  'src/app/join/[code]/page.tsx',
  'src/app/(dashboard)/dashboard/organisation/actions.ts',
]

/** The module that owns the conversion. */
const CONVERTER = 'src/lib/founding/invites.ts'
/** The one call site that spends a code. */
const CALLER = 'src/app/(dashboard)/dashboard/organisation/actions.ts'
/** The SQL function both writes now live inside. */
const SQL_FUNCTION = 'accept_founding_invite'
/** The trigger that refuses the sixth invite. */
const SQL_TRIGGER = 'trg_founding_invite_allowance'

const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const failures = []
const work = {
  files: 0,
  reads: 0,
  bounded: 0,
  rangedOrdered: 0,
  destructures: 0,
  migrationsRead: 0,
}

// ------------------------------------------------------------------- clause 1
for (const file of SCOPE) {
  if (existsSync(resolve(ROOT, file))) continue
  failures.push(
    `the scope names ${file} and it does not exist. Either a surface of the founding invite loop moved, ` +
      'in which case this guard now judges nothing for it and would report PASS, or it was deleted. ' +
      'Fix the list rather than the symptom.',
  )
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
        `${file}:${chain.line} reads ${chain.table} with no bound. Supabase stops at 1,000 rows and ` +
          'says nothing, so an organiser can be shown a list that is missing invites they issued while ' +
          'the allowance count refuses to issue another. Page it through readEveryRow or state a ' +
          `.limit(). Chain: .${chain.methods.join('.')}`,
      )
      continue
    }
    work.bounded += 1

    if (!chain.methods.includes('range')) continue
    if (!chain.methods.includes('order')) {
      failures.push(
        `${file}:${chain.line} pages ${chain.table} with .range() and no .order(). Paging over an ` +
          'undefined order can return one row in two windows and another in none, so an invite list ' +
          'can come back with a code repeated and a code missing.',
      )
      continue
    }
    work.rangedOrdered += 1
  }

  // ----------------------------------------------------------------- clause 3
  /*
   * COMMENTS ARE STRIPPED FIRST, because these files QUOTE the defective lines
   * in their own headers as the thing being stopped, and a scanner that read
   * comments would fail the build on the explanation of the defect rather than
   * on the defect.
   *
   * `auth.getUser()` IS EXCLUDED, and by name rather than by accident. Its
   * response shape is `{ data: { user }, error }` and a discarded error there
   * redirects a signed-in visitor to /login, which is a different and much
   * smaller fault, and it is the shape of 76 call sites across the platform.
   * Failing two of those 76 here would make these two files inconsistent with
   * the other 74 and would not fix anything; the measurement is recorded in
   * C:\dev\REVIEW-QUEUE-B.md instead.
   */
  for (const match of source.matchAll(/const\s*(\{[^}]*\}|\[[^\]]*\])\s*=\s*await\b([^\n]*)/g)) {
    if (/auth\.getUser\(\)/.test(match[2] ?? '')) continue
    for (const group of match[1].matchAll(/\{([^}]*)\}/g)) {
      const names = group[1]
      const rows = /\bdata\b/.test(names)
      const counts = /\bcount\b/.test(names)
      if (!rows && !counts) continue
      work.destructures += 1
      if (/\berror\b/.test(names)) continue
      failures.push(
        `${file}:${lineAt(source, match.index)} destructures \`${rows ? 'data' : 'count'}\` and not ` +
          '`error`, so a read that FAILED is indistinguishable here from an answer. In this loop that ' +
          'mistake has told an invited organiser their link was withdrawn, told a founding organiser ' +
          'they had issued no invites, and minted a sixth invite for an organiser holding five. Read ' +
          'it through readOrThrow, countOrRaise or readEveryRow.',
      )
    }
  }
}

// ------------------------------------------------------------------- clause 4
const converterPath = resolve(ROOT, CONVERTER)
if (existsSync(converterPath)) {
  const { withStrings: converter } = readSource(converterPath)

  if (!new RegExp(`rpc\\(\\s*'${SQL_FUNCTION}'`).test(converter)) {
    failures.push(
      `${CONVERTER} no longer converts an invite through the ${SQL_FUNCTION} function. The consume and ` +
        'the claim are then two round trips again, and a fault between them leaves a single-use code ' +
        'spent with no founding spot granted, which is the defect this guard exists for.',
    )
  }

  if (/claim_founding_spot/.test(converter)) {
    failures.push(
      `${CONVERTER} calls claim_founding_spot directly. That RPC is its own transaction, so calling it ` +
        'from the application puts the claim back outside the transaction that consumed the invite. ' +
        `${SQL_FUNCTION} calls it from inside, where a fault rolls the consume back too.`,
    )
  }

  if (/status:\s*'accepted'/.test(converter)) {
    failures.push(
      `${CONVERTER} marks an invite accepted from the application. The consume belongs in the same ` +
        `transaction as the claim, which is inside ${SQL_FUNCTION}.`,
    )
  }
}

// ------------------------------------------------------------------- clause 5
const callerPath = resolve(ROOT, CALLER)
if (existsSync(callerPath)) {
  const { withStrings: caller } = readSource(callerPath)
  const deletesCookie = /cookies\(\)\)\.delete\(FOUNDING_INVITE_COOKIE\)/.test(caller)
  const guardsTheDelete = /if\s*\(\s*outcome\.consumed\s*\)/.test(caller)
  if (deletesCookie && !guardsTheDelete) {
    failures.push(
      `${CALLER} deletes the founding invite cookie without first establishing that the code was ` +
        'actually consumed. A conversion that failed writes nothing and leaves the invite pending, so ' +
        'deleting the cookie there throws away the only copy of a code the organiser was given, for a ' +
        'fault that lasted a second.',
    )
  }
  if (!deletesCookie) {
    failures.push(
      `${CALLER} no longer deletes the founding invite cookie at all. Clause 5 then judges nothing and ` +
        'would report PASS, and a spent code would stay in the browser and be re-offered at the next ' +
        'organisation the visitor creates.',
    )
  }
}

// ------------------------------------------------------------------- clause 6
/*
 * ONE NUMBER, TWO IMPLEMENTATIONS. The allowance is enforced in the TypeScript
 * so the refusal is readable, and in the database so it holds against a direct
 * insert and against the count above failing. Two implementations of one rule
 * that quietly differ are worse than either alone, which is the reasoning
 * founding-offer-matches-configuration already applies to the fifty.
 */
const tsAllowance = (() => {
  if (!existsSync(converterPath)) return null
  const { withStrings: converter } = readSource(converterPath)
  const m = converter.match(/INVITES_PER_FOUNDING_ORGANISER\s*=\s*(\d+)/)
  return m ? Number(m[1]) : null
})()

if (tsAllowance === null) {
  failures.push(
    `${CONVERTER} no longer declares INVITES_PER_FOUNDING_ORGANISER as a literal, so clause 6 cannot ` +
      'compare it with the database and would report PASS on any drift.',
  )
}

const allowanceMigrations = readdirSync(MIGRATIONS)
  .filter(name => name.endsWith('.sql'))
  .sort()
  .filter(name => readFileSync(join(MIGRATIONS, name), 'utf8').includes('enforce_founding_invite_allowance'))
work.migrationsRead = allowanceMigrations.length

if (allowanceMigrations.length === 0) {
  failures.push(
    'no migration defines enforce_founding_invite_allowance. The five-invite allowance is then enforced ' +
      'only by an application count, which is what failed open and minted a sixth.',
  )
} else {
  const newest = allowanceMigrations[allowanceMigrations.length - 1]
  const sql = readFileSync(join(MIGRATIONS, newest), 'utf8')

  const sqlAllowance = sql.match(/v_allowance\s+CONSTANT\s+INTEGER\s*:=\s*(\d+)/i)
  if (!sqlAllowance) {
    failures.push(
      `supabase/migrations/${newest} defines enforce_founding_invite_allowance without a readable ` +
        'v_allowance constant, so the two implementations of the allowance can drift with nothing watching.',
    )
  } else if (tsAllowance !== null && Number(sqlAllowance[1]) !== tsAllowance) {
    failures.push(
      `the founding invite allowance disagrees with itself: ${CONVERTER} says ` +
        `INVITES_PER_FOUNDING_ORGANISER = ${tsAllowance} and supabase/migrations/${newest} says ` +
        `v_allowance = ${sqlAllowance[1]}. An organiser would be told one number and refused at another.`,
    )
  }

  if (!new RegExp(`CREATE TRIGGER ${SQL_TRIGGER}`, 'i').test(sql)) {
    failures.push(
      `supabase/migrations/${newest} defines enforce_founding_invite_allowance and does not install ` +
        `${SQL_TRIGGER}. A trigger function nothing fires is a cap nothing enforces.`,
    )
  }

  if (!new RegExp(`FUNCTION public\\.${SQL_FUNCTION}`, 'i').test(sql)) {
    failures.push(
      `supabase/migrations/${newest} no longer carries public.${SQL_FUNCTION}, which is the transaction ` +
        'the consume and the claim share. Without it the application is back to two round trips.',
    )
  }
}

if (failures.length) {
  console.error(`${TAG} FAIL`)
  for (const f of failures) console.error(`  ${f}`)
}

declareWork('the-founding-invite-is-spent-once', {
  did: {
    'surface of the founding invite loop swept': work.files,
    'database read judged': work.reads,
    'read carrying a bound': work.bounded,
    'paged read checked for a total order': work.rangedOrdered,
    'destructured read checked for its error': work.destructures,
    'migration defining the invite allowance': work.migrationsRead,
  },
  zeroIsFine: {
    /*
     * ZERO IS THE POINT RATHER THAN A GAP on the day every read in the loop is
     * a single row or a count. The clause stays registered because the day
     * somebody pages an invite list inline is exactly the day it is needed.
     */
    'paged read checked for a total order':
      'only the invite list pages; when it is read another way there is nothing here to order',
  },
  found: { 'read or write that could spend a founding invite on nothing': failures.length },
})

if (failures.length) process.exit(1)
