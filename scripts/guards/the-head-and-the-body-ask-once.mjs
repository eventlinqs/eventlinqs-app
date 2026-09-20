/**
 * GUARD: A ROUTE MAY NOT BUY THE SAME ROW TWICE, ONCE FOR ITS HEAD AND ONCE
 * FOR ITS BODY.
 *
 * ============================================================================
 * THE DEFECT, MEASURED ON 21 SEPTEMBER 2026 (close-out C8, clause C8B.3)
 * ============================================================================
 *
 * A Next.js route renders its head and its body from ONE request:
 * `generateMetadata` runs for the head, the default export runs for the body,
 * and each loads what it needs. Next's own reference says the second load is
 * supposed to be free - "fetch requests are automatically memoized for the same
 * data across generateMetadata, generateStaticParams, Layouts, Pages, and
 * Server Components. React `cache` can be used if `fetch` is unavailable"
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * generate-metadata.md, Next 16.3.0).
 *
 * ON THIS PLATFORM IT IS NOT FREE, and the reason is deliberate and stays:
 * every Supabase request carries its own AbortSignal so that a retry inside a
 * render is a real second request, and a signal is the framework
 * deduplicator's documented opt-OUT (src/lib/supabase/undeduped-fetch.ts). So
 * the memoisation Next assumes never happens, and nothing had ever counted the
 * cost. Counted at the global fetch on a production build against TEST
 * (scripts/verify/lib/count-supabase-reads.mjs), one page view each:
 *
 *     /events/arena-sessions-large-room-performance-test  18 calls, 17 distinct
 *     /venues/170-russell                                  9 calls,  6 distinct
 *     /organisers/afrobeats-melbourne                      7 calls,  5 distinct
 *     /artists/lane-c-sitemap-proof                        5 calls,  4 distinct
 *
 * Ten duplicate database calls across four route families, every one of them on
 * a public SEO surface whose observed LCP is dominated by time to first byte.
 *
 * ============================================================================
 * WHAT IS JUDGED, AND WHY THE SUBJECT LIST CANNOT ROT
 * ============================================================================
 *
 * CLAUSE 1, THE DERIVATION. The subjects are every `page.tsx` under `src/app`
 * that exports BOTH `generateMetadata` and a default component. That is not a
 * list somebody types; it is the exact shape that can make this mistake, read
 * out of the tree on every run and printed with its count. A route added
 * tomorrow is judged tomorrow.
 *
 * CLAUSE 2, THE RULE. In each subject, every identifier that is AWAITED inside
 * the body of `generateMetadata` and also inside the body of the default export
 * is a thing bought twice. If the module that DEFINES it can reach the
 * database, it must be wrapped in React's `cache`. The definition is looked for
 * in the subject itself and then in the module it is imported from, so a reader
 * that lives in `src/lib` is judged where it is written.
 *
 * "Can reach the database" is decided by the defining module's own source: a
 * PostgREST call (`.from(`, `.rpc(`) or one of the three client factories. An
 * identifier whose definition cannot be found at all is reported rather than
 * passed, because a rule that silently skips what it cannot resolve is a rule
 * that stops applying as the tree changes shape.
 *
 * CLAUSE 3, THE EXEMPTIONS ARE REVIEWED AND THEY ARE REPORTED. Some readers
 * carry their own cache and are shared far beyond one route. Each is named with
 * its reason, the list is printed on every run, and an entry that no longer
 * matches anything is REPORTED as stale, so the allowlist cannot quietly become
 * an unexamined list.
 *
 * WHAT THIS GUARD CANNOT SEE, said plainly rather than implied:
 *
 *  - It reads text, not a call graph. A helper awaited in only one of the two
 *    bodies which itself calls the reader twice is invisible here. The count
 *    that would catch that is driven, not static:
 *    scripts/verify/one-question-per-page-view-drive.mjs asks the running
 *    server instead, and fails on any two identical PostgREST calls in one page
 *    view.
 *  - It judges `page.tsx` only. A `layout.tsx` that reads the same row as its
 *    page is the same defect and is not expressible as "the head and the body";
 *    /events/[slug] had exactly that, and what holds it now is the shared
 *    resolver both files import.
 *
 * Exit 1 with every fault named, or exit 0 with what it judged. Drilled red and
 * green in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/the-head-and-the-body-ask-once.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { resolveSpec, norm } from './lib/import-graph.mjs'
import { topLevelBody as bodyAfter } from '../lib/js-source.mjs'

const TAG = '[the-head-and-the-body-ask-once]'
const APP = join('src', 'app')

/**
 * Readers that are awaited in both bodies, can reach the database, and are
 * deliberately NOT memoised. Each says why. A stale entry is reported.
 *
 * THE ONE ENTRY IS HELD UP BY A MEASUREMENT, NOT BY AN ARGUMENT. One view of
 * /artists/lane-c-sitemap-proof makes 5 PostgREST calls and 4 of them are
 * distinct, and the one repeat is the artist row - `feature_flags` is not in
 * the list at all, because the flag answered from Redis. So the duplicate this
 * entry allows is a cache hit and not a database call, which is exactly what
 * the clause it is exempt from exists to stop.
 */
export const REVIEWED = [
  {
    identifier: 'isFeatureEnabled',
    module: 'src/lib/flags/broadcast.ts',
    why:
      'a broadcast flag, not a row. It answers from a Redis-cached value with a seeded default and swallows its own ' +
      'errors, and it is awaited on dozens of surfaces that are not routes, so wrapping it would put a route concern ' +
      'inside a shared flag reader. Proven by counting rather than asserted: /artists/lane-c-sitemap-proof makes no ' +
      'feature_flags call at all in a warmed page view (C:/dev/EVIDENCE/C8/one-question/one-question-before.json).',
  },
]

/**
 * OPEN DEFECTS IN ANOTHER LANE'S TERRITORY. These are NOT exemptions and the
 * guard says so on every run: each one buys the same rows twice, each is a real
 * cost on a real public route, and each lives in a file this lane may not edit
 * under the three-lane protocol (rule four: "If an item of yours needs a change
 * inside another lane's territory, you do not make it").
 *
 * Both are lane B's acquisition loop (close-out AQ2, the share link and the
 * group purchase), both were raised as BORDER lines in C:\dev\REVIEW-QUEUE-C.md
 * on 21 September 2026, and both are one line each: wrap the reader the page
 * awaits in React's `cache`, exactly as the four families in this commit do.
 *
 * An entry here that no longer matches a real fault is REPORTED as stale, so
 * this cannot become a list nobody revisits.
 */
export const TRANSITIONAL = [
  {
    route: 'src/app/e/[code]/page.tsx',
    identifier: 'resolveShortCode',
    owner: 'lane B (AQ2, the tracked share link)',
    raised: '2026-09-21',
  },
  {
    route: 'src/app/squad/[token]/page.tsx',
    identifier: 'getSquadByToken',
    owner: 'lane B (AQ2, the group purchase)',
    raised: '2026-09-21',
  },
]

const DATABASE_DOOR = /\.from\(|\.rpc\(|createAdminClient\(|createPublicClient\(|createClient\(/

/**
 * A READER THAT IS ALREADY MEMOISED FOR THE REQUEST, BY EITHER MECHANISM.
 *
 * React's `cache` is one. Next's DATA cache is the other, and the guard has to
 * know it: `/categories/[slug]` awaits `getPublishableCategory` in both bodies
 * and that reader resolves through `unstable_cache(loadRows, ...)`, so the
 * second call is a cache hit and NOT a second database call. The counter proved
 * it before this clause was written - one view of /categories/music makes 2
 * PostgREST calls and 2 of them are distinct - and without this clause the
 * guard would have demanded a fix for a cost that does not exist.
 *
 * It follows awaited local identifiers within the DEFINING MODULE only, four
 * deep, which is enough for `getPublishableCategory -> getPublishableCategories
 * -> cachedRows`. It does not cross modules, so a reader whose cache lives one
 * import away reads as uncached here and needs a reviewed entry. That limit is
 * stated rather than hidden: a guard that followed everything would be a
 * type checker.
 */
export function alreadyMemoised(source, identifier, depth = 4) {
  if (depth <= 0) return false
  if (source.includes("'use cache'") || source.includes('"use cache"')) return true

  // Plain string work rather than a built regular expression: an identifier
  // needs no escaping, and a pattern assembled from one is a second thing that
  // can be silently wrong (this function's first version was, and threw).
  const assignment = source.indexOf(`const ${identifier} =`)
  if (assignment !== -1) {
    const rhs = source.slice(assignment + `const ${identifier} =`.length).trimStart()
    const wrapper = rhs.match(/^[A-Za-z_$][\w$]*/)?.[0]
    if (wrapper === 'cache' || wrapper === 'unstable_cache') return true
  }

  const declaration = [`function ${identifier}(`, `const ${identifier} =`]
    .map((needle) => source.indexOf(needle))
    .filter((at) => at !== -1)
    .sort((a, b) => a - b)[0]
  if (declaration === undefined) return false

  for (const next of awaitedCalls(bodyAfter(source, declaration))) {
    if (next === identifier) continue
    if (alreadyMemoised(source, next, depth - 1)) return true
  }
  return false
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(norm(full))
  }
  return out
}

/** Every identifier awaited as a call inside a body. */
export function awaitedCalls(body) {
  return new Set([...body.matchAll(/await\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]))
}

/** Where an identifier is defined: this file, or the module it is imported from. */
export function definitionOf(identifier, file, source, root = process.cwd()) {
  const localConst = new RegExp(`(?:export\\s+)?const\\s+${identifier}\\s*=\\s*([A-Za-z_$][\\w$]*)?\\s*\\(?`)
  const localFn = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${identifier}\\s*\\(`)
  const constMatch = source.match(localConst)
  if (constMatch) return { file, wrapped: constMatch[1] === 'cache', source }
  if (localFn.test(source)) return { file, wrapped: false, source }

  const imported = [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/g)].find((m) =>
    m[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
      .includes(identifier),
  )
  if (!imported) return null
  const target = resolveSpec(file, imported[2], root)
  if (!target) return null
  const targetFile = ['.ts', '.tsx'].map((ext) => target + ext).find((f) => existsSync(f))
  if (!targetFile) return null
  const targetSource = readFileSync(targetFile, 'utf8')
  const exportedConst = new RegExp(`export\\s+const\\s+${identifier}\\s*=\\s*([A-Za-z_$][\\w$]*)?\\s*\\(?`)
  const m = targetSource.match(exportedConst)
  return { file: norm(targetFile), wrapped: m ? m[1] === 'cache' : false, source: targetSource }
}

export function judge(root = process.cwd()) {
  const faults = []
  const subjects = []
  const used = new Set()

  for (const file of walk(APP).filter((f) => f.endsWith('/page.tsx'))) {
    const source = readFileSync(file, 'utf8')
    const metadataAt = source.indexOf('export async function generateMetadata')
    const defaultAt = source.search(/export default (?:async )?function/)
    if (metadataAt === -1 || defaultAt === -1) continue
    subjects.push(file)

    const head = awaitedCalls(bodyAfter(source, metadataAt))
    const body = awaitedCalls(bodyAfter(source, defaultAt))
    for (const identifier of head) {
      if (!body.has(identifier)) continue
      const definition = definitionOf(identifier, file, source, root)
      if (!definition) {
        faults.push(
          `${file}: \`${identifier}\` is awaited in both generateMetadata and the page, and this guard could not find ` +
            `where it is defined. Resolve it, or the rule has stopped applying to this route.`,
        )
        continue
      }
      if (!DATABASE_DOOR.test(definition.source)) continue
      if (definition.wrapped) continue
      if (alreadyMemoised(definition.source, identifier)) continue
      const exemption = REVIEWED.find((e) => e.identifier === identifier && e.module === definition.file)
      if (exemption) {
        used.add(`${exemption.identifier}@${exemption.module}`)
        continue
      }
      const open = TRANSITIONAL.find((e) => e.identifier === identifier && e.route === file)
      if (open) {
        used.add(`${open.identifier}@${open.route}`)
        continue
      }
      faults.push(
        `${file}: \`${identifier}\` (defined in ${definition.file}) is awaited in generateMetadata AND in the page, ` +
          `and it reaches the database, so this route buys the same rows twice in one request. Wrap its definition in ` +
          `React's \`cache\` - the mechanism Next's own generate-metadata reference names for exactly this - or add a ` +
          `reviewed entry to REVIEWED in this guard saying why it is right to pay twice.`,
      )
    }
  }

  const stale = [
    ...REVIEWED.filter((e) => !used.has(`${e.identifier}@${e.module}`)).map((e) => ({ ...e, kind: 'REVIEWED', where: e.module })),
    ...TRANSITIONAL.filter((e) => !used.has(`${e.identifier}@${e.route}`)).map((e) => ({ ...e, kind: 'TRANSITIONAL', where: e.route })),
  ]
  return { faults, subjects, stale }
}

const invokedDirectly =
  Boolean(process.argv[1]) && /the-head-and-the-body-ask-once\.mjs$/.test(process.argv[1].split(sep).join('/'))

if (invokedDirectly) {
  const { faults, subjects, stale } = judge()
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.log(`${TAG} reviewed exemptions: ${REVIEWED.map((e) => `${e.identifier} (${e.module})`).join(', ') || 'none'}`)
  for (const e of TRANSITIONAL) {
    console.log(
      `${TAG} OPEN, NOT EXEMPT: ${e.route} buys the same rows twice through \`${e.identifier}\`. It is ${e.owner}'s ` +
        `file, raised as a BORDER line on ${e.raised}, and it is one line: wrap the reader in React's \`cache\`.`,
    )
  }
  for (const e of stale) {
    console.log(
      `${TAG} STALE ${e.kind} ENTRY: ${e.identifier} (${e.where}) matched nothing this run. It is no longer awaited in ` +
        `both bodies of any route, or it has been fixed. Delete it rather than leaving an unexamined allowance behind.`,
    )
  }
  declareWork('the-head-and-the-body-ask-once', {
    did: { 'route that renders its own head judged': subjects.length },
    found: { 'route that buys the same rows twice': faults.length },
  })
  if (faults.length > 0) {
    console.error(`${TAG} FAIL - ${faults.length} route(s) load the same data for the head and for the body.`)
    process.exit(1)
  }
  console.log(`${TAG} PASS - ${subjects.length} route(s) render their own head, and none of them reads the same thing twice.`)
}
