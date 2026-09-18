/**
 * GA2 STEP 2. THE A, B, C COMPARISON, RUN AGAINST REAL ROWS RATHER THAN ARGUED.
 *
 * GA2 says: write the criteria down first, prototype three candidates far
 * enough to be judged, score all three, choose one, and record the two losers
 * with one line each saying why. This is the thing that does the scoring, and
 * it is kept in the tree so the choice can be re-run and argued with rather
 * than taken on trust.
 *
 * THE THREE CRITERIA, in the order GA2 states them:
 *
 *   1. SEPARATION between the top and bottom decile on historical orders.
 *      Measured by holding an event out: build every buyer's profile from all
 *      their OTHER orders, score every buyer against the held-out event, rank
 *      them, and ask what share of the people who actually bought that event
 *      landed in the top tenth of the ranking against the bottom tenth. A
 *      method that cannot beat random on this is a method that would be
 *      messaging everybody with extra steps.
 *   2. EXPLAINABILITY to an organiser in ONE SENTENCE PER COMPONENT. Judged by
 *      writing the sentences out. A method whose answer to "why these 340
 *      people" is a distance in a space nobody can see fails this outright, and
 *      the first organiser who asks is the reason it matters.
 *   3. COST to compute over the whole audience. Measured, in milliseconds, over
 *      the real buyer set and again over a 5,000 row synthetic one, because the
 *      audience this is built for is the one that exists in a year.
 *
 * WHAT THE SEPARATION NUMBER IS AND IS NOT. TEST carries 385 confirmed orders
 * across 234 addresses and 245 published events, and that catalogue is SEEDED.
 * So this measures whether each method ranks the shape of the data it is given,
 * not whether it predicts a real Australian buyer. It is the honest ceiling of
 * what can be measured before launch, it is stated as such in BUILD-LOG-B.md,
 * and the reversal condition in GA2 is what tests the method against reality.
 *
 * Run:
 *   node --env-file=.env.local scripts/verify/ga2-method-comparison.mjs \
 *     --out C:/dev/EVIDENCE/GA2
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
let out = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
if (!out) {
  console.error('FAIL: --out <directory> is required')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this comparison only reads TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

/* ----------------------------------------------------------------- the data */

/** Every confirmed order, with the event facts a buyer profile is made of. */
async function loadOrders() {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('orders')
      .select(
        'id, guest_email, user_id, subtotal_cents, total_cents, confirmed_at, updated_at, created_at, event_id',
      )
      .eq('status', 'confirmed')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`orders: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < pageSize) break
  }
  return rows
}

async function loadEvents(ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('events')
      .select('id, slug, title, category_id, community_primary, city_primary, venue_postal_code, tags, start_date, status')
      .in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`events: ${error.message}`)
    rows.push(...(data ?? []))
  }
  return rows
}

async function loadProfiles(ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('profiles').select('id, email').in('id', ids.slice(i, i + 200))
    rows.push(...(data ?? []))
  }
  return rows
}

async function loadCommunityMap() {
  const { data, error } = await db.from('community_tag_map').select('community_slug, tokens')
  if (error) throw new Error(`community_tag_map: ${error.message}`)
  return data ?? []
}

async function loadTierPrices(eventIds) {
  const rows = []
  for (let i = 0; i < eventIds.length; i += 200) {
    const { data } = await db
      .from('ticket_tiers')
      .select('event_id, price')
      .in('event_id', eventIds.slice(i, i + 200))
    rows.push(...(data ?? []))
  }
  return rows
}

/** The community slugs an event's tags resolve to, read from the map. */
function communitiesOf(event, communityMap) {
  const out = new Set()
  if (event.community_primary) out.add(event.community_primary)
  const tags = Array.isArray(event.tags) ? event.tags : []
  for (const row of communityMap) {
    if (tags.some(t => row.tokens.includes(String(t)))) out.add(row.community_slug)
  }
  return [...out]
}

function priceBandOf(cents) {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return 'unknown'
  if (cents <= 0) return 'free'
  if (cents < 3000) return 'under-30'
  if (cents < 6000) return '30-to-59'
  if (cents < 10000) return '60-to-99'
  if (cents < 20000) return '100-to-199'
  return '200-plus'
}

const BAND_ORDER = ['free', 'under-30', '30-to-59', '60-to-99', '100-to-199', '200-plus']

/* ------------------------------------------------------- the three prototypes */

/**
 * A. WEIGHTED ADDITIVE. Each component is a 0 to 1 fit, multiplied by a weight,
 * summed and scaled to 100. Every component is one column against one column.
 */
const WEIGHTS_A = {
  category: 0.26,
  community: 0.18,
  city: 0.16,
  postcode: 0.08,
  price: 0.12,
  recency: 0.14,
  spend: 0.06,
}
const HALF_LIFE_DAYS = 120

function postcodeFit(buyerPostcode, eventPostcode) {
  if (!buyerPostcode || !eventPostcode) return 0
  if (buyerPostcode === eventPostcode) return 1
  if (buyerPostcode.slice(0, 2) === eventPostcode.slice(0, 2)) return 0.6
  if (buyerPostcode.slice(0, 1) === eventPostcode.slice(0, 1)) return 0.3
  return 0
}

function priceFit(buyerBand, eventBand, tolerance = 1) {
  if (buyerBand === 'unknown' || eventBand === 'unknown') return 0
  const distance = Math.abs(BAND_ORDER.indexOf(buyerBand) - BAND_ORDER.indexOf(eventBand))
  if (distance === 0) return 1
  if (distance <= tolerance) return 0.5
  return 0
}

function recencyFit(lastOrderAt, now) {
  if (!lastOrderAt) return 0
  const days = (now - Date.parse(lastOrderAt)) / 86_400_000
  if (!Number.isFinite(days) || days < 0) return 1
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

function scoreAdditive(buyer, event, now) {
  const parts = {
    category: buyer.categories.has(event.category_id) ? 1 : 0,
    community: event.communities.some(c => buyer.communities.has(c)) ? 1 : 0,
    city: event.city_primary && buyer.cities.has(event.city_primary) ? 1 : 0,
    postcode: postcodeFit(buyer.postcode, event.venue_postal_code),
    price: priceFit(buyer.priceBand, event.priceBand),
    recency: recencyFit(buyer.lastOrderAt, now),
    spend: Math.min(1, buyer.lifetimeCents / 50_000),
  }
  let total = 0
  for (const [k, v] of Object.entries(parts)) total += v * WEIGHTS_A[k]
  return Math.round(total * 1000) / 10
}

/**
 * B. RULES LADDER. Five tiers, first match wins, no arithmetic to argue with.
 */
function scoreLadder(buyer, event) {
  const sameCategory = buyer.categories.has(event.category_id)
  const sameCity = Boolean(event.city_primary && buyer.cities.has(event.city_primary))
  const sameCommunity = event.communities.some(c => buyer.communities.has(c))
  if (sameCategory && sameCity) return 90
  if (sameCategory || (sameCommunity && sameCity)) return 70
  if (sameCity) return 50
  if (sameCommunity || sameCategory) return 30
  return 10
}

/**
 * C. NEAREST NEIGHBOUR. Find the three past events most similar to this one and
 * score a buyer by how many of them they bought.
 */
function similarity(a, b) {
  let s = 0
  if (a.category_id && a.category_id === b.category_id) s += 3
  if (a.city_primary && a.city_primary === b.city_primary) s += 2
  const shared = a.communities.filter(c => b.communities.includes(c)).length
  s += shared
  if (a.priceBand === b.priceBand) s += 1
  return s
}

function buildNeighbourScorer(event, allEvents, buyersByEvent) {
  const neighbours = allEvents
    .filter(e => e.id !== event.id)
    .map(e => ({ event: e, s: similarity(event, e) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, 3)
  const neighbourBuyers = neighbours.map(n => buyersByEvent.get(n.event.id) ?? new Set())
  return buyer => {
    let hits = 0
    for (const set of neighbourBuyers) if (set.has(buyer.email)) hits += 1
    return Math.round((hits / Math.max(1, neighbourBuyers.length)) * 100)
  }
}

/* -------------------------------------------------------------- the evaluation */

/**
 * WHY THERE ARE TWO POPULATIONS, and it is the most important thing this file
 * learned.
 *
 * Leave-one-out over EVERY buyer is misleading on this dataset. 234 addresses
 * hold 385 confirmed orders and only twelve of them have bought more than once,
 * so removing a buyer's order to score them against it erases the entire
 * profile every method needs, and every actual buyer lands at the bottom with
 * an empty history. That measures the catalogue, not the method, and the first
 * run of this comparison reported both arithmetic methods as WORSE THAN RANDOM
 * for exactly that reason.
 *
 * So the separation is measured twice: over everybody, which is reported and
 * explained rather than hidden, and over the buyers who actually have a history
 * to score, which is the population a live matcher would ever be ranking.
 */
function decileSeparation(ranked, actualBuyers) {
  const n = ranked.length
  if (n < 20 || actualBuyers.size === 0) return null
  const tenth = Math.max(1, Math.floor(n / 10))
  const top = ranked.slice(0, tenth)
  const bottom = ranked.slice(n - tenth)
  const inTop = top.filter(r => actualBuyers.has(r.email)).length
  const inBottom = bottom.filter(r => actualBuyers.has(r.email)).length
  const base = actualBuyers.size / n
  return {
    topRate: inTop / tenth,
    bottomRate: inBottom / tenth,
    liftOverRandom: base === 0 ? null : inTop / tenth / base,
  }
}

async function main() {
  const orders = await loadOrders()
  const profiles = await loadProfiles([...new Set(orders.map(o => o.user_id).filter(Boolean))])
  const profileEmail = new Map(profiles.map(p => [p.id, (p.email ?? '').toLowerCase()]))
  const eventIds = [...new Set(orders.map(o => o.event_id).filter(Boolean))]
  const events = await loadEvents(eventIds)
  const communityMap = await loadCommunityMap()
  const tiers = await loadTierPrices(eventIds)

  const medianTierPrice = new Map()
  for (const id of eventIds) {
    const prices = tiers.filter(t => t.event_id === id).map(t => t.price).sort((a, b) => a - b)
    medianTierPrice.set(id, prices.length ? prices[Math.floor(prices.length / 2)] : null)
  }

  const eventById = new Map()
  for (const e of events) {
    eventById.set(e.id, {
      ...e,
      communities: communitiesOf(e, communityMap),
      priceBand: priceBandOf(medianTierPrice.get(e.id)),
    })
  }

  // Who bought what, and every buyer's profile built from ALL their orders.
  const buyersByEvent = new Map()
  const buyerOrders = new Map()
  for (const o of orders) {
    const email = (o.guest_email ?? profileEmail.get(o.user_id) ?? '').toLowerCase()
    if (!email || !o.event_id || !eventById.has(o.event_id)) continue
    if (!buyersByEvent.has(o.event_id)) buyersByEvent.set(o.event_id, new Set())
    buyersByEvent.get(o.event_id).add(email)
    if (!buyerOrders.has(email)) buyerOrders.set(email, [])
    buyerOrders.get(email).push(o)
  }

  const now = Date.now()

  /** A buyer profile built from every order EXCEPT the ones for `excludeEventId`. */
  function profileFor(email, excludeEventId) {
    const kept = buyerOrders.get(email).filter(o => o.event_id !== excludeEventId)
    const categories = new Set()
    const communities = new Set()
    const cities = new Set()
    let lifetimeCents = 0
    let lastOrderAt = null
    let lastUnit = null
    let postcode = null
    for (const o of kept) {
      const e = eventById.get(o.event_id)
      if (!e) continue
      if (e.category_id) categories.add(e.category_id)
      for (const c of e.communities) communities.add(c)
      if (e.city_primary) cities.add(e.city_primary)
      lifetimeCents += o.total_cents ?? 0
      const at = o.confirmed_at ?? o.updated_at ?? o.created_at
      if (!lastOrderAt || Date.parse(at) > Date.parse(lastOrderAt)) {
        lastOrderAt = at
        lastUnit = o.subtotal_cents ?? 0
        postcode = e.venue_postal_code ?? null
      }
    }
    return {
      email,
      categories,
      communities,
      cities,
      lifetimeCents,
      lastOrderAt,
      priceBand: priceBandOf(lastUnit),
      postcode,
      orders: kept.length,
    }
  }

  // The held-out events: the ones with the most buyers, so a decile is meaningful.
  const heldOut = [...buyersByEvent.entries()]
    .filter(([, set]) => set.size >= 3)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 20)
    .map(([id]) => id)

  const allEmails = [...buyerOrders.keys()]
  const methods = [
    { key: 'A-weighted-additive', score: (buyer, event) => scoreAdditive(buyer, event, now) },
    { key: 'B-rules-ladder', score: (buyer, event) => scoreLadder(buyer, event) },
    { key: 'C-nearest-neighbour', score: null },
  ]

  const results = {}
  for (const m of methods) results[m.key] = { separations: [], withHistory: [], msTotal: 0 }

  let profilesWithHistory = 0
  let profilesWithout = 0

  for (const eventId of heldOut) {
    const event = eventById.get(eventId)
    const actual = buyersByEvent.get(eventId)
    const profilesForRun = allEmails.map(e => profileFor(e, eventId))
    const withHistory = profilesForRun.filter(p => p.orders > 0)
    profilesWithHistory += withHistory.length
    profilesWithout += profilesForRun.length - withHistory.length

    for (const m of methods) {
      const scorer =
        m.key === 'C-nearest-neighbour'
          ? buildNeighbourScorer(event, [...eventById.values()], buyersByEvent)
          : buyer => m.score(buyer, event)
      const started = performance.now()
      const ranked = profilesForRun
        .map(buyer => ({ email: buyer.email, score: scorer(buyer) }))
        .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
      results[m.key].msTotal += performance.now() - started
      const sep = decileSeparation(ranked, actual)
      if (sep) results[m.key].separations.push(sep)

      /*
       * The positives are intersected with the population, and the first
       * version of this file forgot to, which made the restricted number
       * meaningless: most actual buyers of a held-out event have no other
       * order, so they are not IN the with-history population at all, and
       * counting them as positives against a list they are absent from
       * measures nothing but their absence.
       */
      const rankedWithHistory = withHistory
        .map(buyer => ({ email: buyer.email, score: scorer(buyer) }))
        .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
      const presentPositives = new Set(
        [...actual].filter(e => withHistory.some(p => p.email === e)),
      )
      const sepHistory = decileSeparation(rankedWithHistory, presentPositives)
      if (sepHistory) results[m.key].withHistory.push(sepHistory)
    }
  }

  // Cost again, over a synthetic 5,000 row audience: the list this is built for.
  const synthetic = []
  for (let i = 0; i < 5000; i += 1) {
    const source = profileFor(allEmails[i % allEmails.length], null)
    synthetic.push({ ...source, email: `synthetic-${i}@lane-b.test` })
  }
  const costEvent = eventById.get(heldOut[0])
  const syntheticCost = {}
  for (const m of methods) {
    const scorer =
      m.key === 'C-nearest-neighbour'
        ? buildNeighbourScorer(costEvent, [...eventById.values()], buyersByEvent)
        : buyer => m.score(buyer, costEvent)
    const started = performance.now()
    synthetic.map(b => ({ email: b.email, score: scorer(b) })).sort((a, b) => b.score - a.score)
    syntheticCost[m.key] = Math.round((performance.now() - started) * 10) / 10
  }

  const summary = {}
  const round = v => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000)
  for (const m of methods) {
    const meanOf = (rows, k) =>
      rows.length ? rows.reduce((s, x) => s + (x[k] ?? 0), 0) / rows.length : null
    const seps = results[m.key].separations
    const hist = results[m.key].withHistory
    summary[m.key] = {
      everybody: {
        eventsJudged: seps.length,
        meanTopDecileRate: round(meanOf(seps, 'topRate')),
        meanBottomDecileRate: round(meanOf(seps, 'bottomRate')),
        meanLiftOverRandom: round(meanOf(seps, 'liftOverRandom')),
      },
      buyersWithAHistoryToScore: {
        eventsJudged: hist.length,
        meanTopDecileRate: round(meanOf(hist, 'topRate')),
        meanBottomDecileRate: round(meanOf(hist, 'bottomRate')),
        meanLiftOverRandom: round(meanOf(hist, 'liftOverRandom')),
      },
      msPerRunOverEveryBuyer: Math.round((results[m.key].msTotal / Math.max(1, heldOut.length)) * 100) / 100,
      msOver5000Synthetic: syntheticCost[m.key],
    }
  }

  /*
   * IS THERE ANY SIGNAL HERE TO FIND? Asked before any conclusion is drawn from
   * the separation numbers, because "no method beat random" means nothing until
   * somebody checks whether the data contains a pattern at all.
   *
   * The only place repeat taste can show up is a buyer who bought twice. For
   * every such buyer, this asks how often their second purchase shares a
   * category with their first, against how often two events drawn at random
   * from the catalogue share one.
   */
  const repeat = [...buyerOrders.entries()].filter(([, os]) => os.length > 1)
  let pairs = 0
  let sharedCategory = 0
  for (const [, os] of repeat) {
    for (let i = 0; i < os.length; i += 1) {
      for (let j = i + 1; j < os.length; j += 1) {
        const a = eventById.get(os[i].event_id)
        const b = eventById.get(os[j].event_id)
        if (!a || !b) continue
        pairs += 1
        if (a.category_id && a.category_id === b.category_id) sharedCategory += 1
      }
    }
  }
  const catalogue = [...eventById.values()]
  let randomPairs = 0
  let randomShared = 0
  for (let i = 0; i < catalogue.length; i += 1) {
    for (let j = i + 1; j < catalogue.length; j += 1) {
      randomPairs += 1
      if (catalogue[i].category_id && catalogue[i].category_id === catalogue[j].category_id) randomShared += 1
    }
  }

  const report = {
    item: 'GA2 step 2, the A B C comparison',
    isThereSignalToFind: {
      buyersWhoBoughtTwiceOrMore: repeat.length,
      orderPairsFromThem: pairs,
      shareOfThosePairsSharingACategory: round(pairs ? sharedCategory / pairs : null),
      shareOfRandomEventPairsSharingACategory: round(randomPairs ? randomShared / randomPairs : null),
      reading:
        'If the first number is not clearly above the second, this catalogue carries no repeat-taste pattern, and no ranking method can separate on it. That is a fact about seeded data, not about any of the three methods.',
    },
    at: new Date().toISOString(),
    dataset: {
      confirmedOrders: orders.length,
      buyers: allEmails.length,
      eventsBoughtFrom: eventById.size,
      heldOutEvents: heldOut.length,
      buyerProfilesWithAHistory: profilesWithHistory,
      buyerProfilesLeftEmptyByTheHoldOut: profilesWithout,
      caveat:
        'TEST is a seeded catalogue. This measures whether a method ranks the shape of the data it is given, not whether it predicts a real buyer.',
    },
    summary,
  }
  writeFileSync(join(out, 'method-comparison.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

await main()
