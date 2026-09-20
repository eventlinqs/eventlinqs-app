/**
 * GUARD: A DIRECTORY CONTROL THAT SAYS "STRONGEST DRAW FIRST" RANKS THE
 * PLATFORM, NOT THE ALPHABETICALLY FIRST PAGE OF IT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, found on 19 September 2026 and fixed on the
 * 21st. src/app/artists/page.tsx ran these three steps in this order:
 *
 *   1. fetchDirectoryArtists  ->  SELECT ... ORDER BY name, id LIMIT 48
 *   2. fetchDrawTotalsForArtists(those 48 ids)
 *   3. rows.sort((x, y) => (y.draw?.tickets ?? 0) - (x.draw?.tickets ?? 0))
 *
 * The BOUND is at step 1 and the RANK is at step 3, so the control ranked an
 * alphabetical prefix of the platform and presented it as the strongest draw. A
 * performer with four thousand attributed tickets whose name begins with Z was
 * not ranked low, she was not on the page, under a hero reading "Talent with
 * the numbers to prove it". With five performers on TEST the two orders are
 * identical, which is why a driven proof of the NUMBERS passed over it twice.
 *
 * AND THE SECOND DEFECT ON THE SAME LINE, WHICH IS A DISCLOSURE ONE. Step 3
 * sorted every performer by `draw?.tickets ?? 0`, while the badge that shows
 * the number renders only when `draw_consent` is true. So a performer who had
 * NOT consented to publishing their draw was placed by it, at the top, with no
 * badge. Position is disclosure. The rank key is now the PUBLISHED draw.
 *
 * ---------------------------------------------------------------------------
 * WHY A GUARD AND NOT ONLY A TEST. The sort that caused this is one line, it
 * reads as obviously correct, and re-adding it does not fail anything on a
 * database with five performers. Every automated proof this platform owns runs
 * against exactly such a database. So the thing that has to be held is the
 * SHAPE: the rank is a query, the bound comes after it, and the page does not
 * re-sort what the database ordered.
 *
 *   CLAUSE ONE    the directory page never sorts its rows in JavaScript.
 *   CLAUSE TWO    the page reaches the ranked read when sort=draw is asked for.
 *   CLAUSE THREE  the ranked read calls a database function that a migration in
 *                 this repository actually declares, by the one name both sides
 *                 hold, so the code can never call a function nobody installed.
 *   CLAUSE FOUR   that function bounds AFTER it orders.
 *   CLAUSE FIVE   that function ranks on the PUBLISHED draw, so consent gates
 *                 the position as well as the number.
 *   CLAUSE SIX    both sides resolve a doubly-claimed order the same way, the
 *                 first claim, so the rank and the badge cannot drift apart.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: it does not execute the SQL
 * and it does not count a row. Whether the ranked page actually ranks is proven
 * against the real TEST project by scripts/verify/lb-drawsort-drive.mjs, with a
 * fixture larger than the page bound, because that is the only place the defect
 * was ever visible.
 *
 * Drilled in scripts/verify/guard-failure-drills.mjs, one drill per clause.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TAG = '[the-directory-ranks-the-platform]'

const PAGE = 'src/app/artists/page.tsx'
const MODULE = 'src/lib/marketplace/showcase.ts'
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const failures = []
const passes = []
let migrationsSwept = 0

function read(rel) {
  const abs = resolve(ROOT, rel)
  if (!existsSync(abs)) {
    failures.push(`${rel} does not exist; this guard judges it, so a rename is a decision to state`)
    return null
  }
  return readFileSync(abs, 'utf8')
}

/** Lines with the leading `//` and block comment bodies taken out. */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
}

/**
 * SQL line comments taken out, newlines kept so the multi-line patterns below
 * still line up. Judging a migration's PROSE rather than its statements is how
 * a guard passes a file whose header describes a rule the body no longer keeps.
 */
function sqlOnly(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
}

const page = read(PAGE)
const mod = read(MODULE)
const modCode = mod === null ? null : codeOnly(mod)

// --------------------------------------------------------------- clause one
if (page !== null) {
  const code = codeOnly(page)
  const sorts = code.match(/\.sort\s*\(/g) ?? []
  if (sorts.length > 0) {
    failures.push(
      `${PAGE} sorts in JavaScript (${sorts.length} call(s)). The page bound is applied by the ` +
        `database before the page sees a row, so a sort here can only ever re-order an ` +
        `already-truncated set: that is the defect this guard was written after. Rank in the query.`,
    )
  } else {
    passes.push('clause 1: the directory page sorts nothing in JavaScript')
  }
}

// --------------------------------------------------------------- clause two
let fnName = null
if (page !== null && mod !== null) {
  const code = codeOnly(page)
  if (!/fetchDirectoryArtistsRankedByDraw\s*\(/.test(code)) {
    failures.push(
      `${PAGE} never reaches fetchDirectoryArtistsRankedByDraw, so "Strongest draw first" is ` +
        `being answered by something other than the ranked read.`,
    )
  } else if (!/sort\s*===\s*'draw'/.test(code)) {
    failures.push(
      `${PAGE} does not branch on sort === 'draw', so the control the reader presses and the ` +
        `read that answers it are no longer connected.`,
    )
  } else {
    passes.push("clause 2: sort === 'draw' reaches the ranked read")
  }

  // ------------------------------------------------------------- clause three
  const named = mod.match(/RANKED_DIRECTORY_FUNCTION\s*=\s*'([a-z0-9_]+)'/)
  if (!named) {
    failures.push(
      `${MODULE} no longer names the ranking function in one place. The constant is what keeps ` +
        `the code, the guard and the migration talking about the same function.`,
    )
  } else {
    fnName = named[1]
    if (!new RegExp(`\\.rpc\\(\\s*RANKED_DIRECTORY_FUNCTION`).test(codeOnly(mod))) {
      failures.push(
        `${MODULE} declares RANKED_DIRECTORY_FUNCTION and does not call it through .rpc(), so the ` +
          `name and the call can disagree without anything noticing.`,
      )
    } else {
      passes.push(`clause 3a: the ranked read calls ${fnName} through the one named constant`)
    }
  }
}

// ------------------------------------------- clauses three (b), four, five, six
if (fnName) {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
  migrationsSwept = files.length
  const declaring = files.filter((f) =>
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\b`, 'i').test(
      readFileSync(join(MIGRATIONS, f), 'utf8'),
    ),
  )
  if (declaring.length === 0) {
    failures.push(
      `no migration declares public.${fnName}, and ${MODULE} calls it. A function the repository ` +
        `does not install is a 404 from PostgREST at request time, on a public page.`,
    )
  } else {
    passes.push(`clause 3b: public.${fnName} is declared by ${declaring.join(', ')}`)

    const sql = sqlOnly(
      declaring.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n'),
    )

    /*
     * -------------------------------------------------------------- clause four
     * Anchored on the LAST term of the ordering rather than on the first,
     * deliberately: the first term is clause five's subject, and a clause that
     * shares an anchor with another clause reports one edit as two faults and
     * hides a second edit behind the first.
     */
    const orderAt = sql.search(/cand\.id\s+ASC/i)
    const limitAt = sql.search(/LIMIT\s+GREATEST\s*\(\s*COALESCE\s*\(\s*p_limit/i)
    if (orderAt === -1 || limitAt === -1 || limitAt < orderAt) {
      failures.push(
        `public.${fnName} does not bound AFTER it orders. Applying the page bound first is the ` +
          `whole defect: it chooses the candidates by something other than the rank and then ` +
          `ranks the survivors.`,
      )
    } else {
      passes.push('clause 4: the bound is applied after the ranking')
    }

    /*
     * -------------------------------------------------------------- clause five
     * THE KEY HAS TO APPEAR TWICE AND THE FIRST VERSION OF THIS CLAUSE DID NOT
     * KNOW THAT, which is why it passed on a tree where consent had been taken
     * out of the reported number. The expression is written once as the number
     * the function REPORTS and once as the key it ORDERS BY, and a guard that
     * accepts one occurrence accepts a function that reports one number and
     * ranks by another. The red half of the drill is the only thing that found
     * this; the guard was green against a violating tree.
     */
    const CONSENT_KEY = /CASE\s+WHEN\s+cand\.draw_consent\s+THEN\s+COALESCE\(d\.tickets,\s*0\)\s+ELSE\s+0\s+END/gi
    const occurrences = (sql.match(CONSENT_KEY) ?? []).length
    const ordersOnIt = /ORDER\s+BY\s*\n\s*CASE\s+WHEN\s+cand\.draw_consent\s+THEN\s+COALESCE\(d\.tickets,\s*0\)\s+ELSE\s+0\s+END\s+DESC/i.test(
      sql,
    )
    if (occurrences < 2 || !ordersOnIt) {
      failures.push(
        `public.${fnName} no longer ranks on the PUBLISHED draw ` +
          `(${occurrences} occurrence(s) of the key, ordered on it: ${ordersOnIt}). A performer who ` +
          `has not consented to showing their number must not be placed by it: the badge is hidden ` +
          `and the position would publish it anyway. Position is disclosure. The key is written ` +
          `twice on purpose, as the number reported and as the key ordered on, and both must be it.`,
      )
    } else {
      passes.push('clause 5: the rank key is the published draw, so consent gates the position')
    }

    // --------------------------------------------------------------- clause six
    const sqlFirstClaim =
      /SELECT\s+DISTINCT\s+ON\s*\(\s*e\.order_id\s*\)/i.test(sql) &&
      /ORDER\s+BY\s+e\.order_id,\s*e\.occurred_at,\s*e\.id/i.test(sql)
    const tsFirstClaim =
      modCode !== null &&
      /occurredAt\s*<\s*held\.occurredAt/.test(modCode) &&
      /row\.id\s*<\s*held\.eventId/.test(modCode)
    if (!sqlFirstClaim || !tsFirstClaim) {
      failures.push(
        `the two sides no longer resolve a doubly-claimed order the same way ` +
          `(SQL first-claim: ${sqlFirstClaim}, TypeScript first-claim: ${tsFirstClaim}). ` +
          `share_link_events is unique on (link_id, order_id) and not on order_id, so one order ` +
          `can be claimed by two performers. The database decides the ORDER of the page and ` +
          `${MODULE} decides the NUMBER printed inside each card; if they disagree the directory ` +
          `renders 40, 120, 90 down the list.`,
      )
    } else {
      passes.push('clause 6: SQL and TypeScript both take the first claim, by (occurred_at, id)')
    }
  }
}

for (const p of passes) console.log(`${TAG} ${p}`)

declareWork('the-directory-ranks-the-platform', {
  did: {
    'source file judged': [page, mod].filter((f) => f !== null).length,
    'migration file swept for the ranking function': migrationsSwept,
    'clause checked': passes.length + failures.length,
  },
  found: { 'ranking fault': failures.length },
})

if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${failures.length} fault(s) across ${passes.length + failures.length} check(s).`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${passes.length} check(s).`)
