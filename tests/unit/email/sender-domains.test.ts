import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  resolveFrom,
  senderDomain,
  senderDomainsInUse,
} from '@/lib/email/send'
import { getEmailFrom, getNoReplyFrom } from '@/lib/email/sender'

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
 *
 * WHAT CHANGED ON 2026-08-05, and why these assertions moved. This file used to
 * import two sender CONSTANTS from send.ts, `DEFAULT_FROM` and
 * `TRANSACTIONAL_FROM`. The second was documented as a deliberate MIRROR of a
 * literal that lived in four other call sites, because the branch that added it
 * would not touch the Stripe webhook to remove the original. The auth-hardening
 * branch then made those call sites derive from one module,
 * src/lib/email/sender.ts, and fails the build on any sender literal outside
 * it, so there is no longer a literal for a mirror to mirror.
 *
 * Every property this file asserted is kept. Two are now asserted in a stronger
 * form, and both are marked where they appear:
 *
 *   the drift guard      was "the four call sites hold a literal equal to the
 *                        mirror". Now "the four call sites hold NO literal and
 *                        read the single source", which is what the mirror was
 *                        an approximation of.
 *   the domain inventory was "report both the configured domain and the
 *                        hardcoded one, expect 2". Divergence between those two
 *                        is now structurally impossible, so the assertion is
 *                        that they move TOGETHER and the inventory is 1.
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
    // resolveFrom() no longer decides: it delegates to the one sender module.
    expect(resolveFrom()).toBe(getEmailFrom())
    expect(senderDomain(resolveFrom())).toBe('eventlinqs.com')
  })

  test('falls back when EMAIL_FROM is PRESENT BUT BLANK, the silent-failure class', () => {
    process.env.EMAIL_FROM = '   '
    expect(senderDomain(resolveFrom())).toBe('eventlinqs.com')
    expect(resolveFrom()).toBe(getEmailFrom())
  })

  test('uses EMAIL_FROM when it is set', () => {
    process.env.EMAIL_FROM = 'EventLinqs <alerts@send.eventlinqs.com>'
    expect(resolveFrom()).toBe('EventLinqs <alerts@send.eventlinqs.com>')
  })

  /**
   * STRONGER FORM of "reports BOTH the configured domain and the hardcoded
   * transactional one". That test asserted the two could differ and demanded
   * both be named, which was correct while the transactional sender was a
   * literal that ignored EMAIL_FROM. Both roles now derive from one module, so
   * a split is not something to inventory, it is something that cannot happen.
   * Asserting it cannot happen is the same guarantee earlier in the chain.
   */
  test('the configured and transactional senders move together, so no split can exist', () => {
    process.env.EMAIL_FROM = 'EventLinqs <alerts@send.eventlinqs.com>'
    expect(senderDomain(getEmailFrom())).toBe('send.eventlinqs.com')
    expect(senderDomain(getNoReplyFrom())).toBe('send.eventlinqs.com')
    // Both roles are still READ, so a future second identity would show up here.
    expect(senderDomainsInUse()).toEqual(['send.eventlinqs.com'])
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
   * DRIFT GUARD, stronger form.
   *
   * It used to assert that four call sites each held a literal sender EQUAL to
   * the `TRANSACTIONAL_FROM` mirror, so the health check could not silently
   * assert a domain the call sites had stopped using. The call sites no longer
   * hold a literal, so the thing being mirrored is gone and the mirror with it.
   *
   * The guarantee is kept by asserting the property that replaced it: each site
   * names NO address of its own and reads the single source. That closes the
   * same gap at the root rather than by comparison, and it is the same shape as
   * the R2 destination test in tests/unit/env-store-exposure.test.ts.
   *
   * This is not made redundant by scripts/guards/sender-single-source.mjs. That
   * guard proves a literal is ABSENT across all of src. This proves these four
   * specific money-and-ticket senders are PRESENT and wired to the one module:
   * a call site that quietly stopped sending, or that built its sender from
   * some third variable, would pass the guard and fail here.
   */
  test('every transactional call site reads the single source and names no address', () => {
    const sites = [
      'src/lib/email/order-confirmation.ts',
      'src/app/api/webhooks/stripe/route.ts',
      'src/lib/payouts/email.ts',
      'src/lib/waitlist/promote.ts',
    ]
    for (const file of sites) {
      const src = readFileSync(resolvePath(process.cwd(), file), 'utf8')

      expect(src, `${file} no longer imports the single sender source`)
        .toMatch(/from '@\/lib\/email\/sender'/)
      expect(src, `${file} imports the sender module but never calls it`)
        .toMatch(/getNoReplyFrom\(\)/)

      const literals = [
        ...[...src.matchAll(/\b(?:from|replyTo):\s*'([^']*@[^']*)'/g)].map(m => m[1]),
        ...[...src.matchAll(/const\s+[A-Z_]*FROM[A-Z_]*\s*=\s*'([^']*@[^']*)'/g)].map(m => m[1]),
      ]
      expect(literals, `${file} has gone back to a literal sender: ${literals.join(', ')}`)
        .toEqual([])
    }
  })
})
