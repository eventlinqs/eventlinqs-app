// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * Quantifies what search can and cannot find.
 *
 * The TEST catalogue is seeded with titles that literally contain the genre
 * phrase ("Electronic Dance Live at The Espy"), so a title-substring search
 * looks like it works. It does not: it works on that one seeded shape. This
 * probe asks for the things a real person types - a city, a venue, an
 * organiser, a word from the description - and reports what comes back.
 *
 * Usage: node scripts/sweep/search-probe.mjs --base <url>
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const BASE = (args[args.indexOf('--base') + 1] || '').replace(/\/$/, '')
if (!BASE) throw new Error('--base is required')

for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Ground truth straight from the database, so "found 0" can be compared with
// "there are N that should have matched".
const nowIso = new Date().toISOString()
const { data: events } = await db
  .from('events')
  .select('title,summary,venue_name,venue_city,tags,organisation:organisations(name)')
  .eq('status', 'published')
  .eq('visibility', 'public')
  .gte('start_date', nowIso)
  .limit(500)

function truth(term) {
  const t = term.toLowerCase()
  const titleOnly = events.filter((e) => (e.title || '').toLowerCase().includes(t)).length
  const anywhere = events.filter((e) =>
    [e.title, e.summary, e.venue_name, e.venue_city, e.organisation?.name, (e.tags || []).join(' ')]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(t)),
  ).length
  return { titleOnly, anywhere }
}

async function pageCount(q) {
  const res = await fetch(`${BASE}/events?q=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 sweep-probe' },
  })
  const html = await res.text()
  // The count sits in its own element, so tags have to come out before the
  // phrase reads as one string.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
  const m = text.match(/([\d,]+)\s+events?\s+available/i)
  if (m) return Number(m[1].replace(/,/g, ''))
  if (/could be yours/i.test(text) || /no events/i.test(text)) return 0
  return null
}

const TERMS = [
  ['Melbourne', 'a city name, the single most likely search on the platform'],
  ['Geelong', 'the founder wedge city'],
  ['comedy', 'a category word'],
  ['The Espy', 'a venue name'],
  ['Harbourline Live', 'an organiser name'],
  ['afrobeats', 'a community genre, single word'],
  ['jazz soul', 'a Sounds tile phrase, two words'],
  ['hip hop rnb', 'a Sounds tile phrase, three words'],
  ['live music melbourne', 'a natural multi-word phrase'],
]

console.log('term'.padEnd(22) + 'page'.padStart(6) + 'title-only'.padStart(12) + 'anywhere'.padStart(10) + '  note')
console.log('-'.repeat(90))
for (const [term, note] of TERMS) {
  const t = truth(term)
  const p = await pageCount(term)
  const flag = p !== null && t.anywhere > 0 && p < t.anywhere ? '  <== MISSES' : ''
  console.log(
    term.padEnd(22) +
      String(p ?? '?').padStart(6) +
      String(t.titleOnly).padStart(12) +
      String(t.anywhere).padStart(10) +
      '  ' +
      note +
      flag,
  )
}
