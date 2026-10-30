import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { SHARE_COOKIE, SHARE_COOKIE_MAX_AGE_SECONDS } from '@/lib/broadcast/share-codes'
import { GO_PIECE_COOKIE, GO_PIECE_COOKIE_MAX_AGE_SECONDS } from '@/lib/growth/go-math'
import { FIRST_TOUCH_COOKIE, FIRST_TOUCH_MAX_AGE_SECONDS } from '@/lib/growth/visit-attribution'

/**
 * THE PROJECT MANAGER's 21:10 of 30 October 2026, ruling (a): a dated new version of /legal/cookies adds 'Measuring our
 * own links', naming all three first-party cookies truthfully, in the same car as el_go_piece. The names and the 30 days
 * are read from the code's own constants, so the page cannot drift from what the site does.
 */
const page = readFileSync('src/app/legal/cookies/page.tsx', 'utf8')
const THIRTY_DAYS = 30 * 24 * 60 * 60

describe('the cookie policy names the cookies that measure our own links', () => {
  test('a dated new version', () => {
    expect(page).toContain('lastUpdated="30 October 2026"')
  })
  test('the section is in the contents and on the page', () => {
    expect(page).toContain("{ id: 'measuring-our-own-links', title: 'Measuring Our Own Links' }")
    expect(page).toContain('<h2 id="measuring-our-own-links">Measuring Our Own Links</h2>')
  })
  test.each([SHARE_COOKIE, FIRST_TOUCH_COOKIE, GO_PIECE_COOKIE])('%s is named', (name) => {
    expect(page).toContain(`<code>${name}</code>`)
  })
  test('each lasts the 30 days the page says', () => {
    expect([SHARE_COOKIE_MAX_AGE_SECONDS, FIRST_TOUCH_MAX_AGE_SECONDS, GO_PIECE_COOKIE_MAX_AGE_SECONDS]).toEqual([THIRTY_DAYS, THIRTY_DAYS, THIRTY_DAYS])
    expect(page).toContain('30 days')
  })
  test('it says what they never hold or do', () => {
    expect(page).toMatch(/never a name or contact detail/)
    expect(page).toMatch(/never sold or shared with an advertiser/)
  })
})
