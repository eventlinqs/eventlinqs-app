/**
 * EVENT STRUCTURED DATA AUDIT: is an event we publish today eligible for
 * Google's event experience?
 *
 * WHY THIS EXISTS RATHER THAN "run the Rich Results Test". Google's Rich
 * Results Test and the Schema Markup Validator both fetch a PUBLIC URL. They
 * cannot see localhost, and neither can be run across hundreds of event pages
 * by hand. This encodes the SAME published rules so the whole catalogue is
 * checked on every pass, and the hosted tool stays the spot check on one
 * deployed URL.
 *
 * EVERY RULE BELOW IS FROM THE PRIMARY SOURCE, CITED, NOT FROM MEMORY (Law 7):
 *
 *   Event structured data
 *   https://developers.google.com/search/docs/appearance/structured-data/event
 *   (page last updated 2025-12-10 UTC, fetched 2026-08-23)
 *
 *     REQUIRED: location, location.address, name, startDate.
 *     "You must include the required properties for your content to be
 *      eligible for display in enhanced results."
 *     RECOMMENDED: description, endDate, eventStatus, image, location.name,
 *      offers (availability, price, priceCurrency, url, validFrom), organizer,
 *      performer, previousStartDate.
 *     previousStartDate: "If you add previousStartDate, you must also add the
 *      eventStatus property and set the eventStatus to EventRescheduled."
 *     Timezones: "Specify the timezone by including the UTC or GMT time
 *      offset... If no timezone is provided, Google uses the timezone of the
 *      event's location as specified in location."
 *     Address: "The venue's detailed street address." A bare city is listed as
 *      NOT recommended ("Not recommended: Sydney").
 *     Ineligible: "Virtual experiences that have no real-world component
 *      aren't supported. Events must take place in a physical location."
 *     Technical: "Each event MUST have a unique URL (a leaf page) and markup on
 *      that URL."
 *
 *   Build and submit a sitemap
 *   https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *   (page last updated 2026-07-08 UTC, fetched 2026-08-23)
 *
 *     "Google ignores <priority> and <changefreq> values."
 *     "Google uses the <lastmod> value if it's consistently and verifiably
 *      (for example by comparing to the last modification of the page)
 *      accurate."
 *     Limits: 50MB uncompressed or 50,000 URLs per sitemap.
 *
 * USAGE
 *   node scripts/verify/event-structured-data-audit.mjs [BASE] [--limit N] [--json]
 *
 * EXIT CODE
 *   0 when every audited page carries valid Event structured data.
 *   1 when any page fails a REQUIRED rule. Recommended-property gaps are
 *     reported as WARN and never fail, because Google does not gate
 *     eligibility on them.
 */
import { setTimeout as delay } from 'node:timers/promises'

const args = process.argv.slice(2)
const BASE = (args.find(a => a.startsWith('http')) ?? 'http://127.0.0.1:3311').replace(/\/$/, '')
const LIMIT = Number(args.includes('--limit') ? args[args.indexOf('--limit') + 1] : 0) || 0
const AS_JSON = args.includes('--json')

/** ISO-8601 carrying an explicit UTC offset or Z. */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/
/** ISO-8601 date, or date and time, with no offset. Legal, but weaker. */
const ISO_NO_OFFSET = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/

const EVENT_TYPES = new Set([
  'Event', 'MusicEvent', 'ComedyEvent', 'TheaterEvent', 'SportsEvent',
  'Festival', 'FoodEvent', 'DanceEvent', 'ScreeningEvent', 'SocialEvent',
  'EducationEvent', 'BusinessEvent', 'ChildrensEvent', 'ExhibitionEvent',
  'LiteraryEvent', 'VisualArtsEvent',
])

const nonEmpty = v => typeof v === 'string' && v.trim().length > 0

/** Walks a JSON-LD payload (object, array or @graph) yielding Event nodes. */
export function* eventNodes(node) {
  if (Array.isArray(node)) {
    for (const n of node) yield* eventNodes(n)
    return
  }
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node['@graph'])) {
    for (const n of node['@graph']) yield* eventNodes(n)
  }
  const t = node['@type']
  const types = Array.isArray(t) ? t : [t]
  if (types.some(x => EVENT_TYPES.has(x))) yield node
}

/**
 * Validates one Event node against the rules cited in the header.
 *
 * An ERROR means Google's documented REQUIRED set is unmet, or a documented
 * rule is actively violated, so the page is not eligible.
 */
export function validateEventNode(ev) {
  const errors = []
  const warnings = []

  if (!nonEmpty(ev.name)) errors.push('name is missing or empty (REQUIRED)')

  if (!nonEmpty(ev.startDate)) {
    errors.push('startDate is missing (REQUIRED)')
  } else if (!ISO_WITH_OFFSET.test(ev.startDate) && !ISO_NO_OFFSET.test(ev.startDate)) {
    errors.push('startDate "' + ev.startDate + '" is not ISO-8601 (REQUIRED)')
  } else if (!ISO_WITH_OFFSET.test(ev.startDate)) {
    warnings.push('startDate carries no UTC offset; Google falls back to the location timezone')
  }

  const mode = String(ev.eventAttendanceMode ?? '')
  const isOnlineOnly = mode.includes('OnlineEventAttendanceMode')
  const loc = ev.location

  if (!loc) {
    errors.push('location is missing (REQUIRED)')
  } else if (isOnlineOnly) {
    warnings.push('online-only event: ineligible for the event experience (must take place in a physical location)')
  } else {
    const places = Array.isArray(loc) ? loc : [loc]
    const place = places.find(p => p && p['@type'] === 'Place') ?? places[0]
    if (!place || typeof place !== 'object') {
      errors.push('location is not an object (REQUIRED: Place)')
    } else {
      if (place['@type'] !== 'Place') {
        errors.push('location @type is "' + place['@type'] + '", expected "Place" (REQUIRED)')
      }
      const addr = place.address
      if (!addr) {
        errors.push('location.address is missing (REQUIRED)')
      } else if (typeof addr === 'object') {
        // NOT an error. The REQUIRED property is `location.address`, and it is
        // present. Google's guidance on street-level detail is a best practice
        // stated as "Not recommended: Sydney / Recommended: Bennelong Point,
        // Sydney NSW 2000, Australia", not an eligibility gate, so a missing
        // streetAddress degrades quality rather than disqualifying the page.
        // Reported as a warning so a build is never failed for a rule Google
        // does not actually enforce.
        if (!nonEmpty(addr.streetAddress) && !nonEmpty(addr.name)) {
          warnings.push('location.address has no streetAddress: Google marks a bare city as not recommended')
        }
        if (Object.keys(addr).filter(k => k !== '@type').length === 0) {
          errors.push('location.address is an empty PostalAddress (REQUIRED)')
        }
        if (!nonEmpty(addr.addressLocality)) warnings.push('location.address.addressLocality is empty')
        if (!nonEmpty(addr.addressCountry)) warnings.push('location.address.addressCountry is empty')
        if (!nonEmpty(addr.addressRegion)) warnings.push('location.address.addressRegion is empty')
      } else if (!nonEmpty(addr)) {
        errors.push('location.address is an empty string (REQUIRED)')
      }
      if (!nonEmpty(place.name)) warnings.push('location.name is empty (recommended for physical events)')
    }
  }

  const status = String(ev.eventStatus ?? '')
  if (ev.previousStartDate && !status.includes('EventRescheduled')) {
    errors.push('previousStartDate is present but eventStatus is not EventRescheduled (documented as required together)')
  }
  if (status.includes('EventRescheduled') && !ev.previousStartDate) {
    errors.push('eventStatus is EventRescheduled but previousStartDate is missing')
  }

  if (!nonEmpty(ev.description)) warnings.push('description is missing (recommended)')
  if (!ev.endDate) warnings.push('endDate is missing (recommended)')
  if (!ev.eventStatus) warnings.push('eventStatus is missing (recommended)')
  if (!ev.image) warnings.push('image is missing (recommended)')
  if (!ev.organizer) warnings.push('organizer is missing (recommended)')
  if (!ev.performer) warnings.push('performer is missing (recommended)')

  const offers = ev.offers
  if (!offers) {
    warnings.push('offers is missing (recommended)')
  } else {
    for (const o of Array.isArray(offers) ? offers : [offers]) {
      if (!o || typeof o !== 'object') continue
      const isAggregate = o['@type'] === 'AggregateOffer'
      const hasPrice = isAggregate ? o.lowPrice !== undefined : o.price !== undefined
      if (!hasPrice) warnings.push('offers has no ' + (isAggregate ? 'lowPrice' : 'price') + ' (recommended)')
      if (!nonEmpty(o.priceCurrency)) warnings.push('offers.priceCurrency is missing (recommended)')
      if (!nonEmpty(o.url)) warnings.push('offers.url is missing (recommended)')
      if (!nonEmpty(o.availability)) warnings.push('offers.availability is missing (recommended)')
      if (!o.validFrom) warnings.push('offers.validFrom is missing (recommended)')
    }
  }

  return { errors, warnings }
}

/** Extracts every JSON-LD payload from an HTML string. */
export function extractJsonLd(html) {
  const out = []
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    try {
      out.push(JSON.parse(m[1].trim()))
    } catch {
      out.push({ __parseError: true })
    }
  }
  return out
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'eventlinqs-sd-audit' } })
  return { status: res.status, text: res.status === 200 ? await res.text() : '' }
}

function pageType(p) {
  if (/^\/events\/[^/]+$/.test(p)) return 'event'
  if (/^\/events\/browse\/[^/]+$/.test(p)) return 'city-browse'
  if (/^\/city\/[^/]+\/[^/]+$/.test(p)) return 'suburb'
  if (/^\/city\/[^/]+$/.test(p)) return 'city'
  if (/^\/community\/[^/]+\/[^/]+$/.test(p)) return 'community-city'
  if (/^\/community\/[^/]+$/.test(p)) return 'community'
  if (/^\/categories\/[^/]+$/.test(p)) return 'category'
  if (/^\/organisers\/[^/]+$/.test(p)) return 'organiser'
  if (/^\/venues\/[^/]+$/.test(p)) return 'venue'
  if (/^\/faith\/[^/]+$/.test(p)) return 'faith'
  if (/^\/guides\/[^/]+$/.test(p)) return 'guide'
  return 'other'
}

async function main() {
  const sm = await fetchText(BASE + '/sitemap.xml')
  if (sm.status !== 200) throw new Error('sitemap.xml returned ' + sm.status)
  const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  const lastmods = [...sm.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1])

  const byType = new Map()
  for (const u of locs) {
    const path = u.replace(/^https?:\/\/[^/]+/, '')
    const t = pageType(path)
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t).push(path)
  }

  const eventPaths = byType.get('event') ?? []
  const targets = LIMIT ? eventPaths.slice(0, LIMIT) : eventPaths
  const res = { ok: 0, failed: 0, missing: 0, warned: 0, failures: [], warnings: [] }

  for (const path of targets) {
    const { status, text } = await fetchText(BASE + path)
    if (status !== 200) {
      res.missing++
      res.failures.push({ path, errors: ['page returned ' + status] })
      continue
    }
    const events = []
    for (const b of extractJsonLd(text)) for (const e of eventNodes(b)) events.push(e)
    if (events.length === 0) {
      res.failed++
      res.failures.push({ path, errors: ['no Event structured data on the page (REQUIRED)'] })
      continue
    }
    let errs = []
    let warns = []
    for (const ev of events) {
      const v = validateEventNode(ev)
      errs = errs.concat(v.errors)
      warns = warns.concat(v.warnings)
    }
    if (errs.length) {
      res.failed++
      res.failures.push({ path, errors: errs })
    } else {
      res.ok++
    }
    if (warns.length) {
      res.warned++
      res.warnings.push({ path, warnings: warns })
    }
    await delay(3)
  }

  const otherTypes = []
  for (const [t, paths] of byType) {
    if (t === 'event') continue
    const { status, text } = await fetchText(BASE + paths[0])
    const blocks = status === 200 ? extractJsonLd(text) : []
    const types = new Set()
    const walk = n => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (!n || typeof n !== 'object') return
      if (n['@type']) (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]).forEach(x => types.add(x))
      if (Array.isArray(n['@graph'])) n['@graph'].forEach(walk)
    }
    blocks.forEach(walk)
    otherTypes.push({ type: t, sampled: paths[0], status, count: paths.length, blocks: blocks.length, types: [...types].sort() })
  }

  const now = Date.now()
  const freshWithinAnHour = lastmods.filter(l => Math.abs(now - Date.parse(l)) < 3600000).length

  if (AS_JSON) {
    console.log(JSON.stringify({ res, otherTypes, sitemap: { total: locs.length, lastmods: lastmods.length, freshWithinAnHour } }, null, 2))
  } else {
    console.log('\n[sd-audit] base: ' + BASE)
    console.log('[sd-audit] sitemap: ' + locs.length + ' URLs, ' + lastmods.length + ' carry lastmod')
    console.log('[sd-audit] lastmod claiming "changed within the last hour": ' + freshWithinAnHour + ' of ' + lastmods.length)
    console.log('\n[sd-audit] EVENT PAGES AUDITED: ' + targets.length + ' of ' + eventPaths.length + ' in the sitemap')
    console.log('   valid (required set met): ' + res.ok)
    console.log('   FAILED:                   ' + res.failed)
    console.log('   unreachable:              ' + res.missing)
    console.log('   with recommended gaps:    ' + res.warned)

    if (res.failures.length) {
      const tally = new Map()
      for (const f of res.failures) {
        for (const e of new Set(f.errors)) {
          const key = e.replace(/"[^"]*"/g, '"..."')
          tally.set(key, (tally.get(key) ?? 0) + 1)
        }
      }
      console.log('\n[sd-audit] FAILURES by cause:')
      for (const [msg, n] of [...tally].sort((a, b) => b[1] - a[1])) {
        console.log('   ' + String(n).padStart(4) + '  ' + msg)
      }
      console.log('\n[sd-audit] example failing pages:')
      for (const f of res.failures.slice(0, 5)) console.log('   ' + f.path)
    }

    const warnTally = new Map()
    for (const w of res.warnings) {
      for (const msg of new Set(w.warnings)) {
        warnTally.set(msg, (warnTally.get(msg) ?? 0) + 1)
      }
    }
    if (warnTally.size) {
      console.log('\n[sd-audit] RECOMMENDED-PROPERTY GAPS, by count:')
      for (const [msg, n] of [...warnTally].sort((a, b) => b[1] - a[1])) {
        console.log('   ' + String(n).padStart(4) + '  ' + msg)
      }
    }

    console.log('\n[sd-audit] WHAT EVERY OTHER PAGE TYPE EMITS:')
    for (const o of otherTypes.sort((a, b) => a.type.localeCompare(b.type))) {
      const label = o.types.length ? o.types.join(', ') : 'NOTHING'
      console.log('   ' + o.type.padEnd(15) + String(o.count).padStart(5) + ' URLs  [' + o.status + ']  ' + o.blocks + ' block(s): ' + label)
    }
    console.log('')
  }

  process.exit(res.failed + res.missing > 0 ? 1 : 0)
}

main()
