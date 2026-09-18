/**
 * GUARD: a route whose responses are shared at the edge may not render anything
 * that belongs to one visitor.
 *
 * ============================================================================
 * WHY THIS EXISTS, with the defect that produced it
 * ============================================================================
 *
 * Found on 18 September 2026 while measuring C8, and it was live on production.
 *
 * `next.config.ts` gave `/events` a public edge-cache policy:
 *
 *     source: '/events'
 *     CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=300
 *
 * and the comment above it read "Both routes are anonymous (no cookies in the
 * render path), so a shared cached response is safe". That was true of
 * `/events/:slug`, which renders `<SiteHeader staticSafe />` AND carries a
 * `missing` cookie condition. It was FALSE of `/events`, which rendered the
 * ordinary `<SiteHeader />`. That header reads the session and renders the
 * signed-in visitor's initials and display name into the markup, and
 * `deriveAccountUser` falls back to THE LOCAL PART OF THEIR EMAIL ADDRESS when
 * the profile carries no name.
 *
 * So one signed-in visitor's identity was storable at Vercel's edge and
 * servable to every other visitor of /events for up to 60 seconds, and 300 more
 * while stale. Driven against the production build before the fix:
 *
 *     /events        with Cookie: el-signed-in=1  ->  CDN-Cache-Control: public, s-maxage=60
 *     /events/:slug  with Cookie: el-signed-in=1  ->  (withheld)
 *
 * Production confirmed the cache was real and not theoretical: `/events`
 * answered `X-Vercel-Cache: HIT` with `Age: 80`.
 *
 * ============================================================================
 * WHY BOTH HALVES, AND WHY NEITHER ALONE IS ENOUGH
 * ============================================================================
 *
 * `missing: [{ type: 'cookie', key: 'el-signed-in' }]` stops a signed-in
 * render from ever being STORED: the header rule's condition is evaluated
 * against the incoming request, so a request carrying the marker never receives
 * the cacheable header.
 *
 * It does not stop a signed-in visitor being SERVED a stored anonymous copy.
 * `src/lib/auth/signed-in-marker.ts` records that measurement from the C13
 * preview: "the edge looks a URL up before any function runs and cookies are
 * not part of its key", so a holder was served a stranger's cached 404. Which
 * means a publicly cached route must ALSO render the same thing for everybody,
 * or the visitor who gets the cached copy gets somebody else's page. That is
 * what `staticSafe` is for, and it is why all three of this route family's
 * siblings already used it.
 *
 * Neither half is redundant: `missing` protects the STORE, `staticSafe`
 * protects the SERVE.
 *
 * ============================================================================
 * THE CLAUSES
 * ============================================================================
 *
 *   1. Every public `CDN-Cache-Control` rule in next.config.ts names a source
 *      that maps to a page route that exists under src/app. A rule for a route
 *      that has been renamed protects nothing and hides that it protects
 *      nothing.
 *   2. That page never renders the per-viewer header. It must render
 *      `<SiteHeader staticSafe`, and must not render a bare `<SiteHeader />`
 *      or reach the header through `PageShell`, which renders the per-viewer
 *      one.
 *   3. Every such rule carries the `missing` cookie condition naming the signed
 *      in marker.
 *   4. No route the indexing policy classifies `never` or `alias` carries a
 *      public rule. Those are the authenticated, transactional and
 *      developer-only surfaces, and a shared cache entry for one of them is the
 *      same defect with a larger blast radius.
 *   5. THE PREMISE IS CHECKED RATHER THAN REMEMBERED. `SiteHeader` still takes
 *      `staticSafe`, still reads the session when it is false, and the cookie
 *      name in next.config.ts still equals `SIGNED_IN_MARKER_COOKIE`. If any of
 *      those stops being true this guard is protecting nothing and should say
 *      so rather than stand there looking busy.
 *   6. The root not-found BOUNDARY renders the anonymous header, because Next
 *      serialises it into the payload of every page rather than only into a
 *      real 404. See below: this is the clause that clause 2 could not see.
 *   7. The rule's `s-maxage` equals the page's own `export const revalidate`.
 *      Both answer "how stale may this page be", in two files read by two
 *      different systems, and until this clause existed the only thing
 *      comparing them was a comment. Added with the /events/browse/:city rule
 *      on 18 September 2026 (close-out C8B.3), which made it the third place
 *      that number is written down.
 *
 * ============================================================================
 * CLAUSE 2 WAS NOT ENOUGH, AND THE DRIVE IS WHAT SAID SO
 * ============================================================================
 *
 * With `/events` fixed and passing `staticSafe`, the driven proof STILL found
 * the visitor's display name and email in its response, and in
 * `/events/browse/melbourne`'s, which has passed `staticSafe` since it was
 * written. The control in that drive is what made it readable: the counts were
 * TWO header payloads on an ordinary page and ONE on a `staticSafe` page, when
 * a working `staticSafe` should have left none.
 *
 * The second header was `src/app/not-found.tsx`, which renders `PageShell`,
 * which renders the per-viewer `SiteHeader`. Next puts the root not-found
 * boundary in EVERY page's RSC payload. Proven rather than assumed: the 404's
 * own copy ("We can't find that page") appears exactly once in the response for
 * `/`, for `/events` and for `/events/browse/melbourne`.
 *
 * WHICH MEANS `/events/[slug]` HAD IT TOO. That route has passed `staticSafe`
 * since C13 and has been publicly edge-cached at s-maxage=300 since then, and
 * its responses carried an identity the whole time. Its `missing` condition is
 * the only thing that has been holding the line, which is exactly why clause 3
 * matters more than it looks.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE, stated rather than implied
 * ============================================================================
 *
 * It reads source text. It cannot prove Vercel cached a given response, and it
 * cannot see per-viewer content that arrives by a route other than the header
 * (a server-rendered "saved" state, a personalised rail). It holds the one
 * shape that has actually gone wrong here, and names the file to read for the
 * rest. The live half is a driven check against a served build:
 * `scripts/verify/edge-cache-headers-drive.mjs`.
 *
 * Run standalone:  node scripts/guards/edge-cache-is-viewer-independent.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[edge-cache-is-viewer-independent]'

const CONFIG = 'next.config.ts'
const HEADER_COMPONENT = 'src/components/layout/site-header.tsx'
const MARKER_MODULE = 'src/lib/auth/signed-in-marker.ts'
const POLICY_MODULE = 'src/lib/seo/indexing-policy.ts'

/**
 * Strip // and /* comments and blank out string bodies, so brace matching and
 * the clause searches below cannot be fooled by punctuation inside either.
 *
 * THIS IS NOT FUSSINESS. The fix that produced this guard put the literal
 * `missing: [{ type: 'cookie', key: 'el-signed-in' }]` inside an explanatory
 * comment directly above the rule it describes. A scanner that read comments
 * would find that text and pass a rule that carries no such condition, which is
 * the guard reporting the documentation instead of the code.
 *
 * String bodies are replaced with spaces of the same length rather than
 * removed, so every index into the result still lines up with the original.
 */
export function stripCommentsAndStrings(source) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      out += ' '.repeat(stop - i)
      i = stop
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
      continue
    }
    const ch = source[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === ch) break
        j += 1
      }
      const stop = Math.min(j + 1, source.length)
      // Keep the quotes so a `source: '...'` match can still find its bounds,
      // and keep the BODY too: these are the route literals the clauses read.
      out += source.slice(i, stop)
      i = stop
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/**
 * Every top-level object inside the array returned by `async headers()`, as
 * text. Brace matching, on the comment-stripped source, so a nested
 * `missing: [{ ... }]` cannot end its own rule early.
 */
export function headerRules(strippedSource) {
  const at = strippedSource.indexOf('async headers()')
  if (at === -1) return null
  const arrayStart = strippedSource.indexOf('return [', at)
  if (arrayStart === -1) return null
  let depth = 0
  let i = strippedSource.indexOf('[', arrayStart)
  const rules = []
  let objectStart = -1
  for (; i < strippedSource.length; i += 1) {
    const ch = strippedSource[i]
    if (ch === '[' || ch === '{') {
      depth += 1
      if (ch === '{' && depth === 2) objectStart = i
      continue
    }
    if (ch === ']' || ch === '}') {
      if (ch === '}' && depth === 2 && objectStart !== -1) {
        rules.push(strippedSource.slice(objectStart, i + 1))
        objectStart = -1
      }
      depth -= 1
      if (depth === 0) break
    }
  }
  return rules
}

/** A rule that asks Vercel's CDN to share the response with everybody. */
export function isPublicEdgeCacheRule(rule) {
  return /CDN-Cache-Control/.test(rule) && /public\s*,\s*s-maxage/.test(rule)
}

/** The `source` literal of a rule, or null when it does not declare one. */
export function sourceOf(rule) {
  const m = rule.match(/source:\s*'([^']+)'/)
  return m ? m[1] : null
}

/**
 * The page file a header `source` addresses. `/events/browse/:city` is
 * `src/app/events/browse/[city]/page.tsx`; `/events` is
 * `src/app/events/page.tsx`. Returns null when no such page exists, which is
 * clause 1's finding rather than a crash.
 */
export function pageFileFor(routeSource, root = ROOT) {
  const segments = routeSource
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? `[${s.slice(1)}]` : s))
  const file = join(root, 'src', 'app', ...segments, 'page.tsx')
  return existsSync(file) ? file : null
}

/** The indexing class of a route, as the policy module writes it. */
export function indexingClassOf(routeSource, policySource) {
  const route = '/' + routeSource.split('/').filter(Boolean).map((s) => (s.startsWith(':') ? `[${s.slice(1)}]` : s)).join('/')
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = policySource.match(new RegExp(`route:\\s*'${escaped}'\\s*,\\s*klass:\\s*'([a-z]+)'`))
  return m ? m[1] : null
}

function read(relative) {
  return readFileSync(join(ROOT, relative), 'utf8')
}

/**
 * Every not-found boundary under src/app, ENUMERATED FROM DISK rather than
 * listed here. A hand-written list would have to be remembered the day somebody
 * adds a segment-level 404, and being remembered is the thing that fails. Today
 * there is one; the guard does not care how many there are.
 */
export function notFoundBoundaries(root = ROOT) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name === 'not-found.tsx') out.push(path.slice(root.length + 1).split('\\').join('/'))
    }
  }
  walk(join(root, 'src', 'app'))
  return out
}

export function main() {
  const problems = []
  let rulesSeen = 0
  let publicRules = 0
  let boundariesChecked = 0

  let shelfLivesCompared = 0

  let markerCookie = null
  try {
    const marker = read(MARKER_MODULE)
    const m = marker.match(/SIGNED_IN_MARKER_COOKIE\s*=\s*'([^']+)'/)
    markerCookie = m ? m[1] : null
    if (!markerCookie) {
      problems.push(
        `${MARKER_MODULE}: SIGNED_IN_MARKER_COOKIE is no longer a plain string literal, so the cookie every ` +
          'clause below keys on could not be read. Either the marker moved or this guard needs teaching where it went.',
      )
    }
  } catch (error) {
    problems.push(`${MARKER_MODULE} is unreadable (${error.message}), so the premise could not be checked.`)
  }

  // Clause 5, the premise. A header that no longer reads the session, or no
  // longer takes staticSafe, makes clause 2 an assertion about nothing.
  try {
    /*
     * STRIPPED, AND THE DRILL IS WHY. The first version of this premise check
     * read the raw file, and `site-header.tsx` explains itself in a doc comment
     * that contains the literal "`auth.getUser()` reads the session cookie". So
     * clause 5 matched the DOCUMENTATION and passed while the drill had renamed
     * the actual call. A guard that reads a comment is reading what somebody
     * once intended, not what runs.
     */
    const header = stripCommentsAndStrings(read(HEADER_COMPONENT))
    if (!/staticSafe\s*=\s*false/.test(header)) {
      problems.push(
        `${HEADER_COMPONENT}: no \`staticSafe = false\` parameter. Clause 2 asks every publicly cached page to pass ` +
          'staticSafe, and if the prop is gone that ask is meaningless. Retire this guard deliberately or teach it the new shape.',
      )
    }
    if (!/auth\.getUser\(\)/.test(header)) {
      problems.push(
        `${HEADER_COMPONENT}: no \`auth.getUser()\` call. This guard exists because the header renders a signed-in ` +
          'visitor\'s identity; if it no longer reads the session, it is protecting nothing and should be reconsidered.',
      )
    }
  } catch (error) {
    problems.push(`${HEADER_COMPONENT} is unreadable (${error.message}), so the premise could not be checked.`)
  }

  let policySource = ''
  try {
    policySource = read(POLICY_MODULE)
  } catch (error) {
    problems.push(`${POLICY_MODULE} is unreadable (${error.message}), so clause 4 could not be checked.`)
  }

  try {
    const stripped = stripCommentsAndStrings(read(CONFIG))
    const rules = headerRules(stripped)
    if (rules === null) {
      problems.push(
        `${CONFIG}: could not find the array returned by \`async headers()\`. This guard reads that array; if the ` +
          'config has been restructured it must be taught the new shape rather than silently finding nothing.',
      )
    } else {
      rulesSeen = rules.length
      for (const rule of rules) {
        if (!isPublicEdgeCacheRule(rule)) continue
        publicRules += 1
        const routeSource = sourceOf(rule)
        if (!routeSource) {
          problems.push(`${CONFIG}: a public CDN-Cache-Control rule declares no \`source\`, so nothing can be checked about it.`)
          continue
        }

        // Clause 3: the store is protected.
        if (markerCookie) {
          const missing = new RegExp(`missing:\\s*\\[\\s*\\{[^}]*key:\\s*'${markerCookie}'`)
          if (!missing.test(rule)) {
            problems.push(
              `${CONFIG}: '${routeSource}' is edge-cached publicly with no \`missing: [{ type: 'cookie', key: '${markerCookie}' }]\`. ` +
                'A signed-in visitor\'s render can then be STORED at the edge and served to strangers. This is the exact defect ' +
                'this guard was written for, found live on /events on 18 September 2026.',
            )
          }
        }

        // Clause 4: never share an authenticated or aliased surface.
        const klass = indexingClassOf(routeSource, policySource)
        if (klass === 'never' || klass === 'alias') {
          problems.push(
            `${CONFIG}: '${routeSource}' is edge-cached publicly but ${POLICY_MODULE} classifies it '${klass}'. ` +
              'Those are the authenticated, transactional and developer-only surfaces; a shared cache entry for one of them ' +
              'hands one visitor\'s page to the next.',
          )
        }

        // Clause 1: the rule addresses a page that exists.
        const page = pageFileFor(routeSource)
        if (!page) {
          problems.push(
            `${CONFIG}: '${routeSource}' is edge-cached publicly but no page route answers it under src/app. ` +
              'A rule for a route that has moved protects nothing and hides that it protects nothing.',
          )
          continue
        }

        // Clause 2: the serve is protected.
        const pageSource = readFileSync(page, 'utf8')
        const withoutComments = stripCommentsAndStrings(pageSource)
        const relative = page.slice(join(ROOT).length + 1).split('\\').join('/')
        const bareHeader = /<SiteHeader\s*\/>/.test(withoutComments)
        const safeHeader = /<SiteHeader\s+staticSafe/.test(withoutComments)
        const viaShell = /<PageShell[\s>]/.test(withoutComments)
        if (bareHeader || viaShell) {
          problems.push(
            `${relative}: renders ${bareHeader ? '<SiteHeader />' : '<PageShell>'} , which reads the session and renders the ` +
              `signed-in visitor's initials and display name, on a route ('${routeSource}') whose responses are shared at the edge. ` +
              'Cookies are not part of the edge cache key, so whatever this renders can be served to any visitor. Pass `staticSafe`.',
          )
        } else if (!safeHeader) {
          problems.push(
            `${relative}: is edge-cached publicly but renders no \`<SiteHeader staticSafe />\`. Either it reaches the header ` +
              'another way, in which case this guard must be taught it, or it renders no header and the entry should say so.',
          )
        }

        /*
         * CLAUSE 7: THE SHELF LIFE IS WRITTEN TWICE AND NOTHING COMPARED THEM.
         *
         * `s-maxage` here and `export const revalidate` there answer the same
         * question - how stale may this page be - in two files that are read by
         * two different systems, which is the exact shape Law 9 records for
         * .nvmrc against the Vercel dashboard: "they disagreed for months with
         * nothing anywhere able to notice".
         *
         * Both directions are a defect, and neither announces itself:
         *   s-maxage > revalidate  the edge keeps serving a copy the origin
         *                          already considers stale, so an organiser
         *                          publishes an event and the city page does
         *                          not show it for longer than the page says
         *   s-maxage < revalidate  the edge re-asks the origin more often than
         *                          the data can have changed, paying for the
         *                          function invocations the cache exists to
         *                          avoid
         *
         * The config's own comments have claimed this agreement in prose since
         * /events was written ("matches the page's `revalidate = 60`"). A
         * comment is not a check, and this repository has been caught by a
         * guard reading documentation instead of code once already (clause 5).
         */
        const sMaxAge = rule.match(/s-maxage=(\d+)/)
        const revalidate = withoutComments.match(/export\s+const\s+revalidate\s*=\s*(\d+)/)
        if (sMaxAge && revalidate) {
          shelfLivesCompared += 1
          if (sMaxAge[1] !== revalidate[1]) {
            problems.push(
              `${CONFIG}: '${routeSource}' shares its response at the edge for s-maxage=${sMaxAge[1]}s, but ${relative} ` +
                `declares \`export const revalidate = ${revalidate[1]}\`. The two numbers answer the same question and ` +
                'disagree, so the page is either served staler than it says or re-rendered more often than it needs to be. ' +
                'Change both or neither.',
            )
          }
        } else if (sMaxAge && !revalidate) {
          problems.push(
            `${CONFIG}: '${routeSource}' shares its response at the edge for s-maxage=${sMaxAge[1]}s, but ${relative} ` +
              'declares no `export const revalidate`. The shelf life of a shared response is then asserted in one file and ' +
              'unknown in the other, so the next person to change how fresh this page is has nothing telling them a copy ' +
              'is also being held at the edge. Declare the matching revalidate on the page.',
          )
        }
      }
    }
  } catch (error) {
    problems.push(`${CONFIG} is unreadable (${error.message}), so no clause could be checked.`)
  }

  /*
   * CLAUSE 6: THE BOUNDARIES THAT SHIP INSIDE EVERY PAGE.
   *
   * Next serialises the root not-found BOUNDARY into the RSC payload of every
   * page, not only into a real 404. Measured on this build against a real
   * session: the 404's copy appeared once in the response for `/`, `/events`
   * and `/events/browse/melbourne`, and it brought a second `SiteHeader` with
   * it, carrying the visitor's display name and email into all three.
   *
   * So a page passing `staticSafe` is not enough on its own, and that is not a
   * theory: `/events/[slug]` has passed it since C13, has been publicly
   * edge-cached at s-maxage=300 since then, and its responses carried an
   * identity the whole time. Clause 2 alone would have called that page clean.
   */
  for (const boundary of notFoundBoundaries()) {
    try {
      const source = stripCommentsAndStrings(read(boundary))
      const rendersChrome = /<PageShell[\s>]/.test(source) || /<SiteHeader[\s/>]/.test(source)
      if (!rendersChrome) continue
      boundariesChecked += 1
      const safe = /<PageShell\s+staticSafe/.test(source) || /<SiteHeader\s+staticSafe/.test(source)
      if (!safe) {
        problems.push(
          `${boundary}: renders the site chrome without \`staticSafe\`. This boundary is serialised into the payload of ` +
            'EVERY page, including the publicly cached ones, so the header it renders puts the signed-in visitor\'s ' +
            'display name and email address into responses that are shared with strangers. Pass `staticSafe`.',
        )
      }
    } catch (error) {
      problems.push(`${boundary} is unreadable (${error.message}), so clause 6 could not be checked.`)
    }
  }

  declareWork('edge-cache-is-viewer-independent', {
    did: {
      'header rule read': rulesSeen,
      'route cached publicly': publicRules,
      'boundary checked': boundariesChecked,
      // Printed rather than kept internal so a rule that quietly stops being
      // comparable - the page loses its `revalidate`, the rule loses its
      // s-maxage - shows up as a number that went DOWN, instead of as a clause
      // that silently had nothing to say.
      //
      // "cache window" and not "shelf life": the shared reporter pluralises the
      // word before the participle, so that label prints as "shelf lifes
      // compared". The reporter's bug is recorded in REVIEW-QUEUE-C.md and is
      // not this lane's to fix under two other builds; the label works around
      // it rather than editing shared tooling every guard prints through.
      'cache window compared': shelfLivesCompared,
      'clause checked': 7,
    },
    found: { 'shared response carrying one visitor\'s identity': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`${TAG} FAIL - ${problems.length} problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  A publicly cached route is one response handed to every visitor. It must render the same thing for')
    console.error('  all of them (`staticSafe`) AND never store a signed-in render (`missing` on the marker cookie).')
    process.exitCode = 1
    return
  }
  console.log(
    `${TAG} PASS - ${publicRules} publicly cached route(s) of ${rulesSeen} header rule(s): every one renders the anonymous ` +
      `header and excludes a request carrying '${markerCookie}'.`,
  )
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
