/**
 * The kit code: its alphabet, its length, and how to recognise one.
 *
 * ISOMORPHIC ON PURPOSE. There is no `server-only` here, and that is the whole
 * reason the module exists.
 *
 * These three things used to live in draft-store.ts, which is `server-only`
 * because it talks to Redis. bill-ref.ts needs KIT_CODE_LENGTH and isKitCode to
 * split an act's reference, and bill-ref is imported by the-bill.tsx, which is
 * a client component. That pulled a server-only module into the client bundle
 * and FAILED THE BUILD, so every preview deployment of this branch from the
 * act-link commit onward errored and the branch alias kept serving an older
 * build. Nothing about the code itself needs a server: it is an alphabet, a
 * length and a regular expression.
 *
 * draft-store.ts re-exports these so existing server-side imports are
 * unchanged.
 */

/** Unambiguous alphabet: no 0/O, no 1/l/I, so a code survives being read aloud. */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export const KIT_CODE_LENGTH = 12

const KIT_CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${KIT_CODE_LENGTH}}$`)

export function isKitCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && KIT_CODE_PATTERN.test(value)
}
