import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const slugs = [
  'afrobeats-live-headline-concert',
  'pasifika-festival-sydney',
  'diwali-festival-melbourne-festival-of-lights',
  'lebanese-mahrajan-sydney',
  'caribbean-carnival-melbourne-soca-saturday',
]
const qs = encodeURIComponent(`(${slugs.map(s => `slug.eq."${s}"`).join(',')})`)
const resp = await fetch(URL + '/rest/v1/events?select=*&or=' + qs, {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const rows = await resp.json()
for (const r of rows) {
  console.log('SLUG:', r.slug)
  console.log('  status:', r.status, '| state:', r.state, '| visibility:', r.visibility, '| published_at:', r.published_at)
  console.log('  organiser_id:', r.organiser_id)
  console.log('  start_date:', r.start_date, '| city:', r.venue_city)
}
