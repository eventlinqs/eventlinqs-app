import { describe, expect, it } from 'vitest'
import { ownPageLink } from '@/lib/social/go-hop'

/*
 * EVERY STUDIO AND SET PIECE LINKS TO ITS OWN PAGE, /ig?piece=<its id> (the PM's 22:50 of 28 November 2026, fix (a);
 * C:\dev\EVIDENCE\EL-28NOV\incident\V1-held-pieces.md). The studio's Melbourne weekend piece c6bdc9da was stored with the
 * studio's own link, /ig?utm_..., and no piece id (store.ts drawIntakePiece wrote it unchanged), so the publish gate
 * judged the profile's /ig, which lists a night only while its slot is approved and is cached five minutes, and held it
 * twice on 28 November ("does not list it"). Four more studio pieces were stored the same way, none of them approved when
 * read at 23:20. Red on main: ownPageLink did not exist.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const ID = 'c6bdc9da-e262-4695-9a50-8027e5972dc6'
const TAGS = 'utm_source=instagram&utm_medium=social&utm_campaign=studio&utm_content=mel-weekend-2026-11-28'

describe("a piece's own page", () => {
  it('names the piece first on an /ig link and keeps every tag', () => {
    expect(ownPageLink(`${ORIGIN}/ig?${TAGS}`, ID)).toBe(`${ORIGIN}/ig?piece=${ID}&${TAGS}`)
    expect(ownPageLink(`${ORIGIN}/ig`, ID)).toBe(`${ORIGIN}/ig?piece=${ID}`)
  })

  it('leaves a link that already names a piece, or any other page, as it is', () => {
    expect(ownPageLink(`${ORIGIN}/ig?piece=${ID}&${TAGS}`, ID)).toBe(`${ORIGIN}/ig?piece=${ID}&${TAGS}`)
    expect(ownPageLink(`${ORIGIN}/events/j-cole-rod-laver-arena-2026-11-28?utm_source=instagram`, ID)).toBe(`${ORIGIN}/events/j-cole-rod-laver-arena-2026-11-28?utm_source=instagram`)
    expect(ownPageLink('not an address', ID)).toBe('not an address')
  })

  it('refuses what is not a piece id', () => {
    expect(() => ownPageLink(`${ORIGIN}/ig?${TAGS}`, 'PIECE_ID_HERE')).toThrow(/not a piece id/)
  })
})

