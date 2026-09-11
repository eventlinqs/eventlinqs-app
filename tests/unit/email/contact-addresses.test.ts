// One domain for what the platform sends from and what it invites you to
// write to (close-out UX2.4).
//
// The site is served from eventlinqs.com.au and every published contact address
// was a hand-written literal at eventlinqs.com, in about forty places across
// seven local parts. None of them derived from anything, so the two halves of
// the platform's email identity could drift apart with nothing to notice.

import { afterEach, describe, expect, test } from 'vitest'
import {
  allContactAddresses,
  contactAddress,
  contactMailto,
  getEmailFrom,
  getNoReplyFrom,
  getReplyToAddress,
  getSenderDomain,
} from '@/lib/email/sender'

const ORIGINAL = process.env.EMAIL_FROM
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = ORIGINAL
})

function domainOf(address: string): string {
  const bare = /<([^>]+)>/.exec(address)?.[1] ?? address
  return bare.trim().split('@').pop()!.toLowerCase()
}

describe('the contract that makes the domain flip one edit', () => {
  test('every published contact address is on the sending domain', () => {
    const sending = getSenderDomain()
    for (const address of allContactAddresses()) {
      expect(domainOf(address)).toBe(sending)
    }
  })

  test('and so is every sender the platform mails from', () => {
    const sending = getSenderDomain()
    for (const from of [getEmailFrom(), getNoReplyFrom(), getReplyToAddress()]) {
      expect(domainOf(from)).toBe(sending)
    }
  })

  test('changing the sending domain moves the contact addresses with it', () => {
    // This is the whole point. `EMAIL_FROM` is what production sets, and when
    // eventlinqs.com.au is verified at Resend the flip must carry the public
    // addresses too, not leave them behind on the old domain.
    process.env.EMAIL_FROM = 'EventLinqs <hello@eventlinqs.com.au>'
    expect(getSenderDomain()).toBe('eventlinqs.com.au')
    expect(contactAddress('support')).toBe('support@eventlinqs.com.au')
    expect(contactAddress('press')).toBe('press@eventlinqs.com.au')
    for (const address of allContactAddresses()) {
      expect(domainOf(address)).toBe('eventlinqs.com.au')
    }
  })
})

describe('the seven roles the platform publishes', () => {
  test('each resolves to its own local part', () => {
    expect(contactAddress('hello')).toMatch(/^hello@/)
    expect(contactAddress('support')).toMatch(/^support@/)
    expect(contactAddress('organisers')).toMatch(/^organisers@/)
    expect(contactAddress('privacy')).toMatch(/^privacy@/)
    expect(contactAddress('legal')).toMatch(/^legal@/)
    expect(contactAddress('press')).toMatch(/^press@/)
    expect(contactAddress('careers')).toMatch(/^careers@/)
  })

  test('all seven are listed, with no duplicates', () => {
    const all = allContactAddresses()
    expect(all).toHaveLength(7)
    expect(new Set(all).size).toBe(7)
  })
})

describe('mailto hrefs', () => {
  test('plain', () => {
    expect(contactMailto('hello')).toBe(`mailto:${contactAddress('hello')}`)
  })

  test('a subject is encoded, so a comma or an ampersand cannot break the link', () => {
    expect(contactMailto('press', 'Brand asset request')).toBe(
      `mailto:${contactAddress('press')}?subject=Brand%20asset%20request`,
    )
    expect(contactMailto('support', 'Refund & order #12, urgent')).toContain('%26')
  })
})
