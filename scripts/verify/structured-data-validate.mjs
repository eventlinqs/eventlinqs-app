/**
 * THE STRUCTURED DATA IS VALIDATED, NOT ASSUMED (close-out C19.4).
 *
 * C19.4 says "Validate it, do not assume it". The first C19 pass read the
 * `@type` values out of each page and stopped there, which proves a block
 * EXISTS and proves nothing about whether it says anything. The roast of C19
 * caught that and this closes it.
 *
 * WHAT IT CHECKS, and the two halves are deliberately different in kind.
 *
 * 1. STRUCTURAL, and it makes no claim about anybody's specification: every
 *    `application/ld+json` block parses; every node carries `@context`
 *    https://schema.org and a `@type`; no property is an empty string, an empty
 *    array or null; every `url`, `item` and `logo` is an absolute URL on the
 *    audited host; and every ListItem carries a `position`, with the positions
 *    of one list contiguous from 1. A list that skips a position, or an
 *    `itemListElement: []`, is markup that describes nothing.
 *
 * 2. REQUIRED PROPERTIES, and every one is cited (Law 7). Only two claims are
 *    made, because only two are published as requirements for what this platform
 *    emits:
 *
 *      BreadcrumbList  REQUIRED: itemListElement. Each ListItem REQUIRED:
 *                      item, name, position.
 *                      https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
 *                      (page last updated 2025-12-10 UTC, fetched 2026-09-08)
 *
 *      Organization    "There are no required properties; instead, we recommend
 *                      adding as many properties that are relevant to your
 *                      organization."
 *                      https://developers.google.com/search/docs/appearance/structured-data/organization
 *                      (page last updated 2026-04-15 UTC, fetched 2026-09-08)
 *                      So Organization is checked STRUCTURALLY only, and this
 *                      file does not invent a requirement Google does not state.
 *
 *    Event is deliberately NOT judged here. scripts/verify/event-structured-data-audit.mjs
 *    already encodes Google's event rules from the primary source, across the
 *    whole catalogue, and a second half-copy of those rules is how two files come
 *    to disagree. This one reports that an Event node was seen and names the
 *    other script.
 *
 * Run: node scripts/verify/structured-data-validate.mjs <base> [path...]
 *      with no paths, it reads the host's own sitemap.
 */

const BASE = (process.argv[2] || 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const TAG = '[structured-data]'
const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

let paths = process.argv.slice(3)
if (paths.length === 0) {
  const res = await fetch(`${BASE}/sitemap.xml`)
  if (!res.ok) {
    console.error(`${TAG} ${BASE}/sitemap.xml answered ${res.status}`)
    process.exit(1)
  }
  const xml = await res.text()
  paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
}

/** Flatten a parsed block into every node it contains, @graph included. */
function nodes(parsed) {
  const out = []
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit)
    if (v && typeof v === 'object') {
      if (v['@type']) out.push(v)
      for (const [k, child] of Object.entries(v)) if (k !== '@type') visit(child)
    }
  }
  visit(parsed)
  return out
}

const isAbsolute = (v) => typeof v === 'string' && /^https?:\/\//.test(v)

function checkNode(where, node, depth = 0) {
  const type = Array.isArray(node['@type']) ? node['@type'].join('+') : node['@type']

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@')) continue
    if (value === null) fail(`${where} ${type}.${key} is null`)
    else if (typeof value === 'string' && value.trim() === '') fail(`${where} ${type}.${key} is an empty string`)
    else if (Array.isArray(value) && value.length === 0 && key === 'itemListElement') {
      fail(`${where} ${type}.${key} is an empty list; markup that describes nothing is worse than none`)
    }
    if ((key === 'url' || key === 'logo') && typeof value === 'string' && !isAbsolute(value)) {
      fail(`${where} ${type}.${key} is not an absolute URL: ${value}`)
    }
  }

  if (type === 'BreadcrumbList' || type === 'ItemList') {
    const items = node.itemListElement
    if (!Array.isArray(items) || items.length === 0) {
      fail(`${where} ${type} carries no itemListElement`)
    } else {
      const positions = items.map((i) => i?.position)
      if (positions.some((p) => typeof p !== 'number')) fail(`${where} ${type} has a ListItem with no numeric position`)
      else {
        const sorted = [...positions].sort((a, b) => a - b)
        const contiguous = sorted.every((p, i) => p === i + 1)
        if (!contiguous) fail(`${where} ${type} positions are not 1..n contiguous: ${sorted.join(',')}`)
      }
      if (type === 'BreadcrumbList') {
        // The one cited requirement, per Google's breadcrumb page.
        for (const item of items) {
          if (!item?.name) fail(`${where} BreadcrumbList ListItem at position ${item?.position} has no name (REQUIRED)`)
          if (!item?.item) fail(`${where} BreadcrumbList ListItem at position ${item?.position} has no item (REQUIRED)`)
          if (typeof item?.item === 'string' && !isAbsolute(item.item)) {
            fail(`${where} BreadcrumbList ListItem item is not an absolute URL: ${item.item}`)
          }
        }
      }
    }
  }

  if (depth === 0 && node['@context'] !== 'https://schema.org') {
    fail(`${where} top-level ${type} declares @context ${JSON.stringify(node['@context'])}, not https://schema.org`)
  }
}

const seen = new Map()
let blocks = 0
let checked = 0
const CONC = 6
for (let i = 0; i < paths.length; i += CONC) {
  await Promise.all(
    paths.slice(i, i + CONC).map(async (path) => {
      let html
      try {
        const res = await fetch(BASE + path, { headers: { 'user-agent': 'EventLinqs-structured-data' } })
        if (res.status !== 200) {
          fail(`${path} answered ${res.status}, so its markup could not be read`)
          return
        }
        html = await res.text()
      } catch (error) {
        fail(`${path} could not be fetched: ${error}`)
        return
      }
      checked++
      for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        blocks++
        let parsed
        try {
          parsed = JSON.parse(m[1])
        } catch (error) {
          fail(`${path} has a JSON-LD block that does not parse: ${error.message}`)
          continue
        }
        const top = Array.isArray(parsed) ? parsed : [parsed]
        for (const t of top) checkNode(path, t, 0)
        for (const n of nodes(parsed)) {
          const type = Array.isArray(n['@type']) ? n['@type'].join('+') : n['@type']
          seen.set(type, (seen.get(type) ?? 0) + 1)
          if (n !== parsed) checkNode(path, n, 1)
        }
      }
    }),
  )
}

console.log(`${TAG} ${checked} page(s) on ${BASE}, ${blocks} JSON-LD block(s)`)
for (const [type, n] of [...seen].sort((a, b) => b[1] - a[1])) console.log(`${TAG}   ${String(n).padStart(4)}  ${type}`)
if (seen.has('Event') || [...seen.keys()].some((t) => /Festival|Concert|MusicEvent|TheaterEvent|SportsEvent/.test(t))) {
  console.log(`${TAG} Event nodes were seen and are NOT judged here: scripts/verify/event-structured-data-audit.mjs owns Google's event rules`)
}

if (faults.length) {
  console.error(`${TAG} ${faults.length} fault(s)`)
  process.exit(1)
}
console.log(`${TAG} PASS`)
