/**
 * WHO SEES A WALK-IN GUIDE, PROVED ON TEST AS A VISITOR (the project manager's ruling of 24 October 2026,
 * 13:24): an unlisted walk-in event shows its full guide by link; a draft, a cancelled or a private one shows
 * none to the public.
 *
 * One fixture walk-in event, created for this run and deleted at its end (it never takes an order, so the
 * money-records rule does not hold it), is stepped through four states, and each time its page is fetched from
 * the server under test with no account, the way a visitor arrives by link. Its guide carries one marker line,
 * and the verdict is whether the page carries it:
 *
 *   draft, unlisted          none (the page itself is not the public's)
 *   published, unlisted      THE GUIDE (the case the AMCF page proof found empty)
 *   published, private       none
 *   cancelled, unlisted      none (the page still renders, as a cancelled event's does)
 *
 * The fixture is never public, so it is never in the sitemap (scripts/verify/lib/sitemap-footprint.mjs), and the
 * proof asks the sitemap's own question before it ends. TEST ONLY: the repository's preflight first, then the
 * TEST ref check, before any client is made.
 *
 * Usage (from a worktree with TEST in .env.local):
 *   node --env-file=.env.local scripts/verify/walk-in-guide-visibility-proof.mjs --site http://127.0.0.1:3100
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { sitemapFootprint } from './lib/sitemap-footprint.mjs'

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`REFUSED: this proof writes a fixture and runs on TEST only, and NEXT_PUBLIC_SUPABASE_URL is ${url || 'unset'}.`)
  process.exitCode = 2
} else {
  const siteAt = process.argv.indexOf('--site')
  const site = siteAt > -1 ? process.argv[siteAt + 1] : null
  if (!site || !/^https?:\/\/[^\s/]+$/.test(site)) {
    console.error('REFUSED: --site <origin> of a server reading TEST is required')
    process.exitCode = 2
  } else {
    process.exitCode = await run(createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }), site)
  }
}

async function run(db, site) {
  const must = async (label, promise) => {
    const { data, error } = await promise
    if (error) throw new Error(`${label}: ${error.message}`)
    return data
  }
  const fid = (name) => {
    const h = createHash('sha256').update(`proof-fixture-walk-in-guide:${name}`).digest('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
  }
  const MARKER = 'Guide visibility proof: this line is the guide'
  const ORG = fid('org')
  const OWNER_EMAIL = 'delivered+elq-organiser-20260704d@resend.dev'

  const owner = await must('the stand-in owner', db.from('profiles').select('id').eq('email', OWNER_EMAIL).maybeSingle())
  if (!owner) throw new Error(`no TEST profile ${OWNER_EMAIL}`)
  // A real stored cover and a real category, borrowed from the AMCF listing on TEST (a published row needs both).
  const donor = await must('the AMCF listing on TEST', db.from('events').select('cover_image_url, category_id').eq('slug', 'amcf-2026').maybeSingle())
  if (!donor?.cover_image_url) throw new Error('the AMCF listing on TEST has no cover to borrow')
  await must('the fixture organisation', db.from('organisations').upsert(
    [{ id: ORG, owner_id: owner.id, name: 'Proof Fixture Walk-in Guide', slug: 'proof-fixture-walk-in-guide', email: 'proof.fixture.walkin@eventlinqs.test' }],
    { onConflict: 'id', ignoreDuplicates: true },
  ))

  const slug = `proof-fixture-walk-in-guide-${Date.now().toString(36)}`
  const event = await must('the fixture event', db.from('events').insert({
    organisation_id: ORG,
    created_by: owner.id,
    title: 'Proof fixture: walk-in guide visibility',
    slug,
    summary: 'A fixture for the walk-in guide visibility proof. Not a real event.',
    category_id: donor.category_id,
    start_date: '2026-12-12T00:00:00Z',
    end_date: '2026-12-12T05:00:00Z',
    timezone: 'Australia/Melbourne',
    event_type: 'in_person',
    venue_name: 'Proof Fixture Hall',
    venue_city: 'Melbourne',
    entry_mode: 'walk_in',
    listing_source: 'organiser',
    visibility: 'unlisted',
    status: 'draft',
    published_at: null,
    cover_image_url: donor.cover_image_url,
  }).select('id').single())
  console.log(`fixture: ${slug} (${event.id})`)

  const results = []
  try {
    await must('the fixture guide', db.from('event_guides').upsert({
      event_id: event.id,
      days: [{ date: '2026-12-12', opens: '11:00', closes: '16:00', hours_label: null, items: [{ when: 'All day', what: MARKER }], closer: null }],
      at_a_glance: [],
      highlights: [],
    }, { onConflict: 'event_id' }))

    const step = async (label, change, expectGuide) => {
      if (change) await must(`set ${label}`, db.from('events').update(change).eq('id', event.id))
      const res = await fetch(`${site}/events/${slug}`, { redirect: 'manual', cache: 'no-store' }).catch((e) => ({ status: `error ${e.message}`, text: async () => '' }))
      const html = await res.text()
      const shown = html.includes(MARKER)
      const ok = shown === expectGuide
      results.push(ok)
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: the page answered ${res.status} and ${shown ? 'CARRIES' : 'does not carry'} the guide (expected: ${expectGuide ? 'carries it' : 'none'})`)
    }

    await step('draft, unlisted', null, false)
    await step('published, unlisted', { status: 'published', published_at: new Date().toISOString() }, true)
    await step('published, private', { visibility: 'private' }, false)
    await step('cancelled, unlisted', { visibility: 'unlisted', status: 'cancelled' }, false)

    const footprint = await sitemapFootprint(db, { organisationSlugs: ['proof-fixture-walk-in-guide'], eventSlugs: [slug] })
    const clean = footprint.length === 0
    results.push(clean)
    console.log(`${clean ? 'PASS' : 'FAIL'}  the fixture was never in the sitemap${clean ? '' : `: ${footprint.join(', ')}`}`)
  } finally {
    await db.from('event_guides').delete().eq('event_id', event.id)
    const gone = await db.from('events').delete().eq('id', event.id).select('id')
    console.log(`fixture: ${(gone.data ?? []).length === 1 ? 'deleted' : `NOT deleted (${gone.error?.message ?? 'no row'})`}`)
  }
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  return passed === results.length ? 0 : 1
}
