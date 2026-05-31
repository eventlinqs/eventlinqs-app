/**
 * User suspend/reactivate - real verification against the live Supabase Auth
 * admin API (the ban mechanism is auth.users.banned_until, not a profiles
 * column). Auth operations are not transactional, so this is a
 * create -> ban -> assert -> unban -> assert -> DELETE cycle on a throwaway
 * user, with guaranteed deletion in finally (delete cascades the profile).
 *
 * Run: node scripts/verify/user-suspend-e2e.mjs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const fails = []
function assert(cond, msg, detail) {
  if (cond) console.log('  PASS:', msg)
  else { console.log('  FAIL:', msg, detail !== undefined ? `(got ${JSON.stringify(detail)})` : ''); fails.push(msg) }
}
const bannedUntil = async id => {
  const { data } = await admin.auth.admin.getUserById(id)
  return data?.user?.banned_until ?? null
}
const isFuture = ts => ts !== null && new Date(ts).getTime() > Date.now()

const email = `suspend_e2e_${Date.now().toString(36)}@test.invalid`
let userId = null

try {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: `Pw_${Math.abs(0x1234 ^ Date.now())}_aA1!`, email_confirm: true,
  })
  if (createErr) throw new Error(`createUser: ${createErr.message}`)
  userId = created.user.id
  console.log(`[fixture] created throwaway user ${userId}`)

  assert(!isFuture(await bannedUntil(userId)), 'new user is not banned')

  // Suspend (matches setUserSuspension's '876000h').
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  assert(!banErr, 'suspend (ban) call succeeded', banErr?.message)
  assert(isFuture(await bannedUntil(userId)), 'banned_until set to a future timestamp after suspend')

  // Reactivate.
  const { error: unbanErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
  assert(!unbanErr, 'reactivate (unban) call succeeded', unbanErr?.message)
  assert(!isFuture(await bannedUntil(userId)), 'banned_until cleared after reactivate')
} catch (err) {
  console.error('\nUSER SUSPEND E2E ERROR:', err.message)
  fails.push('exception: ' + err.message)
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    console.log(error ? `[cleanup] WARN delete failed: ${error.message}` : `[cleanup] deleted throwaway user ${userId}`)
  }
}

console.log(`\n${'='.repeat(60)}`)
if (fails.length === 0) console.log('USER SUSPEND E2E: ALL ASSERTIONS PASSED (live Auth admin, user deleted)')
else { console.log(`USER SUSPEND E2E: ${fails.length} FAILURE(S):`); fails.forEach(f => console.log('  -', f)) }
process.exit(fails.length === 0 ? 0 : 1)
