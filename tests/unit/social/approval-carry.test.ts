import { describe, expect, it } from 'vitest'
import { carriesApproval, revisionHash } from '@/lib/social/approval-carry'
import type { Slide } from '@/lib/social/campaign'

/*
 * LAWAL'S YES CARRIES OVER A ROUTINE CORRECTION, AND ONLY THAT (the PM's 07:05 of 18 November 2026, item 3): a piece
 * redrawn ONLY for a routine correction keeps its approval (same night, same kind, same slot, same destination), and each
 * carry is recorded with the old and new version hashes. A redraw that changes the night or the photograph needs a new
 * yes. Kind, city, partner and poster day are the same by how the redraw is matched (olderLookRedraws); the slot is the
 * schedule kept; the destination is the piece's own link, which a redraw never changes. So the rule reads the nights and
 * the photographs.
 */
const poster = (photo: string | null): Slide =>
  ({ t: 'poster', composition: 'daily_poster', eventId: 'e1', photo, credit: photo ? 'A credit' : null, rights: 'type', night: { title: 'A night' } }) as unknown as Slide
const rev = (eventIds: string[], slides: Slide[], caption = 'A caption.') => ({ eventIds, slides, caption, versions: { instagram: { caption }, facebook: { caption } } })

describe('the approval carry', () => {
  it('carries over a redraw whose nights and photographs are the same', () => {
    expect(carriesApproval(rev(['e1'], [poster(null)], 'Old words.'), rev(['e1'], [poster(null)], 'New words.'))).toBeNull()
    expect(carriesApproval(rev(['e1', 'e2'], [poster('https://x/a.jpg')]), rev(['e2', 'e1'], [poster('https://x/a.jpg')]))).toBeNull()
  })
  it('never over a redraw that changes the night or the photograph', () => {
    expect(carriesApproval(rev(['e1'], [poster(null)]), rev(['e2'], [poster(null)]))).toMatch(/night/)
    expect(carriesApproval(rev(['e1'], [poster(null)]), rev(['e1'], [poster('https://x/b.jpg')]))).toMatch(/photograph/)
  })
  it('a version hash names exactly what posts: the slides, the caption and both platform versions', () => {
    const a = rev(['e1'], [poster(null)], 'Words.')
    expect(revisionHash(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(revisionHash(a)).toBe(revisionHash({ ...a }))
    expect(revisionHash(a)).not.toBe(revisionHash(rev(['e1'], [poster(null)], 'Other words.')))
  })
})
