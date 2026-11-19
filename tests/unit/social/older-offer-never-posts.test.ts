import { describe, expect, it } from 'vitest'
import { lockRefusal, type Slide } from '@/lib/social/campaign'
import { pieceCorrections } from '@/lib/social/piece-quality'

/*
 * THE OLDER DRAWN ORGANISER OFFER NEVER POSTS (the PM's 16:56 of 19 November 2026, item 2; law 26). Production's organiser
 * campaign 668b65e6 was the older drawn offer slide, whose third step ('When we feature your night, we send you a post of
 * your own to share') is not proved: read at 17:02, 44 partner kits and none ever sent. Family G posts Lawal's approved
 * offer file, so the lock refuses the drawn offer and the hourly run draws the piece again.
 */
const oldOffer: Slide = {
  t: 'offer',
  composition: 'organiser_campaign',
  eyebrow: 'For venues and organisers',
  headline: 'Run regular nights in Victoria?',
  points: ['List them on EventLinqs for free.', 'We put them in front of people looking for something to do this week.', 'When we feature your night, we send you a post of your own to share.'],
  url: 'eventlinqs.com.au/organisers',
}
const familyG = { t: 'file', composition: 'close', url: 'https://www.eventlinqs.com.au/social/approved/organiser-offer.jpg', format: 'feed', eventId: null, startDate: null } as unknown as Slide

describe('the older drawn organiser offer never posts', () => {
  it('the lock refuses it, naming family G', () => {
    expect(lockRefusal([oldOffer])).toMatch(/older drawn organiser offer/)
  })

  it('a stored one is a correction, so the hourly run draws it again', () => {
    const c = pieceCorrections({ slides: [oldOffer], caption: '\u{1F4E3} Run regular nights in Victoria?', captions: ['\u{1F4E3} Run regular nights in Victoria?'], madeAt: new Date().toISOString() })
    expect(c.some((x) => x.startsWith('[look]') && /organiser offer/.test(x))).toBe(true)
  })

  it('the drill: family G, the approved offer file, passes the lock', () => {
    expect(lockRefusal([familyG])).toBeNull()
  })
})
