// Genre catalog verification: counts rows in the genre discovery tables on the
// LIVE linked Supabase project, and confirms the four catalog tables are
// readable by the anon (RLS-bound) client while follows is per-user only.
//
// Read-only. Writes nothing. Run:
//   node --env-file=.env.local scripts/verify-genre-catalog.mjs
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('Missing env. Run: node --env-file=.env.local scripts/verify-genre-catalog.mjs')
  process.exit(1)
}

console.log(`[genre] target: ${URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`)

const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })

const expected = { genres: 13, subgenres: 52 }
let pass = true

console.log('--- row counts (service role) ---')
for (const t of ['genres', 'subgenres', 'artists', 'event_artists', 'follows']) {
  const { count, error } = await svc.from(t).select('*', { count: 'exact', head: true })
  if (error) { pass = false; console.error(`${t}: ERROR ${error.message}`); continue }
  const exp = expected[t]
  const verdict = exp === undefined ? '' : count === exp ? ' OK' : ` EXPECTED ${exp} FAIL`
  if (exp !== undefined && count !== exp) pass = false
  console.log(`${t}: ${count}${verdict}`)
}

console.log('--- anon public read on catalog (must succeed) ---')
for (const t of ['genres', 'subgenres', 'artists', 'event_artists']) {
  const { count, error } = await anon.from(t).select('*', { count: 'exact', head: true })
  if (error) { pass = false; console.error(`anon ${t}: DENIED ${error.message}`) }
  else console.log(`anon ${t}: ok (count=${count})`)
}

console.log('--- anon follows (own-rows RLS: anon sees 0, no error) ---')
{
  const { data, error } = await anon.from('follows').select('id').limit(1)
  if (error) console.log(`anon follows: ${error.message}`)
  else console.log(`anon follows: ok, rows visible=${data?.length ?? 0}`)
}

console.log(pass ? '[genre] PASS' : '[genre] FAIL')
process.exit(pass ? 0 : 1)
