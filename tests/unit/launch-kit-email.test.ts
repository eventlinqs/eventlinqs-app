import { describe, expect, it } from 'vitest'
import { buildKitEmail, isPlausibleEmail } from '@/lib/launch/kit-email'

/**
 * "Send this kit to myself" is the only unauthenticated surface on the
 * composer that sends real mail from our verified domain, so the things worth
 * testing are the injection surface and the address gate, not the wording.
 */

describe('the address gate', () => {
  it.each([
    'someone@example.com',
    'first.last@sub.example.com.au',
    'a_b+tag@example.io',
  ])('accepts %s', value => {
    expect(isPlausibleEmail(value)).toBe(true)
  })

  it.each([
    '',
    'nope',
    'no@domain',
    'two@@at.com',
    'spaces in@example.com',
    'trailing@example.com ready to inject',
  ])('refuses %j', value => {
    expect(isPlausibleEmail(value)).toBe(false)
  })

  it('refuses an address long enough to be an attack rather than a mailbox', () => {
    expect(isPlausibleEmail(`${'a'.repeat(250)}@example.com`)).toBe(false)
  })
})

describe('the body cannot be injected through the event title', () => {
  const hostile = '<img src=x onerror="alert(1)"> & "quoted" \'single\''

  it('escapes markup from the title in the HTML part', () => {
    const { html } = buildKitEmail({ title: hostile, url: 'https://example.com/launch/k/abcdefghjkmn' })

    // The raw tag must not survive into the markup.
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('onerror="alert(1)"')
    expect(html).toContain('&lt;img src=x')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;quoted&quot;')
  })

  it('escapes the url as an attribute value', () => {
    const { html } = buildKitEmail({
      title: 'Fine',
      url: 'https://example.com/launch/k/abc"><script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('leaves the plain-text part unescaped, because text is not markup', () => {
    const { text } = buildKitEmail({ title: hostile, url: 'https://example.com/k' })
    expect(text).toContain(hostile)
  })

  it('names the organiser event in the subject rather than the platform', () => {
    const { subject } = buildKitEmail({ title: "Ruby's 16th", url: 'https://example.com/k' })
    expect(subject).toBe("Your kit for Ruby's 16th")
  })
})
