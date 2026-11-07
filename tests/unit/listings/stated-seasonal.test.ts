import { describe, expect, it } from 'vitest'
import { statedSeasonal } from '@/lib/listings/stated-words'

/*
 * A SEASON STATED IN WORDS (fbbg.org.au/friends-groups/guiding-friends, read through the polite reader 7 November 2026,
 * C:\dev\EVIDENCE\ENGINE-P0\readers-62\fbbg.txt). The page states its tour once, in one sentence: a weekday, a start
 * written '11.00a.m.', and the months it runs. Our 'Free Sunday Garden Tour' nights were unread by every reader the
 * sweep had (6 November 18:26). The same page states another group's meeting ('4th Wednesday ... at 10.00 a.m.'), which
 * must never vouch for a Sunday tour.
 */
const PAGE = `<html><body><main>
<p>The Guiding Friends meet on the 4th Wednesday of the Month at 10.00 a.m. in the George Longley Building.</p>
<p>Volunteer Guides of Friends of The Ballarat Botanical Gardens take guided walks and tours which cover highlights.</p>
<p>Free Tours on Sunday at 11.00a.m. during September, October, November, February, March April. No need to book. Meet at the Conservatory.</p>
<p>Tours take approximately 1 hour.</p>
</main></body></html>`
const ZONE = 'Australia/Melbourne'
const TITLE = 'Free Sunday Garden Tour'

describe('a season stated in words', () => {
  it('confirms a Sunday 11 am tour in November, a month the sentence names', () => {
    expect(statedSeasonal(PAGE, TITLE, '2026-11-08T00:00:00Z', ZONE)).toBe('seasonal')
  })
  it('calls a Sunday 11 am tour in December outside its season (listed for a person, never passed)', () => {
    expect(statedSeasonal(PAGE, TITLE, '2026-12-06T00:00:00Z', ZONE)).toBe('outside_season')
  })
  it('says nothing of a Sunday at another time', () => {
    // Sunday 8 November, 10 am in Melbourne
    expect(statedSeasonal(PAGE, TITLE, '2026-11-07T23:00:00Z', ZONE)).toBe(null)
  })
  it('never lets another sentence vouch: the Wednesday meeting is not the tour', () => {
    expect(statedSeasonal(PAGE, 'Guiding Friends Meeting', '2026-11-24T23:00:00Z', ZONE)).toBe(null)
  })
  it('needs a word of the title in the sentence', () => {
    expect(statedSeasonal(PAGE, 'Plant Sale', '2026-11-08T00:00:00Z', ZONE)).toBe(null)
  })
})
