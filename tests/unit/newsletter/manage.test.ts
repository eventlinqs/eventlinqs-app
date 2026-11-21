import { describe, expect, it, vi, beforeEach } from 'vitest'

/*
 * MANAGE THE NEWSLETTER BY THE READER'S OWN TOKEN (/newsletter/city; the PM's order of 21 November 2026, about 03:30).
 * The reader is named by the token their unsubscribe link carries; a malformed token is answered without a read (the
 * column is a uuid); a city change is one press, written through the one consent writer with the sentence the button
 * stood under, rate limited, and every outcome goes back to the page.
 */
const TOKEN = '0c3f5b8e-2d41-4a7b-9e10-5f6a7b8c9d0e'
const row = vi.fn()
const reads: string[] = []
const admin = {
  from: (table: string) => ({
    select: () => ({
      eq: (col: string, value: string) => ({
        maybeSingle: async () => {
          reads.push(`${table}.${col}=${value}`)
          return row()
        },
      }),
    }),
  }),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
const recordPlatformDigestConsent = vi.fn(async () => true)
vi.mock('@/lib/consent/record', () => ({ recordPlatformDigestConsent: (...a: unknown[]) => recordPlatformDigestConsent(...(a as [])) }))
const limited = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/redis/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => limited(...(a as [])) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }) }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))
class Redirected extends Error {
  constructor(public to: string) {
    super(`redirect ${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
}))

const { readNewsletterSubscriber, maskEmail, newsletterCity, NEWSLETTER_CITIES, newsletterShareUrl } = await import('@/lib/newsletter/manage')
const { changeNewsletterCityAction } = await import('@/app/newsletter/city/actions')

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
async function press(fields: Record<string, string>): Promise<string> {
  try {
    await changeNewsletterCityAction(form(fields))
  } catch (e) {
    if (e instanceof Redirected) return e.to
    throw e
  }
  throw new Error('the action did not answer with a redirect')
}

beforeEach(() => {
  row.mockReset()
  reads.length = 0
  recordPlatformDigestConsent.mockClear()
  recordPlatformDigestConsent.mockResolvedValue(true)
  limited.mockResolvedValue({ ok: true })
  revalidatePath.mockClear()
})

describe('readNewsletterSubscriber', () => {
  it('a malformed token names no one, and nothing is read', async () => {
    expect(await readNewsletterSubscriber(admin as never, 'zzzzzzzzzzzz')).toBeNull()
    expect(await readNewsletterSubscriber(admin as never, null)).toBeNull()
    expect(reads).toEqual([])
  })

  it('a token reads its one row by the unsubscribe token', async () => {
    row.mockReturnValue({ data: { email: 'reader@example.com', city_slug: 'geelong', status: 'granted' }, error: null })
    expect(await readNewsletterSubscriber(admin as never, TOKEN)).toEqual({ email: 'reader@example.com', citySlug: 'geelong', subscribed: true })
    expect(reads).toEqual([`marketing_consents.unsubscribe_token=${TOKEN}`])
  })

  it('a failed read throws, never "no such reader"', async () => {
    row.mockReturnValue({ data: null, error: { message: 'socket hang up' } })
    await expect(readNewsletterSubscriber(admin as never, TOKEN)).rejects.toThrow()
  })
})

describe('the small rules', () => {
  it('masks the address, keeps the four cities, and shares the newsletter page with its source', () => {
    expect(maskEmail('reader@example.com')).toBe('r***@example.com')
    expect(NEWSLETTER_CITIES.map((c) => c.slug)).toEqual(['melbourne', 'geelong', 'ballarat', 'bendigo'])
    expect(newsletterCity('sydney')).toBeNull()
    expect(newsletterShareUrl('https://www.eventlinqs.com.au')).toBe('https://www.eventlinqs.com.au/newsletter?utm_source=friend&utm_medium=share&utm_campaign=newsletter_refer')
  })
})

describe('changeNewsletterCityAction', () => {
  it("moves a subscriber's city in one press, written with the sentence the button stood under", async () => {
    row.mockReturnValue({ data: { email: 'reader@example.com', city_slug: 'melbourne', status: 'granted' }, error: null })
    expect(await press({ t: TOKEN, city: 'geelong' })).toBe(`/newsletter/city?t=${TOKEN}&saved=geelong`)
    expect(recordPlatformDigestConsent).toHaveBeenCalledTimes(1)
    expect((recordPlatformDigestConsent.mock.calls[0] as unknown[])[1]).toMatchObject({
      email: 'reader@example.com',
      citySlug: 'geelong',
      consentText: "Get Geelong's best events weekly. One email a week, the events worth your time.",
      consentVersion: 'v1',
      reference: '203.0.113.9',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/newsletter/city')
  })

  it('refuses a malformed token, a city with no edition, a busy network and a reader who left, writing nothing', async () => {
    expect(await press({ t: 'nope', city: 'geelong' })).toBe('/newsletter/city?error=link')
    expect(await press({ t: TOKEN, city: 'sydney' })).toBe(`/newsletter/city?t=${TOKEN}&error=city`)
    limited.mockResolvedValueOnce({ ok: false })
    expect(await press({ t: TOKEN, city: 'geelong' })).toBe(`/newsletter/city?t=${TOKEN}&error=busy`)
    row.mockReturnValue({ data: { email: 'reader@example.com', city_slug: 'melbourne', status: 'withdrawn' }, error: null })
    expect(await press({ t: TOKEN, city: 'geelong' })).toBe(`/newsletter/city?t=${TOKEN}&error=unsubscribed`)
    row.mockReturnValue({ data: null, error: null })
    expect(await press({ t: TOKEN, city: 'geelong' })).toBe('/newsletter/city?error=link')
    expect(recordPlatformDigestConsent).not.toHaveBeenCalled()
  })

  it('the same city writes nothing again; a failed write says so and changes nothing', async () => {
    row.mockReturnValue({ data: { email: 'reader@example.com', city_slug: 'geelong', status: 'granted' }, error: null })
    expect(await press({ t: TOKEN, city: 'geelong' })).toBe(`/newsletter/city?t=${TOKEN}&saved=geelong`)
    expect(recordPlatformDigestConsent).not.toHaveBeenCalled()
    row.mockReturnValue({ data: { email: 'reader@example.com', city_slug: 'melbourne', status: 'granted' }, error: null })
    recordPlatformDigestConsent.mockResolvedValueOnce(false)
    expect(await press({ t: TOKEN, city: 'bendigo' })).toBe(`/newsletter/city?t=${TOKEN}&error=save`)
  })

  it('a failed read goes back to the page saying so', async () => {
    row.mockReturnValue({ data: null, error: { message: 'socket hang up' } })
    expect(await press({ t: TOKEN, city: 'geelong' })).toBe(`/newsletter/city?t=${TOKEN}&error=read`)
  })
})
