import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

const slugList = '("caribbean-carnival-melbourne-soca-saturday","pasifika-festival-sydney","lebanese-mahrajan-sydney")'
const resp = await fetch(URL + '/rest/v1/events?select=*&slug=in.' + encodeURIComponent(slugList), {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const rows = await resp.json()
if (!Array.isArray(rows)) { console.log('ERR:', JSON.stringify(rows)); process.exit(1) }
console.log('Got', rows.length, 'rows')
for (const r of rows) {
  console.log('\n=== SLUG:', r.slug, '| status:', r.status, '===')
  for (const [k,v] of Object.entries(r)) {
    if (['description','metadata','tags'].includes(k)) continue
    const display = v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v).slice(0,150) : String(v).slice(0,150)
    console.log(' ', k.padEnd(28), '=', display)
  }
}

const orgs = await (await fetch(URL + '/rest/v1/organisations?select=id,handle,display_name&limit=10', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})).json()
console.log('\n=== organisations (first 10) ===')
for (const o of (orgs ?? [])) console.log(' ', o.id, '|', o.handle, '|', o.display_name)

if (rows.length && rows[0].id) {
  const tt = await (await fetch(URL + '/rest/v1/ticket_types?select=*&event_id=eq.' + rows[0].id, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  })).json()
  console.log('\n=== ticket_types on', rows[0].slug, '===')
  for (const t of (Array.isArray(tt) ? tt : [])) {
    for (const [k,v] of Object.entries(t)) {
      const display = v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v).slice(0,100) : String(v).slice(0,100)
      console.log(' ', k.padEnd(24), '=', display)
    }
    console.log('---')
  }
}
