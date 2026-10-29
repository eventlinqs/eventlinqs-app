/**
 * THE FOUR ORIGINALS AS TEST LISTINGS (the daily poster directive's acceptance: "The four originals are re-made by the
 * new family from TEST data"). Each night is written with the original's facts (C:\dev\START-16OCT\DAILY-POSTER-
 * REFERENCE-4-ORIGINALS.png), on the same weekdays in the week of 2 November 2026, given its own typographic cover by
 * the platform's own generator (a published night must carry one), then published; Plan this week then makes their
 * posters as it would any night's.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/daily-poster-test-fixtures.mts [--apply]
 *
 * TEST ONLY, refused anywhere else. Dry run unless --apply. Idempotent: a night already written (by its slug) is left
 * alone. Each summary says it is a TEST fixture. No photograph is attached: the originals' own photographs are the
 * venues' Instagram posts, which EventLinqs holds no licence for, so these nights are type-led, as the register decides.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type * as CoverModule from '@/lib/events/generated-cover'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) => (request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error(`TEST only, refused: ${url}`)
const apply = process.argv.includes('--apply')
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })

// The organisation and author a published TEST night in Geelong already carries, so these sit where such nights sit.
const { data: template, error: terr } = await db.from('events').select('organisation_id, created_by').eq('status', 'published').ilike('venue_city', 'geelong').eq('entry_mode', 'walk_in').limit(1).single()
if (terr || !template) throw new Error(`no TEST template night: ${terr?.message}`)
const { data: cats } = await db.from('event_categories').select('id, slug').in('slug', ['nightlife', 'community', 'music'])
const cat = (slug: string) => cats?.find((c) => c.slug === slug)?.id ?? null

const SUMMARY = 'TEST fixture for the daily poster (30 October 2026), with the facts of the original sample.'
const NIGHTS = [
  { slug: 'creative-community-night-w3-poster-fixture', title: 'Creative Community Night', start: '2026-11-05T06:00:00Z', end: '2026-11-05T09:00:00Z', venue: 'The House', address: 'Centrepoint Arcade, Geelong VIC 3220', category: 'community', age: false },
  { slug: 'jackpot-trivia-w3-poster-fixture', title: 'Jackpot Trivia', start: '2026-11-05T08:00:00Z', end: '2026-11-05T11:00:00Z', venue: 'Elephant & Castle', address: '158 McKillop St, Geelong VIC 3220', category: 'nightlife', age: false },
  { slug: 'friyay-at-beavs-w3-poster-fixture', title: "Friyay at Beav's", start: '2026-11-06T10:30:00Z', end: '2026-11-06T14:00:00Z', venue: "Beav's Bar", address: '77 Little Malop St, Geelong VIC 3220', category: 'music', age: true },
  { slug: 'wooshka-live-w3-poster-fixture', title: 'Wooshka live', start: '2026-11-07T10:00:00Z', end: '2026-11-07T13:30:00Z', venue: 'Elephant & Castle', address: '158 McKillop St, Geelong VIC 3220', category: 'music', age: false },
]

const cover = ((await import('@/lib/events/generated-cover')) as typeof CoverModule & { default?: typeof CoverModule })
const { attachGeneratedCover } = (cover.default ?? cover) as typeof CoverModule

for (const n of NIGHTS) {
  const { data: have } = await db.from('events').select('id, status, cover_image_url').eq('slug', n.slug).maybeSingle()
  if (have) {
    console.log(`kept      ${n.title}: ${have.status}, ${have.cover_image_url ? 'with a cover' : 'no cover'}`)
    continue
  }
  if (!apply) {
    console.log(`would add ${n.title}: ${n.start}, ${n.venue}, ${n.address}${n.age ? ', 18+' : ''}`)
    continue
  }
  const { data: row, error } = await db.from('events').insert({
    title: n.title, slug: n.slug, summary: SUMMARY, organisation_id: template.organisation_id, created_by: template.created_by, category_id: cat(n.category),
    start_date: n.start, end_date: n.end, timezone: 'Australia/Melbourne', event_type: 'in_person', venue_name: n.venue, venue_address: n.address,
    venue_city: 'Geelong', venue_state: 'VIC', venue_country: 'Australia', city_primary: 'geelong', status: 'draft', visibility: 'public',
    is_free: true, entry_mode: 'walk_in', is_age_restricted: n.age, age_restriction_min: n.age ? 18 : null,
  }).select('id').single()
  if (error || !row) throw new Error(`${n.title} could not be written: ${error?.message}`)
  const made = await attachGeneratedCover(row.id as string, { force: true })
  if (!made.ok) throw new Error(`${n.title}: its cover could not be made (${made.reason})`)
  const { error: perr } = await db.from('events').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', row.id)
  if (perr) throw new Error(`${n.title} could not be published: ${perr.message}`)
  console.log(`added     ${n.title}: ${row.id}`)
}

const { data: back } = await db.from('events').select('title, status, visibility, start_date, venue_address, is_age_restricted, age_restriction_min, cover_image_url').in('slug', NIGHTS.map((n) => n.slug))
for (const b of back ?? []) console.log(`READ BACK ${b.title}: ${b.status}/${b.visibility}, ${b.start_date}, ${b.venue_address}, 18+ ${b.is_age_restricted ? b.age_restriction_min : 'no'}, cover ${b.cover_image_url?.includes('/generated-covers/') ? 'typographic' : (b.cover_image_url ?? 'none')}`)
console.log(apply ? `${(back ?? []).length} of ${NIGHTS.length} on TEST` : 'DRY RUN, nothing written')
