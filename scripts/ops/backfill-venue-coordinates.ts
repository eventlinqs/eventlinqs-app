/**
 * BACKFILL VENUE COORDINATES (Scope v5, 3.1.1), TEST ONLY, DRY RUN BY DEFAULT.
 *
 * Every event created before 4 September 2026 has an address and no
 * coordinates, so it never appeared on its city map. This geocodes those rows
 * on the server, through the same client the save path uses
 * (src/lib/geo/geocode.ts), and writes venue_latitude, venue_longitude,
 * venue_place_id (only when empty), venue_geocode_source = 'geocoding',
 * venue_geocoded_at, and city_primary when it was null and the coordinates
 * settle it (src/lib/cities/resolve.ts).
 *
 * It PROVES ITSELF (Law 10):
 *   - refuses production before it reads anything (assertNotProduction);
 *   - refuses to write unless --apply is passed, and prints the plan otherwise;
 *   - never overwrites a Places pick (source 'places') or an existing pair;
 *   - reports the one named reason when the server key cannot serve the API,
 *     and does nothing else, so a run with the browser key is a report;
 *   - verifies by reading each row back after the write, not by trusting it;
 *   - never prints a key.
 *
 * Usage (from the repo root, the TEST env file):
 *   npx tsx --env-file=.env.local scripts/ops/backfill-venue-coordinates.ts            (dry run)
 *   npx tsx --env-file=.env.local scripts/ops/backfill-venue-coordinates.ts --apply    (write)
 *   ... --limit 50                                                                  (cap a run)
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { composeGeocodeQuery, geocodeAddress, serverGeocodingAvailable } from '../../src/lib/geo/geocode'
import { resolveCityClaim } from '../../src/lib/cities/resolve'

assertNotProduction()

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limitIx = args.indexOf('--limit')
const limit = limitIx >= 0 ? Number(args[limitIx + 1]) : 500
// No top-level await: tsx emits CommonJS for a .ts file in this package, and
// CommonJS has no top-level await. The entry is a promise the process waits on.
if (!Number.isFinite(limit) || limit <= 0) {
  console.error('FAIL: --limit needs a positive number')
  process.exitCode = 1
} else {
  void run().catch((err: unknown) => {
    console.error('FAIL: ' + (err instanceof Error ? err.message : String(err)))
    process.exitCode = 1
  })
}

async function run(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) {
    console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).')
    process.exitCode = 1
    return
  }
  const db = createClient(url, service, { auth: { persistSession: false } })

  const { data: rows, error } = await db
    .from('events')
    .select('id, slug, venue_name, venue_address, venue_city, venue_state, venue_postal_code, venue_country, venue_place_id, venue_geocode_source, city_primary')
    .is('venue_latitude', null)
    .not('venue_address', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.error(`FAIL: could not read the working set: ${error.code} ${error.message}`)
    process.exitCode = 1
    return
  }
  const candidates = (rows ?? []).filter((r) => r.venue_geocode_source !== 'places')
  console.log(`backfill-venue-coordinates on ${url}`)
  console.log(`  ${candidates.length} event(s) with an address and no coordinates (limit ${limit})${apply ? '' : ', DRY RUN: pass --apply to write'}`)

  const availability = serverGeocodingAvailable()
  if (!availability.available) {
    console.log(`  server geocoding is OFF: ${availability.reason}`)
    console.log('  Nothing was geocoded and nothing was written. The founder\'s step is the key (BLOCKED ON FOUNDER, KEY ONLY):')
    console.log('    node --env-file=.env.local scripts/ops/verify-google-maps-keys.mjs')
    for (const r of candidates.slice(0, 10)) console.log(`    would geocode  ${r.slug}  "${composeGeocodeQuery({ venueName: r.venue_name, address: r.venue_address, city: r.venue_city, state: r.venue_state, postalCode: r.venue_postal_code, country: r.venue_country })}"`)
    if (candidates.length > 10) console.log(`    ... and ${candidates.length - 10} more`)
    return
  }

  const key = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim()
  let written = 0
  let skipped = 0
  let failed = 0
  for (const r of candidates) {
    const query = composeGeocodeQuery({ venueName: r.venue_name, address: r.venue_address, city: r.venue_city, state: r.venue_state, postalCode: r.venue_postal_code, country: r.venue_country })
    const result = await geocodeAddress(query, { key })
    if (!result.ok) {
      failed += 1
      console.log(`  ${result.status.padEnd(14)} ${r.slug}  ${result.reason}`)
      if (result.status === 'REQUEST_DENIED' || result.status === 'OVER_QUERY_LIMIT' || result.status === 'OVER_DAILY_LIMIT') {
        console.log('  stopping: Google is refusing this key or this quota, and every further call would be refused too')
        break
      }
      continue
    }
    const { hit } = result
    const cityClaim = r.city_primary ?? resolveCityClaim(r.venue_city, hit.latitude, hit.longitude)
    if (!apply) {
      skipped += 1
      console.log(`  would write    ${r.slug}  ${hit.latitude.toFixed(5)}, ${hit.longitude.toFixed(5)}  ${hit.locationType ?? ''}  city ${cityClaim ?? 'unresolved'}`)
      continue
    }
    const patch = {
      venue_latitude: hit.latitude,
      venue_longitude: hit.longitude,
      venue_place_id: r.venue_place_id ?? hit.placeId,
      venue_geocode_source: 'geocoding' as const,
      venue_geocoded_at: new Date().toISOString(),
      ...(r.city_primary ? {} : { city_primary: cityClaim }),
    }
    const { error: writeErr } = await db.from('events').update(patch).eq('id', r.id).is('venue_latitude', null)
    if (writeErr) {
      failed += 1
      console.log(`  WRITE FAILED   ${r.slug}  ${writeErr.code} ${writeErr.message}`)
      continue
    }
    const { data: back } = await db.from('events').select('venue_latitude, venue_longitude, venue_geocode_source').eq('id', r.id).single()
    const held = back && typeof back.venue_latitude === 'number' && typeof back.venue_longitude === 'number' && back.venue_geocode_source === 'geocoding'
    if (!held) {
      failed += 1
      console.log(`  READ-BACK FAILED ${r.slug}  the row does not carry what was written`)
      continue
    }
    written += 1
    console.log(`  wrote          ${r.slug}  ${hit.latitude.toFixed(5)}, ${hit.longitude.toFixed(5)}  city ${cityClaim ?? 'unresolved'}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  console.log(`  done: ${written} written, ${skipped} planned (dry run), ${failed} failed`)
  process.exitCode = failed > 0 ? 1 : 0
}
