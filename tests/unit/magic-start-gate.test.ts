import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks (same shape as ai-layer.test.ts) ─────────────────────────────────

const redisMock = { get: vi.fn(), incrby: vi.fn(), expire: vi.fn() }
vi.mock('@/lib/redis/client', () => ({ getRedisClient: vi.fn(() => redisMock) }))

const messagesCreate = vi.fn()
vi.mock('@/lib/ai/client', () => ({
  isAiConfigured: vi.fn(() => true),
  getAnthropicClient: vi.fn(() => ({ messages: { create: messagesCreate } })),
}))

import { extractEventDraft } from '@/lib/ai/magic-start'

/**
 * C3 integration: the anti-tell gate inside Magic Start. A telling draft gets
 * exactly ONE regeneration with the violations named; a still-telling field is
 * blanked and flagged, never shipped.
 */

const CLEAN_DRAFT = {
  title: 'Laneway Sessions: Winter Series',
  description:
    'Two sets from the house band, doors at 7pm, bar open through the interval. Eighty seats.',
  category: 'Music',
  start_date: '2026-08-01T19:00',
  end_date: '2026-08-01T21:00',
  event_type: 'in_person',
  venue_name: 'The Wool Store',
  venue_address: '',
  venue_city: 'Geelong',
  venue_state: 'VIC',
  venue_postal_code: '',
  is_free: true,
  ticket_tiers: [{ name: 'Free', price: 0, currency: 'AUD', total_capacity: 80 }],
  unresolved: [],
}

const TELLING_DRAFT = {
  ...CLEAN_DRAFT,
  title: 'An Unforgettable Night Out',
  description: 'Get ready to experience a vibrant evening. Look no further.',
}

function reply(json: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 500,
      output_tokens: 150,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  }
}

const OPTS = {
  description: 'Free winter gig at The Wool Store Geelong, 1 August, 7pm, 80 seats',
  categoryNames: ['Music', 'Comedy'],
  nowIso: '2026-07-25T10:00:00+10:00',
  who: 'test-user',
}

beforeEach(() => {
  vi.clearAllMocks()
  redisMock.get.mockResolvedValue(null)
  redisMock.incrby.mockResolvedValue(1)
  redisMock.expire.mockResolvedValue(1)
})

describe('Magic Start anti-tell gate', () => {
  it('a clean draft passes with a single model call', async () => {
    messagesCreate.mockResolvedValueOnce(reply(CLEAN_DRAFT))
    const result = await extractEventDraft(OPTS)
    expect(result.ok).toBe(true)
    expect(messagesCreate).toHaveBeenCalledTimes(1)
    if (result.ok) expect(result.draft.title).toBe(CLEAN_DRAFT.title)
  })

  it('a telling draft triggers ONE regeneration with the violations named', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(TELLING_DRAFT))
      .mockResolvedValueOnce(reply(CLEAN_DRAFT))
    const result = await extractEventDraft(OPTS)
    expect(messagesCreate).toHaveBeenCalledTimes(2)
    const retryMessages = messagesCreate.mock.calls[1][0].messages
    const corrective = retryMessages[retryMessages.length - 1].content as string
    expect(corrective).toContain('unforgettable')
    expect(corrective).toContain('look-no-further')
    expect(corrective).toContain('vibrant')
    expect(corrective).toContain('get-ready-to')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.title).toBe(CLEAN_DRAFT.title)
      expect(result.draft.description).toBe(CLEAN_DRAFT.description)
    }
  })

  it('a draft still telling after the retry ships blanked, flagged fields, never a tell', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(TELLING_DRAFT))
      .mockResolvedValueOnce(reply(TELLING_DRAFT))
    const result = await extractEventDraft(OPTS)
    expect(messagesCreate).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.title).toBe('')
      expect(result.draft.description).toBe('')
      expect(result.draft.unresolved).toContain('Title')
      expect(result.draft.unresolved).toContain('Description')
      // The structured fields survive: only the telling prose is blanked.
      expect(result.draft.venue_name).toBe('The Wool Store')
    }
  })

  it('never issues a third call no matter what comes back', async () => {
    messagesCreate.mockResolvedValue(reply(TELLING_DRAFT))
    await extractEventDraft(OPTS)
    expect(messagesCreate).toHaveBeenCalledTimes(2)
  })
})
