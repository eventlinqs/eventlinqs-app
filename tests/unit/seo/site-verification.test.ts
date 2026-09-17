import { describe, it, expect, vi } from 'vitest'
import {
  SITE_VERIFICATION_ENV,
  GOOGLE_VERIFICATION_META,
  TOKEN_MIN_LENGTH,
  readVerificationToken,
  siteVerificationMetadata,
} from '@/lib/seo/site-verification'

/**
 * CLOSE-OUT SEO2 STEP 2. The platform has never told Google who owns it, so
 * nobody has ever been able to read what Google thinks of it.
 *
 * The thing worth testing here is not "does it emit a tag". It is that the two
 * ways this can go wrong are both loud: a value that would break the HTML must
 * never reach the page, and a value pasted in the form a human actually holds
 * (the whole element, copied out of Search Console) must not be refused for
 * being convenient.
 */

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd'

describe('readVerificationToken', () => {
  it('takes a bare token unchanged', () => {
    expect(readVerificationToken(TOKEN)).toEqual({ token: TOKEN, reason: null })
  })

  it('takes the whole meta element Search Console shows, because that is what is on the clipboard', () => {
    const pasted = `<meta name="${GOOGLE_VERIFICATION_META}" content="${TOKEN}" />`
    expect(readVerificationToken(pasted).token).toBe(TOKEN)
  })

  it('takes the DNS TXT form as well, since the two are minted in the same sitting', () => {
    expect(readVerificationToken(`${GOOGLE_VERIFICATION_META}=${TOKEN}`).token).toBe(TOKEN)
  })

  it('refuses a meta element that names a different search engine', () => {
    const bing = `<meta name="msvalidate.01" content="${TOKEN}" />`
    const { token, reason } = readVerificationToken(bing)
    expect(token).toBeNull()
    expect(reason).toContain(GOOGLE_VERIFICATION_META)
  })

  it('refuses anything that would escape the attribute', () => {
    for (const bad of [`${TOKEN}" onload="x`, `${TOKEN} ${TOKEN}`, `${TOKEN}<script>`]) {
      const { token, reason } = readVerificationToken(bad)
      expect(token).toBeNull()
      expect(reason).toContain('HTML attribute')
    }
  })

  it('refuses a value too short to be a token, naming the bound rather than a shape nobody published', () => {
    const { token, reason } = readVerificationToken('abc')
    expect(token).toBeNull()
    expect(reason).toContain(String(TOKEN_MIN_LENGTH))
  })

  it('treats absence as absence, with no reason to report', () => {
    expect(readVerificationToken(undefined)).toEqual({ token: null, reason: null })
    expect(readVerificationToken('   ')).toEqual({ token: null, reason: null })
  })
})

describe('siteVerificationMetadata', () => {
  it('emits no verification key at all when nothing is configured', () => {
    expect(siteVerificationMetadata({})).toEqual({})
  })

  it('emits the google key when a usable token is configured', () => {
    expect(siteVerificationMetadata({ [SITE_VERIFICATION_ENV]: TOKEN })).toEqual({ verification: { google: TOKEN } })
  })

  it('says so out loud when a value is set and unusable, and emits nothing', () => {
    const log = vi.fn()
    const out = siteVerificationMetadata({ [SITE_VERIFICATION_ENV]: 'no' }, log)
    expect(out).toEqual({})
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain(SITE_VERIFICATION_ENV)
    // A configured-and-broken token means somebody BELIEVES the property is
    // verified. Silence there is worse than silence over an absent one.
    expect(log.mock.calls[0][0]).toContain('unusable')
  })

  it('stays silent when nothing is configured, because an unverified property is not a fault', () => {
    const log = vi.fn()
    siteVerificationMetadata({}, log)
    expect(log).not.toHaveBeenCalled()
  })
})
