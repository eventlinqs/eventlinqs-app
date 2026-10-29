import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The QA marker on counted hops (the master mandate of 29 October 2026, the project manager's R3): a press carrying a
 * secret whose sha256 is an unexpired qa_markers row is a TEST press; a press with no header is an ordinary press; a
 * press whose header cannot be verified is recorded as neither, so a mistyped QA secret never reaches a figure.
 */

const h = vi.hoisted(() => ({
  rows: [] as { sha256: string; expires_at: string }[],
  error: null as { message: string } | null,
  asked: [] as { column: string; value: unknown }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'qa_markers') throw new Error(`unexpected table ${table}`)
      const q = {
        filters: [] as { column: string; value: unknown; op: string }[],
        select() {
          return q
        },
        eq(column: string, value: unknown) {
          h.asked.push({ column, value })
          q.filters.push({ column, value, op: 'eq' })
          return q
        },
        gt(column: string, value: unknown) {
          q.filters.push({ column, value, op: 'gt' })
          return q
        },
        limit() {
          return q
        },
        then(resolve: (r: unknown) => unknown) {
          if (h.error) return Promise.resolve({ data: null, error: h.error }).then(resolve)
          const sha = q.filters.find((f) => f.column === 'sha256')?.value
          const after = q.filters.find((f) => f.column === 'expires_at')?.value as string
          const data = h.rows.filter((r) => r.sha256 === sha && Date.parse(r.expires_at) > Date.parse(after))
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return q
    },
  }),
}))

const { qaPressOf, qaMarkerHash, QA_HEADER } = await import('@/lib/broadcast/qa-marker')

const NOW = new Date('2026-10-29T11:00:00Z')
const SECRET = 'a'.repeat(48)

describe('qaMarkerHash', () => {
  it('is the lower-case sha256 of the secret', () => {
    expect(qaMarkerHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('qaPressOf', () => {
  beforeEach(() => {
    h.rows = [{ sha256: qaMarkerHash(SECRET), expires_at: '2026-10-30T09:00:00Z' }]
    h.error = null
    h.asked = []
  })

  it('names the header the drives send', () => {
    expect(QA_HEADER).toBe('x-eventlinqs-qa')
  })

  it('an ordinary press carries no header and asks the database nothing', async () => {
    expect(await qaPressOf(null, NOW)).toBe('none')
    expect(await qaPressOf('', NOW)).toBe('none')
    expect(h.asked).toEqual([])
  })

  it('a secret whose hash is an unexpired marker is a test press, and only the hash is ever looked up', async () => {
    expect(await qaPressOf(SECRET, NOW)).toBe('test')
    expect(h.asked).toEqual([{ column: 'sha256', value: qaMarkerHash(SECRET) }])
    expect(JSON.stringify(h.asked)).not.toContain(SECRET)
  })

  it('an expired marker, an unknown secret or a malformed header is refused, never counted as a person', async () => {
    expect(await qaPressOf(SECRET, new Date('2026-10-30T10:00:00Z'))).toBe('refused')
    expect(await qaPressOf('b'.repeat(48), NOW)).toBe('refused')
    expect(await qaPressOf('short', NOW)).toBe('refused')
    expect(await qaPressOf('x'.repeat(300), NOW)).toBe('refused')
  })

  it('a marker that cannot be read is refused, not guessed either way', async () => {
    h.error = { message: 'connection reset' }
    expect(await qaPressOf(SECRET, NOW)).toBe('refused')
  })
})
