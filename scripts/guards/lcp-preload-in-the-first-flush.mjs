/**
 * GUARD: on a route whose Largest Contentful Paint element is an image the
 * DATABASE chooses, that image is rendered by the page component itself and not
 * behind a streaming boundary, so its preload leaves in the first chunk of the
 * response.
 *
 * ============================================================================
 * WHY, AND THE 597 MS THAT PAID FOR IT (close-out C8B.3, 18 September 2026)
 * ============================================================================
 *
 * This guard exists because the opposite was tried, measured and reverted, and
 * without it the same change is one plausible refactor away from landing again
 * with nothing to notice.
 *
 * THE CHANGE THAT LOOKED RIGHT. The homepage wrote nothing to the socket until
 * every server-side await had resolved, so its two render-blocking stylesheets
 * (29.5 KB and 2.6 KB) and 62.7 KB of fonts could not start downloading until
 * the first byte. Measured on the mobile profile, they were requested at
 * 2904 ms against a first byte at 2890 ms: the server's entire response time
 * was dead time for the resources that block the paint. Making the page
 * component synchronous and putting its body behind `<Suspense>` fixed exactly
 * that, and the first chunk then carried the whole `<head>` at 27 ms.
 *
 * THE MEASUREMENT THAT KILLED IT. Median of 5, mobile, warmed, same harness
 * (scripts/perf/lh-local-median.mjs), same route, same machine speed
 * (benchmarkIndex 2402 against 2369, inside this laptop's normal spread):
 *
 *                        champion        with the boundary
 *     performance          0.91              0.85
 *     LCP                  3303 ms           3900 ms
 *     TBT                   149 ms            121 ms
 *     main thread          3240 ms           2964 ms
 *     script                190 KB            190 KB
 *     LCP time to first byte 354 ms            30 ms
 *     LCP resource load delay 20 ms           527 ms
 *     LCP element render delay 175 ms         403 ms
 *
 * The first byte fell by 324 ms exactly as designed, and the hero's DISCOVERY
 * rose by 507 ms, so the paint landed 597 ms later and the score fell six
 * points. Evidence: C:\dev\EVIDENCE\C8B3-FLUSH\{champion,challengerA}-home.json.
 *
 * WHY IT IS STRUCTURAL AND NOT A TUNING PROBLEM. The LCP element on these
 * routes is a photograph the query chooses, so its URL cannot be known before
 * the query. Flushing the shell before the query therefore CANNOT carry the
 * hero's preload with it; it can only carry the stylesheet, the fonts and the
 * scripts, which then take the throttled link's bandwidth during the window the
 * hero would have used. Every millisecond won on the first byte is spent twice
 * over on discovering the image.
 *
 * So the rule is not "never stream". It is: the element that decides the paint
 * is preloaded from the first chunk, and anything below it may stream freely.
 * The homepage already does the second half, with `<Suspense>` around This Week
 * and the city rail, and those boundaries are correct and untouched.
 *
 * ============================================================================
 * THE CLAUSES
 * ============================================================================
 *
 *   1. The hero component named in the registry is rendered in the DEFAULT
 *      EXPORT's own body. Moving it into a child the page renders behind a
 *      boundary is the exact change that was measured and reverted, and it
 *      leaves clause 2 with nothing to find.
 *   2. It is not nested inside a `<Suspense>` in that body. Boundaries BELOW it
 *      are fine and are not counted: nesting is tracked, not presence.
 *   3. The registry has not rotted: the page file and the hero's own component
 *      file are both on disk.
 *
 * ============================================================================
 * WHAT THIS STATIC GUARD CANNOT SEE
 * ============================================================================
 *
 * Whether the preload actually leaves in the first chunk. A hero rendered
 * directly by a page whose PARENT layout awaits would still be late, and no
 * reading of one file settles when a byte left the socket.
 * scripts/verify/lcp-preload-first-flush-drive.mjs opens the response as a
 * stream and asserts the preload is in the first chunk, at 390, 768 and 1440.
 * Both are required and neither replaces the other.
 *
 * Exit 1 with every fault, or exit 0 with the count of routes checked.
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()

/**
 * The reviewed routes. `hero` is the component that renders the LCP image and
 * `why` records the measurement that put the entry here, so a later reader can
 * tell an established number from an assumed one.
 */
export const LCP_FIRST_FLUSH_ROUTES = [
  {
    file: 'src/app/page.tsx',
    hero: 'FeaturedHero',
    heroFile: 'src/components/features/home/FeaturedHero.tsx',
    why: 'the homepage: putting this hero behind a streaming boundary moved its discovery from 20 ms to 527 ms and cost 597 ms of LCP and six points of performance score, measured median of 5 at matched machine speed (close-out C8B.3, 18 September 2026)',
  },
]

/**
 * A block comment is commentary on every one of its lines. The header of
 * src/app/page.tsx explains this defect by naming the shape it must not have,
 * and a guard that reads prose as code is a guard whose explanations get
 * deleted rather than its defects.
 */
export function stripComments(source) {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/** The body of the default export, by brace matching from its opening `{`. */
export function defaultExportBody(code) {
  const start = code.search(/export\s+default\s/)
  if (start < 0) return null
  const open = code.indexOf('{', start)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}') {
      depth -= 1
      if (depth === 0) return code.slice(open, i + 1)
    }
  }
  return null
}

/**
 * How deeply `<hero` is nested inside `<Suspense>` boundaries, walking the body
 * in order. Returns null when the hero is not rendered in this body at all.
 *
 * PRESENCE IS NOT NESTING, and that distinction is the whole guard. The
 * homepage renders two legitimate `<Suspense>` boundaries BELOW the hero, so a
 * clause that merely asked whether the body contains `<Suspense` would fail a
 * correct page and teach somebody to delete the boundaries that are right.
 */
export function heroSuspenseDepth(body, hero) {
  const token = /<Suspense[\s>]|<\/Suspense>|<HERO[\s/>]/g
  const source = body.replace(new RegExp(`<${hero}(?=[\\s/>])`, 'g'), '<HERO')
  let depth = 0
  let found = null
  for (let m = token.exec(source); m; m = token.exec(source)) {
    if (m[0].startsWith('</Suspense')) depth -= 1
    else if (m[0].startsWith('<Suspense')) depth += 1
    else if (found === null) found = depth
  }
  return found
}

export function judgeRoute(entry, source) {
  const faults = []
  const code = stripComments(source)
  const body = defaultExportBody(code)
  if (body === null) {
    faults.push(
      `${entry.file}: no default export could be read, so this guard cannot tell what the route renders ` +
        'first. It refuses rather than passing what it cannot see.',
    )
    return faults
  }
  const depth = heroSuspenseDepth(body, entry.hero)
  if (depth === null) {
    faults.push(
      `${entry.file}: its default export does not render <${entry.hero}>. The LCP image has been moved into ` +
        'a child component, and if that child sits behind a streaming boundary its preload no longer leaves ' +
        'in the first chunk. That exact change was measured and reverted: it cost 597 ms of LCP. ' +
        `(${entry.why})`,
    )
  } else if (depth > 0) {
    faults.push(
      `${entry.file}: <${entry.hero}> is rendered ${depth} <Suspense> boundary/boundaries deep. The element ` +
        'that decides the paint must be preloaded from the first chunk; boundaries BELOW it are fine and are ' +
        'not counted.',
    )
  }
  return faults
}

export function scan(routes = LCP_FIRST_FLUSH_ROUTES, root = ROOT) {
  const faults = []
  for (const entry of routes) {
    for (const [label, rel] of [
      ['page', entry.file],
      ['hero component', entry.heroFile],
    ]) {
      if (!existsSync(resolve(join(root, rel)))) {
        faults.push(
          `${rel}: on the reviewed list as the ${label} and not on disk. The list has rotted, or the route ` +
            'moved and took its LCP contract with it unnoticed.',
        )
      }
    }
    const full = resolve(join(root, entry.file))
    if (!existsSync(full)) continue
    faults.push(...judgeRoute(entry, readFileSync(full, 'utf8')))
  }
  return faults
}

const invokedDirectly =
  process.argv[1] && /lcp-preload-in-the-first-flush\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const faults = scan()
  if (faults.length) {
    console.error(
      `FAIL lcp-preload-in-the-first-flush: ${faults.length} fault(s) across ${LCP_FIRST_FLUSH_ROUTES.length} reviewed route(s):`,
    )
    for (const f of faults) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log(
    `lcp-preload-in-the-first-flush: ${LCP_FIRST_FLUSH_ROUTES.length} reviewed route(s), every LCP image rendered ` +
      'by the page itself and ahead of every streaming boundary',
  )
}
