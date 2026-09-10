import { describe, expect, test, vi, beforeEach } from 'vitest'
import type { SlotRow } from '@/lib/fillrate/due'

/**
 * THE SWEEP, WHICH IS THE PART THAT WRITES TO A REAL PERSON. Close-out D2.
 *
 * The decisions are proven pure in `due.test.ts` and `waitlist.test.ts`. What is
 * proven here is what the sweep DOES with a decision, and every case is a way
 * somebody gets a message they should not have got:
 *
 *   - the record is written BEFORE the send, so a retried sweep collides on the
 *     UNIQUE rather than in an inbox. If that order ever silently flips, the
 *     worst case changes from one message nobody received to the same message
 *     three times, and only this test would notice.
 *   - a message with no working way to stop it does not go, at all.
 *   - a message with nowhere to send them does not go either.
 *   - a failed send is counted and said out loud, never swallowed.
 */

const reads = vi.hoisted(() => ({
  slots: [] as SlotRow[],
  demand: [] as unknown[],
  facts: {
    boughtHashes: new Set<string>(),
    refundedHashes: new Set<string>(),
    unitsSold: 0,
    alreadySent: new Set<string>(),
  },
  suppressed: new Set<string>(),
  token: 'tok-1' as string | null,
  recordResult: { recorded: true, alreadyThere: false } as {
    recorded: boolean
    alreadyThere: boolean
    reason?: string
  },
  recorded: [] as unknown[],
}))

vi.mock('@/lib/fillrate/read', () => ({
  slotsWithRecoverableDemand: async () => reads.slots,
  abandonmentsOn: async () => reads.demand,
  factsFor: async () => reads.facts,
  suppressedAddresses: async () => reads.suppressed,
  tokenFor: async () => reads.token,
  hashOf: (email: string) => `h:${email.trim().toLowerCase()}`,
  recordSend: async (send: unknown) => {
    reads.recorded.push(send)
    return reads.recordResult
  },
  joinsOn: async () => [],
  holdsOn: async () => [],
  openHold: async () => ({ opened: true, alreadyThere: false }),
  closeHold: async () => true,
}))

vi.mock('@/lib/email/send', () => ({ sendEmail: async () => ({ id: 'never-used' }) }))
vi.mock('@/lib/site-url', () => ({ getAppUrl: () => 'https://www.eventlinqs.com.au' }))

const { sweepAbandonedCheckouts } = await import('@/lib/fillrate/engine')

const NOW = new Date('2026-09-11T10:00:00.000Z')
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString()

const slot: SlotRow = {
  id: 'slot-1',
  sourceRef: 'source-1',
  organisationId: 'org-1',
  category: 'music',
  subcategory: 'electronic',
  slotAt: '2026-12-01T09:00:00.000Z',
  capacity: 100,
  recoveryEnabled: true,
}

const abandonment = {
  id: 41,
  slotId: 'slot-1',
  organisationId: 'org-1',
  action: 'checkout_abandoned' as const,
  contactEmail: 'buyer@example.com',
  occurredAt: hoursAgo(3),
  inventoryClass: 'General admission',
  unitAmountCents: 1800,
}

const links = {
  signature: 'The source system team. A line it supplies.',
  resumeUrlFor: async () => 'https://www.eventlinqs.com.au/events/a-slot#tickets',
  describe: async () => ({ name: 'Afro-Fusion Showcase', organiserName: 'MKL Studios', timezone: 'Australia/Melbourne' }),
}

beforeEach(() => {
  reads.slots = [slot]
  reads.demand = [abandonment]
  reads.facts = {
    boughtHashes: new Set<string>(),
    refundedHashes: new Set<string>(),
    unitsSold: 0,
    alreadySent: new Set<string>(),
  }
  reads.suppressed = new Set<string>()
  reads.token = 'tok-1'
  reads.recordResult = { recorded: true, alreadyThere: false }
  reads.recorded = []
})

describe('the sweep sends when it should', () => {
  test('one due message goes to one person, and names them once in the record', async () => {
    const sent: Array<{ to: string; subject: string }> = []
    const result = await sweepAbandonedCheckouts(links, NOW, undefined, async m => {
      sent.push({ to: m.to, subject: m.subject })
      return null
    })
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
    expect(sent.map(m => m.to)).toEqual(['buyer@example.com'])
    expect(reads.recorded).toHaveLength(1)
  })

  test('the message carries the resumable link and the way to stop', async () => {
    const bodies: string[] = []
    await sweepAbandonedCheckouts(links, NOW, undefined, async m => {
      bodies.push(m.text)
      return null
    })
    expect(bodies[0]).toContain('https://www.eventlinqs.com.au/events/a-slot#tickets')
    expect(bodies[0]).toContain('https://www.eventlinqs.com.au/unsubscribe/recovery/tok-1')
  })

  test('the send record is written BEFORE the message leaves, never after', async () => {
    const order: string[] = []
    reads.recordResult = { recorded: true, alreadyThere: false }
    const originalPush = reads.recorded.push.bind(reads.recorded)
    reads.recorded.push = ((...args: unknown[]) => {
      order.push('recorded')
      return originalPush(...args)
    }) as typeof reads.recorded.push
    await sweepAbandonedCheckouts(links, NOW, undefined, async () => {
      order.push('sent')
      return null
    })
    expect(order).toEqual(['recorded', 'sent'])
  })
})

describe('the sweep refuses when it should, and says which refusal it was', () => {
  test('no unsubscribe link means no message at all', async () => {
    reads.token = null
    const sent: string[] = []
    const result = await sweepAbandonedCheckouts(links, NOW, undefined, async m => {
      sent.push(m.to)
      return null
    })
    expect(sent).toHaveLength(0)
    expect(result.sent).toBe(0)
    expect(Object.keys(result.refusals).join(' ')).toMatch(/unsubscribe link/)
  })

  test('no unsubscribe link also means nothing is recorded as sent', async () => {
    reads.token = null
    await sweepAbandonedCheckouts(links, NOW, undefined, async () => null)
    expect(reads.recorded).toHaveLength(0)
  })

  test('nowhere to send them means no message', async () => {
    const sent: string[] = []
    const result = await sweepAbandonedCheckouts(
      { ...links, resumeUrlFor: async () => null },
      NOW,
      undefined,
      async m => {
        sent.push(m.to)
        return null
      },
    )
    expect(sent).toHaveLength(0)
    expect(Object.keys(result.refusals).join(' ')).toMatch(/no resumable link/)
  })

  test('a source system that cannot say what the slot is produces no message', async () => {
    const sent: string[] = []
    const result = await sweepAbandonedCheckouts(
      { ...links, describe: async () => null },
      NOW,
      undefined,
      async m => {
        sent.push(m.to)
        return null
      },
    )
    expect(sent).toHaveLength(0)
    expect(Object.keys(result.refusals).join(' ')).toMatch(/could not say what this slot is/)
  })

  test('another worker having recorded the same message first stops this one', async () => {
    reads.recordResult = { recorded: false, alreadyThere: true }
    const sent: string[] = []
    const result = await sweepAbandonedCheckouts(links, NOW, undefined, async m => {
      sent.push(m.to)
      return null
    })
    expect(sent).toHaveLength(0)
    expect(Object.keys(result.refusals).join(' ')).toMatch(/already recorded this exact message/)
  })

  test('an address that unsubscribed is never reached, however due the message is', async () => {
    reads.suppressed = new Set(['buyer@example.com'])
    const sent: string[] = []
    const result = await sweepAbandonedCheckouts(links, NOW, undefined, async m => {
      sent.push(m.to)
      return null
    })
    expect(sent).toHaveLength(0)
    expect(Object.keys(result.refusals).join(' ')).toMatch(/unsubscribed/)
  })

  test('somebody who already bought is never reached, matched on the hash a sale row carries', async () => {
    reads.facts = { ...reads.facts, boughtHashes: new Set(['h:buyer@example.com']) }
    const sent: string[] = []
    await sweepAbandonedCheckouts(links, NOW, undefined, async m => {
      sent.push(m.to)
      return null
    })
    expect(sent).toHaveLength(0)
  })
})

describe('the reversal condition reaches all the way to the send', () => {
  test('a complaint rate over the stop threshold sends nothing and says why', async () => {
    const sent: string[] = []
    const result = await sweepAbandonedCheckouts(
      links,
      NOW,
      { sent: 1000, unsubscribed: 0, complained: 4 },
      async m => {
        sent.push(m.to)
        return null
      },
    )
    expect(sent).toHaveLength(0)
    expect(result.sequenceLength).toBe(0)
    expect(result.sequenceReason).toMatch(/halted/)
  })

  test('a cut sequence still sends message one, which is the point of cutting rather than stopping', async () => {
    const sent: string[] = []
    const result = await sweepAbandonedCheckouts(
      links,
      NOW,
      { sent: 1000, unsubscribed: 30, complained: 0 },
      async m => {
        sent.push(m.to)
        return null
      },
    )
    expect(result.sequenceLength).toBe(1)
    expect(sent).toHaveLength(1)
  })
})

describe('a send that fails is counted, never swallowed', () => {
  test('a transport failure is a failure in the result, not a silent success', async () => {
    const result = await sweepAbandonedCheckouts(links, NOW, undefined, async () => {
      throw new Error('the mail server said no')
    })
    expect(result.failed).toBe(1)
    expect(result.sent).toBe(0)
  })
})
