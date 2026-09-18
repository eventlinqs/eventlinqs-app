/**
 * MONEY FIX, PART B, B4. When an organiser hears about a sale.
 *
 * Carries the two of the item's nine named communication tests that judge a
 * SEND rather than the declaration: `organiser_receives_first_sale` and
 * `digest_preference_defaults_to_daily_per_organiser`. The other seven judge
 * the matrix and live in recipient-matrix.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DEFAULT_SALES_NOTIFICATION_MODE,
  SALES_NOTIFICATION_MODES,
  decideOrganiserSaleMessage,
  messageTypeForDecision,
  readSalesNotificationMode,
  type SalesNotificationMode,
} from '@/lib/notifications/organiser-sales-policy'
import { isDeclaredMessageType, resolveRecipientRoles } from '@/lib/notifications/recipient-matrix'

describe('organiser sales notification policy', () => {
  it('digest_preference_defaults_to_daily_per_organiser', () => {
    // The item's wording: "sales thereafter immediately or as a daily digest by
    // their own preference defaulting to daily".
    expect(DEFAULT_SALES_NOTIFICATION_MODE).toBe('daily')

    // An organisation row written before the column existed, or with a value
    // the CHECK should have refused, still hears about its money.
    expect(readSalesNotificationMode(null)).toBe('daily')
    expect(readSalesNotificationMode(undefined)).toBe('daily')
    expect(readSalesNotificationMode('')).toBe('daily')
    expect(readSalesNotificationMode('weekly')).toBe('daily')
    expect(readSalesNotificationMode('OFF')).toBe('daily')

    // A real stored preference is honoured exactly.
    expect(readSalesNotificationMode('immediate')).toBe('immediate')
    expect(readSalesNotificationMode('daily')).toBe('daily')
    expect(readSalesNotificationMode('off')).toBe('off')

    // And the default, on a later sale, is the digest rather than silence.
    expect(
      decideOrganiserSaleMessage({
        mode: readSalesNotificationMode(null),
        isFirstSaleForEvent: false,
      }),
    ).toBe('hold_for_digest')
  })

  it('organiser_receives_first_sale', () => {
    // The first sale is immediate whatever the volume preference says, because
    // the preference is about the volume of routine sales and the first one is
    // not routine. 'off' is the exception and is asserted separately below.
    for (const mode of ['immediate', 'daily'] as SalesNotificationMode[]) {
      expect(decideOrganiserSaleMessage({ mode, isFirstSaleForEvent: true })).toBe(
        'send_first_sale',
      )
    }

    const type = messageTypeForDecision('send_first_sale')
    expect(type).toBe('organiser_first_sale')
    // And it is a real declared message that reaches the organiser, not a
    // string that happens to look like one.
    expect(isDeclaredMessageType(type!)).toBe(true)
    expect(resolveRecipientRoles(type!)).toContain('organiser')
  })

  it('decides every combination of mode and first-sale exhaustively', () => {
    const table: Array<[SalesNotificationMode, boolean, string]> = [
      ['immediate', true, 'send_first_sale'],
      ['immediate', false, 'send_sale'],
      ['daily', true, 'send_first_sale'],
      ['daily', false, 'hold_for_digest'],
      ['off', true, 'send_nothing'],
      ['off', false, 'send_nothing'],
    ]
    // The table covers the whole space, so a new mode cannot be added without
    // this failing and somebody deciding what it means.
    expect(table.length).toBe(SALES_NOTIFICATION_MODES.length * 2)

    for (const [mode, isFirstSaleForEvent, expected] of table) {
      expect(decideOrganiserSaleMessage({ mode, isFirstSaleForEvent })).toBe(expected)
    }
  })

  it('switching sales messages off silences the first sale too, on purpose', () => {
    // Recorded as a test because it is a reading of the item rather than an
    // obvious consequence: the reversal condition lets an organiser switch
    // their SALES notifications off, and the first sale is one of those. The
    // messages they cannot switch off never pass through this policy.
    expect(decideOrganiserSaleMessage({ mode: 'off', isFirstSaleForEvent: true })).toBe(
      'send_nothing',
    )
    expect(messageTypeForDecision('send_nothing')).toBeNull()
    expect(messageTypeForDecision('hold_for_digest')).toBeNull()
  })

  it('every message type the policy can name is declared and reaches the organiser', () => {
    for (const decision of ['send_first_sale', 'send_sale'] as const) {
      const type = messageTypeForDecision(decision)
      expect(type).toBeTruthy()
      expect(isDeclaredMessageType(type!)).toBe(true)
      expect(resolveRecipientRoles(type!)).toContain('organiser')
      // The owner is not a recipient of an organiser's routine sale.
      expect(resolveRecipientRoles(type!)).not.toContain('platform_owner')
    }
  })
})

describe('the organiser sale email copy', () => {
  // Imported lazily so the copy test does not drag the server-only sender's
  // transport imports into every run of the policy tests above.
  async function build(decision: 'send_first_sale' | 'send_sale', ticketCount = 2) {
    const { buildSaleEmail } = await import('@/lib/notifications/organiser-sale-notify')
    return buildSaleEmail(decision, {
      eventTitle: 'Afro-Fusion Music Showcase',
      eventSlug: 'afro-fusion-music-showcase',
      orderNumber: 'EL-9HE57YNV',
      totalCents: 3600,
      currency: 'AUD',
      ticketCount,
    })
  }

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eventlinqs.com.au')
  })

  it('names the event and the amount, and obeys the copy laws', async () => {
    for (const decision of ['send_first_sale', 'send_sale'] as const) {
      const { subject, html, text } = await build(decision)
      expect(subject).toContain('Afro-Fusion Music Showcase')
      expect(text).toContain('$36.00')
      expect(text).toContain('EL-9HE57YNV')

      for (const body of [subject, text, html]) {
        // CLAUDE.md, Copy and banned content: no em-dashes, no en-dashes, no
        // exclamation marks in user-facing copy.
        expect(body).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`))
        expect(body).not.toContain('!')
        // The word "culture" is banned everywhere, in every form.
        expect(body.toLowerCase()).not.toContain('culture')
      }
    }
  })

  it('says the money is held and paid out after the event, which is the model', async () => {
    const { text } = await build('send_first_sale')
    expect(text.toLowerCase()).toContain('held for you')
    expect(text.toLowerCase()).toContain('after the event')
  })

  it('tells a first-time organiser the attendee relationship is theirs', async () => {
    // The data-ownership promise is the second blade of the wedge, and the
    // first sale is the moment it means the most.
    const { text } = await build('send_first_sale')
    expect(text.toLowerCase()).toContain('export')
    const later = await build('send_sale')
    // Not repeated on every routine sale: a promise restated hourly is noise.
    expect(later.text.toLowerCase()).not.toContain('export')
  })

  it('counts one ticket as a ticket and two as tickets', async () => {
    expect((await build('send_sale', 1)).text).toContain('1 ticket sold')
    expect((await build('send_sale', 2)).text).toContain('2 tickets sold')
    // And the first-sale wording stays grammatical when the first order
    // carries more than one ticket, which was wrong on the first pass.
    expect((await build('send_first_sale', 1)).text).toContain('first sale: 1 ticket for')
    expect((await build('send_first_sale', 2)).text).toContain('first sale: 2 tickets for')
  })
})
