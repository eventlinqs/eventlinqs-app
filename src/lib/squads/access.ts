/**
 * The squad authorisation gate. ONE function for both squad actions, because they
 * had the same bug twice and a shared gate cannot drift between them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT LIVES HERE AND NOT BESIDE THE ACTIONS THAT USE IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It was exported from src/app/actions/squad-checkout.ts, which carries
 * `'use server'`. Every export of a `'use server'` module is compiled into a
 * publicly reachable HTTP endpoint, so the directive permits async functions only.
 * A synchronous export is a hard build error:
 *
 *     ./src/app/actions/squad-checkout.ts:35:17
 *     Error: Server Actions must be async functions.
 *
 * That error is invisible to typecheck, to eslint and to the unit tests: all three
 * were green while `next build` could not complete. Moving the pure function into a
 * plain module fixes it properly, rather than by marking a synchronous
 * authorisation predicate `async` to satisfy a compiler, which would have hidden
 * the reason and left every caller awaiting a boolean.
 *
 * Being pure and outside the action file also makes it exhaustively testable
 * without a request, which is what tests/unit/security/squad-guest-authz.test.ts
 * relies on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT IT REPLACED (IDOR-02), kept here because the reasoning is the value
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Both squad actions gated with:
 *
 *     if (member.user_id && member.user_id !== user?.id) return Unauthorised
 *
 * and a comment claiming "OR guest (user_id null) with email match". No email match
 * was ever performed. For a GUEST row `user_id IS NULL`, so the condition
 * short-circuited and the check passed for ANY caller, including an anonymous one.
 */

/** The shape both squad actions need in order to authorise a caller. */
export type SquadAccessRow = {
  user_id: string | null
  squad: { share_token?: string | null } | { share_token?: string | null }[] | null
}

/**
 * May this caller act on this squad membership?
 *
 * Two legitimate callers:
 *   - the SIGNED-IN member: `member.user_id === user.id`
 *   - a GUEST member (`user_id IS NULL`) who presents the squad share token
 *
 * A constant-time compare is not warranted: the token is a high-entropy value
 * fetched in one round trip, and the surrounding database call dominates timing.
 */
export function assertSquadAccess(
  member: SquadAccessRow,
  userId: string | undefined,
  squadToken: string | undefined,
): boolean {
  const squad = Array.isArray(member.squad) ? member.squad[0] : member.squad
  const shareToken = squad?.share_token ?? null

  if (member.user_id) {
    // Claimed membership: only its owner, and never on a token alone.
    return !!userId && member.user_id === userId
  }

  // Guest membership: the share token IS the credential.
  return !!squadToken && !!shareToken && squadToken === shareToken
}
