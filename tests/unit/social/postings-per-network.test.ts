import { describe, expect, it } from 'vitest'
import { markPublished, networkOfPost, recordMissingPostings } from '@/lib/social/store'

/*
 * A POSTING ROW FOR EVERY NETWORK A PIECE WENT TO (the PM's 12:17 of 22 November 2026, item 2; 5C's 11:42). AMCF's final
 * day feed 70329a33 published at 11:40:07 on Facebook and Instagram and kept ONE posting row, Facebook's: the table held
 * one row per piece, the second insert was refused (23505) and read as 'recorded already'. The fake below keeps the key
 * migration 20261122124501 sets, one row per piece per network; on main a4c40783's code (no network written) the second
 * insert collides exactly as production's did, and only Facebook's row is left. Red on main b81534cd.
 */
type Row = Record<string, unknown>
const PIECE = '70329a33-abef-49dd-83d7-06d071e24d93'
const APPROVAL = 'rev4-approval'
const NOW = new Date('2026-11-22T00:40:07.366Z')
const FB = 'https://facebook.com/1115963901604820_122161356591350955'
const IG = 'https://www.instagram.com/p/DgBij8-nPfM/'

function fakeDb(tables: Record<string, Row[]>) {
  const db = {
    from: (table: string) => {
      const tests: ((r: Row) => boolean)[] = []
      let change: Row | null = null
      let one = false
      const run = () => {
        const rows = (tables[table] ?? []).filter((r) => tests.every((t) => t(r)))
        if (change) {
          for (const r of rows) Object.assign(r, change)
          return { data: null, error: null }
        }
        return one ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        update: (c: Row) => ((change = c), q),
        eq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) === String(v)), q),
        like: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => ((one = true), q),
        insert: async (row: Row) => {
          if (table === 'social_piece_postings') {
            const clash = (tables.social_piece_postings ?? []).some((g) => g.piece_id === row.piece_id && g.platform === row.platform)
            if (clash) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "social_piece_postings_one_per_platform"' } }
          }
          ;(tables[table] ??= []).push(row)
          return { error: null }
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
      }
      return q
    },
  }
  return db as never
}

describe('every network a piece went to keeps its own posting row', () => {
  it("AMCF's 11:40 feed, Facebook then Instagram: two rows, each with its network and Blotato's submission", async () => {
    const tables: Record<string, Row[]> = {
      social_piece_schedules: [
        { id: 'fb', piece_id: PIECE, approval_id: APPROVAL, platform: 'facebook', state: 'scheduled' },
        { id: 'ig', piece_id: PIECE, approval_id: APPROVAL, platform: 'instagram', state: 'scheduled' },
      ],
      social_piece_approvals: [{ id: APPROVAL, approved_by: 'founder-1' }],
      social_piece_postings: [],
    }
    const db = fakeDb(tables)
    await markPublished(db, { scheduleId: 'fb', pieceId: PIECE, approvalId: APPROVAL, ref: FB, now: NOW, platform: 'facebook', submission: 'df604a98-b7a8-460c-8eb2-a7d81148baf6' })
    const ig = await markPublished(db, { scheduleId: 'ig', pieceId: PIECE, approvalId: APPROVAL, ref: IG, now: NOW, platform: 'instagram', submission: 'f31118e6-91be-4161-bc8e-feaae159d9d4' })
    expect(ig.posting).toBe('recorded')
    expect(tables.social_piece_postings.map((g) => [g.platform, g.post_url, g.provider_ref])).toEqual([
      ['facebook', FB, 'blotato:df604a98-b7a8-460c-8eb2-a7d81148baf6'],
      ['instagram', IG, 'blotato:f31118e6-91be-4161-bc8e-feaae159d9d4'],
    ])
  })

  it("the hourly read back records a network's missing row even when the piece has the other network's", async () => {
    const tables: Record<string, Row[]> = {
      social_piece_schedules: [
        { piece_id: PIECE, approval_id: APPROVAL, platform: 'instagram', state: 'published', published_ref: IG, published_at: NOW.toISOString(), submission_ref: 'blotato:f31118e6-91be-4161-bc8e-feaae159d9d4', social_pieces: { social_piece_postings: [{ id: 'g1', platform: 'facebook' }] } },
      ],
      social_piece_approvals: [{ id: APPROVAL, approved_by: 'founder-1' }],
      social_piece_postings: [{ id: 'g1', piece_id: PIECE, approval_id: APPROVAL, platform: 'facebook', post_url: FB }],
    }
    const out = await recordMissingPostings(fakeDb(tables))
    expect(out.recorded).toEqual([`${PIECE} on instagram: ${IG}`])
    expect(tables.social_piece_postings.map((g) => g.platform)).toEqual(['facebook', 'instagram'])
  })

  it('the network of an address', () => {
    expect(networkOfPost(IG)).toBe('instagram')
    expect(networkOfPost(FB)).toBe('facebook')
    expect(networkOfPost('sent')).toBe('partner')
  })
})
