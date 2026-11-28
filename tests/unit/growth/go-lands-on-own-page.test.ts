import { describe, expect, it, vi } from 'vitest'

/*
 * THE /go HOP LANDS A PRESS ON THE PIECE'S OWN PAGE (the PM's 22:50 of 28 November 2026, fix (a);
 * C:\dev\EVIDENCE\EL-28NOV\incident\V1-held-pieces.md). Four studio pieces on production (among them the drafts 2ee7a839
 * and 983b9281, read 23:20) carry the studio's /ig?utm_... with no piece id; once posted, /go would land a Facebook press
 * on the profile's /ig instead of the piece's own nights. Red on main: the stored link came back unchanged.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const ID = '2ee7a839-fd80-4578-9391-dd3914b9bce5'
const TAGS = 'utm_source=instagram&utm_medium=social&utm_campaign=studio&utm_content=mel-week-2026-11-30'
const stored = { link: `${ORIGIN}/ig?${TAGS}`, kind: 'creative' }

const chain = {
  select: () => chain,
  eq: () => chain,
  neq: () => chain,
  limit: () => chain,
  maybeSingle: async () => ({ data: { post_url: 'https://www.facebook.com/1/posts/2', social_pieces: stored }, error: null }),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => chain }) }))
const { readGoPieceLink } = await import('@/lib/growth/go')

describe('the /go hop', () => {
  it("answers the piece's own page for a stored /ig link without its id, every tag kept", async () => {
    expect(await readGoPieceLink(ID)).toBe(`${ORIGIN}/ig?piece=${ID}&${TAGS}`)
  })

  it('answers an event page link as it is stored', async () => {
    stored.link = `${ORIGIN}/events/j-cole-rod-laver-arena-2026-11-28?${TAGS}`
    expect(await readGoPieceLink(ID)).toBe(`${ORIGIN}/events/j-cole-rod-laver-arena-2026-11-28?${TAGS}`)
  })
})
