import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveMailTransport, mailTransportReady } from '@/lib/email/transport-ready'

/**
 * THE REGRESSION THIS FILE EXISTS FOR, found 29 August 2026.
 *
 * Four senders each carried their own `if (!process.env.RESEND_API_KEY) return`.
 * A silent return, placed ABOVE every transport. Two consequences:
 *
 *   the buyer's ticket email could not be observed locally, so it had never
 *   once been proven end to end;
 *
 *   and on a deployment with the key missing or blank, every buyer's ticket,
 *   every refund notice and every payout notice was dropped without a single
 *   line in any log.
 *
 * These tests pin both halves: the console transport counts as a working
 * transport, and a deployment that cannot send says so.
 */
describe('mail transport readiness', () => {
  const saved = { key: process.env.RESEND_API_KEY, transport: process.env.EMAIL_TRANSPORT }

  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_TRANSPORT
  })

  afterEach(() => {
    if (saved.key === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = saved.key
    if (saved.transport === undefined) delete process.env.EMAIL_TRANSPORT
    else process.env.EMAIL_TRANSPORT = saved.transport
    vi.restoreAllMocks()
  })

  describe('resolveMailTransport', () => {
    it('is "resend" when a real key is present', () => {
      process.env.RESEND_API_KEY = 're_live_abc123'
      expect(resolveMailTransport()).toBe('resend')
    })

    it('is "console" when the console transport is opted into, even with a key', () => {
      process.env.RESEND_API_KEY = 're_live_abc123'
      process.env.EMAIL_TRANSPORT = 'console'
      expect(resolveMailTransport()).toBe('console')
    })

    it('is "console" with no key at all, which is what makes the paths drivable', () => {
      process.env.EMAIL_TRANSPORT = 'console'
      expect(resolveMailTransport()).toBe('console')
    })

    it('is "none" when there is no key', () => {
      expect(resolveMailTransport()).toBe('none')
    })

    it('treats a present-but-EMPTY key as none, which is how a dashboard variable actually goes wrong', () => {
      process.env.RESEND_API_KEY = ''
      expect(resolveMailTransport()).toBe('none')
      process.env.RESEND_API_KEY = '   '
      expect(resolveMailTransport()).toBe('none')
    })
  })

  describe('mailTransportReady', () => {
    it('permits the send when a transport exists, and says nothing', () => {
      process.env.RESEND_API_KEY = 're_live_abc123'
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(mailTransportReady('the ticket confirmation for order abc')).toBe(true)
      expect(err).not.toHaveBeenCalled()
    })

    it('permits the send under the console transport', () => {
      process.env.EMAIL_TRANSPORT = 'console'
      expect(mailTransportReady('the ticket confirmation for order abc')).toBe(true)
    })

    it('refuses AND SAYS SO when nothing can send, naming what was not delivered', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(mailTransportReady('the ticket confirmation for order abc-123', 'buyer@example.com')).toBe(false)
      expect(err).toHaveBeenCalledTimes(1)
      const line = String(err.mock.calls[0]![0])
      // The whole point: an undelivered ticket must leave a findable trace.
      expect(line).toContain('NOT SENT')
      expect(line).toContain('order abc-123')
      expect(line).toContain('buyer@example.com')
      expect(line).toContain('RESEND_API_KEY')
    })

    it('never throws, because a mail fault must not fail a confirmed order', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => mailTransportReady('anything')).not.toThrow()
    })
  })
})
