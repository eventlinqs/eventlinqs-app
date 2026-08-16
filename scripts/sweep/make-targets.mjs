// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * Builds the walker's target list from real TEST data, so the sweep clicks
 * slugs that exist rather than slugs that were guessed. Deliberately includes
 * the EMPTY cases (a city with no events, a community with no events, a suburb,
 * a category with no matching row) because those are Journey D.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error('not the TEST project')
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const nowIso = new Date().toISOString()
const q = async (label, p) => {
  const { data, error } = await p
  if (error) console.error(`  ! ${label}: ${error.message}`)
  return data || []
}

const events = await q(
  'events',
  db
    .from('events')
    .select('id,slug,title,venue_city,organisation_id,start_date')
    .eq('status', 'published')
    .gte('start_date', nowIso)
    .order('start_date', { ascending: true })
    .limit(400),
)
const tiers = await q(
  'ticket_tiers',
  db.from('ticket_tiers').select('event_id,price,is_active').limit(5000),
)

const byEvent = new Map()
for (const t of tiers) {
  if (!byEvent.has(t.event_id)) byEvent.set(t.event_id, [])
  byEvent.get(t.event_id).push(t)
}

const free = []
const paid = []
const noTiers = []
for (const e of events) {
  const t = byEvent.get(e.id) || []
  if (!t.length) {
    noTiers.push(e)
    continue
  }
  const min = Math.min(...t.map((x) => Number(x.price)))
  ;(min === 0 ? free : paid).push(e)
}

const cityCounts = {}
for (const e of events) cityCounts[e.venue_city || '(null)'] = (cityCounts[e.venue_city || '(null)'] || 0) + 1

console.log(`future published: ${events.length}  free: ${free.length}  paid: ${paid.length}  no tiers: ${noTiers.length}`)
console.log('free sample   :', free.slice(0, 3).map((e) => e.slug).join(' | '))
console.log('paid sample   :', paid.slice(0, 3).map((e) => e.slug).join(' | '))
console.log('no-tier sample:', noTiers.slice(0, 3).map((e) => e.slug).join(' | '))
console.log('city counts   :', JSON.stringify(cityCounts))

const orgs = await q(
  'organisations',
  db.from('organisations').select('id,name,slug,stripe_charges_enabled').limit(30),
)
console.log('orgs:', orgs.map((o) => `${o.slug}(charges=${o.stripe_charges_enabled})`).join(', '))

const CITIES_WITH = ['sydney', 'melbourne', 'geelong', 'brisbane']
const CITIES_EMPTY = ['darwin', 'launceston', 'toowoomba']
const COMMUNITIES = ['african', 'aboriginal-torres-strait-islander', 'indian', 'greek']
const COMMUNITIES_EMPTY = ['persian-iranian', 'other-european']

const t = []
const add = (id, p, extra = {}) => t.push({ id, path: p, ...extra })

// Journey A, the stranger.
add('home', '/')
add('events-browse', '/events')
add('events-q-multiword', '/events?q=electronic%20dance')
add('events-q-singleword', '/events?q=pop')
add('events-q-phrase', '/events?q=jazz%20soul')
add('events-tab-organisers', '/events?tab=organisers&q=sydney')
add('events-tab-cities', '/events?tab=cities&q=melbourne')
add('events-filter-city', '/events?city=sydney')
add('events-filter-city-date', '/events?city=sydney&date=weekend')
add('events-filter-eventtype', '/events?city=sydney&event_type=concert')
add('events-category-music', '/events?category=music')
add('events-category-comedy', '/events?category=comedy')
add('cities-index', '/cities')
for (const c of CITIES_WITH) add(`city-${c}`, `/city/${c}`)
for (const c of CITIES_EMPTY) add(`city-empty-${c}`, `/city/${c}`)
add('city-suburb', '/city/sydney/bondi')
add('communities-index', '/communities')
for (const c of COMMUNITIES) add(`community-${c}`, `/community/${c}`)
for (const c of COMMUNITIES_EMPTY) add(`community-empty-${c}`, `/community/${c}`)
add('community-city', '/community/african/sydney')
add('community-city-empty', '/community/persian-iranian/darwin')
add('categories-music', '/categories/music')
add('categories-comedy', '/categories/comedy')
add('categories-nightlife', '/categories/nightlife')
add('browse-city', '/events/browse/sydney')
add('feed', '/feed')
add('guides', '/guides')
add('help', '/help')
add('pricing', '/pricing')
add('organisers-marketing', '/organisers')
add('for-organisers', '/for-organisers')
add('about', '/about')
add('contact', '/contact')
add('careers', '/careers')
add('press', '/press')
add('waitlist', '/waitlist')
add('artists', '/artists')
add('gigs', '/gigs')
add('legal-privacy', '/legal/privacy')
add('legal-terms', '/legal/terms')
add('legal-refunds', '/legal/refunds')
add('login', '/login')
add('signup', '/signup')
add('forgot-password', '/forgot-password')
add('organisers-signup', '/organisers/signup')
add('account-signed-out', '/account')
add('tickets-signed-out', '/tickets')

if (free[0]) add('event-free', `/events/${free[0].slug}`)
if (paid[0]) add('event-paid', `/events/${paid[0].slug}`)
if (paid[1]) add('event-paid-2', `/events/${paid[1].slug}`)
if (noTiers[0]) add('event-no-tiers', `/events/${noTiers[0].slug}`)
if (orgs[0]) add('organiser-profile', `/organisers/${orgs[0].slug}`)

// Deliberate not-found probes: a person mistypes, or a stale link is followed.
add('event-missing', '/events/this-event-does-not-exist', { fullPage: false })
add('city-missing', '/city/not-a-city', { fullPage: false })

writeFileSync('scripts/sweep/targets.json', JSON.stringify(t, null, 1))
console.log(`\nwrote ${t.length} targets`)
