/**
 * A ONE-EVENT PROBE, kept because it is the thing that answers "why did the
 * page render nothing" in ten seconds instead of four minutes.
 *
 * The states drive creates three events, drives nine page loads and deletes
 * everything in a `finally`, which is right for a proof and useless for a
 * diagnosis: by the time the report prints, the row it is describing is gone.
 * This creates ONE event, prints what the server actually answered, and leaves
 * the row in place until it is told to remove it.
 *
 * Run: node --env-file=.env.local scripts/verify/seo5-probe.mjs [baseUrl]
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'

assertNotProduction()

const BASE = (process.argv[2] || 'http://localhost:3200').replace(/\/$/, '')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
if (!url.includes('vkapkibzokmfaxqogypq')) {
  console.error('REFUSING: not the TEST project')
  process.exit(2)
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: donorEvent } = await db
  .from('events')
  .select(
    'organisation_id, created_by, category_id, published_at, status, visibility, organisation:organisations!inner(slug, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status)',
  )
  .eq('organisation.status', 'active')
  .eq('organisation.stripe_charges_enabled', true)
  .eq('organisation.stripe_payouts_enabled', true)
  .not('organisation.stripe_account_id', 'is', null)
  .not('organisation.stripe_account_country', 'is', null)
  .eq('organisation.payout_status', 'active')
  .limit(1)
  .maybeSingle()

console.log('donor:', JSON.stringify(donorEvent, null, 2))

const { data: cover } = await db
  .from('events')
  .select('cover_image_url')
  .not('cover_image_url', 'is', null)
  .limit(1)
  .maybeSingle()

const slug = `lane-c-seo5-probe-${Date.now().toString(36)}`
const { data: event, error } = await db
  .from('events')
  .insert({
    title: 'Lane C SEO5 probe',
    slug,
    organisation_id: donorEvent.organisation_id,
    created_by: donorEvent.created_by,
    category_id: donorEvent.category_id,
    cover_image_url: cover?.cover_image_url ?? null,
    start_date: '2026-10-10T08:00:00.000Z',
    end_date: '2026-10-10T12:30:00.000Z',
    timezone: 'Australia/Melbourne',
    status: 'published',
    published_at: new Date().toISOString(),
    visibility: 'public',
    venue_name: 'Lane C Proof Room',
    venue_address: '1 Lane C Street',
    venue_city: 'Melbourne',
    venue_country: 'Australia',
    description: 'A lane-C probe row.',
    wheelchair_accessible: true,
    companion_card_accepted: true,
    accessibility_notes: 'The accessible entrance is on the laneway side.',
    accessibility_contact: '03 9000 0000',
  })
  .select('id, slug')
  .single()
if (error) {
  console.error('insert failed:', error.message)
  process.exit(1)
}
await db.from('ticket_tiers').insert({
  event_id: event.id,
  name: 'Lane C general admission',
  price: 2850,
  currency: 'AUD',
  total_capacity: 100,
  sold_count: 0,
  max_per_order: 10,
})

const target = `${BASE}/events/${event.slug}`
const res = await fetch(target, { redirect: 'manual' })
const html = await res.text()
console.log(`\n${target} -> ${res.status}`)
console.log('og:type      :', /<meta property="og:type" content="([^"]*)"/.exec(html)?.[1] ?? 'ABSENT')
console.log('title        :', /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'ABSENT')
console.log('add to cal   :', /Add to calendar/.test(html))
console.log('accessibility:', /accessibility-heading/.test(html))
console.log('wheelchair   :', /Wheelchair accessible/.test(html))
console.log('\nfirst 600 chars of body text:')
console.log(
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 600),
)

if (process.env.SEO5_KEEP !== '1') {
  await db.from('ticket_tiers').delete().eq('event_id', event.id)
  await db.from('events').delete().eq('id', event.id)
  console.log('\nremoved the probe row (set SEO5_KEEP=1 to keep it)')
} else {
  console.log(`\nkept ${event.slug} (${event.id})`)
}
