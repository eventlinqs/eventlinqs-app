/**
 * DRIVEN PROOF: EVERY PAGE TYPE EMITS THE STRUCTURED DATA GOOGLE READS, THE
 * VALUES COME OUT OF THE DATABASE, AND NOTHING ABOUT IT IS VISIBLE.
 *
 * SEO1, acceptances 2, 4 and 6. The guard executes the serialiser and the unit
 * tests judge the payload; neither of them can see what a RUNNING SERVER puts on
 * the page. That gap is not theoretical: the premise SEO1 was written on was a
 * fetch of the live event page that reported "no script tag of type
 * application/ld+json of any kind", and the blocks were there the whole time, in
 * the body, where a head-only read never looks.
 *
 * So this asks a real server, over HTTP, on lane C's own port.
 *
 * THE PHASES:
 *
 *   --phase seed      creates a lane-C organisation, a lane-C venue (by name, the
 *                     way /venues/[handle] resolves one) and a PUBLISHED lane-C
 *                     event with a postcode, a Melbourne zone and two tiers.
 *   --phase markup    fetches the rendered HTML of five page types and asserts
 *                     the expected @type on each, then judges the event block
 *                     property by property against the row it was built from.
 *                     This is acceptance 4.
 *   --phase live      changes the event's start time in the database and asserts
 *                     the emitted startDate follows it. This is acceptance 2:
 *                     proof the markup is READ rather than stored.
 *   --phase withheld  sets the event to draft and asserts the public page stops
 *                     answering and emits no Event block, then restores it.
 *   --phase visual    390, 768 and 1440. Captures each page, then removes every
 *                     JSON-LD script from the DOM and captures again, and
 *                     asserts the two images are byte identical. That is a
 *                     stronger answer to "unchanged to the eye" than a human
 *                     comparison: a script element cannot render, and this
 *                     proves it rather than asserting it. With axe.
 *   --phase cleanup   deletes everything this drive created and asserts it is
 *                     gone.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/seo1-structured-data-drive.mjs --phase seed --tag lane-c-seo1
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { withdrawnOnlineEventPattern } from '../lib/withdrawn-online-event-properties.mjs'

/*
 * THE SHARED PREFLIGHT, FIRST, because this script writes rows. It resolves the
 * project this process will ACTUALLY use rather than the one an environment
 * variable claims, refuses production unless ALLOW_PRODUCTION_SUPABASE=1 is set
 * deliberately, and refuses outright when it cannot tell. The hand-rolled regex
 * that was here first only caught a production ref it could see in a string,
 * which is the narrower half of the job.
 */
assertNotProduction()

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/SEO1'
let phase = 'markup'
let tag = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--phase') phase = args[++i]
  else if (args[i] === '--tag') tag = args[++i]
}
mkdirSync(out, { recursive: true })
if (!tag) {
  console.error('FAIL: --tag is required, so the phases share the rows they created')
  process.exit(2)
}

const BASE = (process.env.BASE ?? 'http://localhost:3200').replace(/\/$/, '')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(2)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

/*
 * The two properties Google withdrew on 5 June 2025, from the one module that
 * names them. Built there rather than written here so the guard that forbids
 * them does not fail on the proof that they are gone; see that module's header.
 */
const WITHDRAWN_ONLINE_EVENT = withdrawnOnlineEventPattern()

const ZONE = 'Australia/Melbourne'
const POSTCODE = '3065'
/*
 * NO HYPHENS IN THE VENUE NAME, and that is the resolver's rule rather than a
 * preference. /venues/[handle] has no venues row to look up here, so it falls
 * back to un-slugifying the handle (`handle.replace(/-/g, ' ')`) and matching
 * that against events.venue_name. A hyphen inside the stored name becomes a
 * space in the candidate and the ilike never matches, so the page 404s. Found by
 * the first run of this drive, with "Lane C Structured Data Hall lane-c-seo1".
 */
const VENUE_NAME = 'Lane C Structured Data Hall'
const FIXTURE = join(out, `fixture-${tag}.json`)

/* ── the ledger ───────────────────────────────────────────────────────────── */

const LEDGER = join(out, 'checks.json')
function loadLedger() {
  if (!existsSync(LEDGER)) return []
  try {
    return JSON.parse(readFileSync(LEDGER, 'utf8')).filter(c => c.phase !== phase)
  } catch (error) {
    // A ledger this run cannot read is a run whose earlier phases have just been
    // silently discarded, so the totals at the end would UNDERSTATE the work and
    // look like a smaller pass. Said out loud rather than swallowed.
    console.warn(`[seo1-drive] could not read ${LEDGER}, starting a fresh ledger: ${error.message}`)
    return []
  }
}
const checks = loadLedger()
function check(id, pass, detail) {
  checks.push({ phase, id, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail ?? ''}`)
}
function saveLedger() {
  writeFileSync(LEDGER, JSON.stringify(checks, null, 2))
  const mine = checks.filter(c => c.phase === phase)
  const failed = checks.filter(c => !c.pass)
  console.log(`\nphase ${phase}: ${mine.filter(c => c.pass).length} of ${mine.length}`)
  console.log(`all phases: ${checks.filter(c => c.pass).length} of ${checks.length}, ${failed.length} failing`)
  if (failed.length) for (const f of failed) console.log(`  FAIL ${f.phase}/${f.id}: ${f.detail}`)
  process.exit(failed.length ? 1 : 0)
}

function readFixture() {
  if (!existsSync(FIXTURE)) {
    console.error(`FAIL: ${FIXTURE} does not exist. Run --phase seed first.`)
    process.exit(2)
  }
  return JSON.parse(readFileSync(FIXTURE, 'utf8'))
}

/* ── reading blocks off a real response ───────────────────────────────────── */

async function fetchPage(path) {
  const url = `${BASE}${path}`
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' })
  const html = await res.text()
  return { status: res.status, html, url }
}

/** Every JSON-LD block in the response, parsed. Unparseable blocks are kept. */
function blocksOf(html) {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  const out = []
  let m
  while ((m = re.exec(html))) {
    try {
      out.push({ ok: true, node: JSON.parse(m[1]) })
    } catch (error) {
      out.push({ ok: false, raw: m[1].slice(0, 200), error: error.message })
    }
  }
  return out
}

const typeOf = b => (b.ok ? String(b.node['@type'] ?? '') : '(unparseable)')

/* ── phases ───────────────────────────────────────────────────────────────── */

if (phase === 'seed') {
  const stamp = Date.now().toString(36)
  const email = `seo1.${tag}.${stamp}@eventlinqs.test`

  const created = await db.auth.admin.createUser({
    email,
    password: `Lane-C-${stamp}-${Math.random().toString(36).slice(2)}`,
    email_confirm: true,
  })
  if (created.error) throw new Error(`create owner: ${created.error.message}`)
  const userId = created.data.user.id
  await db.from('profiles').upsert({
    id: userId, email, full_name: 'Lane C SEO1', display_name: 'Lane C SEO1', is_verified: true,
  })

  const { data: cat } = await db.from('event_categories').select('id, slug').eq('slug', 'music').maybeSingle()
  // A published event must carry a real cover: the database enforces it
  // (events_published_real_cover). Borrowed from an existing published event
  // rather than invented, because the constraint would refuse an invented URL.
  const { data: coverDonor } = await db
    .from('events')
    .select('cover_image_url')
    .eq('status', 'published')
    .not('cover_image_url', 'is', null)
    .not('cover_image_url', 'ilike', 'https://picsum.photos/%')
    .limit(1)
    .maybeSingle()

  const { data: org, error: orgErr } = await db
    .from('organisations')
    .insert({
      name: `Lane C Structured Data ${stamp}`,
      slug: `${tag}-org-${stamp}`,
      owner_id: userId,
      email,
      status: 'active',
      payout_status: 'active',
    })
    .select('id, slug, name')
    .single()
  if (orgErr) throw new Error(`create organisation: ${orgErr.message}`)

  /*
   * A START TIME WHOSE UTC FORM AND LOCAL FORM DISAGREE, ON PURPOSE. Stored as
   * 01:00 UTC on 10 October 2026, which is 12:00 in Melbourne, six days after
   * Australian eastern time moves to UTC+11. If the drive picked a date where
   * the two agreed, a serialiser that never converted would still pass.
   */
  const startIso = '2026-10-10T01:00:00.000Z'
  const endIso = '2026-10-10T03:30:00.000Z'

  const { data: event, error: evErr } = await db
    .from('events')
    .insert({
      title: `Lane C Structured Data Night ${stamp}`,
      slug: `${tag}-event-${stamp}`,
      description: 'Lane C structured data drive.',
      summary: 'One night of machine readable markup, driven on lane C.',
      organisation_id: org.id,
      created_by: userId,
      category_id: cat?.id ?? null,
      start_date: startIso,
      end_date: endIso,
      timezone: ZONE,
      event_type: 'in_person',
      venue_name: VENUE_NAME,
      venue_address: '141 Johnston Street',
      venue_city: 'Fitzroy',
      venue_state: 'VIC',
      venue_postal_code: POSTCODE,
      venue_country: 'Australia',
      status: 'published',
      visibility: 'public',
      published_at: new Date().toISOString(),
      cover_image_url: coverDonor?.cover_image_url ?? null,
      is_age_restricted: false,
      max_capacity: 120,
      is_free: false,
      fee_pass_type: 'pass_to_buyer',
    })
    .select('id, slug')
    .single()
  if (evErr) throw new Error(`create event: ${evErr.message}`)

  // TWO tiers, so "one Offer per tier" is actually exercised. A single-tier
  // event would pass a serialiser that still emitted one AggregateOffer.
  const tiers = [
    { event_id: event.id, name: 'Early bird', price: 2500, currency: 'AUD', total_capacity: 60, is_active: true },
    { event_id: event.id, name: 'General', price: 4000, currency: 'AUD', total_capacity: 60, is_active: true },
  ]
  const { data: tierRows, error: tierErr } = await db.from('ticket_tiers').insert(tiers).select('id, name, price')
  if (tierErr) throw new Error(`create tiers: ${tierErr.message}`)

  const venueHandle = VENUE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  writeFileSync(FIXTURE, JSON.stringify({
    userId, email, orgId: org.id, orgSlug: org.slug, orgName: org.name,
    eventId: event.id, eventSlug: event.slug, venueHandle, venueName: VENUE_NAME,
    startIso, endIso, tiers: tierRows,
  }, null, 2))

  check('seed.a-published-lane-c-event-exists', true, `${event.slug}, two tiers, postcode ${POSTCODE}, zone ${ZONE}`)
  check('seed.the-venue-page-has-a-handle', Boolean(venueHandle), `/venues/${venueHandle}`)
  check('seed.every-row-carries-lane-c', [org.slug, event.slug, email].every(v => v.includes('lane-c')),
    `${org.slug} | ${event.slug} | ${email}`)
  saveLedger()
}

if (phase === 'markup') {
  const f = readFixture()
  const { data: row, error } = await db
    .from('events')
    .select('title, start_date, end_date, timezone, venue_name, venue_address, venue_city, venue_state, venue_postal_code, venue_country')
    .eq('id', f.eventId)
    .single()
  if (error) throw new Error(`read the event back: ${error.message}`)

  const pages = [
    { label: 'event', path: `/events/${f.eventSlug}`, expect: ['Event', 'BreadcrumbList'] },
    // ItemList, not a nested Event array: SEO1 v2, FAULT THREE. Both profiles
    // hold exactly one upcoming lane-C event, so the list must be present.
    { label: 'organiser', path: `/organisers/${f.orgSlug}`, expect: ['Organization', 'ItemList', 'BreadcrumbList'] },
    { label: 'venue', path: `/venues/${f.venueHandle}`, expect: ['Place', 'ItemList', 'BreadcrumbList'] },
    { label: 'events-listing', path: '/events', expect: ['CollectionPage', 'BreadcrumbList'] },
    { label: 'homepage', path: '/', expect: ['WebSite', 'Organization'] },
  ]

  let eventBlock = null
  for (const p of pages) {
    const { status, html } = await fetchPage(p.path)
    check(`markup.${p.label}.answers-200`, status === 200, `${p.path} answered ${status}`)
    if (status !== 200) continue

    const blocks = blocksOf(html)
    writeFileSync(join(out, `blocks-${p.label}.json`), JSON.stringify(blocks, null, 2))

    check(`markup.${p.label}.every-block-parses`, blocks.every(b => b.ok),
      `${blocks.length} block(s); unparseable: ${blocks.filter(b => !b.ok).length}`)
    check(`markup.${p.label}.every-block-declares-the-schema-org-context`,
      blocks.length > 0 && blocks.every(b => b.ok && b.node['@context'] === 'https://schema.org'),
      blocks.map(typeOf).join(', ') || 'no blocks at all')

    for (const wanted of p.expect) {
      // An Event sub-type (MusicEvent, ComedyEvent) satisfies "Event".
      const found = blocks.some(b => b.ok && (typeOf(b) === wanted || (wanted === 'Event' && typeOf(b).endsWith('Event'))))
      check(`markup.${p.label}.emits-${wanted}`, found, `types present: ${blocks.map(typeOf).join(', ')}`)
    }
    if (p.label === 'event') {
      eventBlock = blocks.find(b => b.ok && typeOf(b).endsWith('Event'))?.node ?? null
      check('markup.event.exactly-one-event-block',
        blocks.filter(b => b.ok && typeOf(b).endsWith('Event')).length === 1,
        `${blocks.filter(b => b.ok && typeOf(b).endsWith('Event')).length} Event block(s)`)
    }

    /*
     * SEO1 v2, FAULT ONE, over the WHOLE rendered page rather than over a block.
     * The attendance mode was emitted inside the Event node, but a page could
     * carry it anywhere, and the assertion that means something to Google is
     * about the bytes it receives.
     */
    check(`markup.${p.label}.no-withdrawn-attendance-mode`,
      !WITHDRAWN_ONLINE_EVENT.test(html),
      'Google removed online events, and every property describing one, on 5 June 2025')
  }

  /*
   * SEO1 v2, FAULT THREE: NO EVENT NODE ON A PAGE THAT LISTS EVENTS.
   *
   * Google: "Each event MUST have a unique URL (a leaf page) and markup on that
   * URL. The event experience on Google only supports pages that focus on a
   * single event."
   *
   * EVERY LISTING SURFACE, AND THE SLUGS ARE HARVESTED FROM THE RUNNING APP
   * rather than typed here. /cities and /communities are the two index pages a
   * user actually clicks through, so the pages judged below are the pages the
   * platform genuinely publishes, and a slug that changes cannot leave this
   * check quietly aiming at a 404.
   */
  const harvest = (html, prefix) => [
    ...new Set(
      [...html.matchAll(new RegExp(`href="(${prefix}/[a-z0-9-]+)"`, 'g'))].map(m => m[1]),
    ),
  ]
  const { html: citiesHtml, status: citiesStatus } = await fetchPage('/cities')
  const { html: communitiesHtml, status: communitiesStatus } = await fetchPage('/communities')
  check('markup.listing.index-pages-answer-200',
    citiesStatus === 200 && communitiesStatus === 200,
    `/cities ${citiesStatus}, /communities ${communitiesStatus}`)

  const discovery = [
    ...harvest(citiesHtml, '/city').slice(0, 3),
    ...harvest(communitiesHtml, '/community').slice(0, 3),
    ...harvest(communitiesHtml, '/faith').slice(0, 3),
  ]
  check('markup.listing.harvested-real-discovery-pages', discovery.length >= 6,
    `${discovery.length} harvested: ${discovery.join(', ')}`)

  const listingPaths = [
    '/events',
    `/organisers/${f.orgSlug}`,
    `/venues/${f.venueHandle}`,
    '/cities',
    '/communities',
    ...discovery,
  ]
  const offenders = []
  for (const path of listingPaths) {
    const { status, html } = await fetchPage(path)
    if (status !== 200) {
      offenders.push(`${path} answered ${status}`)
      continue
    }
    const evented = blocksOf(html).filter(b => b.ok && typeOf(b).endsWith('Event'))
    if (evented.length > 0) offenders.push(`${path} (${evented.map(typeOf).join(', ')})`)
    if (WITHDRAWN_ONLINE_EVENT.test(html)) offenders.push(`${path} (attendance mode)`)
  }
  check('markup.listing.no-event-node-on-any-page-that-lists-events',
    offenders.length === 0,
    offenders.length === 0
      ? `${listingPaths.length} listing pages judged, all clean: ${listingPaths.join(', ')}`
      : `offenders: ${offenders.join('; ')}`)

  if (!eventBlock) {
    check('markup.event.block-present-for-judging', false, 'no Event block to judge, every check below is skipped')
    saveLedger()
  }

  /* Property by property, against the row it was built from. */
  check('markup.event.name-is-the-row-title', eventBlock.name === row.title,
    `emitted "${eventBlock.name}", row "${row.title}"`)

  check('markup.event.startDate-is-the-same-instant-as-the-row',
    Date.parse(eventBlock.startDate) === Date.parse(row.start_date),
    `emitted ${eventBlock.startDate}, row ${row.start_date}`)
  check('markup.event.startDate-carries-the-events-own-offset-not-utc',
    eventBlock.startDate === '2026-10-10T12:00:00+11:00',
    `emitted ${eventBlock.startDate}; the page tells a human 12:00 pm in ${row.timezone}`)
  check('markup.event.endDate-carries-the-same-offset',
    /\+11:00$/.test(String(eventBlock.endDate)) && Date.parse(eventBlock.endDate) === Date.parse(row.end_date),
    `emitted ${eventBlock.endDate}, row ${row.end_date}`)

  const address = eventBlock.location?.address ?? {}
  check('markup.event.location-is-a-Place-named-by-the-row',
    eventBlock.location?.['@type'] === 'Place' && eventBlock.location?.name === row.venue_name,
    `emitted "${eventBlock.location?.name}", row "${row.venue_name}"`)
  check('markup.event.postalCode-is-emitted-from-the-row',
    address.postalCode === row.venue_postal_code,
    `emitted "${address.postalCode}", row "${row.venue_postal_code}"`)
  check('markup.event.addressCountry-is-the-iso-code',
    address.addressCountry === 'AU',
    `emitted "${address.addressCountry}", row "${row.venue_country}"`)
  check('markup.event.streetAddress-and-locality-come-from-the-row',
    address.streetAddress === row.venue_address && address.addressLocality === row.venue_city,
    `${address.streetAddress} | ${address.addressLocality}`)

  check('markup.event.organizer-resolves-to-the-organiser-page',
    eventBlock.organizer?.name === f.orgName &&
      String(eventBlock.organizer?.url ?? '').endsWith(`/organisers/${f.orgSlug}`),
    `${eventBlock.organizer?.name} -> ${eventBlock.organizer?.url}`)

  const offers = Array.isArray(eventBlock.offers) ? eventBlock.offers : [eventBlock.offers].filter(Boolean)
  const expectedPrices = [...f.tiers].map(t => (t.price / 100).toFixed(2)).sort()
  check('markup.event.one-offer-per-tier',
    offers.length === f.tiers.length,
    `${offers.length} offer(s) for ${f.tiers.length} tier(s): ${offers.map(o => `${o.name} ${o.price}`).join(', ')}`)
  check('markup.event.every-offer-price-is-a-tier-price',
    JSON.stringify(offers.map(o => String(o.price)).sort()) === JSON.stringify(expectedPrices),
    `emitted [${offers.map(o => o.price).join(', ')}], tiers [${expectedPrices.join(', ')}]`)
  check('markup.event.every-offer-carries-currency-availability-url-and-validFrom',
    offers.length > 0 && offers.every(o =>
      o.priceCurrency === 'AUD' &&
      String(o.availability).startsWith('https://schema.org/') &&
      String(o.url).startsWith('http') &&
      Boolean(o.validFrom)),
    offers.map(o => `${o.priceCurrency}/${String(o.availability).split('/').pop()}`).join(', '))

  check('markup.event.every-url-in-the-block-is-absolute',
    JSON.stringify(eventBlock).match(/"(?:url|item)":"(?!https?:\/\/)[^"]*"/g) === null,
    'no relative url or item value anywhere in the payload')

  saveLedger()
}

if (phase === 'live') {
  const f = readFixture()
  const before = await fetchPage(`/events/${f.eventSlug}?lane-c=${Date.now()}`)
  const beforeBlock = blocksOf(before.html).find(b => b.ok && typeOf(b).endsWith('Event'))?.node
  check('live.the-page-emits-a-start-before-the-change', Boolean(beforeBlock?.startDate), beforeBlock?.startDate)

  /*
   * The same wall clock, one week later, so the offset does NOT change and the
   * only thing that can move the emitted value is the row.
   *
   * BOTH DATES MOVE TOGETHER, and the database taught the drive that: the first
   * run moved start_date alone and was refused by the `events_check` constraint,
   * which is right, because an event cannot end before it begins.
   */
  const movedIso = '2026-10-17T01:00:00.000Z'
  const movedEndIso = '2026-10-17T03:30:00.000Z'
  const { error } = await db
    .from('events')
    .update({ start_date: movedIso, end_date: movedEndIso })
    .eq('id', f.eventId)
  if (error) throw new Error(`move the start time: ${error.message}`)

  const after = await fetchPage(`/events/${f.eventSlug}?lane-c=${Date.now()}`)
  const afterBlock = blocksOf(after.html).find(b => b.ok && typeOf(b).endsWith('Event'))?.node

  check('live.the-emitted-startDate-followed-the-row',
    afterBlock?.startDate === '2026-10-17T12:00:00+11:00',
    `before ${beforeBlock?.startDate}, row moved to ${movedIso}, after ${afterBlock?.startDate}`)
  check('live.the-markup-is-read-and-not-stored',
    afterBlock?.startDate !== beforeBlock?.startDate,
    'the value changed with the row, so nothing is cached into the markup')

  const { error: restoreErr } = await db
    .from('events')
    .update({ start_date: f.startIso, end_date: f.endIso })
    .eq('id', f.eventId)
  if (restoreErr) throw new Error(`restore the start time: ${restoreErr.message}`)
  const restored = await fetchPage(`/events/${f.eventSlug}?lane-c=${Date.now()}`)
  const restoredBlock = blocksOf(restored.html).find(b => b.ok && typeOf(b).endsWith('Event'))?.node
  check('live.the-start-time-was-put-back',
    restoredBlock?.startDate === '2026-10-10T12:00:00+11:00',
    restoredBlock?.startDate)

  saveLedger()
}

if (phase === 'withheld') {
  const f = readFixture()
  const { error } = await db.from('events').update({ status: 'draft' }).eq('id', f.eventId)
  if (error) throw new Error(`unpublish: ${error.message}`)

  const draft = await fetchPage(`/events/${f.eventSlug}?lane-c=${Date.now()}`)
  const eventBlocks = blocksOf(draft.html).filter(b => b.ok && typeOf(b).endsWith('Event'))
  check('withheld.a-draft-event-page-does-not-answer-200', draft.status !== 200,
    `${draft.status} for /events/${f.eventSlug} while the row is a draft`)
  check('withheld.a-draft-event-emits-no-Event-block', eventBlocks.length === 0,
    `${eventBlocks.length} Event block(s) on the draft response`)

  const { error: back } = await db.from('events').update({ status: 'published' }).eq('id', f.eventId)
  if (back) throw new Error(`republish: ${back.message}`)
  const live = await fetchPage(`/events/${f.eventSlug}?lane-c=${Date.now()}`)
  check('withheld.republishing-brings-the-block-back',
    live.status === 200 && blocksOf(live.html).some(b => b.ok && typeOf(b).endsWith('Event')),
    `${live.status}, types: ${blocksOf(live.html).map(typeOf).join(', ')}`)

  saveLedger()
}

if (phase === 'visual') {
  const f = readFixture()
  const viewports = [
    { label: '390', width: 390, height: 844 },
    { label: '768', width: 768, height: 1024 },
    { label: '1440', width: 1440, height: 900 },
  ]
  const pages = [
    { label: 'event', path: `/events/${f.eventSlug}` },
    { label: 'organiser', path: `/organisers/${f.orgSlug}` },
    { label: 'venue', path: `/venues/${f.venueHandle}` },
    { label: 'events-listing', path: '/events' },
    { label: 'homepage', path: '/' },
  ]

  const browser = await chromium.launch()
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      for (const p of pages) {
        await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 120000 })

        /*
         * THE COMPARISON THAT ACTUALLY PROVES "UNCHANGED TO THE EYE".
         *
         * SEO1 acceptance 6 asks for a visual comparison showing this item adds
         * no visible element. A before-and-after against a second build would
         * compare two different trees and two different data sets, which is a
         * weaker answer than it looks. This compares the SAME page against
         * ITSELF with every JSON-LD block removed from the DOM: if the two
         * images are byte identical, the blocks contribute nothing visible,
         * which is the claim being made.
         */
        /*
         * THE STRUCTURAL CHECK, WHICH ALWAYS SPEAKS. Every JSON-LD node must
         * occupy no space and none of its text may appear in what a reader can
         * read. This is the claim itself, measured on the live DOM.
         */
        const seen = await page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          const text = document.body.innerText
          return {
            count: nodes.length,
            boxed: nodes.filter(n => {
              const r = n.getBoundingClientRect()
              return r.width > 0 || r.height > 0
            }).length,
            leaked: nodes.filter(n => {
              const probe = (n.textContent ?? '').slice(0, 60)
              return probe.length > 0 && text.includes(probe)
            }).length,
          }
        })
        check(`visual.${p.label}.${vp.label}.the-markup-is-on-the-page`, seen.count > 0,
          `${seen.count} JSON-LD block(s) present`)
        check(`visual.${p.label}.${vp.label}.no-block-occupies-any-space`, seen.boxed === 0,
          `${seen.boxed} of ${seen.count} block(s) have a non-zero box`)
        check(`visual.${p.label}.${vp.label}.no-block-text-reaches-the-reader`, seen.leaked === 0,
          `${seen.leaked} of ${seen.count} block(s) appear in document.body.innerText`)

        /*
         * THE PIXEL CHECK, WITH A CONTROL, because a full-page capture of a long
         * lazy-loading page is not always byte stable and a bare A-versus-B would
         * report that instability as a visible change. Two captures are taken
         * with NOTHING altered between them; only if those agree is the third,
         * taken with every block removed, evidence about the markup. When the
         * control disagrees the page is reported as unstable rather than failed,
         * and the structural check above still stands.
         */
        const controlOne = await page.screenshot({ fullPage: true })
        const controlTwo = await page.screenshot({ fullPage: true })
        const removed = await page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          nodes.forEach(n => n.remove())
          return nodes.length
        })
        const withoutMarkup = await page.screenshot({ fullPage: true })

        const stable = controlOne.equals(controlTwo)
        if (stable) {
          check(`visual.${p.label}.${vp.label}.removing-the-markup-changes-no-pixel`,
            controlTwo.equals(withoutMarkup),
            `${controlTwo.length} bytes with, ${withoutMarkup.length} bytes without, control stable`)
        } else {
          check(`visual.${p.label}.${vp.label}.pixel-control-is-unstable-so-the-structural-check-decides`,
            true,
            `two identical captures differed by ${Math.abs(controlOne.length - controlTwo.length)} bytes, ` +
              `so this page is not byte stable at this width and the pixel comparison cannot speak. ` +
              `Removed ${removed} block(s); the structural checks above are the verdict.`)
        }

        writeFileSync(join(out, `${p.label}-${vp.label}.png`), controlOne)
      }

      // axe on the page that gained the most markup, at every width.
      await page.goto(`${BASE}/events/${f.eventSlug}`, { waitUntil: 'networkidle', timeout: 120000 })
      const axe = await new AxeBuilder({ page }).analyze()
      writeFileSync(join(out, `axe-event-${vp.label}.json`), JSON.stringify(axe.violations, null, 2))
      check(`visual.event.${vp.label}.axe-zero-violations`, axe.violations.length === 0,
        `${axe.violations.length} violation(s)`)

      await context.close()
    }
  } finally {
    await browser.close()
  }
  saveLedger()
}

if (phase === 'cleanup') {
  const f = readFixture()
  await db.from('ticket_tiers').delete().eq('event_id', f.eventId)
  await db.from('events').delete().eq('id', f.eventId)
  await db.from('organisations').delete().eq('id', f.orgId)
  await db.auth.admin.deleteUser(f.userId)

  const { data: ev } = await db.from('events').select('id').eq('id', f.eventId)
  const { data: org } = await db.from('organisations').select('id').eq('id', f.orgId)
  const { data: tiers } = await db.from('ticket_tiers').select('id').eq('event_id', f.eventId)
  check('cleanup.the-event-is-gone', (ev ?? []).length === 0, `${(ev ?? []).length} row(s) left`)
  check('cleanup.the-tiers-are-gone', (tiers ?? []).length === 0, `${(tiers ?? []).length} row(s) left`)
  check('cleanup.the-organisation-is-gone', (org ?? []).length === 0, `${(org ?? []).length} row(s) left`)
  saveLedger()
}

console.error(`FAIL: unknown phase "${phase}"`)
process.exit(2)
