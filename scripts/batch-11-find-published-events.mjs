import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const resp = await fetch(URL + "/rest/v1/events?select=slug,title,start_date,venue_city,status&status=eq.published&order=start_date.asc&limit=100", {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const rows = await resp.json()
if (!Array.isArray(rows)) {
  console.log('Non-array response:', JSON.stringify(rows).slice(0, 500))
  process.exit(1)
}
console.log('Published events:', rows.length)
for (const r of rows) {
  console.log(' ', r.slug, '|', r.start_date?.slice(0,10), '|', r.venue_city, '|', r.title?.slice(0, 60))
}
