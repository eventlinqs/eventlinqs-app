// Publish the 2 draft events that the homepage HeroCarousel CTAs
// route to so the public hero is link-clean before push.
//
// pasifika-festival-sydney + lebanese-mahrajan-sydney were seeded as
// drafts (Pacific and Middle Eastern community slots respectively).
// Marking them published makes them resolvable at /events/[slug] so
// the homepage hero stops 404ing on those two slots.
//
// This reads .env.local, which points at PRODUCTION. The preflight refuses that
// target without explicit founder approval. To run it against TEST:
//   node --env-file=.env.test scripts/batch-11-publish-hero-events.mjs
import { assertNotProduction } from './lib/production-write-preflight.mjs'
import { existsSync, readFileSync } from 'node:fs'

assertNotProduction()

const env = existsSync('.env.local')
  ? Object.fromEntries(
      readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
        const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
      })
    )
  : {}
// The real environment wins over the file, the same precedence Node's --env-file,
// Next's loader and the preflight all use. Without this the preflight could judge
// a TEST process environment while these two lines still read PRODUCTION.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

const slugs = ['pasifika-festival-sydney', 'lebanese-mahrajan-sydney']

for (const slug of slugs) {
  const r = await fetch(URL + `/rest/v1/events?slug=eq.${slug}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status: 'published' }),
  })
  const data = await r.json()
  console.log(`${slug} -> HTTP ${r.status}`)
  if (Array.isArray(data) && data[0]) {
    console.log('  new status:', data[0].status)
  } else {
    console.log('  response:', JSON.stringify(data).slice(0, 200))
  }
}
