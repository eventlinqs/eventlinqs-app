// Resolve the Lighthouse gate URL list against a deployed Vercel preview.
//
// ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
// The original gate hardcoded a seed event slug in lighthouserc.json. When the
// local seed stopped producing that slug the URL 404'd, and LHCI treats any 404
// in the URL set as a hard `collect` failure (ERRORED_DOCUMENT_REQUEST), which
// fails the whole gate regardless of scores.
//
// ── THE FIRST FIX, AND WHY IT WAS NOT ENOUGH ───────────────────────────────
// Discovery took the FIRST /events/<slug> the sitemap happened to list, and the
// sitemap query carried no ORDER BY, so "first" was whatever Postgres returned
// that day. A 24 August pass sorted the slugs and picked first/middle/last of
// the sorted list, which made the choice a pure function of the sitemap.
//
// A pure function of a MOVING INPUT is still a moving output. The sitemap is the
// live catalogue: publish one event and "middle" is a different page. On
// 25 August 2026 the gate landed on
//
//     /events/arena-sessions-large-room-performance-test    0.75, 0.74, 0.77
//
// a 1,200 seat arena chart, against a 0.80 floor, and blocked the merge. A
// lighter event on the same branch had cleared the same floor days earlier.
// Nothing about the code changed between them. A gate whose subject moves is
// measuring the catalogue, not the branch.
//
// ── WHAT IS DETERMINISTIC NOW ──────────────────────────────────────────────
// The audited set is a FIXED, REVIEWED LIST in lighthouse-gate-urls.json, in
// version control, each entry carrying the reason it is there. The contract:
//
//   1. Every path is verified to answer 200 on the preview BEFORE it is
//      audited, so a 404 can never reach LHCI and hard-fail the collect.
//   2. A path that no longer resolves FAILS THIS RESOLVER LOUDLY, naming the
//      missing path. It is NOT silently replaced. A silent substitution is how
//      this gate became a coin toss; a loud failure is a five second edit to
//      the JSON.
//   3. The sitemap is still read, but only to REPORT what else exists, so a
//      human reading a red build can see the catalogue without opening it.
//
// ── WHY PINNED RATHER THAN NARROWED ────────────────────────────────────────
// The obvious way to make this gate green is to audit one fast page. That is
// the move this comment exists to forbid. The founder's instruction was
// explicit: "Do not narrow it to the fastest page to pass; if anything widen
// it. If that means it fails on more pages today, I want to know that." The
// pinned set keeps THREE event-detail pages and the FIRST of them is the
// heaviest page on the platform, the one that failed on 25 August.
//
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SET_FILE = 'lighthouse-gate-urls.json'

/** Read the pinned set. Exported so a unit test can assert its shape. */
export function readPinnedSet(root = ROOT) {
  const raw = readFileSync(join(root, SET_FILE), 'utf8')
  const parsed = JSON.parse(raw)
  const paths = [
    ...(parsed.static ?? []).map(e => e.path),
    ...(parsed.eventDetail ?? []).map(e => e.path),
  ]
  if (paths.length === 0) throw new Error(`${SET_FILE} lists no paths`)
  for (const p of paths) {
    if (typeof p !== 'string' || !p.startsWith('/')) {
      throw new Error(`${SET_FILE} contains a path that is not a leading-slash string: ${JSON.stringify(p)}`)
    }
  }
  return { parsed, paths }
}

/**
 * Order the audited URLs so the event-detail pages sit where the single
 * discovered one used to, preserving the gate's historical ordering.
 */
export function orderedPaths(parsed) {
  const statics = (parsed.static ?? []).map(e => e.path)
  const details = (parsed.eventDetail ?? []).map(e => e.path)
  const out = [...statics]
  out.splice(4, 0, ...details)
  return out
}

/** HEAD/GET each path and report which do not answer 200. */
async function verify(base, paths) {
  const bad = []
  for (const p of paths) {
    const url = `${base}${p}`
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        headers: { Cookie: 'el-audit=1', 'user-agent': 'EventLinqs-gate-resolver/1.0' },
      })
      if (res.status !== 200) bad.push({ path: p, status: res.status, location: res.headers.get('location') })
    } catch (err) {
      bad.push({ path: p, status: 'ERR', location: String(err?.message ?? err) })
    }
  }
  return bad
}

/** Read the preview's sitemap purely to report what else is there. */
async function reportCatalogue(base) {
  try {
    const res = await fetch(`${base}/sitemap.xml`, { headers: { Cookie: 'el-audit=1' } })
    if (!res.ok) {
      console.error(`[gate-urls] sitemap.xml returned ${res.status}; catalogue report skipped`)
      return
    }
    const xml = await res.text()
    const slugs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map(m => {
        try {
          return new URL(m[1]).pathname
        } catch {
          return m[1]
        }
      })
      .filter(p => /^\/events\/[^/]+$/.test(p.replace(/\/$/, '')) && !p.includes('/browse'))
    console.error(`[gate-urls] the preview sitemap publishes ${slugs.length} event page(s); ${((parsedCache?.eventDetail ?? []).length)} are pinned for audit.`)
  } catch (err) {
    console.error(`[gate-urls] catalogue report skipped (${err?.message})`)
  }
}

let parsedCache = null

async function main() {
  const base = (process.env.PREVIEW_URL || '').replace(/\/+$/, '')
  if (!base) {
    console.error('PREVIEW_URL is required')
    process.exit(1)
  }

  const { parsed, paths } = readPinnedSet()
  parsedCache = parsed
  const ordered = orderedPaths(parsed)

  console.error(`[gate-urls] pinned set: ${SET_FILE}, ${ordered.length} URL(s)`)
  for (const e of [...(parsed.static ?? []), ...(parsed.eventDetail ?? [])]) {
    console.error(`[gate-urls]   ${e.path}`)
    console.error(`[gate-urls]       ${e.why}`)
  }

  await reportCatalogue(base)

  console.error('[gate-urls] verifying every pinned path answers 200 before auditing...')
  const bad = await verify(base, ordered)
  if (bad.length > 0) {
    console.error('')
    console.error(`[gate-urls] FAIL - ${bad.length} pinned path(s) do not answer 200 on ${base}:`)
    for (const b of bad) {
      console.error(`[gate-urls]   ${String(b.status).padEnd(4)} ${b.path}${b.location ? ` -> ${b.location}` : ''}`)
    }
    console.error('')
    console.error(`[gate-urls] The audited set is PINNED on purpose, so this is not silently substituted.`)
    console.error(`[gate-urls] Either the page moved or the fixture changed: update ${SET_FILE} to a path`)
    console.error(`[gate-urls] that represents the same thing, and say in its "why" what that is.`)
    process.exit(1)
  }
  console.error(`[gate-urls] all ${ordered.length} pinned path(s) answer 200. Auditing them.`)

  for (const p of ordered) {
    process.stdout.write(`${base}${p}\n`)
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  await main()
}
