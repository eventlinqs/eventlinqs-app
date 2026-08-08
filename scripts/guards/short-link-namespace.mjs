/**
 * THE SHORT-LINK NAMESPACE GUARD. Build-failing.
 *
 * A share link is /e/[code], and a code is a readable slug. That only stays
 * safe while two things hold, and both of them are the kind of thing that
 * quietly stops holding six months later when somebody adds a route:
 *
 * 1. /e/ and /s/ must be the ONLY owners of those first path segments. If
 *    somebody adds src/app/e/something-else, two things own one namespace and
 *    the loser is whichever Next.js resolves second.
 * 2. Every OTHER first path segment must be reserved, so a code can never be
 *    minted that shadows a real route. A link minted today as /e/login is a
 *    link that stops working the day anybody visits it.
 *
 * The list of reserved segments lives in src/lib/broadcast/short-links.ts,
 * because the minting code needs it at runtime. This guard reads the real app
 * directory and asserts the list still covers it, so adding a route without
 * reserving it fails the build rather than becoming a live collision.
 *
 * Run standalone:  node scripts/guards/short-link-namespace.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const APP_DIR = path.join(ROOT, 'src', 'app')
const SHORT_LINKS_FILE = path.join(ROOT, 'src', 'lib', 'broadcast', 'short-links.ts')

/** The two segments the share links own. */
const LINK_SEGMENTS = ['e', 's']

/** Every first path segment the app actually serves. */
function appSegments() {
  const found = new Set()
  const walk = (dir, depth) => {
    if (depth > 1) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const name = entry.name
      // Route groups and parallel routes own no URL segment; look inside them.
      if (name.startsWith('(') || name.startsWith('@') || name.startsWith('_')) {
        walk(path.join(dir, name), depth)
        continue
      }
      if (name.startsWith('[')) continue
      found.add(name)
    }
  }
  walk(APP_DIR, 0)
  return [...found].sort()
}

/** The reserved list, read out of the source rather than duplicated here. */
function reservedCodes() {
  const source = fs.readFileSync(SHORT_LINKS_FILE, 'utf8')
  // Anchored on the ASSIGNMENT, not on the name: the declaration reads
  // `RESERVED_CODES: readonly string[] = [`, so the first bracket after the
  // name belongs to the TYPE and matching it yields an empty list that passes
  // nothing and fails everything.
  const start = source.indexOf('RESERVED_CODES')
  const open = source.indexOf('= [', start)
  const close = source.indexOf(']', open)
  if (start === -1 || open === -1 || close === -1) {
    throw new Error('short-link-namespace: RESERVED_CODES not found in short-links.ts')
  }
  const entries = [...source.slice(open, close).matchAll(/'([^']+)'/g)].map(m => m[1])
  if (entries.length === 0) {
    throw new Error('short-link-namespace: RESERVED_CODES parsed as empty, which cannot be right')
  }
  return entries
}

/** Each link segment must be a directory with exactly one dynamic child. */
function linkSegmentProblems() {
  const problems = []
  for (const segment of LINK_SEGMENTS) {
    const dir = path.join(APP_DIR, segment)
    if (!fs.existsSync(dir)) {
      problems.push(`src/app/${segment} does not exist, but links are minted on /${segment}/`)
      continue
    }
    const children = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())
    const staticChildren = children.filter(e => !e.name.startsWith('['))
    if (staticChildren.length > 0) {
      problems.push(
        `src/app/${segment} has static child route(s) ${staticChildren
          .map(e => e.name)
          .join(', ')}: a code matching one of those names would resolve to the route, not the link`,
      )
    }
  }
  return problems
}

export function findProblems() {
  const problems = linkSegmentProblems()
  const reserved = new Set(reservedCodes())
  const unreserved = appSegments().filter(segment => !reserved.has(segment))
  for (const segment of unreserved) {
    problems.push(
      `route /${segment} is not in RESERVED_CODES, so a share code could be minted that shadows it`,
    )
  }
  return problems
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]).replace(/\\/g, '/'))

if (invokedDirectly) {
  const problems = findProblems()
  if (problems.length > 0) {
    console.error(`short-link-namespace: ${problems.length} problem(s).\n`)
    for (const p of problems) console.error(`  ${p}`)
    console.error(
      '\n  Add the segment to RESERVED_CODES in src/lib/broadcast/short-links.ts, or ' +
        'move the colliding route.\n',
    )
    process.exit(1)
  }
  console.log(
    `short-link-namespace: clean (/${LINK_SEGMENTS.join('/, /')}/ own their segments, ` +
      `${appSegments().length} routes all reserved)`,
  )
}
