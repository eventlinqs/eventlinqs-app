// Counts what scripts/verify/engine-today-drive.mts left on TEST after its cleanup: node --env-file=<TEST env> scripts/verify/engine-today-drive-left.mjs <campaign> <removal>
import { createClient } from '@supabase/supabase-js'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const c = async (t, f) => { let q = db.from(t).select('id', { count: 'exact', head: true }); q = f(q); const r = await q; return r.error ? r.error.message : r.count }
console.log(JSON.stringify({
  campaign: await c('social_campaigns', (q) => q.eq('id', process.argv[2])),
  pieces: await c('social_pieces', (q) => q.eq('campaign_id', process.argv[2])),
  removal: await c('removal_requests', (q) => q.eq('id', process.argv[3])),
  reports: await c('organiser_night_reports', (q) => q),
  go_presses: await c('go_presses', (q) => q),
}))
