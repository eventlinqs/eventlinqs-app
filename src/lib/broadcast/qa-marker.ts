import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * THE QA MARKER ON COUNTED HOPS (the master mandate of 29 October 2026, sections 10, 13 and 16; the project manager's
 * 21:42 ruling R3; 20261029220001).
 *
 * The counted hops (/out, /go, /e and /s) can only be proved on production by pressing them, and a QA press must never
 * be counted as a person. A drive sends a secret in the x-eventlinqs-qa header; when its sha256 is an unexpired
 * qa_markers row the press is recorded through the real writer with is_test true, and every figure leaves it out
 * (scripts/guards/counted-rows-exclude-tests.mjs). The secret is never logged or stored, only looked up by its hash.
 *
 * Three answers:
 *   none     no header: an ordinary press, counted as it always was
 *   test     a verified QA press: recorded with is_test true
 *   refused  a header that cannot be verified (unknown, expired, malformed, or the marker unreadable): recorded as
 *            NEITHER, so a mistyped or stale secret never reaches a figure; real visitors never send the header
 */

export const QA_HEADER = 'x-eventlinqs-qa'

export type QaPress = 'none' | 'test' | 'refused'

/** A secret is 32 to 256 printable characters; anything else is refused before the database is asked. */
const SECRET_SHAPE = /^[\x21-\x7e]{32,256}$/

export function qaMarkerHash(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export async function qaPressOf(header: string | null | undefined, now: Date = new Date()): Promise<QaPress> {
  if (header === null || header === undefined || header === '') return 'none'
  if (!SECRET_SHAPE.test(header)) return 'refused'
  try {
    const { data, error } = await createAdminClient()
      .from('qa_markers')
      .select('sha256')
      .eq('sha256', qaMarkerHash(header))
      .gt('expires_at', now.toISOString())
      .limit(1)
    if (error) {
      console.warn('[qa-marker] the marker could not be read; the press is not recorded', error.message)
      return 'refused'
    }
    return (data ?? []).length === 1 ? 'test' : 'refused'
  } catch (err) {
    console.warn('[qa-marker] the marker could not be read; the press is not recorded', err instanceof Error ? err.message : String(err))
    return 'refused'
  }
}
