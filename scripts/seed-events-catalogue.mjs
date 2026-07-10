// Reusable general-breadth catalogue seed.
//
// Purpose: give discovery surfaces (homepage, /events, category rails) a
// Ticketmaster-rival spread of real-feeling Australian events across the
// general categories - sports, music, comedy, theatre, family, festival,
// food and drink, nightlife, arts, business - in Sydney, Melbourne, and
// Brisbane, at real venues with plausible near-future dates. This is the
// general layer the homepage leads with; community scenes stay one rail.
//
// Two output modes, picked by flag:
//   node scripts/seed-events-catalogue.mjs --fixture
//     Writes src/lib/dev/home-seed-fixture.json (RawRow[] shape the homepage
//     consumes under HOMEPAGE_SEED_FIXTURE=1). Touches no database. Used to
//     build and benchmark at full density locally while staging is not up.
//
//   node scripts/seed-events-catalogue.mjs            (no flag)
//     Upserts the catalogue into a Supabase project via the service role.
//     Idempotent: stable ids and slugs, re-running is a no-op for existing
//     rows. Resolves category_id by slug at runtime so it is portable.
//
// SAFETY: hard-refuses the production ref. DB mode targets STAGING_SUPABASE_URL
// when set, else NEXT_PUBLIC_SUPABASE_URL, and aborts if that resolves to prod.
// Never seed prod.
//
// Imagery: cover_image_url is left null on purpose. The media components render
// the branded placeholder until the Adobe Stock library lands, at which point
// this script is re-run with real cover URLs wired in.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PROD_REF = 'gndnldyfudbytbboxesk' // production Supabase project - never seed this

const FIXTURE = process.argv.includes('--fixture')

// ── env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
      if (!line.includes('=') || line.trim().startsWith('#')) continue
      const i = line.indexOf('=')
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* fixture mode does not require env */ }
  return env
}

// ── reference data: real Australian venues per city ────────────────────────
const VENUES = {
  Sydney: [
    { name: 'Enmore Theatre', address: '118-132 Enmore Road, Newtown', state: 'NSW' },
    { name: 'Qudos Bank Arena', address: 'Olympic Boulevard, Sydney Olympic Park', state: 'NSW' },
    { name: 'ICC Sydney', address: '14 Darling Drive, Sydney', state: 'NSW' },
    { name: 'Carriageworks', address: '245 Wilson Street, Eveleigh', state: 'NSW' },
    { name: 'Metro Theatre', address: '624 George Street, Sydney', state: 'NSW' },
    { name: 'Hordern Pavilion', address: '1 Driver Avenue, Moore Park', state: 'NSW' },
    { name: 'Oxford Art Factory', address: '38-46 Oxford Street, Darlinghurst', state: 'NSW' },
    { name: 'Sydney Town Hall', address: '483 George Street, Sydney', state: 'NSW' },
  ],
  Melbourne: [
    { name: 'The Forum', address: '154 Flinders Street, Melbourne', state: 'VIC' },
    { name: '170 Russell', address: '170 Russell Street, Melbourne', state: 'VIC' },
    { name: 'Sidney Myer Music Bowl', address: 'Linlithgow Avenue, Melbourne', state: 'VIC' },
    { name: 'Melbourne Convention and Exhibition Centre', address: '1 Convention Centre Place, South Wharf', state: 'VIC' },
    { name: 'The Comedy Theatre', address: '240 Exhibition Street, Melbourne', state: 'VIC' },
    { name: 'Hamer Hall', address: '100 St Kilda Road, Melbourne', state: 'VIC' },
    { name: 'Royal Exhibition Building', address: '9 Nicholson Street, Carlton', state: 'VIC' },
    { name: 'Margaret Court Arena', address: 'Olympic Boulevard, Melbourne', state: 'VIC' },
  ],
  Brisbane: [
    { name: 'Fortitude Music Hall', address: '312 Brunswick Street, Fortitude Valley', state: 'QLD' },
    { name: 'The Tivoli', address: '52 Costin Street, Fortitude Valley', state: 'QLD' },
    { name: 'Riverstage', address: '59 Gardens Point Road, Brisbane City', state: 'QLD' },
    { name: 'Brisbane Convention and Exhibition Centre', address: 'Cnr Merivale and Glenelg Streets, South Brisbane', state: 'QLD' },
    { name: 'QPAC', address: 'Grey Street, South Brisbane', state: 'QLD' },
    { name: 'The Triffid', address: '7-9 Stratton Street, Newstead', state: 'QLD' },
    { name: 'Brisbane City Hall', address: '64 Adelaide Street, Brisbane City', state: 'QLD' },
    { name: 'Eatons Hill Hotel', address: '646 South Pine Road, Eatons Hill', state: 'QLD' },
  ],
}

// ── catalogue: general breadth, real-feeling AU events ─────────────────────
// Each: category slug, city, venue index, title, summary, longer blurb, tiers.
// Tier price in cents. is_free derived when every tier price is 0.
const C = {
  music: { name: 'Music', slug: 'music' },
  food: { name: 'Food & Drink', slug: 'food-drink' },
  festival: { name: 'Festival', slug: 'festival' },
  arts: { name: 'Arts & Community', slug: 'arts-community' },
  nightlife: { name: 'Nightlife', slug: 'nightlife' },
  comedy: { name: 'Comedy', slug: 'comedy' },
  sports: { name: 'Sports', slug: 'sports' },
  family: { name: 'Family', slug: 'family' },
  business: { name: 'Business & Networking', slug: 'business-networking' },
}

function ga(price, cap = 400) { return [{ name: 'General Admission', price, cap }] }
function tiered(a, b, cap = 500) {
  return [
    { name: 'General Admission', price: a, cap },
    { name: 'Premium', price: b, cap: Math.round(cap / 4) },
  ]
}

const CATALOGUE = [
  // ── Music (leads) ────────────────────────────────────────────────────
  { cat: C.music, city: 'Sydney', v: 0, title: 'Indie Sounds Live at the Enmore', summary: 'A double bill of breakthrough Australian indie bands', blurb: 'Two of the most talked-about indie acts on the national circuit share one stage for a single Sydney show, with a local opener to start the night.', tiers: tiered(5900, 9900) },
  { cat: C.music, city: 'Melbourne', v: 0, title: 'Soul and Funk Revue', summary: 'A live band tribute to the golden age of soul', blurb: 'A twelve-piece band runs through the classics that built soul and funk, brass section included, for one night at The Forum.', tiers: tiered(6500, 11000) },
  { cat: C.music, city: 'Brisbane', v: 0, title: 'River City Acoustic Evening', summary: 'Stripped-back sets from singer-songwriters', blurb: 'An intimate, seated acoustic evening with three songwriters trading songs and stories at the Fortitude Music Hall.', tiers: ga(4500) },
  { cat: C.music, city: 'Sydney', v: 5, title: 'Electronic Live Showcase', summary: 'Live electronic production, not a DJ set', blurb: 'A showcase of artists performing electronic music live with hardware, modular rigs, and visuals built for the Hordern.', tiers: tiered(7500, 13500) },
  { cat: C.music, city: 'Melbourne', v: 2, title: 'Symphony Under the Stars', summary: 'Open-air orchestral night at the Bowl', blurb: 'A full orchestra plays film scores and classical favourites in the open air, with picnic rugs welcome on the lawn.', tiers: tiered(4900, 8900, 2000) },
  { cat: C.music, city: 'Brisbane', v: 2, title: 'Sunset Sessions on the River', summary: 'Outdoor live music as the sun goes down', blurb: 'A rolling lineup of bands plays the Riverstage from late afternoon into the evening, food trucks on site.', tiers: ga(5500, 1500) },
  { cat: C.music, city: 'Sydney', v: 4, title: 'Late Night Jazz at the Metro', summary: 'A quartet plays two sets after dark', blurb: 'A celebrated quartet plays two full sets of standards and originals in a room set up for listening.', tiers: ga(5200) },
  { cat: C.music, city: 'Melbourne', v: 1, title: 'New Music Friday Live', summary: 'Four emerging acts, one room', blurb: 'A rotating night dedicated to acts releasing their first records, hosted at 170 Russell with a different bill each month.', tiers: ga(3500) },
  { cat: C.music, city: 'Brisbane', v: 5, title: 'Folk and Roots Night', summary: 'Banjos, fiddles, and close harmony', blurb: 'A warm folk and roots bill at The Triffid, with a seated front section and standing room at the back.', tiers: ga(4200) },

  // ── Food & Drink (leads) ─────────────────────────────────────────────
  { cat: C.food, city: 'Melbourne', v: 3, title: 'Melbourne Night Noodle Market', summary: 'Hawker stalls and street food after dark', blurb: 'Dozens of vendors bring hawker-style street food to South Wharf across one long weekend of evening trading.', tiers: ga(0, 5000) },
  { cat: C.food, city: 'Sydney', v: 1, title: 'Harbour City Wine and Cheese', summary: 'A guided tasting of local producers', blurb: 'A walk-around tasting of New South Wales wineries and cheesemakers, with sommeliers on hand at every table.', tiers: tiered(6900, 12000) },
  { cat: C.food, city: 'Brisbane', v: 3, title: 'Brisbane Coffee and Roasters Expo', summary: 'A day for specialty coffee lovers', blurb: 'Roasters, brewers, and baristas gather for tastings, latte art, and a home-brewing masterclass program.', tiers: ga(3200, 1200) },
  { cat: C.food, city: 'Melbourne', v: 6, title: 'Long Table Harvest Dinner', summary: 'A shared seasonal menu under one roof', blurb: 'A single long table, a set seasonal menu from a guest chef, and matched local drinks at the Royal Exhibition Building.', tiers: tiered(11000, 18000, 200) },
  { cat: C.food, city: 'Sydney', v: 3, title: 'Dumpling and Dim Sum Festival', summary: 'A weekend of yum cha and street dumplings', blurb: 'Stalls from across Sydney serve dumplings, bao, and dim sum at Carriageworks, with chef demonstrations on the hour.', tiers: ga(0, 4000) },
  { cat: C.food, city: 'Brisbane', v: 7, title: 'Craft Beer and Cider Garden', summary: 'Independent breweries pour all afternoon', blurb: 'A relaxed garden session with independent Queensland breweries and cider makers, live acoustic sets between pours.', tiers: ga(2900, 1500) },
  { cat: C.food, city: 'Melbourne', v: 4, title: 'Chocolate and Dessert Fair', summary: 'A sweet tooth paradise for one weekend', blurb: 'Chocolatiers and pastry chefs sell, sample, and demonstrate across a weekend built entirely around dessert.', tiers: ga(2500, 2000) },

  // ── Festival (leads) ─────────────────────────────────────────────────
  { cat: C.festival, city: 'Sydney', v: 3, title: 'Inner West Arts and Music Festival', summary: 'A full day across multiple stages', blurb: 'Music, makers markets, and street performers fill Carriageworks and the surrounding precinct for a single big day.', tiers: tiered(6500, 12500, 3000) },
  { cat: C.festival, city: 'Melbourne', v: 2, title: 'Summer in the Park Festival', summary: 'Live stages, food trucks, family zone', blurb: 'A day-long park festival with two music stages, a food truck precinct, and a dedicated zone for younger guests.', tiers: ga(5900, 4000) },
  { cat: C.festival, city: 'Brisbane', v: 2, title: 'Riverfire Music and Lights', summary: 'Music programmed around the river lights', blurb: 'A free-entry evening of live music staged along the river, building to a coordinated lights display over the water.', tiers: ga(0, 8000) },
  { cat: C.festival, city: 'Sydney', v: 6, title: 'Laneway Makers Festival', summary: 'Independent makers and live sets', blurb: 'Independent designers and makers take over a laneway precinct with stalls, demonstrations, and a small live stage.', tiers: ga(0, 3000) },
  { cat: C.festival, city: 'Melbourne', v: 6, title: 'Lunar New Year Street Festival', summary: 'A community day of food, lion dance, and music', blurb: 'A street festival marking Lunar New Year with lion dance, market stalls, and a continuous program on the main stage.', tiers: ga(0, 6000) },
  { cat: C.festival, city: 'Brisbane', v: 4, title: 'Festival of Ideas Weekend', summary: 'Talks, performance, and installations', blurb: 'A weekend pass to talks, performance, and interactive installations across the QPAC precinct.', tiers: tiered(4500, 8000, 2500) },

  // ── Arts and Community, including theatre (leads) ──────────────────────
  { cat: C.arts, city: 'Melbourne', v: 4, title: 'A Midsummer Night Dream on Stage', summary: 'A bold new staging of the classic', blurb: 'A contemporary production of the Shakespeare classic in a single limited season at The Comedy Theatre.', tiers: tiered(5900, 11900) },
  { cat: C.arts, city: 'Sydney', v: 3, title: 'Contemporary Art After Hours', summary: 'Galleries open late with live programming', blurb: 'A late opening of contemporary galleries at Carriageworks with artist talks, performance, and a bar.', tiers: ga(2500) },
  { cat: C.arts, city: 'Brisbane', v: 4, title: 'The Glass Menagerie', summary: 'A touring production of the stage classic', blurb: 'A touring theatre company brings the Tennessee Williams classic to QPAC for a strictly limited run.', tiers: tiered(5500, 10500) },
  { cat: C.arts, city: 'Melbourne', v: 5, title: 'Spoken Word and Poetry Night', summary: 'Featured poets and an open mic', blurb: 'An evening of featured spoken word artists followed by a hosted open mic at Hamer Hall studio.', tiers: ga(2200) },
  { cat: C.arts, city: 'Sydney', v: 7, title: 'Photography Exhibition Opening', summary: 'Opening night of a documentary series', blurb: 'The opening of a documentary photography exhibition, with the photographer in conversation at Sydney Town Hall.', tiers: ga(0) },
  { cat: C.arts, city: 'Brisbane', v: 6, title: 'Contemporary Dance Double Bill', summary: 'Two new works from a touring company', blurb: 'A double bill of new contemporary dance works performed by a national touring company at Brisbane City Hall.', tiers: tiered(4900, 8900) },
  { cat: C.arts, city: 'Melbourne', v: 7, title: 'Ballet Gala Evening', summary: 'Highlights from the season repertoire', blurb: 'A gala evening of highlights from the current ballet repertoire performed at Margaret Court Arena.', tiers: tiered(6900, 14900) },

  // ── Nightlife (leads) ────────────────────────────────────────────────
  { cat: C.nightlife, city: 'Sydney', v: 6, title: 'Rooftop Sundowner Sessions', summary: 'House and disco as the sun sets', blurb: 'A rooftop session of house and disco with resident DJs and a guest, running from late afternoon into the night.', tiers: ga(3500) },
  { cat: C.nightlife, city: 'Melbourne', v: 1, title: 'Warehouse Late Night', summary: 'A long night across two rooms', blurb: 'Two rooms, two sounds, and a late licence at 170 Russell for a single warehouse-style night.', tiers: tiered(3900, 6900) },
  { cat: C.nightlife, city: 'Brisbane', v: 1, title: 'Valley After Dark', summary: 'Resident DJs across the Tivoli', blurb: 'A full-venue night at The Tivoli with residents and a headline guest spinning until close.', tiers: ga(3200) },
  { cat: C.nightlife, city: 'Sydney', v: 4, title: 'Disco Fever Throwback', summary: 'Seventies and eighties all night', blurb: 'A throwback night of seventies and eighties disco and pop at the Metro, dress code encouraged.', tiers: ga(2900) },
  { cat: C.nightlife, city: 'Melbourne', v: 0, title: 'Live Band Karaoke Night', summary: 'Sing your song with a real band', blurb: 'A live band backs the crowd through requests all night at The Forum, sign-up from doors.', tiers: ga(2500) },
  { cat: C.nightlife, city: 'Brisbane', v: 5, title: 'Vinyl Only Listening Night', summary: 'Selectors play records front to back', blurb: 'A slower, vinyl-only night of deep cuts and album sides at The Triffid for the record lovers.', tiers: ga(2200) },

  // ── Comedy ───────────────────────────────────────────────────────────
  { cat: C.comedy, city: 'Melbourne', v: 4, title: 'Stand-Up Showcase Gala', summary: 'Eight comedians, one big night', blurb: 'A gala lineup of touring and local stand-up acts hosted across one night at The Comedy Theatre.', tiers: tiered(4500, 7500) },
  { cat: C.comedy, city: 'Sydney', v: 4, title: 'Comedy Cellar Late Show', summary: 'A loose, late, no-rules room', blurb: 'A late show where touring comedians try new material in a small, sharp room at the Metro.', tiers: ga(3200) },
  { cat: C.comedy, city: 'Brisbane', v: 7, title: 'Improv Battle Night', summary: 'Two teams, your suggestions', blurb: 'Two improv teams take audience suggestions and compete across fast rounds at Eatons Hill Hotel.', tiers: ga(2800) },
  { cat: C.comedy, city: 'Melbourne', v: 4, title: 'Solo Hour: New Show Preview', summary: 'A comedian previews a brand new hour', blurb: 'A single preview night of a brand new solo hour before it tours, at The Comedy Theatre.', tiers: ga(3500) },
  { cat: C.comedy, city: 'Sydney', v: 2, title: 'Comedy in the Round', summary: 'Five acts, seating on all sides', blurb: 'Five comedians play a stage in the round with the audience seated on every side at ICC Sydney.', tiers: tiered(3900, 6500) },

  // ── Sports ───────────────────────────────────────────────────────────
  { cat: C.sports, city: 'Sydney', v: 1, title: 'City Basketball Showcase', summary: 'A double-header at Qudos', blurb: 'A double-header of national league basketball with a community shoot-out at half time at Qudos Bank Arena.', tiers: tiered(3500, 8500, 6000) },
  { cat: C.sports, city: 'Melbourne', v: 7, title: 'Netball Grand Final Live', summary: 'Top of the table, live on court', blurb: 'A top-of-the-table netball clash with live entertainment and a junior clinic at Margaret Court Arena.', tiers: ga(4500, 5000) },
  { cat: C.sports, city: 'Brisbane', v: 3, title: 'Combat Sports Fight Night', summary: 'A full card of amateur and pro bouts', blurb: 'A full card of boxing and mixed martial arts bouts, table and general admission, at the Convention Centre.', tiers: tiered(5500, 12000) },
  { cat: C.sports, city: 'Sydney', v: 1, title: 'Esports Arena Finals', summary: 'Grand finals on the big screen', blurb: 'The grand finals of a national esports league played live on stage with full casting at Qudos Bank Arena.', tiers: ga(3900, 4000) },
  { cat: C.sports, city: 'Brisbane', v: 2, title: 'Park Run and Fitness Festival', summary: 'A morning of running and movement', blurb: 'A community fun run followed by free fitness classes and stalls along the river at Riverstage.', tiers: ga(0, 3000) },

  // ── Family ───────────────────────────────────────────────────────────
  { cat: C.family, city: 'Melbourne', v: 6, title: 'Science and Discovery Day', summary: 'Hands-on experiments for all ages', blurb: 'A day of hands-on science stations, live demonstrations, and a planetarium dome at the Royal Exhibition Building.', tiers: ga(2200, 3000) },
  { cat: C.family, city: 'Sydney', v: 3, title: 'Kids Theatre: The Big Adventure', summary: 'A morning show for young audiences', blurb: 'A bright, interactive stage show built for young audiences and their grown-ups at Carriageworks.', tiers: ga(2500) },
  { cat: C.family, city: 'Brisbane', v: 6, title: 'Family Fun Day in the City', summary: 'Rides, crafts, and a petting zoo', blurb: 'A free family day with craft tables, a petting zoo, and a small stage program at Brisbane City Hall.', tiers: ga(0, 4000) },
  { cat: C.family, city: 'Melbourne', v: 2, title: 'Outdoor Family Movie Night', summary: 'A family film on the big lawn', blurb: 'A family-friendly film screened on a large outdoor screen with food trucks and bean bags at the Bowl.', tiers: ga(1800, 2500) },
  { cat: C.family, city: 'Sydney', v: 7, title: 'Storytime and Puppets', summary: 'A gentle morning for little ones', blurb: 'A gentle storytelling and puppet morning for toddlers and pre-schoolers at Sydney Town Hall.', tiers: ga(1500) },

  // ── Business and Networking ──────────────────────────────────────────
  { cat: C.business, city: 'Sydney', v: 2, title: 'Founders and Investors Summit', summary: 'Keynotes, panels, and matched meetings', blurb: 'A day of keynotes and panels with a structured program of matched meetings between founders and investors at ICC Sydney.', tiers: tiered(14900, 34900, 600) },
  { cat: C.business, city: 'Melbourne', v: 3, title: 'Women in Leadership Breakfast', summary: 'A morning of talks and connection', blurb: 'A breakfast program of short talks and facilitated networking for women in leadership at the Convention Centre.', tiers: ga(8900, 400) },
  { cat: C.business, city: 'Brisbane', v: 3, title: 'Small Business Growth Day', summary: 'Practical workshops for operators', blurb: 'Practical, no-fluff workshops on marketing, finance, and hiring for small business operators at the Convention Centre.', tiers: tiered(6900, 12900) },
  { cat: C.business, city: 'Sydney', v: 7, title: 'Tech and Product Meetup', summary: 'Lightning talks and open networking', blurb: 'An evening of lightning talks from product and engineering leaders followed by open networking at Sydney Town Hall.', tiers: ga(0, 500) },
  { cat: C.business, city: 'Melbourne', v: 3, title: 'Creative Industries Mixer', summary: 'Connect across design, film, and media', blurb: 'A relaxed mixer bringing together people working across design, film, and media, drinks and short intros.', tiers: ga(3500, 400) },
]

// ── deterministic id from index ────────────────────────────────────────────
function eventId(i) {
  const n = String(i + 1).padStart(4, '0')
  return `c0a70000-0000-4000-8000-0000000${n}`
}
function tierId(i, t) {
  const n = String(i + 1).padStart(3, '0')
  const m = String(t + 1).padStart(2, '0')
  return `c0a70000-0000-4000-8001-00000${n}00${m}`
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Dates are assigned by a category round-robin "slot" rather than catalogue
// order, so the earliest slots span different categories. That makes the
// time-based This Week lead rail varied (one event per category up front),
// not nine Music events. Anchored to a fixed base for idempotency; ids and
// slugs are index-based, so changing dates never breaks re-runs.
const DAY = 24 * 60 * 60 * 1000
function computeSlots() {
  const catIndex = {}
  let nCats = 0
  for (const e of CATALOGUE) if (!(e.cat.slug in catIndex)) catIndex[e.cat.slug] = nCats++
  const rank = {}
  return CATALOGUE.map(e => {
    const r = rank[e.cat.slug] ?? 0
    rank[e.cat.slug] = r + 1
    return r * nCats + catIndex[e.cat.slug]
  })
}
function startDate(slot) {
  // First full round (one per category) lands inside 7 days so This Week
  // leads; the rest spread over the following weeks for the category rails.
  const base = Date.parse('2026-06-07T00:00:00Z')
  const d = new Date(base + Math.round(slot * 0.7 * DAY))
  d.setUTCHours([8, 9, 10, 6][slot % 4], 0, 0, 0) // 6pm/7pm/8pm/4pm AEST
  return d
}

function buildRows() {
  const slots = computeSlots()
  return CATALOGUE.map((e, i) => {
    const venue = VENUES[e.city][e.v]
    const start = startDate(slots[i])
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000)
    const slug = `cat-${slugify(e.title)}-${e.city.toLowerCase()}`
    const tiers = e.tiers.map((t, ti) => ({
      id: tierId(i, ti),
      name: t.name,
      price: t.price,
      currency: 'AUD',
      total_capacity: t.cap,
      sold_count: Math.round(t.cap * [0.18, 0.42, 0.66, 0.81, 0.34][i % 5]),
      reserved_count: 0,
    }))
    const isFree = tiers.every(t => t.price === 0)
    return {
      id: eventId(i),
      slug,
      title: e.title,
      summary: e.summary,
      description: e.blurb,
      category: e.cat,
      city: e.city,
      venue,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      is_free: isFree,
      tiers,
    }
  })
}

// ── fixture mode: write the density fixture for the dev/preview paths ────────
//
// The rows are a SUPERSET of the homepage RawRow shape: the homepage rails
// (loadHomeUpcoming) read the RawRow subset, while the event-detail data path
// (events/[slug] layout guard + fetchEvent, both fixture-aware under
// HOMEPAGE_SEED_FIXTURE=1) reads the extra detail fields below so a fixture
// card always resolves to a fully rendered detail page. One file, one source
// of truth - density and detail can never disagree.
function writeFixture(rows) {
  // A single synthetic organiser, marked sellable (connected + charges
  // enabled) so paid fixture events render the live ticket panel on the
  // preview rather than the "not on sale" state. Reservation/checkout remains
  // the staging-gated paid path; the preview only needs the page to render.
  const ORG = {
    id: 'c0a70000-0000-4000-8002-000000000001',
    name: 'EventLinqs Presents',
    slug: 'eventlinqs-presents',
    description:
      'The in-house EventLinqs production team, programming a national catalogue across music, food, arts, sport, comedy and community.',
    stripe_account_id: 'acct_fixture_preview',
    stripe_charges_enabled: true,
  }
  const rawRows = rows.map((r, i) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    description: r.description,
    cover_image_url: null,
    thumbnail_url: null,
    gallery_urls: null,
    start_date: r.start_date,
    end_date: r.end_date,
    timezone: 'Australia/Sydney',
    event_type: 'in_person',
    status: 'published',
    visibility: 'public',
    venue_name: r.venue.name,
    venue_address: r.venue.address,
    venue_city: r.city,
    venue_state: r.venue.state,
    venue_country: 'Australia',
    is_free: r.is_free,
    tags: ['catalogue', r.category.slug],
    // Spread created_at so the "Just added" sort has signal: newest first.
    created_at: new Date(Date.parse('2026-06-06T00:00:00Z') - i * 3600 * 1000).toISOString(),
    category: { name: r.category.name, slug: r.category.slug },
    organisation: ORG,
    ticket_tiers: r.tiers.map((t, ti) => ({
      id: t.id, name: t.name, price: t.price, currency: t.currency,
      sold_count: t.sold_count, reserved_count: t.reserved_count, total_capacity: t.total_capacity,
      min_per_order: 1, max_per_order: 10, sort_order: ti,
      is_visible: true, is_active: true, requires_access_code: false,
      tier_type: 'general_admission', dynamic_pricing_enabled: false,
      sale_start: null, sale_end: null, description: `${t.name} ticket`,
    })),
  }))
  const outDir = resolve(ROOT, 'src/lib/dev')
  mkdirSync(outDir, { recursive: true })
  const out = resolve(outDir, 'home-seed-fixture.json')
  writeFileSync(out, JSON.stringify(rawRows, null, 2) + '\n', 'utf8')
  const byCat = {}
  for (const r of rawRows) byCat[r.category.name] = (byCat[r.category.name] || 0) + 1
  console.log(`[seed:fixture] wrote ${rawRows.length} events to ${out}`)
  console.log('[seed:fixture] by category:', byCat)
}

// ── db mode: idempotent upsert into a non-prod Supabase project ─────────────
async function seedDb(env) {
  const url = process.env.STAGING_SUPABASE_URL || env.STAGING_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || env.STAGING_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('[seed:db] ABORT: no Supabase url/key. Set STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1) }
  if (url.includes(PROD_REF)) { console.error(`[seed:db] ABORT: refusing to seed PRODUCTION (${PROD_REF}). Point at staging or local only.`); process.exit(1) }

  const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  console.log(`[seed:db] target ${url}`)

  // Resolve a real org + creator to satisfy FK + not-null columns.
  const { data: org } = await s.from('organisations').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  const { data: profile } = await s.from('profiles').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!org || !profile) { console.error('[seed:db] ABORT: need at least one organisation and profile (run migrations/base seed first).'); process.exit(1) }

  // Resolve category ids by slug at runtime (portable across projects).
  const { data: cats } = await s.from('event_categories').select('id,slug')
  const catId = Object.fromEntries((cats ?? []).map(c => [c.slug, c.id]))
  const fallbackArts = catId['arts-community']

  const rows = buildRows()
  let inserted = 0, skipped = 0
  for (const r of rows) {
    const { data: existing } = await s.from('events').select('id').eq('id', r.id).maybeSingle()
    if (existing) { skipped++; continue }
    const category_id = catId[r.category.slug] ?? fallbackArts ?? null
    const { error: evErr } = await s.from('events').insert({
      id: r.id, title: r.title, slug: r.slug, description: r.description, summary: r.summary,
      organisation_id: org.id, created_by: profile.id, category_id,
      start_date: r.start_date, end_date: r.end_date, timezone: 'Australia/Sydney',
      event_type: 'in_person', venue_name: r.venue.name, venue_address: r.venue.address,
      venue_city: r.city, venue_state: r.venue.state, venue_country: 'Australia',
      cover_image_url: null, thumbnail_url: null,
      status: 'published', visibility: 'public', published_at: '2026-06-06T00:00:00Z',
      is_age_restricted: false, max_capacity: r.tiers.reduce((a, t) => a + t.total_capacity, 0),
      tags: ['catalogue', r.category.slug], fee_pass_type: 'pass_to_buyer', is_free: r.is_free,
    })
    if (evErr) { console.error(`[seed:db] event ${r.slug}: ${evErr.message}`); continue }
    const tierRows = r.tiers.map((t, ti) => ({
      id: t.id, event_id: r.id, name: t.name, description: `${t.name} ticket`,
      tier_type: 'general_admission', price: t.price, currency: 'AUD',
      total_capacity: t.total_capacity, sold_count: t.sold_count, reserved_count: 0,
      min_per_order: 1, max_per_order: 10, sort_order: ti, is_visible: true, is_active: true,
      dynamic_pricing_enabled: false, requires_access_code: false,
    }))
    const { error: tErr } = await s.from('ticket_tiers').insert(tierRows)
    if (tErr) { console.error(`[seed:db] tiers ${r.slug}: ${tErr.message}`); continue }
    inserted++
  }
  console.log(`[seed:db] done. inserted ${inserted}, skipped ${skipped} (already present).`)
}

// ── main ───────────────────────────────────────────────────────────────────
const env = loadEnv()
if (FIXTURE) {
  writeFixture(buildRows())
} else {
  await seedDb(env)
}
