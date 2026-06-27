/**
 * National Australian catalogue seeder (TEST only).
 *
 * Seeds a curated, credible, NATIONAL catalogue: every one of the 20 AU cities a
 * believable local marketplace (real venues, specific titles, sensible dates and
 * prices, genuine SEO), realistically weighted, every Sound genre and every
 * community covered (First Nations first), no token city, no filler clones.
 *
 * SAFETY (hard): writes ONLY to the TEST project vkapkibzokmfaxqogypq. Echoes the
 * target ref and ABORTS if it is not TEST (never PRODUCTION gndnldyfudbytbboxesk).
 * Every row is marked is_seed_data = true so real organiser events can be filtered
 * instantly and a seed event is never mistaken for a real purchasable one.
 * Idempotent: deterministic IDs from the slug, skip-if-exists.
 *
 * Run:  node scripts/seed-national-catalogue.mjs        (loads .env.test)
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const PROD_REF = 'gndnldyfudbytbboxesk'

function loadEnv() {
  const e = {}
  for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return e
}
const env = loadEnv()
const URL = process.env.STAGING_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
// ── GUARDRAIL ───────────────────────────────────────────────────────────────
console.log(`[seed] target host: ${(URL || '').match(/\/\/([a-z0-9]+)/)?.[1] || '???'}`)
if (!URL || !KEY) { console.error('[seed] ABORT: missing url/key'); process.exit(1) }
if (URL.includes(PROD_REF)) { console.error(`[seed] ABORT: target is PRODUCTION (${PROD_REF}). Refusing.`); process.exit(1) }
if (!URL.includes(TEST_REF)) { console.error(`[seed] ABORT: target is not the TEST project (${TEST_REF}).`); process.exit(1) }
console.log(`[seed] GUARDRAIL OK: target = TEST (${TEST_REF})`)

const s = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const COVERS = JSON.parse(readFileSync('supabase/seed/seed-cover-pool.json', 'utf8'))

// Deterministic UUID v4-shaped id from a string (stable across runs).
function uuidFrom(str) {
  const h = createHash('md5').update(str).digest('hex')
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`
}
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
}
function pick(arr, i) { return arr[i % arr.length] }

// Infer a venue's type from its name so events land at credible venues
// (a street-food market does not belong in a heritage theatre).
function venueType(name) {
  if (/\b(Park|Beach|Gardens|Lawns|Market|Markets|Esplanade|Pier|Foreshore|Botanic|Amphitheatre|Showgrounds|Oval|Mall|Quarter|Strand)\b/i.test(name)) return 'outdoor'
  if (/\b(Arena|Entertainment Centre|Stadium|Convention|Silverdome)\b/i.test(name)) return 'arena'
  if (/\b(Gallery|Museum|MAGNT|QVMAG|PICA|Powerhouse|Arts Centre|MONA|Tanks|Library)\b/i.test(name)) return 'gallery'
  if (/\b(Theatre|Hall|Majesty|Royal|QPAC|GPAC|IPAC|Empire|Princess|Odeon|Ulumbarra|Capital|Civic|Centre|Recital|Playhouse|Peacock)\b/i.test(name)) return 'theatre'
  return 'club' // bars, music halls, social clubs, live rooms
}
// acceptable venue types per category (first match preferred; falls back to any)
const CAT_VENUE_TYPES = {
  music: ['club', 'theatre', 'arena', 'outdoor'],
  nightlife: ['club', 'outdoor'],
  comedy: ['club', 'theatre'],
  'food-drink': ['outdoor', 'club'],
  festival: ['outdoor', 'arena'],
  family: ['outdoor', 'gallery'],
  sports: ['arena', 'outdoor'],
  'arts-culture': ['theatre', 'gallery'],
  community: ['outdoor', 'club', 'theatre'],
}
function pickVenue(city, cat, idx) {
  const ok = CAT_VENUE_TYPES[cat] || ['club', 'theatre', 'outdoor']
  const matches = city.venues.filter(v => ok.includes(venueType(v)))
  return matches.length ? pick(matches, idx) : pick(city.venues, idx)
}

// ── 20 cities: target count + REAL local venues (from src/lib/cities/data.ts editorials) ──
const CITIES = [
  { name: 'Melbourne', state: 'VIC', tz: 'Australia/Melbourne', target: 26, venues: ['The Forum','170 Russell','Sidney Myer Music Bowl','Hamer Hall','The Comedy Theatre','Northcote Town Hall','The Croxton','Howler','The Espy','Prince Bandroom','Max Watts','Brunswick Ballroom'] },
  { name: 'Sydney', state: 'NSW', tz: 'Australia/Sydney', target: 26, venues: ['Enmore Theatre','Metro Theatre','Oxford Art Factory','Hordern Pavilion','Carriageworks','Factory Theatre','The Vanguard','Manning Bar','City Recital Hall','Crowbar','Liberty Hall','Riverside Theatres'] },
  { name: 'Brisbane', state: 'QLD', tz: 'Australia/Brisbane', target: 18, venues: ['Fortitude Music Hall','The Tivoli','The Triffid','The Zoo','Riverstage','Brisbane Powerhouse','The Brightside','Princess Theatre','The Outpost','Black Bear Lodge'] },
  { name: 'Perth', state: 'WA', tz: 'Australia/Perth', target: 15, venues: ['His Majesty’s Theatre','Astor Theatre','Mojos Bar','The Rosemount','Freo Social','The Bird','Magnet House','Fremantle Arts Centre','Rechabite Hall','Scarborough Beach'] },
  { name: 'Adelaide', state: 'SA', tz: 'Australia/Adelaide', target: 15, venues: ['The Gov','Thebarton Theatre','Her Majesty’s Theatre','Lion Arts Factory','The Lab','Adelaide Botanic Park','Hindley Street Music Hall','Jive','Adelaide Town Hall'] },
  { name: 'Gold Coast', state: 'QLD', tz: 'Australia/Brisbane', target: 13, venues: ['HOTA','The Star Gold Coast','Miami Marketta','Vinnies Dive','Kurrawa Park','Broadbeach Mall','Mo’s Desert Clubhouse','Elsewhere'] },
  { name: 'Canberra', state: 'ACT', tz: 'Australia/Sydney', target: 11, venues: ['Canberra Theatre Centre','UC Hub','Smith’s Alternative','The Polish Club','Belconnen Arts Centre','Commonwealth Park','sideway','GIO Stadium'] },
  { name: 'Hobart', state: 'TAS', tz: 'Australia/Hobart', target: 11, venues: ['Republic Bar','Theatre Royal','Odeon Theatre','Peacock Theatre','Brisbane Hotel','Salamanca Lawns','MyState Bank Arena','Altar'] },
  { name: 'Newcastle', state: 'NSW', tz: 'Australia/Sydney', target: 9, venues: ['Newcastle Entertainment Centre','Lass O’Gowrie','The Cambridge Hotel','Civic Theatre','Newcastle Art Gallery','King Street Hotel','The Foreshore'] },
  { name: 'Wollongong', state: 'NSW', tz: 'Australia/Sydney', target: 9, venues: ['WIN Entertainment Centre','UOW UniBar','IPAC','La La La’s','Wollongong Art Gallery','North Beach','Yours and Owls'] },
  { name: 'Geelong', state: 'VIC', tz: 'Australia/Melbourne', target: 9, venues: ['GMHBA Stadium','Costa Hall','The Barwon Club','The Wool Exchange','GPAC','Sphinx Hotel','Cunningham Pier'] },
  { name: 'Sunshine Coast', state: 'QLD', tz: 'Australia/Brisbane', target: 9, venues: ['Solbar','The Events Centre Caloundra','Eumundi Markets','NightQuarter','Caloundra Regional Gallery','Cotton Tree Park','Mooloolaba Esplanade'] },
  { name: 'Cairns', state: 'QLD', tz: 'Australia/Brisbane', target: 7, venues: ['Cairns Convention Centre','Salt House','The Pier Bar','JUTE Theatre','Tanks Arts Centre','Munro Martin Parklands','Cairns Esplanade'] },
  { name: 'Townsville', state: 'QLD', tz: 'Australia/Brisbane', target: 7, venues: ['Townsville Entertainment Centre','Civic Theatre','The Brewery','Riverway Arts Centre','Pinnacles Gallery','The Strand'] },
  { name: 'Darwin', state: 'NT', tz: 'Australia/Darwin', target: 7, venues: ['Darwin Amphitheatre','Lola’s Pergola','Brown’s Mart','Happy Yess','MAGNT','Mindil Beach','George Brown Botanic Gardens'] },
  { name: 'Toowoomba', state: 'QLD', tz: 'Australia/Brisbane', target: 7, venues: ['Empire Theatre','The Spotted Cow','The Royal Hotel','Queens Park','Picnic Point','Toowoomba Regional Art Gallery'] },
  { name: 'Ballarat', state: 'VIC', tz: 'Australia/Melbourne', target: 7, venues: ['Her Majesty’s Ballarat','The Eastern','Karova Lounge','Civic Hall','Art Gallery of Ballarat','The Mining Exchange'] },
  { name: 'Bendigo', state: 'VIC', tz: 'Australia/Melbourne', target: 7, venues: ['Ulumbarra Theatre','Capital Theatre','The Old Church on the Hill','The Golden Vine','Bendigo Art Gallery','Lake Weeroona'] },
  { name: 'Launceston', state: 'TAS', tz: 'Australia/Hobart', target: 7, venues: ['Princess Theatre','Royal Oak','Royal on George','Silverdome','QVMAG','City Park'] },
  { name: 'Albury', state: 'NSW', tz: 'Australia/Sydney', target: 7, venues: ['Albury Entertainment Centre','SS&A Club','Commercial Club','The Atura','Noreuil Park','Albury Library Museum'] },
]

// ── 12 Sounds genres: genre_slug + search/discovery tokens + linked community (if any) ──
// slug = our Sounds-rail token (drives /events?q=... discovery via tags/title);
// gdb  = the valid events.genre_slug FK value in the live `genres` table.
const GENRES = [
  { slug: 'electronic-dance', gdb: 'electronic-and-dance', label: 'Electronic', tokens: ['electronic','edm','house','techno','dance'], weight: 5, community: null },
  { slug: 'hip-hop-rnb', gdb: 'hip-hop-and-rap', label: 'Hip-Hop and RnB', tokens: ['hip-hop','rnb','rap'], weight: 5, community: null },
  { slug: 'indie-rock', gdb: 'rock-and-alternative', label: 'Indie and Rock', tokens: ['indie','indie-rock','rock'], weight: 5, community: null },
  { slug: 'pop', gdb: 'pop-and-top-40', label: 'Pop', tokens: ['pop'], weight: 4, community: null },
  { slug: 'afrobeats-amapiano', gdb: 'african', label: 'Afrobeats and Amapiano', tokens: ['afrobeats','amapiano','afropop'], weight: 4, community: 'african' },
  { slug: 'latin', gdb: 'latin-and-reggaeton', label: 'Latin', tokens: ['latin','salsa','reggaeton'], weight: 3, community: 'latin-american' },
  { slug: 'caribbean-dancehall', gdb: 'reggae-and-caribbean', label: 'Caribbean and Dancehall', tokens: ['caribbean','dancehall','soca','reggae'], weight: 3, community: 'caribbean' },
  { slug: 'jazz-soul', gdb: 'jazz-and-blues', label: 'Jazz and Soul', tokens: ['jazz','soul'], weight: 3, community: null },
  { slug: 'country', gdb: 'country-and-folk', label: 'Country', tokens: ['country'], weight: 3, community: null },
  { slug: 'folk-acoustic', gdb: 'country-and-folk', label: 'Folk and Acoustic', tokens: ['folk','acoustic'], weight: 3, community: null },
  { slug: 'blues-roots', gdb: 'jazz-and-blues', label: 'Blues and Roots', tokens: ['blues','roots'], weight: 3, community: null },
  { slug: 'metal-hardcore', gdb: 'metal-and-metalcore', label: 'Metal and Hardcore', tokens: ['metal','hardcore'], weight: 2, community: null },
]
const GENRE_BAG = GENRES.flatMap(g => Array(g.weight).fill(g))

// ── 21 communities (First Nations first): canonical token + identifying tokens + event archetype ──
const COMMUNITIES = [
  { slug: 'aboriginal-torres-strait-islander', label: 'First Nations', token: 'first-nations', tokens: ['first-nations','indigenous','naidoc','blak'], events: ['NAIDOC Week Family Day','First Nations Art and Makers Market','Blak Music and Dance Night','Songlines: First Nations Storytelling'] },
  { slug: 'african', label: 'African', token: 'african', tokens: ['african','afrobeats','owambe','amapiano'], events: ['Owambe Night: Lagos to the Coast','Afrobeats and Amapiano Day Party','African Food and Music Festival'] },
  { slug: 'caribbean', label: 'Caribbean', token: 'caribbean', tokens: ['caribbean','soca','dancehall','reggae'], events: ['Caribbean Carnival and Soca Night','Reggae and Dancehall Sundays'] },
  { slug: 'indian', label: 'Indian', token: 'indian', tokens: ['indian','bollywood','bhangra','diwali'], events: ['Bollywood Nights: Dhol and Dance','Diwali Mela and Street Food','Bhangra and Garba Celebration'] },
  { slug: 'chinese', label: 'Chinese', token: 'chinese', tokens: ['chinese','lunar-new-year','lion-dance'], events: ['Lunar New Year Lantern Festival','Mid-Autumn Moon Festival'] },
  { slug: 'filipino', label: 'Filipino', token: 'filipino', tokens: ['filipino','opm','fiesta'], events: ['Filipino Fiesta and OPM Night','Sinulog Community Festival'] },
  { slug: 'latin-american', label: 'Latin American', token: 'latin', tokens: ['latin','salsa','reggaeton','cumbia'], events: ['Salsa and Bachata Social','Latin Street Food and Music Fiesta'] },
  { slug: 'vietnamese', label: 'Vietnamese', token: 'vietnamese', tokens: ['vietnamese','tet'], events: ['Tet Lunar New Year Festival','Vietnamese Street Food Night Market'] },
  { slug: 'lebanese-levantine', label: 'Lebanese and Levantine', token: 'lebanese', tokens: ['lebanese','dabke','mahrajan'], events: ['Lebanese Mahrajan and Dabke Night','Levantine Long-Table Feast'] },
  { slug: 'greek', label: 'Greek', token: 'greek', tokens: ['greek','glendi','panigiri'], events: ['Greek Glendi and Bouzouki Night','Panigiri Food and Dance Festival'] },
  { slug: 'italian', label: 'Italian', token: 'italian', tokens: ['italian','festa','sagra'], events: ['Italian Festa and Long Lunch','Sagra: Italian Street Food Festival'] },
  { slug: 'korean', label: 'Korean', token: 'korean', tokens: ['korean','k-pop','chuseok'], events: ['K-Pop Night and Dance Showcase','Chuseok Community Festival'] },
  { slug: 'japanese', label: 'Japanese', token: 'japanese', tokens: ['japanese','matsuri','taiko'], events: ['Matsuri: Japanese Summer Festival','Taiko Drumming and Anime Night'] },
  { slug: 'pacific-pasifika', label: 'Pasifika', token: 'pasifika', tokens: ['pasifika','samoan','tongan','islander'], events: ['Pasifika Festival: Island Beats','Samoan and Tongan Community Day'] },
  { slug: 'maori', label: 'Maori', token: 'maori', tokens: ['maori','kapa-haka','matariki'], events: ['Matariki Celebration and Kapa Haka','Maori Community Hangi and Waiata'] },
  { slug: 'persian-iranian', label: 'Persian', token: 'persian', tokens: ['persian','nowruz','yalda'], events: ['Nowruz Persian New Year Festival','Yalda Night: Poetry and Music'] },
  { slug: 'turkish', label: 'Turkish', token: 'turkish', tokens: ['turkish','anatolian','saz'], events: ['Turkish Food and Saz Night','Anatolian Folk and Dance Evening'] },
  { slug: 'arab', label: 'Arab', token: 'arab', tokens: ['arab','arabic','oud','tarab'], events: ['Arabic Oud and Tarab Evening','Arab Street Food and Music Night'] },
  { slug: 'other-south-asian', label: 'South Asian', token: 'nepali', tokens: ['nepali','sri-lankan','qawwali'], events: ['Qawwali and Sufi Music Night','Sri Lankan and Nepali Food Festival'] },
  { slug: 'other-east-southeast-asian', label: 'East and Southeast Asian', token: 'thai', tokens: ['thai','indonesian','songkran'], events: ['Songkran Water Festival','Indonesian and Thai Night Market'] },
  { slug: 'other-european', label: 'European', token: 'european', tokens: ['european','polish','oktoberfest'], events: ['Oktoberfest Bier and Brass','Polish and Eastern European Festival'] },
]

// community "home" cities (where each genuinely concentrates) - rest fall to majors
const HOME = {
  'aboriginal-torres-strait-islander': ['Darwin','Cairns','Brisbane','Sydney','Melbourne'],
  african: ['Melbourne','Sydney','Perth','Brisbane'],
  caribbean: ['Sydney','Melbourne','Gold Coast'],
  indian: ['Sydney','Melbourne','Perth','Adelaide','Canberra'],
  chinese: ['Sydney','Melbourne','Brisbane','Bendigo'],
  filipino: ['Sydney','Melbourne','Perth','Darwin','Townsville'],
  'latin-american': ['Melbourne','Sydney','Brisbane'],
  vietnamese: ['Melbourne','Sydney','Brisbane'],
  'lebanese-levantine': ['Sydney','Melbourne','Adelaide'],
  greek: ['Melbourne','Adelaide','Sydney','Darwin'],
  italian: ['Melbourne','Adelaide','Perth','Griffith'],
  korean: ['Sydney','Melbourne','Perth'],
  japanese: ['Sydney','Melbourne','Cairns'],
  'pacific-pasifika': ['Brisbane','Sydney','Gold Coast','Melbourne'],
  maori: ['Gold Coast','Brisbane','Melbourne'],
  'persian-iranian': ['Sydney','Melbourne','Perth'],
  turkish: ['Melbourne','Sydney','Adelaide'],
  arab: ['Sydney','Melbourne','Adelaide'],
  'other-south-asian': ['Sydney','Melbourne','Perth'],
  'other-east-southeast-asian': ['Sydney','Melbourne','Cairns','Darwin'],
  'other-european': ['Melbourne','Adelaide','Hobart','Ballarat'],
}

// ── category recipe (DB slugs) + price bands (cents) + tier shape ──
const CAT = {
  music:        { slug: 'music',        free: 0.0, base: [3900, 7500], premium: 0.5 },
  nightlife:    { slug: 'nightlife',    free: 0.0, base: [2900, 4900], premium: 0.0 },
  community:    { slug: 'community',    free: 0.5, base: [1500, 3500], premium: 0.0 },
  'food-drink': { slug: 'food-drink',   free: 0.35, base: [3200, 6900], premium: 0.0 },
  comedy:       { slug: 'comedy',       free: 0.0, base: [2500, 3900], premium: 0.2 },
  'arts-culture': { slug: 'arts-culture', free: 0.1, base: [3500, 9900], premium: 0.4 },
  festival:     { slug: 'festival',     free: 0.25, base: [5900, 12500], premium: 0.5 },
  family:       { slug: 'family',       free: 0.5, base: [1500, 2500], premium: 0.0 },
  sports:       { slug: 'sports',       free: 0.0, base: [2900, 8500], premium: 0.4 },
}
// per-city category sequence (weighted to realistic AU demand), cycled
const CAT_SEQ = ['music','nightlife','community','food-drink','comedy','music','arts-culture','festival','music','family','nightlife','sports','music','community','food-drink','arts-culture','comedy','music','nightlife','community','food-drink','music','arts-culture','family','sports','community']

// title/description archetypes per non-music category (varied; venue+city woven in)
const ARCH = {
  comedy: [ ['Comedy Lineup Live at {v}','A stacked bill of touring and local stand-ups takes the stage at {v} in {c}. Expect sharp new hours, surprise drop-ins and a late show that runs loose.'], ['Stand-Up Saturday at {v}','{c}’s best stand-ups and a touring headliner share one room at {v}. A fast, packed night of new material and old favourites.'] ],
  'food-drink': [ ['{c} Night Noodle and Street Food Market','Dozens of hawker-style vendors bring street food, dumplings and late-night eats to {v}. Live music between stalls and a licensed bar all evening.'], ['Harvest Long Lunch at {v}','A shared seasonal menu from a guest chef with matched local wines at {v} in {c}. One long table, one unforgettable afternoon.'], ['{c} Wine, Cheese and Producers Fair','A walk-around tasting of regional wineries and cheesemakers at {v}, with growers and sommeliers pouring all afternoon.'] ],
  'arts-culture': [ ['{title} on Stage at {v}','A bold new staging in a strictly limited season at {v} in {c}. Contemporary direction, a standout cast and a night made for the theatre.'], ['Contemporary Art After Hours at {v}','Galleries open late at {v} with artist talks, live performance and a bar. {c}’s creative community out in force.'], ['{c} Dance: A Double Bill at {v}','Two new contemporary dance works from a national touring company at {v}. Movement, light and live score.'] ],
  family: [ ['{c} Family Fun Day at {v}','A free-spirited day of rides, craft tables, a petting zoo and a small stage program at {v}. Built for kids and the grown-ups with them.'], ['Science and Discovery Day at {v}','Hands-on experiments, live demonstrations and a planetarium dome at {v} in {c}. A big day out for curious young minds.'] ],
  sports: [ ['{c} Basketball Showcase at {v}','A double-header of national league basketball with a half-time community shoot-out at {v}. Courtside and general admission.'], ['Fight Night: {c} at {v}','A full card of amateur and pro boxing and MMA bouts at {v}. Table seating and general admission, doors from early evening.'] ],
  festival: [ ['{c} Arts and Music Festival at {v}','Multiple stages, makers markets and street performers fill {v} and the surrounding precinct for one big {c} day.'], ['Twilight Sessions Festival at {v}','A rolling line-up of bands plays {v} from late afternoon into the night, food trucks and a bar on site.'] ],
}
const MUSIC_TITLES = {
  'electronic-dance': ['Warehouse: Electronic Live at {v}','Sundown Electronic Sessions at {v}'],
  'hip-hop-rnb': ['Hip-Hop and RnB Night at {v}','The Cypher: Live Hip-Hop at {v}'],
  'indie-rock': ['Indie Sounds Live at {v}','New Rock Friday at {v}'],
  pop: ['Pop Live at {v}','Big Pop Night at {v}'],
  'afrobeats-amapiano': ['Afrobeats and Amapiano Live at {v}','Afropop Party at {v}'],
  latin: ['Latin Live: Salsa and Reggaeton at {v}','Sabor Latino at {v}'],
  'caribbean-dancehall': ['Caribbean and Dancehall Night at {v}','Reggae Roots Live at {v}'],
  'jazz-soul': ['Late Night Jazz and Soul at {v}','The Quartet: Jazz at {v}'],
  country: ['Country and Roots Night at {v}','Boots and Banjos at {v}'],
  'folk-acoustic': ['Folk and Acoustic Evening at {v}','Songwriters in the Round at {v}'],
  'blues-roots': ['Blues and Roots Live at {v}','Riverside Blues at {v}'],
  'metal-hardcore': ['Metal and Hardcore Live at {v}','Loud: Heavy Night at {v}'],
}
const NIGHT_TITLES = {
  'electronic-dance': ['Warehouse Late: House and Techno at {v}','After Dark: Electronic at {v}'],
  'hip-hop-rnb': ['RnB and Hip-Hop Club Night at {v}','Throwback RnB at {v}'],
  'afrobeats-amapiano': ['Amapiano Day Party at {v}','Afro House Nights at {v}'],
  latin: ['Latin Club Night at {v}','Reggaeton Fridays at {v}'],
  'caribbean-dancehall': ['Dancehall and Soca Party at {v}','Island Vibes Night at {v}'],
  default: ['Rooftop Sundowner Sessions at {v}','Disco and Funk All-Nighter at {v}','Vinyl Only Listening Night at {v}'],
}

// ── 10 believable seed organiser names (all flagged is_seed_data via their events; deterministic 5eed-prefixed ids) ──
const SEED_ORGS = ['EventLinqs Sample Catalogue','Harbourline Live','Sunset Sounds Co','Open Air Australia','Stage Door Presents','Plate and Pour','Common Ground Community','Northside Comedy Collective','First Light Festivals','Courtside Sports AU']

function priceTiers(cat, idx) {
  const c = CAT[cat]
  if (Math.abs(Math.sin(idx * 12.9898)) < c.free) return [{ name: 'Free Entry', price: 0, cap: 400 }]
  const lo = c.base[0], hi = c.base[1]
  const ga = Math.round((lo + (hi - lo) * ((idx * 37) % 100) / 100) / 100) * 100
  const tiers = [{ name: 'General Admission', price: ga, cap: 300 }]
  if (Math.abs(Math.cos(idx * 7.13)) < c.premium) tiers.push({ name: 'Premium', price: ga + 4000 + ((idx * 13) % 6) * 1000, cap: 80 })
  return tiers
}
// date spread: Jul 2026 -> mid Jan 2027, weighted near-term, weekend bias for music/nightlife
function eventDate(globalIdx, weekend) {
  const base = new Date('2026-07-03T00:00:00+10:00').getTime()
  const span = 196 // days
  const t = Math.pow(((globalIdx * 0.6180339887) % 1), 1.5) // near-term weighted
  let day = Math.floor(t * span)
  const d = new Date(base + day * 86400000)
  if (weekend) { const wd = d.getUTCDay(); const add = wd <= 5 ? (5 - wd) : 0; d.setUTCDate(d.getUTCDate() + add) }
  d.setUTCHours(weekend ? 20 : 19, 0, 0, 0)
  const end = new Date(d.getTime() + 3 * 3600000)
  return { start: d.toISOString(), end: end.toISOString() }
}

async function main() {
  // resolve creator profile + categories + ensure seed orgs exist
  const { data: profile } = await s.from('profiles').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!profile) { console.error('[seed] ABORT: need at least one profile'); process.exit(1) }
  const { data: cats } = await s.from('event_categories').select('id,slug')
  const catId = Object.fromEntries((cats ?? []).map(c => [c.slug, c.id]))
  const missing = [...new Set(Object.values(CAT).map(c => c.slug))].filter(sl => !catId[sl])
  if (missing.length) console.warn('[seed] WARN categories missing on TEST:', missing.join(', '))

  // ensure seed organisations (deterministic 5eed-prefixed ids)
  const orgIds = {}
  for (let i = 0; i < SEED_ORGS.length; i++) {
    const name = SEED_ORGS[i]
    const id = '5eed' + uuidFrom('org:' + name).slice(4)
    orgIds[name] = id
    const { data: ex } = await s.from('organisations').select('id').eq('id', id).maybeSingle()
    if (!ex) {
      const { error } = await s.from('organisations').insert({ id, name, slug: slugify(name) + '-sample', owner_id: profile.id, description: `${name} (EventLinqs sample catalogue organiser).` })
      if (error && !String(error.message).includes('duplicate')) console.warn(`[seed] org ${name}: ${error.message}`)
    }
  }
  const orgFor = (i) => orgIds[SEED_ORGS[i % SEED_ORGS.length]]

  // existing published per city (top-up to target)
  const { data: existing } = await s.from('events').select('venue_city').eq('status', 'published').eq('visibility', 'public')
  const existCount = {}
  for (const e of existing ?? []) existCount[e.venue_city] = (existCount[e.venue_city] || 0) + 1

  // BACKFILL: every event currently on TEST is sample catalogue (no real organisers yet)
  const { error: bfErr, count: bfCount } = await s.from('events').update({ is_seed_data: true }, { count: 'exact' }).eq('is_seed_data', false)
  console.log(`[seed] backfilled is_seed_data=true on ${bfCount ?? '?'} existing rows${bfErr ? ' (err: ' + bfErr.message + ')' : ''}`)

  const rows = []
  const genreCount = Object.fromEntries(GENRES.map(g => [g.slug, 0]))
  const commCount = Object.fromEntries(COMMUNITIES.map(c => [c.slug, 0]))
  let gi = 0 // global index
  let genrePtr = 0, commPtr = 0

  function buildEvent(city, cat, idx) {
    const venue = pickVenue(city, cat, idx)
    let title, desc, genre = null, community = null, tags = ['catalogue']
    const weekend = cat === 'music' || cat === 'nightlife'
    if (cat === 'music' || cat === 'nightlife') {
      genre = GENRE_BAG[genrePtr++ % GENRE_BAG.length]
      const tset = cat === 'music' ? MUSIC_TITLES : NIGHT_TITLES
      const tmpl = (tset[genre.slug] || tset.default || MUSIC_TITLES[genre.slug])
      title = pick(tmpl, idx).replace('{v}', venue)
      desc = `${genre.label} live in ${city.name} at ${venue}. A full ${cat === 'nightlife' ? 'club night' : 'live set'} with a local opener and a room built for it. Doors from ${weekend ? '8pm' : '7pm'}.`
      // include the genre's Sounds-rail slug so the homepage /events?q=<slug>
      // tiles resolve for the compound slugs (jazz-soul, folk-acoustic, blues-roots).
      tags = tags.concat(genre.tokens, [genre.slug])
      if (genre.community) { tags.push(COMMUNITIES.find(c => c.slug === genre.community).token); commCount[genre.community]++ }
    } else if (cat === 'community') {
      // pick an under-covered community whose home includes this city, else any under-covered
      let order = COMMUNITIES.slice().sort((a, b) => commCount[a.slug] - commCount[b.slug])
      community = order.find(c => (HOME[c.slug] || []).includes(city.name)) || order[commPtr++ % order.length]
      const evName = pick(community.events, idx)
      title = `${evName}, ${city.name}`
      desc = `${community.label} community in ${city.name} comes together at ${venue}. ${evName} brings food, music and family across the night. All welcome.`
      tags = tags.concat(community.tokens, ['community'])
      commCount[community.slug]++
    } else {
      const a = pick(ARCH[cat], idx)
      const themed = cat === 'arts-culture' ? ['A Midsummer Night’s Dream','The Glass Menagerie','A Doll’s House','Così'][idx % 4] : ''
      title = a[0].replace('{title}', themed).replace('{v}', venue).replace('{c}', city.name)
      desc = a[1].replace('{v}', venue).replace('{c}', city.name)
      tags.push(cat)
    }
    const tiers = priceTiers(cat, gi)
    const is_free = tiers.every(t => t.price === 0)
    const { start, end } = eventDate(gi, weekend)
    const slug = slugify(title) + '-' + slugify(city.name)
    const id = uuidFrom('evt:' + slug)
    const coverPool = genre ? (COVERS.genre[genre.slug] || COVERS.category[cat]) : (COVERS.category[CAT[cat].slug] || COVERS.category.music)
    const cover = pick(coverPool, gi)
    gi++
    if (genre) genreCount[genre.slug]++
    return {
      id, title, slug, summary: desc.split('. ')[0] + '.', description: desc,
      category_slug: CAT[cat].slug, genre_slug: genre ? genre.gdb : null,
      organisation_id: orgFor(rows.length), created_by: profile.id,
      start, end, tz: city.tz, venue, city: city.name, state: city.state,
      cover, tags: [...new Set(tags)], is_free, tiers,
    }
  }

  for (const city of CITIES) {
    const need = Math.max(0, city.target - (existCount[city.name] || 0))
    for (let k = 0; k < need; k++) rows.push(buildEvent(city, pick(CAT_SEQ, k), k))
  }
  // coverage pass: every genre >=4, every community >=3
  const majorCity = (n) => CITIES.find(c => c.name === n) || CITIES[0]
  for (const g of GENRES) {
    while (genreCount[g.slug] < 4) { genrePtr = GENRE_BAG.indexOf(g); rows.push(buildEvent(majorCity(['Melbourne','Sydney','Brisbane','Perth'][genreCount[g.slug] % 4]), 'music', 90 + genreCount[g.slug])) }
  }
  for (const c of COMMUNITIES) {
    while (commCount[c.slug] < 3) {
      const home = (HOME[c.slug] || ['Sydney']).find(n => CITIES.some(x => x.name === n)) || 'Sydney'
      // force this community by temporarily zeroing others is complex; build directly
      const city = majorCity(home); const venue = pickVenue(city, 'community', commCount[c.slug] + 3)
      const evName = pick(c.events, commCount[c.slug]); const title = `${evName}, ${city.name}`
      const tiers = priceTiers('community', gi); const { start, end } = eventDate(gi, false)
      const slug = slugify(title) + '-' + slugify(city.name); const id = uuidFrom('evt:' + slug)
      rows.push({ id, title, slug, summary: evName + '.', description: `${c.label} community in ${city.name} comes together at ${venue}. ${evName} brings food, music and family across the night. All welcome.`, category_slug: 'community', genre_slug: null, organisation_id: orgFor(rows.length), created_by: profile.id, start, end, tz: city.tz, venue, city: city.name, state: city.state, cover: pick(COVERS.category.community, gi), tags: [...new Set(['catalogue','community', ...c.tokens])], is_free: tiers.every(t => t.price === 0), tiers })
      gi++; commCount[c.slug]++
    }
  }

  // dedup slugs
  const seen = new Set()
  for (const r of rows) { let sl = r.slug, n = 2; while (seen.has(sl)) sl = `${r.slug}-${n++}`; r.slug = sl; r.id = uuidFrom('evt:' + sl); seen.add(sl) }

  // insert (idempotent)
  let inserted = 0, skipped = 0, failed = 0
  for (const r of rows) {
    const { data: ex } = await s.from('events').select('id').eq('id', r.id).maybeSingle()
    if (ex) { skipped++; continue }
    const { error: evErr } = await s.from('events').insert({
      id: r.id, title: r.title, slug: r.slug, summary: r.summary, description: r.description,
      organisation_id: r.organisation_id, created_by: r.created_by, category_id: catId[r.category_slug] ?? catId['arts-culture'] ?? catId['other'] ?? null,
      genre_slug: r.genre_slug, start_date: r.start, end_date: r.end, timezone: r.tz, event_type: 'in_person',
      venue_name: r.venue, venue_city: r.city, venue_state: r.state, venue_country: 'Australia',
      cover_image_url: r.cover, thumbnail_url: r.cover,
      status: 'published', visibility: 'public', published_at: '2026-06-20T00:00:00Z',
      is_age_restricted: false, max_capacity: r.tiers.reduce((a, t) => a + t.cap, 0),
      tags: r.tags, fee_pass_type: 'pass_to_buyer', is_free: r.is_free, is_seed_data: true,
    })
    if (evErr) { failed++; if (failed <= 5) console.error(`[seed] event ${r.slug}: ${evErr.message}`); continue }
    const tierRows = r.tiers.map((t, ti) => ({ id: uuidFrom('tier:' + r.slug + ':' + ti), event_id: r.id, name: t.name, description: `${t.name} ticket`, tier_type: 'general_admission', price: t.price, currency: 'AUD', total_capacity: t.cap, sold_count: Math.floor(t.cap * 0.15), reserved_count: 0, min_per_order: 1, max_per_order: 10, sort_order: ti, is_visible: true, is_active: true, dynamic_pricing_enabled: false, requires_access_code: false }))
    const { error: tErr } = await s.from('ticket_tiers').insert(tierRows)
    if (tErr) { failed++; if (failed <= 5) console.error(`[seed] tiers ${r.slug}: ${tErr.message}`); continue }
    inserted++
  }
  console.log(`[seed] generated ${rows.length} | inserted ${inserted} | skipped ${skipped} | failed ${failed}`)
  console.log('[seed] genre coverage:', JSON.stringify(genreCount))
  console.log('[seed] community coverage:', JSON.stringify(commCount))
}
main().catch(e => { console.error('[seed] FATAL', e); process.exit(1) })
