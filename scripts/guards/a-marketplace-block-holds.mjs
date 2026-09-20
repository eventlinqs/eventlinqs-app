/**
 * GUARD: A MARKETPLACE BLOCK HOLDS WHEN THE READ THAT CHECKS IT BLINKS, AND NO
 * SURFACE OF THE GIG BOARD ANSWERS A FAILED READ AS AN ANSWER.
 *
 * THE DEFECT, LB-GIGWHOLE, 20 September 2026.
 *
 *   THE BLOCK THAT FAILED OPEN. The rule was written down on 11 July 2026, in
 *   the migration that created the table, as a comment:
 *
 *       -- marketplace_blocks: a block between an organisation and a performer
 *       --    stops applications and requests BOTH ways for the pair.
 *
 *   Nothing in the database enforced it. The whole enforcement was
 *   `isPairBlocked`, which returned `Boolean(data)` over a read whose error was
 *   never bound, so a dropped socket answered FALSE, and false is the answer
 *   that means NOT BLOCKED. Both call sites read it as permission. A block is a
 *   safety decision a person made about somebody they do not want contact from,
 *   and it stopped holding for the length of any fault in one read.
 *
 *   THE APPLICATIONS THAT VANISHED. `fetchGigApplications` was unbounded with
 *   its error discarded, so a failed read drew "no applications yet" on a gig
 *   that had them: the organiser books nobody and every performer who applied
 *   waits for an answer that was never coming. The counts on the organiser's
 *   board were worse, because the Supabase ceiling is on the RESPONSE and that
 *   read asked for every gig at once, so one cap was shared across the whole
 *   board.
 *
 *   THE PICKER COPIED FOUR TIMES. Four surfaces drew the city picker from four
 *   copies of one read, and all four wrote `(result.data ?? [])`. A blink
 *   emptied the picker, and on the organiser's form an empty picker is a gig
 *   that cannot be posted: the action refuses with "Pick a city from the list"
 *   for a list that had none.
 *
 *   THE POSITION ON THE BILL, GUESSED. Accepting a booking wrote
 *   `billing_order: count ?? 0` over a count whose error was not bound, and
 *   zero is the TOP of the bill, so a performer accepted for a support slot
 *   would have been printed above the headliner.
 *
 * WHY A GUARD OF ITS OWN. `no-silent-row-ceiling` is scoped to the consent and
 * marketing path and does not reach `src/lib/marketplace`.
 * `read-failure-is-not-not-found` judges `notFound()` inside `src/app`, and
 * every refusal here is a returned `{ ok: false }` or a rendered panel, which
 * its own header says it cannot see. And neither can judge the thing that
 * matters most here: that a SAFETY answer is never guessed.
 *
 * THE SEVEN CLAUSES, one is enough to fail the build.
 *
 *   1  every surface named exists, so a rename cannot make this guard judge
 *      nothing and report PASS
 *   2  no read in scope is unbounded, and a paged read carries a total order
 *   3  no read in scope destructures `data` or `count` without `error`
 *   4  isPairBlocked reaches readOrThrow, and every caller goes through the
 *      wrapper that turns an unknowable answer into the refusal
 *   5  the migration installs both triggers and both raise check_violation
 *   6  a WHOLE-TREE sweep: nobody reads the cities picker inline again
 *   7  billing_order is never written from a coalesced count
 *
 * WHAT IT CANNOT SEE. It reads the repository, never a database, so it cannot
 * tell whether the migration has been APPLIED. That is what
 * scripts/verify/lb-gigwhole-drive.mjs is for, and it blocks a real pair on
 * TEST and reads the refusal back.
 *
 * Run: node scripts/guards/a-marketplace-block-holds.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readSource, lineAt, sourceFiles } from './lib/source.mjs'
import { selectChainsIn, boundednessOf, headOnlySelectLines } from './lib/supabase-select-chains.mjs'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[a-marketplace-block-holds]'

/** The gig board and the performer directory, end to end. */
const SCOPE = [
  'src/lib/marketplace/gigs.ts',
  'src/lib/marketplace/cities.ts',
  'src/app/actions/gigs.ts',
  'src/app/(dashboard)/dashboard/gigs/page.tsx',
  'src/app/gigs/page.tsx',
  'src/app/gigs/[id]/page.tsx',
  'src/app/artists/page.tsx',
  'src/app/artists/[slug]/page.tsx',
  'src/app/artist/dashboard/page.tsx',
]

const BLOCK_READER = 'src/lib/marketplace/gigs.ts'
const BLOCK_CALLERS = 'src/app/actions/gigs.ts'
const CITY_READER = 'src/lib/marketplace/cities.ts'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const failures = []
const work = {
  files: 0,
  reads: 0,
  bounded: 0,
  rangedOrdered: 0,
  destructures: 0,
  cityPickers: 0,
  migrationsRead: 0,
}

// ------------------------------------------------------------------- clause 1
for (const file of SCOPE) {
  if (existsSync(resolve(ROOT, file))) continue
  failures.push(
    `the scope names ${file} and it does not exist. Either a marketplace surface moved, in which case ` +
      'this guard now judges nothing for it and would report PASS, or it was deleted. Fix the list ' +
      'rather than the symptom.',
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
        `${file}:${chain.line} reads ${chain.table} with no bound. Supabase stops a RESPONSE at 1,000 ` +
          'rows and says nothing, and on this board that cap is shared across every gig asked for at ' +
          'once. Page it through readEveryRow or state a .limit() where a reader can see it. Chain: .' +
          chain.methods.join('.'),
      )
      continue
    }
    work.bounded += 1

    if (!chain.methods.includes('range')) continue
    if (!chain.methods.includes('order')) {
      failures.push(
        `${file}:${chain.line} pages ${chain.table} with .range() and no .order(). Paging over an ` +
          'undefined order can return one row in two windows and another in none, so an applicant can ' +
          'be counted twice and another not at all.',
      )
      continue
    }
    work.rangedOrdered += 1
  }

  // ----------------------------------------------------------------- clause 3
  /*
   * COMMENTS ARE STRIPPED FIRST, because these files QUOTE the defective lines
   * in their own headers as the thing being stopped, and a scanner that read
   * comments would fail the build on the explanation rather than on the defect.
   *
   * `auth.getUser()` IS EXCLUDED BY NAME. Its response shape is
   * `{ data: { user }, error }` and a discarded error there redirects a
   * signed-in visitor to /login, which is a different and much smaller fault
   * and is the shape of most of the platform's call sites. The measurement is
   * recorded in C:\dev\REVIEW-QUEUE-B.md rather than half-fixed here.
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
          '`error`, so a read that FAILED is indistinguishable here from an answer. On this board that ' +
          'mistake has drawn a gig with no applicants, an organiser with no business, a city picker ' +
          'with no cities, and a performer who has been offered nothing. Read it through readOrThrow, ' +
          'countOrRaise or readEveryRow.',
      )
    }
  }
}

// ------------------------------------------------------------------- clause 4
const readerPath = resolve(ROOT, BLOCK_READER)
if (existsSync(readerPath)) {
  const { withStrings: reader } = readSource(readerPath)
  const blockFn = reader.slice(reader.indexOf('export async function isPairBlocked'))
  const body = blockFn.slice(0, blockFn.indexOf('\n}\n') + 3)
  if (!body.includes('readOrThrow')) {
    failures.push(
      `${BLOCK_READER}: isPairBlocked no longer reads through readOrThrow. It answered Boolean(data) ` +
        'over a discarded error, and false is the answer that means NOT BLOCKED, so a blink handed a ' +
        'blocked pair to each other. A safety answer is the one answer that may never be guessed.',
    )
  }
}

const callersPath = resolve(ROOT, BLOCK_CALLERS)
if (existsSync(callersPath)) {
  const { withStrings: callers } = readSource(callersPath)
  if (!/async function refuseIfBlockedOrUnknowable/.test(callers)) {
    failures.push(
      `${BLOCK_CALLERS} no longer defines refuseIfBlockedOrUnknowable, which is what turns "the block ` +
        'state could not be established" into the same refusal a blocked pair sees. Without it a ' +
        'thrown answer escapes as a generic server error, and the person is told nothing they can act on.',
    )
  }
  for (const match of callers.matchAll(/\bisPairBlocked\(/g)) {
    const line = lineAt(callers, match.index)
    const before = callers.slice(Math.max(0, match.index - 200), match.index)
    if (/refuseIfBlockedOrUnknowable[\s\S]*$/.test(before) || /return \(await $/.test(before)) continue
    failures.push(
      `${BLOCK_CALLERS}:${line} calls isPairBlocked directly. It THROWS when it cannot establish the ` +
        'answer, and a bare call lets that escape the action instead of refusing the contact. Go ' +
        'through refuseIfBlockedOrUnknowable, which fails CLOSED with a sentence.',
    )
  }
}

// ------------------------------------------------------------------- clause 5
const blockMigrations = readdirSync(MIGRATIONS)
  .filter(name => name.endsWith('.sql'))
  .sort()
  .filter(name => readFileSync(join(MIGRATIONS, name), 'utf8').includes('enforce_marketplace_block_on_application'))
work.migrationsRead = blockMigrations.length

if (blockMigrations.length === 0) {
  failures.push(
    'no migration defines enforce_marketplace_block_on_application. The block is then enforced only by ' +
      'an application read, which is what failed open, and the rule stated in the comment above ' +
      'marketplace_blocks goes back to being a comment.',
  )
} else {
  const newest = blockMigrations[blockMigrations.length - 1]
  const sql = readFileSync(join(MIGRATIONS, newest), 'utf8')
  /*
   * THE NAME IS MATCHED TO ITS END, not as a prefix. The first version of this
   * clause tested `CREATE TRIGGER trg_marketplace_block_on_application` with no
   * boundary, and its own drill renamed the trigger to
   * `..._on_application_disabled`, which still CONTAINS that substring. The
   * guard passed on a violating tree and the drill harness said so:
   * "guard PASSED on a violating tree. It is not actually guarding." A guard
   * that cannot tell a disabled trigger from a live one is not a guard.
   */
  for (const trigger of ['trg_marketplace_block_on_application', 'trg_marketplace_block_on_request']) {
    if (!new RegExp(`CREATE TRIGGER ${trigger}(?![A-Za-z0-9_])`, 'i').test(sql)) {
      failures.push(
        `supabase/migrations/${newest} does not install ${trigger}. A trigger function nothing fires ` +
          'is a rule nothing enforces, and the two kinds of contact a block stops are an application ' +
          'and a request.',
      )
    }
  }
  const raises = (sql.match(/check_violation/g) ?? []).length
  if (raises < 2) {
    failures.push(
      `supabase/migrations/${newest} raises check_violation ${raises} time(s); both block triggers must ` +
        'raise it, because the server actions translate 23514 into the sentence the person reads and a ' +
        'bare exception surfaces a raw database error to a performer instead.',
    )
  }
}

// ------------------------------------------------------------------- clause 6
/*
 * THE WHOLE TREE, because a FIFTH surface is exactly how the platform would
 * acquire a fifth copy of the picker read somewhere this list does not name.
 * The shape judged is the picker specifically: `slug, name` ordered on `tier`.
 */
for (const file of sourceFiles(ROOT, { subdir: 'src' })) {
  if (!/\.tsx?$/.test(file)) continue
  if (file.replace(/\\/g, '/') === CITY_READER) continue
  const absolute = resolve(ROOT, file)
  if (!existsSync(absolute)) continue
  const { withStrings: source } = readSource(absolute)
  if (!/from\(['"]cities['"]\)/.test(source)) continue
  if (!/select\(\s*['"]slug,\s*name['"]\s*\)/.test(source)) continue
  if (!/order\(\s*['"]tier['"]/.test(source)) continue
  work.cityPickers += 1
  failures.push(
    `${file} reads the cities picker inline. There were four copies of that read and all four wrote ` +
      "`(result.data ?? [])`, so one blink emptied the picker on four surfaces at once and an empty " +
      `picker on the organiser's form is a gig that cannot be posted. Call fetchPickerCities from ` +
      `${CITY_READER}.`,
  )
}

// ------------------------------------------------------------------- clause 7
if (existsSync(callersPath)) {
  const { withStrings: callers } = readSource(callersPath)
  if (/billing_order:\s*count\s*\?\?/.test(callers)) {
    failures.push(
      `${BLOCK_CALLERS} writes billing_order from a coalesced count. A failed count is null, ` +
        '`null ?? 0` is zero, and zero is the TOP of the bill, so a performer accepted for a support ' +
        'slot is printed above the headliner on the public event page. A position on the bill is not ' +
        'a thing to guess: when the count cannot be taken, do not write the tag.',
    )
  }
}

if (failures.length) {
  console.error(`${TAG} FAIL`)
  for (const f of failures) console.error(`  ${f}`)
}

declareWork('a-marketplace-block-holds', {
  did: {
    'marketplace surface swept': work.files,
    'database read judged': work.reads,
    'read carrying a bound': work.bounded,
    'paged read checked for a total order': work.rangedOrdered,
    'destructured read checked for its error': work.destructures,
    'migration installing the block triggers': work.migrationsRead,
  },
  zeroIsFine: {
    /*
     * ZERO IS THE POINT rather than a gap: clause 6 counts the inline picker
     * reads it FOUND, and every one of them is a failure. A non-zero count here
     * means the build is already red.
     */
    'inline city picker read found': 'every picker now goes through the one reader, which is the point of clause 6',
  },
  found: {
    'inline city picker read': work.cityPickers,
    'read or write that could put a blocked pair in contact or hide an applicant': failures.length,
  },
})

if (failures.length) process.exit(1)
