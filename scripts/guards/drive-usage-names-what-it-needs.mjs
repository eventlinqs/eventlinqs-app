/**
 * A DRIVE'S DOCUMENTED COMMAND NAMES EVERYTHING THAT DRIVE ACTUALLY NEEDS.
 *
 * WHY THIS EXISTS, written from the incidents rather than from a principle.
 * Three of them, all on 14 September 2026, all in lane B's own drives, and all
 * found by the one method that finds them: running exactly what the header said.
 *
 *   an1-consent-drive       its header named the two Node loader flags NOT AT
 *                           ALL. Run as documented it failed
 *                           `the-confirmation-email-carries-a-link` with "no
 *                           confirmation link was printed", then
 *                           `confirming-makes-them-an-organiser` with "the
 *                           account's role is attendee after confirming", and
 *                           then THREW ERR_MODULE_NOT_FOUND on server-only part
 *                           way through, leaving later checks unexecuted. Run
 *                           with SERVER_LOG and the two loader flags: 36 of 36.
 *
 *   pl1-loops-drive         its header named the loaders and not SERVER_LOG.
 *                           Run as documented: 28 of 31, the three failures
 *                           being the confirmation link, the role after
 *                           confirming, and "the weekly query counted 0
 *                           referred signup(s) this week". With SERVER_LOG
 *                           pointed at the running server: 31 of 31.
 *
 *   ft1-forecast-drive      a different shape of the same disease, and the
 *                           reason this rule is about REPRODUCIBILITY rather
 *                           than about flags. Its fee check wrote a
 *                           pricing_rules row directly and invalidated nothing,
 *                           so it read a 60 second cache that the product
 *                           itself clears on every admin edit, and it reported
 *                           the stale figure as the page's answer. For about an
 *                           hour that looked like the fee law being broken.
 *
 * THE PROPERTY THAT MAKES THIS WORTH A GUARD is the one that makes the
 * shared-log defect worth one: THE DAMAGE LANDS IN THE HARNESS'S OWN EVIDENCE,
 * so a setup error reads as a product defect. Every message quoted above
 * accuses the product. Not one of them was about the product. And a closure
 * block citing a drive nobody else can reproduce is a closure block resting on
 * somebody's shell history.
 *
 * WHAT IT CHECKS. For every drive under scripts/verify it reads the file, works
 * out what that file NEEDS, and requires the header comment to name it.
 *
 *   needs the src alias loader   a module in the chain imports through the @/
 *                                alias, which node cannot resolve. NOT merely
 *                                that the file is TypeScript: node 24 strips
 *                                types natively, and the first version of this
 *                                guard failed positioning-drive for importing a
 *                                .ts file that imports nothing at all.
 *   needs the server-only shim   a module in the chain declares server-only, OR
 *                                imports @sentry/nextjs. Both are stubbed by
 *                                scripts/lib/server-only-shim.mjs and both throw
 *                                without it, the second because the installed
 *                                package exports isInitialized only inside a
 *                                Next build.
 *   both are judged over the TRANSITIVE import graph, and over DYNAMIC imports
 *                                as well as static ones, because the module that
 *                                actually threw in an1-consent-drive was reached
 *                                only through an await import().
 *   needs SERVER_LOG             the file reads the console email inbox through
 *                                linkFromInbox. The harness default is
 *                                .tmp-serve.log, which on a three lane machine
 *                                is another lane's file, or a stale one.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, stated so the gap is on the record
 * rather than discovered later. It does not RUN the drives: they need a server,
 * a database and minutes. It does not check UPSTASH_REDIS_REST_URL, because
 * whether a drive touches a rate limited route is not visible in its imports,
 * and a rule that guesses is a rule somebody switches off. And it reads the
 * HEADER comment only, so a correct command written further down the file does
 * not satisfy it, which is deliberate: the header is where a reader looks.
 *
 * THE REVIEWED BASELINE is printed on every run and reports entries that match
 * nothing, so it cannot rot into an unexamined allowlist.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const VERIFY = join(ROOT, 'scripts', 'verify')
const TAG = '[drive-usage-names-what-it-needs]'

/**
 * Drives excused ONE requirement each, with the reason. A drive is never
 * excused wholesale: an entry names the single requirement it cannot meet.
 */
const BASELINE = []

/** The header comment: every line up to the first that is neither comment nor blank. */
export function headerOf(text) {
  const out = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t === '' || t.startsWith('/*') || t.startsWith('*') || t.startsWith('//') || t === '*/') {
      out.push(line)
      continue
    }
    break
  }
  return out.join('\n')
}

/**
 * The src modules a file imports: STATIC `from '../../src/x.ts'` and DYNAMIC
 * `await import('../../src/x.ts')`.
 *
 * The dynamic half is not tidiness. an1-consent-drive reaches `signup-sources.ts`,
 * the module that made it throw, ONLY through `await import(...)` at line 452,
 * so a static-only reader judges that drive on a module it never sees.
 */
export function srcImportsOf(text) {
  const out = []
  for (const m of text.matchAll(/from\s+'((?:\.\.\/)+src\/[^']+)'/g)) out.push(m[1])
  for (const m of text.matchAll(/import\(\s*'((?:\.\.\/)+src\/[^']+)'\s*\)/g)) out.push(m[1])
  return [...new Set(out)]
}

const SERVER_ONLY = /^\s*import\s+.server-only.\s*$/m
const ALIAS_IMPORT = /from\s+'@\//
/*
 * The shim stubs TWO specifiers, not one, and the second is the one that caught
 * this guard out an hour after it was written. scripts/lib/server-only-shim.mjs
 * also stubs `@sentry/nextjs`, because src/lib/observability/sentry.ts imports
 * `isInitialized` from it and the installed package only exports that through
 * Next's own build. So a chain that reaches Sentry and never declares
 * `server-only` still needs the shim.
 *
 * Found by fixing ga2-matcher-drive to import the product's own
 * invalidateFeatureFlag: that reaches src/lib/flags/broadcast.ts, which reaches
 * Sentry, and the drive died on
 *   SyntaxError: The requested module '@sentry/nextjs' does not provide an
 *   export named 'isInitialized'
 * while this guard called its header complete. A guard that judges a rule
 * narrower than the runtime's is a guard that certifies a command that fails.
 */
const SENTRY_IMPORT = /from\s+'@sentry\/nextjs'/

/**
 * Walk a src module and everything it imports, and report what a plain `node`
 * would trip over.
 *
 * THE DISTINCTION THIS DRAWS, and it was got wrong first: a `.ts` file is NOT
 * on its own a reason to need the alias loader. Node 24 strips types natively,
 * so `src/lib/brand/positioning.ts`, which imports nothing at all, is imported
 * by plain `node` successfully, and the first version of this guard reported
 * positioning-drive as a defect for naming no loader. That was a false positive
 * and it was caught by running the documented command and watching it get past
 * the import.
 *
 * What actually needs each one, established by running them rather than by
 * reading them:
 *   the ALIAS LOADER   a module in the chain imports through the `@/` alias,
 *                      which Node cannot resolve.
 *   the SERVER-ONLY    a module in the chain declares `server-only`, which is a
 *   SHIM               package that does not exist outside Next, OR imports
 *                      `@sentry/nextjs`, whose `isInitialized` export exists
 *                      only inside a Next build. The shim stubs BOTH, and `why`
 *                      carries which one, because the two failures read nothing
 *                      alike: ERR_MODULE_NOT_FOUND for the first and a
 *                      SyntaxError about a missing named export for the second.
 */
export function walkSrcModule(startPath, seen = new Set(), found = { alias: false, needsShim: false, why: null }) {
  const abs = resolve(VERIFY, startPath)
  if (seen.has(abs)) return found
  seen.add(abs)
  if (!existsSync(abs)) return found
  const text = readFileSync(abs, 'utf8')
  if (SERVER_ONLY.test(text)) {
    found.needsShim = true
    found.why = found.why ?? 'declares server-only'
  }
  if (SENTRY_IMPORT.test(text)) {
    found.needsShim = true
    found.why = found.why ?? 'imports @sentry/nextjs, whose isInitialized only exists inside a Next build'
  }
  if (ALIAS_IMPORT.test(text)) found.alias = true
  const here = dirname(abs)
  const next = []
  for (const m of text.matchAll(/from\s+'@\/([^']+)'/g)) next.push(join(ROOT, 'src', m[1]))
  for (const m of text.matchAll(/from\s+'(\.[^']+)'/g)) next.push(join(here, m[1]))
  for (const candidate of next) {
    /*
     * The candidate as written FIRST, but only when it is a FILE. The first
     * version guarded this with `p !== candidate`, which is false whenever the
     * extension being tried is the empty one, so an import written with its
     * extension (`'./heard-from.ts'`) was never followed and the walk then
     * looked for `heard-from.ts.ts`. A directory has to be excluded too, which
     * is what that condition was reaching for; `isFile` says it directly.
     */
    for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
      const p = candidate + ext
      if (existsSync(p) && statSync(p).isFile()) {
        walkSrcModule(p, seen, found)
        break
      }
    }
  }
  return found
}

/** What one drive needs, and whether its header says so. Exported for the drill. */
export function analyseDrive(name, text) {
  const header = headerOf(text)
  const srcImports = srcImportsOf(text)
  const needs = []
  const aliasFrom = srcImports.find((rel) => walkSrcModule(rel).alias)
  if (aliasFrom) {
    needs.push({
      what: 'src-alias-loader',
      because: aliasFrom + ' reaches a module that imports through the @/ alias, which node cannot resolve',
      satisfied: /src-alias-loader/.test(header),
    })
  }
  const shimFrom = srcImports.map((rel) => [rel, walkSrcModule(rel)]).find(([, r]) => r.needsShim)
  if (shimFrom) {
    needs.push({
      what: 'server-only-shim',
      because: shimFrom[0] + ' reaches a module that ' + shimFrom[1].why,
      satisfied: /server-only-shim/.test(header),
    })
  }
  /*
   * NEEDS THE CACHE STORE, and this requirement is here because this guard's own
   * header used to say it could not be judged: "It does not check
   * UPSTASH_REDIS_REST_URL, because whether a drive touches a rate limited route
   * is not visible in its imports, and a rule that guesses is a rule somebody
   * switches off." That reasoning is sound for a RATE LIMITED ROUTE and does not
   * cover this, which is visible in the imports and needs no guess: a drive that
   * imports an `invalidate*` function is clearing a cache, and on this machine
   * that cache lives in the store the server was started with. A drive process
   * without it logs "Redis disabled" and the invalidation is a silent no-op.
   *
   * 14 September 2026, ft1-forecast-drive, run exactly as its header said:
   *
   *     FAIL  ft1.configuration.the-fee-on-screen-moves-when-the-configuration-moves
   *     the fee read $68.50, then $68.50 ... and $68.50
   *
   * which says the displayed fee does not follow pricing_rules, and that would
   * mean the shown fee can drift from the charged fee. With the store named in
   * the command: $68.50, then $143.50, then $68.50, 29 of 29. The page was right
   * the whole time and the harness accused it, which is the precise failure mode
   * this guard exists for.
   */
  if (/import\s*\{[^}]*\binvalidate[A-Za-z0-9_]*\b[^}]*\}\s*from\s*'(?:\.\.\/)+src\//.test(text)) {
    needs.push({
      what: 'UPSTASH_REDIS_REST_URL',
      because:
        'it imports an invalidate function out of src/, and without that store the invalidation is a ' +
        'silent no-op that reads back as the product ignoring its own configuration',
      satisfied: /UPSTASH_REDIS_REST_URL/.test(header),
    })
  }
  if (/\blinkFromInbox\b/.test(text)) {
    needs.push({
      what: 'SERVER_LOG',
      because: 'it reads the console email inbox with linkFromInbox, and the harness default is another lane log',
      satisfied: /SERVER_LOG/.test(header),
    })
  }
  return { name, needs }
}

function main() {
  const files = existsSync(VERIFY)
    ? readdirSync(VERIFY).filter((f) => f.endsWith('-drive.mjs')).sort()
    : []
  const problems = []
  let requirements = 0
  const matched = new Set()

  for (const f of files) {
    const { needs } = analyseDrive(f, readFileSync(join(VERIFY, f), 'utf8'))
    requirements += needs.length
    for (const need of needs) {
      const excused = BASELINE.find((b) => b.drive === f && b.requirement === need.what)
      if (excused) {
        matched.add(f + ':' + need.what)
        continue
      }
      if (!need.satisfied) {
        problems.push(f + ': the header never names ' + need.what + ', and ' + need.because)
      }
    }
  }

  console.log(TAG + ' reviewed baseline (' + BASELINE.length + '), printed every run on purpose:')
  for (const b of BASELINE) {
    const stale = matched.has(b.drive + ':' + b.requirement) ? '' : '  STALE: it matches nothing now, delete it'
    console.log(TAG + '   ' + b.drive + ' excused ' + b.requirement + ': ' + b.why + stale)
  }
  if (BASELINE.length === 0) console.log(TAG + '   (none: every drive meets the rule as the tree stands)')

  declareWork('drive-usage-names-what-it-needs', {
    did: { 'drive read': files.length, 'requirement judged': requirements },
    found: { 'header that does not name what its drive needs': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(TAG + ' FAIL - ' + problems.length + ' drive header(s) document a command that does not work:')
    for (const p of problems) console.error('    ' + p)
    console.error('')
    console.error('  A drive is the evidence behind a closure block. A header naming less than')
    console.error('  the drive needs fails as a PRODUCT defect rather than as a setup error:')
    console.error('  "no confirmation link was printed", "the role is attendee after confirming".')
    console.error('  Put the whole command in the header, then run exactly what it says.')
    process.exitCode = 1
    return
  }
  console.log(TAG + ' PASS - ' + files.length + ' drive(s), ' + requirements + ' requirement(s), every header names what its drive needs.')
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
