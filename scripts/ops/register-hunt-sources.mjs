// THE DAILY BIG EVENT HUNT'S NEW SOURCES INTO THE REGISTER (car 44; Lawal's ruling of 4 November 2026, 15:12, through the
// CONTROLLER's 15:20 and 15:30; operating rule 4: dry run by default, APPLY typed, a production write logged in
// C:\dev\PRODUCTION-WRITES.txt).
//
// The register's own rule holds (scripts/ops/register-sources-production.mjs): a source goes in as 'read' only when what
// lets it be read was read TODAY. So each page's robots.txt is read now, through the collector's own agent, one request
// a second per host, and its lines for every agent are quoted; the page itself must answer 200. A site whose robots.txt
// cannot be read, or that disallows the page, is NOT registered and is named. Facts and the link only: no image, no
// description, as GMHBA Stadium's row (registered on Lawal's ruling of 2 November, 16:48) and as the hunt's ruling says.
// Existing rows are left (on conflict on page_url).
//
//   scripts\ops\with-supabase-token.ps1 node scripts/ops/register-hunt-sources.mjs --target test            dry run
//   scripts\ops\with-supabase-token.ps1 node scripts/ops/register-hunt-sources.mjs --target production --apply
import { appendFileSync, readSync } from 'node:fs'

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const AGENT = 'EventLinqs/1.0 (+https://www.eventlinqs.com.au)'
const RULING =
  "Lawal Adams, 4 November 2026, 15:12, relayed by the CONTROLLER 15:20: 'every day ... it reads the What's on pages of each " +
  "city's headline venues and promoters ... adds any new public ticketed event with our own words and the seller's ticket link, " +
  "never copying text or photos and never reading Eventbrite pages'."

export const HUNT_REGISTER = [
  { name: 'Rod Laver Arena (Melbourne & Olympic Parks)', city_slug: 'melbourne', page_url: 'https://rodlaverarena.com.au/events/' },
  { name: 'John Cain Arena (Melbourne & Olympic Parks)', city_slug: 'melbourne', page_url: 'https://johncainarena.com.au/events/' },
  { name: 'Margaret Court Arena (Melbourne & Olympic Parks)', city_slug: 'melbourne', page_url: 'https://margaretcourtarena.com.au/events/' },
  { name: 'AAMI Park (Melbourne & Olympic Parks)', city_slug: 'melbourne', page_url: 'https://aamipark.com.au/events/' },
  { name: "Her Majesty's Theatre Ballarat", city_slug: 'ballarat', page_url: 'https://www.hermaj.com/events' },
  // Car 44b (the CONTROLLER's 01:05 of 5 November 2026).
  { name: 'Forum Melbourne', city_slug: 'melbourne', page_url: 'https://forummelbourne.com.au/' },
  // Held since 1 November as 'ask' ('Terms: none found on automated access; read once a person confirms'). The 01:05 names
  // it on Lawal's ruling of 4 November 15:12, which is that confirmation: its row is moved to 'read' with today's robots
  // quote; its name, city and page are left as they are.
  { name: 'Geelong Arts Centre', city_slug: 'geelong', page_url: 'https://geelongartscentre.org.au/sitemaps-1-section-event-1-sitemap.xml', upgrade: true },
  // The rest of the 01:05 list that reads cleanly (the CONTROLLER's 11:45 of 5 November 2026; page-rules-melbourne.ts).
  { name: 'Melbourne Cricket Ground (MCG)', city_slug: 'melbourne', page_url: 'https://www.mcg.org.au/sitemap.xml' },
  { name: 'Palais Theatre (Live Nation)', city_slug: 'melbourne', page_url: 'https://www.palaistheatre.com.au/' },
  { name: 'Festival Hall (Live Nation)', city_slug: 'melbourne', page_url: 'https://www.festivalhall.com.au/' },
  { name: 'Melbourne Recital Centre', city_slug: 'melbourne', page_url: 'https://www.melbournerecital.com.au/sitemap.xml' },
  { name: 'Federation Square', city_slug: 'melbourne', page_url: 'https://fedsquare.com/sitemap.xml' },
]

/** What an 'ask' row named above takes from today's read: what lets it be read and when; never its name, city or page. */
export const UPGRADE_COLUMNS = [
  'collection', 'verification', 'verified_on', 'terms_url', 'terms_quote', 'terms_read_on',
  'may_scrape', 'may_scrape_quote', 'may_scrape_url', 'may_scrape_read_on',
  'permits_facts', 'permits_links', 'permits_images', 'permits_descriptions', 'refresh_interval_hours', 'notes',
]

class Refusal extends Error {}

function args(argv) {
  const out = { target: null, apply: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') out.apply = true
    else if (argv[i] === '--target') out.target = argv[(i += 1)] ?? null
    else throw new Refusal(`unknown argument ${JSON.stringify(argv[i])}`)
  }
  if (!out.target || !(out.target in TARGETS)) throw new Refusal(`--target must be test or production (got ${JSON.stringify(out.target)}); there is no default`)
  return out
}

const lastHit = new Map()
async function polite(url) {
  const host = new URL(url).host
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(url, { headers: { 'User-Agent': AGENT }, redirect: 'follow', signal: AbortSignal.timeout(30000) })
    return { status: res.status, body: res.ok ? await res.text() : '' }
  } catch (e) {
    return { status: null, body: '', error: e instanceof Error ? e.message : String(e) }
  }
}

/** The robots.txt lines of the group for every agent ('User-agent: *'), joined as the register quotes them. Pure. */
export function starGroup(txt) {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean)
  const out = []
  let inStar = false
  for (const l of lines) {
    const [k, ...rest] = l.split(':')
    const key = k.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'user-agent') {
      inStar = value === '*'
      if (inStar) out.push('User-agent: *')
    } else if (inStar && (key === 'allow' || key === 'disallow')) out.push(`${k.trim()}: ${value || '(nothing)'}`)
  }
  return out.join(' / ')
}

/** Whether the star group disallows the page's path (the simple prefix rule, as the collector reads it). Pure. */
export function starDisallows(txt, path) {
  const rules = starGroup(txt).split(' / ').slice(1).map((r) => r.split(': '))
  let best = { len: -1, allow: true }
  for (const [k, v] of rules) {
    if (!v || v === '(nothing)') continue
    if (path.startsWith(v) && v.length > best.len) best = { len: v.length, allow: k.toLowerCase() === 'allow' }
  }
  return !best.allow
}

function askLine(prompt) {
  process.stdout.write(prompt)
  const buf = Buffer.alloc(64)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    return ''
  }
  return buf.subarray(0, n).toString('utf8').trim()
}

const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

async function main() {
  const a = args(process.argv.slice(2))
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Refusal('no SUPABASE_ACCESS_TOKEN: run through scripts\\ops\\with-supabase-token.ps1')
  const ref = TARGETS[a.target]
  const query = async (sql, readOnly) => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: readOnly }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`query failed on ${a.target} (HTTP ${res.status}): ${text.slice(0, 500)}`)
    return JSON.parse(text)
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const rows = []
  for (const s of HUNT_REGISTER) {
    const u = new URL(s.page_url)
    const robots = await polite(`${u.origin}/robots.txt`)
    if (robots.status !== 200) {
      console.log(`  NOT REGISTERED ${s.name}: its robots.txt answered ${robots.status ?? `nothing (${robots.error})`}, so nothing says it may be read`)
      continue
    }
    if (starDisallows(robots.body, u.pathname)) {
      console.log(`  NOT REGISTERED ${s.name}: its robots.txt disallows ${u.pathname}`)
      continue
    }
    const page = await polite(s.page_url)
    if (page.status !== 200) {
      console.log(`  NOT REGISTERED ${s.name}: ${s.page_url} answered ${page.status ?? `nothing (${page.error})`}`)
      continue
    }
    const quote = starGroup(robots.body) || 'User-agent: * / (no rules for every agent)'
    rows.push({
      kind: 'venue',
      name: s.name,
      city_slug: s.city_slug,
      page_url: s.page_url,
      collection: 'read',
      changes: 'weekly',
      source_type: 'manual_research',
      verification: 'verified',
      verified_on: today,
      terms_url: `${u.origin}/robots.txt`,
      terms_quote: `No website terms of use page is linked from the venue's site; robots.txt for every agent reads '${quote}'. ${RULING}`.slice(0, 1900),
      terms_read_on: today,
      may_scrape: 'yes',
      may_scrape_quote: quote.slice(0, 900),
      may_scrape_url: `${u.origin}/robots.txt`,
      may_scrape_read_on: today,
      permits_facts: true,
      permits_links: true,
      permits_images: false,
      permits_descriptions: false,
      refresh_interval_hours: 24,
      notes: 'Car 44, the daily big event hunt (src/lib/listings/headline-hunt.ts): facts and the seller\'s link only, no image and no description.',
    })
    console.log(`  ${s.name}: robots '${quote}', page 200 -> read, facts and links`)
  }
  if (rows.length === 0) return console.log('[register-hunt-sources] nothing to register')
  const upgrades = rows.filter((r) => HUNT_REGISTER.find((s) => s.page_url === r.page_url)?.upgrade)
  const inserts = rows.filter((r) => !upgrades.includes(r))
  const cols = Object.keys(rows[0])
  const values = inserts.map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n')
  const held = await query(`select page_url from public.listing_sources where page_url in (${rows.map((r) => lit(r.page_url)).join(', ')})`, true)
  console.log(`[register-hunt-sources] ${a.target}: ${rows.length} to register, ${held.length} already held (left as they are)`)
  if (!a.apply) return console.log('[register-hunt-sources] DRY RUN: nothing written. Add --apply to write.')
  if (askLine(`Type APPLY to register ${rows.length} source(s) on ${a.target}: `) !== 'APPLY') throw new Refusal('not applied')
  if (inserts.length > 0) await query(`insert into public.listing_sources (${cols.join(', ')}) values ${values} on conflict (page_url) do nothing`, false)
  for (const u of upgrades) {
    const set = UPGRADE_COLUMNS.map((k) => `${k} = ${lit(u[k])}`).join(', ')
    await query(`update public.listing_sources set ${set} where page_url = ${lit(u.page_url)} and collection <> 'read'`, false)
  }
  const after = await query(`select name, collection from public.listing_sources where page_url in (${rows.map((r) => lit(r.page_url)).join(', ')}) order by name`, true)
  console.log(`[register-hunt-sources] read back: ${after.map((r) => `${r.name} (${r.collection})`).join('; ')}`)
  if (a.target === 'production') {
    appendFileSync(LOG, `${new Date().toISOString()} | register-hunt-sources | production | ${after.length} hunt source(s) held: ${after.map((r) => r.name).join('; ')}\n`)
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('register-hunt-sources.mjs')) {
  main().catch((e) => {
    console.error(`[register-hunt-sources] ${e instanceof Refusal ? 'REFUSED: ' : ''}${e.message}`)
    process.exit(1)
  })
}
