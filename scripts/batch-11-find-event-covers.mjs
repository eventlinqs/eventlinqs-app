// Extract working Pexels cover_image_url values from existing published
// events so the hero migration can reuse them (guaranteed to resolve).
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

const slugs = [
  // African
  'afrobeats-live-headline-concert',
  'afrobeats-melbourne-summer-sessions',
  // South Asian
  'diwali-festival-melbourne-festival-of-lights',
  'diwali-gala-dinner-an-evening-in-jaipur',
  'bollywood-nights-sydney-dhol-and-dance',
  // Caribbean
  'caribbean-carnival-melbourne-soca-saturday',
  'caribbean-sunset-cruise-sydney-harbour',
]
const slugList = '(' + slugs.map(s => '"' + s + '"').join(',') + ')'
const resp = await fetch(URL + '/rest/v1/events?select=slug,cover_image_url&slug=in.' + encodeURIComponent(slugList), {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const rows = await resp.json()
for (const r of (Array.isArray(rows) ? rows : [])) {
  console.log(r.slug, '\n ', r.cover_image_url)
}
