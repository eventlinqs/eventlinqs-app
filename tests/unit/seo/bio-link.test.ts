import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INSTAGRAM_BIO_PATH, igForBioLink } from '@/lib/seo/bio-link'

/*
 * THE INSTAGRAM BIO'S LINK GOES TO /ig (the PM's 00:50 of 25 November 2026): the bio's own link, read live by the PM at
 * 00:48, lands on /ig with every tag kept; /state/victoria without those tags, and every other path, does not move.
 */
const BIO = 'https://www.eventlinqs.com.au/state/victoria?utm_source=instagram&utm_medium=organic_social&utm_campaign=bio&utm_content=bio'
const at = (href: string) => {
  const u = new URL(href)
  return igForBioLink(u.pathname, u.searchParams)
}

describe("the Instagram bio's link", () => {
  it('lands on /ig with every one of its tags kept', () => {
    expect(INSTAGRAM_BIO_PATH).toBe('/state/victoria')
    expect(at(BIO)).toBe('/ig?utm_source=instagram&utm_medium=organic_social&utm_campaign=bio&utm_content=bio')
    expect(at(BIO.replace('/state/victoria?', '/state/victoria/?'))).toBe('/ig?utm_source=instagram&utm_medium=organic_social&utm_campaign=bio&utm_content=bio')
  })

  it('leaves every other visit where it is', () => {
    expect(at('https://www.eventlinqs.com.au/state/victoria')).toBeNull()
    expect(at('https://www.eventlinqs.com.au/state/victoria?utm_source=instagram')).toBeNull()
    expect(at('https://www.eventlinqs.com.au/state/victoria?utm_source=facebook&utm_campaign=bio')).toBeNull()
    expect(at('https://www.eventlinqs.com.au/state/victoria?utm_source=Instagram&utm_campaign=Bio')).toBeNull()
    expect(at('https://www.eventlinqs.com.au/state/new-south-wales?utm_source=instagram&utm_campaign=bio')).toBeNull()
    expect(at('https://www.eventlinqs.com.au/city/melbourne?utm_source=instagram&utm_campaign=bio')).toBeNull()
  })

  it('is decided in the proxy before the session, with a temporary redirect, never in next.config.ts', () => {
    const proxy = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8').replace(/\r\n/g, '\n')
    const asked = proxy.indexOf('igForBioLink(request.nextUrl.pathname, request.nextUrl.searchParams)')
    expect(asked).toBeGreaterThan(-1)
    expect(asked).toBeLessThan(proxy.indexOf('await updateSession(request)'))
    expect(proxy).toContain('if (bio) return NextResponse.redirect(new URL(bio, request.nextUrl), 307)')
    expect(readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')).not.toContain('/state/victoria')
  })
})
