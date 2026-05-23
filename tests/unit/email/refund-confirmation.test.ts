/**
 * Unit tests for the refund confirmation email template.
 *
 * Closes AUDIT-FUNCTIONALITY-2026-05-23.md MEDIUM-1. Asserts the
 * template renders without throwing, the subject and body carry the
 * required fields, and the optional organiser custom message only
 * appears when non-empty.
 */

import { describe, expect, it } from 'vitest'
import {
  buildRefundConfirmationHtml,
  buildRefundConfirmationSubject,
  buildRefundConfirmationText,
  buildRefundTimeframeSentence,
  type RefundConfirmationProps,
} from '@/lib/email/templates/refund-confirmation'

const baseProps: RefundConfirmationProps = {
  buyerName: 'Lawal Adams',
  orderNumber: 'ORD-12345',
  eventTitle: 'Pasifika Festival 2027',
  ticketCount: 2,
  refundAmountCents: 12500, // $125.00 AUD
  currency: 'AUD',
  customMessage: null,
  organiserName: 'Pasifika Inc.',
  organiserContactEmail: 'hello@pasifika.example',
}

describe('refund-confirmation template', () => {
  it('renders subject, html, and text without throwing for valid props', () => {
    expect(() => buildRefundConfirmationSubject(baseProps.eventTitle)).not.toThrow()
    expect(() => buildRefundConfirmationHtml(baseProps)).not.toThrow()
    expect(() => buildRefundConfirmationText(baseProps)).not.toThrow()
  })

  it('subject line includes the event title', () => {
    const subject = buildRefundConfirmationSubject(baseProps.eventTitle)
    expect(subject).toContain(baseProps.eventTitle)
    expect(subject).toBe('Refund processed: Pasifika Festival 2027')
  })

  it('html body contains the refund amount formatted as AUD', () => {
    const html = buildRefundConfirmationHtml(baseProps)
    // formatMoney emits "AUD 125.00" for 12500 cents AUD.
    expect(html).toContain('AUD 125.00')
  })

  it('text body contains the refund amount formatted as AUD', () => {
    const text = buildRefundConfirmationText(baseProps)
    expect(text).toContain('AUD 125.00')
  })

  it('html body contains the order id', () => {
    const html = buildRefundConfirmationHtml(baseProps)
    expect(html).toContain('ORD-12345')
  })

  it('text body contains the order id', () => {
    const text = buildRefundConfirmationText(baseProps)
    expect(text).toContain('ORD-12345')
  })

  it('body contains the expected timeframe statement', () => {
    const timeframe = buildRefundTimeframeSentence(
      baseProps.refundAmountCents,
      baseProps.currency,
    )
    expect(timeframe).toBe(
      'Your refund of AUD 125.00 will appear on your statement within 3 to 5 business days. Some banks may take up to 10 days.',
    )
    const html = buildRefundConfirmationHtml(baseProps)
    expect(html).toContain('within 3 to 5 business days')
    const text = buildRefundConfirmationText(baseProps)
    expect(text).toContain('within 3 to 5 business days')
  })

  it('html body contains the event title', () => {
    const html = buildRefundConfirmationHtml(baseProps)
    expect(html).toContain('Pasifika Festival 2027')
  })

  it('html body shows ticket count label', () => {
    const html = buildRefundConfirmationHtml(baseProps)
    expect(html).toContain('2 tickets')
  })

  it('singular ticket count label when ticketCount is 1', () => {
    const html = buildRefundConfirmationHtml({ ...baseProps, ticketCount: 1 })
    expect(html).toContain('1 ticket')
    expect(html).not.toContain('1 tickets')
  })

  describe('custom message rendering', () => {
    it('appears in the html body when provided', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        customMessage: 'We are sorry the event did not work out for you.',
      })
      expect(html).toContain('Message from the organiser')
      expect(html).toContain(
        'We are sorry the event did not work out for you.',
      )
    })

    it('appears in the text body when provided', () => {
      const text = buildRefundConfirmationText({
        ...baseProps,
        customMessage: 'We are sorry the event did not work out for you.',
      })
      expect(text).toContain('Message from the organiser')
      expect(text).toContain(
        'We are sorry the event did not work out for you.',
      )
    })

    it('does not render an empty block when customMessage is null', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        customMessage: null,
      })
      expect(html).not.toContain('Message from the organiser')
    })

    it('does not render when customMessage is an empty string', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        customMessage: '',
      })
      expect(html).not.toContain('Message from the organiser')
    })

    it('does not render when customMessage is whitespace only', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        customMessage: '   \n  \t  ',
      })
      expect(html).not.toContain('Message from the organiser')
    })
  })

  describe('greeting fallback', () => {
    it('uses first name when buyerName is provided', () => {
      const html = buildRefundConfirmationHtml(baseProps)
      expect(html).toContain('Hi Lawal,')
    })

    it('falls back to "Hi there" when buyerName is null', () => {
      const html = buildRefundConfirmationHtml({ ...baseProps, buyerName: null })
      expect(html).toContain('Hi there,')
    })

    it('falls back to "Hi there" when buyerName is whitespace', () => {
      const html = buildRefundConfirmationHtml({ ...baseProps, buyerName: '   ' })
      expect(html).toContain('Hi there,')
    })
  })

  describe('support contact line', () => {
    it('mentions organiser name + contact when both are present', () => {
      const html = buildRefundConfirmationHtml(baseProps)
      expect(html).toContain('Pasifika Inc.')
      expect(html).toContain('hello@pasifika.example')
    })

    it('falls back to generic contact when only contact email is present', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        organiserName: null,
      })
      expect(html).toContain('contact the organiser at')
      expect(html).toContain('hello@pasifika.example')
    })

    it('falls back to platform support when no organiser contact', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        organiserName: null,
        organiserContactEmail: null,
      })
      expect(html).toContain('Reply to this email and our support team will help')
    })
  })

  describe('voice rules', () => {
    it('contains no em-dashes', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        customMessage: 'Refund is final',
      })
      expect(html).not.toContain('—')
      const text = buildRefundConfirmationText({
        ...baseProps,
        customMessage: 'Refund is final',
      })
      expect(text).not.toContain('—')
    })

    it('contains no en-dashes', () => {
      const html = buildRefundConfirmationHtml(baseProps)
      expect(html).not.toContain('–')
      const text = buildRefundConfirmationText(baseProps)
      expect(text).not.toContain('–')
    })

    it('contains no exclamation marks in visible copy', () => {
      // The voice rule targets user-visible prose. `<!doctype html>` is
      // required HTML markup, not copy. Strip the doctype, HTML comments,
      // and all tags before checking the visible content.
      const html = buildRefundConfirmationHtml(baseProps)
      const visible = html
        .replace(/<![^>]*>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]+>/g, '')
      expect(visible).not.toContain('!')
      const text = buildRefundConfirmationText(baseProps)
      expect(text).not.toContain('!')
    })
  })

  describe('html safety', () => {
    it('escapes html-special characters in the event title', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        eventTitle: 'Bento & Beats <Live>',
      })
      expect(html).toContain('Bento &amp; Beats &lt;Live&gt;')
      expect(html).not.toContain('Bento & Beats <Live>')
    })

    it('escapes html-special characters in the custom message', () => {
      const html = buildRefundConfirmationHtml({
        ...baseProps,
        customMessage: 'Refund <script>alert(1)</script>',
      })
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(html).not.toContain('<script>alert(1)</script>')
    })
  })
})
