import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
 * C3 + C5: the two-pass Magic Start flow with the anti-tell gate. Pass 1
 * extracts fields on Haiku; pass 2 writes the prose on the copy model
 * (Sonnet 5 by default, AI_MAGIC_START_MODEL override); telling prose gets
 * exactly ONE regeneration with the violations named; a still-telling field
 * ships blanked and flagged, never with a tell.
 */

const EXTRACTED_DRAFT = {
  title: 'Winter gig at The Wool Store',
  description: 'Free winter gig, two sets, doors 7pm.',
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

const CLEAN_COPY = {
  title: 'Laneway Sessions: Winter Series',
  description:
    'Two sets from the house band, doors at 7pm, bar open through the interval. Eighty seats.',
}

const TELLING_COPY = {
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
  communities: [
    { slug: 'african', name: 'African' },
    { slug: 'greek', name: 'Greek' },
  ],
  nowIso: '2026-07-25T10:00:00+10:00',
  who: 'test-user',
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.AI_MAGIC_START_MODEL
  redisMock.get.mockResolvedValue(null)
  redisMock.incrby.mockResolvedValue(1)
  redisMock.expire.mockResolvedValue(1)
})

afterEach(() => {
  delete process.env.AI_MAGIC_START_MODEL
})

describe('C5: the two-pass model split', () => {
  it('extraction runs on pinned Haiku, the copy pass on Sonnet 5 by default', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockResolvedValueOnce(reply(CLEAN_COPY))
    const result = await extractEventDraft(OPTS)
    expect(messagesCreate).toHaveBeenCalledTimes(2)
    expect(messagesCreate.mock.calls[0][0].model).toBe('claude-haiku-4-5-20251001')
    expect(messagesCreate.mock.calls[1][0].model).toBe('claude-sonnet-5')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.title).toBe(CLEAN_COPY.title)
      expect(result.draft.description).toBe(CLEAN_COPY.description)
      expect(result.draft.venue_name).toBe('The Wool Store')
    }
  })

  it('AI_MAGIC_START_MODEL overrides the copy pass only, never extraction', async () => {
    process.env.AI_MAGIC_START_MODEL = 'claude-opus-5'
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockResolvedValueOnce(reply(CLEAN_COPY))
    await extractEventDraft(OPTS)
    expect(messagesCreate.mock.calls[0][0].model).toBe('claude-haiku-4-5-20251001')
    expect(messagesCreate.mock.calls[1][0].model).toBe('claude-opus-5')
  })

  it('a failed copy pass degrades to the extraction prose, never loses the draft', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockRejectedValueOnce(new Error('copy model down'))
    const result = await extractEventDraft(OPTS)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.draft.title).toBe(EXTRACTED_DRAFT.title)
  })

  it('both passes are recorded against the cost guard', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockResolvedValueOnce(reply(CLEAN_COPY))
    await extractEventDraft(OPTS)
    // recordSpend increments the month key once per model call.
    expect(redisMock.incrby).toHaveBeenCalledTimes(2)
  })
})

describe('C3: the anti-tell gate on the two-pass flow', () => {
  it('telling copy triggers ONE regeneration on the copy model with the violations named', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockResolvedValueOnce(reply(TELLING_COPY))
      .mockResolvedValueOnce(reply(CLEAN_COPY))
    const result = await extractEventDraft(OPTS)
    expect(messagesCreate).toHaveBeenCalledTimes(3)
    expect(messagesCreate.mock.calls[2][0].model).toBe('claude-sonnet-5')
    const retryMessages = messagesCreate.mock.calls[2][0].messages
    const corrective = retryMessages[retryMessages.length - 1].content as string
    expect(corrective).toContain('unforgettable')
    expect(corrective).toContain('look-no-further')
    expect(corrective).toContain('vibrant')
    expect(corrective).toContain('get-ready-to')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.title).toBe(CLEAN_COPY.title)
      expect(result.draft.description).toBe(CLEAN_COPY.description)
    }
  })

  it('copy still telling after the retry ships blanked, flagged fields, never a tell', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockResolvedValueOnce(reply(TELLING_COPY))
      .mockResolvedValueOnce(reply(TELLING_COPY))
    const result = await extractEventDraft(OPTS)
    expect(messagesCreate).toHaveBeenCalledTimes(3)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.title).toBe('')
      expect(result.draft.description).toBe('')
      expect(result.draft.unresolved).toContain('Title')
      expect(result.draft.unresolved).toContain('Description')
      expect(result.draft.venue_name).toBe('The Wool Store')
    }
  })

  it('never issues a fourth call no matter what comes back', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockResolvedValue(reply(TELLING_COPY))
    await extractEventDraft(OPTS)
    expect(messagesCreate).toHaveBeenCalledTimes(3)
  })
})

describe('C4: the six voice registers ride in the system prompt', () => {
  it('names every register and the universal mandates', async () => {
    messagesCreate
      .mockResolvedValueOnce(reply(EXTRACTED_DRAFT))
      .mockResolvedValueOnce(reply(CLEAN_COPY))
    await extractEventDraft(OPTS)
    const system: string = messagesCreate.mock.calls[0][0].system[0].text
    expect(system).toContain('Music and nightlife:')
    expect(system).toContain('Comedy:')
    expect(system).toContain('Corporate and business:')
    expect(system).toContain('Family:')
    expect(system).toContain('Community and faith:')
    expect(system).toContain('Festivals:')
    expect(system).toContain('most concrete benefit')
    expect(system).toContain('Every sentence states something true')
    expect(system).toContain('experienced Australian event producer')
    // The copy pass carries the same laws and registers.
    const copySystem: string = messagesCreate.mock.calls[1][0].system[0].text
    expect(copySystem).toBe(system)
  })
})
