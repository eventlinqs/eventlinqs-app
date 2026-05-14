import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const resp = await fetch(URL + '/rest/v1/events?select=slug,title,start_date,venue_city&order=start_date.asc&limit=300', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const rows = await resp.json()
console.log('Total events:', rows.length)
const wanted = ['africultures','pasifika','diwali','lebanese','caribbean','carnival','eid','mela']
for (const w of wanted) {
  const hits = rows.filter(r => r.slug?.toLowerCase().includes(w))
  if (hits.length) {
    console.log(`\nMatch "${w}":`)
    for (const h of hits.slice(0,10)) console.log('  ', h.slug, '|', h.start_date?.slice(0,10), '|', h.venue_city, '|', h.title?.slice(0,60))
  }
}
console.log('\nFirst 30 of all upcoming events:')
const now = new Date().toISOString()
const future = rows.filter(r => r.start_date && r.start_date >= now)
for (const r of future.slice(0, 30)) console.log('  ', r.slug, '|', r.start_date?.slice(0,10), '|', r.venue_city, '|', r.title?.slice(0,60))
