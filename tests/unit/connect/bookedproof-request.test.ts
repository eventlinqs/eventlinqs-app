import { describe, expect, test } from 'vitest'
import { parseOrganiserReadRequest, slugOfPage } from '@/lib/connect/bookedproof/request'

/** E51, the request body (the contract's sections 3 and 9). */

const parse = (body: unknown) => parseOrganiserReadRequest(typeof body === 'string' ? body : JSON.stringify(body))
const emails = (n: number) => Array.from({ length: n }, (_, i) => `organiser${i}@example.com`)

describe('emails', () => {
  test('one to a hundred, trimmed, lower-cased, duplicates collapsed in the order asked', () => {
    const r = parse({ emails: [' B@Example.com', 'a@example.com', 'b@example.com'], pages: [], since: null })
    expect(r).toEqual({ ok: true, value: { emails: ['b@example.com', 'a@example.com'], pages: [], since: null } })
    expect(parse({ emails: emails(100) }).ok).toBe(true)
  })

  test('none, a hundred and one, or no array is refused with the reason', () => {
    for (const body of [{ emails: [] }, { emails: emails(101) }, { emails: 'a@example.com' }, {}]) {
      const r = parse(body)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/emails must be an array of 1 to 100/)
    }
  })

  test('a value that is not an address is refused, and so is one carrying a LIKE wildcard', () => {
    for (const bad of ['not-an-address', 'a@b', '%@gmail.com', 'a b@example.com', 7]) {
      expect(parse({ emails: [bad] }).ok).toBe(false)
    }
  })
})

describe('pages', () => {
  test('a public listing address gives its slug; anything else is refused', () => {
    expect(slugOfPage('https://www.eventlinqs.com.au/events/geelong-jazz-night')).toBe('geelong-jazz-night')
    expect(slugOfPage('https://www.eventlinqs.com.au/events/geelong-jazz-night/')).toBe('geelong-jazz-night')
    expect(slugOfPage('http://www.eventlinqs.com.au/events/geelong-jazz-night')).toBeNull()
    expect(slugOfPage('https://www.eventlinqs.com.au/organisers/geelong')).toBeNull()
    expect(slugOfPage('https://www.eventlinqs.com.au/events/a/b')).toBeNull()
    expect(slugOfPage('https://www.eventlinqs.com.au/events/Has_Caps')).toBeNull()
    expect(slugOfPage('not a url')).toBeNull()
  })

  test('kept as sent, in the order sent; more than fifty is refused', () => {
    const page = 'https://www.eventlinqs.com.au/events/geelong-jazz-night'
    const r = parse({ emails: ['a@example.com'], pages: [page] })
    expect(r.ok && r.value.pages).toEqual([{ page, slug: 'geelong-jazz-night' }])
    const many = Array.from({ length: 51 }, (_, i) => `https://www.eventlinqs.com.au/events/e-${i}`)
    expect(parse({ emails: ['a@example.com'], pages: many }).ok).toBe(false)
    expect(parse({ emails: ['a@example.com'], pages: ['https://example.com/x'] }).ok).toBe(false)
  })
})

describe('since and the body itself', () => {
  test('an ISO moment or null', () => {
    const r = parse({ emails: ['a@example.com'], since: '2026-10-20T00:00:00Z' })
    expect(r.ok && r.value.since?.toISOString()).toBe('2026-10-20T00:00:00.000Z')
    expect(parse({ emails: ['a@example.com'], since: 'last week' }).ok).toBe(false)
    expect(parse({ emails: ['a@example.com'], since: 1792738800 }).ok).toBe(false)
  })

  test('a body that is not JSON, not an object, or carries an unknown field is refused', () => {
    expect(parse('{"emails": [')).toEqual({ ok: false, reason: 'the body is not JSON' })
    expect(parse('["a@example.com"]')).toEqual({ ok: false, reason: 'the body is not an object' })
    expect(parse({ emails: ['a@example.com'], buyers: true })).toEqual({ ok: false, reason: 'unknown field(s): buyers' })
  })
})
