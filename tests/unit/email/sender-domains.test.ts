import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  DEFAULT_FROM,
  TRANSACTIONAL_FROM,
  resolveFrom,
  senderDomain,
  senderDomainsInUse,
} from '@/lib/email/send'

/**
 * Proves the platform can name every domain it sends from, so the email health
 * check can assert each one is verified at Resend.
 *
 * The incident this encodes (2026-07-26): production's `EMAIL_FROM` pointed at
 * `send.eventlinqs.com`, which was never verified at Resend. Every send through
 * `sendEmail` failed with "The send.eventlinqs.com domain is not verified",
 * INCLUDING the payment sentinel's own alert email. The sentinel detected a
 * fault and then could not tell the founder. The email health check missed it
 * because it only asked whether the API key was valid, never whether the
 * addresses we actually send from would be accepted.
 */

let backup: string | undefined

beforeEach(() => { backup = process.env.EMAIL_FROM })
afterEach(() => {
  if (backup === undefined) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = backup
})

describe('sender domain resolution', () => {
  test('extracts the domain from a "Name <user@domain>" sender', () => {
    expect(senderDomain('EventLinqs <noreply@eventlinqs.com>')).toBe('eventlinqs.com')
  })

  test('extracts the domain from a bare address', () => {
    expect(senderDomain('hello@eventlinqs.com')).toBe('eventlinqs.com')
  })

  test('treats a subdomain as its own domain, which is the whole point', () => {
    // Resend verifies send.eventlinqs.com and eventlinqs.com SEPARATELY.
    // Collapsing them to a registrable domain would have hidden this defect.
    expect(senderDomain('EventLinqs <alerts@send.eventlinqs.com>')).toBe('send.eventlinqs.com')
    expect(senderDomain('EventLinqs <alerts@send.eventlinqs.com>')).not.toBe('eventlinqs.com')
  })

  test('is case-insensitive', () => {
    expect(senderDomain('EventLinqs <Noreply@EventLinqs.COM>')).toBe('eventlinqs.com')
  })

  test('falls back to the default sender when EMAIL_FROM is unset', () => {
    delete process.env.EMAIL_FROM
    expect(resolveFrom()).toBe(DEFAULT_FROM)
  })

  test('falls back when EMAIL_FROM is PRESENT BUT BLANK, the silent-failure class', () => {
    process.env.EMAIL_FROM = '   '
    expect(resolveFrom()).toBe(DEFAULT_FROM)
  })

  test('uses EMAIL_FROM when it is set', () => {
    process.env.EMAIL_FROM = 'EventLinqs <alerts@send.eventlinqs.com>'
    expect(resolveFrom()).toBe('EventLinqs <alerts@send.eventlinqs.com>')
  })

  test('reports BOTH the configured sender domain and the hardcoded transactional one', () => {
    process.env.EMAIL_FROM = 'EventLinqs <alerts@send.eventlinqs.com>'
    const domains = senderDomainsInUse()
    expect(domains).toContain('send.eventlinqs.com')          // sendEmail path
    expect(domains).toContain('eventlinqs.com')               // ticket + refund + payout + waitlist
    expect(domains).toHaveLength(2)
  })

  test('deduplicates when both senders share one domain', () => {
    process.env.EMAIL_FROM = 'EventLinqs <hello@eventlinqs.com>'
    expect(senderDomainsInUse()).toEqual(['eventlinqs.com'])
  })

  /**
   * Reproduces the exact production configuration. If the health check is given
   * only `eventlinqs.com` as verified, `send.eventlinqs.com` must be reported
   * as unverified rather than passing.
   */
  test('the real production configuration yields an unverified domain', () => {
    process.env.EMAIL_FROM = 'EventLinqs <alerts@send.eventlinqs.com>'
    const verified = new Set(['eventlinqs.com'])
    const unverified = senderDomainsInUse().filter(d => !verified.has(d))
    expect(unverified).toEqual(['send.eventlinqs.com'])
  })

  test('repointing EMAIL_FROM at the verified domain clears it, the prepared fix', () => {
    process.env.EMAIL_FROM = 'EventLinqs <alerts@eventlinqs.com>'
    const verified = new Set(['eventlinqs.com'])
    expect(senderDomainsInUse().filter(d => !verified.has(d))).toEqual([])
  })

  /**
   * DRIFT GUARD. `TRANSACTIONAL_FROM` is a copy of a literal that lives in four
   * other files, one of which is the Stripe webhook route whose money logic must
   * not be disturbed. Asserting the constant against itself would prove nothing,
   * so this reads the real call sites: if any of them changes sender, this fails
   * and the health check stops silently asserting the wrong domain.
   */
  test('the transactional sender constant matches every hardcoded call site', () => {
    const sites = [
      'src/lib/email/order-confirmation.ts',
      'src/app/api/webhooks/stripe/route.ts',
      'src/lib/payouts/email.ts',
      'src/lib/waitlist/promote.ts',
    ]
    for (const file of sites) {
      const src = readFileSync(resolvePath(process.cwd(), file), 'utf8')
      const senders = [...src.matchAll(/from:\s*'([^']*@[^']*)'/g)].map(m => m[1])
      const constants = [...src.matchAll(/const FROM = '([^']*@[^']*)'/g)].map(m => m[1])
      const found = [...senders, ...constants]
      expect(found.length, `${file} declares no literal sender`).toBeGreaterThan(0)
      for (const f of found) {
        expect(f, `${file} sends from ${f}, which TRANSACTIONAL_FROM no longer mirrors`).toBe(TRANSACTIONAL_FROM)
      }
    }
  })
})
