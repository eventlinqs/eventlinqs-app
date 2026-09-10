import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isTransientPoolError } from '@/lib/supabase/build-retry'

/**
 * A PAGE MAY NEVER ANSWER "THIS DOES NOT EXIST" BECAUSE IT COULD NOT ASK.
 * Close-out UX6, 10 September 2026. Third occurrence of one class.
 *
 * The gate's indexing drive reported `/organisers/kit-presents-029298` in the
 * sitemap and answering 404. The organisation is real and active with a
 * published event still to come, and the same URL answers 200 on the next
 * request. The server log carries the cause twice on the one request, once for
 * the metadata and once for the render:
 *
 *     TypeError: fetch failed
 *     Caused by: SocketError: other side closed (UND_ERR_SOCKET)
 *
 * A stale pooled socket. The read did not come back empty, it did not come back
 * at all, and the page turned that into `notFound()`. To a crawler following our
 * own sitemap that is not "try again later", it is "delete this from the index",
 * and the SEO engine the growth plan runs on is made of these pages.
 *
 * It is the third occurrence because the same file's own header records the
 * first ("a discarded error ... turned a permission problem into a silent 404 on
 * every organiser profile") and the fix then was to make the error VISIBLE. It
 * still answered 404. Making an error visible and making it honest are different
 * jobs.
 *
 * These tests hold the distinction where it is now made, and hold that the
 * shared retry primitive still recognises the socket class that caused it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the shared retry primitive recognises a dropped socket', () => {
  it('matches the exact shape the gate caught', () => {
    expect(
      isTransientPoolError({
        message: 'TypeError: fetch failed',
        details: 'Caused by: SocketError: other side closed (UND_ERR_SOCKET)',
      }),
    ).toBe(true)
  })

  it('matches a reset and a timeout, which are the same story', () => {
    expect(isTransientPoolError({ message: 'ECONNRESET' })).toBe(true)
    expect(isTransientPoolError({ message: 'ETIMEDOUT' })).toBe(true)
  })

  it('does NOT match a real query fault, so a genuine error is never retried away', () => {
    expect(isTransientPoolError({ code: '42501', message: 'permission denied for table organisations' })).toBe(false)
    expect(isTransientPoolError({ code: 'PGRST116', message: 'no rows returned' })).toBe(false)
    expect(isTransientPoolError(null)).toBe(false)
  })
})

describe('the organiser profile separates "not there" from "could not ask"', () => {
  const source = read('src/app/organisers/[handle]/page.tsx')

  it('retries the read through the shared primitive rather than a new one', () => {
    expect(source).toContain("from '@/lib/supabase/build-retry'")
    // both reads: the status gate and the public-column read
    expect(source.match(/withBuildRetry\(/g) ?? []).toHaveLength(2)
  })

  it('throws when a read fails, so the answer is a 500 and not a 404', () => {
    expect(source).toContain('class OrganiserReadFailed')
    expect(source.match(/throw new OrganiserReadFailed\(/g) ?? []).toHaveLength(2)
  })

  it('still answers 404 for an organisation that is genuinely absent or inactive', () => {
    // The truth is still the truth: no row, or not active, returns null and the
    // caller 404s. The fix must not have turned every miss into a 500.
    expect(source).toContain("if (!row || row.status !== 'active') return null")
    expect(source).toContain('if (!organisation) notFound()')
  })
})

describe('the squad payment page makes the same distinction', () => {
  const source = read('src/app/squad/[token]/pay/[member_id]/page.tsx')

  it('no longer folds a read error into notFound', () => {
    expect(source).not.toContain('if (error || !member) notFound()')
  })

  it('treats PGRST116, and only PGRST116, as "there is no such member"', () => {
    expect(source).toContain("error.code !== 'PGRST116'")
    expect(source).toContain('if (!member) notFound()')
  })
})
