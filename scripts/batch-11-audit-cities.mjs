// Audit cities / venue_city tables: list all rows, flag any non-AU
// content, and count FK references so the founder knows what would
// be deleted by the cleanup migration.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function rest(path) {
  const r = await fetch(URL + '/rest/v1/' + path, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  })
  if (!r.ok) {
    return { error: `HTTP ${r.status}: ${await r.text()}` }
  }
  return await r.json()
}

// Discover which city tables exist.
const candidates = ['cities', 'venue_city', 'venue_cities']
for (const t of candidates) {
  const sample = await rest(`${t}?select=*&limit=2`)
  console.log(`\n=== TABLE: ${t} ===`)
  if (sample.error) {
    console.log('  not found or error:', sample.error.slice(0, 200))
    continue
  }
  console.log(`  rows sampled: ${sample.length}`)
  if (sample[0]) {
    console.log('  columns:', Object.keys(sample[0]).join(', '))
  }
}

// Full row list for `cities` if it exists.
console.log('\n=== cities full list ===')
const cities = await rest('cities?select=*&order=slug.asc')
if (Array.isArray(cities)) {
  console.log('Total:', cities.length)
  for (const c of cities) {
    const country = c.country ?? c.country_code ?? '(none)'
    console.log(' ', String(c.slug).padEnd(20), '|', country, '|', c.name, '|', c.state ?? '')
  }
}

// Count events linked per city.
console.log('\n=== event counts by venue_city ===')
const events = await rest('events?select=venue_city&limit=10000')
if (Array.isArray(events)) {
  const counts = {}
  for (const e of events) {
    const c = (e.venue_city || '(null)').toString().toLowerCase()
    counts[c] = (counts[c] || 0) + 1
  }
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1])
  for (const [city, n] of sorted) {
    console.log(' ', city.padEnd(25), n)
  }
}
