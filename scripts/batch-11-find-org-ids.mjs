// Query organisations that own the existing African, South Asian,
// Caribbean published events so the new hero migration can reuse
// them as the organisation_id for slots 1, 3, 5.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

const slugList = '("afrobeats-live-headline-concert","diwali-festival-melbourne-festival-of-lights","caribbean-carnival-melbourne-soca-saturday")'
const resp = await fetch(URL + '/rest/v1/events?select=slug,organisation_id&slug=in.' + encodeURIComponent(slugList), {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const rows = await resp.json()
console.log('events ->')
for (const r of rows) console.log(' ', r.slug, '|', r.organisation_id)

// Fetch the org details for each
const orgIds = '(' + rows.map(r => '"' + r.organisation_id + '"').join(',') + ')'
const orgResp = await fetch(URL + '/rest/v1/organisations?select=id,handle,name&id=in.' + encodeURIComponent(orgIds), {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const orgs = await orgResp.json()
console.log('\norganisations ->')
for (const o of (Array.isArray(orgs) ? orgs : [])) console.log(' ', o.id, '|', o.handle, '|', o.name)
