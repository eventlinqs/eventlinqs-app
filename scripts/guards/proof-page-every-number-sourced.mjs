/**
 * GUARD: EVERY NUMBER ON THE PROOF PAGE IS SOURCED, AND NONE IS TYPED.
 *
 * Close-out GA5. A client will not keep paying a commission they cannot check.
 * The moment anybody types a number onto this page it stops being proof and
 * becomes a claim, and not making claims is precisely what the premium is for.
 * So this guard reads the rendering path out of the repository and fails the
 * build on the thing that would quietly turn the page into a claim.
 *
 * WHAT IT CHECKS, and every clause names the figure and the file when it fails:
 *
 *   1. EVERY FIGURE IS PRODUCED THROUGH `sourced(...)` OR `unavailable(...)`.
 *      Those are the only two ways a figure can exist: a value WITH the row ids
 *      or the named query behind it, or a stated absence. A figure assigned an
 *      object literal, a bare number, or anything else is a figure nobody can
 *      trace, and this names it.
 *   2. EVERY FIGURE KEY IN THE REGISTRY IS ACTUALLY PRODUCED. A key that is
 *      declared and never assigned renders as undefined, which on a money page
 *      is worse than an error.
 *   3. NO NUMERIC LITERAL, CURRENCY STRING OR PERCENTAGE IN THE RENDERING PATH,
 *      outside the exceptions listed below by name. Tailwind class names are
 *      stripped first, because a padding scale is not a figure.
 *   4. THE DATABASE REFUSES AN UNSOURCED SNAPSHOT. The check constraint and the
 *      function behind it are read out of the migrations, so a snapshot holding
 *      a figure nothing sources cannot be stored even if this scan is passed.
 *
 * IT READS THE REPOSITORY AND NOTHING ELSE, so it runs on the Vercel build host,
 * in CI and in the pre-push gate alike, and it needs no database.
 *
 * Run standalone: node scripts/guards/proof-page-every-number-sourced.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[proof-page-every-number-sourced]'

const COMPOSE = join(ROOT, 'src', 'lib', 'proof', 'compose.ts')
const PRESENT = join(ROOT, 'src', 'lib', 'proof', 'present.ts')
const PAGE = join(ROOT, 'src', 'app', 'admin', '(authed)', 'campaigns', '[id]', 'proof', 'page.tsx')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/**
 * THE EXCEPTIONS, LISTED BY NAME because GA5 requires them listed rather than
 * inferred. Each is a number that is not a FIGURE.
 */
const ALLOWED_NUMBERS = [
  // Array and string index arithmetic, which is structure rather than money.
  '0',
  '1',
  // The percentage divisor in the commission arithmetic. It is the definition
  // of "per cent" rather than a rate: the RATE arrives from pricing_rules.
  '100',
]

const faults = []

function read(file) {
  if (!existsSync(file)) {
    faults.push(`${relative(ROOT, file)} does not exist, so the proof page rendering path cannot be checked`)
    return ''
  }
  return readFileSync(file, 'utf8')
}

const compose = read(COMPOSE)
const present = read(PRESENT)
const page = read(PAGE)

/* --- clause 1 and 2: every figure is produced, and produced through a source --- */

const declaredKeys = [...compose.matchAll(/^\s{2}([A-Z_]+):\s*'([a-zA-Z]+)',$/gm)].map(m => m[1])
/*
 * THE RIGHT HAND SIDE IS READ PAST THE LINE BREAK, and that is not a detail.
 * The first version of this captured `[^\n]*`, so an assignment written across
 * two lines presented an EMPTY right hand side, which the clause below read as
 * "nothing to judge" and passed. A typed object literal on the second line
 * would have walked through the one guard built to stop it. It now takes the
 * text that FOLLOWS the assignment, whitespace and all, and judges the first
 * thing in it.
 *
 * THROUGH A LOOKAHEAD, because the right hand side must be read without being
 * CONSUMED. A plain match of the next 120 characters swallows the assignment
 * that follows it, and `matchAll` then resumes past it: three figures read as
 * never produced at all. The lookahead leaves the cursor on the assignment.
 */
const assignments = [...compose.matchAll(/figures\[FIGURE\.([A-Z_]+)\]\s*=\s*(?=([\s\S]{0,120}))/g)]

for (const [, key, rhs] of assignments) {
  const trimmed = rhs.trim()
  const producedProperly = trimmed.startsWith('sourced(') || trimmed.startsWith('unavailable(')
  if (!producedProperly) {
    faults.push(
      `${relative(ROOT, COMPOSE)}: the figure ${key} is assigned \`${trimmed.slice(0, 60)}\`, which is neither sourced(...) nor unavailable(...). A figure that cannot name where it came from must not render.`,
    )
  }
}

const assignedKeys = new Set(assignments.map(m => m[1]))
for (const key of declaredKeys) {
  if (!assignedKeys.has(key)) {
    faults.push(
      `${relative(ROOT, COMPOSE)}: the figure ${key} is declared in the registry and never produced, so it would render as undefined.`,
    )
  }
}

/* --- clause 3: no typed number in the rendering path --- */

/**
 * Strips comments and Tailwind class names: a padding scale is not a figure.
 *
 * The class name stripper walks BRACES rather than matching a regex, because a
 * conditional className is `className={a ? 'x' : 'y'}` and a regex anchored on a
 * quote after the brace walks straight past it. The first version did exactly
 * that and let `text-amber-200` through as the number 200.
 */
function stripClassNames(source) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const at = source.indexOf('className=', i)
    if (at === -1) {
      out += source.slice(i)
      break
    }
    out += source.slice(i, at) + 'className=""'
    let j = at + 'className='.length
    if (source[j] === '{') {
      let depth = 0
      do {
        if (source[j] === '{') depth += 1
        else if (source[j] === '}') depth -= 1
        j += 1
      } while (j < source.length && depth > 0)
    } else if (source[j] === '"' || source[j] === "'" || source[j] === '`') {
      const quote = source[j]
      j += 1
      while (j < source.length && source[j] !== quote) j += 1
      j += 1
    }
    i = j
  }
  return out
}

function renderingCode(source) {
  return stripClassNames(
    source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split(String.fromCharCode(10))
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join(String.fromCharCode(10)),
  )
}

const NUMBER = /(?<![\w.[])\d+(?:\.\d+)?(?![\w%\]])/g
const CURRENCY = /['"`](?:AUD|USD|GBP|NZD|EUR|\$)['"`]|\$\d/
const PERCENT_LITERAL = /\d+(?:\.\d+)?\s*%|['"`]\d+(?:\.\d+)?\s*per cent/

/*
 * COMPOSE IS SCANNED TOO, and it is the file that matters most. It is where
 * every figure is worked out, so it is where a typed number would do the
 * damage, and the exception list below exists precisely for its arithmetic.
 * Leaving it out left the allowance describing a file nothing read.
 */
for (const [file, source] of [
  [PAGE, page],
  [PRESENT, present],
  [COMPOSE, compose],
]) {
  const code = renderingCode(source)
  for (const match of code.matchAll(NUMBER)) {
    if (ALLOWED_NUMBERS.includes(match[0])) continue
    const line = code.slice(0, match.index).split(String.fromCharCode(10)).length
    faults.push(
      `${relative(ROOT, file)}:${line}: the number ${match[0]} is written into the rendering path. Every figure on this page is a read; the allowed exceptions are ${ALLOWED_NUMBERS.join(', ')} and they are listed in this guard by name.`,
    )
  }
  if (CURRENCY.test(code)) {
    faults.push(
      `${relative(ROOT, file)}: a currency is written into the rendering path. The currency is read from the orders the money was actually taken in.`,
    )
  }
  if (PERCENT_LITERAL.test(code)) {
    faults.push(
      `${relative(ROOT, file)}: a percentage is written into the rendering path. The commission rate arrives from pricing_rules and is never typed.`,
    )
  }
}

/* --- clause 4: the database refuses an unsourced snapshot --- */

let migrationCount = 0
{
  let sql = ''
  if (existsSync(MIGRATIONS)) {
    const names = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
    migrationCount = names.length
    for (const n of names) sql += readFileSync(join(MIGRATIONS, n), 'utf8') + '\n'
  }
  const flat = sql.replace(/\s+/g, ' ').toLowerCase()
  if (!flat.includes('create or replace function public.marketing_proof_every_figure_is_sourced')) {
    faults.push(
      'no migration defines public.marketing_proof_every_figure_is_sourced, so a stored snapshot can hold a figure nothing sources.',
    )
  }
  if (!flat.includes('constraint marketing_proof_snapshot_every_figure_is_sourced check (public.marketing_proof_every_figure_is_sourced(figures, sources))')) {
    faults.push(
      'no migration puts the every-figure-is-sourced check on public.marketing_proof_snapshot, so the rule lives only in application code.',
    )
  }
}

declareWork('proof-page-every-number-sourced', {
  did: {
    'rendering path file read': 3,
    'figure judged': assignments.length,
    'migration read': migrationCount,
  },
  // 'unsourced or typed figure' made the shared pluraliser print "0 unsourced ors
  // typed figure": it reads 'typed' as the first participle and pluralises the word
  // before it, which was 'or'. A label whose head noun comes first, with the
  // qualifier after a preposition, is handled correctly.
  found: { 'figure with no source behind it': faults.length },
})

console.log(
  `${TAG} judged ${assignments.length} figure(s) across ${declaredKeys.length} registered key(s), and the snapshot constraint in ${migrationCount} migration(s)`,
)

if (faults.length > 0) {
  for (const fault of faults) console.error(`${TAG} FAIL: ${fault}`)
  console.error(`${TAG} ${faults.length} fault(s).`)
  process.exit(1)
}

console.log(`${TAG} OK`)
