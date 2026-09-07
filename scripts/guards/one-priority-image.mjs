/**
 * ONE PRIORITY IMAGE PER DOCUMENT (close-out C8, 6 September 2026).
 *
 * A `priority` image in this codebase becomes a `<link rel="preload" as="image">`
 * in the document head plus `fetchpriority="high"`. On the mobile profile
 * Lighthouse simulates (1.6 Mbps, 150 ms round trips) every one of those
 * preloads competes with the render-blocking stylesheet, and the page cannot
 * paint until that stylesheet lands. Measured on production on 6 September
 * 2026: the homepage carried NINE image preloads, and under applied throttling
 * first paint and LCP arrived together at 4.0 seconds. The same page paints in
 * under a second on a fast connection, which is why nobody saw it.
 *
 * The rule: a document preloads its LCP candidate and nothing else. That is the
 * hero where a hero exists, or the first tile under the hero where the hero has
 * no photograph. Every site that GRANTS priority (a literal `true`, a bare
 * `priority` prop, or an expression that switches on an index) is listed here
 * with its reason, and the guard fails the build when:
 *
 *   1. a grant appears that is not on the list (a new preload nobody argued for),
 *   2. a listed grant no longer matches anything (the list has rotted),
 *   3. any grant reaches beyond the first item (`i < 4`, `idx <= 2`, `i < 2`):
 *      "the first row paints eagerly" is exactly the pattern that put nine
 *      preloads in one head.
 *
 * Pass-throughs are not grants and are ignored: `priority={priority}`,
 * `priority: t.priority`, `priority={event.priority ?? false}`, a ternary that
 * resolves to false or undefined. The media components under
 * src/components/media/ only forward the prop. Renderers under
 * src/lib/broadcast/ draw pixels, not documents. What this static guard cannot
 * see (a flag computed elsewhere) the drive proof counts: the preload links in
 * the served head of every key route.
 *
 * Exit 1 with every offending line, or exit 0 with the count of grants
 * checked. Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

const EXCLUDED_PREFIXES = ['src/lib/broadcast/', 'src/app/dev/', 'src/app/design/', 'src/components/media/']

/**
 * The reviewed grants. `match` is a substring of the granting line. One entry
 * per LCP candidate per document; the reason says which document and why.
 */
export const ALLOWED_GRANTS = [
  { file: 'src/components/features/home/FeaturedHeroClient.tsx', match: 'priority={idx === 0}', why: 'homepage: slide 0 of the hero is the LCP; later slides never preload' },
  { file: 'src/components/features/home/FeaturedHero.tsx', match: 'alt={curated.alt} priority />', why: 'homepage with no featured event (close-out C17): the curated hero raster is the LCP' },
  { file: 'src/components/features/home/category-nav-rail.tsx', match: 'priority: true,', why: 'homepage: the Communities doorway tile leads the first rail under the hero and sits in the first viewport at 390; it is the LCP when the hero has no photograph' },
  { file: 'src/components/features/events/m5-recommended-rail.tsx', match: 'priority={i === 0}', why: 'browse: no hero image; the first rail card is the LCP' },
  { file: 'src/components/features/events/m5-events-grid-client.tsx', match: 'priority={firstCardEager && i === 0}', why: 'browse grid without a rail above it: the first card is the LCP' },
  { file: 'src/app/cities/page.tsx', match: '<CitiesGrid entries={tier1} priority />', why: '/cities has no hero image; the grid decides which single tile carries it' },
  { file: 'src/app/cities/page.tsx', match: 'priority={priority && idx === 0}', why: '/cities: the first capital-city tile is the LCP' },
  { file: 'src/app/communities/page.tsx', match: '<CommunitiesGrid entries={entries} priority />', why: '/communities has no hero image; the grid decides which single tile carries it' },
  { file: 'src/app/communities/page.tsx', match: 'priority={priority && idx === 0}', why: '/communities: the first community tile is the LCP' },
  { file: 'src/components/features/city/city-hero.tsx', match: 'priority />', why: 'city and suburb landings: the hero is the LCP' },
  { file: 'src/components/templates/PhotographicCityHero.tsx', match: 'priority />', why: 'the photographic city hero template: the hero is the LCP' },
  { file: 'src/components/templates/PhotographicCategoryHero.tsx', match: 'priority />', why: 'the category landing hero: the hero is the LCP' },
  { file: 'src/components/templates/PhotographicCommunityHero.tsx', match: 'priority />', why: 'the community landing hero: the hero is the LCP' },
  { file: 'src/components/templates/OrganisersLandingPage.tsx', match: 'priority />', why: '/organisers: the marketing hero is the LCP' },
  { file: 'src/components/features/venues/venue-profile-hero.tsx', match: 'priority />', why: 'venue profile: the hero is the LCP' },
  { file: 'src/components/features/organisers/organiser-profile-hero.tsx', match: 'size="lg" priority />', why: 'organiser profile: the avatar in the hero is the LCP' },
  { file: 'src/components/auth/auth-shell.tsx', match: 'priority />', why: 'login and signup: the brand panel is the LCP on desktop' },
  { file: 'src/components/features/home/split-state-hero.tsx', match: 'priority />', why: 'the split-state homepage hero is the LCP' },
  { file: 'src/components/features/home/home-hero.tsx', match: 'priority', why: 'the static homepage hero raster is the LCP' },
  { file: 'src/app/queue/[slug]/queue-room.tsx', match: 'priority />', why: 'queue room: the event cover is the LCP' },
  { file: 'src/app/waitlist/page.tsx', match: 'priority', why: 'waitlist: the hero is the LCP' },
  { file: 'src/app/squad/[token]/page.tsx', match: 'priority', why: 'squad invitation: the event cover is the LCP' },
  { file: 'src/app/launch/page.tsx', match: 'priority', why: 'launch composer: the hero is the LCP' },
  { file: 'src/app/(dashboard)/dashboard/events/[id]/page.tsx', match: 'priority', why: 'organiser event overview: the cover preview is the LCP' },
  { file: 'src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx', match: 'priority', why: 'launch kit: the cover preview is the LCP' },
]

/** `priority: <expr>,` / `priority={<expr>}` followed by anything / a bare `priority` prop before another attribute or the tag's end. */
const GRANT = /(?<![\w?])priority(?:\s*=\s*\{\s*([^}]+?)\s*\}(?=\s|[,>/]|$)|\s*:\s*([^,}>{]+?)\s*(?=[,}>/]|$)|(?=\s+[A-Za-z_][\w-]*=|\s*\/?>|\s*$))/
/** An identifier or member chain, optionally `?? false`: the value is decided elsewhere. */
const PASS_THROUGH = /^(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\?\?\s*false)?)$/
/** A comparison on an index: `i < 4`, `idx <= 1`, `i === 0`. */
const REACH = /\b(?:i|idx|index|n)\s*(?:<=?\s*([0-9]+)|===?\s*([0-9]+))/
/** Lines that mention the word without granting anything. */
const NOT_A_GRANT = /priority\?:|priority: boolean|fetchPriority|priority = /

export function classifyLine(raw) {
  // Windows line endings, then a trailing line comment (`x // priority later` is prose, not a prop).
  const line = raw.replace(/\r$/, '').replace(/\s\/\/.*$/, '')
  const trimmed = line.trim()
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('{/*')) return null
  if (NOT_A_GRANT.test(line)) return null
  const m = line.match(GRANT)
  if (!m) return null
  const expr = (m[1] ?? m[2] ?? '').trim()
  if (expr === 'false') return null
  if (expr && expr !== 'true' && PASS_THROUGH.test(expr)) return null
  // A grant is a literal true, a bare prop, or an expression that switches on
  // an index. Anything else (a flag, a ternary to false or undefined) is decided
  // elsewhere and the drive proof counts the preloads it produces.
  if (expr && !/\btrue\b/.test(expr) && !REACH.test(expr)) return null
  let reach = 1
  const r = expr.match(REACH)
  if (r && r[1] !== undefined) reach = /<=/.test(r[0]) ? Number(r[1]) + 1 : Number(r[1])
  return { expr: expr || 'true', reach }
}

export function findGrants(source, file) {
  const out = []
  source.split(/\r?\n/).forEach((line, i) => {
    const g = classifyLine(line)
    if (g) out.push({ file, line: i + 1, text: line.trim(), ...g })
  })
  return out
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      yield* walk(full)
    } else if (full.endsWith('.tsx')) {
      yield full
    }
  }
}

export function judge(grants, allowed = ALLOWED_GRANTS) {
  const faults = []
  const used = new Set()
  for (const g of grants) {
    if (g.reach > 1) faults.push(`${g.file}:${g.line} grants priority to the first ${g.reach} items: "${g.text}". One LCP candidate per document.`)
    const hit = allowed.findIndex((a, idx) => !used.has(idx) && a.file === g.file && g.text.includes(a.match))
    const any = allowed.some((a) => a.file === g.file && g.text.includes(a.match))
    if (hit >= 0) used.add(hit)
    else if (!any) faults.push(`${g.file}:${g.line} grants priority and is not on the reviewed list: "${g.text}". Name the LCP candidate it is, or make it lazy.`)
  }
  allowed.forEach((a, idx) => {
    if (!used.has(idx) && !grants.some((g) => g.file === a.file && g.text.includes(a.match))) faults.push(`allowlist entry no longer matches anything: ${a.file} "${a.match}" (${a.why}). Remove it.`)
  })
  return faults
}

export function scanTree(root = SRC) {
  const grants = []
  let files = 0
  for (const full of walk(root)) {
    const rel = relative(ROOT, full).split(sep).join('/')
    if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue
    files += 1
    grants.push(...findGrants(readFileSync(full, 'utf8'), rel))
  }
  return { files, grants }
}

const invokedDirectly = process.argv[1] && /one-priority-image\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const { files, grants } = scanTree()
  const faults = judge(grants)
  if (faults.length) {
    console.error(`FAIL one-priority-image: ${faults.length} fault(s) in ${grants.length} priority grant(s) across ${files} files:`)
    for (const f of faults) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log(`one-priority-image: ${grants.length} priority grant(s) across ${files} files, every one a named LCP candidate, none reaching past the first item`)
}
