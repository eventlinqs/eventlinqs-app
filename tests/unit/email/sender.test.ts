import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { getEmailFrom, getNoReplyFrom, getReplyToAddress, getSenderDomain } from '@/lib/email/sender'

/**
 * Founder ruling 2026-08-03: the platform sends from `eventlinqs.com`, which is
 * already verified end to end in Resend. `eventlinqs.com.au` has no Resend DNS
 * at all, so moving the sender there days out from launch would restart sender
 * reputation from zero.
 *
 * These tests lock the ruling AND the single-source property: change the
 * domain in one place and every address follows, which is the whole point of
 * the module. Before this, the address was a literal in five separate files.
 */

const original = process.env.EMAIL_FROM

beforeEach(() => {
  delete process.env.EMAIL_FROM
})

afterEach(() => {
  if (original === undefined) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = original
})

describe('the founder ruling', () => {
  test('the default sending domain is eventlinqs.com', () => {
    expect(getSenderDomain()).toBe('eventlinqs.com')
  })

  test('the defaults are the Resend-verified identities', () => {
    expect(getEmailFrom()).toBe('EventLinqs <hello@eventlinqs.com>')
    expect(getNoReplyFrom()).toBe('EventLinqs <noreply@eventlinqs.com>')
    expect(getReplyToAddress()).toBe('hello@eventlinqs.com')
  })
})

describe('single source', () => {
  test('setting EMAIL_FROM moves EVERY address, not just the one it names', () => {
    // This is the property that makes a future domain move a one-line change.
    process.env.EMAIL_FROM = 'EventLinqs <hello@eventlinqs.com.au>'
    expect(getSenderDomain()).toBe('eventlinqs.com.au')
    expect(getEmailFrom()).toBe('EventLinqs <hello@eventlinqs.com.au>')
    expect(getNoReplyFrom()).toBe('EventLinqs <noreply@eventlinqs.com.au>')
    expect(getReplyToAddress()).toBe('hello@eventlinqs.com.au')
  })

  test('an explicit EMAIL_FROM is honoured verbatim, display name and all', () => {
    process.env.EMAIL_FROM = 'EventLinqs Tickets <tickets@eventlinqs.com>'
    expect(getEmailFrom()).toBe('EventLinqs Tickets <tickets@eventlinqs.com>')
    // The other roles still derive from its domain.
    expect(getNoReplyFrom()).toBe('EventLinqs <noreply@eventlinqs.com>')
  })

  test('a bare address with no display name still yields the domain', () => {
    process.env.EMAIL_FROM = 'hello@sub.eventlinqs.com'
    expect(getSenderDomain()).toBe('sub.eventlinqs.com')
    expect(getNoReplyFrom()).toBe('EventLinqs <noreply@sub.eventlinqs.com>')
  })

  test('a malformed EMAIL_FROM falls back to the verified default rather than sending nowhere', () => {
    for (const bad of ['', 'not-an-address', 'EventLinqs <>', '@eventlinqs.com', 'a@b']) {
      process.env.EMAIL_FROM = bad
      expect(getSenderDomain()).toBe('eventlinqs.com')
      expect(getEmailFrom()).toBe('EventLinqs <hello@eventlinqs.com>')
    }
  })

  test('the value is read at call time so a cold start picks up an env change', () => {
    process.env.EMAIL_FROM = 'EventLinqs <hello@first.example>'
    expect(getSenderDomain()).toBe('first.example')
    process.env.EMAIL_FROM = 'EventLinqs <hello@second.example>'
    expect(getSenderDomain()).toBe('second.example')
  })
})

describe('no banned punctuation in a sender identity', () => {
  test('the display name is plain', () => {
    for (const v of [getEmailFrom(), getNoReplyFrom(), getReplyToAddress()]) {
      expect(v).not.toMatch(/[–—!]/)
    }
  })
})
