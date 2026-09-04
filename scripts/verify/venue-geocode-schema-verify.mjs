/**
 * PROVE MIGRATION 20260904000001 (venue geocode provenance) ON TEST, BY
 * QUERYING THE RESULT RATHER THAN TRUSTING THE PUSH.
 *
 *   1. events.venue_geocode_source and events.venue_geocoded_at read back.
 *   2. The CHECK refuses a value outside places / geocoding / manual (23514),
 *      tried on a seed event and rolled back by the refusal itself.
 *   3. A lawful value writes and reads back, then is restored to what it was.
 *
 * Refuses PRODUCTION before it does anything (assertNotProduction).
 * Usage:  node --env-file=.env.local scripts/verify/venue-geocode-schema-verify.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !service) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).')
  process.exit(1)
}
const db = createClient(url, service, { auth: { persistSession: false } })
let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed += 1
}

const { data: row, error: readErr } = await db
  .from('events')
  .select('id, venue_geocode_source, venue_geocoded_at, venue_latitude')
  .limit(1)
  .maybeSingle()
check('events.venue_geocode_source and venue_geocoded_at read back', !readErr && row !== null, readErr ? `${readErr.code} ${readErr.message}` : `event ${row?.id}`)

if (row) {
  const { error: badErr } = await db.from('events').update({ venue_geocode_source: 'bogus' }).eq('id', row.id)
  check('the CHECK refuses a source outside the three', badErr?.code === '23514', badErr ? `${badErr.code}` : 'accepted, which is wrong')

  const { error: goodErr } = await db.from('events').update({ venue_geocode_source: 'manual', venue_geocoded_at: new Date().toISOString() }).eq('id', row.id)
  const { data: after } = await db.from('events').select('venue_geocode_source, venue_geocoded_at').eq('id', row.id).single()
  check('a lawful source writes and reads back', !goodErr && after?.venue_geocode_source === 'manual' && Boolean(after?.venue_geocoded_at), goodErr ? goodErr.message : '')
  const { error: restoreErr } = await db.from('events').update({ venue_geocode_source: row.venue_geocode_source, venue_geocoded_at: row.venue_geocoded_at }).eq('id', row.id)
  check('the seed event is restored to what it was', !restoreErr, restoreErr ? restoreErr.message : '')
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`} on ${url}`)
process.exit(failed === 0 ? 0 : 1)
