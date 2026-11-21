import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCampaignSlide, renderCampaignSlide, visualFaults } from '@/lib/broadcast/campaign-slides'
import { APPROVED_FILE_PREFIX, type Slide } from '@/lib/social/campaign'
import { publishDuePieces } from '@/lib/social/store'

/*
 * AN APPROVED FILE PASSES THE PUBLISH GATE WITHOUT BEING DRAWN, AND A CHECK THAT FAILS HOLDS ONLY ITS OWN PIECE
 * (18 November 2026). At 15:13 the publish run threw on the first of Lawal's twelve approved posts:
 * "TypeError: Cannot read properties of undefined (reading 'length')". The gate's visual check (visualFaults) sent the
 * approved file, a locked slide kind, to lockedElement, which had no case for it and returned nothing; lockedSlideFaults
 * then read .length of nothing, and the whole run stopped with every post still due. The slides below are LANY's
 * approved revision exactly as production holds it.
 */
const root = process.cwd()
const lanyFeed: Slide = {
  t: 'file',
  composition: 'close',
  url: `${APPROVED_FILE_PREFIX}lany-feed-ig45.jpg`,
  format: 'feed',
  eventId: 'fa853d15-7808-4fc3-981c-d088cc28ec66',
  startDate: '2026-11-18T09:00:00Z',
}
const lanyStory: Slide = { ...lanyFeed, url: `${APPROVED_FILE_PREFIX}16-lany-story.jpg`, format: 'story' }
const onDisk = (url: string) => readFileSync(join(root, 'public', 'social', 'approved', url.slice(APPROVED_FILE_PREFIX.length)))

/** A query that answers `result` however it is chained, as supabase-js answers when awaited. */
function answers(result: unknown): unknown {
  const link: object = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'then') return (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve(result).then(ok, no)
        return () => link
      },
    },
  )
  return link
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('an approved file in the publish gate', () => {
  it('passes the visual check on its feed post: its fit is measured from its own bytes elsewhere, never drawn here', async () => {
    await expect(visualFaults([lanyFeed], 'feed', new Map())).resolves.toEqual([])
  })

  it('passes the visual check on its story', async () => {
    await expect(visualFaults([lanyStory], 'story', new Map())).resolves.toEqual([])
  })

  it('is refused loudly by the drawing itself, never drawn as nothing', async () => {
    await expect(buildCampaignSlide('feed', lanyFeed, 1, 1, null)).rejects.toThrow(/never drawn/)
  })

  it('renders as its own bytes, read from its own address, so a reel or a kit shows exactly the approved file', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(new Uint8Array(onDisk(url))))
    vi.stubGlobal('fetch', fetcher)
    const bytes = await renderCampaignSlide('story', lanyStory, 1, 1, null)
    expect(Buffer.from(bytes).equals(onDisk(lanyStory.t === 'file' ? lanyStory.url : ''))).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('never renders an address that is not an approved file on www', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(renderCampaignSlide('feed', { ...lanyFeed, url: 'https://example.com/lany.jpg' } as Slide, 1, 1, null)).rejects.toThrow(/not an approved file/)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('the publish run', () => {
  it('holds a piece whose checks throw with the reason, and goes on to the next; nothing is sent', async () => {
    const held: { id: unknown; payload: Record<string, unknown> }[] = []
    const rows = [
      { id: 's1', piece_id: 'p1', approval_id: 'a1', platform: 'instagram', go_at: '2026-11-18T04:12:50Z' },
      { id: 's2', piece_id: 'p2', approval_id: 'a2', platform: 'facebook', go_at: '2026-11-18T04:12:50Z' },
    ]
    const db = {
      from(table: string) {
        if (table === 'feature_flags') return answers({ data: { enabled: true }, error: null })
        if (table === 'social_piece_schedules') {
          return {
            // The identity read (store.ts publishedAlready) finds no earlier publication of either piece.
            select: (cols: string) => answers({ data: cols === 'id, published_ref' ? [] : rows, error: null }),
            update: (payload: Record<string, unknown>) => ({
              eq: (_key: string, id: unknown) => {
                held.push({ id, payload })
                return answers({ error: null })
              },
            }),
          }
        }
        if (table === 'social_pieces') throw new Error('the piece could not be read: connection reset')
        throw new Error(`no other table is read before a check fails: ${table}`)
      },
    }
    const publisher = vi.fn()
    const out = await publishDuePieces(db as never, new Date('2026-11-18T04:13:09Z'), { siteOrigin: 'https://www.eventlinqs.com.au', publisher })
    expect(publisher).not.toHaveBeenCalled()
    expect(out.published).toEqual([])
    expect(held.map((h) => h.id)).toEqual(['s1', 's2'])
    for (const h of held) {
      expect(h.payload.state).toBe('held')
      expect(String(h.payload.held_reason)).toMatch(/checks before publishing could not finish \(the piece could not be read: connection reset\)/)
    }
  })
})
