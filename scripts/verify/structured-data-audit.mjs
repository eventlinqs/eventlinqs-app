/**
 * STRUCTURED DATA, EVERY PAGE TYPE, AGAINST THE HOSTED VALIDATOR.
 *
 * ============================================================================
 * WHICH TOOL, AND WHY THIS ONE
 * ============================================================================
 *
 * Google publishes two tools and only one of them can be driven.
 *
 *   THE RICH RESULTS TEST (https://search.google.com/test/rich-results) is the
 *   authority on whether a page is eligible for a Google rich result. It has NO
 *   PUBLIC API. It is a browser tool, one URL at a time, and there is no
 *   documented endpoint. It stays the spot check on a single deployed URL.
 *
 *   THE SCHEMA MARKUP VALIDATOR (https://validator.schema.org) is the tool
 *   Google's own structured-data documentation points at for checking markup
 *   validity, and it answers a POST with the parsed graph and an `errors` array
 *   per node and per property. That is what this script drives.
 *
 * THE TWO TOOLS ANSWER DIFFERENT QUESTIONS AND BOTH ARE ASKED HERE.
 *
 *   The validator answers "is this valid schema.org?" It will happily pass an
 *   Event with no location, because schema.org does not require one.
 *
 *   Google's ELIGIBILITY rules are a separate, published list, and they are
 *   encoded below from the primary source rather than from memory (Law 7):
 *
 *     Event structured data
 *     https://developers.google.com/search/docs/appearance/structured-data/event
 *     (page last updated 2025-12-10 UTC, fetched 2026-08-23)
 *       REQUIRED: name, startDate, location, location.address
 *       RECOMMENDED: description, endDate, eventStatus, image, location.name,
 *         offers (availability, price, priceCurrency, url, validFrom),
 *         organizer, performer, previousStartDate
 *
 *     Breadcrumb structured data
 *     https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
 *     (fetched 2026-08-25)
 *       REQUIRED on each ListItem: position, name (or item.name), item (except
 *       on the last element, where it may be omitted)
 *
 *     Organization structured data
 *     https://developers.google.com/search/docs/appearance/structured-data/organization
 *     (fetched 2026-08-25)
 *       REQUIRED: name. RECOMMENDED includes url, logo, sameAs, description.
 *
 * ============================================================================
 * WHAT IT REPORTS
 * ============================================================================
 *
 * One row per PAGE TYPE, with the count of pages audited, the JSON-LD node
 * types found, validator errors, and Google-requirement failures. A page type
 * that carries no structured data at all is reported as such rather than passed
 * over, because "no errors" and "nothing to check" are not the same result.
 *
 * READ ONLY. Fetches public URLs and posts them to a public validator.
 *
 * USAGE
 *   node scripts/verify/structured-data-audit.mjs --base https://www.eventlinqs.com.au
 *   node scripts/verify/structured-data-audit.mjs --base http://127.0.0.1:3210 --no-validator
 *
 * --no-validator skips the hosted tool (which can only fetch a PUBLIC url) and
 * runs the Google-requirement checks against locally fetched HTML, which is how
 * a preview or a local build is audited.
 */

const args = process.argv.slice(2)
function flag(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  if (v === undefined || v.startsWith('--')) return true
  return v
}

const BASE = String(flag('base', 'https://www.eventlinqs.com.au')).replace(/\/$/, '')
const USE_VALIDATOR = flag('no-validator') !== true
const PER_TYPE = Number(flag('per-type', 2))
const UA = 'EventLinqs-structured-data-audit/1.0 (+https://www.eventlinqs.com.au)'

/**
 * Every page type this platform publishes, matched against a sitemap path.
 * Order matters: the FIRST matching pattern wins, so the more specific shapes
 * are listed above the shapes that would also match them.
 */
const PAGE_TYPES = [
  { type: 'home', match: p => p === '/' },
  { type: 'events-browse', match: p => p === '/events' },
  { type: 'events-browse-city', match: p => /^\/events\/browse\/[^/]+$/.test(p) },
  { type: 'event-detail', match: p => /^\/events\/[^/]+$/.test(p) },
  { type: 'city-suburb', match: p => /^\/city\/[^/]+\/[^/]+$/.test(p) },
  { type: 'city', match: p => /^\/city\/[^/]+$/.test(p) },
  { type: 'community-city', match: p => /^\/community\/[^/]+\/[^/]+$/.test(p) },
  { type: 'community', match: p => /^\/community\/[^/]+$/.test(p) },
  { type: 'faith', match: p => /^\/faith\/[^/]+$/.test(p) },
  { type: 'category', match: p => /^\/categories\/[^/]+$/.test(p) },
  { type: 'organiser-profile', match: p => /^\/organisers\/[^/]+$/.test(p) },
  { type: 'venue-profile', match: p => /^\/venues\/[^/]+$/.test(p) },
  { type: 'artist-profile', match: p => /^\/artists\/[^/]+$/.test(p) },
  { type: 'guide', match: p => /^\/guides\/[^/]+$/.test(p) },
  { type: 'help-topic', match: p => /^\/help\/[^/]+$/.test(p) },
  { type: 'index', match: p => ['/communities', '/cities', '/organisers', '/guides', '/help'].includes(p) },
  { type: 'marketing', match: p => ['/pricing', '/about', '/press', '/careers', '/contact'].includes(p) },
  { type: 'legal', match: p => p.startsWith('/legal/') },
]

function classify(pathname) {
  for (const t of PAGE_TYPES) if (t.match(pathname)) return t.type
  return 'unclassified'
}

/* ------------------------------------------------------------------ *
 * Google's published requirement lists
 * ------------------------------------------------------------------ */

const EVENT_TYPES = new Set([
  'Event', 'BusinessEvent', 'ChildrensEvent', 'ComedyEvent', 'CourseInstance',
  'DanceEvent', 'DeliveryEvent', 'EducationEvent', 'ExhibitionEvent', 'Festival',
  'FoodEvent', 'Hackathon', 'LiteraryEvent', 'MusicEvent', 'PublicationEvent',
  'SaleEvent', 'ScreeningEvent', 'SocialEvent', 'SportsEvent', 'TheaterEvent',
  'VisualArtsEvent',
])

/** @returns {{required: string[], recommended: string[]}} */
function checkEventNode(node) {
  const required = []
  const recommended = []
  if (!node.name) required.push('name')
  if (!node.startDate) required.push('startDate')
  if (!node.location) required.push('location')
  else {
    const loc = Array.isArray(node.location) ? node.location[0] : node.location
    const isVirtual = loc?.['@type'] === 'VirtualLocation'
    if (!isVirtual && !loc?.address) required.push('location.address')
    if (!isVirtual && !loc?.name) recommended.push('location.name')
  }
  for (const p of ['description', 'endDate', 'eventStatus', 'image', 'organizer', 'performer']) {
    if (!node[p]) recommended.push(p)
  }
  if (!node.offers) recommended.push('offers')
  else {
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers]
    offers.forEach((o, i) => {
      const label = offers.length > 1 ? `offers[${i}]` : 'offers'
      for (const p of ['availability', 'priceCurrency', 'url', 'validFrom']) {
        if (o[p] === undefined) recommended.push(`${label}.${p}`)
      }
      // AggregateOffer carries lowPrice/highPrice rather than price.
      if (o['@type'] === 'AggregateOffer') {
        if (o.lowPrice === undefined) recommended.push(`${label}.lowPrice`)
      } else if (o.price === undefined) {
        recommended.push(`${label}.price`)
      }
    })
  }
  if (node.previousStartDate && node.eventStatus !== 'https://schema.org/EventRescheduled') {
    required.push('previousStartDate without eventStatus=EventRescheduled')
  }
  return { required, recommended }
}

function checkBreadcrumbNode(node) {
  const required = []
  const items = Array.isArray(node.itemListElement) ? node.itemListElement : []
  if (items.length === 0) required.push('itemListElement')
  items.forEach((it, i) => {
    if (it.position === undefined) required.push(`itemListElement[${i}].position`)
    const name = it.name ?? it.item?.name
    if (!name) required.push(`itemListElement[${i}].name`)
    // Google: item may be omitted on the LAST element only.
    if (!it.item && i !== items.length - 1) required.push(`itemListElement[${i}].item`)
  })
  return { required, recommended: [] }
}

function checkOrganizationNode(node) {
  const required = []
  const recommended = []
  if (!node.name) required.push('name')
  for (const p of ['url', 'logo']) if (!node[p]) recommended.push(p)
  return { required, recommended }
}

function checkNode(node) {
  const t = String(node['@type'] ?? '')
  if (EVENT_TYPES.has(t)) return { kind: 'Event', ...checkEventNode(node) }
  if (t === 'BreadcrumbList') return { kind: 'BreadcrumbList', ...checkBreadcrumbNode(node) }
  if (t === 'Organization' || t === 'LocalBusiness' || t === 'PerformingGroup') {
    return { kind: t, ...checkOrganizationNode(node) }
  }
  return { kind: t || '(untyped)', required: [], recommended: [] }
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

async function sitemapPaths() {
  const res = await fetch(`${BASE}/sitemap.xml`, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`sitemap answered ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => new URL(decodeXml(m[1])).pathname)
}

function extractJsonLd(html) {
  const out = []
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(m[1])
      for (const n of Array.isArray(parsed) ? parsed : [parsed]) out.push(n)
    } catch (err) {
      out.push({ '@type': '(UNPARSEABLE)', __error: String(err?.message ?? err) })
    }
  }
  return out
}

/** POST the URL to the hosted Schema Markup Validator and return its errors. */
async function hostedValidate(url) {
  const body = new URLSearchParams({ url })
  const res = await fetch('https://validator.schema.org/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body,
  })
  if (!res.ok) return { ok: false, reason: `validator answered ${res.status}`, errors: [] }
  const text = await res.text()
  // The response is JSON prefixed with an anti-hijacking guard.
  const json = JSON.parse(text.replace(/^\)\]\}'\s*/, ''))
  const errors = []
  const walk = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (Array.isArray(node.errors)) {
      for (const e of node.errors) {
        errors.push(typeof e === 'string' ? e : (e.errorType ?? e.message ?? JSON.stringify(e)))
      }
    }
    for (const v of Object.values(node)) walk(v)
  }
  walk(json.tripleGroups)
  return { ok: true, errors, rendered: json.isRendered === true }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log(`[structured-data] base: ${BASE}`)
  console.log(`[structured-data] hosted validator: ${USE_VALIDATOR ? 'validator.schema.org (the tool Google documents; the Rich Results Test has no public API)' : 'SKIPPED (--no-validator)'}`)

  const paths = await sitemapPaths()
  console.log(`[structured-data] ${paths.length} URL(s) in the sitemap`)

  /** type -> paths */
  const byType = new Map()
  for (const p of paths) {
    const t = classify(p)
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t).push(p)
  }

  const results = []
  for (const [type, all] of [...byType].sort()) {
    const sample = all.slice(0, PER_TYPE)
    const row = {
      type,
      inSitemap: all.length,
      audited: 0,
      nodeTypes: new Set(),
      noStructuredData: 0,
      requiredFailures: [],
      recommendedGaps: new Map(),
      validatorErrors: [],
      httpFailures: [],
    }
    for (const p of sample) {
      const url = `${BASE}${p}`
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } })
      if (!res.ok) {
        row.httpFailures.push(`${p} -> ${res.status}`)
        continue
      }
      row.audited += 1
      const nodes = extractJsonLd(await res.text())
      if (nodes.length === 0) {
        row.noStructuredData += 1
        continue
      }
      for (const n of nodes) {
        const v = checkNode(n)
        row.nodeTypes.add(v.kind)
        for (const r of v.required) row.requiredFailures.push(`${p}: ${v.kind}.${r}`)
        for (const r of v.recommended) {
          const key = `${v.kind}.${r}`
          row.recommendedGaps.set(key, (row.recommendedGaps.get(key) ?? 0) + 1)
        }
      }
      if (USE_VALIDATOR) {
        try {
          const hosted = await hostedValidate(url)
          if (!hosted.ok) row.validatorErrors.push(`${p}: ${hosted.reason}`)
          else for (const e of hosted.errors) row.validatorErrors.push(`${p}: ${e}`)
        } catch (err) {
          row.validatorErrors.push(`${p}: validator call failed (${err?.message ?? err})`)
        }
      }
    }
    results.push(row)
  }

  console.log('')
  console.log('[structured-data] BY PAGE TYPE')
  console.log(
    '  ' +
      'type'.padEnd(22) +
      'sitemap'.padStart(8) +
      'audited'.padStart(9) +
      'noSD'.padStart(6) +
      'REQ fail'.padStart(10) +
      'validator'.padStart(11) +
      '  node types',
  )
  for (const r of results) {
    console.log(
      '  ' +
        r.type.padEnd(22) +
        String(r.inSitemap).padStart(8) +
        String(r.audited).padStart(9) +
        String(r.noStructuredData).padStart(6) +
        String(r.requiredFailures.length).padStart(10) +
        String(r.validatorErrors.length).padStart(11) +
        '  ' +
        [...r.nodeTypes].sort().join(', '),
    )
  }

  const reqTotal = results.reduce((s, r) => s + r.requiredFailures.length, 0)
  const valTotal = results.reduce((s, r) => s + r.validatorErrors.length, 0)
  const httpTotal = results.reduce((s, r) => s + r.httpFailures.length, 0)
  const noSdTotal = results.reduce((s, r) => s + r.noStructuredData, 0)

  if (reqTotal > 0) {
    console.log('\n[structured-data] GOOGLE REQUIRED-PROPERTY FAILURES')
    for (const r of results) for (const f of r.requiredFailures) console.log(`  ${r.type}  ${f}`)
  }
  if (valTotal > 0) {
    console.log('\n[structured-data] HOSTED VALIDATOR ERRORS')
    for (const r of results) for (const f of r.validatorErrors) console.log(`  ${r.type}  ${f}`)
  }
  if (httpTotal > 0) {
    console.log('\n[structured-data] PAGES THAT DID NOT LOAD')
    for (const r of results) for (const f of r.httpFailures) console.log(`  ${r.type}  ${f}`)
  }

  console.log('\n[structured-data] RECOMMENDED-PROPERTY GAPS (never fail the run; Google does not gate eligibility on them)')
  for (const r of results) {
    if (r.recommendedGaps.size === 0) continue
    const list = [...r.recommendedGaps].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`)
    console.log(`  ${r.type.padEnd(22)} ${list.join(', ')}`)
  }

  console.log('')
  console.log(`[structured-data] page types: ${results.length}`)
  console.log(`[structured-data] pages with NO structured data at all: ${noSdTotal}`)
  console.log(`[structured-data] Google REQUIRED-property failures: ${reqTotal}`)
  console.log(`[structured-data] hosted validator errors: ${valTotal}`)
  console.log(`[structured-data] pages that did not load: ${httpTotal}`)

  if (reqTotal > 0 || valTotal > 0 || httpTotal > 0) {
    console.log('\n[structured-data] FAIL')
    process.exit(1)
  }
  console.log('\n[structured-data] PASS - every audited page type carries valid markup with every required property.')
  process.exit(0)
}

main().catch(err => {
  console.error('[structured-data] fatal:', err?.message ?? err)
  process.exit(2)
})
