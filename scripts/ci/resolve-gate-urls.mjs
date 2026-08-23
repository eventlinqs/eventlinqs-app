// Resolve the Lighthouse gate URL list against a deployed Vercel preview.
//
// ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
// The original gate hardcoded a seed event slug in lighthouserc.json. When the
// local seed stopped producing that slug the URL 404'd, and LHCI treats any 404
// in the URL set as a hard `collect` failure (ERRORED_DOCUMENT_REQUEST), which
// fails the whole gate regardless of scores. So the detail slug is discovered
// from the preview's own sitemap rather than hand-picked.
//
// ── THE DEFECT THIS REWRITE FIXES (founder ruling, 24 August 2026) ─────────
// Discovery took the FIRST /events/<slug> the sitemap happened to list, and the
// sitemap query carried no ORDER BY, so "first" was whatever Postgres returned
// that day. The audited page therefore changed between runs of the same branch.
// Measured on 2026-08-23, two consecutive gate runs on the same branch:
//
//   135be599  audited /events/seat-proof-fifty-nwltxi   0.83, 0.75, 0.73  PASS
//   8044480b  audited /events/cat-indie-sounds-...      0.74, 0.73, 0.73  FAIL
//
// Nothing about event-page performance changed between those two runs. The gate
// picked a different page, and the category floor aggregates 'optimistic'
// (best of three), so 0.83 cleared the 0.80 floor by 0.03 and 0.74 did not.
// That is not a gate, it is a coin toss, and it blocked two merges.
//
// ── WHAT IS DETERMINISTIC NOW ──────────────────────────────────────────────
// 1. The candidate slugs are SORTED before anything is chosen, so the order no
//    longer depends on Postgres' physical row order. (The sitemap query itself
//    was also given an explicit ORDER BY in the same pass, so the input is
//    stable too; this sort is the belt to that braces, because a gate must not
//    depend on another file continuing to behave.)
// 2. The selection is a REPRESENTATIVE SPREAD, not a single lucky page: the
//    first, middle and last slug of the sorted list. Three different events,
//    spanning the catalogue, chosen by a pure function of the sitemap.
//
// ── WHY WIDER RATHER THAN NARROWER ─────────────────────────────────────────
// The obvious way to make this gate green is to audit one fast page. That is
// the move this comment exists to forbid. The founder's instruction was
// explicit: "Do not narrow it to the fastest page to pass; if anything widen
// it. If that means it fails on more pages today, I want to know that." So the
// event-detail surface goes from ONE audited page to THREE. If that surfaces
// more failures, the gate is doing its job and the failures were always real.
//
// Every chosen URL is printed to stderr so a human reading a red build can see
// exactly which pages were measured without opening an artefact.
//
import { pathToFileURL } from 'node:url'

// Usage: PREVIEW_URL=https://<preview>.vercel.app node scripts/ci/resolve-gate-urls.mjs
// Prints one absolute URL per line on stdout.

// The public, no-auth URL set this gate has always measured. Auth-gated
// surfaces stay excluded: they need a recorded-session gate.
const STATIC_PATHS = [
  '/',
  '/events',
  '/events/browse/melbourne',
  '/community/african',
  '/organisers',
  '/pricing',
  '/help',
  '/legal/terms',
  '/login',
  '/signup',
]

/** How many event-detail pages to audit. Was 1; widened deliberately. */
const EVENT_DETAIL_SAMPLES = 3

// Used only if sitemap discovery fails outright, so the gate reports honestly
// rather than silently dropping the detail surface.
const FALLBACK_DETAIL_PATH = '/events/afrobeats-melbourne-summer-sessions'

/**
 * A deterministic, representative spread across a sorted list.
 *
 * first, middle, last for n=3. Pure: same input, same output, every time. It
 * deliberately does NOT sample randomly and does NOT take the head, because
 * both of those are how a gate ends up measuring a different thing each run.
 */
export function representativeSpread(sorted, count) {
  if (sorted.length === 0) return []
  if (sorted.length <= count) return [...sorted]
  const picks = []
  for (let i = 0; i < count; i++) {
    // i / (count - 1) walks 0 .. 1 inclusive, so the ends are always included.
    const ratio = count === 1 ? 0 : i / (count - 1)
    const idx = Math.round(ratio * (sorted.length - 1))
    if (!picks.includes(sorted[idx])) picks.push(sorted[idx])
  }
  return picks
}

async function discoverEventDetailPaths(base) {
  try {
    const res = await fetch(`${base}/sitemap.xml`, { headers: { Cookie: 'el-audit=1' } })
    if (!res.ok) {
      console.error(`[gate-urls] sitemap.xml returned ${res.status}; falling back to the seed slug`)
      return []
    }
    const xml = await res.text()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])

    const slugs = []
    for (const loc of locs) {
      let path
      try {
        path = new URL(loc).pathname
      } catch {
        path = loc
      }
      // /events/<slug> exactly (two segments), excluding /events/browse/*
      const m = path.replace(/\/$/, '').match(/^\/events\/([^/]+)$/)
      if (m && m[1] !== 'browse') slugs.push(m[1])
    }

    if (slugs.length === 0) {
      console.error('[gate-urls] no /events/<slug> in sitemap; falling back to the seed slug')
      return []
    }

    // SORT FIRST. This is the line that makes the gate repeatable.
    slugs.sort()
    const chosen = representativeSpread(slugs, EVENT_DETAIL_SAMPLES)
    console.error(
      `[gate-urls] ${slugs.length} event page(s) in sitemap; auditing ${chosen.length} ` +
        `chosen deterministically (first/middle/last of the sorted list):`,
    )
    for (const s of chosen) console.error(`[gate-urls]   /events/${s}`)
    return chosen.map(s => `/events/${s}`)
  } catch (err) {
    console.error(`[gate-urls] sitemap fetch failed (${err?.message}); falling back to the seed slug`)
    return []
  }
}

/**
 * Builds and prints the URL list. Kept OUT of module scope on purpose.
 *
 * The first version of this rewrite resolved PREVIEW_URL and called
 * process.exit(1) at the top level, so merely IMPORTING the module to unit-test
 * `representativeSpread` killed the test runner. That is the same defect that
 * bit scripts/verify/event-structured-data-audit.mjs on 23 August: a module
 * that does its work on import cannot be tested, and the failure surfaces as an
 * unrelated crash somewhere else entirely.
 */
async function main() {
  const base = (process.env.PREVIEW_URL || '').replace(/\/+$/, '')
  if (!base) {
    console.error('PREVIEW_URL is required')
    process.exit(1)
  }

  const discovered = await discoverEventDetailPaths(base)
  const detailPaths = discovered.length > 0 ? discovered : [FALLBACK_DETAIL_PATH]

  // Insert the detail pages where the single one used to sit, preserving the
  // original gate ordering (detail came after /community/african).
  const paths = [...STATIC_PATHS]
  paths.splice(4, 0, ...detailPaths)

  console.error(`[gate-urls] ${paths.length} URL(s) will be audited.`)
  for (const p of paths) {
    process.stdout.write(`${base}${p}\n`)
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  await main()
}
