/**
 * THE LANE-C PROOF VISITOR: one confirmed TEST account, created once, reused.
 *
 * WHY A REAL ACCOUNT AND NOT A FAKE COOKIE. The defect this exists to prove
 * (close-out C8, 18 September 2026) is about what the SERVER renders for a
 * visitor who has a session. `el-signed-in=1` on its own is only a marker: with
 * no Supabase session behind it `auth.getUser()` returns nobody and the page
 * renders anonymously, so a drive that planted the marker and asserted the
 * anonymous header would pass against a tree with the defect still in it. A
 * drive that cannot fail is not a drive.
 *
 * WHOSE ROW THIS IS. The three-lane protocol requires every row this lane
 * creates on TEST to carry `lane-c` in its name, slug, email or reference, so it
 * is this lane's on sight and no other lane touches it. The address below does.
 *
 * TEST ONLY, AND IT CHECKS TWICE, THROUGH THE REPOSITORY'S OWN PREFLIGHT.
 *
 * The first version rolled its own "is this the TEST ref" check, and
 * `scripts/guards/no-unguarded-production-write.mjs` refused the build over it:
 * "1 write-capable script under scripts/ can reach a database and nothing in
 * them checks which one". It was right to. A second definition of "refuse
 * production" is a second thing to get subtly wrong, and this one creates users
 * with a service-role credential, which is about the worst thing to point at the
 * wrong project.
 *
 * So `assertNotProduction()` runs first, from the one module that owns that
 * decision, and the explicit TEST-ref check stays underneath it as a belt on top
 * of the braces: this module must reach ONE project and no other, which is
 * narrower than "not production".
 */
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../../lib/production-write-preflight.mjs'

assertNotProduction()

export const LANE_C_PROOF_EMAIL = 'lane-c-edge-cache-proof@eventlinqs.test'
const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'

/**
 * NO PASSWORD IS WRITTEN DOWN, ANYWHERE, AND THIS IS THE SECOND VERSION.
 *
 * The first one carried a literal here and
 * `scripts/guards/no-plaintext-credential.mjs` refused the build over it, which
 * was correct: "a credential-named identifier assigned a literal". It was a
 * TEST-only account and it had never been committed, so there was nothing to
 * rotate, but the guard cannot know that and should not have to.
 *
 * So the password does not exist between runs. One is minted here with
 * `randomBytes`, set on the account through the admin API, handed back in memory
 * for the drive to sign in with, and forgotten. Nothing to leak, nothing to
 * rotate, nothing to keep in an environment variable either.
 */
function mintPassword() {
  return `lane-c-${randomBytes(18).toString('base64url')}`
}

/**
 * Ensure the account exists, is confirmed, and carries a password only this
 * process knows. Idempotent in the sense that matters: an existing account is
 * reused rather than duplicated, and only its password is reset.
 *
 * @returns {Promise<{ id: string, email: string, password: string, created: boolean }>}
 */
export async function ensureLaneCProofUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url.includes(TEST_PROJECT_REF)) {
    throw new Error(`refusing: NEXT_PUBLIC_SUPABASE_URL is ${url || '(unset)'}, not the TEST project ${TEST_PROJECT_REF}`)
  }
  if (!serviceRole) throw new Error('refusing: no SUPABASE_SERVICE_ROLE_KEY in the environment')

  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

  // listUsers is paged; ask for this address rather than walking every page.
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw new Error(`could not list users: ${listError.message}`)
  const password = mintPassword()
  const already = existing.users.find((u) => u.email === LANE_C_PROOF_EMAIL)
  if (already) {
    const { error: resetError } = await admin.auth.admin.updateUserById(already.id, { password })
    if (resetError) throw new Error(`could not reset the proof user's password: ${resetError.message}`)
    return { id: already.id, email: LANE_C_PROOF_EMAIL, password, created: false }
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: LANE_C_PROOF_EMAIL,
    password,
    email_confirm: true,
    /*
     * NO full_name ON PURPOSE. `deriveAccountUser` falls back to the LOCAL PART
     * OF THE EMAIL when the profile carries no name, and that fallback is what
     * made the cached /events response carry an identifier at all. The proof
     * visitor is therefore the worst case rather than the tidy one.
     */
    user_metadata: { lane: 'lane-c', purpose: 'edge-cache viewer-independence proof' },
  })
  if (error) throw new Error(`could not create the proof user: ${error.message}`)
  return { id: data.user.id, email: LANE_C_PROOF_EMAIL, password, created: true }
}

/** What the header would render for this visitor: the email local part. */
export function expectedDisplayName() {
  return LANE_C_PROOF_EMAIL.split('@')[0]
}
