import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { byteaBytes, moveStudioPieces, studioIntake, studioPath } from '@/lib/social/studio-move'

/*
 * THE STUDIO BRIDGE (the PM's 14:12 and 14:20 of 27 November 2026, car N step 2b). Red on main, where the cloud studio had
 * no road into production but SQL and nothing moved its renders: a piece whose every slide has arrived is stored slide by
 * slide under event-images/studio/ and handed to the creative intake with its slides in order; a piece still arriving
 * waits; a refusal is written on the piece, never dropped. The database takes only a real PNG of the format's size and a
 * piece whose research is no more than 7 days old (migration 20261127140001).
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-27T08:00:00Z')
const PNG_HEX = '\\x89504e470d0a1a0a0000000d49484452'

const piece = {
  id: '11111111-1111-4111-8111-111111111111',
  brief_id: '22222222-2222-4222-8222-222222222222',
  piece_key: 'mel-weekend-28nov',
  format: 'feed' as const,
  slides: 2,
  captions: { instagram: 'This weekend in Melbourne.', facebook: 'This weekend in Melbourne, on EventLinqs.' },
  destinations: ['instagram', 'facebook'],
  event_ids: ['33333333-3333-4333-8333-333333333333'],
  facts: [],
  link: 'https://www.eventlinqs.com.au/city/melbourne',
  objective: 'discovery' as const,
  preferred_at: '2026-11-27T22:00:00Z',
  latest_at: '2026-11-28T02:00:00Z',
  expires_at: '2026-11-28T12:00:00Z',
}

function fakeDb(uploads: { id: string; slide_no: number; png: string; rests_on: unknown }[]) {
  const updates: { table: string; values: Record<string, unknown> }[] = []
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      const chain = () => q
      Object.assign(q, { select: chain, is: chain, eq: chain, order: chain })
      q.limit = () => Promise.resolve({ data: table === 'studio_pieces' ? [piece] : [], error: null })
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'studio_uploads' ? uploads : [], error: null }).then(ok)
      q.update = (values: Record<string, unknown>) => {
        updates.push({ table, values })
        return { eq: () => Promise.resolve({ error: null }) }
      }
      return q
    },
  }
  return { db: db as never, updates }
}

describe('the pure parts', () => {
  it('reads a bytea as bytes, names the path, and builds the intake with the slides in order', () => {
    expect([...byteaBytes(PNG_HEX).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(studioPath('b1', 'mel-weekend-28nov', 2, 'feed')).toBe('studio/b1/mel-weekend-28nov/2-feed.png')
    const record = studioIntake(piece, [{ url: 'https://x/1.png', restsOn: { kind: 'own_design' } }])
    expect(record).toMatchObject({ briefId: piece.id, format: 'feed', link: piece.link, preferredAt: piece.preferred_at, destinations: ['instagram', 'facebook'] })
    expect(record.captions).toEqual({ instagram: 'This weekend in Melbourne.', facebook: 'This weekend in Melbourne, on EventLinqs.' })
  })
})

describe('the move', () => {
  it('waits while a slide is still to arrive', async () => {
    const { db } = fakeDb([{ id: 'u1', slide_no: 1, png: PNG_HEX, rests_on: { kind: 'own_design' } }])
    const lines = await moveStudioPieces(db, { store: async () => 'unused', receive: async () => ({ state: 'handed_off' }) }, NOW)
    expect(lines).toEqual(['mel-weekend-28nov: waiting, 1 of 2 slides arrived'])
  })
  it('stores each slide, hands the piece to the intake and marks it moved', async () => {
    const stored: string[] = []
    const { db, updates } = fakeDb([
      { id: 'u1', slide_no: 1, png: PNG_HEX, rests_on: { kind: 'own_design' } },
      { id: 'u2', slide_no: 2, png: PNG_HEX, rests_on: { kind: 'own_design' } },
    ])
    let received: unknown = null
    const lines = await moveStudioPieces(db, {
      store: async (path) => (stored.push(path), `https://store/${path}`),
      receive: async (input) => ((received = input), { state: 'handed_off', id: 'intake-1' }),
    }, NOW)
    expect(stored).toEqual([`studio/${piece.brief_id}/mel-weekend-28nov/1-feed.png`, `studio/${piece.brief_id}/mel-weekend-28nov/2-feed.png`])
    expect((received as { images: { url: string }[] }).images.map((i) => i.url)).toEqual(stored.map((p) => `https://store/${p}`))
    expect(updates.filter((u) => u.table === 'studio_uploads')).toHaveLength(2)
    expect(updates.find((u) => u.table === 'studio_pieces')?.values).toMatchObject({ intake_id: 'intake-1' })
    expect(lines).toEqual(['mel-weekend-28nov: moved, 2 slides, intake handed_off'])
  })
  it('writes a refusal on the piece, never a silent drop', async () => {
    const { db, updates } = fakeDb([
      { id: 'u1', slide_no: 1, png: PNG_HEX, rests_on: { kind: 'own_design' } },
      { id: 'u2', slide_no: 2, png: PNG_HEX, rests_on: { kind: 'own_design' } },
    ])
    const lines = await moveStudioPieces(db, { store: async (p) => p, receive: async () => ({ state: 'refused', reason: 'a stated fact differs from the listing' }) }, NOW)
    expect(updates.find((u) => u.table === 'studio_pieces')?.values).toEqual({ error: 'the creative intake refused it: a stated fact differs from the listing' })
    expect(lines[0]).toContain('NOT MOVED')
  })
})

describe('the database and the run', () => {
  const sql = read('supabase/migrations/20261127140001_the_studio_bridge.sql')
  it('takes only a PNG of its format size, never changed, and a piece with research no older than 7 days', () => {
    expect(sql).toMatch(/png bytea not null check \(octet_length\(png\) between 33 and 4194304\)/)
    expect(sql).toContain("if substring(new.png from 1 for 8) <> '\\x89504e470d0a1a0a'::bytea then")
    expect(sql).toMatch(/\(new\.format = 'feed' and \(w, h\) <> \(1080, 1350\)\) or \(new\.format = 'story' and \(w, h\) <> \(1080, 1920\)\)/)
    expect(sql).toContain("if b.id is null or b.read_at < now() - interval '7 days' then")
    expect(sql).toMatch(/revoke all on public\.studio_briefs, public\.studio_pieces, public\.studio_uploads from anon, authenticated, service_role;/)
  })
  it('every social run moves the studio pieces, contained', () => {
    expect(read('src/app/api/cron/social-publish/route.ts')).toContain('for (const line of await moveStudioNow(db, { now, siteOrigin: getSiteUrl() })) console.log(`[cron/social-publish] studio: ${line}`)')
  })
})
