import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { goHop, PIECE_MARK, withPieceId } from '@/lib/social/go-hop'
import { goDestination } from '@/lib/growth/go-math'

/*
 * EVERY LIFECYCLE POST LINKS THROUGH /go, SO EVERY PRESS IS COUNTED (the PM's 16:30 and 16:40 of 21 November 2026, AV (e);
 * found at 12:12: posts linked straight to the event page, and go_presses read 0 ever).
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const ID = '3f2a1b0c-0d4e-4f5a-8b6c-7d8e9f0a1b2c'

describe('the /go hop on a lifecycle post', () => {
  it('names the network, and the piece id is written where the planner marked it', () => {
    const versions = { instagram: { caption: `Link in our bio. ${goHop(ORIGIN, 'instagram')}` }, facebook: { caption: 'x', cta: goHop(ORIGIN, 'facebook') } }
    const out = withPieceId(versions, ID)
    expect(out.facebook.cta).toBe(`${ORIGIN}/go/${ID}?via=facebook`)
    expect(JSON.stringify(out)).not.toContain(PIECE_MARK)
  })

  it('a value with no mark is left as it is, and a mark is never filled with something that is not a piece id', () => {
    expect(withPieceId({ caption: 'no link here' }, 'p1')).toEqual({ caption: 'no link here' })
    expect(() => withPieceId({ cta: goHop(ORIGIN, 'facebook') }, 'p1')).toThrow(/not a piece id/)
  })

  it("a press lands on the piece's stored page, tagged with the network it came from", () => {
    expect(goDestination(`${ORIGIN}/events/night?utm_source=instagram`, ORIGIN, 'facebook')).toMatch(/^https:\/\/www\.eventlinqs\.com\.au\/events\/night\?utm_source=facebook/)
  })

  it('the one writer of a revision fills the mark in both the caption and the versions', () => {
    const store = readFileSync(join(process.cwd(), 'src/lib/social/store.ts'), 'utf8')
    const row = store.slice(store.indexOf('function revisionRow('), store.indexOf('function revisionRow(') + 900)
    expect(row).toContain('caption: withPieceId(p.caption, pieceId)')
    expect(row).toContain('versions: withPieceId(p.versions, pieceId)')
  })
})
