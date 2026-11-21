import { describe, expect, it, vi } from 'vitest'
import { markPublished, publishDuePieces, readBackPendingPosts, recordAutoPosting, recordMissingPostings } from '@/lib/social/store'

/*
 * A POST AS IT WENT, AND NEVER A BLIND RESEND (the PM's 16:40 of 21 November 2026, AV (a)). Found at 12:12 (5A) and 12:17
 * (5C): the auto publisher marked schedules published and wrote no social_piece_postings row, so /go and the link in bio
 * listed nothing and go_presses stayed 0. Now the step that confirms a post's public address records its posting, and
 * before any send the provider's own record of an earlier submission is read.
 */
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>, opts: { postingError?: { code: string; message: string } } = {}) {
  const updates: { table: string; change: Row; where: [string, unknown][] }[] = []
  const inserts: { table: string; row: Row }[] = []
  const query = (table: string) => {
    const where: [string, unknown][] = []
    const tests: ((r: Row) => boolean)[] = []
    let change: Row | null = null
    let one = false
    let cap = Infinity
    const run = () => {
      const rows = (tables[table] ?? []).filter((r) => tests.every((t) => t(r)))
      if (change) {
        updates.push({ table, change, where })
        for (const r of rows) Object.assign(r, change)
        return { data: null, error: null }
      }
      const kept = rows.slice(0, cap)
      return one ? { data: kept[0] ?? null, error: null } : { data: kept, error: null }
    }
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => (where.push([k, v]), tests.push((r) => String(r[k]) === String(v)), q),
      not: (k: string, op: string, v: unknown) => (tests.push((r) => (op === 'is' && v === null ? r[k] != null : true)), q),
      neq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) !== String(v)), q),
      like: (k: string, pattern: string) => (tests.push((r) => String(r[k] ?? '').startsWith(pattern.replace('%', ''))), q),
      lte: () => q,
      order: () => q,
      limit: (n: number) => ((cap = n), q),
      maybeSingle: () => ((one = true), q),
      update: (c: Row) => ((change = c), q),
      insert: async (row: Row) => {
        if (table === 'social_piece_postings' && opts.postingError) return { error: opts.postingError }
        inserts.push({ table, row })
        return { error: null }
      },
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    }
    return q
  }
  return { db: { from: (t: string) => query(t) } as never, updates, inserts }
}

const NOW = new Date('2026-11-22T07:00:00Z') // 6 pm, Sunday 22 November, Melbourne
const approval = { id: 'ap1', approved_by: 'founder-1' }

describe('markPublished: one step marks the schedule and records the post as it went', () => {
  it("a public address: the schedule published and the posting written with the approval's own person", async () => {
    const t = fakeDb({ social_piece_schedules: [{ id: 's1', state: 'scheduled' }], social_piece_approvals: [approval] })
    const out = await markPublished(t.db, { scheduleId: 's1', pieceId: 'p1', approvalId: 'ap1', ref: 'https://www.instagram.com/p/AbC123/', now: NOW })
    expect(out).toEqual({ error: null, posting: 'recorded' })
    expect(t.updates[0].change).toMatchObject({ state: 'published', published_ref: 'https://www.instagram.com/p/AbC123/' })
    expect(t.inserts).toEqual([{ table: 'social_piece_postings', row: { piece_id: 'p1', approval_id: 'ap1', post_url: 'https://www.instagram.com/p/AbC123/', posted_at: NOW.toISOString(), recorded_by: 'founder-1' } }])
  })

  it("a provider's submission only: published, and the posting waits for the read back", async () => {
    const t = fakeDb({ social_piece_schedules: [{ id: 's1', state: 'scheduled' }], social_piece_approvals: [approval] })
    const out = await markPublished(t.db, { scheduleId: 's1', pieceId: 'p1', approvalId: 'ap1', ref: 'blotato:sub-1', now: NOW })
    expect(out.posting).toMatch(/waits for its public address/)
    expect(t.inserts).toEqual([])
  })

  it('the second network finds the piece recorded already, and says so', async () => {
    const t = fakeDb({ social_piece_approvals: [approval] }, { postingError: { code: '23505', message: 'duplicate key' } })
    expect(await recordAutoPosting(t.db, { pieceId: 'p1', approvalId: 'ap1', postUrl: 'https://www.facebook.com/123_456', postedAt: NOW })).toBe('recorded already')
  })
})

describe('the read back records the posting when the provider confirms the address', () => {
  it("Blotato's public URL replaces the reference and the post is recorded as it went", async () => {
    const t = fakeDb({
      social_piece_schedules: [{ id: 's1', piece_id: 'p1', approval_id: 'ap1', published_ref: 'blotato:sub-1', published_at: NOW.toISOString(), state: 'published' }],
      social_piece_approvals: [approval],
    })
    const read = vi.fn(async () => ({ status: 'published', publicUrl: 'https://www.instagram.com/p/AbC123/' }))
    const out = await readBackPendingPosts(t.db, read)
    expect(out.filled).toEqual(['blotato:sub-1 is https://www.instagram.com/p/AbC123/'])
    expect(t.inserts.map((i) => i.row.post_url)).toEqual(['https://www.instagram.com/p/AbC123/'])
  })

  it('a post that went public with no posting before AV is recorded by the sweep, once per piece', async () => {
    const t = fakeDb({
      social_piece_schedules: [
        { piece_id: 'p9', approval_id: 'ap1', published_ref: 'https://www.facebook.com/1_2', published_at: NOW.toISOString(), state: 'published', social_pieces: { social_piece_postings: [] } },
        { piece_id: 'p9', approval_id: 'ap1', published_ref: 'https://www.instagram.com/p/X/', published_at: NOW.toISOString(), state: 'published', social_pieces: { social_piece_postings: [] } },
      ],
      social_piece_approvals: [approval],
    })
    const out = await recordMissingPostings(t.db)
    expect(out.recorded).toEqual(['p9: https://www.facebook.com/1_2'])
    expect(t.inserts).toHaveLength(1)
  })
})

describe('never a blind resend: an earlier submission is read on the provider first', () => {
  const tables = () => ({
    feature_flags: [{ flag: 'social_auto_publish', enabled: true }],
    social_piece_schedules: [
      { id: 's2', piece_id: 'p1', approval_id: 'ap1', platform: 'instagram', go_at: NOW.toISOString(), state: 'scheduled', submission_ref: null },
      { id: 's1', piece_id: 'p1', approval_id: 'ap1', platform: 'instagram', go_at: NOW.toISOString(), state: 'held', submission_ref: 'blotato:sub-1' },
    ],
    social_piece_approvals: [approval],
  })

  it('the provider says it went: recorded as published with its address, the publisher never called', async () => {
    const t = fakeDb(tables())
    const publisher = vi.fn()
    const reader = vi.fn(async () => ({ status: 'published', publicUrl: 'https://www.instagram.com/p/AbC123/' }))
    const out = await publishDuePieces(t.db, NOW, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, reader })
    expect(publisher).not.toHaveBeenCalled()
    expect(reader).toHaveBeenCalledWith('sub-1')
    expect(out.published[0]).toMatch(/https:\/\/www\.instagram\.com\/p\/AbC123\/ \(its earlier submission, read on the provider: published; not sent again\)/)
    expect(t.inserts.map((i) => i.table)).toEqual(['social_piece_postings'])
  })

  it('the provider is still publishing it: recorded by its submission, never sent again', async () => {
    const t = fakeDb(tables())
    const publisher = vi.fn()
    const out = await publishDuePieces(t.db, NOW, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, reader: async () => ({ status: 'in-progress', publicUrl: null }) })
    expect(publisher).not.toHaveBeenCalled()
    expect(out.published[0]).toMatch(/blotato:sub-1/)
  })

  it('the provider cannot be read: the schedule stays as it was and says why', async () => {
    const t = fakeDb(tables())
    const publisher = vi.fn()
    const out = await publishDuePieces(t.db, NOW, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, reader: async () => { throw new Error('HTTP 500') } })
    expect(publisher).not.toHaveBeenCalled()
    expect(t.updates).toEqual([])
    expect(out.waiting[0]).toMatch(/s2: its earlier submission blotato:sub-1 could not be read \(HTTP 500\); left scheduled/)
  })

  it('with no reader connected it is never sent again blind', async () => {
    const t = fakeDb(tables())
    const publisher = vi.fn()
    const out = await publishDuePieces(t.db, NOW, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, reader: null })
    expect(publisher).not.toHaveBeenCalled()
    expect(out.waiting[0]).toMatch(/never sent again blind/)
  })

  it('only a submission the provider says failed is sent again, through the checks', async () => {
    const t = fakeDb(tables())
    const publisher = vi.fn()
    const out = await publishDuePieces(t.db, NOW, { siteOrigin: 'https://www.eventlinqs.com.au', publisher, reader: async () => ({ status: 'failed', publicUrl: null }) })
    // Past the reconcile it reaches the checks before publishing (this fixture holds none of their tables).
    expect(out.published).toEqual([])
    expect(out.held[0]).toMatch(/^s2: Not published: /)
    expect(out.held[0]).not.toMatch(/earlier submission/)
  })
})
