/**
 * A TEARDOWN THAT CANNOT REPORT SUCCESS IT DID NOT HAVE.
 *
 * Written 19 September 2026, after the failure below, which cost a day and was
 * invisible for five.
 *
 * ============================================================================
 * WHAT HAPPENED
 * ============================================================================
 *
 * Every drive in this repository ended its teardown like this:
 *
 *     await db.auth.admin.deleteUser(userId).catch(() => {})
 *     const { data: gone } = await db.from('profiles').select('id')...
 *     check('teardown.left-as-found', !gone, '... is removed')
 *
 * The catch discards the only signal that the deletion failed, and the check
 * that follows asks about `profiles`, which the line above it has already
 * deleted. So the assertion is TRUE whether or not the account still exists,
 * and every run printed a clean tear-down.
 *
 * On 19 September AQ3's second run refused to build its fixture with "A user
 * with this email address has already been registered". EIGHTEEN lane B
 * accounts had accumulated on TEST. The cause was that `auth.admin.deleteUser`
 * had been failing for EVERY account on the platform since that morning: AQ1's
 * `decided_by ... on delete set null` issued an UPDATE into a table whose every
 * UPDATE is refused by a statement-level trigger, and a statement-level trigger
 * fires on an update of nothing. Account closure in the product was broken too.
 *
 * The foreign key is fixed (migration 20260919000130). This module exists so
 * that the next time a deletion is refused, the run that caused it says so.
 *
 * ============================================================================
 * WHY IT IS NOT SIMPLY "REPORT EVERY ERROR"
 * ============================================================================
 *
 * A teardown wants the account GONE. An account that was never created, or that
 * a previous run already removed, is gone, and a teardown that fails on that
 * would turn a working drive red for doing its job twice. So the question this
 * asks is "is it gone", not "did my call succeed".
 *
 * OBSERVED, not assumed, against TEST on 19 September 2026:
 *
 *     db.auth.admin.deleteUser('00000000-0000-4000-8000-00000000dead')
 *     -> { name: 'AuthApiError', status: 404, code: 'user_not_found',
 *          message: 'User not found' }
 *
 * That is the one error that means gone. Everything else is a refusal and is
 * reported.
 */

/**
 * Is the account gone, given what `deleteUser` answered?
 *
 * @param {{status?: number, code?: string, message?: string} | null | undefined} error
 * @returns {boolean}
 */
export function accountIsGone(error) {
  if (!error) return true
  if (error.code === 'user_not_found') return true
  if (error.status === 404) return true
  // A message match is the last resort, for a client version that stops sending
  // a code. It is deliberately narrow: anything else is a refusal.
  return typeof error.message === 'string' && /user not found/i.test(error.message)
}

/**
 * Deletes an account and says what actually happened.
 *
 * @param {{auth: {admin: {deleteUser: (id: string) => Promise<{error?: unknown}>}}}} db
 *        a supabase client holding the service role key
 * @param {string} id
 * @returns {Promise<{gone: boolean, detail: string}>}
 */
export async function tearDownAccount(db, id) {
  let error = null
  try {
    ;({ error } = await db.auth.admin.deleteUser(id))
  } catch (thrown) {
    // A throw here is a transport failure rather than a refusal, and it is
    // still not a clean tear-down. The version of this that swallowed a throw
    // is the whole reason this file exists.
    error = { message: thrown instanceof Error ? thrown.message : String(thrown) }
  }
  if (accountIsGone(error)) {
    return { gone: true, detail: `the drive account ${id} is removed` }
  }
  const message = typeof error?.message === 'string' ? error.message : JSON.stringify(error)
  return {
    gone: false,
    detail:
      `the auth account ${id} is NOT removed and the deletion was REFUSED: ${message}. ` +
      'TEST is not as this drive found it, and every later run that reuses this address will fail to create it.',
  }
}

/**
 * The form every drive calls: delete, and if the deletion was REFUSED, say so
 * loudly and make the run fail.
 *
 * WHY `process.exitCode` AND NOT A THROW, AND NOT A LOG ALONE.
 *
 *   A THROW would abandon the rest of the teardown, so one refused account
 *   would leave the organisation, the events and every other account behind as
 *   well. A teardown is the one place where finishing matters more than
 *   stopping.
 *
 *   A LOG ALONE is what the repository already had, in effect: the eighteen
 *   stuck accounts accumulated while every run printed a clean tear-down and
 *   exited 0, and nobody reads the middle of a passing log.
 *
 * Setting `process.exitCode` lets the remaining teardown run to completion and
 * still ends the process non-zero, so the run FAILS. A drive that could not
 * leave TEST as it found it has not passed, whatever its checks said.
 *
 * @param {object} db a supabase client holding the service role key
 * @param {string | null | undefined} id
 */
export async function tearDownAccountOrFailTheRun(db, id) {
  if (!id) return { gone: true, detail: 'no account id was given, so there is nothing to remove' }
  const result = await tearDownAccount(db, id)
  if (!result.gone) {
    console.error(`FAIL  teardown.account-removed  ${result.detail}`)
    process.exitCode = 1
  }
  return result
}
