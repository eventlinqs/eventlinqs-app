/**
 * SEARCH REACH, proven against real data (TEST only, guarded).
 *
 * THE DEFECT. Search was `ilike('title', '%q%')` and nothing else. The twelve
 * homepage Sounds tiles link to `/events?q=`, and NINE of them send a
 * multi-word query ("afrobeats amapiano", "hip hop rnb", "folk acoustic"). No
 * event title contains those literal strings, so nine of the twelve tiles on
 * the homepage were dead ends. The events existed the whole time, tagged
 * `afrobeats-amapiano`, `hip-hop-rnb`, `folk-acoustic`.
 *
 * WHY THIS HARNESS AND NOT A UNIT TEST. A unit test can assert the predicate
 * mentions more columns. It cannot tell you whether a real tile reaches real
 * events, which is the only thing that matters, and it cannot distinguish a
 * tile that is broken from a genre the catalogue simply does not stock. Those
 * two look identical on screen and have completely different fixes.
 *
 * Usage: node scripts/verify/search-reach-e2e.mjs [baseUrl]
 * SAFETY: refuses to run unless the Supabase project is the TEST one.
 */
import fs from 'node:fs'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const SB = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (SB.includes(PROD_REF)) throw new Error('SAFETY STOP: pointed at the PRODUCTION project')
if (!SB.includes(TEST_REF)) throw new Error('SAFETY STOP: not the TEST project')
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }

const q = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

async function browse(queryString) {
  const res = await fetch(`${BASE}/events${queryString}`, { headers: { 'user-agent': 'search-reach-e2e' } })
  const html = await res.text()
  const slugs = [...new Set([...html.matchAll(/href="\/events\/([a-z0-9][a-z0-9-]*)"/g)].map((m) => m[1]))]
  return { status: res.status, slugs, html }
}

const results = []
const gaps = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`)
  console.log(`         ${detail}`)
}

const published = []
for (let from = 0; ; from += 1000) {
  const rows = await q(
    `events?status=eq.published&visibility=eq.public&select=slug,title,summary,description,venue_name,venue_city,tags,start_date&limit=1000&offset=${from}`,
  )
  if (!rows.length) break
  published.push(...rows)
  if (rows.length < 1000) break
}
const bySlug = new Map(published.map((e) => [e.slug, e]))
const upcoming = published.filter((e) => new Date(e.start_date).getTime() >= Date.now())
console.log(`[setup] ${published.length} published on TEST, ${upcoming.length} still upcoming\n`)

/**
 * Does this event legitimately answer that query? The same rule the predicate
 * implements: the whole phrase anywhere in the text columns, or a tag equal to
 * the hyphenated phrase or to any single token.
 */
function matches(event, phrase) {
  const needle = phrase.toLowerCase()
  const text = [event.title, event.summary, event.description, event.venue_name, event.venue_city]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (text.includes(needle)) return true
  const tokens = needle.split(/\s+/).filter(Boolean)
  const tagSet = new Set((event.tags ?? []).map((t) => String(t).toLowerCase()))
  if (tokens.length > 1 && tagSet.has(tokens.join('-'))) return true
  return tokens.some((t) => tagSet.has(t))
}

async function check(label, phrase) {
  const { status, slugs } = await browse(`?q=${encodeURIComponent(phrase)}`)
  if (status !== 200) return record(label, false, `HTTP ${status}`)
  const eligible = upcoming.filter((e) => matches(e, phrase))

  if (slugs.length === 0) {
    if (eligible.length === 0) {
      gaps.push({ label, phrase })
      return record(
        label,
        true,
        `search is correct and the catalogue is empty: 0 upcoming events answer "${phrase}". CONTENT GAP, not a defect`,
      )
    }
    return record(label, false, `returned nothing while ${eligible.length} upcoming events answer "${phrase}"`)
  }
  const bad = slugs.filter((s) => bySlug.get(s) && !matches(bySlug.get(s), phrase))
  if (bad.length) {
    return record(label, false, `${bad.length} of ${slugs.length} results do not answer "${phrase}": ${bad.slice(0, 3).join(', ')}`)
  }
  record(label, true, `${slugs.length} results (${eligible.length} eligible), every one answers "${phrase}"`)
}

// ---------------------------------------------------------------------------
// The twelve homepage Sounds tiles, exactly as sounds-rail.tsx emits them.
// ---------------------------------------------------------------------------
console.log('the 12 homepage Sounds tiles (9 of them multi-word, all 9 were dead)')
const SOUNDS = [
  ['Electronic & Dance', 'electronic dance'],
  ['Country', 'country'],
  ['Indie & Rock', 'indie rock'],
  ['Hip-Hop & RnB', 'hip hop rnb'],
  ['Pop', 'pop'],
  ['Folk & Acoustic', 'folk acoustic'],
  ['Blues & Roots', 'blues roots'],
  ['Afrobeats & Amapiano', 'afrobeats amapiano'],
  ['Latin', 'latin'],
  ['Caribbean & Dancehall', 'caribbean dancehall'],
  ['Jazz & Soul', 'jazz soul'],
  ['Metal & Hardcore', 'metal hardcore'],
]
for (const [label, phrase] of SOUNDS) await check(label, phrase)

// ---------------------------------------------------------------------------
// The columns beyond the title. Each fixture is chosen FROM the data so the
// harness cannot assert against a string nobody ever wrote.
// ---------------------------------------------------------------------------
console.log('\nthe columns a title-only search could never reach')
const venueSample = upcoming.find((e) => e.venue_name && e.venue_name.split(' ').length > 1)
if (venueSample) {
  const term = venueSample.venue_name
  const titleHas = upcoming.some((e) => (e.title ?? '').toLowerCase().includes(term.toLowerCase()))
  await check(`venue name "${term}"${titleHas ? '' : ' (no title contains it)'}`, term)
}
const citySample = upcoming.find((e) => e.venue_city)
if (citySample) await check(`city name "${citySample.venue_city}"`, citySample.venue_city)

// A word that exists ONLY in a description, never in any title: the clearest
// possible demonstration that search left the title column.
const descOnly = (() => {
  const titleWords = new Set(
    upcoming.flatMap((e) => (e.title ?? '').toLowerCase().match(/[a-z]{6,}/g) ?? []),
  )
  for (const e of upcoming) {
    for (const w of (e.description ?? '').toLowerCase().match(/[a-z]{7,}/g) ?? []) {
      if (!titleWords.has(w)) return w
    }
  }
  return null
})()
if (descOnly) await check(`description-only word "${descOnly}"`, descOnly)

// ---------------------------------------------------------------------------
// Filter-grammar safety. Inside a PostgREST or() the characters , . ( ) are
// GRAMMAR. An unescaped term containing them is parsed as more filter clauses,
// so this is a correctness AND an injection question, not a cosmetic one.
// ---------------------------------------------------------------------------
console.log('\nfilter-grammar safety (, . ( ) are syntax inside or())')
for (const [label, phrase] of [
  ['a comma', 'rock, paper'],
  ['a full stop', 'dr. jazz'],
  ['brackets', 'live (acoustic)'],
  ['a quote', 'rock"n"roll'],
  ['a column-shaped injection', 'id.neq.00000000-0000-0000-0000-000000000000'],
]) {
  const { status, slugs } = await browse(`?q=${encodeURIComponent(phrase)}`)
  const bad = slugs.filter((s) => bySlug.get(s) && !matches(bySlug.get(s), phrase))
  record(
    `${label}: ${phrase}`,
    status === 200 && bad.length === 0,
    status !== 200
      ? `HTTP ${status}: the term broke the query`
      : bad.length
        ? `${bad.length} results do not match the term, so it was parsed as filter grammar rather than as data`
        : `HTTP 200, ${slugs.length} result(s), none of them unrelated: the term was treated as data`,
  )
}

// ---------------------------------------------------------------------------
// The three header-search tabs that are not events. They routed to /events and
// /events answered with EVENTS, so searching "Melbourne" under Cities returned
// event titles containing Melbourne and no cities at all.
// ---------------------------------------------------------------------------
console.log('\nthe three header-search tabs that are not events')

/** The scope section only, so footer and header chrome cannot be counted. */
async function scope(queryString) {
  const res = await fetch(`${BASE}/events${queryString}`, { headers: { 'user-agent': 'search-reach-e2e' } })
  const html = await res.text()
  const section = html.match(/<section aria-label="[^"]*matching your search"[\s\S]*?<\/section>/)
  if (!section) return { status: res.status, heading: null, links: [] }
  return {
    status: res.status,
    heading: (section[0].match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '').replace(/<[^>]*>/g, '').trim(),
    links: [...section[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
  }
}

for (const [tab, query, expected] of [
  ['cities', 'melbourne', '/city/melbourne'],
  ['communities', 'african', '/community/african'],
  ['organisers', 'harbour', '/organisers/'],
]) {
  const { status, heading, links } = await scope(`?tab=${tab}&q=${encodeURIComponent(query)}`)
  const found = links.some((l) => l.startsWith(expected))
  record(
    `tab=${tab} q=${query}`,
    status === 200 && found,
    found
      ? `"${heading}" linking to ${links.filter((l) => l.startsWith(expected)).join(', ')}`
      : `HTTP ${status}, no link starting ${expected}. Links: ${links.join(', ') || 'none'}`,
  )
  // Every destination must resolve, or the tab trades one dead end for another.
  for (const link of links.filter((l) => l.startsWith(expected))) {
    const r = await fetch(`${BASE}${link}`, { headers: { 'user-agent': 'search-reach-e2e' } })
    record(`  ${link}`, r.status === 200, `HTTP ${r.status}`)
  }
}

// The empty state has to be a designed way forward, not a dead end, and the
// singular form has to be a real word: stripping a trailing "s" produced
// "citie" and "communitie", visible only when a search returns exactly one.
{
  const { status, heading, links } = await scope('?tab=cities&q=zzzznothing')
  const ok = status === 200 && /^No cities matching/.test(heading ?? '') && links.includes('/cities')
  record('tab=cities with no match', ok, ok ? `"${heading}" with a route to /cities` : `HTTP ${status}, heading "${heading}", links ${links.join(', ')}`)
}
{
  const { heading } = await scope('?tab=cities&q=melbourne')
  const ok = /^1 city matching/.test(heading ?? '')
  record('singular label is a real word', ok, ok ? `"${heading}"` : `got "${heading}", expected "1 city matching ..."`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} pass, ${failed.length} FAIL`)
if (failed.length) for (const f of failed) console.log(`  ${f.name}: ${f.detail}`)
if (gaps.length) {
  console.log(`\n${gaps.length} CONTENT GAP(S): search works, the catalogue stocks nothing.`)
  for (const g of gaps) console.log(`  ${g.label}  ->  /events?q=${encodeURIComponent(g.phrase)}`)
}
fs.mkdirSync('docs/roast/search-reach', { recursive: true })
fs.writeFileSync(
  'docs/roast/search-reach/search-reach-e2e.json',
  JSON.stringify({ base: BASE, at: new Date().toISOString(), results, gaps }, null, 2),
)
process.exitCode = failed.length ? 2 : 0
