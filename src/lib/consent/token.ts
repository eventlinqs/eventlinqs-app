/**
 * AN UNSUBSCRIBE TOKEN THAT IS NOT A TOKEN IS NOT AN OUTAGE.
 *
 * WHAT HAPPENED, 21 September 2026, found by the route sweep in the push gate
 * rather than by a person in their inbox, which was luck rather than design:
 *
 *     http://127.0.0.1:63687/unsubscribe/zzzzzzzzzzzz: server error 500
 *     http://127.0.0.1:63687/waitlist/unsubscribe/zzzzzzzzzzzz: server error 500
 *
 * `unsubscribe_token` is a `uuid` column (migrations 20260624000002 line 40 and
 * 20260704000003 line 39). Asking Postgres for `unsubscribe_token = 'zzzzzzzzzzzz'`
 * is not a query that finds nothing, it is a query that cannot be run:
 *
 *     22P02  invalid input syntax for type uuid: "zzzzzzzzzzzz"
 *
 * Both pages read through `readOrThrow`, which exists so that a dropped socket
 * can never be reported to somebody as "this link has already been used". That
 * is right, and it is the fix commit 162c6d28 landed earlier the same day. But
 * it makes every error a throw, and a malformed token produces an error, so the
 * page that had been answering a mangled link with a sentence started answering
 * it with a 500.
 *
 * THE TWO CASES ARE NOT THE SAME CASE and this module is the line between them.
 * A read that failed is not evidence about the token, so it is raised. A value
 * that cannot be a uuid is evidence about the token, and it is conclusive: no
 * row anywhere can carry it, so the honest answer is the one the page already
 * had, and no database is consulted to produce it.
 *
 * `/artists/claim/[token]` survived the same commit untouched because it
 * already tested the shape first. `/unsubscribe/recovery/[token]` had been
 * fixed on 12 September after answering 500 on production for the same reason.
 * So this was the third and fourth occurrence of one mistake, and the first two
 * fixes were each written in one file and stayed there. It is written once now,
 * and `scripts/guards/an-unsubscribe-link-never-500s.mjs` fails the build if any
 * surface in this family reads a token column without coming through here.
 *
 * WHY A MALFORMED TOKEN IS NOT A 404. The person holding it is exercising a
 * statutory right and a mail client has mangled their link. A page that names
 * the remedy and gives them an address to write to is worth more to them than
 * an empty 404, and it discloses nothing: an unknown-but-well-formed token
 * reaches exactly the same sentence, so this cannot be used to ask whether an
 * address is on the platform.
 */

/**
 * The shape every unsubscribe token in this platform is minted in:
 * `gen_random_uuid()`, stored in a `uuid` column.
 */
export const UNSUBSCRIBE_TOKEN_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * True when `value` could be a token. False is conclusive: no row can carry it,
 * so the caller answers "not found" WITHOUT a read, and never confuses that
 * answer with a read that failed.
 */
export function isUnsubscribeToken(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  return UNSUBSCRIBE_TOKEN_SHAPE.test(value)
}
