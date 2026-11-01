import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PREVIEW_READ_ONLY_MESSAGE, previewReadOnlyRefusal } from '@/lib/preview/read-only'

/*
 * THE DESIGN PREVIEW READS PRODUCTION AND WRITES NOTHING (the CONTROLLER's ruling of 1 November 2026, 11:42, (2)).
 * With PREVIEW_READ_ONLY=1 every server action and every POST, PUT, PATCH and DELETE answers 403 'Preview only, nothing
 * is saved' before any client is made, and so do the pages that withdraw on a plain GET (a method gate alone would
 * let them through). Remind me, the claim route and checkout are the three the ruling names.
 */
describe('the preview switch', () => {
  const on = { PREVIEW_READ_ONLY: '1' }

  it.each([
    ['POST', '/api/events/remind'],
    ['POST', '/events/some-night'], // a server action posts to its page
    ['POST', '/api/listings/claim'],
    ['POST', '/api/checkout/create'],
    ['PUT', '/api/anything'],
    ['PATCH', '/api/anything'],
    ['DELETE', '/api/anything'],
  ])('%s %s answers 403 with the preview words', async (method, path) => {
    const res = previewReadOnlyRefusal(method, path, on)
    expect(res?.status).toBe(403)
    expect(await res?.text()).toBe(PREVIEW_READ_ONLY_MESSAGE)
  })

  it.each(['/remind/stop/abc', '/unsubscribe/recovery/abc', '/unsubscribe/abc', '/waitlist/unsubscribe/abc'])(
    'a page that withdraws on GET answers 403 too: %s',
    (path) => {
      expect(previewReadOnlyRefusal('GET', path, on)?.status).toBe(403)
    },
  )

  it('reading is untouched: GET, HEAD and OPTIONS pass', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(previewReadOnlyRefusal(m, '/events/some-night', on)).toBeNull()
  })

  it('without the switch nothing is refused, so production behaves as before', () => {
    expect(previewReadOnlyRefusal('POST', '/api/checkout/create', {})).toBeNull()
    expect(previewReadOnlyRefusal('GET', '/remind/stop/abc', { PREVIEW_READ_ONLY: '0' })).toBeNull()
  })

  it('the proxy asks it before the session is touched, and marks every preview response noindex', () => {
    const src = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')
    const ask = src.indexOf('previewReadOnlyRefusal(')
    const session = src.indexOf('await updateSession(request)')
    expect(ask).toBeGreaterThan(0)
    expect(ask).toBeLessThan(session)
    expect(src).toContain("'X-Robots-Tag', 'noindex, nofollow'")
  })
})

describe('Featured on the preview', () => {
  it('skips the rights read (no service role there), so only a credited venue photo can feature', async () => {
    const { readCoverRights } = await import('@/lib/events/featured-with-recorded-rights')
    const prior = process.env.PREVIEW_READ_ONLY
    process.env.PREVIEW_READ_ONLY = '1'
    try {
      const never = { from: () => { throw new Error('the rights table was read on the preview') } }
      const rights = await readCoverRights(never as never, ['a', 'b'])
      expect(rights.size).toBe(0)
    } finally {
      if (prior === undefined) delete process.env.PREVIEW_READ_ONLY
      else process.env.PREVIEW_READ_ONLY = prior
    }
  })
})
