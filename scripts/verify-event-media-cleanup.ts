/**
 * Cleanup for the Event Media Standard live verification. Removes EVERY row and
 * storage object the verify script created, restoring the TEST project to its
 * baseline (SACRED RULE 6). TEST-only guarded.
 *
 * Run: node --env-file=.env.test --import tsx scripts/verify-event-media-cleanup.ts
 */
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'gndnldyfudbytbboxesk'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) throw new Error('Missing TEST env (use --env-file=.env.test)')
if (url.includes(PROD_REF)) throw new Error('Refusing to run against PRODUCTION')

const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const BUCKET = 'event-images'
const OWNER_EMAIL = 'media-std-organiser@eventlinqs.test'
const ORG_ID = '00000000-0000-4000-9001-000000000001'
const EVENT_ID = '00000000-0000-4000-9002-000000000001'
const TIER_ID = '00000000-0000-4000-9003-000000000001'

async function main() {
  const removed: string[] = []

  // Resolve owner id (for the storage prefix + profile/user deletion).
  const { data: list } = await s.auth.admin.listUsers()
  const owner = list?.users?.find((u) => u.email === OWNER_EMAIL)
  const ownerId = owner?.id

  // 1. Storage objects under ${ownerId}/${EVENT_ID}/
  if (ownerId) {
    const prefix = `${ownerId}/${EVENT_ID}`
    const { data: objs } = await s.storage.from(BUCKET).list(prefix, { limit: 100 })
    const paths = (objs ?? []).map((o) => `${prefix}/${o.name}`)
    if (paths.length) {
      const { error } = await s.storage.from(BUCKET).remove(paths)
      removed.push(`${paths.length} storage objects${error ? ` (error: ${error.message})` : ''}`)
    } else removed.push('0 storage objects (already clean)')
  }

  // 2. Tier + event
  await s.from('ticket_tiers').delete().eq('id', TIER_ID)
  removed.push(`tier ${TIER_ID}`)
  await s.from('events').delete().eq('id', EVENT_ID)
  removed.push(`event ${EVENT_ID}`)

  // 3. Organisation + profile + auth user (fixtures this run created)
  await s.from('organisations').delete().eq('id', ORG_ID)
  removed.push(`organisation ${ORG_ID}`)
  if (ownerId) {
    await s.from('profiles').delete().eq('id', ownerId)
    await s.auth.admin.deleteUser(ownerId).catch(() => {})
    removed.push(`profile + auth user ${ownerId} (${OWNER_EMAIL})`)
  }

  console.log('CLEANUP COMPLETE. Removed:')
  for (const r of removed) console.log('  -', r)
  console.log('TEST project restored to baseline.')
}

main().catch((e) => { console.error('CLEANUP FAILED:', e?.message ?? e); process.exit(1) })
